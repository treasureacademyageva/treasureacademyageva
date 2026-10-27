-- Treasure Academy current class structure and flexible term assessment
-- Date: 2026-10-27
--
-- Owner-approved corrections:
--   * Pre-Nursery is now the youngest active class; Creche/Daycare is retired.
--   * Pre-Nursery uses one examination scored over 100.
--   * Every other active teaching class uses one class-wide term plan:
--       - three entries: CA 15 + CA 15 + Exam 70
--       - four entries: CA 10 + CA 10 + CA 10 + Exam 70
-- This migration inserts no staff, pupil, guardian, score or result-comment data.
-- Grade/position/remark arithmetic remains deliberately unset until the owner
-- supplies the official bands and formula.

begin;

-- Preserve the historical class row without allowing new enrolment. Reorder the
-- active progression so Pre-Nursery is the only routine entry class.
update public.class_progression set sort_order = sort_order * -1;
update public.class_progression
set sort_order = case class_code
  when 'Creche' then 0
  when 'Pre-Nursery' then 10
  when 'Nursery 1' then 20
  when 'Nursery 2' then 30
  when 'Primary 1' then 40
  when 'Primary 2' then 50
  when 'Primary 3' then 60
  when 'Primary 4' then 70
  when 'Primary 6' then 80
  when 'Graduate Hall' then 90
end,
next_class_code = case class_code
  when 'Creche' then null
  when 'Pre-Nursery' then 'Nursery 1'
  when 'Nursery 1' then 'Nursery 2'
  when 'Nursery 2' then 'Primary 1'
  when 'Primary 1' then 'Primary 2'
  when 'Primary 2' then 'Primary 3'
  when 'Primary 3' then 'Primary 4'
  when 'Primary 4' then 'Primary 6'
  when 'Primary 6' then 'Graduate Hall'
  else null
end,
active_for_enrolment = class_code not in ('Creche','Graduate Hall'),
routine_entry_class = class_code = 'Pre-Nursery',
graduation_stage = class_code = 'Graduate Hall';

-- Sex is a private school-record field. Existing records may remain null until
-- the office verifies them; public projections must never expose pupil rows.
alter table public.students add column if not exists sex text;
do $$ begin
  alter table public.students add constraint students_sex_check
    check (sex is null or sex in ('male','female'));
exception when duplicate_object then null; end $$;

-- One assessment plan applies to the whole class for a session and term. This
-- prevents subjects or individual pupils in the same class from silently using
-- incompatible obtainable marks.
create table if not exists public.class_term_assessment_plans (
  id uuid primary key default gen_random_uuid(),
  class_code text not null references public.class_progression(class_code) on delete restrict,
  session_name text not null check (char_length(trim(session_name)) between 4 and 40),
  term text not null check (term in ('First','Second','Third')),
  scheme text not null check (scheme in (
    'pre_nursery_exam_100',
    'three_entry_15_15_70',
    'four_entry_10_10_10_70'
  )),
  selected_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  selection_reason text check (selection_reason is null or char_length(trim(selection_reason)) between 3 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(class_code,session_name,term)
);
create index if not exists class_term_assessment_plans_lookup_idx
  on public.class_term_assessment_plans(session_name,term,class_code);

create table if not exists public.class_term_assessment_plan_events (
  id bigint generated always as identity primary key,
  plan_id uuid not null references public.class_term_assessment_plans(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('created','changed')),
  previous_scheme text,
  new_scheme text not null,
  reason text check (reason is null or char_length(trim(reason)) between 3 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists class_term_assessment_plan_events_plan_idx
  on public.class_term_assessment_plan_events(plan_id,created_at desc);

alter table public.grades
  add column if not exists assessment_plan_id uuid references public.class_term_assessment_plans(id) on delete restrict,
  add column if not exists ca3 numeric(5,2) not null default 0;

-- Replace former fixed 20/20/60 limits with broad storage constraints. Exact
-- obtainable marks are enforced against the immutable class term plan below.
alter table public.grades drop constraint if exists grades_exam_score_check;
alter table public.grades drop constraint if exists grades_ca1_range;
alter table public.grades drop constraint if exists grades_ca2_range;
do $$ begin
  alter table public.grades add constraint grades_ca1_nonnegative check (ca1 between 0 and 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.grades add constraint grades_ca2_nonnegative check (ca2 between 0 and 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.grades add constraint grades_ca3_nonnegative check (ca3 between 0 and 100);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.grades add constraint grades_exam_nonnegative check (exam_score between 0 and 100);
exception when duplicate_object then null; end $$;
create index if not exists grades_assessment_plan_idx on public.grades(assessment_plan_id);

create or replace function public.guard_class_term_assessment_plan()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role public.app_role;
  v_actor uuid := (select auth.uid());
begin
  if new.class_code='Pre-Nursery' and new.scheme<>'pre_nursery_exam_100' then
    raise exception 'Pre-Nursery uses one examination over 100' using errcode='23514';
  end if;
  if new.class_code<>'Pre-Nursery' and new.scheme='pre_nursery_exam_100' then
    raise exception 'The examination-only scheme belongs only to Pre-Nursery' using errcode='23514';
  end if;
  if not exists(select 1 from public.class_progression c where c.class_code=new.class_code and c.active_for_enrolment=true) then
    raise exception 'An active teaching class is required' using errcode='23514';
  end if;

  if coalesce((select auth.role()),'')='service_role' or session_user in ('postgres','supabase_admin') then
    if new.selected_by is null then raise exception 'Assessment-plan selector is required' using errcode='23502'; end if;
  else
    v_role:=public.current_user_role();
    if not (v_role='admin'::public.app_role or public.teacher_can_manage_class(new.class_code)) then
      raise exception 'The assigned class teacher or school leadership must select the term assessment plan' using errcode='42501';
    end if;
    new.selected_by:=v_actor;
  end if;

  if tg_op='UPDATE' then
    if new.class_code is distinct from old.class_code
       or new.session_name is distinct from old.session_name
       or new.term is distinct from old.term then
      raise exception 'Assessment-plan class, session and term are immutable' using errcode='42501';
    end if;
    if new.scheme is distinct from old.scheme and exists(
      select 1 from public.grades g where g.assessment_plan_id=old.id
    ) then
      raise exception 'A term assessment plan cannot change after score entry begins' using errcode='55000';
    end if;
    if new.scheme is distinct from old.scheme and char_length(trim(coalesce(new.selection_reason,'')))<3 then
      raise exception 'A reason is required to change an assessment plan' using errcode='22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_class_term_assessment_plan() from public,anon,authenticated;

drop trigger if exists class_term_assessment_plans_guard on public.class_term_assessment_plans;
create trigger class_term_assessment_plans_guard
before insert or update on public.class_term_assessment_plans
for each row execute function public.guard_class_term_assessment_plan();

drop trigger if exists class_term_assessment_plans_touch on public.class_term_assessment_plans;
create trigger class_term_assessment_plans_touch
before update on public.class_term_assessment_plans
for each row execute function public.portal_touch_updated_at();

create or replace function public.audit_class_term_assessment_plan()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    insert into public.class_term_assessment_plan_events(plan_id,actor_id,action,new_scheme,reason)
    values(new.id,new.selected_by,'created',new.scheme,new.selection_reason);
  elsif new.scheme is distinct from old.scheme then
    insert into public.class_term_assessment_plan_events(plan_id,actor_id,action,previous_scheme,new_scheme,reason)
    values(new.id,new.selected_by,'changed',old.scheme,new.scheme,new.selection_reason);
  end if;
  return new;
end $$;
revoke all on function public.audit_class_term_assessment_plan() from public,anon,authenticated;

drop trigger if exists class_term_assessment_plans_audit on public.class_term_assessment_plans;
create trigger class_term_assessment_plans_audit
after insert or update on public.class_term_assessment_plans
for each row execute function public.audit_class_term_assessment_plan();

create or replace function public.guard_grade_assessment_limits()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan public.class_term_assessment_plans%rowtype;
  v_class text;
  v_score_changed boolean;
begin
  select s.class_code into v_class from public.students s where s.id=new.student_id and s.active=true;
  if v_class is null then raise exception 'An active pupil is required' using errcode='23514'; end if;
  select * into v_plan from public.class_term_assessment_plans p
   where p.id=new.assessment_plan_id
     and p.class_code=v_class and p.session_name=new.session_name and p.term=new.term;
  if not found then
    raise exception 'Select the matching class term assessment plan before entering scores' using errcode='23514';
  end if;

  if v_plan.scheme='pre_nursery_exam_100' then
    if new.ca1<>0 or new.ca2<>0 or new.ca3<>0 or new.exam_score<0 or new.exam_score>100 then
      raise exception 'Pre-Nursery accepts Examination 0-100 and no CA scores' using errcode='23514';
    end if;
  elsif v_plan.scheme='three_entry_15_15_70' then
    if new.ca1<0 or new.ca1>15 or new.ca2<0 or new.ca2>15 or new.ca3<>0 or new.exam_score<0 or new.exam_score>70 then
      raise exception 'Three-entry scores must be CA1 0-15, CA2 0-15 and Examination 0-70' using errcode='23514';
    end if;
  elsif v_plan.scheme='four_entry_10_10_10_70' then
    if new.ca1<0 or new.ca1>10 or new.ca2<0 or new.ca2>10 or new.ca3<0 or new.ca3>10 or new.exam_score<0 or new.exam_score>70 then
      raise exception 'Four-entry scores must be CA1 0-10, CA2 0-10, CA3 0-10 and Examination 0-70' using errcode='23514';
    end if;
  else
    raise exception 'Unsupported assessment scheme' using errcode='23514';
  end if;

  if tg_op='UPDATE' then
    if new.assessment_plan_id is distinct from old.assessment_plan_id then
      raise exception 'A result assessment plan is immutable' using errcode='42501';
    end if;
    v_score_changed := new.ca1 is distinct from old.ca1 or new.ca2 is distinct from old.ca2
      or new.ca3 is distinct from old.ca3 or new.exam_score is distinct from old.exam_score;
    if v_score_changed and old.workflow_status not in ('draft'::public.result_workflow_status,'returned'::public.result_workflow_status) then
      raise exception 'Only draft or returned scores may change' using errcode='42501';
    end if;
    if v_score_changed and coalesce((select auth.role()),'')<>'service_role'
       and session_user not in ('postgres','supabase_admin')
       and old.recorded_by is distinct from (select auth.uid()) then
      raise exception 'Reviewers return score corrections to the class teacher' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_grade_assessment_limits() from public,anon,authenticated;

drop trigger if exists grades_assessment_limits on public.grades;
create trigger grades_assessment_limits
before insert or update on public.grades
for each row execute function public.guard_grade_assessment_limits();

-- The earlier workflow trigger intentionally remains the authority for entry,
-- independent review, publication and locking. This final trigger includes CA3
-- in its compatibility total after that workflow trigger has run.
create or replace function public.set_grade_assessment_total()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.continuous_assessment:=new.ca1+new.ca2+new.ca3;
  return new;
end $$;
revoke all on function public.set_grade_assessment_total() from public,anon,authenticated;

drop trigger if exists grades_zz_assessment_total on public.grades;
create trigger grades_zz_assessment_total
before insert or update on public.grades
for each row execute function public.set_grade_assessment_total();

alter table public.class_term_assessment_plans enable row level security;
alter table public.class_term_assessment_plan_events enable row level security;
revoke all on table public.class_term_assessment_plans,public.class_term_assessment_plan_events from public,anon;
grant select,insert,update on table public.class_term_assessment_plans to authenticated;
grant select on table public.class_term_assessment_plan_events to authenticated;
grant all on table public.class_term_assessment_plans,public.class_term_assessment_plan_events to service_role;
grant all on sequence public.class_term_assessment_plan_events_id_seq to service_role;

create policy class_term_assessment_plans_select on public.class_term_assessment_plans
for select to authenticated using (
  public.is_admin() or public.teacher_can_manage_class(class_code)
  or exists(
    select 1 from public.students s join public.student_guardians g on g.student_id=s.id
     where s.class_code=class_term_assessment_plans.class_code
       and g.parent_id=(select auth.uid()) and g.active=true
       and exists(select 1 from public.grades r where r.student_id=s.id
         and r.assessment_plan_id=class_term_assessment_plans.id and r.published_at is not null)
  )
);
create policy class_term_assessment_plans_insert on public.class_term_assessment_plans
for insert to authenticated with check (public.is_admin() or public.teacher_can_manage_class(class_code));
create policy class_term_assessment_plans_update on public.class_term_assessment_plans
for update to authenticated using (public.is_admin() or public.teacher_can_manage_class(class_code))
with check (public.is_admin() or public.teacher_can_manage_class(class_code));
create policy class_term_assessment_plan_events_select on public.class_term_assessment_plan_events
for select to authenticated using (
  exists(select 1 from public.class_term_assessment_plans p where p.id=plan_id
    and (public.is_admin() or public.teacher_can_manage_class(p.class_code)))
);

-- Keep the established function signature for older clients while moving the
-- routine youngest-class boundary from retired Creche to Pre-Nursery.
create or replace function public.server_add_existing_pupil(
  p_full_name text,p_class_code text,p_session_name text,
  p_admission_number text default null,p_initial_baseline boolean default false
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_student uuid;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_full_name,''))) not between 2 and 120
     or char_length(trim(coalesce(p_session_name,''))) not between 4 and 40
     or not public.is_active_school_class(p_class_code) then
    raise exception 'Invalid pupil roster details' using errcode='22023';
  end if;
  if p_initial_baseline and not coalesce((select c.baseline_open from public.enrolment_cutover_control c where c.singleton=true),false) then
    raise exception 'Initial all-class cutover is closed' using errcode='42501';
  end if;
  if not p_initial_baseline and trim(p_class_code)<>'Pre-Nursery' then
    raise exception 'Routine fresh roster entry is limited to Pre-Nursery; use admission or promotion for other classes' using errcode='22023';
  end if;
  insert into public.students(admission_number,full_name,class_code,parent_id,admission_status,active)
  values(nullif(trim(p_admission_number),''),trim(p_full_name),trim(p_class_code),null,'admitted',true)
  returning id into v_student;
  insert into public.student_enrolments(student_id,session_name,class_code,source,recorded_by)
  values(v_student,trim(p_session_name),trim(p_class_code),case when p_initial_baseline then 'initial_baseline' else 'office_entry' end,v_actor);
  return jsonb_build_object('student_id',v_student);
end $$;
revoke all on function public.server_add_existing_pupil(text,text,text,text,boolean) from public,anon;
grant execute on function public.server_add_existing_pupil(text,text,text,text,boolean) to authenticated;

create or replace function public.server_add_existing_pupil_with_sex(
  p_full_name text,p_sex text,p_class_code text,p_session_name text,
  p_admission_number text default null,p_initial_baseline boolean default false
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_student uuid;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if p_sex not in ('male','female')
     or char_length(trim(coalesce(p_full_name,''))) not between 2 and 120
     or char_length(trim(coalesce(p_session_name,''))) not between 4 and 40
     or not public.is_active_school_class(p_class_code) then
    raise exception 'Invalid pupil roster details' using errcode='22023';
  end if;
  if p_initial_baseline and not coalesce((select c.baseline_open from public.enrolment_cutover_control c where c.singleton=true),false) then
    raise exception 'Initial all-class cutover is closed' using errcode='42501';
  end if;
  if not p_initial_baseline and trim(p_class_code)<>'Pre-Nursery' then
    raise exception 'Routine fresh roster entry is limited to Pre-Nursery; use admission or promotion for other classes' using errcode='22023';
  end if;
  insert into public.students(admission_number,full_name,sex,class_code,parent_id,admission_status,active)
  values(nullif(trim(p_admission_number),''),trim(p_full_name),p_sex,trim(p_class_code),null,'admitted',true)
  returning id into v_student;
  insert into public.student_enrolments(student_id,session_name,class_code,source,recorded_by)
  values(v_student,trim(p_session_name),trim(p_class_code),case when p_initial_baseline then 'initial_baseline' else 'office_entry' end,v_actor);
  return jsonb_build_object('student_id',v_student);
end $$;
revoke all on function public.server_add_existing_pupil_with_sex(text,text,text,text,text,boolean) from public,anon;
grant execute on function public.server_add_existing_pupil_with_sex(text,text,text,text,text,boolean) to authenticated;

comment on table public.class_term_assessment_plans is 'One owner-approved score-entry structure per class, session and term; immutable once score entry begins.';
comment on column public.students.sex is 'Private office-verified pupil sex used for school records and result headers; never a public roster field.';
comment on column public.grades.ca3 is 'Third continuous-assessment entry; zero for Pre-Nursery and three-entry plans.';
comment on column public.grades.assessment_plan_id is 'Exact class-wide term assessment plan controlling obtainable marks.';

commit;

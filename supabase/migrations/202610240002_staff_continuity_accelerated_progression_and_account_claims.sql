-- Treasure Academy staff continuity, exceptional progression and account claims
-- Date: 2026-10-24
--
-- Additive maintenance migration. It preserves all former rows and keeps every
-- new workflow fail-closed until its independent runtime gate is enabled.
-- It does not insert real people, create Auth identities or activate a feature.

begin;

-- A public-facing title is independent from database capability. The
-- Proprietress may therefore display the correct title while an explicitly
-- owner-approved account uses the existing full leadership authority scope.
alter table public.profiles
  add column if not exists position_title text;

do $$
begin
  alter table public.profiles add constraint profiles_position_title_length
    check (position_title is null or char_length(trim(position_title)) between 2 and 80);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Staff assignment history and recommendation/approval workflow
-- ---------------------------------------------------------------------------

alter table public.teacher_class_assignments
  add column if not exists assignment_kind text not null default 'subject_teacher',
  add column if not exists session_name text,
  add column if not exists started_on date,
  add column if not exists ended_on date,
  add column if not exists ended_reason text,
  add column if not exists replaces_assignment_id uuid references public.teacher_class_assignments(id) on delete set null,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists handover_note text;

update public.teacher_class_assignments
   set assignment_kind = case when subject = '*' then 'class_teacher' else 'subject_teacher' end
 where assignment_kind = 'subject_teacher' and subject = '*';

do $$
begin
  alter table public.teacher_class_assignments add constraint teacher_assignments_kind_check
    check (assignment_kind in ('class_teacher','subject_teacher','assistant_teacher'));
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.teacher_class_assignments add constraint teacher_assignments_session_length
    check (session_name is null or char_length(trim(session_name)) between 4 and 40);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.teacher_class_assignments add constraint teacher_assignments_date_order
    check (ended_on is null or started_on is null or ended_on >= started_on);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.teacher_class_assignments add constraint teacher_assignments_end_reason_length
    check (ended_reason is null or char_length(trim(ended_reason)) between 3 and 1000);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.teacher_class_assignments add constraint teacher_assignments_handover_length
    check (handover_note is null or char_length(handover_note) <= 2000);
exception when duplicate_object then null;
end $$;

alter table public.teacher_class_assignments
  drop constraint if exists teacher_class_assignments_teacher_id_class_code_subject_key;
create unique index if not exists teacher_assignments_one_active_scope_idx
  on public.teacher_class_assignments(teacher_id,class_code,subject)
  where active = true;
create unique index if not exists teacher_assignments_one_active_class_teacher_idx
  on public.teacher_class_assignments(class_code)
  where active = true and assignment_kind = 'class_teacher' and subject = '*';

create table if not exists public.staff_assignment_changes (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('assign','move','replace','end')),
  current_assignment_id uuid references public.teacher_class_assignments(id) on delete restrict,
  current_teacher_id uuid references public.profiles(id) on delete restrict,
  target_teacher_id uuid references public.profiles(id) on delete restrict,
  target_class_code text,
  target_subject text,
  target_kind text check (target_kind is null or target_kind in ('class_teacher','subject_teacher','assistant_teacher')),
  session_name text,
  effective_on date not null default current_date,
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  handover_note text check (handover_note is null or char_length(handover_note) <= 2000),
  status text not null default 'recommended' check (status in ('recommended','applied','rejected','cancelled')),
  recommended_by uuid not null references public.profiles(id) on delete restrict,
  recommended_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  applied_assignment_id uuid references public.teacher_class_assignments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (session_name is null or char_length(trim(session_name)) between 4 and 40),
  check (target_class_code is null or char_length(trim(target_class_code)) between 1 and 40),
  check (target_subject is null or char_length(trim(target_subject)) between 1 and 80)
);
create index if not exists staff_assignment_changes_status_idx
  on public.staff_assignment_changes(status,recommended_at desc);

create table if not exists public.staff_assignment_change_events (
  id bigint generated always as identity primary key,
  change_id uuid not null references public.staff_assignment_changes(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create or replace function public.recommend_staff_assignment_change(
  p_action text,
  p_current_assignment_id uuid default null,
  p_target_teacher_id uuid default null,
  p_target_class_code text default null,
  p_target_subject text default '*',
  p_target_kind text default 'class_teacher',
  p_session_name text default null,
  p_effective_on date default current_date,
  p_reason text default null,
  p_handover_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role public.app_role;
  v_current public.teacher_class_assignments%rowtype;
  v_change uuid;
begin
  select p.role into v_role from public.profiles p
   where p.id=v_actor and p.active=true and p.account_status='active';
  if v_role not in ('teacher'::public.app_role,'admin'::public.app_role) then
    raise exception 'Active staff account required' using errcode='42501';
  end if;
  if p_action not in ('assign','move','replace','end') or char_length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'Valid action and recommendation reason required' using errcode='22023';
  end if;
  if p_effective_on < current_date then
    raise exception 'Effective date cannot be in the past' using errcode='22023';
  end if;
  if p_action in ('move','replace','end') then
    select * into v_current from public.teacher_class_assignments
     where id=p_current_assignment_id and active=true for update;
    if not found then raise exception 'Active source assignment required' using errcode='22023'; end if;
    if v_role='teacher'::public.app_role and v_current.teacher_id<>v_actor then
      raise exception 'Teachers may recommend only their own assignment change' using errcode='42501';
    end if;
  elsif v_role='teacher'::public.app_role then
    raise exception 'Administrator recommendation required for a new assignment' using errcode='42501';
  end if;
  if p_action in ('assign','move','replace') then
    if p_target_teacher_id is null or nullif(trim(coalesce(p_target_class_code,'')),'') is null
       or p_target_kind not in ('class_teacher','subject_teacher','assistant_teacher') then
      raise exception 'Target teacher, class and assignment kind required' using errcode='22023';
    end if;
    if not exists (select 1 from public.profiles p where p.id=p_target_teacher_id
      and p.active=true and p.account_status='active' and p.role in ('teacher'::public.app_role,'admin'::public.app_role)) then
      raise exception 'Active staff target required' using errcode='22023';
    end if;
    if p_action='move' and p_target_teacher_id<>v_current.teacher_id then
      raise exception 'A move keeps the same teacher; use replace for another teacher' using errcode='22023';
    end if;
    if p_action='replace' and p_target_teacher_id=v_current.teacher_id then
      raise exception 'Replacement teacher must be different' using errcode='22023';
    end if;
  end if;
  insert into public.staff_assignment_changes(
    action,current_assignment_id,current_teacher_id,target_teacher_id,target_class_code,
    target_subject,target_kind,session_name,effective_on,reason,handover_note,recommended_by
  ) values (
    p_action,p_current_assignment_id,case when v_current.id is null then null else v_current.teacher_id end,
    p_target_teacher_id,nullif(trim(p_target_class_code),''),coalesce(nullif(trim(p_target_subject),''),'*'),
    p_target_kind,nullif(trim(p_session_name),''),p_effective_on,trim(p_reason),nullif(trim(p_handover_note),''),v_actor
  ) returning id into v_change;
  insert into public.staff_assignment_change_events(change_id,actor_id,action,note)
  values(v_change,v_actor,'recommended',trim(p_reason));
  return v_change;
end;
$$;
revoke all on function public.recommend_staff_assignment_change(text,uuid,uuid,text,text,text,text,date,text,text) from public,anon;
grant execute on function public.recommend_staff_assignment_change(text,uuid,uuid,text,text,text,text,date,text,text) to authenticated;

create or replace function public.decide_staff_assignment_change(
  p_change_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_change public.staff_assignment_changes%rowtype;
  v_new uuid;
begin
  if not public.is_headmistress() then
    raise exception 'Full leadership authority required' using errcode='42501';
  end if;
  select * into v_change from public.staff_assignment_changes
   where id=p_change_id and status='recommended' for update;
  if not found then raise exception 'Pending recommendation required' using errcode='22023'; end if;
  if v_change.recommended_by=v_actor then
    raise exception 'Independent recommendation and approval are required' using errcode='42501';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Approve or reject required' using errcode='22023';
  end if;
  if p_decision='reject' then
    update public.staff_assignment_changes set status='rejected',decided_by=v_actor,
      decided_at=now(),decision_note=nullif(trim(p_note),''),updated_at=now() where id=p_change_id;
    insert into public.staff_assignment_change_events(change_id,actor_id,action,note)
    values(p_change_id,v_actor,'rejected',nullif(trim(p_note),''));
    return jsonb_build_object('change_id',p_change_id,'status','rejected');
  end if;
  if v_change.effective_on>current_date then
    raise exception 'Return on the effective date to apply this approved change' using errcode='22023';
  end if;
  if v_change.action in ('move','replace','end') then
    update public.teacher_class_assignments set active=false,ended_on=v_change.effective_on,
      ended_reason=v_change.reason,handover_note=coalesce(v_change.handover_note,handover_note),updated_at=now()
     where id=v_change.current_assignment_id and active=true;
    if not found then raise exception 'Source assignment changed; prepare a new recommendation' using errcode='40001'; end if;
  end if;
  if v_change.action in ('assign','move','replace') then
    insert into public.teacher_class_assignments(
      teacher_id,class_code,subject,active,assignment_kind,session_name,started_on,
      replaces_assignment_id,approved_by,approved_at,handover_note
    ) values (
      v_change.target_teacher_id,v_change.target_class_code,coalesce(v_change.target_subject,'*'),true,
      v_change.target_kind,v_change.session_name,v_change.effective_on,v_change.current_assignment_id,
      v_actor,now(),v_change.handover_note
    ) returning id into v_new;
  end if;
  update public.staff_assignment_changes set status='applied',decided_by=v_actor,
    decided_at=now(),decision_note=nullif(trim(p_note),''),applied_assignment_id=v_new,updated_at=now()
   where id=p_change_id;
  insert into public.staff_assignment_change_events(change_id,actor_id,action,note)
  values(p_change_id,v_actor,'applied',nullif(trim(p_note),''));
  return jsonb_build_object('change_id',p_change_id,'status','applied','assignment_id',v_new);
end;
$$;
revoke all on function public.decide_staff_assignment_change(uuid,text,text) from public,anon;
grant execute on function public.decide_staff_assignment_change(uuid,text,text) to authenticated;

-- Direct assignment mutation is retired in favour of the audited workflow.
drop policy if exists assignments_insert on public.teacher_class_assignments;
drop policy if exists assignments_update on public.teacher_class_assignments;
drop policy if exists assignments_delete on public.teacher_class_assignments;
create policy assignments_insert on public.teacher_class_assignments for insert to authenticated with check (false);
create policy assignments_update on public.teacher_class_assignments for update to authenticated using (false) with check (false);
create policy assignments_delete on public.teacher_class_assignments for delete to authenticated using (false);

alter table public.staff_assignment_changes enable row level security;
alter table public.staff_assignment_change_events enable row level security;
revoke all on table public.staff_assignment_changes,public.staff_assignment_change_events from public,anon;
grant select on table public.staff_assignment_changes,public.staff_assignment_change_events to authenticated;
create policy staff_assignment_changes_select on public.staff_assignment_changes for select to authenticated
  using (public.is_admin() or recommended_by=(select auth.uid()) or current_teacher_id=(select auth.uid()) or target_teacher_id=(select auth.uid()));
create policy staff_assignment_events_select on public.staff_assignment_change_events for select to authenticated
  using (exists(select 1 from public.staff_assignment_changes c where c.id=change_id and
    (public.is_admin() or c.recommended_by=(select auth.uid()) or c.current_teacher_id=(select auth.uid()) or c.target_teacher_id=(select auth.uid()))));

-- ---------------------------------------------------------------------------
-- Exceptional pupil progression and Common Entrance candidacy
-- ---------------------------------------------------------------------------

alter table public.promotion_entries
  drop constraint if exists promotion_entries_proposed_outcome_check;
alter table public.promotion_entries
  add constraint promotion_entries_proposed_outcome_check check (proposed_outcome in (
    'promote','retain','graduate','withdraw','transfer_out','pending',
    'accelerated_promote','early_secondary_transition','accelerated_graduate'
  ));

alter table public.promotion_entries
  add column if not exists exceptional_status text not null default 'none',
  add column if not exists exceptional_outcome text,
  add column if not exists exceptional_target_class text references public.class_progression(class_code) on delete restrict,
  add column if not exists exceptional_reason text,
  add column if not exists recommended_by uuid references public.profiles(id) on delete set null,
  add column if not exists recommended_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz;

do $$
begin
  alter table public.promotion_entries add constraint promotion_entries_exceptional_status_check
    check (exceptional_status in ('none','recommended','approved','rejected','cancelled'));
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.promotion_entries add constraint promotion_entries_exceptional_outcome_check
    check (exceptional_outcome is null or exceptional_outcome in ('accelerated_promote','early_secondary_transition','accelerated_graduate'));
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.promotion_entries add constraint promotion_entries_exceptional_reason_length
    check (exceptional_reason is null or char_length(trim(exceptional_reason)) between 3 and 1000);
exception when duplicate_object then null;
end $$;

alter table public.student_enrolments drop constraint if exists student_enrolments_status_check;
alter table public.student_enrolments add constraint student_enrolments_status_check check (status in (
  'active','completed','promoted','retained','graduated','withdrawn','transferred_out','corrected',
  'accelerated_promoted','early_secondary_transition','accelerated_graduated'
));
alter table public.student_enrolments drop constraint if exists student_enrolments_source_check;
alter table public.student_enrolments add constraint student_enrolments_source_check check (source in (
  'initial_baseline','office_entry','admission','promotion','accelerated_promotion','correction'
));

alter table public.graduates
  add column if not exists completion_type text not null default 'standard_primary6';
do $$
begin
  alter table public.graduates add constraint graduates_completion_type_check
    check (completion_type in ('standard_primary6','accelerated_secondary_transition'));
exception when duplicate_object then null;
end $$;

drop function if exists public.parent_graduates();
create function public.parent_graduates()
returns table(student_id uuid,graduation_session text,graduated_on date,completion_type text,public_status text)
language sql stable security definer set search_path='' as $$
  select g.student_id,g.graduation_session,g.graduated_on,g.completion_type,g.public_status
    from public.graduates g
   where public.parent_can_access_student(g.student_id)
   order by g.graduated_on desc
$$;
revoke all on function public.parent_graduates() from public,anon;
grant execute on function public.parent_graduates() to authenticated;

create table if not exists public.exceptional_progression_events (
  id bigint generated always as identity primary key,
  batch_id uuid not null,
  student_id uuid not null references public.students(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  outcome text,
  target_class text,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  foreign key(batch_id,student_id) references public.promotion_entries(batch_id,student_id) on delete cascade
);

create or replace function public.recommend_exceptional_progression(
  p_batch_id uuid,
  p_student_id uuid,
  p_outcome text,
  p_target_class text default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role public.app_role;
  v_batch public.promotion_batches%rowtype;
  v_source_order integer;
  v_target_order integer;
  v_next text;
begin
  select p.role into v_role from public.profiles p where p.id=v_actor and p.active=true and p.account_status='active';
  if v_role not in ('teacher'::public.app_role,'admin'::public.app_role) then
    raise exception 'Active staff account required' using errcode='42501';
  end if;
  select * into v_batch from public.promotion_batches where id=p_batch_id and status='draft' for update;
  if not found then raise exception 'Draft promotion batch required' using errcode='22023'; end if;
  if not exists(select 1 from public.promotion_entries e where e.batch_id=p_batch_id and e.student_id=p_student_id) then
    raise exception 'Promotion entry not found' using errcode='P0002';
  end if;
  if v_role='teacher'::public.app_role and not exists(
    select 1 from public.teacher_class_assignments a where a.teacher_id=v_actor and a.class_code=v_batch.source_class and a.active=true
  ) then raise exception 'Active source-class assignment required' using errcode='42501'; end if;
  if p_outcome not in ('accelerated_promote','early_secondary_transition','accelerated_graduate')
     or char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Exceptional outcome and reason required' using errcode='22023';
  end if;
  if p_outcome='accelerated_promote' then
    select sort_order,next_class_code into v_source_order,v_next from public.class_progression where class_code=v_batch.source_class;
    select sort_order into v_target_order from public.class_progression where class_code=trim(p_target_class) and active_for_enrolment=true;
    if v_target_order is null or v_target_order<=v_source_order or trim(p_target_class)=coalesce(v_next,'') then
      raise exception 'Accelerated promotion must skip at least one configured active class' using errcode='22023';
    end if;
  elsif v_batch.source_class<>'Primary 4' then
    raise exception 'Early secondary transition is available only from Primary 4' using errcode='22023';
  end if;
  update public.promotion_entries set
    proposed_outcome='pending',target_class=null,exceptional_status='recommended',exceptional_outcome=p_outcome,
    exceptional_target_class=case when p_outcome='accelerated_promote' then trim(p_target_class) when p_outcome='accelerated_graduate' then 'Graduate Hall' else null end,
    exceptional_reason=trim(p_reason),recommended_by=v_actor,recommended_at=now(),approved_by=null,approved_at=null,
    updated_by=v_actor,updated_at=now()
   where batch_id=p_batch_id and student_id=p_student_id;
  insert into public.exceptional_progression_events(batch_id,student_id,actor_id,action,outcome,target_class,note)
  values(p_batch_id,p_student_id,v_actor,'recommended',p_outcome,nullif(trim(p_target_class),''),trim(p_reason));
end;
$$;
revoke all on function public.recommend_exceptional_progression(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.recommend_exceptional_progression(uuid,uuid,text,text,text) to authenticated;

create or replace function public.teacher_exceptional_progression_entries()
returns table(batch_id uuid,student_id uuid,source_class text,source_session text,target_session text,proposed_outcome text,exceptional_status text)
language sql stable security definer set search_path='' as $$
  select e.batch_id,e.student_id,b.source_class,b.source_session,b.target_session,e.proposed_outcome,e.exceptional_status
    from public.promotion_entries e
    join public.promotion_batches b on b.id=e.batch_id and b.status='draft'
   where exists(select 1 from public.teacher_class_assignments a
     where a.teacher_id=(select auth.uid()) and a.class_code=b.source_class and a.active=true)
     and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active=true
       and p.account_status='active' and p.must_change_password=false and p.role in ('teacher'::public.app_role,'admin'::public.app_role))
   order by b.prepared_at desc,e.student_id
$$;
revoke all on function public.teacher_exceptional_progression_entries() from public,anon;
grant execute on function public.teacher_exceptional_progression_entries() to authenticated;

create or replace function public.decide_exceptional_progression(
  p_batch_id uuid,
  p_student_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_entry public.promotion_entries%rowtype;
begin
  if not public.is_headmistress() then raise exception 'Full leadership authority required' using errcode='42501'; end if;
  select * into v_entry from public.promotion_entries
   where batch_id=p_batch_id and student_id=p_student_id and exceptional_status='recommended' for update;
  if not found then raise exception 'Recommended exceptional decision required' using errcode='22023'; end if;
  if v_entry.recommended_by=v_actor then raise exception 'Independent recommendation and approval are required' using errcode='42501'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Approve or reject required' using errcode='22023'; end if;
  if p_decision='approve' then
    update public.promotion_entries set exceptional_status='approved',proposed_outcome=exceptional_outcome,
      target_class=exceptional_target_class,approved_by=v_actor,approved_at=now(),updated_by=v_actor,updated_at=now()
     where batch_id=p_batch_id and student_id=p_student_id;
  else
    update public.promotion_entries set exceptional_status='rejected',proposed_outcome='pending',target_class=null,
      approved_by=v_actor,approved_at=now(),updated_by=v_actor,updated_at=now()
     where batch_id=p_batch_id and student_id=p_student_id;
  end if;
  insert into public.exceptional_progression_events(batch_id,student_id,actor_id,action,outcome,target_class,note)
  values(p_batch_id,p_student_id,v_actor,p_decision,v_entry.exceptional_outcome,v_entry.exceptional_target_class,nullif(trim(p_note),''));
end;
$$;
revoke all on function public.decide_exceptional_progression(uuid,uuid,text,text) from public,anon;
grant execute on function public.decide_exceptional_progression(uuid,uuid,text,text) to authenticated;

create table if not exists public.common_entrance_candidates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  exam_session text not null check (char_length(trim(exam_session)) between 4 and 40),
  source_class text not null check (source_class in ('Primary 4','Primary 6')),
  status text not null default 'recommended' check (status in ('recommended','approved','sat','completed','cancelled')),
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  recommended_by uuid not null references public.profiles(id) on delete restrict,
  recommended_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id,exam_session)
);

create or replace function public.recommend_common_entrance_candidate(p_student_id uuid,p_exam_session text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_role public.app_role; v_class text; v_id uuid;
begin
  select p.role into v_role from public.profiles p where p.id=v_actor and p.active=true and p.account_status='active';
  if v_role not in ('teacher'::public.app_role,'admin'::public.app_role) then raise exception 'Active staff required' using errcode='42501'; end if;
  select e.class_code into v_class from public.student_enrolments e where e.student_id=p_student_id and e.status='active' and e.ended_on is null;
  if v_class not in ('Primary 4','Primary 6') then raise exception 'Primary 4 or Primary 6 active pupil required' using errcode='22023'; end if;
  if v_role='teacher'::public.app_role and not exists(select 1 from public.teacher_class_assignments a where a.teacher_id=v_actor and a.class_code=v_class and a.active=true) then raise exception 'Active class assignment required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_exam_session,'')))<4 or char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Session and reason required' using errcode='22023'; end if;
  insert into public.common_entrance_candidates(student_id,exam_session,source_class,reason,recommended_by)
  values(p_student_id,trim(p_exam_session),v_class,trim(p_reason),v_actor) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.recommend_common_entrance_candidate(uuid,text,text) from public,anon;
grant execute on function public.recommend_common_entrance_candidate(uuid,text,text) to authenticated;

create or replace function public.decide_common_entrance_candidate(p_candidate_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_row public.common_entrance_candidates%rowtype;
begin
  if not public.is_headmistress() then raise exception 'Full leadership authority required' using errcode='42501'; end if;
  select * into v_row from public.common_entrance_candidates where id=p_candidate_id and status='recommended' for update;
  if not found then raise exception 'Recommended candidate required' using errcode='22023'; end if;
  if v_row.recommended_by=v_actor then raise exception 'Independent recommendation and approval are required' using errcode='42501'; end if;
  if p_decision not in ('approve','cancel') then raise exception 'Approve or cancel required' using errcode='22023'; end if;
  update public.common_entrance_candidates set status=case when p_decision='approve' then 'approved' else 'cancelled' end,
    approved_by=v_actor,approved_at=now(),note=nullif(trim(p_note),''),updated_at=now() where id=p_candidate_id;
end $$;
revoke all on function public.decide_common_entrance_candidate(uuid,text,text) from public,anon;
grant execute on function public.decide_common_entrance_candidate(uuid,text,text) to authenticated;

create or replace function public.set_common_entrance_candidate_status(p_candidate_id uuid,p_status text,p_note text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_row public.common_entrance_candidates%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  select * into v_row from public.common_entrance_candidates where id=p_candidate_id for update;
  if not found then raise exception 'Candidate not found' using errcode='P0002'; end if;
  if p_status not in ('sat','completed','cancelled') then raise exception 'Invalid candidate status' using errcode='22023'; end if;
  if (p_status='sat' and v_row.status<>'approved') or (p_status='completed' and v_row.status<>'sat')
     or (p_status='cancelled' and v_row.status not in ('approved','sat')) then
    raise exception 'Invalid Common Entrance status transition' using errcode='22023';
  end if;
  update public.common_entrance_candidates set status=p_status,note=coalesce(nullif(trim(p_note),''),note),updated_at=now()
   where id=p_candidate_id;
end $$;
revoke all on function public.set_common_entrance_candidate_status(uuid,text,text) from public,anon;
grant execute on function public.set_common_entrance_candidate_status(uuid,text,text) to authenticated;

alter table public.exceptional_progression_events enable row level security;
alter table public.common_entrance_candidates enable row level security;
revoke all on table public.exceptional_progression_events,public.common_entrance_candidates from public,anon;
grant select on table public.exceptional_progression_events,public.common_entrance_candidates to authenticated;
create policy exceptional_progression_events_select on public.exceptional_progression_events for select to authenticated using (public.is_admin());
create policy common_entrance_candidates_select on public.common_entrance_candidates for select to authenticated using (
  public.is_admin() or exists(select 1 from public.teacher_class_assignments a join public.students s on s.id=student_id where a.teacher_id=(select auth.uid()) and a.class_code=s.class_code and a.active=true)
);

-- Existing normal outcome editor now clears any unapproved exceptional proposal.
create or replace function public.set_promotion_outcome(
  p_batch_id uuid,p_student_id uuid,p_outcome text,p_note text default null
)
returns void language plpgsql security definer set search_path='' as $$
declare v_batch public.promotion_batches%rowtype; v_target text;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  select * into v_batch from public.promotion_batches where id=p_batch_id for update;
  if not found or v_batch.status<>'draft' then raise exception 'Draft promotion batch required' using errcode='22023'; end if;
  if p_outcome not in ('promote','retain','graduate','withdraw','transfer_out','pending') then raise exception 'Invalid normal promotion outcome' using errcode='22023'; end if;
  if p_outcome='graduate' and v_batch.source_class<>'Primary 6' then raise exception 'Only Primary 6 may use standard graduation' using errcode='22023'; end if;
  v_target:=case when p_outcome='promote' then public.next_school_class(v_batch.source_class) when p_outcome='retain' then v_batch.source_class when p_outcome='graduate' then 'Graduate Hall' else null end;
  update public.promotion_entries set proposed_outcome=p_outcome,target_class=v_target,note=nullif(trim(p_note),''),
    exceptional_status='none',exceptional_outcome=null,exceptional_target_class=null,exceptional_reason=null,
    recommended_by=null,recommended_at=null,approved_by=null,approved_at=null,updated_by=(select auth.uid()),updated_at=now()
   where batch_id=p_batch_id and student_id=p_student_id;
  if not found then raise exception 'Promotion entry not found' using errcode='P0002'; end if;
end $$;
revoke all on function public.set_promotion_outcome(uuid,uuid,text,text) from public,anon;
grant execute on function public.set_promotion_outcome(uuid,uuid,text,text) to authenticated;

create or replace function public.apply_promotion_batch(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_batch public.promotion_batches%rowtype; v_entry record; v_count integer:=0; v_guardian record; v_completion text;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  select * into v_batch from public.promotion_batches where id=p_batch_id for update;
  if not found or v_batch.status<>'draft' then raise exception 'Draft promotion batch required' using errcode='22023'; end if;
  if not exists(select 1 from public.promotion_entries e where e.batch_id=p_batch_id) then raise exception 'Promotion preview contains no eligible pupils' using errcode='22023'; end if;
  if exists(select 1 from public.promotion_entries e where e.batch_id=p_batch_id and e.proposed_outcome='pending') then raise exception 'Every pupil requires a promotion outcome before confirmation' using errcode='22023'; end if;
  if exists(select 1 from public.promotion_entries e where e.batch_id=p_batch_id and e.proposed_outcome in ('accelerated_promote','early_secondary_transition','accelerated_graduate') and (e.exceptional_status<>'approved' or e.approved_by is null)) then raise exception 'Exceptional progression requires full leadership approval' using errcode='42501'; end if;
  if exists(
    select 1 from public.promotion_entries e join public.students s on s.id=e.student_id
    left join public.student_enrolments h on h.student_id=e.student_id and h.ended_on is null and h.status='active'
    where e.batch_id=p_batch_id and (s.active<>true or s.class_code<>v_batch.source_class or h.id is null or h.session_name<>v_batch.source_session or h.class_code<>v_batch.source_class)
  ) then raise exception 'Pupil class or enrolment history changed after preview; prepare a new batch' using errcode='40001'; end if;
  for v_entry in select e.*,s.full_name from public.promotion_entries e join public.students s on s.id=e.student_id where e.batch_id=p_batch_id order by s.full_name for update of e,s loop
    update public.student_enrolments set status=case v_entry.proposed_outcome
      when 'promote' then 'promoted' when 'retain' then 'retained' when 'graduate' then 'graduated'
      when 'accelerated_promote' then 'accelerated_promoted' when 'early_secondary_transition' then 'early_secondary_transition'
      when 'accelerated_graduate' then 'accelerated_graduated' when 'withdraw' then 'withdrawn' else 'transferred_out' end,
      ended_on=current_date,updated_at=now() where student_id=v_entry.student_id and ended_on is null and status='active';
    if v_entry.proposed_outcome in ('promote','retain','accelerated_promote') then
      update public.students set class_code=v_entry.target_class,active=true,updated_at=now() where id=v_entry.student_id;
      insert into public.student_enrolments(student_id,session_name,class_code,source,recorded_by)
      values(v_entry.student_id,v_batch.target_session,v_entry.target_class,case when v_entry.proposed_outcome='accelerated_promote' then 'accelerated_promotion' else 'promotion' end,(select auth.uid()));
    elsif v_entry.proposed_outcome in ('graduate','accelerated_graduate') then
      v_completion:=case when v_entry.proposed_outcome='graduate' then 'standard_primary6' else 'accelerated_secondary_transition' end;
      update public.students set class_code='Graduate Hall',active=false,updated_at=now() where id=v_entry.student_id;
      insert into public.graduates(student_id,graduation_session,graduated_on,recorded_by,completion_type)
      values(v_entry.student_id,v_batch.target_session,current_date,(select auth.uid()),v_completion)
      on conflict(student_id) do update set graduation_session=excluded.graduation_session,graduated_on=excluded.graduated_on,
        recorded_by=excluded.recorded_by,completion_type=excluded.completion_type,updated_at=now();
    else
      update public.students set active=false,updated_at=now() where id=v_entry.student_id;
    end if;
    for v_guardian in select g.parent_id from public.student_guardians g where g.student_id=v_entry.student_id and g.active=true loop
      insert into public.portal_notifications(recipient_id,student_id,kind,title,message) values(
        v_guardian.parent_id,v_entry.student_id,
        case when v_entry.proposed_outcome in ('promote','accelerated_promote') then 'promotion' when v_entry.proposed_outcome='retain' then 'retention' when v_entry.proposed_outcome in ('graduate','accelerated_graduate') then 'graduation' else 'general' end,
        case v_entry.proposed_outcome when 'promote' then 'Class promotion confirmed' when 'accelerated_promote' then 'Accelerated class placement confirmed' when 'retain' then 'Class placement confirmed' when 'graduate' then 'Graduation confirmed' when 'accelerated_graduate' then 'Accelerated secondary transition confirmed' when 'early_secondary_transition' then 'Early secondary transition confirmed' else 'Pupil record updated' end,
        case v_entry.proposed_outcome when 'promote' then v_entry.full_name||' has moved to '||v_entry.target_class||' for '||v_batch.target_session||'.' when 'accelerated_promote' then v_entry.full_name||' has an approved accelerated move to '||v_entry.target_class||' for '||v_batch.target_session||'.' when 'retain' then v_entry.full_name||' remains in '||v_entry.target_class||' for '||v_batch.target_session||'.' when 'graduate' then v_entry.full_name||' is now listed privately in Your Graduates for '||v_batch.target_session||'.' when 'accelerated_graduate' then v_entry.full_name||' has an approved accelerated secondary transition recorded in private Graduate Hall.' when 'early_secondary_transition' then v_entry.full_name||' has completed an approved early transition to secondary school without a false Primary 6 enrolment.' when 'withdraw' then v_entry.full_name||' is no longer on the active class roster.' else v_entry.full_name||' has been recorded as transferred out.' end
      );
    end loop;
    v_count:=v_count+1;
  end loop;
  update public.promotion_batches set status='applied',applied_by=(select auth.uid()),applied_at=now() where id=p_batch_id;
  return jsonb_build_object('batch_id',p_batch_id,'applied_count',v_count);
end $$;
revoke all on function public.apply_promotion_batch(uuid) from public,anon;
grant execute on function public.apply_promotion_batch(uuid) to authenticated;

-- The owner-approved Proprietress has broad full-write authority, while the
-- school's narrower standing control still reserves reversal of an already
-- verified payment to the designated Headmistress.
create or replace function public.is_designated_headmistress()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.profiles p
     where p.id=(select auth.uid()) and p.role='admin'::public.app_role
       and p.leadership_scope='headmistress'::public.leadership_scope
       and p.active=true and p.account_status='active' and p.must_change_password=false
       and lower(coalesce(nullif(trim(p.position_title),''),'headmistress'))='headmistress'
  )
$$;
revoke all on function public.is_designated_headmistress() from public,anon;
grant execute on function public.is_designated_headmistress() to authenticated;

-- Preserve the existing payment workflow verbatim except for the designated-
-- Headmistress reversal check above.
create or replace function public.review_manual_payment(
  p_payment_id uuid,
  p_action text,
  p_note text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.manual_payments%rowtype;
  v_receipt text;
  v_total numeric(12,2);
begin
  if not public.is_admin() or char_length(trim(coalesce(p_note,''))) < 3 then
    raise exception 'Administrator and review note required' using errcode = '42501';
  end if;
  select * into v from public.manual_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if p_action = 'under_review' and v.status = 'submitted' then
    update public.manual_payments set status='under_review', reviewed_by=(select auth.uid()), reviewed_at=now(), review_note=trim(p_note), updated_at=now() where id=p_payment_id;
    insert into public.finance_events(payment_id, invoice_id, order_id, actor_id, event_type)
    values (p_payment_id, v.invoice_id, v.order_id, (select auth.uid()), 'payment_under_review');
    return null;
  elsif p_action = 'verify' and v.status in ('submitted','under_review') then
    update public.manual_payments set status='verified', reviewed_by=(select auth.uid()), reviewed_at=now(), review_note=trim(p_note), updated_at=now() where id=p_payment_id;
    v_receipt := public.finalize_verified_payment(p_payment_id, (select auth.uid()));
    return v_receipt;
  elsif p_action = 'reject' and v.status in ('submitted','under_review') then
    update public.manual_payments set status='rejected', reviewed_by=(select auth.uid()), reviewed_at=now(), review_note=trim(p_note), updated_at=now() where id=p_payment_id;
    if v.order_id is not null and not exists (select 1 from public.manual_payments m where m.order_id=v.order_id and m.id<>p_payment_id and m.status in ('submitted','under_review','verified')) then
      update public.shop_orders set status='awaiting_payment', updated_at=now() where id=v.order_id and status='payment_submitted';
    end if;
    insert into public.finance_events(payment_id, invoice_id, order_id, actor_id, event_type)
    values (p_payment_id, v.invoice_id, v.order_id, (select auth.uid()), 'payment_rejected');
    return null;
  elsif p_action = 'reverse' and v.status = 'verified' then
    if not public.is_designated_headmistress() then raise exception 'Only the Headmistress may reverse a verified payment' using errcode = '42501'; end if;
    update public.manual_payments set status='reversed', reversed_by=(select auth.uid()), reversed_at=now(), reversal_reason=trim(p_note), updated_at=now() where id=p_payment_id;
    update public.payment_receipts set reversed_at=now(), reversal_reason=trim(p_note) where payment_id=p_payment_id;
    if v.invoice_id is not null then
      select coalesce(sum(amount),0) into v_total from public.manual_payments where invoice_id=v.invoice_id and status='verified';
      update public.pupil_invoices set paid_amount=v_total,
        status=case when v_total=0 then 'issued' when v_total=total_amount then 'paid' else 'part_paid' end,
        updated_at=now() where id=v.invoice_id;
    else
      update public.shop_orders set status='payment_reversed', updated_at=now() where id=v.order_id;
    end if;
    insert into public.finance_events(payment_id, invoice_id, order_id, actor_id, event_type, detail)
    values (p_payment_id, v.invoice_id, v.order_id, (select auth.uid()), 'payment_reversed', jsonb_build_object('reason',trim(p_note)));
    return null;
  end if;
  raise exception 'Invalid payment transition' using errcode = '22023';
end;
$$;
revoke all on function public.review_manual_payment(uuid, text, text) from public, anon;
grant execute on function public.review_manual_payment(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Phone-verified first-password claims for owner-approved staff identities
-- ---------------------------------------------------------------------------

create table if not exists public.portal_account_claims (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null unique check (phone_e164 ~ '^\+234[789][0-9]{9}$'),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  intended_role public.app_role not null,
  leadership_scope public.leadership_scope not null default 'none',
  position_title text check (position_title is null or char_length(trim(position_title)) between 2 and 80),
  class_code text,
  subject text not null default '*',
  developer_console boolean not null default false,
  developer_otp boolean not null default false,
  developer_information boolean not null default false,
  developer_health boolean not null default false,
  status text not null default 'pending' check (status in ('pending','claimed','cancelled','expired')),
  expires_at timestamptz not null,
  claimed_user_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (class_code is null or char_length(trim(class_code)) between 1 and 40),
  check (char_length(trim(subject)) between 1 and 80)
);

create table if not exists public.portal_account_claim_challenges (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid references public.portal_account_claims(id) on delete cascade,
  request_token_hash text not null unique check (request_token_hash ~ '^[a-f0-9]{64}$'),
  phone_hash text not null check (phone_hash ~ '^[a-f0-9]{64}$'),
  phone_last4 text not null check (phone_last4 ~ '^[0-9]{4}$'),
  network_hash text not null check (network_hash ~ '^[a-f0-9]{64}$'),
  channel text not null check (channel in ('whatsapp','sms')),
  otp_hash text not null check (otp_hash ~ '^[a-f0-9]{64}$'),
  delivery_ciphertext text,
  delivery_iv text,
  delivery_tag text,
  setup_token_hash text check (setup_token_hash is null or setup_token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'queued' check (status in ('queued','revealed','sent','verified','completed','expired','cancelled','locked')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  requested_at timestamptz not null default now(),
  revealed_at timestamptz,
  revealed_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists portal_claim_challenges_phone_rate_idx on public.portal_account_claim_challenges(phone_hash,requested_at desc);
create index if not exists portal_claim_challenges_network_rate_idx on public.portal_account_claim_challenges(network_hash,requested_at desc);
create unique index if not exists portal_claim_one_active_phone_idx
  on public.portal_account_claim_challenges(phone_hash) where status in ('queued','revealed','sent');
create unique index if not exists portal_claim_setup_token_unique_idx
  on public.portal_account_claim_challenges(setup_token_hash) where setup_token_hash is not null;
do $$ begin
  alter table public.portal_account_claim_challenges add constraint portal_claim_challenge_expiry_check
    check (expires_at>requested_at);
exception when duplicate_object then null; end $$;

create table if not exists public.portal_account_claim_events (
  id bigint generated always as identity primary key,
  challenge_id uuid not null references public.portal_account_claim_challenges(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('queued','revealed','copied','opened_channel','marked_sent','verified','failed','expired','cancelled','replaced','completed')),
  channel text not null check (channel in ('whatsapp','sms')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (not (detail ?| array['otp','code','phone','message'])),
  check (detail::text !~* '\"(otp|code|phone|message)\"[[:space:]]*:')
);

create or replace function public.server_reveal_portal_claim_otp(p_challenge_id uuid,p_actor_id uuid)
returns table(delivery_ciphertext text,delivery_iv text,delivery_tag text,channel text)
language plpgsql security definer set search_path='' as $$
declare v_ciphertext text; v_iv text; v_tag text; v_channel text;
begin
  if coalesce((select auth.role()),'')<>'service_role' or not public.developer_has_capability(p_actor_id,'otp_dispatch') then
    raise exception 'OTP dispatch capability required' using errcode='42501';
  end if;
  select c.delivery_ciphertext,c.delivery_iv,c.delivery_tag,c.channel
    into v_ciphertext,v_iv,v_tag,v_channel
    from public.portal_account_claim_challenges c
   where c.id=p_challenge_id and c.status='queued' and c.expires_at>now()
   for update;
  if not found or v_ciphertext is null then return; end if;
  update public.portal_account_claim_challenges c set status='revealed',revealed_at=now(),revealed_by=p_actor_id,
    delivery_ciphertext=null,delivery_iv=null,delivery_tag=null,updated_at=now()
   where c.id=p_challenge_id;
  insert into public.portal_account_claim_events(challenge_id,actor_id,action,channel)
  values(p_challenge_id,p_actor_id,'revealed',v_channel);
  return query select v_ciphertext,v_iv,v_tag,v_channel;
end $$;
revoke all on function public.server_reveal_portal_claim_otp(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_reveal_portal_claim_otp(uuid,uuid) to service_role;

create or replace function public.server_mark_portal_claim_otp(p_challenge_id uuid,p_actor_id uuid,p_action text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_channel text;
begin
  if coalesce((select auth.role()),'')<>'service_role' or not public.developer_has_capability(p_actor_id,'otp_dispatch') then
    raise exception 'OTP dispatch capability required' using errcode='42501';
  end if;
  if p_action not in ('copied','opened_channel','marked_sent') then raise exception 'Invalid dispatch action' using errcode='22023'; end if;
  if p_action='marked_sent' then
    update public.portal_account_claim_challenges set status='sent',sent_at=now(),sent_by=p_actor_id,
      delivery_ciphertext=null,delivery_iv=null,delivery_tag=null,updated_at=now()
     where id=p_challenge_id and status='revealed' and expires_at>now() returning channel into v_channel;
  else
    select channel into v_channel from public.portal_account_claim_challenges where id=p_challenge_id and status='revealed' and expires_at>now();
  end if;
  if v_channel is null then return false; end if;
  insert into public.portal_account_claim_events(challenge_id,actor_id,action,channel) values(p_challenge_id,p_actor_id,p_action,v_channel);
  return true;
end $$;
revoke all on function public.server_mark_portal_claim_otp(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.server_mark_portal_claim_otp(uuid,uuid,text) to service_role;

create or replace function public.server_verify_portal_account_claim(
  p_request_token_hash text,p_otp_hash text,p_setup_token_hash text
)
returns table(challenge_id uuid,claim_id uuid)
language plpgsql security definer set search_path='' as $$
declare v_row public.portal_account_claim_challenges%rowtype;
begin
  if coalesce((select auth.role()),'')<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into v_row from public.portal_account_claim_challenges
   where request_token_hash=p_request_token_hash for update;
  if not found or v_row.status not in ('revealed','sent') or v_row.expires_at<=now() or v_row.attempt_count>=5 then return; end if;
  if v_row.otp_hash<>p_otp_hash then
    update public.portal_account_claim_challenges set attempt_count=attempt_count+1,
      status=case when attempt_count+1>=5 then 'locked' else status end,
      delivery_ciphertext=case when attempt_count+1>=5 then null else delivery_ciphertext end,
      delivery_iv=case when attempt_count+1>=5 then null else delivery_iv end,
      delivery_tag=case when attempt_count+1>=5 then null else delivery_tag end,updated_at=now() where id=v_row.id;
    insert into public.portal_account_claim_events(challenge_id,action,channel,detail)
    values(v_row.id,'failed',v_row.channel,jsonb_build_object('reason','invalid_attempt'));
    return;
  end if;
  update public.portal_account_claim_challenges set status='verified',verified_at=now(),
    setup_token_hash=p_setup_token_hash,delivery_ciphertext=null,delivery_iv=null,delivery_tag=null,updated_at=now()
   where id=v_row.id;
  insert into public.portal_account_claim_events(challenge_id,action,channel) values(v_row.id,'verified',v_row.channel);
  return query select v_row.id,v_row.claim_id;
end $$;
revoke all on function public.server_verify_portal_account_claim(text,text,text) from public,anon,authenticated;
grant execute on function public.server_verify_portal_account_claim(text,text,text) to service_role;

create or replace function public.server_complete_portal_account_claim(p_claim_id uuid,p_user_id uuid,p_setup_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_claim public.portal_account_claims%rowtype; v_challenge public.portal_account_claim_challenges%rowtype;
begin
  if coalesce((select auth.role()),'')<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into v_challenge from public.portal_account_claim_challenges
   where claim_id=p_claim_id and setup_token_hash=p_setup_token_hash and status='verified'
     and verified_at>now()-interval '10 minutes' for update;
  if not found then raise exception 'Verified account setup required' using errcode='42501'; end if;
  select * into v_claim from public.portal_account_claims where id=p_claim_id and status='pending' and expires_at>now() for update;
  if not found then raise exception 'Active account claim required' using errcode='22023'; end if;
  update public.profiles set role=v_claim.intended_role,full_name=v_claim.full_name,phone=v_claim.phone_e164,
    phone_e164=v_claim.phone_e164,leadership_scope=v_claim.leadership_scope,position_title=v_claim.position_title,
    active=true,account_status='active',must_change_password=false,phone_verified_at=now(),last_password_change_at=now(),updated_at=now()
   where id=p_user_id;
  if not found then raise exception 'Auth profile trigger did not create a profile' using errcode='P0002'; end if;
  if v_claim.class_code is not null then
    insert into public.teacher_class_assignments(teacher_id,class_code,subject,active,assignment_kind,started_on,approved_at)
    values(p_user_id,v_claim.class_code,v_claim.subject,true,case when v_claim.subject='*' then 'class_teacher' else 'subject_teacher' end,current_date,now());
  end if;
  if v_claim.developer_console then
    insert into public.developer_capabilities(profile_id,console_access,otp_dispatch,information_review,system_health_read,reason)
    values(p_user_id,true,v_claim.developer_otp,v_claim.developer_information,v_claim.developer_health,'Owner-approved account claim')
    on conflict(profile_id) do update set console_access=true,otp_dispatch=excluded.otp_dispatch,
      information_review=excluded.information_review,system_health_read=excluded.system_health_read,
      revoked_at=null,reason=excluded.reason,granted_at=now();
  end if;
  update public.portal_account_claims set status='claimed',claimed_user_id=p_user_id,claimed_at=now(),updated_at=now() where id=p_claim_id;
  update public.portal_account_claim_challenges set status='completed',completed_at=now(),setup_token_hash=null,updated_at=now() where id=v_challenge.id;
  insert into public.portal_account_claim_events(challenge_id,action,channel) values(v_challenge.id,'completed',v_challenge.channel);
  insert into public.account_audit_log(target_profile_id,action,reason_code,detail)
  values(p_user_id,'account_provisioned','owner_approved_claim',jsonb_build_object('claim_id',p_claim_id,'position_title',v_claim.position_title));
  return jsonb_build_object('user_id',p_user_id,'role',v_claim.intended_role,'leadership_scope',v_claim.leadership_scope,'position_title',v_claim.position_title);
end $$;
revoke all on function public.server_complete_portal_account_claim(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.server_complete_portal_account_claim(uuid,uuid,text) to service_role;

alter table public.portal_account_claims enable row level security;
alter table public.portal_account_claim_challenges enable row level security;
alter table public.portal_account_claim_events enable row level security;
revoke all on table public.portal_account_claims,public.portal_account_claim_challenges,public.portal_account_claim_events from public,anon,authenticated;
grant all on table public.portal_account_claims,public.portal_account_claim_challenges,public.portal_account_claim_events to service_role;
grant all on sequence public.portal_account_claim_events_id_seq to service_role;

-- New tables use the shared timestamp trigger where client-visible updates occur.
drop trigger if exists staff_assignment_changes_touch on public.staff_assignment_changes;
create trigger staff_assignment_changes_touch before update on public.staff_assignment_changes
for each row execute function public.portal_touch_updated_at();
drop trigger if exists common_entrance_candidates_touch on public.common_entrance_candidates;
create trigger common_entrance_candidates_touch before update on public.common_entrance_candidates
for each row execute function public.portal_touch_updated_at();
drop trigger if exists portal_account_claims_touch on public.portal_account_claims;
create trigger portal_account_claims_touch before update on public.portal_account_claims
for each row execute function public.portal_touch_updated_at();
drop trigger if exists portal_account_claim_challenges_touch on public.portal_account_claim_challenges;
create trigger portal_account_claim_challenges_touch before update on public.portal_account_claim_challenges
for each row execute function public.portal_touch_updated_at();

comment on table public.staff_assignment_changes is 'Recommendation plus independent full-leadership approval for teacher assignment continuity and replacement.';
comment on table public.common_entrance_candidates is 'Common Entrance candidacy is independent from class placement; Primary 4 participation never fabricates Primary 6 history.';
comment on column public.graduates.completion_type is 'Distinguishes standard Primary 6 graduation from an owner-approved accelerated secondary transition.';
comment on table public.portal_account_claims is 'Service-only owner-approved identity claims; no password is stored and the account holder chooses the first password after phone verification.';
comment on table public.portal_account_claim_challenges is 'Service-only hash/encrypted OTP state for first-password account claims. Raw codes are never stored.';

commit;

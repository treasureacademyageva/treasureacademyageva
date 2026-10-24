-- MANUAL, OWNER-AUTHORISED BOOTSTRAP DATA — NOT A MIGRATION
-- Apply only after migration 202610240002, preservation postflight and staged
-- account-claim acceptance pass. This file creates NO Auth user and NO password.
-- Each named person must verify the same registered phone and privately choose
-- the first password through Claim Your School Account.
--
-- Safe re-run behaviour: a claimed identity is never reset to pending. An
-- existing pending/expired claim may be refreshed before the account is claimed.

begin;

insert into public.portal_account_claims(
  phone_e164,full_name,intended_role,leadership_scope,position_title,class_code,
  subject,developer_console,developer_otp,developer_information,developer_health,
  status,expires_at
) values
  ('+2348141943478','Shaibu Sidikat Ruth','admin','headmistress','Proprietress',null,
   '*',false,false,false,false,'pending',now()+interval '30 days'),
  ('+2348133167728','Mrs. Salihu Nanahawa','admin','headmistress','Headmistress','Nursery 1',
   '*',false,false,false,false,'pending',now()+interval '30 days'),
  ('+2347064923346','Mrs. Abedoh Rafatu','admin','assistant_headmistress','Assistant Headmistress','Primary 4',
   '*',false,false,false,false,'pending',now()+interval '30 days'),
  ('+2348154936650','Jibril Abdullahi Onoruoiza','parent','none','Website Developer',null,
   '*',true,true,true,true,'pending',now()+interval '30 days')
on conflict(phone_e164) do update set
  full_name=excluded.full_name,
  intended_role=excluded.intended_role,
  leadership_scope=excluded.leadership_scope,
  position_title=excluded.position_title,
  class_code=excluded.class_code,
  subject=excluded.subject,
  developer_console=excluded.developer_console,
  developer_otp=excluded.developer_otp,
  developer_information=excluded.developer_information,
  developer_health=excluded.developer_health,
  status='pending',
  expires_at=excluded.expires_at,
  updated_at=now()
where public.portal_account_claims.status in ('pending','expired');

-- Expected authority model:
-- * Proprietress: owner-approved full-write authority. The existing internal
--   headmistress capability scope is intentionally reused while position_title
--   displays the truthful Proprietress title.
-- * Headmistress: full leadership authority plus Nursery 1 authorship scope.
-- * Assistant Headmistress: review authority plus Primary 4 authorship scope.
-- * Website Developer: no pupil/class assignment and no school admin role;
--   only the separately checked developer capabilities are granted.

commit;

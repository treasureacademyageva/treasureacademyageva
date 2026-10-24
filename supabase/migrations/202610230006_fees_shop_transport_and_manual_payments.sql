-- Treasure Academy fees, physical inventory, fulfilment, transport and manual payments
-- Date: 2026-10-23
--
-- Payment policy encoded here:
--   * parent-submitted bank-transfer notification, manually verified; or
--   * in-person physical school POS record, manually recorded by an administrator.
-- No card capture, payment gateway, WhatsApp evidence, automatic verification or
-- admission/result/promotion side effect exists in this migration.
--
-- Apply only after migrations 001-005, preservation exports and staging QA.

begin;

create or replace function public.full_parent_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'parent'::public.app_role
       and p.parent_stage = 'parent'
       and public.portal_account_can_access(p.id)
  ), false)
$$;
revoke all on function public.full_parent_access() from public, anon;
grant execute on function public.full_parent_access() to authenticated;

-- Owner-approved bank details are visible only after full parent sign-in and on
-- generated invoices. Values are deliberately absent from this migration.
create table if not exists public.school_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null check (char_length(trim(bank_name)) between 2 and 120),
  account_name text not null check (char_length(trim(account_name)) between 2 and 160),
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  active boolean not null default false,
  approved_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  approved_at timestamptz not null default now(),
  deactivated_by uuid references public.profiles(id) on delete restrict,
  deactivated_at timestamptz,
  deactivation_reason text check (deactivation_reason is null or char_length(trim(deactivation_reason)) between 3 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists one_active_school_bank_account
  on public.school_bank_accounts(active) where active = true;

create table if not exists public.fee_schedules (
  id uuid primary key default gen_random_uuid(),
  session_name text not null check (char_length(trim(session_name)) between 4 and 40),
  term_name text not null check (char_length(trim(term_name)) between 2 and 40),
  class_code text not null references public.class_progression(class_code) on delete restrict,
  title text not null check (char_length(trim(title)) between 2 and 160),
  due_date date,
  publication_status text not null default 'draft' check (publication_status in ('draft', 'published', 'retired')),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  published_by uuid references public.profiles(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_name, term_name, class_code)
);

create table if not exists public.fee_schedule_items (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.fee_schedules(id) on delete cascade,
  item_code text not null check (item_code ~ '^[A-Z0-9_-]{2,40}$'),
  label text not null check (char_length(trim(label)) between 2 and 160),
  charge_kind text not null check (charge_kind in (
    'tuition', 'examination', 'materials', 'activity', 'meal', 'transport', 'other'
  )),
  billing_mode text not null check (billing_mode in ('included', 'separate', 'not_applicable')),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (schedule_id, item_code),
  check ((billing_mode = 'separate' and amount > 0) or (billing_mode <> 'separate' and amount = 0))
);

create table if not exists public.legacy_fee_reconciliation (
  source_id text primary key,
  target_schedule_id uuid references public.fee_schedules(id) on delete restrict,
  target_item_id uuid references public.fee_schedule_items(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','mapped','owner_verified','excluded')),
  note text check (note is null or char_length(note) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pupil_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_reference text not null unique check (invoice_reference ~ '^TA-INV-[A-Z0-9-]{8,40}$'),
  student_id uuid not null references public.students(id) on delete restrict,
  schedule_id uuid references public.fee_schedules(id) on delete restrict,
  session_name text not null check (char_length(trim(session_name)) between 4 and 40),
  term_name text not null check (char_length(trim(term_name)) between 2 and 40),
  class_code text not null,
  title text not null check (char_length(trim(title)) between 2 and 160),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'issued' check (status in ('draft', 'issued', 'part_paid', 'paid', 'cancelled')),
  due_date date,
  issued_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid_amount <= total_amount)
);
create index if not exists pupil_invoices_student_idx
  on public.pupil_invoices(student_id, session_name, term_name, created_at desc);

create table if not exists public.pupil_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.pupil_invoices(id) on delete cascade,
  item_code text not null check (item_code ~ '^[A-Z0-9_-]{2,40}$'),
  label text not null check (char_length(trim(label)) between 2 and 160),
  charge_kind text not null check (charge_kind in (
    'tuition', 'examination', 'materials', 'activity', 'meal', 'transport', 'other'
  )),
  amount numeric(12,2) not null check (amount > 0),
  source_type text not null default 'fee_schedule' check (source_type in ('fee_schedule', 'transport', 'manual')),
  source_id uuid,
  unique (invoice_id, item_code)
);

-- Physical catalogue. Preserved former values are reconciled into inactive rows;
-- no product is visible to parents until an administrator verifies and activates it.
create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique check (product_code ~ '^[A-Z0-9_-]{2,50}$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text check (description is null or char_length(description) <= 1000),
  category text not null check (category in ('uniform', 'books', 'stationery', 'bag', 'art', 'other')),
  active boolean not null default false,
  reconciled boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.shop_products(id) on delete restrict,
  sku text not null unique check (sku ~ '^[A-Z0-9_-]{2,60}$'),
  variant_label text not null check (char_length(trim(variant_label)) between 1 and 120),
  size_label text check (size_label is null or char_length(trim(size_label)) <= 80),
  eligible_classes text[] not null default '{}',
  unit_price numeric(12,2) check (unit_price is null or unit_price > 0),
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0 and reserved <= on_hand),
  damaged integer not null default 0 check (damaged >= 0),
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0),
  active boolean not null default false,
  reconciled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, variant_label)
);

create table if not exists public.legacy_catalog_reconciliation (
  source_table text not null check (source_table in ('shop_items', 'uniform_items')),
  source_id text not null,
  target_product_id uuid references public.shop_products(id) on delete restrict,
  target_variant_id uuid references public.shop_variants(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'mapped', 'owner_verified', 'excluded')),
  note text check (note is null or char_length(note) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (source_table, source_id)
);

create table if not exists public.shop_price_events (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.shop_variants(id) on delete restrict,
  previous_price numeric(12,2),
  new_price numeric(12,2),
  actor_id uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_status_events (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.shop_products(id) on delete restrict,
  variant_id uuid references public.shop_variants(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  previous_active boolean,
  new_active boolean not null,
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique check (order_reference ~ '^TA-ORD-[A-Z0-9-]{8,40}$'),
  parent_id uuid not null references public.profiles(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  class_snapshot text not null,
  session_snapshot text not null,
  term_snapshot text,
  collection_method text not null check (collection_method in ('office', 'teacher_to_pupil')),
  status text not null default 'awaiting_payment' check (status in (
    'awaiting_payment', 'payment_submitted', 'paid_preparing',
    'ready_for_office', 'ready_for_teacher', 'collected', 'handed_to_pupil',
    'cancelled', 'returned', 'payment_reversed'
  )),
  total_amount numeric(12,2) not null default 0 check (total_amount > 0),
  reserved_until timestamptz,
  paid_at timestamptz,
  expected_ready_on date,
  released_by uuid references public.profiles(id) on delete restrict,
  released_at timestamptz,
  fulfilled_by uuid references public.profiles(id) on delete restrict,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shop_orders_parent_idx on public.shop_orders(parent_id, created_at desc);
create index if not exists shop_orders_student_idx on public.shop_orders(student_id, created_at desc);

create table if not exists public.shop_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  variant_id uuid not null references public.shop_variants(id) on delete restrict,
  product_name_snapshot text not null,
  variant_snapshot text not null,
  unit_price_snapshot numeric(12,2) not null check (unit_price_snapshot > 0),
  quantity integer not null check (quantity between 1 and 20),
  fulfilled_quantity integer not null default 0 check (fulfilled_quantity >= 0 and fulfilled_quantity <= quantity),
  unique (order_id, variant_id)
);

create table if not exists public.inventory_movements (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.shop_variants(id) on delete restrict,
  movement_kind text not null check (movement_kind in (
    'opening_balance', 'purchase_receipt', 'manual_adjustment', 'stocktake',
    'reservation', 'reservation_release', 'order_fulfilment',
    'return_to_stock', 'damaged_return', 'exchange_out', 'exchange_in'
  )),
  on_hand_delta integer not null default 0,
  reserved_delta integer not null default 0,
  damaged_delta integer not null default 0,
  resulting_on_hand integer not null check (resulting_on_hand >= 0),
  resulting_reserved integer not null check (resulting_reserved >= 0),
  resulting_damaged integer not null default 0 check (resulting_damaged >= 0),
  order_id uuid references public.shop_orders(id) on delete restrict,
  order_line_id uuid references public.shop_order_lines(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete restrict,
  actor_type text not null default 'user' check (actor_type in ('user', 'system')),
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  check (on_hand_delta <> 0 or reserved_delta <> 0 or damaged_delta <> 0),
  check ((actor_type = 'user' and actor_id is not null) or (actor_type = 'system' and actor_id is null))
);
create index if not exists inventory_movements_variant_idx
  on public.inventory_movements(variant_id, created_at desc);

create table if not exists public.stocktakes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  note text check (note is null or char_length(note) <= 1000),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id) on delete restrict,
  closed_at timestamptz
);
create unique index if not exists one_open_stocktake
  on public.stocktakes ((true)) where status = 'open';
create table if not exists public.stocktake_lines (
  stocktake_id uuid not null references public.stocktakes(id) on delete cascade,
  variant_id uuid not null references public.shop_variants(id) on delete restrict,
  expected_on_hand integer not null check (expected_on_hand >= 0),
  actual_on_hand integer check (actual_on_hand is null or actual_on_hand >= 0),
  note text check (note is null or char_length(note) <= 500),
  primary key (stocktake_id, variant_id)
);

create table if not exists public.restock_requests (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  product_id uuid not null references public.shop_products(id) on delete restrict,
  variant_label text check (variant_label is null or char_length(trim(variant_label)) <= 120),
  requested_quantity integer not null default 1 check (requested_quantity between 1 and 20),
  status text not null default 'requested' check (status in (
    'requested', 'reviewing', 'procurement_planned', 'available',
    'parent_confirmed', 'closed', 'cancelled'
  )),
  parent_confirmed_at timestamptz,
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists restock_requests_status_idx on public.restock_requests(status, created_at);

create table if not exists public.procurement_batches (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  status text not null default 'draft' check (status in ('draft', 'ordered', 'part_received', 'received', 'cancelled')),
  supplier_note text check (supplier_note is null or char_length(supplier_note) <= 1000),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  ordered_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.procurement_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.procurement_batches(id) on delete cascade,
  variant_id uuid not null references public.shop_variants(id) on delete restrict,
  ordered_quantity integer not null check (ordered_quantity > 0),
  received_quantity integer not null default 0 check (received_quantity >= 0 and received_quantity <= ordered_quantity),
  unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  unique (batch_id, variant_id)
);

create table if not exists public.return_exchange_requests (
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique,
  order_line_id uuid not null references public.shop_order_lines(id) on delete restrict,
  parent_id uuid not null references public.profiles(id) on delete restrict,
  request_kind text not null check (request_kind in ('return', 'exchange')),
  requested_quantity integer not null check (requested_quantity > 0),
  requested_variant_id uuid references public.shop_variants(id) on delete restrict,
  parent_reason text not null check (char_length(trim(parent_reason)) between 3 and 1000),
  status text not null default 'requested' check (status in (
    'requested', 'inspection_required', 'approved', 'declined', 'completed', 'cancelled'
  )),
  inspection_result text check (inspection_result is null or inspection_result in (
    'resellable', 'damaged', 'not_returned', 'not_eligible'
  )),
  monetary_adjustment numeric(12,2) not null default 0,
  office_note text check (office_note is null or char_length(office_note) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Transport remains a capacity-approved service, never inventory.
create table if not exists public.transport_services (
  id uuid primary key default gen_random_uuid(),
  route_code text not null unique,
  route_name text not null check (char_length(trim(route_name)) between 2 and 160),
  session_name text not null check (char_length(trim(session_name)) between 4 and 40),
  term_name text not null check (char_length(trim(term_name)) between 2 and 40),
  term_amount numeric(12,2) check (term_amount is null or term_amount > 0),
  capacity integer check (capacity is null or capacity > 0),
  approved_count integer not null default 0 check (approved_count >= 0),
  active boolean not null default false,
  reconciled boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (capacity is null or approved_count <= capacity)
);

create table if not exists public.legacy_transport_reconciliation (
  source_id text primary key,
  target_service_id uuid references public.transport_services(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','mapped','owner_verified','excluded')),
  note text check (note is null or char_length(note)<=1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.transport_requests (
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique,
  parent_id uuid not null references public.profiles(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  service_id uuid references public.transport_services(id) on delete restrict,
  general_area text not null check (char_length(trim(general_area)) between 2 and 240),
  status text not null default 'requested' check (status in (
    'requested', 'reviewing', 'approved', 'waitlisted', 'declined', 'cancelled'
  )),
  office_note text check (office_note is null or char_length(office_note) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  invoice_id uuid references public.pupil_invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.manual_payments (
  id uuid primary key default gen_random_uuid(),
  payment_reference text not null unique check (payment_reference ~ '^TA-PAY-[A-Z0-9-]{8,40}$'),
  invoice_id uuid references public.pupil_invoices(id) on delete restrict,
  order_id uuid references public.shop_orders(id) on delete restrict,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  method text not null check (method in ('bank_transfer', 'physical_pos')),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'submitted' check (status in (
    'submitted', 'under_review', 'verified', 'rejected', 'reversed'
  )),
  payer_name text not null check (char_length(trim(payer_name)) between 2 and 160),
  sender_bank_name text,
  external_reference text,
  stated_paid_at timestamptz,
  terminal_reference text,
  bank_account_id uuid references public.school_bank_accounts(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  reversed_by uuid references public.profiles(id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text check (reversal_reason is null or char_length(reversal_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((invoice_id is not null)::integer + (order_id is not null)::integer = 1),
  check (
    (method = 'bank_transfer' and sender_bank_name is not null and external_reference is not null and stated_paid_at is not null and terminal_reference is null)
    or (method = 'physical_pos' and terminal_reference is not null and sender_bank_name is null and stated_paid_at is not null)
  )
);
create unique index if not exists manual_payments_bank_reference_idx
  on public.manual_payments(lower(sender_bank_name), lower(external_reference))
  where method = 'bank_transfer' and status <> 'rejected';
create unique index if not exists manual_payments_pos_reference_idx
  on public.manual_payments(lower(terminal_reference))
  where method = 'physical_pos' and status <> 'rejected';

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_reference text not null unique check (receipt_reference ~ '^TA-RCP-[A-Z0-9-]{8,40}$'),
  payment_id uuid not null unique references public.manual_payments(id) on delete restrict,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  issued_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversal_reason text
);

create table if not exists public.finance_events (
  id bigint generated always as identity primary key,
  payment_id uuid references public.manual_payments(id) on delete restrict,
  invoice_id uuid references public.pupil_invoices(id) on delete restrict,
  order_id uuid references public.shop_orders(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in (
    'invoice_issued', 'invoice_cancelled', 'payment_submitted', 'payment_under_review',
    'payment_verified', 'payment_rejected', 'payment_reversed', 'receipt_issued',
    'return_exchange_completed'
  )),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.parent_shop_products()
returns table(id uuid, product_code text, name text, description text, category text, active boolean, reconciled boolean)
language sql
stable
security definer
set search_path=''
as $$
  select p.id,p.product_code,p.name,p.description,p.category,p.active,p.reconciled
    from public.shop_products p
   where public.full_parent_access() and p.active=true and p.reconciled=true
   order by p.name
$$;
revoke all on function public.parent_shop_products() from public,anon;
grant execute on function public.parent_shop_products() to authenticated;

create or replace function public.parent_transport_services()
returns table(id uuid,route_code text,route_name text,session_name text,term_name text,term_amount numeric,active boolean,reconciled boolean)
language sql
stable
security definer
set search_path=''
as $$
  select s.id,s.route_code,s.route_name,s.session_name,s.term_name,s.term_amount,s.active,s.reconciled
    from public.transport_services s
   where public.full_parent_access() and s.active=true and s.reconciled=true and s.term_amount is not null
   order by s.route_name
$$;
revoke all on function public.parent_transport_services() from public,anon;
grant execute on function public.parent_transport_services() to authenticated;

create or replace function public.parent_shop_variants()
returns table(id uuid,product_id uuid,sku text,variant_label text,size_label text,eligible_classes text[],unit_price numeric,available integer,active boolean,reconciled boolean)
language sql
stable
security definer
set search_path=''
as $$
  select v.id,v.product_id,v.sku,v.variant_label,v.size_label,v.eligible_classes,v.unit_price,
         greatest(v.on_hand-v.reserved,0),v.active,v.reconciled
    from public.shop_variants v join public.shop_products p on p.id=v.product_id
   where public.full_parent_access() and v.active=true and v.reconciled=true
     and p.active=true and p.reconciled=true and v.unit_price is not null
   order by p.name,v.variant_label
$$;
revoke all on function public.parent_shop_variants() from public,anon;
grant execute on function public.parent_shop_variants() to authenticated;

-- Readable low-stock projection; no browser writes and no automatic ordering.
create or replace view public.inventory_low_stock
with (security_invoker = true)
as
select v.id as variant_id, p.name as product_name, v.variant_label, v.size_label,
       v.sku, v.on_hand, v.reserved, (v.on_hand - v.reserved) as available,
       v.low_stock_threshold
  from public.shop_variants v
  join public.shop_products p on p.id = v.product_id
 where v.active = true and p.active = true
   and (v.on_hand - v.reserved) <= v.low_stock_threshold;

create or replace function public.shop_order_access(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.shop_orders o
     where o.id = p_order_id and (
       public.is_admin()
       or (o.parent_id = (select auth.uid()) and public.full_parent_access())
     )
  ), false)
$$;
revoke all on function public.shop_order_access(uuid) from public, anon;
grant execute on function public.shop_order_access(uuid) to authenticated;

-- Teachers receive only class-assigned handover fields through these narrow
-- projections. They never receive order totals, parent IDs, prices or payment
-- references from the base order tables.
create or replace function public.parent_manual_payments()
returns table(
  id uuid,payment_reference text,invoice_id uuid,order_id uuid,method text,amount numeric,status text,
  payer_name text,sender_bank_name text,external_reference text,stated_paid_at timestamptz,
  terminal_reference text,reviewed_at timestamptz,reversed_at timestamptz,reversal_reason text,
  created_at timestamptz,updated_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select m.id,m.payment_reference,m.invoice_id,m.order_id,m.method,m.amount,m.status,
         m.payer_name,m.sender_bank_name,m.external_reference,m.stated_paid_at,
         m.terminal_reference,m.reviewed_at,m.reversed_at,m.reversal_reason,m.created_at,m.updated_at
    from public.manual_payments m
   where public.full_parent_access() and (
     (m.invoice_id is not null and exists(
       select 1 from public.pupil_invoices i where i.id=m.invoice_id and public.parent_can_access_student(i.student_id)
     )) or (m.order_id is not null and exists(
       select 1 from public.shop_orders o where o.id=m.order_id and public.parent_can_access_student(o.student_id)
     ))
   )
   order by m.created_at
$$;
revoke all on function public.parent_manual_payments() from public,anon;
grant execute on function public.parent_manual_payments() to authenticated;

create or replace function public.parent_payment_receipts()
returns table(id uuid,receipt_reference text,payment_id uuid,issued_at timestamptz,reversed_at timestamptz,reversal_reason text)
language sql
stable
security definer
set search_path=''
as $$
  select r.id,r.receipt_reference,r.payment_id,r.issued_at,r.reversed_at,r.reversal_reason
    from public.payment_receipts r
    join public.manual_payments m on m.id=r.payment_id
   where public.full_parent_access() and (
     (m.invoice_id is not null and exists(
       select 1 from public.pupil_invoices i where i.id=m.invoice_id and public.parent_can_access_student(i.student_id)
     )) or (m.order_id is not null and exists(
       select 1 from public.shop_orders o where o.id=m.order_id and public.parent_can_access_student(o.student_id)
     ))
   )
   order by r.issued_at
$$;
revoke all on function public.parent_payment_receipts() from public,anon;
grant execute on function public.parent_payment_receipts() to authenticated;

create or replace function public.teacher_collection_orders()
returns table(
  id uuid, order_reference text, student_id uuid, class_snapshot text,
  collection_method text, status text, expected_ready_on date,
  released_at timestamptz, fulfilled_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.order_reference, o.student_id, o.class_snapshot,
         o.collection_method, o.status, o.expected_ready_on,
         o.released_at, o.fulfilled_at, o.created_at
    from public.shop_orders o
   where public.current_user_role() = 'teacher'::public.app_role
     and public.portal_account_can_access((select auth.uid()))
     and o.collection_method = 'teacher_to_pupil'
     and o.status in ('ready_for_teacher', 'handed_to_pupil')
     and exists (
       select 1 from public.teacher_class_assignments a
        where a.teacher_id = (select auth.uid()) and a.active = true
          and a.class_code = o.class_snapshot
     )
   order by o.created_at desc
$$;
revoke all on function public.teacher_collection_orders() from public, anon;
grant execute on function public.teacher_collection_orders() to authenticated;

create or replace function public.teacher_collection_order_lines()
returns table(
  id uuid, order_id uuid, product_name_snapshot text,
  variant_snapshot text, quantity integer, fulfilled_quantity integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.order_id, l.product_name_snapshot,
         l.variant_snapshot, l.quantity, l.fulfilled_quantity
    from public.shop_order_lines l
    join public.shop_orders o on o.id = l.order_id
   where public.current_user_role() = 'teacher'::public.app_role
     and public.portal_account_can_access((select auth.uid()))
     and o.collection_method = 'teacher_to_pupil'
     and o.status in ('ready_for_teacher', 'handed_to_pupil')
     and exists (
       select 1 from public.teacher_class_assignments a
        where a.teacher_id = (select auth.uid()) and a.active = true
          and a.class_code = o.class_snapshot
     )
   order by l.product_name_snapshot
$$;
revoke all on function public.teacher_collection_order_lines() from public, anon;
grant execute on function public.teacher_collection_order_lines() to authenticated;

create or replace function public.next_school_workday(p_from date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare v_day date := p_from + 1;
begin
  while extract(isodow from v_day) in (6,7) loop v_day := v_day + 1; end loop;
  return v_day;
end;
$$;

create or replace function public.set_active_school_bank_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_headmistress() then raise exception 'Headmistress required' using errcode='42501'; end if;
  if not exists(select 1 from public.school_bank_accounts where id=p_account_id) then raise exception 'Bank account not found' using errcode='P0002'; end if;
  update public.school_bank_accounts set active=false,updated_at=now() where active=true;
  update public.school_bank_accounts set active=true,approved_by=(select auth.uid()),approved_at=now(),
    deactivated_by=null,deactivated_at=null,deactivation_reason=null,updated_at=now() where id=p_account_id;
end;
$$;
revoke all on function public.set_active_school_bank_account(uuid) from public,anon;
grant execute on function public.set_active_school_bank_account(uuid) to authenticated;

create or replace function public.disable_active_school_bank_account(p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_headmistress() or char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Headmistress and deactivation reason required' using errcode='42501';
  end if;
  update public.school_bank_accounts set active=false,deactivated_by=(select auth.uid()),
    deactivated_at=now(),deactivation_reason=trim(p_reason),updated_at=now() where active=true;
  if not found then raise exception 'No active bank account found' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.disable_active_school_bank_account(text) from public,anon;
grant execute on function public.disable_active_school_bank_account(text) to authenticated;

create or replace function public.create_invoices_for_fee_schedule(p_schedule_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.fee_schedules%rowtype;
  v_student record;
  v_invoice uuid;
  v_total numeric(12,2);
  v_count integer := 0;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  select * into v_schedule from public.fee_schedules where id = p_schedule_id for update;
  if not found or v_schedule.publication_status not in ('draft','published') then
    raise exception 'A draft or published fee schedule is required' using errcode = '22023';
  end if;
  if v_schedule.publication_status='draft' then
    update public.fee_schedules set publication_status='published',published_by=(select auth.uid()),
      published_at=now(),updated_at=now() where id=p_schedule_id;
    v_schedule.publication_status:='published';
  end if;
  select coalesce(sum(amount),0) into v_total from public.fee_schedule_items
   where schedule_id = p_schedule_id and billing_mode = 'separate';
  if v_total <= 0 then raise exception 'Schedule has no separately billable items' using errcode = '22023'; end if;
  for v_student in select s.id from public.students s
    where s.active = true and s.admission_status = 'admitted'::public.admission_status
      and s.class_code = v_schedule.class_code
  loop
    if not exists (select 1 from public.pupil_invoices i where i.student_id = v_student.id and i.schedule_id = p_schedule_id and i.status <> 'cancelled') then
      insert into public.pupil_invoices(
        invoice_reference, student_id, schedule_id, session_name, term_name,
        class_code, title, total_amount, status, due_date, issued_by
      ) values (
        'TA-INV-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
        v_student.id, p_schedule_id, v_schedule.session_name, v_schedule.term_name,
        v_schedule.class_code, v_schedule.title, v_total, 'issued', v_schedule.due_date, (select auth.uid())
      ) returning id into v_invoice;
      insert into public.pupil_invoice_items(invoice_id, item_code, label, charge_kind, amount)
      select v_invoice, item_code, label, charge_kind, amount from public.fee_schedule_items
       where schedule_id = p_schedule_id and billing_mode = 'separate';
      insert into public.finance_events(invoice_id, actor_id, event_type)
      values (v_invoice, (select auth.uid()), 'invoice_issued');
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.create_invoices_for_fee_schedule(uuid) from public, anon;
grant execute on function public.create_invoices_for_fee_schedule(uuid) to authenticated;

create or replace function public.cancel_pupil_invoice(p_invoice_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Administrator and cancellation reason required' using errcode='42501';
  end if;
  update public.pupil_invoices set status='cancelled',updated_at=now()
   where id=p_invoice_id and status in ('draft','issued','part_paid') and paid_amount=0
     and not exists(select 1 from public.pupil_invoice_items l where l.invoice_id=p_invoice_id and l.source_type='transport')
     and not exists(select 1 from public.manual_payments m where m.invoice_id=p_invoice_id and m.status in ('submitted','under_review','verified'));
  if not found then raise exception 'Only an unpaid invoice without an open payment may be cancelled' using errcode='22023'; end if;
  insert into public.finance_events(invoice_id,actor_id,event_type,detail)
  values(p_invoice_id,(select auth.uid()),'invoice_cancelled',jsonb_build_object('reason',trim(p_reason)));
end;
$$;
revoke all on function public.cancel_pupil_invoice(uuid,text) from public,anon;
grant execute on function public.cancel_pupil_invoice(uuid,text) to authenticated;

create or replace function public.place_shop_order(
  p_student_id uuid,
  p_collection_method text,
  p_session_name text,
  p_term_name text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent uuid := (select auth.uid());
  v_student public.students%rowtype;
  v_order uuid;
  v_ref text;
  v_item jsonb;
  v_variant public.shop_variants%rowtype;
  v_product public.shop_products%rowtype;
  v_qty integer;
  v_total numeric(12,2) := 0;
  v_line uuid;
begin
  if not public.full_parent_access() or not public.parent_can_access_student(p_student_id) then
    raise exception 'Linked parent access required' using errcode = '42501';
  end if;
  if p_collection_method not in ('office', 'teacher_to_pupil')
     or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 20
     or char_length(trim(coalesce(p_session_name,''))) not between 4 and 40 then
    raise exception 'Invalid order details' using errcode = '22023';
  end if;
  select * into v_student from public.students where id = p_student_id and active = true;
  if not found then raise exception 'Active linked pupil required' using errcode = '22023'; end if;
  v_ref := 'TA-ORD-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.shop_orders(
    order_reference, parent_id, student_id, class_snapshot, session_snapshot,
    term_snapshot, collection_method, total_amount, reserved_until
  ) values (v_ref, v_parent, p_student_id, v_student.class_code, trim(p_session_name),
    nullif(trim(p_term_name),''), p_collection_method, 1, now() + interval '3 days')
  returning id into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin v_qty := (v_item->>'quantity')::integer; exception when others then raise exception 'Invalid order quantity' using errcode = '22023'; end;
    if v_qty not between 1 and 20 then raise exception 'Invalid order quantity' using errcode = '22023'; end if;
    select v.* into v_variant from public.shop_variants v where v.id = (v_item->>'variant_id')::uuid for update;
    if not found or not v_variant.active or v_variant.unit_price is null or v_variant.reconciled <> true
       or v_variant.on_hand - v_variant.reserved < v_qty then
      raise exception 'Item is unavailable; use a restock request instead' using errcode = '22023';
    end if;
    select * into v_product from public.shop_products p where p.id = v_variant.product_id and p.active = true and p.reconciled = true;
    if not found then raise exception 'Product is not available for ordering' using errcode = '22023'; end if;
    if cardinality(v_variant.eligible_classes) > 0 and not (v_student.class_code = any(v_variant.eligible_classes)) then
      raise exception 'Item does not apply to this pupil class' using errcode = '22023';
    end if;
    if exists (select 1 from public.shop_order_lines l where l.order_id = v_order and l.variant_id = v_variant.id) then
      raise exception 'Duplicate item in order' using errcode = '22023';
    end if;
    insert into public.shop_order_lines(order_id, variant_id, product_name_snapshot, variant_snapshot, unit_price_snapshot, quantity)
    values (v_order, v_variant.id, v_product.name, v_variant.variant_label, v_variant.unit_price, v_qty)
    returning id into v_line;
    update public.shop_variants set reserved = reserved + v_qty, updated_at = now() where id = v_variant.id;
    insert into public.inventory_movements(
      variant_id, movement_kind, reserved_delta, resulting_on_hand, resulting_reserved,
      resulting_damaged, order_id, order_line_id, actor_id, reason, idempotency_key
    ) values (
      v_variant.id, 'reservation', v_qty, v_variant.on_hand, v_variant.reserved + v_qty,
      v_variant.damaged, v_order, v_line, v_parent, 'Parent order reservation', 'reserve:' || v_line::text
    );
    v_total := v_total + (v_variant.unit_price * v_qty);
  end loop;
  update public.shop_orders set total_amount = v_total where id = v_order;
  return jsonb_build_object('order_id', v_order, 'order_reference', v_ref, 'total_amount', v_total);
end;
$$;
revoke all on function public.place_shop_order(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.place_shop_order(uuid, text, text, text, jsonb) to authenticated;

create or replace function public.request_restock(
  p_student_id uuid,
  p_product_id uuid,
  p_variant_label text,
  p_quantity integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.full_parent_access() or not public.parent_can_access_student(p_student_id) then
    raise exception 'Linked parent access required' using errcode = '42501';
  end if;
  if p_quantity not between 1 and 20 or not exists (
    select 1 from public.shop_products p where p.id = p_product_id and p.reconciled = true
  ) then raise exception 'Invalid restock request' using errcode = '22023'; end if;
  insert into public.restock_requests(parent_id, student_id, product_id, variant_label, requested_quantity)
  values ((select auth.uid()), p_student_id, p_product_id, nullif(trim(p_variant_label),''), p_quantity)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.request_restock(uuid, uuid, text, integer) from public, anon;
grant execute on function public.request_restock(uuid, uuid, text, integer) to authenticated;

create or replace function public.verify_catalog_variant(
  p_product_id uuid,
  p_variant_id uuid,
  p_unit_price numeric,
  p_low_stock_threshold integer
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_previous boolean;
begin
  if not public.is_admin() or p_unit_price<=0 or p_low_stock_threshold<0 then
    raise exception 'Administrator and verified catalogue values required' using errcode='42501';
  end if;
  select v.active into v_previous from public.shop_variants v
   where v.id=p_variant_id and v.product_id=p_product_id for update;
  if not found then raise exception 'Matching product and variant required' using errcode='22023'; end if;
  if not exists(select 1 from public.shop_products p where p.id=p_product_id for update) then
    raise exception 'Matching product required' using errcode='22023';
  end if;
  update public.shop_products set reconciled=true,active=true,updated_at=now() where id=p_product_id;
  update public.shop_variants set unit_price=p_unit_price,low_stock_threshold=p_low_stock_threshold,
    reconciled=true,active=true,updated_at=now() where id=p_variant_id and product_id=p_product_id;
  insert into public.catalog_status_events(product_id,variant_id,actor_id,previous_active,new_active,reason)
  values(p_product_id,p_variant_id,(select auth.uid()),v_previous,true,'Owner-verified catalogue activation');
end;
$$;
revoke all on function public.verify_catalog_variant(uuid,uuid,numeric,integer) from public,anon;
grant execute on function public.verify_catalog_variant(uuid,uuid,numeric,integer) to authenticated;

create or replace function public.set_catalog_variant_active(
  p_variant_id uuid,p_active boolean,p_reason text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v public.shop_variants%rowtype;
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Administrator and status reason required' using errcode='42501';
  end if;
  select * into v from public.shop_variants where id=p_variant_id for update;
  if not found then raise exception 'Variant not found' using errcode='P0002'; end if;
  if p_active and (not v.reconciled or v.unit_price is null or not exists(
    select 1 from public.shop_products p where p.id=v.product_id and p.reconciled=true
  )) then raise exception 'Only a reconciled priced variant may be activated' using errcode='22023'; end if;
  update public.shop_variants set active=p_active,updated_at=now() where id=p_variant_id;
  if p_active then
    update public.shop_products set active=true,updated_at=now() where id=v.product_id;
  elsif not exists(select 1 from public.shop_variants x where x.product_id=v.product_id and x.id<>p_variant_id and x.active=true) then
    update public.shop_products set active=false,updated_at=now() where id=v.product_id;
  end if;
  insert into public.catalog_status_events(product_id,variant_id,actor_id,previous_active,new_active,reason)
  values(v.product_id,p_variant_id,(select auth.uid()),v.active,p_active,trim(p_reason));
end;
$$;
revoke all on function public.set_catalog_variant_active(uuid,boolean,text) from public,anon;
grant execute on function public.set_catalog_variant_active(uuid,boolean,text) to authenticated;

create or replace function public.record_inventory_adjustment(
  p_variant_id uuid,
  p_delta integer,
  p_reason text,
  p_kind text default 'manual_adjustment'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v public.shop_variants%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  if p_delta = 0 or char_length(trim(coalesce(p_reason,''))) < 3
     or p_kind not in ('opening_balance','manual_adjustment') then
    raise exception 'Valid quantity change and reason required' using errcode = '22023';
  end if;
  select * into v from public.shop_variants where id = p_variant_id for update;
  if not found or v.on_hand + p_delta < v.reserved or v.on_hand + p_delta < 0 then
    raise exception 'Adjustment would make available stock negative' using errcode = '22023';
  end if;
  update public.shop_variants set on_hand = on_hand + p_delta, updated_at = now() where id = p_variant_id;
  insert into public.inventory_movements(
    variant_id, movement_kind, on_hand_delta, resulting_on_hand, resulting_reserved,
    resulting_damaged, actor_id, reason
  ) values (p_variant_id, p_kind, p_delta, v.on_hand + p_delta, v.reserved,
    v.damaged, (select auth.uid()), trim(p_reason));
end;
$$;
revoke all on function public.record_inventory_adjustment(uuid, integer, text, text) from public, anon;
grant execute on function public.record_inventory_adjustment(uuid, integer, text, text) to authenticated;

create or replace function public.cancel_shop_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.shop_orders%rowtype;
  v_line record;
  v_variant public.shop_variants%rowtype;
begin
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Cancellation reason required' using errcode='22023'; end if;
  select * into v_order from public.shop_orders where id=p_order_id for update;
  if not found or v_order.status not in ('awaiting_payment','payment_submitted','payment_reversed') then
    raise exception 'Only an unfulfilled unpaid order may be cancelled' using errcode='22023';
  end if;
  if not (public.is_admin() or coalesce((select auth.role()),'')='service_role'
    or (v_order.parent_id=(select auth.uid()) and public.full_parent_access())) then
    raise exception 'Order cancellation not authorised' using errcode='42501';
  end if;
  if exists(select 1 from public.manual_payments where order_id=p_order_id and status='verified') then
    raise exception 'A verified payment requires Headmistress reversal before cancellation' using errcode='42501';
  end if;
  for v_line in select * from public.shop_order_lines where order_id=p_order_id for update loop
    select * into v_variant from public.shop_variants where id=v_line.variant_id for update;
    if v_variant.reserved<v_line.quantity then raise exception 'Reserved inventory is inconsistent' using errcode='23514'; end if;
    update public.shop_variants set reserved=reserved-v_line.quantity,updated_at=now() where id=v_variant.id;
    insert into public.inventory_movements(variant_id,movement_kind,reserved_delta,resulting_on_hand,resulting_reserved,resulting_damaged,
      order_id,order_line_id,actor_id,actor_type,reason,idempotency_key)
    values(v_variant.id,'reservation_release',-v_line.quantity,v_variant.on_hand,v_variant.reserved-v_line.quantity,v_variant.damaged,
      p_order_id,v_line.id,case when coalesce((select auth.role()),'')='service_role' then null else (select auth.uid()) end,
      case when coalesce((select auth.role()),'')='service_role' then 'system' else 'user' end,
      trim(p_reason),'cancel:'||v_line.id::text);
  end loop;
  update public.shop_orders set status='cancelled',updated_at=now() where id=p_order_id;
end;
$$;
revoke all on function public.cancel_shop_order(uuid,text) from public,anon;
grant execute on function public.cancel_shop_order(uuid,text) to authenticated;

create or replace function public.release_expired_shop_reservations()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_order record; v_count integer:=0;
begin
  if not (public.is_admin() or coalesce((select auth.role()),'')='service_role') then
    raise exception 'Administrator or service role required' using errcode='42501';
  end if;
  for v_order in select id from public.shop_orders where reserved_until<now() and status='awaiting_payment' order by reserved_until for update skip locked loop
    perform public.cancel_shop_order(v_order.id,'Unpaid reservation expired');
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.release_expired_shop_reservations() from public,anon;
grant execute on function public.release_expired_shop_reservations() to authenticated,service_role;

create or replace function public.advance_shop_order(p_order_id uuid, p_action text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.shop_orders%rowtype;
  v_line record;
  v_variant public.shop_variants%rowtype;
  v_actor uuid := (select auth.uid());
begin
  select * into v_order from public.shop_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if char_length(trim(coalesce(p_note,''))) < 3 then raise exception 'Action note required' using errcode = '22023'; end if;
  if p_action = 'ready' then
    if not public.is_admin() or v_order.status <> 'paid_preparing' then raise exception 'Paid preparing order required' using errcode = '42501'; end if;
    update public.shop_orders set
      status = case collection_method when 'office' then 'ready_for_office' else 'ready_for_teacher' end,
      released_by = v_actor, released_at = now(), updated_at = now()
     where id = p_order_id;
    return;
  end if;
  if p_action = 'fulfil' then
    if not (
      (public.is_admin() and v_order.status = 'ready_for_office' and v_order.collection_method = 'office')
      or (public.current_user_role() = 'teacher'::public.app_role and v_order.status = 'ready_for_teacher'
          and v_order.collection_method = 'teacher_to_pupil' and exists (
            select 1 from public.teacher_class_assignments a
             where a.teacher_id = v_actor and a.active = true and a.class_code = v_order.class_snapshot
          ))
    ) then raise exception 'Order is not authorised for this handover' using errcode = '42501'; end if;
    for v_line in select * from public.shop_order_lines where order_id = p_order_id for update
    loop
      select * into v_variant from public.shop_variants where id = v_line.variant_id for update;
      if v_variant.on_hand < v_line.quantity or v_variant.reserved < v_line.quantity then
        raise exception 'Reserved inventory is inconsistent' using errcode = '23514';
      end if;
      update public.shop_variants set on_hand = on_hand - v_line.quantity,
        reserved = reserved - v_line.quantity, updated_at = now() where id = v_line.variant_id;
      update public.shop_order_lines set fulfilled_quantity = quantity where id = v_line.id;
      insert into public.inventory_movements(
        variant_id, movement_kind, on_hand_delta, reserved_delta, resulting_on_hand,
        resulting_reserved, resulting_damaged, order_id, order_line_id, actor_id, reason, idempotency_key
      ) values (
        v_line.variant_id, 'order_fulfilment', -v_line.quantity, -v_line.quantity,
        v_variant.on_hand - v_line.quantity, v_variant.reserved - v_line.quantity,
        v_variant.damaged, p_order_id, v_line.id, v_actor, trim(p_note), 'fulfil:' || v_line.id::text
      );
    end loop;
    update public.shop_orders set
      status = case collection_method when 'office' then 'collected' else 'handed_to_pupil' end,
      fulfilled_by = v_actor, fulfilled_at = now(), updated_at = now()
     where id = p_order_id;
    return;
  end if;
  raise exception 'Invalid order action' using errcode = '22023';
end;
$$;
revoke all on function public.advance_shop_order(uuid, text, text) from public, anon;
grant execute on function public.advance_shop_order(uuid, text, text) to authenticated;

create or replace function public.request_return_exchange(
  p_order_line_id uuid,
  p_kind text,
  p_quantity integer,
  p_requested_variant_id uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.shop_order_lines%rowtype;
  v_order public.shop_orders%rowtype;
  v_ref text;
begin
  if p_kind not in ('return','exchange') or p_quantity <= 0 or char_length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'Invalid return or exchange request' using errcode = '22023';
  end if;
  select * into v_line from public.shop_order_lines where id = p_order_line_id for update;
  if not found or p_quantity > v_line.fulfilled_quantity then raise exception 'Fulfilled order line required' using errcode = '22023'; end if;
  if coalesce((
    select sum(r.requested_quantity) from public.return_exchange_requests r
     where r.order_line_id = p_order_line_id and r.status not in ('declined','cancelled')
  ), 0) + p_quantity > v_line.fulfilled_quantity then
    raise exception 'Requested return or exchange quantity exceeds fulfilled quantity' using errcode = '23514';
  end if;
  select * into v_order from public.shop_orders where id = v_line.order_id;
  if v_order.parent_id <> (select auth.uid()) or v_order.status not in ('collected','handed_to_pupil') then
    raise exception 'Only the linked purchasing parent may request a return' using errcode = '42501';
  end if;
  if p_kind = 'exchange' and p_requested_variant_id is null then raise exception 'Exchange variant required' using errcode = '22023'; end if;
  v_ref := 'TA-RET-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.return_exchange_requests(
    request_reference, order_line_id, parent_id, request_kind, requested_quantity,
    requested_variant_id, parent_reason
  ) values (v_ref, p_order_line_id, (select auth.uid()), p_kind, p_quantity, p_requested_variant_id, trim(p_reason));
  return v_ref;
end;
$$;
revoke all on function public.request_return_exchange(uuid, text, integer, uuid, text) from public, anon;
grant execute on function public.request_return_exchange(uuid, text, integer, uuid, text) to authenticated;

create or replace function public.review_restock_request(
  p_request_id uuid,
  p_status text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v public.restock_requests%rowtype;
begin
  if not public.is_admin() or p_status not in ('reviewing','procurement_planned','available','closed','cancelled')
     or char_length(trim(coalesce(p_note,''))) < 3 then
    raise exception 'Administrator, valid status and note required' using errcode = '42501';
  end if;
  select * into v from public.restock_requests where id=p_request_id for update;
  if not found then raise exception 'Restock request not found' using errcode='P0002'; end if;
  if p_status='available' and not exists(
    select 1 from public.shop_variants sv join public.shop_products sp on sp.id=sv.product_id
     where sv.product_id=v.product_id and sv.active=true and sv.reconciled=true
       and sp.active=true and sp.reconciled=true and sv.on_hand-sv.reserved>0
       and (v.variant_label is null or lower(trim(v.variant_label)) in (
         lower(trim(sv.variant_label)),lower(trim(coalesce(sv.size_label,'')))
       ))
  ) then raise exception 'Matching verified stock is not available' using errcode='22023'; end if;
  update public.restock_requests set status=p_status, admin_note=trim(p_note), updated_at=now() where id=p_request_id;
  if p_status='available' and v.status<>'available' then
    insert into public.portal_notifications(recipient_id,student_id,kind,title,message)
    values (v.parent_id,v.student_id,'restock','Requested item may now be available',
      'The school marked your supply request as available. Confirm in the portal before placing an order; no charge or reservation has been created.');
  end if;
end;
$$;
revoke all on function public.review_restock_request(uuid,text,text) from public,anon;
grant execute on function public.review_restock_request(uuid,text,text) to authenticated;

create or replace function public.confirm_restock_interest(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.restock_requests set status='parent_confirmed',parent_confirmed_at=now(),updated_at=now()
   where id=p_request_id and parent_id=(select auth.uid()) and status='available';
  if not found then raise exception 'Available parent request required' using errcode='42501'; end if;
end;
$$;
revoke all on function public.confirm_restock_interest(uuid) from public,anon;
grant execute on function public.confirm_restock_interest(uuid) to authenticated;

create or replace function public.cancel_parent_request(p_request_type text,p_request_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.full_parent_access() or p_request_type not in ('restock','return_exchange','transport') then
    raise exception 'Active parent request required' using errcode='42501';
  end if;
  if p_request_type='restock' then
    update public.restock_requests set status='cancelled',updated_at=now()
     where id=p_request_id and parent_id=(select auth.uid())
       and status in ('requested','reviewing','procurement_planned','available','parent_confirmed');
  elsif p_request_type='return_exchange' then
    update public.return_exchange_requests set status='cancelled',updated_at=now()
     where id=p_request_id and parent_id=(select auth.uid()) and status='requested';
  else
    update public.transport_requests set status='cancelled',updated_at=now()
     where id=p_request_id and parent_id=(select auth.uid()) and status in ('requested','reviewing','waitlisted');
  end if;
  if not found then raise exception 'Cancellable parent request not found' using errcode='42501'; end if;
end;
$$;
revoke all on function public.cancel_parent_request(text,uuid) from public,anon;
grant execute on function public.cancel_parent_request(text,uuid) to authenticated;

create or replace function public.complete_return_exchange(
  p_request_id uuid,
  p_action text,
  p_inspection_result text,
  p_monetary_adjustment numeric,
  p_note text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.return_exchange_requests%rowtype;
  v_line public.shop_order_lines%rowtype;
  v_old public.shop_variants%rowtype;
  v_new public.shop_variants%rowtype;
  v_actor uuid := (select auth.uid());
begin
  if not public.is_admin() or p_action not in ('decline','complete')
     or char_length(trim(coalesce(p_note,'')))<3 then
    raise exception 'Administrator decision and note required' using errcode='42501';
  end if;
  if coalesce(p_monetary_adjustment,0)<>0 and not public.is_headmistress() then
    raise exception 'Only the Headmistress may authorise monetary return or exchange adjustments' using errcode='42501';
  end if;
  select * into v_request from public.return_exchange_requests where id=p_request_id for update;
  if not found or v_request.status not in ('requested','inspection_required','approved') then
    raise exception 'Open return or exchange request required' using errcode='22023';
  end if;
  if p_action='decline' then
    if p_inspection_result not in ('not_returned','not_eligible') then raise exception 'Decline requires not returned or not eligible inspection result' using errcode='22023'; end if;
    if coalesce(p_monetary_adjustment,0)<>0 then raise exception 'A declined request cannot carry a monetary adjustment' using errcode='22023'; end if;
    update public.return_exchange_requests set status='declined',inspection_result=coalesce(p_inspection_result,'not_eligible'),
      monetary_adjustment=0,office_note=trim(p_note),reviewed_by=v_actor,reviewed_at=now(),updated_at=now()
     where id=p_request_id;
    return;
  end if;
  if p_inspection_result not in ('resellable','damaged') then
    raise exception 'Completed return requires a resellable or damaged inspection result' using errcode='22023';
  end if;
  select * into v_line from public.shop_order_lines where id=v_request.order_line_id for update;
  select * into v_old from public.shop_variants where id=v_line.variant_id for update;
  if p_inspection_result='resellable' then
    update public.shop_variants set on_hand=on_hand+v_request.requested_quantity,updated_at=now() where id=v_old.id;
    insert into public.inventory_movements(variant_id,movement_kind,on_hand_delta,resulting_on_hand,resulting_reserved,resulting_damaged,
      order_id,order_line_id,actor_id,reason,idempotency_key)
    values(v_old.id,'return_to_stock',v_request.requested_quantity,v_old.on_hand+v_request.requested_quantity,v_old.reserved,v_old.damaged,
      v_line.order_id,v_line.id,v_actor,trim(p_note),'return:'||p_request_id::text);
  else
    update public.shop_variants set damaged=damaged+v_request.requested_quantity,updated_at=now() where id=v_old.id;
    insert into public.inventory_movements(variant_id,movement_kind,damaged_delta,resulting_on_hand,resulting_reserved,resulting_damaged,
      order_id,order_line_id,actor_id,reason,idempotency_key)
    values(v_old.id,'damaged_return',v_request.requested_quantity,v_old.on_hand,v_old.reserved,v_old.damaged+v_request.requested_quantity,
      v_line.order_id,v_line.id,v_actor,trim(p_note),'return:'||p_request_id::text);
  end if;
  if v_request.request_kind='exchange' then
    select * into v_new from public.shop_variants where id=v_request.requested_variant_id for update;
    if not found or not v_new.active or not v_new.reconciled or v_new.unit_price is null
       or v_new.product_id<>v_old.product_id
       or v_new.on_hand-v_new.reserved<v_request.requested_quantity
       or not exists (select 1 from public.shop_products p where p.id=v_new.product_id and p.active=true and p.reconciled=true) then
      raise exception 'Requested exchange variant is unavailable' using errcode='22023';
    end if;
    update public.shop_variants set on_hand=on_hand-v_request.requested_quantity,updated_at=now() where id=v_new.id;
    insert into public.inventory_movements(variant_id,movement_kind,on_hand_delta,resulting_on_hand,resulting_reserved,resulting_damaged,
      order_id,actor_id,reason,idempotency_key)
    values(v_new.id,'exchange_out',-v_request.requested_quantity,v_new.on_hand-v_request.requested_quantity,v_new.reserved,v_new.damaged,
      v_line.order_id,v_actor,trim(p_note),'exchange:'||p_request_id::text);
  end if;
  update public.return_exchange_requests set status='completed',inspection_result=p_inspection_result,
    monetary_adjustment=coalesce(p_monetary_adjustment,0),office_note=trim(p_note),reviewed_by=v_actor,reviewed_at=now(),completed_at=now(),updated_at=now()
   where id=p_request_id;
  insert into public.finance_events(order_id,actor_id,event_type,detail)
  values(v_line.order_id,v_actor,'return_exchange_completed',jsonb_build_object(
    'request_id',p_request_id,'request_kind',v_request.request_kind,
    'inspection_result',p_inspection_result,'quantity',v_request.requested_quantity,
    'monetary_adjustment',coalesce(p_monetary_adjustment,0),'note',trim(p_note)
  ));
end;
$$;
revoke all on function public.complete_return_exchange(uuid,text,text,numeric,text) from public,anon;
grant execute on function public.complete_return_exchange(uuid,text,text,numeric,text) to authenticated;

create or replace function public.open_stocktake(p_reference text,p_note text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reference,'')))<3 then raise exception 'Administrator and reference required' using errcode='42501'; end if;
  insert into public.stocktakes(reference,note,created_by) values(trim(p_reference),nullif(trim(p_note),''),(select auth.uid())) returning id into v_id;
  insert into public.stocktake_lines(stocktake_id,variant_id,expected_on_hand)
  select v_id,id,on_hand from public.shop_variants where active=true;
  return v_id;
end;
$$;
revoke all on function public.open_stocktake(text,text) from public,anon;
grant execute on function public.open_stocktake(text,text) to authenticated;

create or replace function public.close_stocktake(p_stocktake_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_line record;
  v_variant public.shop_variants%rowtype;
  v_delta integer;
  v_count integer:=0;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if not exists(select 1 from public.stocktakes where id=p_stocktake_id and status='open' for update) then
    raise exception 'Open stocktake required' using errcode='22023';
  end if;
  if exists(select 1 from public.stocktake_lines where stocktake_id=p_stocktake_id and actual_on_hand is null) then
    raise exception 'Every stocktake line requires an actual count' using errcode='22023';
  end if;
  for v_line in select * from public.stocktake_lines where stocktake_id=p_stocktake_id for update loop
    select * into v_variant from public.shop_variants where id=v_line.variant_id for update;
    v_delta:=v_line.actual_on_hand-v_variant.on_hand;
    if v_line.actual_on_hand<v_variant.reserved then raise exception 'Actual count is below reserved stock' using errcode='23514'; end if;
    if v_delta<>0 then
      update public.shop_variants set on_hand=v_line.actual_on_hand,updated_at=now() where id=v_variant.id;
      insert into public.inventory_movements(variant_id,movement_kind,on_hand_delta,resulting_on_hand,resulting_reserved,resulting_damaged,actor_id,reason,idempotency_key)
      values(v_variant.id,'stocktake',v_delta,v_line.actual_on_hand,v_variant.reserved,v_variant.damaged,(select auth.uid()),
        coalesce(nullif(trim(v_line.note),''),'Closed stocktake adjustment'),'stocktake:'||p_stocktake_id::text||':'||v_variant.id::text);
      v_count:=v_count+1;
    end if;
  end loop;
  update public.stocktakes set status='closed',closed_by=(select auth.uid()),closed_at=now() where id=p_stocktake_id;
  return v_count;
end;
$$;
revoke all on function public.close_stocktake(uuid) from public,anon;
grant execute on function public.close_stocktake(uuid) to authenticated;

create or replace function public.create_procurement_batch(
  p_reference text,
  p_variant_id uuid,
  p_ordered_quantity integer,
  p_unit_cost numeric,
  p_supplier_note text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_batch uuid;
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reference,'')))<3
     or p_ordered_quantity<=0 or (p_unit_cost is not null and p_unit_cost<0)
     or not exists(select 1 from public.shop_variants where id=p_variant_id) then
    raise exception 'Administrator and valid procurement line required' using errcode='42501';
  end if;
  insert into public.procurement_batches(reference,status,supplier_note,created_by,ordered_at)
  values(trim(p_reference),'ordered',nullif(trim(p_supplier_note),''),(select auth.uid()),now())
  returning id into v_batch;
  insert into public.procurement_lines(batch_id,variant_id,ordered_quantity,unit_cost)
  values(v_batch,p_variant_id,p_ordered_quantity,p_unit_cost);
  return v_batch;
end;
$$;
revoke all on function public.create_procurement_batch(text,uuid,integer,numeric,text) from public,anon;
grant execute on function public.create_procurement_batch(text,uuid,integer,numeric,text) to authenticated;

create or replace function public.add_procurement_line(
  p_batch_id uuid,p_variant_id uuid,p_ordered_quantity integer,p_unit_cost numeric
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_line uuid;
begin
  if not public.is_admin() or p_ordered_quantity<=0 or (p_unit_cost is not null and p_unit_cost<0)
     or not exists(select 1 from public.procurement_batches where id=p_batch_id and status in ('draft','ordered') for update)
     or not exists(select 1 from public.shop_variants where id=p_variant_id) then
    raise exception 'Open procurement batch and valid line required' using errcode='42501';
  end if;
  insert into public.procurement_lines(batch_id,variant_id,ordered_quantity,unit_cost)
  values(p_batch_id,p_variant_id,p_ordered_quantity,p_unit_cost) returning id into v_line;
  return v_line;
end;
$$;
revoke all on function public.add_procurement_line(uuid,uuid,integer,numeric) from public,anon;
grant execute on function public.add_procurement_line(uuid,uuid,integer,numeric) to authenticated;

create or replace function public.cancel_procurement_batch(p_batch_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Administrator and reason required' using errcode='42501'; end if;
  update public.procurement_batches set status='cancelled',supplier_note=trim(p_reason),updated_at=now()
   where id=p_batch_id and status in ('draft','ordered')
     and not exists(select 1 from public.procurement_lines l where l.batch_id=p_batch_id and l.received_quantity>0);
  if not found then raise exception 'Unreceived procurement batch required' using errcode='22023'; end if;
end;
$$;
revoke all on function public.cancel_procurement_batch(uuid,text) from public,anon;
grant execute on function public.cancel_procurement_batch(uuid,text) to authenticated;

create or replace function public.cancel_stocktake(p_stocktake_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Administrator and reason required' using errcode='42501'; end if;
  update public.stocktakes set status='cancelled',note=trim(p_reason),closed_by=(select auth.uid()),closed_at=now()
   where id=p_stocktake_id and status='open';
  if not found then raise exception 'Open stocktake required' using errcode='22023'; end if;
end;
$$;
revoke all on function public.cancel_stocktake(uuid,text) from public,anon;
grant execute on function public.cancel_stocktake(uuid,text) to authenticated;

create or replace function public.receive_procurement_line(
  p_line_id uuid,
  p_quantity integer,
  p_note text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_line public.procurement_lines%rowtype;
  v_variant public.shop_variants%rowtype;
  v_parent_request record;
begin
  if not public.is_admin() or p_quantity<=0 or char_length(trim(coalesce(p_note,'')))<3 then
    raise exception 'Administrator, quantity and note required' using errcode='42501';
  end if;
  select * into v_line from public.procurement_lines where id=p_line_id for update;
  if not found or v_line.received_quantity+p_quantity>v_line.ordered_quantity then
    raise exception 'Procurement receipt exceeds ordered quantity' using errcode='22023';
  end if;
  if not exists(select 1 from public.procurement_batches b where b.id=v_line.batch_id and b.status in ('ordered','part_received') for update) then
    raise exception 'Ordered procurement batch required' using errcode='22023';
  end if;
  select * into v_variant from public.shop_variants where id=v_line.variant_id for update;
  update public.procurement_lines set received_quantity=received_quantity+p_quantity where id=p_line_id;
  update public.shop_variants set on_hand=on_hand+p_quantity,updated_at=now() where id=v_variant.id;
  insert into public.inventory_movements(variant_id,movement_kind,on_hand_delta,resulting_on_hand,resulting_reserved,resulting_damaged,actor_id,reason,
    idempotency_key)
  values(v_variant.id,'purchase_receipt',p_quantity,v_variant.on_hand+p_quantity,v_variant.reserved,v_variant.damaged,(select auth.uid()),trim(p_note),
    'procurement:'||p_line_id::text||':'||(v_line.received_quantity+p_quantity)::text);
  update public.procurement_batches b set status=case
    when not exists(select 1 from public.procurement_lines l where l.batch_id=b.id and l.id<>p_line_id and l.received_quantity<l.ordered_quantity)
      and v_line.received_quantity+p_quantity=v_line.ordered_quantity then 'received' else 'part_received' end,
    received_at=case when not exists(select 1 from public.procurement_lines l where l.batch_id=b.id and l.id<>p_line_id and l.received_quantity<l.ordered_quantity)
      and v_line.received_quantity+p_quantity=v_line.ordered_quantity then now() else b.received_at end,
    updated_at=now() where b.id=v_line.batch_id;
  for v_parent_request in select r.* from public.restock_requests r
    where r.product_id=v_variant.product_id and r.status in ('requested','reviewing','procurement_planned')
      and (r.variant_label is null or lower(trim(r.variant_label)) in (
        lower(trim(v_variant.variant_label)), lower(trim(coalesce(v_variant.size_label,'')))
      ))
  loop
    update public.restock_requests set status='available',admin_note='Stock received; parent confirmation required before ordering.',updated_at=now()
     where id=v_parent_request.id;
    insert into public.portal_notifications(recipient_id,student_id,kind,title,message)
    values(v_parent_request.parent_id,v_parent_request.student_id,'restock','Requested item may now be available',
      'Stock has been received. Confirm your interest in the portal before placing an order; availability is not guaranteed until an order reserves stock.');
  end loop;
end;
$$;
revoke all on function public.receive_procurement_line(uuid,integer,text) from public,anon;
grant execute on function public.receive_procurement_line(uuid,integer,text) to authenticated;

create or replace function public.reconcile_transport_service(
  p_source_id text,
  p_route_code text,
  p_route_name text,
  p_session_name text,
  p_term_name text,
  p_term_amount numeric,
  p_capacity integer,
  p_status text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_service uuid; v_verified boolean;
begin
  if not public.is_admin() or p_status not in ('pending','mapped','owner_verified','excluded')
     or char_length(trim(coalesce(p_source_id,'')))<1 or char_length(trim(coalesce(p_note,'')))<3 then
    raise exception 'Administrator, preserved source and reconciliation note required' using errcode='42501';
  end if;
  v_verified:=p_status='owner_verified';
  select target_service_id into v_service from public.legacy_transport_reconciliation
   where source_id=trim(p_source_id) for update;
  if p_status='excluded' then
    if v_service is not null then update public.transport_services set active=false,reconciled=false,updated_at=now() where id=v_service; end if;
    insert into public.legacy_transport_reconciliation(source_id,status,note,reviewed_by,reviewed_at)
    values(trim(p_source_id),'excluded',trim(p_note),(select auth.uid()),now())
    on conflict(source_id) do update set target_service_id=null,status='excluded',note=excluded.note,
      reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;
    return null;
  end if;
  if char_length(trim(coalesce(p_route_code,'')))<2 or char_length(trim(coalesce(p_route_name,'')))<2
     or char_length(trim(coalesce(p_session_name,''))) not between 4 and 40
     or char_length(trim(coalesce(p_term_name,''))) not between 2 and 40
     or (v_verified and (p_term_amount is null or p_term_amount<=0))
     or (p_capacity is not null and p_capacity<=0) then
    raise exception 'Complete verified route values required' using errcode='22023';
  end if;
  if v_service is null then
    insert into public.transport_services(route_code,route_name,session_name,term_name,term_amount,capacity,active,reconciled,created_by)
    values(trim(p_route_code),trim(p_route_name),trim(p_session_name),trim(p_term_name),p_term_amount,p_capacity,v_verified,v_verified,(select auth.uid()))
    returning id into v_service;
  else
    update public.transport_services set route_code=trim(p_route_code),route_name=trim(p_route_name),
      session_name=trim(p_session_name),term_name=trim(p_term_name),term_amount=p_term_amount,capacity=p_capacity,
      active=v_verified,reconciled=v_verified,updated_at=now() where id=v_service;
  end if;
  insert into public.legacy_transport_reconciliation(source_id,target_service_id,status,note,reviewed_by,reviewed_at)
  values(trim(p_source_id),v_service,p_status,trim(p_note),(select auth.uid()),now())
  on conflict(source_id) do update set target_service_id=excluded.target_service_id,status=excluded.status,
    note=excluded.note,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;
  return v_service;
end;
$$;
revoke all on function public.reconcile_transport_service(text,text,text,text,text,numeric,integer,text,text) from public,anon;
grant execute on function public.reconcile_transport_service(text,text,text,text,text,numeric,integer,text,text) to authenticated;

create or replace function public.request_transport(
  p_student_id uuid,
  p_service_id uuid,
  p_general_area text
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare v_ref text;
begin
  if not public.full_parent_access() or not public.parent_can_access_student(p_student_id)
     or char_length(trim(coalesce(p_general_area,''))) not between 2 and 240 then
    raise exception 'Linked parent and general pickup area required' using errcode='42501';
  end if;
  if p_service_id is not null and not exists(
    select 1 from public.transport_services s where s.id=p_service_id and s.active=true and s.reconciled=true
  ) then raise exception 'Verified transport service required' using errcode='22023'; end if;
  if exists(
    select 1 from public.transport_requests r where r.student_id=p_student_id
      and r.parent_id=(select auth.uid()) and r.status in ('requested','reviewing','approved','waitlisted')
  ) then raise exception 'This pupil already has an open transport request' using errcode='23514'; end if;
  v_ref:='TA-TRN-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.transport_requests(request_reference,parent_id,student_id,service_id,general_area)
  values(v_ref,(select auth.uid()),p_student_id,p_service_id,trim(p_general_area));
  return v_ref;
end;
$$;
revoke all on function public.request_transport(uuid,uuid,text) from public,anon;
grant execute on function public.request_transport(uuid,uuid,text) to authenticated;

create or replace function public.review_transport_request(
  p_request_id uuid,
  p_status text,
  p_service_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.transport_requests%rowtype;
  v_service public.transport_services%rowtype;
  v_invoice uuid;
  v_item_code text;
begin
  if not public.is_admin() or p_status not in ('reviewing','approved','waitlisted','declined','cancelled')
     or char_length(trim(coalesce(p_note,'')))<3 then
    raise exception 'Administrator decision and note required' using errcode='42501';
  end if;
  select * into v_request from public.transport_requests where id=p_request_id for update;
  if not found or v_request.status in ('approved','declined','cancelled') then raise exception 'Open transport request required' using errcode='22023'; end if;
  if p_status='approved' then
    select * into v_service from public.transport_services where id=p_service_id and active=true and reconciled=true for update;
    if not found or v_service.term_amount is null or (v_service.capacity is not null and v_service.approved_count>=v_service.capacity) then
      raise exception 'Verified route with available capacity and price required' using errcode='22023';
    end if;
    insert into public.pupil_invoices(invoice_reference,student_id,session_name,term_name,class_code,title,total_amount,status,issued_by)
    select 'TA-INV-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
      v_request.student_id,v_service.session_name,v_service.term_name,s.class_code,'School transport — '||v_service.route_name,
      v_service.term_amount,'issued',(select auth.uid()) from public.students s where s.id=v_request.student_id
    returning id into v_invoice;
    v_item_code:='TRANSPORT_'||upper(substr(replace(v_service.route_code,'-','_'),1,25));
    insert into public.pupil_invoice_items(invoice_id,item_code,label,charge_kind,amount,source_type,source_id)
    values(v_invoice,v_item_code,'School transport — '||v_service.route_name,'transport',v_service.term_amount,'transport',v_service.id);
    update public.transport_services set approved_count=approved_count+1,updated_at=now() where id=v_service.id;
    insert into public.finance_events(invoice_id,actor_id,event_type,detail)
    values(v_invoice,(select auth.uid()),'invoice_issued',jsonb_build_object('source','transport_request'));
  end if;
  update public.transport_requests set status=p_status,service_id=case when p_status='approved' then p_service_id else service_id end,
    office_note=trim(p_note),reviewed_by=(select auth.uid()),reviewed_at=now(),invoice_id=case when p_status='approved' then v_invoice else invoice_id end,
    updated_at=now() where id=p_request_id;
  if p_status in ('approved','waitlisted','declined') then
    insert into public.portal_notifications(recipient_id,student_id,kind,title,message)
    values(v_request.parent_id,v_request.student_id,'transport','Transport request updated',
      'Your transport request is now '||replace(p_status,'_',' ')||'. Open Fees, Shop & Transport for the current record.');
  end if;
  return v_invoice;
end;
$$;
revoke all on function public.review_transport_request(uuid,text,uuid,text) from public,anon;
grant execute on function public.review_transport_request(uuid,text,uuid,text) to authenticated;

create or replace function public.cancel_transport_approval(p_request_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v public.transport_requests%rowtype;
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Administrator and cancellation reason required' using errcode='42501';
  end if;
  select * into v from public.transport_requests where id=p_request_id and status='approved' for update;
  if not found or v.invoice_id is null or v.service_id is null then raise exception 'Approved billed transport request required' using errcode='22023'; end if;
  update public.pupil_invoices set status='cancelled',updated_at=now()
   where id=v.invoice_id and status in ('issued','part_paid') and paid_amount=0
     and not exists(select 1 from public.manual_payments m where m.invoice_id=v.invoice_id and m.status in ('submitted','under_review','verified'));
  if not found then raise exception 'Transport invoice has a payment and cannot be cancelled here' using errcode='22023'; end if;
  insert into public.finance_events(invoice_id,actor_id,event_type,detail)
  values(v.invoice_id,(select auth.uid()),'invoice_cancelled',jsonb_build_object('reason',trim(p_reason),'source','transport'));
  update public.transport_services set approved_count=greatest(approved_count-1,0),updated_at=now() where id=v.service_id;
  update public.transport_requests set status='cancelled',office_note=trim(p_reason),reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now() where id=p_request_id;
  insert into public.portal_notifications(recipient_id,student_id,kind,title,message)
  values(v.parent_id,v.student_id,'transport','Transport approval cancelled','The office cancelled the unpaid transport approval. No transport place or payable invoice remains active.');
end;
$$;
revoke all on function public.cancel_transport_approval(uuid,text) from public,anon;
grant execute on function public.cancel_transport_approval(uuid,text) to authenticated;

create or replace function public.submit_bank_transfer_notification(
  p_invoice_id uuid,
  p_order_id uuid,
  p_amount numeric,
  p_payer_name text,
  p_sender_bank_name text,
  p_external_reference text,
  p_paid_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
  v_bank uuid;
  v_owner boolean := false;
begin
  if not public.full_parent_access()
     or ((p_invoice_id is null)::integer + (p_order_id is null)::integer) <> 1
     or p_amount <= 0 or char_length(trim(coalesce(p_payer_name,''))) < 2
     or char_length(trim(coalesce(p_sender_bank_name,''))) < 2
     or char_length(trim(coalesce(p_external_reference,''))) < 3 or p_paid_at is null then
    raise exception 'Complete bank transfer details are required' using errcode = '22023';
  end if;
  if p_invoice_id is not null then
    select exists (
      select 1 from public.pupil_invoices i join public.student_guardians g on g.student_id = i.student_id
       where i.id = p_invoice_id and g.parent_id = (select auth.uid()) and g.active = true
         and i.status in ('issued','part_paid') and p_amount <= i.total_amount - coalesce((
           select sum(m.amount) from public.manual_payments m
            where m.invoice_id=i.id and m.status in ('submitted','under_review','verified')
         ),0)
    ) into v_owner;
  else
    select exists (
      select 1 from public.shop_orders o where o.id = p_order_id and o.parent_id = (select auth.uid())
       and o.status in ('awaiting_payment','payment_submitted')
       and p_amount = o.total_amount - coalesce((
         select sum(m.amount) from public.manual_payments m
          where m.order_id = o.id and m.status in ('submitted','under_review','verified')
       ),0)
    ) into v_owner;
  end if;
  if not v_owner then raise exception 'Payable linked invoice or order required' using errcode = '42501'; end if;
  select id into v_bank from public.school_bank_accounts where active = true;
  if v_bank is null then raise exception 'No approved bank account is currently available' using errcode = '22023'; end if;
  v_ref := 'TA-PAY-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.manual_payments(
    payment_reference, invoice_id, order_id, submitted_by, method, amount,
    payer_name, sender_bank_name, external_reference, stated_paid_at, bank_account_id
  ) values (v_ref, p_invoice_id, p_order_id, (select auth.uid()), 'bank_transfer', p_amount,
    trim(p_payer_name), trim(p_sender_bank_name), trim(p_external_reference), p_paid_at, v_bank);
  if p_order_id is not null then
    update public.shop_orders set status = 'payment_submitted', updated_at = now()
     where id = p_order_id and status = 'awaiting_payment';
  end if;
  insert into public.finance_events(payment_id, invoice_id, order_id, actor_id, event_type)
  select id, invoice_id, order_id, (select auth.uid()), 'payment_submitted'
    from public.manual_payments where payment_reference = v_ref;
  return v_ref;
end;
$$;
revoke all on function public.submit_bank_transfer_notification(uuid, uuid, numeric, text, text, text, timestamptz) from public, anon;
grant execute on function public.submit_bank_transfer_notification(uuid, uuid, numeric, text, text, text, timestamptz) to authenticated;

create or replace function public.finalize_verified_payment(p_payment_id uuid, p_actor_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.manual_payments%rowtype;
  v_total numeric(12,2);
  v_due numeric(12,2);
  v_receipt text;
begin
  select * into v_payment from public.manual_payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'verified' then raise exception 'Verified payment required' using errcode = '22023'; end if;
  if v_payment.invoice_id is not null then
    select total_amount into v_due from public.pupil_invoices where id = v_payment.invoice_id for update;
    select coalesce(sum(amount),0) into v_total from public.manual_payments
     where invoice_id = v_payment.invoice_id and status = 'verified';
    if v_total > v_due then raise exception 'Verified payments exceed invoice balance' using errcode = '23514'; end if;
    update public.pupil_invoices set paid_amount = v_total,
      status = case when v_total = total_amount then 'paid' else 'part_paid' end, updated_at = now()
     where id = v_payment.invoice_id;
  else
    select total_amount into v_due from public.shop_orders where id = v_payment.order_id for update;
    select coalesce(sum(amount),0) into v_total from public.manual_payments
     where order_id = v_payment.order_id and status = 'verified';
    if v_total > v_due then raise exception 'Verified payments exceed order balance' using errcode = '23514'; end if;
    if v_total = v_due then
      update public.shop_orders set status = 'paid_preparing', paid_at = now(),
        expected_ready_on = public.next_school_workday(current_date), updated_at = now()
       where id = v_payment.order_id and status in ('awaiting_payment','payment_submitted');
    end if;
  end if;
  v_receipt := 'TA-RCP-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.payment_receipts(receipt_reference, payment_id, issued_by)
  values (v_receipt, p_payment_id, p_actor_id);
  insert into public.finance_events(payment_id, invoice_id, order_id, actor_id, event_type)
  values (p_payment_id, v_payment.invoice_id, v_payment.order_id, p_actor_id, 'payment_verified'),
         (p_payment_id, v_payment.invoice_id, v_payment.order_id, p_actor_id, 'receipt_issued');
  return v_receipt;
end;
$$;
revoke all on function public.finalize_verified_payment(uuid, uuid) from public, anon, authenticated;

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
    if not public.is_headmistress() then raise exception 'Only the Headmistress may reverse a verified payment' using errcode = '42501'; end if;
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

create or replace function public.record_physical_pos_payment(
  p_invoice_id uuid,
  p_order_id uuid,
  p_amount numeric,
  p_payer_name text,
  p_terminal_reference text,
  p_paid_at timestamptz,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
  v_id uuid;
  v_payable boolean := false;
begin
  if not public.is_admin() or ((p_invoice_id is null)::integer + (p_order_id is null)::integer) <> 1
     or p_amount <= 0 or char_length(trim(coalesce(p_payer_name,''))) < 2
     or char_length(trim(coalesce(p_terminal_reference,''))) < 3
     or p_paid_at is null or char_length(trim(coalesce(p_note,''))) < 3 then
    raise exception 'Complete physical POS record required' using errcode = '22023';
  end if;
  if p_invoice_id is not null then
    select exists (
      select 1 from public.pupil_invoices i
       where i.id=p_invoice_id and i.status in ('issued','part_paid')
         and p_amount <= i.total_amount-coalesce((
           select sum(m.amount) from public.manual_payments m
            where m.invoice_id=i.id and m.status in ('submitted','under_review','verified')
         ),0)
    ) into v_payable;
  else
    select exists (
      select 1 from public.shop_orders o
       where o.id=p_order_id and o.status in ('awaiting_payment','payment_submitted')
         and p_amount = o.total_amount-coalesce((
           select sum(m.amount) from public.manual_payments m
            where m.order_id=o.id and m.status in ('submitted','under_review','verified')
         ),0)
    ) into v_payable;
  end if;
  if not v_payable then raise exception 'Open payable invoice or full outstanding materials order required' using errcode='22023'; end if;
  v_ref := 'TA-PAY-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.manual_payments(
    payment_reference, invoice_id, order_id, submitted_by, method, amount, status,
    payer_name, terminal_reference, stated_paid_at
  ) values (
    v_ref, p_invoice_id, p_order_id, (select auth.uid()), 'physical_pos', p_amount, 'submitted',
    trim(p_payer_name), trim(p_terminal_reference), p_paid_at
  ) returning id into v_id;
  if p_order_id is not null then
    update public.shop_orders set status='payment_submitted',updated_at=now()
     where id=p_order_id and status='awaiting_payment';
  end if;
  insert into public.finance_events(payment_id,invoice_id,order_id,actor_id,event_type,detail)
  values(v_id,p_invoice_id,p_order_id,(select auth.uid()),'payment_submitted',jsonb_build_object(
    'method','physical_pos','record_note',trim(p_note)
  ));
  return jsonb_build_object('payment_reference', v_ref, 'status', 'submitted');
end;
$$;
revoke all on function public.record_physical_pos_payment(uuid, uuid, numeric, text, text, timestamptz, text) from public, anon;
grant execute on function public.record_physical_pos_payment(uuid, uuid, numeric, text, text, timestamptz, text) to authenticated;

create or replace function public.guard_fee_schedule_update()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='INSERT' then
    if new.publication_status<>'draft' or new.published_by is not null or new.published_at is not null then
      raise exception 'Fee schedules must begin as unpublished drafts' using errcode='42501';
    end if;
    return new;
  end if;
  if old.publication_status<>'draft' and (
    new.session_name is distinct from old.session_name or new.term_name is distinct from old.term_name
    or new.class_code is distinct from old.class_code or new.title is distinct from old.title
    or new.due_date is distinct from old.due_date
  ) then raise exception 'Published fee schedule details are immutable' using errcode='42501'; end if;
  if new.publication_status is distinct from old.publication_status and not (
    (old.publication_status='draft' and new.publication_status in ('published','retired'))
    or (old.publication_status='published' and new.publication_status='retired')
  ) then raise exception 'Invalid fee schedule transition' using errcode='22023'; end if;
  if new.publication_status='published' and (new.published_by is null or new.published_at is null) then
    raise exception 'Published fee schedule requires publisher and time' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_fee_schedule_update() from public,anon,authenticated;
drop trigger if exists fee_schedule_guard on public.fee_schedules;
create trigger fee_schedule_guard before insert or update on public.fee_schedules
for each row execute function public.guard_fee_schedule_update();

create or replace function public.guard_fee_schedule_item()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_schedule uuid:=case when tg_op='DELETE' then old.schedule_id else new.schedule_id end;
begin
  if not exists(select 1 from public.fee_schedules s where s.id=v_schedule and s.publication_status='draft') then
    raise exception 'Fee components may change only while the schedule is draft' using errcode='42501';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function public.guard_fee_schedule_item() from public,anon,authenticated;
drop trigger if exists fee_schedule_item_guard on public.fee_schedule_items;
create trigger fee_schedule_item_guard before insert or update or delete on public.fee_schedule_items
for each row execute function public.guard_fee_schedule_item();

create or replace function public.guard_stocktake_line_update()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(select 1 from public.stocktakes s where s.id=new.stocktake_id and s.status='open') then
    raise exception 'Only an open stocktake may receive physical counts' using errcode='42501';
  end if;
  if new.stocktake_id is distinct from old.stocktake_id or new.variant_id is distinct from old.variant_id
     or new.expected_on_hand is distinct from old.expected_on_hand then
    raise exception 'Stocktake identity and expected balance are immutable' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_stocktake_line_update() from public,anon,authenticated;
drop trigger if exists stocktake_line_guard on public.stocktake_lines;
create trigger stocktake_line_guard before update on public.stocktake_lines
for each row execute function public.guard_stocktake_line_update();

create or replace function public.guard_inventory_movement_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$ begin raise exception 'Inventory movements are immutable' using errcode = '42501'; end; $$;
revoke all on function public.guard_inventory_movement_immutable() from public, anon, authenticated;

drop trigger if exists inventory_movements_immutable on public.inventory_movements;
create trigger inventory_movements_immutable before update or delete on public.inventory_movements
for each row execute function public.guard_inventory_movement_immutable();

create or replace function public.audit_shop_variant_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_price is distinct from old.unit_price then
    insert into public.shop_price_events(variant_id, previous_price, new_price, actor_id, reason)
    values (new.id, old.unit_price, new.unit_price, (select auth.uid()), 'Catalogue price changed');
  end if;
  return new;
end;
$$;
revoke all on function public.audit_shop_variant_price() from public, anon, authenticated;
drop trigger if exists shop_variant_price_audit on public.shop_variants;
create trigger shop_variant_price_audit after update of unit_price on public.shop_variants
for each row execute function public.audit_shop_variant_price();

-- Standard updated_at triggers.
do $$
declare n text;
begin
  foreach n in array array[
    'school_bank_accounts','fee_schedules','pupil_invoices','shop_products','shop_variants',
    'shop_orders','restock_requests','procurement_batches','return_exchange_requests',
    'transport_services','transport_requests','manual_payments'
  ] loop
    execute format('drop trigger if exists %I on public.%I', n || '_touch_updated_at', n);
    execute format('create trigger %I before update on public.%I for each row execute function public.portal_touch_updated_at()', n || '_touch_updated_at', n);
  end loop;
end $$;

-- RLS: configuration writes are administrator-only; parents see only linked
-- records; teacher distribution contains no amount, payment or parent contact.
do $$
declare n text;
begin
  foreach n in array array[
    'school_bank_accounts','fee_schedules','fee_schedule_items','legacy_fee_reconciliation','pupil_invoices','pupil_invoice_items',
    'shop_products','shop_variants','legacy_catalog_reconciliation','shop_price_events','catalog_status_events','shop_orders',
    'shop_order_lines','inventory_movements','stocktakes','stocktake_lines','restock_requests',
    'procurement_batches','procurement_lines','return_exchange_requests','transport_services',
    'legacy_transport_reconciliation','transport_requests','manual_payments','payment_receipts','finance_events'
  ] loop execute format('alter table public.%I enable row level security', n); end loop;
end $$;

create policy bank_accounts_select on public.school_bank_accounts for select to authenticated
using ((select public.is_admin()) or (active and (select public.full_parent_access())));
create policy bank_accounts_head_write on public.school_bank_accounts for all to authenticated
using ((select public.is_headmistress())) with check ((select public.is_headmistress()));

create policy fee_schedules_admin_all on public.fee_schedules for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy fee_items_admin_all on public.fee_schedule_items for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy legacy_fee_reconciliation_admin on public.legacy_fee_reconciliation for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy invoices_select on public.pupil_invoices for select to authenticated
using ((select public.is_admin()) or public.parent_can_access_student(student_id));
create policy invoice_items_select on public.pupil_invoice_items for select to authenticated
using ((select public.is_admin()) or exists (
  select 1 from public.pupil_invoices i where i.id = pupil_invoice_items.invoice_id and public.parent_can_access_student(i.student_id)
));

create policy products_select on public.shop_products for select to authenticated
using ((select public.is_admin()));
create policy products_admin_write on public.shop_products for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy variants_select on public.shop_variants for select to authenticated
using ((select public.is_admin()));
create policy variants_admin_insert on public.shop_variants for insert to authenticated with check ((select public.is_admin()));
create policy variants_admin_update on public.shop_variants for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy legacy_reconciliation_admin on public.legacy_catalog_reconciliation for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy price_events_admin_select on public.shop_price_events for select to authenticated using ((select public.is_admin()));
create policy catalog_status_events_admin_select on public.catalog_status_events for select to authenticated using ((select public.is_admin()));
create policy orders_select on public.shop_orders for select to authenticated using (public.shop_order_access(id));
create policy order_lines_select on public.shop_order_lines for select to authenticated using (public.shop_order_access(order_id));
create policy inventory_admin_select on public.inventory_movements for select to authenticated using ((select public.is_admin()));
create policy stocktakes_admin_all on public.stocktakes for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy stocktake_lines_admin_all on public.stocktake_lines for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy restock_select on public.restock_requests for select to authenticated
using ((select public.is_admin()) or (parent_id=(select auth.uid()) and (select public.full_parent_access())));
create policy restock_admin_update on public.restock_requests for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy procurement_batches_admin on public.procurement_batches for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy procurement_lines_admin on public.procurement_lines for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy returns_select on public.return_exchange_requests for select to authenticated
using ((select public.is_admin()) or parent_id=(select auth.uid()));
create policy returns_admin_update on public.return_exchange_requests for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy transport_services_select on public.transport_services for select to authenticated
using ((select public.is_admin()));
create policy transport_services_admin_write on public.transport_services for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy legacy_transport_admin on public.legacy_transport_reconciliation for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy transport_requests_select on public.transport_requests for select to authenticated
using ((select public.is_admin()) or (parent_id=(select auth.uid()) and (select public.full_parent_access())));
create policy transport_requests_parent_insert on public.transport_requests for insert to authenticated
with check (parent_id=(select auth.uid()) and (select public.full_parent_access()) and public.parent_can_access_student(student_id));
create policy transport_requests_admin_update on public.transport_requests for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy manual_payments_select on public.manual_payments for select to authenticated
using ((select public.is_admin()));
create policy receipts_select on public.payment_receipts for select to authenticated
using ((select public.is_admin()));
create policy finance_events_admin_select on public.finance_events for select to authenticated using ((select public.is_admin()));

-- No anonymous grants for finance, catalogue, stock, orders, transport or payments.
revoke all on table public.school_bank_accounts, public.fee_schedules, public.fee_schedule_items,
  public.legacy_fee_reconciliation, public.pupil_invoices, public.pupil_invoice_items, public.shop_products, public.shop_variants,
  public.legacy_catalog_reconciliation, public.shop_price_events, public.catalog_status_events, public.shop_orders,
  public.shop_order_lines, public.inventory_movements, public.stocktakes, public.stocktake_lines,
  public.restock_requests, public.procurement_batches, public.procurement_lines,
  public.return_exchange_requests, public.transport_services, public.legacy_transport_reconciliation,
  public.transport_requests, public.manual_payments, public.payment_receipts, public.finance_events from anon;

grant select on table public.school_bank_accounts, public.fee_schedules, public.fee_schedule_items,
  public.legacy_fee_reconciliation, public.pupil_invoices, public.pupil_invoice_items, public.shop_products, public.shop_variants,
  public.legacy_catalog_reconciliation, public.shop_price_events, public.catalog_status_events, public.shop_orders,
  public.shop_order_lines, public.inventory_movements, public.stocktakes, public.stocktake_lines,
  public.restock_requests, public.procurement_batches, public.procurement_lines,
  public.return_exchange_requests, public.transport_services, public.legacy_transport_reconciliation,
  public.transport_requests, public.manual_payments, public.payment_receipts, public.finance_events to authenticated;

grant insert(bank_name,account_name,account_number),
  update(bank_name,account_name,account_number,updated_at)
  on public.school_bank_accounts to authenticated;
grant insert(session_name,term_name,class_code,title,due_date) on public.fee_schedules to authenticated;
grant insert, update, delete on public.fee_schedule_items to authenticated;
grant insert, update on public.legacy_fee_reconciliation, public.legacy_catalog_reconciliation to authenticated;
grant insert(product_code,name,description,category) on public.shop_products to authenticated;
grant insert(product_id, sku, variant_label, size_label, eligible_classes, unit_price,
  low_stock_threshold) on public.shop_variants to authenticated;
grant update(actual_on_hand,note) on public.stocktake_lines to authenticated;
grant select on public.inventory_low_stock to authenticated;

revoke all on sequence public.shop_price_events_id_seq, public.catalog_status_events_id_seq,
  public.inventory_movements_id_seq, public.finance_events_id_seq from anon, authenticated;

comment on table public.fee_schedule_items is 'billing_mode prevents included examinations/materials from being billed again as separate invoice lines.';
comment on table public.inventory_movements is 'Immutable authoritative stock ledger. Browser code never decrements stock.';
comment on table public.manual_payments is 'Manual bank-transfer notifications and physical school POS records only; verification never affects admission, promotion, results or access.';
comment on table public.restock_requests is 'Demand signal only; it is not a reservation, order, charge or guarantee of availability.';
comment on table public.transport_services is 'Capacity-controlled non-stock service. No inventory movement is created.';

-- Former Monnify-era objects from migration 001 remain dormant preservation
-- evidence. No grants, UI routes or functions in this migration activate them.
commit;

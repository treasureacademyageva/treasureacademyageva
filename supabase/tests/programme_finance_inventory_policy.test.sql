-- Treasure Academy fees, stock, payment, transport and least-privilege integration test.
-- Run only in a disposable PostgreSQL/Supabase-compatible database after all
-- seven ordered migrations through 202610240001.
-- All records are fictional and the transaction always rolls back.

begin;

create or replace function pg_temp.assert_true(ok boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(ok,false) then raise exception 'PROGRAMME TEST FAILED: %',message; end if;
end;
$$;

create or replace function pg_temp.assert_throws(statement text, message text)
returns void language plpgsql as $$
declare blocked boolean:=false;
begin
  begin execute statement; exception when others then blocked:=true; end;
  if not blocked then raise exception 'PROGRAMME TEST FAILED: %',message; end if;
end;
$$;

create temp table programme_ids(key text primary key,id uuid not null);
grant all on programme_ids to authenticated,service_role;
set local role service_role;
select pg_temp.assert_true((select count(*)=10 and count(*) filter(where class_code='Primary 5')=0 from public.class_progression),'Exact progression must contain ten stages and no Primary 5');
select pg_temp.assert_true((select next_class_code='Primary 6' from public.class_progression where class_code='Primary 4'),'Primary 4 must progress directly to Primary 6');
reset role;

insert into auth.users(id,phone,raw_user_meta_data) values
 ('11000000-0000-4000-8000-000000000001','+2348111111101','{"full_name":"Fictional Headmistress"}'),
 ('11000000-0000-4000-8000-000000000002','+2348111111102','{"full_name":"Fictional Assistant"}'),
 ('11000000-0000-4000-8000-000000000003','+2348111111103','{"full_name":"Fictional Parent"}'),
 ('11000000-0000-4000-8000-000000000004','+2348111111104','{"full_name":"Fictional Teacher"}');
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('91000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',now(),now()),
 ('91000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002',now(),now()),
 ('91000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000003',now(),now()),
 ('91000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000004',now(),now());

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
update public.profiles p set account_status='active',must_change_password=false,active=true,
 phone=u.phone,phone_e164=u.phone from auth.users u where u.id=p.id and p.id::text like '11000000-%';
update public.profiles set role='admin',leadership_scope='headmistress' where id='11000000-0000-4000-8000-000000000001';
update public.profiles set role='admin',leadership_scope='assistant_headmistress' where id='11000000-0000-4000-8000-000000000002';
update public.profiles set role='teacher' where id='11000000-0000-4000-8000-000000000004';

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
insert into public.students(id,admission_number,full_name,class_code,parent_id,admission_status,active)
values('21000000-0000-4000-8000-000000000001','FICTIONAL-P1-001','Fictional Pupil','Primary 1','11000000-0000-4000-8000-000000000003','admitted',true);
insert into public.student_guardians(student_id,parent_id,relationship,is_primary,active,verified_by,verified_at)
values('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000003','parent',true,true,'11000000-0000-4000-8000-000000000001',now())
on conflict(student_id,parent_id) do update set active=true,verified_at=excluded.verified_at;
insert into public.teacher_class_assignments(teacher_id,class_code,subject)
values('11000000-0000-4000-8000-000000000004','Primary 1','*');

insert into public.shop_products(id,product_code,name,description,category,active,reconciled,created_by)
values('31000000-0000-4000-8000-000000000001','FICTIONAL-BOOK','Fictional Workbook','Disposable test stock','books',true,true,'11000000-0000-4000-8000-000000000001');
insert into public.shop_variants(id,product_id,sku,variant_label,eligible_classes,unit_price,on_hand,reserved,damaged,low_stock_threshold,active,reconciled)
values('32000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','FIC-WB-P1','Primary 1',array['Primary 1'],1000,10,0,0,2,true,true);
insert into public.legacy_catalog_reconciliation(source_table,source_id,target_product_id,target_variant_id,status,note,reviewed_by,reviewed_at)
values('shop_items','fictional-source','31000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','owner_verified','Fictional verified mapping','11000000-0000-4000-8000-000000000001',now());
insert into public.transport_services(id,route_code,route_name,session_name,term_name,term_amount,capacity,approved_count,active,reconciled,created_by)
values('33000000-0000-4000-8000-000000000001','FIC-ROUTE','Fictional Route','2099/2100','First',500,1,0,true,true,'11000000-0000-4000-8000-000000000001');
insert into public.school_bank_accounts(bank_name,account_name,account_number,active,approved_by)
values('Fictional Bank','Treasure Academy Fictional','0000000000',true,'11000000-0000-4000-8000-000000000001');

-- Headmistress creates an unpublished schedule, records one separately billed service
-- and one included examination, then atomically publishes and issues one invoice.
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','91000000-0000-4000-8000-000000000001',true);
with created as (
  insert into public.fee_schedules(session_name,term_name,class_code,title,due_date)
  values('2099/2100','First','Primary 1','Fictional first-term bill','2099-12-31') returning id
) insert into programme_ids select 'schedule',id from created;
insert into public.fee_schedule_items(schedule_id,item_code,label,charge_kind,billing_mode,amount,required)
select id,'TUITION','Fictional tuition','tuition','separate',1000,true from programme_ids where key='schedule';
insert into public.fee_schedule_items(schedule_id,item_code,label,charge_kind,billing_mode,amount,required)
select id,'EXAM-INCLUDED','Included examination','examination','included',0,true from programme_ids where key='schedule';
select pg_temp.assert_true(public.create_invoices_for_fee_schedule((select id from programme_ids where key='schedule'))=1,'Publishing must issue exactly one invoice');
insert into programme_ids select 'invoice',id from public.pupil_invoices where schedule_id=(select id from programme_ids where key='schedule');
select pg_temp.assert_true((select publication_status='published' and published_by='11000000-0000-4000-8000-000000000001' from public.fee_schedules where id=(select id from programme_ids where key='schedule')),'Schedule must publish in the invoice transaction');
select pg_temp.assert_true((select total_amount=1000 from public.pupil_invoices where id=(select id from programme_ids where key='invoice')),'Included examination must not be charged twice');
select pg_temp.assert_true((select count(*)=1 from public.pupil_invoice_items where invoice_id=(select id from programme_ids where key='invoice')),'Only separately billable services become invoice lines');
select pg_temp.assert_throws(format('update public.fee_schedules set title=%L where id=%L','Changed published title',(select id from programme_ids where key='schedule')),'Direct published-schedule mutation must be blocked');
reset role;

-- Parent projections expose only orderable catalogue facts, and ordinary browser
-- inserts cannot forge products, payments, orders or receipts.
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','91000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=1 from public.parent_portal_students()),'Parent must receive only linked pupils through the safe projection');
select pg_temp.assert_true((select count(*)=0 from public.students),'Parent must not query the base pupil table');
select pg_temp.assert_throws('select date_of_birth from public.parent_portal_students()','Parent pupil projection must not expose staff-only birthday data');
select pg_temp.assert_true((select count(*)=1 from public.parent_shop_products()),'Parent catalogue projection must expose the active product');
select pg_temp.assert_true((select count(*)=1 and min(available)=10 from public.parent_shop_variants()),'Parent projection must expose only calculated available stock');
select pg_temp.assert_throws('select on_hand from public.parent_shop_variants()','Parent stock projection must not expose internal on-hand balance');
select pg_temp.assert_throws($q$insert into public.shop_products(product_code,name,category) values('FORGED','Forged','books')$q$,'Parent must not forge catalogue products');
with placed as (
 select public.place_shop_order('21000000-0000-4000-8000-000000000001','teacher_to_pupil','2099/2100','First',
   '[{"variant_id":"32000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb) result
) insert into programme_ids select 'order1',(result->>'order_id')::uuid from placed;
select pg_temp.assert_true((select available=9 from public.parent_shop_variants() where id='32000000-0000-4000-8000-000000000001'),'Order placement must reduce projected availability without exposing internal balances');
select pg_temp.assert_throws(format($q$select public.submit_bank_transfer_notification(null,%L::uuid,999,'Fictional Parent','Fictional Bank','FIC-WRONG',now())$q$,(select id from programme_ids where key='order1')),'Materials payment must equal the exact outstanding order total');
select public.submit_bank_transfer_notification(null,(select id from programme_ids where key='order1'),1000,'Fictional Parent','Fictional Bank','FIC-EXACT-1',now());
select pg_temp.assert_true((select count(*)=0 from public.manual_payments),'Parent must not query internal payment-review fields from the base table');
select pg_temp.assert_true((select count(*)=1 from public.parent_manual_payments()),'Parent payment projection must expose the submitted notification status');
select pg_temp.assert_true((select count(*)=0 from public.parent_payment_receipts()),'A submitted notification must not create a receipt');
select pg_temp.assert_throws($q$insert into public.manual_payments(payment_reference,order_id,submitted_by,method,amount,status,payer_name,stated_paid_at) values('FORGED',(select id from programme_ids where key='order1'),'11000000-0000-4000-8000-000000000003','bank_transfer',1000,'verified','Forged',now())$q$,'Parent must not forge a verified payment');
reset role;

-- An Assistant may verify but cannot reverse. Verification alone creates the
-- receipt and moves a fully paid materials order into preparation.
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','91000000-0000-4000-8000-000000000002',true);
insert into programme_ids select 'payment1',id from public.manual_payments where order_id=(select id from programme_ids where key='order1');
select pg_temp.assert_true(public.review_manual_payment((select id from programme_ids where key='payment1'),'verify','Matched fictional bank statement') like 'TA-RCP-%','Verification must issue an official receipt reference');
select pg_temp.assert_true((select status='paid_preparing' from public.shop_orders where id=(select id from programme_ids where key='order1')),'Exact verified payment must release the order to preparation');
select pg_temp.assert_throws(format($q$select public.review_manual_payment(%L::uuid,'reverse','Assistant reversal denied')$q$,(select id from programme_ids where key='payment1')),'Assistant must not reverse a verified payment');
reset role;

-- The Headmistress-only reversal is audited and invalidates the receipt.
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','91000000-0000-4000-8000-000000000001',true);
select public.review_manual_payment((select id from programme_ids where key='payment1'),'reverse','Fictional verification correction');
select pg_temp.assert_true((select status='reversed' from public.manual_payments where id=(select id from programme_ids where key='payment1')),'Headmistress reversal must preserve the payment as reversed');
select pg_temp.assert_true((select reversed_at is not null from public.payment_receipts where payment_id=(select id from programme_ids where key='payment1')),'Reversal must invalidate rather than delete the receipt');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','91000000-0000-4000-8000-000000000003',true);
select public.cancel_shop_order((select id from programme_ids where key='order1'),'Fictional corrected payment will not proceed');
select pg_temp.assert_true((select count(*)=1 and bool_and(reversed_at is not null) from public.parent_payment_receipts()),'Parent receipt projection must show the Headmistress reversal without exposing reviewer identities');
select pg_temp.assert_true((select available=10 from public.parent_shop_variants() where id='32000000-0000-4000-8000-000000000001'),'Cancelling a payment-reversed order must release its reservation');
reset role;

-- A fresh fully paid order follows the teacher-distribution route. The teacher
-- receives a fixed-column handover projection and fulfilment posts inventory once.
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','91000000-0000-4000-8000-000000000003',true);
with placed as (
 select public.place_shop_order('21000000-0000-4000-8000-000000000001','teacher_to_pupil','2099/2100','First',
   '[{"variant_id":"32000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb) result
) insert into programme_ids select 'order2',(result->>'order_id')::uuid from placed;
select public.submit_bank_transfer_notification(null,(select id from programme_ids where key='order2'),1000,'Fictional Parent','Fictional Bank','FIC-EXACT-2',now());
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','91000000-0000-4000-8000-000000000001',true);
insert into programme_ids select 'payment2',id from public.manual_payments where order_id=(select id from programme_ids where key='order2');
select public.review_manual_payment((select id from programme_ids where key='payment2'),'verify','Matched second fictional transfer');
select public.advance_shop_order((select id from programme_ids where key='order2'),'ready','Released for teacher distribution');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','91000000-0000-4000-8000-000000000004',true);
select pg_temp.assert_true((select count(*)=1 from public.teacher_collection_orders()),'Assigned teacher must see exactly the ready class handover');
select pg_temp.assert_true((select count(*)=0 from public.shop_orders),'Teacher must not see base order or finance rows');
select public.advance_shop_order((select id from programme_ids where key='order2'),'fulfil','Handed fictional workbook to linked pupil');
reset role;
set local role service_role;
select pg_temp.assert_true((select status='handed_to_pupil' from public.shop_orders where id=(select id from programme_ids where key='order2')),'Teacher handover must fulfil the released order');
select pg_temp.assert_true((select on_hand=9 and reserved=0 from public.shop_variants where id='32000000-0000-4000-8000-000000000001'),'Fulfilment must reduce on-hand and clear only its own reservation');
select pg_temp.assert_true((select count(*)=1 from public.inventory_movements where order_id=(select id from programme_ids where key='order2') and movement_kind='order_fulfilment'),'Fulfilment must create one immutable movement');
insert into programme_ids select 'order2_line',id from public.shop_order_lines where order_id=(select id from programme_ids where key='order2');

-- Returns remain tied to fulfilled quantities, and a resellable inspection posts
-- stock and finance audit events rather than editing the fulfilled order history.
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','91000000-0000-4000-8000-000000000003',true);
select public.request_return_exchange((select id from programme_ids where key='order2_line'),'return',1,null,'Fictional unopened return');
insert into programme_ids select 'return1',id from public.return_exchange_requests where order_line_id=(select id from programme_ids where key='order2_line') order by created_at desc limit 1;
select pg_temp.assert_throws(format($q$select public.request_return_exchange(%L::uuid,'return',1,null,'Duplicate quantity')$q$,(select id from programme_ids where key='order2_line')),'Cumulative return requests must not exceed fulfilled quantity');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','91000000-0000-4000-8000-000000000001',true);
select public.complete_return_exchange((select id from programme_ids where key='return1'),'complete','resellable',0,'Inspected fictional return as resellable');
select pg_temp.assert_true((select on_hand=10 from public.shop_variants where id='32000000-0000-4000-8000-000000000001'),'Resellable return must restore authoritative on-hand stock');
select pg_temp.assert_true((select count(*)=1 from public.inventory_movements where order_line_id=(select id from programme_ids where key='order2_line') and movement_kind='return_to_stock'),'Return must create one immutable stock movement');

-- Procurement receipt and stocktake close are atomic inventory operations.
insert into programme_ids
select 'procurement',public.create_procurement_batch('FIC-PO-001','32000000-0000-4000-8000-000000000001',2,600,'Fictional supplier');
insert into programme_ids select 'procurement_line',id from public.procurement_lines where batch_id=(select id from programme_ids where key='procurement');
select public.receive_procurement_line((select id from programme_ids where key='procurement_line'),2,'Received and counted fictional stock');
select pg_temp.assert_true((select on_hand=12 from public.shop_variants where id='32000000-0000-4000-8000-000000000001'),'Procurement receipt must increase authoritative stock');
insert into programme_ids select 'stocktake',public.open_stocktake('FIC-STOCKTAKE-001','Fictional full count');
update public.stocktake_lines set actual_on_hand=11,note='Fictional physical count' where stocktake_id=(select id from programme_ids where key='stocktake') and variant_id='32000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(public.close_stocktake((select id from programme_ids where key='stocktake'))=1,'Stocktake close must post exactly one difference');
select pg_temp.assert_true((select on_hand=11 from public.shop_variants where id='32000000-0000-4000-8000-000000000001'),'Closed stocktake must atomically reconcile the balance');
select pg_temp.assert_throws(format('update public.stocktake_lines set actual_on_hand=10 where stocktake_id=%L::uuid',(select id from programme_ids where key='stocktake')),'Closed stocktake counts must be immutable');
reset role;

-- A transport approval creates a non-stock invoice inside capacity; cancelling
-- the unpaid approval atomically cancels that invoice and restores capacity.
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','91000000-0000-4000-8000-000000000003',true);
select public.request_transport('21000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','Fictional general area');
insert into programme_ids select 'transport_request',id from public.transport_requests
 where parent_id='11000000-0000-4000-8000-000000000003' order by created_at desc limit 1;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','91000000-0000-4000-8000-000000000002',true);
select public.review_transport_request((select id from programme_ids where key='transport_request'),'approved','33000000-0000-4000-8000-000000000001','Capacity checked');
select pg_temp.assert_true((select approved_count=1 from public.transport_services where id='33000000-0000-4000-8000-000000000001'),'Transport approval must reserve one route place');
select public.cancel_transport_approval((select id from programme_ids where key='transport_request'),'Fictional family no longer needs route');
select pg_temp.assert_true((select approved_count=0 from public.transport_services where id='33000000-0000-4000-8000-000000000001'),'Cancellation must restore route capacity');
select pg_temp.assert_true((select i.status='cancelled' from public.pupil_invoices i join public.transport_requests r on r.invoice_id=i.id where r.id=(select id from programme_ids where key='transport_request')),'Cancellation must cancel the linked unpaid transport invoice');
reset role;

-- Catalogue status changes use the audited RPC; direct balance mutation remains unavailable.
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','91000000-0000-4000-8000-000000000001',true);
select public.set_catalog_variant_active('32000000-0000-4000-8000-000000000001',false,'Fictional temporary catalogue pause');
select pg_temp.assert_true((select count(*)=1 from public.catalog_status_events where variant_id='32000000-0000-4000-8000-000000000001' and new_active=false),'Catalogue deactivation must be audit-recorded');
select pg_temp.assert_throws($q$update public.shop_variants set on_hand=999 where id='32000000-0000-4000-8000-000000000001'$q$,'Direct inventory balance mutation must be blocked');
reset role;

rollback;

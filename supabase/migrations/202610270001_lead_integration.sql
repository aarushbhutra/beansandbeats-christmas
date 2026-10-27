begin;
create function public.update_menu_item(item_id uuid, expected_revision bigint, change jsonb, actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m menu_items%rowtype;
begin
 if not exists(select 1 from staff_memberships where user_id=actor and role='booth_lead') then raise exception 'LEAD_REQUIRED'; end if;
 if (change->>'priceCents')::integer not between 0 and 100000 or length(trim(change->>'name')) not between 1 and 80 or jsonb_array_length(change->'allowedMilk') not between 1 and 12 or jsonb_array_length(change->'allowedTemperatures') not between 1 and 2 then raise exception 'MENU_INVALID'; end if;
 update menu_items set name=change->>'name',price_cents=(change->>'priceCents')::integer,
 allowed_milk=array(select jsonb_array_elements_text(change->'allowedMilk')),
 allowed_temperatures=array(select jsonb_array_elements_text(change->'allowedTemperatures')),
 sold_out=(change->>'soldOut')::boolean,active=(change->>'active')::boolean,revision=revision+1
 where id=item_id and revision=expected_revision returning * into m;
 if not found then raise exception 'REVISION_CONFLICT'; end if;
 return jsonb_build_object('id',m.id,'name',m.name,'priceCents',m.price_cents,'allowedMilk',m.allowed_milk,'allowedTemperatures',m.allowed_temperatures,'soldOut',m.sold_out,'active',m.active,'revision',m.revision);
end; $$;
revoke all on function public.update_menu_item(uuid,bigint,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.update_menu_item(uuid,bigint,jsonb,uuid) to service_role;
create or replace function public.apply_queue_operation(op jsonb, actor uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
 d devices%rowtype; o orders%rowtype; m menu_items%rowtype;
 receipt sync_receipts%rowtype; item jsonb; body jsonb := op->'payload'; ticket jsonb;
 seq bigint := (op->>'deviceSequence')::bigint; result jsonb; amount bigint := 0; target order_status;
begin
 if not exists(select 1 from staff_memberships where user_id=actor) then raise exception 'STAFF_REQUIRED'; end if;
 if op->>'kind'='updateMenu' and not exists(select 1 from staff_memberships where user_id=actor and role='booth_lead') then raise exception 'LEAD_REQUIRED'; end if;
 select * into d from devices where id=(op->>'deviceId')::uuid for update;
 if not found or d.revoked_at is not null then raise exception 'DEVICE_INVALID'; end if;
 select * into receipt from sync_receipts where operation_id=(op->>'operationId')::uuid;
 if found then
  if receipt.device_id<>d.id or receipt.device_sequence<>seq or receipt.entity_id<>(op->>'entityId')::uuid then raise exception 'OPERATION_ID_REUSED'; end if;
  return receipt.result;
 end if;
 if seq<>d.next_sequence then raise exception 'SEQUENCE_CONFLICT'; end if;
 if op->>'kind'='updateMenu' then
  if (body->>'id')::uuid<>(op->>'entityId')::uuid then raise exception 'IDENTITY_INVALID'; end if;
  result := public.update_menu_item((op->>'entityId')::uuid,(op->>'expectedRevision')::bigint,body,actor);
  result := jsonb_build_object('operationId',op->>'operationId','outcome','acknowledged','revision',result->'revision');
 elsif op->>'kind'='createOrder' then
  ticket := body->'order';
  if (ticket->>'deviceId')::uuid<>d.id or (ticket->>'stationId')::uuid<>d.station_id or (ticket->>'id')::uuid<>(op->>'entityId')::uuid or (ticket->>'deviceSequence')::bigint<>seq or (op->>'expectedRevision')::bigint<>0 then raise exception 'IDENTITY_INVALID'; end if;
  if ticket->>'publicNumber' <> to_char((ticket->>'eventDay')::date,'MMDD')||'-'||d.prefix||'-'||lpad(seq::text,greatest(3,length(seq::text)),'0') then raise exception 'NUMBER_INVALID'; end if;
  if jsonb_array_length(ticket->'items')<1 then raise exception 'EMPTY_ORDER'; end if;
  for item in select * from jsonb_array_elements(ticket->'items') loop
   select * into m from menu_items where id=(item->>'menuItemId')::uuid for share;
   if not found or not m.active or m.sold_out or m.price_cents<>(item->>'unitPriceCentsSnapshot')::integer or m.name<>item->>'nameSnapshot' or not (item->>'milk'=any(m.allowed_milk)) or not (item->>'temperature'=any(m.allowed_temperatures)) then raise exception 'MENU_CONFLICT'; end if;
   if (item->>'quantity')::integer not between 1 and 100 then raise exception 'QUANTITY_INVALID'; end if;
   amount := amount+m.price_cents*(item->>'quantity')::integer;
  end loop;
  if amount<>(ticket->>'totalCents')::bigint then raise exception 'TOTAL_INVALID'; end if;
  insert into orders(id,public_number,station_id,device_id,device_sequence,event_day,first_name,tracking_token_hash,total_cents,created_at_device)
  values((ticket->>'id')::uuid,ticket->>'publicNumber',d.station_id,d.id,seq,(ticket->>'eventDay')::date,ticket->>'firstName',body->>'trackingTokenHash',amount,(ticket->>'createdAtDevice')::timestamptz) returning * into o;
  for item in select * from jsonb_array_elements(ticket->'items') loop
   insert into order_items(order_id,menu_item_id,name_snapshot,unit_price_cents_snapshot,quantity,milk,temperature)
   values(o.id,(item->>'menuItemId')::uuid,item->>'nameSnapshot',(item->>'unitPriceCentsSnapshot')::integer,(item->>'quantity')::integer,item->>'milk',item->>'temperature');
  end loop;
 elsif op->>'kind' in ('advanceOrder','cancelOrder') then
  select * into o from orders where id=(op->>'entityId')::uuid for update;
  if not found or o.station_id<>d.station_id then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.revision<>(op->>'expectedRevision')::bigint then raise exception 'REVISION_CONFLICT'; end if;
  target := case when op->>'kind'='cancelOrder' then 'cancelled' else body->>'status' end;
  if not ((o.status='queued' and target='making') or (o.status='making' and target='ready') or (o.status='ready' and target='collected') or (o.status in ('queued','making','ready') and target='cancelled')) then raise exception 'TRANSITION_INVALID'; end if;
  update orders set status=target,revision=revision+1,updated_at_server=now(),cancellation_reason=case when target='cancelled' then body->>'reason' else null end where id=o.id returning * into o;
 else raise exception 'OPERATION_UNSUPPORTED'; end if;
 if result is null then result := jsonb_build_object('operationId',op->>'operationId','outcome','acknowledged','revision',o.revision); end if;
 insert into sync_receipts(operation_id,device_id,device_sequence,entity_id,kind,result) values((op->>'operationId')::uuid,d.id,seq,(op->>'entityId')::uuid,op->>'kind',result);
 update devices set next_sequence=seq+1,last_seen_at=now() where id=d.id;
 return result;
end; $$;
revoke all on function public.apply_queue_operation(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.apply_queue_operation(jsonb,uuid) to service_role;

-- One SQL statement gives orders and device freshness one consistent snapshot.
-- A server receipt cannot establish a disconnected tablet's current pending count.
create function public.lead_report_snapshot(report_day date, actor uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if not exists(select 1 from staff_memberships where user_id=actor and role='booth_lead') then raise exception 'LEAD_REQUIRED'; end if;
 select jsonb_build_object('orders',coalesce((select jsonb_agg(to_jsonb(o) - 'tracking_token_hash' - 'first_name' || jsonb_build_object('order_items',(select jsonb_agg(to_jsonb(i)) from order_items i where i.order_id=o.id))) from orders o where o.event_day=report_day),'[]'::jsonb),
 'devices',coalesce((select jsonb_agg(jsonb_build_object('deviceId',id,'prefix',prefix,'pendingOperations',null,'lastSeenAt',last_seen_at)) from devices),'[]'::jsonb)) into result;
 return result;
end; $$;
revoke all on function public.lead_report_snapshot(date,uuid) from public,anon,authenticated;
grant execute on function public.lead_report_snapshot(date,uuid) to service_role;
commit;

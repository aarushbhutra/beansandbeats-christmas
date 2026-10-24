-- Apply in a fresh Supabase project. All operational writes go through server code.
begin;
create type public.staff_role as enum ('barista','booth_lead');
create type public.order_status as enum ('queued','making','ready','collected','cancelled');
create table public.stations(id uuid primary key default gen_random_uuid(), name text not null);
create table public.staff_memberships(user_id uuid primary key references auth.users(id) on delete cascade, role public.staff_role not null);
create table public.devices(
 id uuid primary key default gen_random_uuid(), prefix text not null unique check(prefix ~ '^[A-Z]{1,4}$'),
 station_id uuid not null references public.stations, registered_by uuid not null references auth.users,
 registered_at timestamptz not null default now(), last_seen_at timestamptz,
 next_sequence bigint not null default 1 check(next_sequence > 0), revoked_at timestamptz
);
create table public.menu_items(
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
 price_cents integer not null check(price_cents >= 0), allowed_milk text[] not null,
 allowed_temperatures text[] not null check(allowed_temperatures <@ array['hot','iced']::text[]),
 sold_out boolean not null default false, active boolean not null default true, revision bigint not null default 1
);
create table public.orders(
 id uuid primary key, public_number text not null, station_id uuid not null references public.stations,
 device_id uuid not null references public.devices, device_sequence bigint not null check(device_sequence > 0),
 event_day date not null, first_name text not null check(length(first_name) between 1 and 60),
 tracking_token_hash text not null unique check(tracking_token_hash ~ '^[a-f0-9]{64}$'),
 total_cents integer not null check(total_cents >= 0), status public.order_status not null default 'queued',
 revision bigint not null default 1, server_sequence bigint generated always as identity unique,
 created_at_device timestamptz not null, received_at_server timestamptz not null default now(),
 updated_at_server timestamptz not null default now(), cancellation_reason text,
 unique(event_day,public_number), unique(device_id,device_sequence),
 check(status <> 'cancelled' or (cancellation_reason is not null and length(trim(cancellation_reason)) > 0))
);
create index orders_queue on public.orders(event_day,status,server_sequence);
create table public.order_items(
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders,
 menu_item_id uuid not null references public.menu_items, name_snapshot text not null,
 unit_price_cents_snapshot integer not null check(unit_price_cents_snapshot >= 0), quantity integer not null check(quantity > 0),
 milk text not null, temperature text not null check(temperature in ('hot','iced'))
);
-- Fulfilled item snapshots cannot be updated/deleted, even after a menu price change.
create function public.reject_item_mutation() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'Order item snapshots are immutable'; end; $$;
create trigger immutable_order_items before update or delete on public.order_items for each row execute function public.reject_item_mutation();
create table public.sync_receipts(
 operation_id uuid primary key, device_id uuid not null references public.devices,
 device_sequence bigint not null check(device_sequence > 0), entity_id uuid not null,
 kind text not null check(kind in ('createOrder','advanceOrder','cancelOrder','updateMenu')),
 result jsonb not null, received_at timestamptz not null default now(), unique(device_id,device_sequence)
);
-- Default deny: no public data/table policies. Staff/guest routes authorize requests
-- before using the server-only service role. Membership cannot be self-assigned.
alter table public.stations enable row level security;
alter table public.staff_memberships enable row level security;
alter table public.devices enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.sync_receipts enable row level security;
revoke all on public.stations,public.staff_memberships,public.devices,public.menu_items,public.orders,public.order_items,public.sync_receipts from anon,authenticated;
commit;
-- Transactional sync RPC, revision locking and registration endpoint are next milestone.

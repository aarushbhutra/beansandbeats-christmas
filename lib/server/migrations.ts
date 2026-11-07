/**
 * Schema lives in its own `bb` schema so it never collides with other tables in a shared
 * Supabase/Neon database. Each migration runs in one transaction under an advisory lock.
 * Never edit an applied migration; append a new one.
 */
export const MIGRATIONS: { version: string; statements: string[] }[] = [
  {
    version: "2026110701_core",
    statements: [
      `create table bb.staff(
        id uuid primary key default gen_random_uuid(),
        username text not null unique check (username ~ '^[a-z0-9._-]{2,32}$'),
        display_name text not null check (length(display_name) between 1 and 60),
        role text not null check (role in ('barista','lead')),
        password_hash text not null,
        active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`,
      `create table bb.sessions(
        id uuid primary key default gen_random_uuid(),
        token_hash text not null unique,
        staff_id uuid not null references bb.staff(id) on delete cascade,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null,
        last_seen_at timestamptz not null default now(),
        revoked_at timestamptz
      )`,
      `create index sessions_staff on bb.sessions(staff_id)`,
      `create table bb.login_attempts(
        id bigserial primary key,
        key text not null,
        success boolean not null,
        at timestamptz not null default now()
      )`,
      `create index login_attempts_key on bb.login_attempts(key, at)`,
      `create table bb.devices(
        id uuid primary key default gen_random_uuid(),
        prefix text not null unique check (prefix ~ '^[A-Z]{1,2}$'),
        label text not null check (length(label) between 1 and 40),
        registered_by uuid not null references bb.staff(id),
        registered_at timestamptz not null default now(),
        next_sequence integer not null default 1 check (next_sequence > 0),
        last_seen_at timestamptz,
        pending_ops integer,
        gap_expected integer,
        app_version text,
        revoked_at timestamptz
      )`,
      `create table bb.menu_items(
        id uuid primary key default gen_random_uuid(),
        name text not null check (length(name) between 1 and 60),
        description text not null default '' check (length(description) <= 140),
        category text not null default 'coffee' check (category in ('coffee','seasonal','not-coffee')),
        price_cents integer not null check (price_cents between 0 and 100000),
        allowed_milk text[] not null check (cardinality(allowed_milk) between 1 and 12),
        allowed_temperatures text[] not null check (allowed_temperatures <@ array['hot','iced']::text[] and cardinality(allowed_temperatures) between 1 and 2),
        sold_out boolean not null default false,
        active boolean not null default true,
        sort_order integer not null default 0,
        revision integer not null default 1,
        updated_at timestamptz not null default now(),
        updated_by uuid references bb.staff(id)
      )`,
      `create table bb.menu_revisions(
        menu_item_id uuid not null references bb.menu_items(id),
        revision integer not null,
        name text not null,
        price_cents integer not null,
        allowed_milk text[] not null,
        allowed_temperatures text[] not null,
        sold_out boolean not null,
        active boolean not null,
        changed_at timestamptz not null default now(),
        changed_by uuid references bb.staff(id),
        primary key (menu_item_id, revision)
      )`,
      `create sequence bb.server_order_seq`,
      `create table bb.orders(
        id uuid primary key,
        public_number text not null,
        device_id uuid not null references bb.devices(id),
        device_sequence integer not null,
        event_day date not null,
        first_name text check (first_name is null or length(first_name) between 1 and 40),
        name_purged_at timestamptz,
        tracking_token_hash text not null unique check (tracking_token_hash ~ '^[a-f0-9]{64}$'),
        total_cents integer not null check (total_cents >= 0),
        status text not null default 'queued' check (status in ('queued','making','ready','collected','cancelled')),
        revision integer not null default 1,
        flags text[] not null default '{}',
        server_seq bigint not null default nextval('bb.server_order_seq'),
        created_at_device timestamptz not null,
        received_at_server timestamptz not null default now(),
        updated_at_server timestamptz not null default now(),
        making_at timestamptz,
        ready_at timestamptz,
        collected_at timestamptz,
        cancelled_at timestamptz,
        cancellation_reason text,
        created_by uuid references bb.staff(id),
        unique (event_day, public_number),
        check (status <> 'cancelled' or length(trim(coalesce(cancellation_reason, ''))) > 0)
      )`,
      `create index orders_day_status on bb.orders(event_day, status, server_seq)`,
      `create table bb.order_items(
        id uuid primary key default gen_random_uuid(),
        order_id uuid not null references bb.orders(id),
        line_no integer not null,
        menu_item_id uuid not null references bb.menu_items(id),
        menu_revision integer not null,
        name_snapshot text not null,
        unit_price_cents_snapshot integer not null check (unit_price_cents_snapshot >= 0),
        quantity integer not null check (quantity between 1 and 50),
        milk text not null,
        temperature text not null check (temperature in ('hot','iced')),
        unique (order_id, line_no)
      )`,
      `create function bb.reject_item_mutation() returns trigger language plpgsql as $$
        begin raise exception 'order item snapshots are immutable'; end $$`,
      `create trigger order_items_immutable before update or delete on bb.order_items
        for each row execute function bb.reject_item_mutation()`,
      `create table bb.order_events(
        id bigserial primary key,
        order_id uuid not null references bb.orders(id),
        kind text not null,
        from_status text,
        to_status text,
        actor_id uuid references bb.staff(id),
        device_id uuid references bb.devices(id),
        op_id uuid,
        at_device timestamptz,
        at_server timestamptz not null default now(),
        detail text
      )`,
      `create index order_events_order on bb.order_events(order_id)`,
      `create table bb.sync_receipts(
        op_id uuid primary key,
        device_id uuid not null references bb.devices(id),
        seq integer not null,
        kind text not null,
        entity_id uuid not null,
        outcome text not null,
        code text,
        message text,
        actor_id uuid references bb.staff(id),
        received_at timestamptz not null default now(),
        unique (device_id, seq)
      )`,
      `create table bb.sync_issues(
        id uuid primary key default gen_random_uuid(),
        op_id uuid not null,
        device_id uuid not null references bb.devices(id),
        entity_id uuid,
        kind text not null,
        code text not null,
        message text not null,
        created_at timestamptz not null default now(),
        resolved_at timestamptz,
        resolved_by uuid references bb.staff(id)
      )`,
      `create table bb.audit_log(
        id bigserial primary key,
        actor_id uuid,
        action text not null,
        target text,
        detail jsonb,
        at timestamptz not null default now()
      )`,
      `create table bb.day_closures(
        event_day date primary key,
        closed_by uuid not null references bb.staff(id),
        closed_at timestamptz not null default now(),
        summary jsonb not null,
        note text
      )`,
      `create table bb.feed_state(
        id integer primary key check (id = 1),
        seq bigint not null default 0,
        changed_at timestamptz not null default now()
      )`,
      `insert into bb.feed_state(id, seq) values (1, 0)`,
      // Defence in depth: nothing outside the server's own role can read the schema.
      `revoke all on schema bb from public`,
      `do $$ declare t text; begin
        for t in select tablename from pg_tables where schemaname = 'bb' loop
          execute format('alter table bb.%I enable row level security', t);
        end loop;
      end $$`,
    ],
  },
  {
    // Modifier pricing (iced +$1, oat +$1), captured per menu revision so old sales stay verifiable.
    version: "2026110801_modifier_prices",
    statements: [
      `alter table bb.menu_items add column iced_surcharge_cents integer not null default 0 check (iced_surcharge_cents between 0 and 10000)`,
      `alter table bb.menu_items add column milk_surcharges jsonb not null default '{}'::jsonb`,
      `alter table bb.menu_revisions add column iced_surcharge_cents integer not null default 0`,
      `alter table bb.menu_revisions add column milk_surcharges jsonb not null default '{}'::jsonb`,
    ],
  },
];

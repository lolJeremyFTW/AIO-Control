-- 075_billing.sql
-- Minimal local billing state for Stripe-backed workspace subscriptions.
-- Stripe remains optional: the app can render local state and clear setup
-- messages even when STRIPE_SECRET_KEY is not configured.

create or replace function aio_control.is_global_admin()
returns boolean
language sql
security definer
set search_path = aio_control
stable
as $$
  select exists (
    select 1
    from aio_control.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  );
$$;

create table if not exists aio_control.billing_customers (
  workspace_id uuid primary key references aio_control.workspaces(id) on delete cascade,
  stripe_customer_id text unique,
  billing_email text,
  tax_id text,
  plan_id text not null default 'free'
    check (plan_id in ('free', 'pro', 'team', 'enterprise')),
  billing_cadence text not null default 'monthly'
    check (billing_cadence in ('monthly', 'yearly')),
  status text not null default 'local',
  discount_percent integer not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  discount_label text,
  discount_expires_at timestamptz,
  discount_created_by uuid references aio_control.profiles(id) on delete set null,
  discount_created_at timestamptz,
  managed_internally boolean not null default false,
  stripe_coupon_id text,
  stripe_coupon_percent integer,
  stripe_coupon_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_customers_stripe_customer
  on aio_control.billing_customers(stripe_customer_id)
  where stripe_customer_id is not null;

drop trigger if exists trg_touch_billing_customers
  on aio_control.billing_customers;
create trigger trg_touch_billing_customers
  before update on aio_control.billing_customers
  for each row execute function aio_control._touch_updated_at();

create table if not exists aio_control.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  stripe_invoice_id text not null unique,
  number text,
  status text not null default 'unknown',
  currency text not null default 'eur',
  amount_due_cents integer not null default 0,
  amount_paid_cents integer not null default 0,
  billing_email text,
  hosted_invoice_url text,
  invoice_pdf_url text,
  issued_at timestamptz not null,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_invoices_workspace_issued
  on aio_control.billing_invoices(workspace_id, issued_at desc);

drop trigger if exists trg_touch_billing_invoices
  on aio_control.billing_invoices;
create trigger trg_touch_billing_invoices
  before update on aio_control.billing_invoices
  for each row execute function aio_control._touch_updated_at();

alter table aio_control.billing_customers enable row level security;
alter table aio_control.billing_invoices enable row level security;

drop policy if exists "billing_customers_read_member_or_global_admin"
  on aio_control.billing_customers;
create policy "billing_customers_read_member_or_global_admin"
  on aio_control.billing_customers for select
  using (
    aio_control.is_workspace_member(workspace_id)
    or aio_control.is_global_admin()
  );

drop policy if exists "billing_invoices_read_member_or_global_admin"
  on aio_control.billing_invoices;
create policy "billing_invoices_read_member_or_global_admin"
  on aio_control.billing_invoices for select
  using (
    aio_control.is_workspace_member(workspace_id)
    or aio_control.is_global_admin()
  );

revoke all on table aio_control.billing_customers from anon, authenticated;
revoke all on table aio_control.billing_invoices from anon, authenticated;

grant select on aio_control.billing_customers to authenticated;
grant select on aio_control.billing_invoices to authenticated;
grant all on table aio_control.billing_customers to service_role;
grant all on table aio_control.billing_invoices to service_role;

comment on table aio_control.billing_customers is
  'Per-workspace billing/customer state. Discount fields are written only by trusted server actions after global-admin checks.';

comment on table aio_control.billing_invoices is
  'Cached Stripe invoices for the billing UI. Rows are synced by trusted server routes/helpers.';

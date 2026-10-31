create table if not exists public.products (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  name text not null check (length(trim(name)) between 1 and 70),
  category text not null check (length(trim(category)) between 1 and 40),
  price numeric(12, 2) not null check (price >= 0),
  stock integer not null check (stock >= 0),
  sku text not null default '',
  emoji text not null default '📦',
  primary key (owner_id, id)
);

create unique index if not exists products_owner_sku_unique
  on public.products (owner_id, lower(sku)) where sku <> '';

create table if not exists public.sales (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  created_at bigint not null,
  payment_method text not null check (payment_method in ('Cash', 'Card', 'Mobile payment', 'Credit', 'Other')),
  total numeric(12, 2) not null check (total >= 0),
  cash_received numeric(12, 2),
  change_amount numeric(12, 2) not null default 0 check (change_amount >= 0),
  customer_name text,
  primary key (owner_id, id)
);

create index if not exists sales_owner_created_idx on public.sales (owner_id, created_at desc);

create table if not exists public.sale_items (
  id bigint generated always as identity primary key,
  owner_id uuid not null,
  sale_id text not null,
  product_id text,
  product_name text not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  position integer not null default 0,
  foreign key (owner_id, sale_id) references public.sales(owner_id, id) on delete cascade
);

create index if not exists sale_items_owner_sale_idx on public.sale_items (owner_id, sale_id);

create table if not exists public.credit_repayments (
  owner_id uuid not null,
  id text not null,
  sale_id text not null,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('Cash', 'Card', 'Mobile payment', 'Other')),
  created_at bigint not null,
  primary key (owner_id, id),
  foreign key (owner_id, sale_id) references public.sales(owner_id, id) on delete cascade
);

create index if not exists repayments_owner_sale_idx on public.credit_repayments (owner_id, sale_id, created_at);

create table if not exists public.data_imports (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  imported_at timestamptz not null default now(),
  product_count integer not null,
  sale_count integer not null
);

alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.credit_repayments enable row level security;
alter table public.data_imports enable row level security;

drop policy if exists "Shop owners manage their products" on public.products;
create policy "Shop owners manage their products" on public.products
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists "Shop owners read their sales" on public.sales;
create policy "Shop owners read their sales" on public.sales
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "Shop owners read their sale items" on public.sale_items;
create policy "Shop owners read their sale items" on public.sale_items
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "Shop owners read their repayments" on public.credit_repayments;
create policy "Shop owners read their repayments" on public.credit_repayments
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "Shop owners read their import status" on public.data_imports;
create policy "Shop owners read their import status" on public.data_imports
  for select to authenticated using (owner_id = (select auth.uid()));

create or replace function public.record_sale(p_sale jsonb)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_sale_id text;
  v_payment_method text;
  v_customer_name text;
  v_cash_received numeric(12, 2);
  v_total numeric(12, 2) := 0;
  v_change numeric(12, 2) := 0;
  v_created_at bigint;
  v_items jsonb := '[]'::jsonb;
  v_quantity integer;
  v_product_id text;
begin
  if v_owner is null then raise exception 'Sign in is required.'; end if;
  if jsonb_typeof(p_sale->'items') is distinct from 'array' then
    raise exception 'A sale must contain an item list.';
  end if;
  if jsonb_array_length(p_sale->'items') = 0 then
    raise exception 'A sale must contain at least one item.';
  end if;
  if (select count(*) from jsonb_array_elements(p_sale->'items')) <>
     (select count(distinct value->>'productId') from jsonb_array_elements(p_sale->'items')) then
    raise exception 'A product appears more than once in this sale.';
  end if;

  v_sale_id := nullif(trim(p_sale->>'id'), '');
  v_payment_method := p_sale->>'paymentMethod';
  v_customer_name := nullif(trim(p_sale->>'customerName'), '');
  if v_sale_id is null or v_payment_method is null
    or v_payment_method not in ('Cash', 'Card', 'Mobile payment', 'Credit', 'Other') then
    raise exception 'Sale details are invalid.';
  end if;
  if v_payment_method = 'Credit' and v_customer_name is null then
    raise exception 'A customer name is required for credit sales.';
  end if;
  if v_payment_method = 'Cash' then
    v_cash_received := (p_sale->>'cashReceived')::numeric;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_sale->'items')
    order by value->>'productId'
  loop
    v_product_id := nullif(trim(v_item->>'productId'), '');
    v_quantity := (v_item->>'quantity')::integer;
    if v_product_id is null or v_quantity is null or v_quantity < 1 then
      raise exception 'Sale items are invalid.';
    end if;
    select * into v_product from public.products
      where owner_id = v_owner and id = v_product_id for update;
    if not found then raise exception 'A product in this sale no longer exists.'; end if;
    if v_product.stock < v_quantity then
      raise exception 'Insufficient stock for % (available: %).', v_product.name, v_product.stock;
    end if;
    update public.products set stock = stock - v_quantity
      where owner_id = v_owner and id = v_product_id;
    v_total := v_total + v_product.price * v_quantity;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'productId', v_product.id, 'name', v_product.name, 'price', v_product.price, 'quantity', v_quantity
    ));
  end loop;

  if v_payment_method = 'Cash' and (v_cash_received is null or v_cash_received < v_total) then
    raise exception 'Cash received must be at least the current sale total.';
  end if;
  if v_payment_method = 'Cash' then v_change := v_cash_received - v_total; end if;
  v_created_at := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

  insert into public.sales (owner_id, id, created_at, payment_method, total, cash_received, change_amount, customer_name)
  values (v_owner, v_sale_id, v_created_at, v_payment_method, v_total, v_cash_received, v_change, v_customer_name);

  insert into public.sale_items (owner_id, sale_id, product_id, product_name, unit_price, quantity, position)
  select v_owner, v_sale_id, item.value->>'productId', item.value->>'name', (item.value->>'price')::numeric,
    (item.value->>'quantity')::integer, item.ordinality::integer - 1
  from jsonb_array_elements(v_items) with ordinality as item(value, ordinality);

  return v_sale_id;
end;
$$;

create or replace function public.record_credit_repayment(p_sale_id text, p_customer_name text, p_repayment jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_repaid numeric(12, 2);
  v_amount numeric(12, 2);
  v_method text;
begin
  if v_owner is null then raise exception 'Sign in is required.'; end if;
  select * into v_sale from public.sales
    where owner_id = v_owner and id = p_sale_id for update;
  if not found or v_sale.payment_method <> 'Credit' then raise exception 'Credit sale not found.'; end if;
  if length(trim(coalesce(p_customer_name, ''))) = 0 then raise exception 'A customer name is required.'; end if;

  if p_repayment is not null then
    v_amount := (p_repayment->>'amount')::numeric;
    v_method := p_repayment->>'paymentMethod';
    select coalesce(sum(amount), 0) into v_repaid from public.credit_repayments
      where owner_id = v_owner and sale_id = p_sale_id;
    if v_amount <= 0 or v_amount > v_sale.total - v_repaid then raise exception 'Repayment exceeds the outstanding balance.'; end if;
    if v_method not in ('Cash', 'Card', 'Mobile payment', 'Other') or nullif(trim(p_repayment->>'id'), '') is null then
      raise exception 'Repayment details are invalid.';
    end if;
    insert into public.credit_repayments (owner_id, id, sale_id, amount, payment_method, created_at)
    values (v_owner, p_repayment->>'id', p_sale_id, v_amount, v_method,
      floor(extract(epoch from clock_timestamp()) * 1000)::bigint);
  end if;

  update public.sales set customer_name = trim(p_customer_name)
    where owner_id = v_owner and id = p_sale_id;
end;
$$;

create or replace function public.import_legacy_data(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_product jsonb;
  v_sale jsonb;
  v_repayment jsonb;
  v_products integer;
  v_sales integer;
begin
  if v_owner is null then raise exception 'Sign in is required.'; end if;
  if exists (select 1 from public.data_imports where owner_id = v_owner) then
    raise exception 'A local data import has already been completed for this account.';
  end if;
  if jsonb_typeof(p_payload->'products') is distinct from 'array'
    or jsonb_typeof(p_payload->'sales') is distinct from 'array' then
    raise exception 'The local data format is invalid.';
  end if;
  if exists (select 1 from public.products where owner_id = v_owner)
    or exists (select 1 from public.sales where owner_id = v_owner) then
    raise exception 'Import is only allowed into an empty account.';
  end if;

  v_products := jsonb_array_length(p_payload->'products');
  v_sales := jsonb_array_length(p_payload->'sales');
  for v_product in select value from jsonb_array_elements(p_payload->'products') loop
    insert into public.products (owner_id, id, name, category, price, stock, sku, emoji)
    values (v_owner, v_product->>'id', v_product->>'name', v_product->>'category',
      (v_product->>'price')::numeric, (v_product->>'stock')::integer,
      coalesce(v_product->>'sku', ''), coalesce(v_product->>'emoji', '📦'));
  end loop;

  for v_sale in select value from jsonb_array_elements(p_payload->'sales') loop
    insert into public.sales (owner_id, id, created_at, payment_method, total, cash_received, change_amount, customer_name)
    values (v_owner, v_sale->>'id', (v_sale->>'createdAt')::bigint, v_sale->>'paymentMethod',
      (v_sale->>'total')::numeric, nullif(v_sale->>'cashReceived', '')::numeric,
      coalesce(nullif(v_sale->>'change', '')::numeric, 0), nullif(v_sale->>'customerName', ''));

    insert into public.sale_items (owner_id, sale_id, product_id, product_name, unit_price, quantity, position)
    select v_owner, v_sale->>'id', nullif(item.value->>'productId', ''), item.value->>'name',
      (item.value->>'price')::numeric, (item.value->>'quantity')::integer, item.ordinality::integer - 1
    from jsonb_array_elements(coalesce(v_sale->'items', '[]'::jsonb)) with ordinality as item(value, ordinality);

    insert into public.credit_repayments (owner_id, id, sale_id, amount, payment_method, created_at)
    select v_owner, repayment.value->>'id', v_sale->>'id', (repayment.value->>'amount')::numeric,
      repayment.value->>'paymentMethod', (repayment.value->>'createdAt')::bigint
    from jsonb_array_elements(coalesce(v_sale->'repayments', '[]'::jsonb)) as repayment(value);
  end loop;

  insert into public.data_imports (owner_id, product_count, sale_count)
    values (v_owner, v_products, v_sales);
  return jsonb_build_object('products', v_products, 'sales', v_sales);
end;
$$;

revoke all on function public.record_sale(jsonb) from public, anon;
revoke all on function public.record_credit_repayment(text, text, jsonb) from public, anon;
revoke all on function public.import_legacy_data(jsonb) from public, anon;
grant execute on function public.record_sale(jsonb) to authenticated;
grant execute on function public.record_credit_repayment(text, text, jsonb) to authenticated;
grant execute on function public.import_legacy_data(jsonb) to authenticated;

grant select, insert, update on public.products to authenticated;
grant select on public.sales, public.sale_items, public.credit_repayments, public.data_imports to authenticated;
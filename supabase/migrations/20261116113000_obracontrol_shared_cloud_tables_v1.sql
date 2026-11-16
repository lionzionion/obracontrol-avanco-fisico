-- ObraControl: base exclusiva dentro do projeto AMBEV Pedidos RL.
-- Não altera tabelas, políticas ou contas do aplicativo de refeições.
create table public.obc_items (
  id text primary key,
  contract text not null check (contract in ('gabioes','demolicao')),
  code text not null,
  description text not null,
  unit text not null,
  planned numeric(16,2) not null check (planned > 0),
  group_code text not null default '',
  created_at timestamptz not null default now()
);
create table public.obc_configs (
  item_id text primary key references public.obc_items(id) on delete cascade,
  unit text not null check (unit in ('%','m³','m²','m','t','und','VB')),
  planned numeric(16,2) not null check (planned > 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create table public.obc_entries (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references public.obc_items(id),
  kind text not null check (kind in ('production','measurement')),
  work_date date not null,
  qty numeric(16,2) not null check (qty > 0),
  front text not null default '' check (length(front) <= 120),
  author text not null default '' check (length(author) <= 100),
  note text not null default '' check (length(note) <= 1200),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index obc_entries_item_date_idx on public.obc_entries(item_id,work_date desc);
create index obc_entries_created_idx on public.obc_entries(created_at desc);
create table public.obc_photos (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.obc_entries(id) on delete cascade,
  item_id text not null references public.obc_items(id),
  path text not null unique,
  name text not null check (length(name) <= 140),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index obc_photos_entry_idx on public.obc_photos(entry_id);

-- Validação adicional, protegendo medições acima do realizado, inclusive por API.
create function public.obc_guard_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_prod numeric; v_med numeric; v_unit text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(case when tg_op='DELETE' then old.item_id else new.item_id end));
  select coalesce(sum(qty) filter (where kind='production'),0),
         coalesce(sum(qty) filter (where kind='measurement'),0)
  into v_prod, v_med
  from public.obc_entries
  where item_id = (case when tg_op='DELETE' then old.item_id else new.item_id end);
  if tg_op='DELETE' then
    if old.kind='production' and v_prod-old.qty < v_med then
      raise exception 'Não é possível excluir produção já aprovada em medição';
    end if;
    return old;
  end if;
  select coalesce(c.unit, i.unit) into v_unit
  from public.obc_items i left join public.obc_configs c on c.item_id=i.id
  where i.id=new.item_id;
  if v_unit='und' and new.qty<>trunc(new.qty) then
    raise exception 'Este item exige quantidade inteira';
  end if;
  if new.kind='measurement' and v_med+new.qty>v_prod then
    raise exception 'Medição aprovada não pode superar a quantidade produzida';
  end if;
  return new;
end;
$$;
create trigger obc_entry_guard_insert before insert on public.obc_entries
  for each row execute function public.obc_guard_entry();
create trigger obc_entry_guard_delete before delete on public.obc_entries
  for each row execute function public.obc_guard_entry();

-- Dados de acompanhamento visíveis somente a funcionários ativos (não restaurantes).
alter table public.obc_items enable row level security;
alter table public.obc_configs enable row level security;
alter table public.obc_entries enable row level security;
alter table public.obc_photos enable row level security;
revoke all on public.obc_items, public.obc_configs, public.obc_entries, public.obc_photos from anon, authenticated;
grant select on public.obc_items to authenticated;
grant select,insert,update on public.obc_configs to authenticated;
grant select,insert,delete on public.obc_entries to authenticated;
grant select,insert,delete on public.obc_photos to authenticated;

create policy obc_items_team_read on public.obc_items for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role in ('admin','colaborador')));
create policy obc_configs_team_read on public.obc_configs for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role in ('admin','colaborador')));
create policy obc_configs_admin_insert on public.obc_configs for insert to authenticated
  with check (updated_by=(select auth.uid()) and exists
    (select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));
create policy obc_configs_admin_update on public.obc_configs for update to authenticated
  using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'))
  with check (updated_by=(select auth.uid()) and exists
    (select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));
create policy obc_entries_team_read on public.obc_entries for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role in ('admin','colaborador')));
create policy obc_entries_team_insert on public.obc_entries for insert to authenticated
  with check (created_by=(select auth.uid()) and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active
      and (p.role='admin' or (p.role='colaborador' and kind='production'))
  ));
create policy obc_entries_admin_delete on public.obc_entries for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));
create policy obc_photos_team_read on public.obc_photos for select to authenticated
  using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role in ('admin','colaborador')));
create policy obc_photos_team_insert on public.obc_photos for insert to authenticated
  with check (created_by=(select auth.uid()) and exists (
    select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role in ('admin','colaborador')
  ) and exists (
    select 1 from public.obc_entries e where e.id=entry_id and e.item_id=item_id and e.created_by=(select auth.uid())
  ));
create policy obc_photos_admin_delete on public.obc_photos for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));

-- Bucket privado exclusivo da obra e respectivas políticas de Storage.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('obc-fotos','obc-fotos',false,4194304,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy obc_storage_read on storage.objects for select to authenticated
  using (bucket_id='obc-fotos' and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role in ('admin','colaborador')));
create policy obc_storage_upload on storage.objects for insert to authenticated
  with check (bucket_id='obc-fotos'
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role in ('admin','colaborador'))
    and exists (select 1 from public.obc_entries e
      where e.id::text=(storage.foldername(name))[2] and e.created_by=(select auth.uid())));
create policy obc_storage_admin_delete on storage.objects for delete to authenticated
  using (bucket_id='obc-fotos' and exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));

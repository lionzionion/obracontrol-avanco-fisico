-- ObraControl v2: corrigir apontamentos já lançados sem perder fotos nem histórico.
alter table public.obc_entries
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid references auth.users(id);

-- A edição é exclusiva de administradores ativos; os demais continuam somente com INSERT de produção.
grant update (work_date, qty, front, author, note) on public.obc_entries to authenticated;

create policy obc_entries_admin_update on public.obc_entries for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active and p.role='admin'
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active and p.role='admin'
  ));

-- Mesma trava por item usada por INSERT e DELETE, com cálculo de delta para UPDATE.
create function public.obc_guard_entry_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_prod numeric; v_med numeric; v_unit text;
begin
  if new.id is distinct from old.id
     or new.item_id is distinct from old.item_id
     or new.kind is distinct from old.kind
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Não é permitido alterar identidade, item, tipo ou autoria do lançamento';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(old.item_id));

  select coalesce(sum(qty) filter (where kind='production'), 0),
         coalesce(sum(qty) filter (where kind='measurement'), 0)
    into v_prod,v_med
    from public.obc_entries
   where item_id=old.item_id;

  select coalesce(c.unit, case when i.unit='VB' then '%' else i.unit end)
    into v_unit
    from public.obc_items i
    left join public.obc_configs c on c.item_id=i.id
   where i.id=old.item_id;

  if v_unit='und' and new.qty<>trunc(new.qty) then
    raise exception 'Este item exige quantidade inteira';
  end if;

  if old.kind='measurement' and v_med-old.qty+new.qty>v_prod then
    raise exception 'Medição corrigida não pode superar a quantidade produzida';
  end if;
  if old.kind='production' and v_prod-old.qty+new.qty<v_med then
    raise exception 'Produção corrigida não pode ficar abaixo das medições aprovadas';
  end if;

  new.updated_at=now();
  new.updated_by=auth.uid();
  return new;
end;
$$;

create trigger obc_entry_guard_update
  before update on public.obc_entries
  for each row execute function public.obc_guard_entry_update();

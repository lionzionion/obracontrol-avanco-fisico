-- ObraControl: impedir aprovação de RDO com lançamentos/fotos ausentes.
-- Restrito a transições draft/returned -> submitted -> approved.
-- Não reescreve RDOs/PDFs já aprovados e não altera qualquer BM ou pedido.
create or replace function public.obc_rdo_current_snapshot_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_missing_entries integer;
  v_missing_photos integer;
  v_mismatched_activities integer;
begin
  if not (
    (old.status in ('draft','returned') and new.status='submitted') or
    (old.status='submitted' and new.status='approved')
  ) then
    return new;
  end if;

  select count(*)::integer into v_missing_entries
  from public.obc_entries e
  where e.work_date=new.work_date
    and not (new.source_entry_ids ? e.id::text);

  select count(*)::integer into v_missing_photos
  from public.obc_photos p
  join public.obc_entries e on e.id=p.entry_id
  where e.work_date=new.work_date
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(new.photo_manifest) as ph
      where ph->>'photo_id'=p.id::text
    );

  with day_groups as (
    select e.item_id::text||'::'||lower(btrim(e.front)) as activity_key,
           round(sum(e.qty),2) as qty
    from public.obc_entries e
    where e.work_date=new.work_date and e.kind='production'
    group by e.item_id,lower(btrim(e.front))
  )
  select count(*)::integer into v_mismatched_activities
  from day_groups g
  where not exists (
    select 1
    from pg_catalog.jsonb_array_elements(new.activities) as activity
    where activity->>'key'=g.activity_key
      and case when (activity->>'qty') ~ '^[0-9]+(\.[0-9]+)?$'
        then (activity->>'qty')::numeric=g.qty else false end
  );

  if v_missing_entries>0 or v_missing_photos>0 or v_mismatched_activities>0 then
    raise exception 'RDO desatualizado: % lancamento(s), % foto(s), % atividade(s) divergente(s). Sincronize e reenvie para aprovacao.',
      v_missing_entries,v_missing_photos,v_mismatched_activities
      using errcode='23514';
  end if;
  return new;
end;
$$;

drop trigger if exists obc_rdo_current_snapshot_guard on public.obc_rdos;
create trigger obc_rdo_current_snapshot_guard
before update on public.obc_rdos
for each row execute function public.obc_rdo_current_snapshot_guard();

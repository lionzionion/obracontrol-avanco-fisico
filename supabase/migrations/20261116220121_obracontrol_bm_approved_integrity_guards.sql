-- BMs aprovados sao imutaveis; ajustes em pendentes e previas sao validados por codigo e contrato.
create function public.obc_bm_line_integrity_guard()
returns trigger language plpgsql set search_path = ''
as $$
declare v_status text; v_contract text; v_item_code text; v_item_contract text;
begin
  if tg_op='DELETE' then
    select status into v_status from public.obc_bms where id=old.bm_id;
    if v_status='approved' then raise exception 'Item de BM aprovado nao pode ser excluido'; end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    select status into v_status from public.obc_bms where id=old.bm_id;
    if v_status='approved' then raise exception 'Item de BM aprovado nao pode ser alterado'; end if;
  end if;
  select status,contract into v_status,v_contract from public.obc_bms where id=new.bm_id;
  if v_status='approved' then raise exception 'Nao e permitido alterar itens de BM aprovado'; end if;
  if new.item_id is not null then
    select code,contract into v_item_code,v_item_contract from public.obc_items where id=new.item_id;
    if v_item_code is distinct from new.item_code or v_item_contract is distinct from v_contract then
      raise exception 'O item do BM deve corresponder ao codigo e contrato cadastrados';
    end if;
  end if;
  new.updated_at=now();
  return new;
end;$$;
create trigger obc_bm_line_integrity_guard before insert or update or delete on public.obc_bm_lines
for each row execute function public.obc_bm_line_integrity_guard();
create function public.obc_bm_approved_immutability()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.status='approved' then
    if new.status<>'approved' or new.contract is distinct from old.contract
       or new.number is distinct from old.number or new.reported_gross_value is distinct from old.reported_gross_value
       or new.reported_previous_value is distinct from old.reported_previous_value
       or new.reported_accumulated_value is distinct from old.reported_accumulated_value then
      raise exception 'BM aprovado exige revisao formal, nao alteracao direta';
    end if;
  end if;
  return new;
end;$$;
create trigger obc_bm_approved_immutability before update on public.obc_bms
for each row execute function public.obc_bm_approved_immutability();

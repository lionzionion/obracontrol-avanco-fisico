-- ObraControl BM: estrutura e permissoes. Financeiro e PDFs ficam no Supabase privado.
-- As linhas historicas dos PDFs foram importadas diretamente ao banco, nunca ao repositorio publico.
create table if not exists public.obc_bms (
 id text primary key,
 contract text not null check(contract in ('gabioes','demolicao')),
 number integer not null check(number>0),
 title text not null,
 status text not null default 'draft' check(status in ('approved','pending','draft')),
 period_start date,
 period_end date,
 issue_date date,
 source_filename text not null default '',
 document_path text,
 contract_value numeric(16,2),
 reported_previous_value numeric(16,2),
 reported_gross_value numeric(16,2),
 reported_accumulated_value numeric(16,2),
 notes text not null default '',
 approved_at timestamptz,
 approved_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 constraint obc_bms_contract_number_key unique(contract,number),
 constraint obc_bms_approved_fields check(status<>'approved' or approved_at is not null)
);
create table if not exists public.obc_bm_lines(
 id text primary key,
 bm_id text not null references public.obc_bms(id) on delete cascade,
 section text not null default 'base' check(section in ('base','aditivo')),
 item_id text references public.obc_items(id),
 item_code text not null,
 description text not null default '',
 unit text not null,
 contract_qty numeric(16,2),
 previous_qty numeric(16,2) not null default 0,
 period_qty numeric(16,2) not null check(period_qty>=0),
 reported_total_qty numeric(16,2),
 reported_period_value numeric(16,2),
 unit_price numeric(16,2),
 updated_at timestamptz not null default now(),
 unique(bm_id,section,item_code),
 constraint obc_bm_lines_aditivo_unlinked check(section <> 'aditivo' or item_id is null)
);
create index if not exists obc_bm_lines_item_idx on public.obc_bm_lines(item_id);
create index if not exists obc_bms_contract_status_idx on public.obc_bms(contract,status,number);
alter table public.obc_bms enable row level security;
alter table public.obc_bm_lines enable row level security;
revoke all on public.obc_bms,public.obc_bm_lines from anon,authenticated;
grant select,insert,update on public.obc_bms to authenticated;
grant select,insert,update,delete on public.obc_bm_lines to authenticated;
create policy obc_bms_admin_select on public.obc_bms for select to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));
create policy obc_bms_admin_insert on public.obc_bms for insert to authenticated
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));
create policy obc_bms_admin_update on public.obc_bms for update to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'))
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));
create policy obc_bm_lines_admin_select on public.obc_bm_lines for select to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));
create policy obc_bm_lines_admin_insert on public.obc_bm_lines for insert to authenticated
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));
create policy obc_bm_lines_admin_update on public.obc_bm_lines for update to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'))
with check(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));
create policy obc_bm_lines_admin_delete on public.obc_bm_lines for delete to authenticated
using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));
create function public.obc_bm_approval_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status='approved' and (tg_op='INSERT' or old.status is distinct from new.status) then
    if exists(select 1 from public.obc_bms b where b.contract=new.contract and b.number<new.number and b.status<>'approved') then
      raise exception 'Existem boletins anteriores ainda nao aprovados neste contrato';
    end if;
    new.approved_at=coalesce(new.approved_at,now());
    new.approved_by=coalesce(auth.uid(),new.approved_by);
  elsif new.status<>'approved' then
    new.approved_at=null;
    new.approved_by=null;
  end if;
  new.updated_at=now();
  return new;
end;$$;
create trigger obc_bm_approval_guard before insert or update on public.obc_bms
for each row execute function public.obc_bm_approval_guard();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('obc-bm-pdfs','obc-bm-pdfs',false,15728640,array['application/pdf'])
on conflict(id) do nothing;
create policy obc_bm_pdf_admin_read on storage.objects for select to authenticated
using(bucket_id='obc-bm-pdfs' and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));
create policy obc_bm_pdf_admin_insert on storage.objects for insert to authenticated
with check(bucket_id='obc-bm-pdfs' and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));
create policy obc_bm_pdf_admin_delete on storage.objects for delete to authenticated
using(bucket_id='obc-bm-pdfs' and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='admin'));

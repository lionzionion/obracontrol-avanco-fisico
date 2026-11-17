-- Fotos avulsas de RDO: bucket privativo, sem FK em obc_entries/obc_photos.
-- O manifesto é salvo em public.obc_rdos.photo_manifest já existente.
-- Nunca concede acesso a colaboradores para criação/exclusão de imagens de RDO.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('obc-rdo-photos','obc-rdo-photos',false,4194304,array['image/jpeg'])
on conflict(id) do nothing;

create policy obc_rdo_photo_team_read_v1 on storage.objects
for select to authenticated
using(
  bucket_id='obc-rdo-photos'
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active and p.role in ('admin','colaborador')
  )
);

create policy obc_rdo_photo_admin_insert_v1 on storage.objects
for insert to authenticated
with check(
  bucket_id='obc-rdo-photos'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and name like '%.jpg'
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active and p.role='admin'
  )
  and exists (
    select 1 from public.obc_rdos r
    where r.id::text=(storage.foldername(name))[2]
      and r.status in ('draft','returned')
  )
);

create policy obc_rdo_photo_admin_delete_v1 on storage.objects
for delete to authenticated
using(
  bucket_id='obc-rdo-photos'
  and exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.active and p.role='admin'
  )
  and exists (
    select 1 from public.obc_rdos r
    where r.id::text=(storage.foldername(name))[2]
      and r.status in ('draft','returned')
  )
);

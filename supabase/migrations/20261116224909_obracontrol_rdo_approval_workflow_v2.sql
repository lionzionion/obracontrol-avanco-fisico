-- ObraControl: aprovação auditável de RDO, reutilizando administradores existentes.
-- Revisão de esquema sobre 20261116222538_obracontrol_daily_reports_rdo_v1.sql.
ALTER TABLE public.obc_rdos DROP CONSTRAINT IF EXISTS obc_rdos_status_check;
ALTER TABLE public.obc_rdos ADD CONSTRAINT obc_rdos_status_check
 CHECK (status IN ('draft','submitted','returned','approved','final'));
ALTER TABLE public.obc_rdos DROP CONSTRAINT IF EXISTS obc_rdo_final_pdf;
ALTER TABLE public.obc_rdos ADD CONSTRAINT obc_rdo_final_pdf
 CHECK(status<>'final' OR (pdf_path IS NOT NULL AND finalized_at IS NOT NULL));
ALTER TABLE public.obc_rdos
 ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
 ADD COLUMN IF NOT EXISTS submitted_by uuid references auth.users(id),
 ADD COLUMN IF NOT EXISTS approved_at timestamptz,
 ADD COLUMN IF NOT EXISTS approved_by uuid references auth.users(id),
 ADD COLUMN IF NOT EXISTS approved_name text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS approver_job_title text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS approval_note text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS returned_at timestamptz,
 ADD COLUMN IF NOT EXISTS returned_by uuid references auth.users(id),
 ADD COLUMN IF NOT EXISTS return_reason text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS approval_history jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.obc_rdos ADD CONSTRAINT obc_rdo_approval_complete
 CHECK(status<>'approved' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL AND btrim(approved_name)<>'')); 
ALTER TABLE public.obc_rdos ADD CONSTRAINT obc_rdo_approval_metadata_length
 CHECK(length(approved_name)<=160 AND length(approver_job_title)<=160
 AND length(approval_note)<=1500 AND length(return_reason)<=1500
 AND jsonb_typeof(approval_history)='array');
CREATE INDEX IF NOT EXISTS obc_rdos_approval_status_idx ON public.obc_rdos(status,work_date DESC);

CREATE OR REPLACE FUNCTION public.obc_rdo_revision_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 v_uid uuid := auth.uid();
 v_name text;
 v_title text;
 v_username text;
 v_actor text;
 v_now timestamptz := now();
 v_event text;
 v_requested_note text;
 v_requested_reason text;
 v_immutable_content text[] := ARRAY[
   'status','updated_at','updated_by','approved_at','approved_by',
   'approved_name','approver_job_title','approval_note','returned_at','returned_by',
   'return_reason','approval_history','submitted_at','submitted_by',
   'finalized_at','finalized_by','pdf_path'
 ];
BEGIN
  -- Existing admin RLS permits mutations, this trigger also validates identity.
  SELECT p.display_name, p.job_title, p.username
    INTO v_name,v_title,v_username
    FROM public.profiles p
   WHERE p.id=v_uid AND p.active AND p.role='admin';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Apenas administradores ativos podem editar ou aprovar RDOs';
  END IF;
  v_actor := coalesce(nullif(btrim(v_name),''),nullif(btrim(v_username),''));
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Cadastre o nome de exibicao do aprovador no perfil antes de aprovar';
  END IF;

  IF TG_OP='INSERT' THEN
    IF new.status <> 'draft' THEN
      RAISE EXCEPTION 'Novos RDOs precisam iniciar como rascunho';
    END IF;
    IF new.created_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'Autoria invalida para novo RDO';
    END IF;
    new.approval_history='[]'::jsonb;
    new.submitted_at=null;new.submitted_by=null;
    new.approved_at=null;new.approved_by=null;new.approved_name='';
    new.approver_job_title='';new.approval_note='';
    new.returned_at=null;new.returned_by=null;new.return_reason='';
    new.finalized_at=null;new.finalized_by=null;new.pdf_path=null;
    new.updated_by=v_uid;new.updated_at=v_now;
    RETURN new;
  END IF;

  IF new.id IS DISTINCT FROM old.id OR new.rdo_no IS DISTINCT FROM old.rdo_no
     OR new.work_date IS DISTINCT FROM old.work_date OR new.created_by IS DISTINCT FROM old.created_by
     OR new.created_at IS DISTINCT FROM old.created_at THEN
    RAISE EXCEPTION 'Numero, data e autoria do RDO nao podem ser modificados';
  END IF;
  IF old.status='final' THEN
    RAISE EXCEPTION 'RDO legado finalizado nao pode ser editado';
  END IF;
  IF old.status='approved' THEN
    -- Approval is irrevocable. Permit exactly one PDF archival update.
    IF new.pdf_path IS NULL OR old.pdf_path IS NOT NULL
       OR (to_jsonb(new)-ARRAY['pdf_path','updated_at','updated_by']) IS DISTINCT FROM
          (to_jsonb(old)-ARRAY['pdf_path','updated_at','updated_by']) THEN
      RAISE EXCEPTION 'RDO aprovado bloqueado; so e permitido arquivar seu PDF uma vez';
    END IF;
    IF new.pdf_path NOT LIKE (extract(year from old.work_date)::text||'/'||old.id::text||'/%')
       OR new.pdf_path NOT LIKE '%.pdf' THEN
      RAISE EXCEPTION 'Caminho de PDF inconsistente com o RDO';
    END IF;
    new.updated_at=v_now;
    new.updated_by=v_uid;
    RETURN new;
  END IF;

  IF old.status='submitted' THEN
    IF new.status NOT IN ('approved','returned') THEN
      RAISE EXCEPTION 'RDO enviado so pode ser aprovado ou devolvido';
    END IF;
    IF (to_jsonb(new)-v_immutable_content) IS DISTINCT FROM
       (to_jsonb(old)-v_immutable_content) THEN
      RAISE EXCEPTION 'Conteudo do RDO enviado esta bloqueado durante a revisao';
    END IF;
  ELSIF old.status NOT IN ('draft','returned') THEN
    RAISE EXCEPTION 'Situacao de RDO invalida';
  ELSIF new.status NOT IN (old.status,'submitted') THEN
    RAISE EXCEPTION 'RDO precisa ser enviado para aprovacao antes de aprovar';
  END IF;

  v_requested_note:=new.approval_note;
  v_requested_reason:=new.return_reason;

  -- Protect all audit/stamp columns from client side forgery on every update.
  new.submitted_at=old.submitted_at;new.submitted_by=old.submitted_by;
  new.approved_at=old.approved_at;new.approved_by=old.approved_by;
  new.approved_name=old.approved_name;new.approver_job_title=old.approver_job_title;
  new.approval_note=old.approval_note;
  new.returned_at=old.returned_at;new.returned_by=old.returned_by;
  new.return_reason=old.return_reason;
  new.approval_history=old.approval_history;
  new.pdf_path=old.pdf_path;
  new.finalized_by=old.finalized_by;new.finalized_at=old.finalized_at;

  IF old.status IS DISTINCT FROM new.status THEN
    IF new.status='submitted' THEN
      IF btrim(new.engineer_name)='' THEN
        RAISE EXCEPTION 'Informe o engenheiro responsavel antes de enviar para aprovacao';
      END IF;
      IF jsonb_array_length(new.activities)=0 AND btrim(new.occurrences)=''
         AND btrim(new.general_notes)='' THEN
        RAISE EXCEPTION 'Registre servicos, ocorrencias ou observacoes para justificar o RDO';
      END IF;
      new.submitted_at=v_now;
      new.submitted_by=v_uid;
      new.return_reason='';
      v_event='submitted';
    ELSIF new.status='approved' THEN
      new.approved_at=v_now;
      new.approved_by=v_uid;
      new.approved_name=left(v_actor,160);
      new.approver_job_title=left(coalesce(v_title,''),160);
      new.approval_note=left(btrim(coalesce(v_requested_note,'')),1500);
      new.finalized_at=v_now;
      new.finalized_by=v_uid;
      v_event='approved';
    ELSIF new.status='returned' THEN
      IF length(btrim(coalesce(v_requested_reason,'')))<5 THEN
        RAISE EXCEPTION 'Informe o motivo da devolucao, com ao menos 5 caracteres';
      END IF;
      new.return_reason=left(btrim(v_requested_reason),1500);
      new.returned_at=v_now;
      new.returned_by=v_uid;
      v_event='returned';
    END IF;
    new.approval_history=old.approval_history||jsonb_build_array(
      jsonb_build_object('action',v_event,'at',v_now,'actor_id',v_uid,
        'actor_name',v_actor,'note',case when v_event='returned'
          then new.return_reason when v_event='approved' then new.approval_note else '' end)
    );
  END IF;

  new.updated_by=v_uid;
  new.updated_at=v_now;
  RETURN new;
END;
$function$
;

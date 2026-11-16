/* RL Central / RDOs | painel exclusivamente de consulta.
   RDOs, PDFs e fotografias são obtidos via Supabase Auth e políticas RLS.
   Nenhum INSERT/UPDATE/DELETE, aprovação ou link público de arquivo. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const nf = value => (Number(value)||0).toLocaleString("pt-BR",{maximumFractionDigits:2});
  const dateBR = value => value ? new Date(value+"T12:00:00").toLocaleDateString("pt-BR") : "Não informado";
  const timeBR = value => {
    if(!value)return "Não registrado";
    const date=new Date(value);
    return Number.isNaN(date.getTime())?"Não registrado":date.toLocaleString("pt-BR",{
      timeZone:"America/Recife",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"
    });
  };
  const number = r => "RDO-"+String(Number(r?.rdo_no)||0).padStart(5,"0");
  const statusInfo = {
    approved:{text:"Aprovado",css:"approved"},
    submitted:{text:"Aguardando análise",css:"submitted"},
    returned:{text:"Devolvido",css:"returned"},
    draft:{text:"Rascunho",css:"draft"},
    final:{text:"Finalizado (legado)",css:"final"}
  };
  const status = value => statusInfo[value]||{text:String(value||"Não informado"),css:"draft"};
  const empty = text => '<p class="rdo-label-empty">'+esc(text)+'</p>';
  const toText = value => typeof value==="string"&&value.trim()?value.trim():"Não informado";
  const validPath = (path,extension) => typeof path==="string"&&path.length<=900
    &&/^[a-zA-Z0-9_.\/-]+$/.test(path)&&!path.includes("..")&&!path.startsWith("/")
    &&(extension==="pdf"?/\.pdf$/i.test(path):/\.(jpg|jpeg|png|webp)$/i.test(path));
  const state = {
    client:null,rows:[],error:"",shown:false,selectedId:null,detail:null,
    selectionVersion:0,limit:30,photoUrls:new Map(),imageErrors:0,detailModified:null
  };

  function badge(label){
    const info=status(label);
    return '<span class="rdo-badge status-'+esc(info.css)+'">'+esc(info.text)+'</span>';
  }
  function notice(message="",error=false){
    const target=$("rdoNotice");if(!target)return;
    target.textContent=message;
    target.classList.toggle("rdo-error",error);
  }
  function rowsSorted(){
    return state.rows.slice().sort((a,b)=>String(b.work_date||"").localeCompare(String(a.work_date||""))
      ||(Number(b.rdo_no)||0)-(Number(a.rdo_no)||0));
  }
  function filteredRows(){
    const term=$("rdoSearch").value.trim().toLocaleLowerCase("pt-BR");
    const filter=$("rdoStatusFilter").value;
    const from=$("rdoDateStart").value,to=$("rdoDateEnd").value;
    return rowsSorted().filter(r=>{
      if(filter!=="all"&&r.status!==filter)return false;
      if(from && r.work_date<from)return false;
      if(to && r.work_date>to)return false;
      if(term){
        const haystack=[number(r),r.rdo_no,r.engineer_name,r.approved_name,r.reviewer_name,dateBR(r.work_date)]
          .map(v=>String(v??"")).join(" ").toLocaleLowerCase("pt-BR");
        if(!haystack.includes(term))return false;
      }
      return true;
    });
  }
  function stats(){
    const rows=state.rows;
    const approved=rows.filter(r=>["approved","final"].includes(r.status)).length;
    const pending=rows.filter(r=>r.status==="submitted").length;
    const drafts=rows.filter(r=>["draft","returned"].includes(r.status)).length;
    $("rdoStatTotal").textContent=nf(rows.length);
    $("rdoStatApproved").textContent=nf(approved);
    $("rdoStatPending").textContent=nf(pending);
    $("rdoStatDraft").textContent=nf(drafts);
    $("rdoQuickApproved").textContent=nf(approved);
    $("rdoQuickWaiting").textContent=nf(pending);
  }
  function renderList(){
    stats();
    const list=$("rdoList"),rows=filteredRows();
    $("rdoListCount").textContent=rows.length+" relatório"+(rows.length===1?"":"s")+" encontrado"+(rows.length===1?"":"s");
    if(state.error){
      list.innerHTML=empty("Não foi possível consultar os RDOs: "+state.error);
      $("rdoMore").hidden=true;
      return;
    }
    if(!state.rows.length){
      list.innerHTML=empty("Ainda não há RDO registrado nesta obra. Os próximos relatórios aparecerão aqui automaticamente.");
      $("rdoMore").hidden=true;
      return;
    }
    if(!rows.length){
      list.innerHTML=empty("Nenhum RDO corresponde aos filtros selecionados.");
      $("rdoMore").hidden=true;
      return;
    }
    const visible=rows.slice(0,state.limit);
    list.innerHTML=visible.map(r=>{
      const selected=r.id===state.selectedId;
      const approval=r.status==="approved"||r.status==="final";
      return '<button type="button" class="rdo-list-item'+(selected?' active':'')+
        '" data-rdo-id="'+esc(r.id)+'" aria-pressed="'+selected+'">'+
        '<div class="head"><strong>'+esc(number(r))+'</strong>'+badge(r.status)+'</div>'+
        '<small>Referência: '+esc(dateBR(r.work_date))+'</small>'+
        '<div class="sub"><span>'+esc(r.engineer_name||"Engenheiro não informado")+'</span>'+
        '<b>'+(approval&&r.pdf_path?'PDF disponível':approval?'PDF não arquivado':'Ver detalhes')+'</b></div></button>';
    }).join("");
    $("rdoMore").hidden=rows.length<=state.limit;
    $("rdoMore").textContent="Mostrar mais RDOs ("+Math.max(0,rows.length-state.limit)+" restantes)";
  }
  function infoField(title,value){
    return '<div class="rdo-info"><span>'+esc(title)+'</span><strong>'+esc(toText(value))+'</strong></div>';
  }
  function prose(label,value){
    return '<div class="rdo-prose-box"><small>'+esc(label)+'</small><p>'+esc(toText(value))+'</p></div>';
  }
  function renderTimeline(row){
    const history=Array.isArray(row.approval_history)?row.approval_history:[];
    const events=history.length?history.map(event=>({
      action:event.action,at:event.at,who:event.actor_name,note:event.note
    })):[
      ...(row.submitted_at?[{action:"submitted",at:row.submitted_at,who:row.engineer_name,note:""}]:[]),
      ...(row.returned_at?[{action:"returned",at:row.returned_at,who:row.reviewer_name,note:row.return_reason}]:[]),
      ...(row.approved_at?[{action:"approved",at:row.approved_at,who:row.approved_name,note:row.approval_note}]:[])
    ];
    const actions={submitted:"Enviado para análise",approved:"Aprovado",returned:"Devolvido para ajuste"};
    if(!events.length)return empty("Sem movimentações de aprovação registradas.");
    return '<div class="rdo-timeline">'+events.map(event=>
      '<div class="rdo-timeline-item'+(event.action==="approved"?' approved':'')+'"><div>'+
      '<strong>'+esc(actions[event.action]||event.action||"Registro")+'</strong>'+
      '<small>'+esc(timeBR(event.at))+' · '+esc(event.who||"Responsável não informado")+'</small>'+
      (event.note?'<p>'+esc(event.note)+'</p>':'')+
      '</div></div>'
    ).join("")+'</div>';
  }
  function renderActivities(row){
    const activities=Array.isArray(row.activities)?row.activities:[];
    if(!activities.length)return empty("Nenhuma atividade foi detalhada neste RDO.");
    return '<div class="rdo-activities">'+activities.map(item=>{
      const name=[item.code,item.service].filter(Boolean).join(" — ");
      const responsible=Array.isArray(item.responsibles)?item.responsibles.filter(Boolean).join(", "):"";
      const where=item.front?" · Frente: "+item.front:"";
      return '<article class="rdo-activity"><div class="rdo-activity-head"><strong>'+esc(name||"Atividade sem nome")+'</strong>'+
        '<span class="qty">'+esc(nf(item.qty))+' '+esc(item.unit||"")+'</span></div>'+
        (item.summary?'<p>'+esc(item.summary)+'</p>':'')+
        (responsible||where?'<small>'+esc((responsible?"Responsável: "+responsible:"")+where)+'</small>':'')+
        '</article>';
    }).join("")+'</div>';
  }
  function photosOf(row){
    return (Array.isArray(row.photo_manifest)?row.photo_manifest:[])
      .filter(p=>p&&p.include!==false)
      .sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0));
  }
  function renderPhotoCards(row){
    const photos=photosOf(row);
    if(!photos.length)return empty("Este relatório não inclui fotografias.");
    return '<div class="rdo-photo-grid">'+photos.map((photo,i)=>{
      const id=String(photo.photo_id||i),cached=state.photoUrls.get(photo.path);
      const url=cached&&cached.expires>Date.now()+30000?cached.url:null;
      return url?'<button type="button" class="rdo-photo" data-rdo-photo="'+esc(id)+'" aria-label="Ampliar foto '+(i+1)+'">'+
        '<img loading="lazy" src="'+esc(url)+'" alt="Foto '+(i+1)+' do relatório '+esc(number(row))+'">'+
        '<div>'+esc(photo.caption||photo.source_name||"Registro fotográfico")+'</div></button>'
        :'<div class="rdo-photo"><div class="loading">'+(validPath(photo.path,"photo")?'Carregando imagem…':'Foto indisponível')+'</div>'+
        '<div>'+esc(photo.caption||photo.source_name||"Registro fotográfico")+'</div></div>';
    }).join("")+'</div>';
  }
  function renderDetail(){
    const row=state.detail;
    const region=$("rdoDetail");
    if(!row){
      region.innerHTML='<div class="rdo-empty"><h3>Selecione um relatório</h3><p>Consulte atividades, fotografias, aprovação e PDF arquivado.</p></div>';
      return;
    }
    const hasPdf=["approved","final"].includes(row.status)&&validPath(row.pdf_path,"pdf");
    const photos=photosOf(row);
    const acts=Array.isArray(row.activities)?row.activities:[];
    const heading='<div class="rdo-detail-head"><div><small>RELATÓRIO DIÁRIO DE OBRA · AMBEV</small>'+
      '<h2>'+esc(number(row))+'</h2><p>'+esc(dateBR(row.work_date))+' · '+acts.length+' atividades · '+photos.length+' fotografias</p></div>'+
      badge(row.status)+'</div>';
    const docs='<div class="rdo-actions">'+
      (hasPdf?'<button class="btn primary" type="button" id="rdoDownloadPdf">Baixar PDF arquivado</button>':
        '<span class="rdo-badge">PDF '+(row.status==="approved"||row.status==="final"?'ainda não arquivado':'disponível após aprovação e arquivamento')+'</span>')+
      '<button type="button" class="btn ghost" id="rdoReloadDetail">Atualizar RDO</button></div>';
    const header='<div class="rdo-information">'+
      infoField("Data de referência",dateBR(row.work_date))+
      infoField("Engenheiro",row.engineer_name)+
      infoField("Condição climática",row.weather)+
      infoField("Responsável pela análise",row.reviewer_name)+
      infoField("Aprovação administrativa",row.approved_name)+
      infoField("Data da aprovação",row.approved_at?timeBR(row.approved_at):"Não aprovado")+
      '</div>';
    const technical='<section class="rdo-section"><h3>Condições e ocorrências</h3><div class="rdo-prose-grid">'+
      prose("Descrição do turno",row.shift_description)+
      prose("Efetivo informado",row.workforce)+
      prose("Equipamentos utilizados",row.equipment)+
      prose("Segurança do trabalho",row.safety_notes)+
      prose("Ocorrências",row.occurrences)+
      prose("Observações gerais",row.general_notes)+
      '</div></section>';
    const activity='<section class="rdo-section"><h3>Serviços e produção · '+acts.length+' registros</h3>'+
      renderActivities(row)+'</section>';
    const pictures='<section class="rdo-section"><h3>Relatório fotográfico · '+photos.length+' imagens</h3>'+
      '<div id="rdoDetailPhotos">'+renderPhotoCards(row)+'</div></section>';
    const timeline='<section class="rdo-section"><h3>Histórico de aprovação</h3>'+renderTimeline(row)+
      ((row.return_reason&&row.status==="returned")?'<p class="rdo-detail-note">Motivo da devolução: '+esc(row.return_reason)+'</p>':'')+
      '<p class="rdo-detail-note">Aprovação administrativa do ObraControl; não substitui aceite contratual ou assinatura digital.</p></section>';
    region.innerHTML=heading+docs+header+technical+activity+pictures+timeline;
  }
  async function resolvePhotos(row,version){
    const photos=photosOf(row);
    const missing=Array.from(new Set(photos.map(p=>p.path).filter(path=>validPath(path,"photo"))))
      .filter(path=>{
        const obj=state.photoUrls.get(path);
        return !obj||obj.expires<Date.now()+30000;
      });
    if(!missing.length)return;
    state.imageErrors=0;
    for(let offset=0;offset<missing.length;offset+=30){
      const paths=missing.slice(offset,offset+30);
      const {data,error}=await state.client.storage.from("obc-fotos").createSignedUrls(paths,900);
      if(version!==state.selectionVersion)return;
      if(error){state.imageErrors++;console.warn("RDO image access:",error.message);continue;}
      for(let i=0;i<paths.length;i++){
        if(data?.[i]?.signedUrl)state.photoUrls.set(paths[i],{url:data[i].signedUrl,expires:Date.now()+900000});
        else state.imageErrors++;
      }
    }
    if(version===state.selectionVersion){
      const el=$("rdoDetailPhotos");
      if(el)el.innerHTML=renderPhotoCards(row);
      if(state.imageErrors)notice("Algumas fotos do RDO não puderam ser carregadas; confirme as permissões e os arquivos.",true);
    }
  }
  async function select(id,force=false){
    const summary=state.rows.find(r=>r.id===id);
    if(!summary||!state.client)return;
    if(!force&&id===state.selectedId&&state.detail?.id===id&&state.detailModified===summary.updated_at){
      renderList();renderDetail();
      await resolvePhotos(state.detail,state.selectionVersion);
      return;
    }
    state.selectedId=id;
    const version=++state.selectionVersion;
    state.detail=null;
    renderList();
    $("rdoDetail").innerHTML='<div class="rdo-empty"><h3>Carregando '+esc(number(summary))+'</h3><p>Consultando o documento e as evidências protegidas…</p></div>';
    notice("");
    try{
      const {data,error}=await state.client.from("obc_rdos")
        .select("id,rdo_no,work_date,status,weather,shift_description,workforce,equipment,safety_notes,occurrences,general_notes,engineer_name,reviewer_name,approved_at,approved_name,approver_job_title,approval_note,return_reason,returned_at,submitted_at,activities,photo_manifest,approval_history,pdf_path,updated_at")
        .eq("id",id).single();
      if(error)throw error;
      if(version!==state.selectionVersion)return;
      state.detail=data;
      state.detailModified=summary.updated_at;
      renderDetail();
      await resolvePhotos(data,version);
    }catch(error){
      if(version!==state.selectionVersion)return;
      console.error("RDO read:",error);
      $("rdoDetail").innerHTML=empty("Não foi possível carregar este RDO. Verifique as permissões e tente novamente.");
      notice("Erro ao consultar o RDO: "+error.message,true);
    }
  }
  async function downloadPdf(){
    const row=state.detail;
    if(!row||!["approved","final"].includes(row.status)||!validPath(row.pdf_path,"pdf")){
      notice("O PDF deste RDO ainda não foi aprovado e arquivado.",true);return;
    }
    const button=$("rdoDownloadPdf");
    if(button)button.disabled=true;
    notice("Preparando o PDF do RDO…");
    try{
      const {data,error}=await state.client.storage.from("obc-rdo-pdfs").download(row.pdf_path);
      if(error)throw error;
      if(!(data instanceof Blob))throw Error("Documento não encontrado.");
      const url=URL.createObjectURL(data),a=document.createElement("a");
      a.href=url;
      a.download="RL-"+number(row)+"-"+row.work_date+".pdf";
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),10000);
      notice("PDF arquivado disponibilizado para download.");
    }catch(error){
      console.warn("PDF protegido:",error);
      notice("Não foi possível baixar o PDF arquivado: "+error.message,true);
    }finally{if(button)button.disabled=false;}
  }
  function openPhoto(photoId){
    const row=state.detail;
    if(!row)return;
    const item=photosOf(row).find((p,i)=>String(p.photo_id||i)===photoId);
    if(!item)return;
    const cached=state.photoUrls.get(item.path);
    if(!cached||cached.expires<Date.now())return;
    const modal=$("photoModal");
    if(!modal)return;
    $("largePhoto").src=cached.url;
    $("photoCaption").textContent=number(row)+" · "+dateBR(row.work_date)+" · "+(item.caption||item.source_name||"Fotografia da obra");
    if(!modal.open)modal.showModal();
  }
  function apply(){
    state.limit=30;
    renderList();
    const visible=filteredRows();
    if(!visible.length){
      state.selectedId=null;state.detail=null;state.selectionVersion++;
      renderDetail();
      return;
    }
    if(!visible.some(r=>r.id===state.selectedId)){
      state.selectedId=null;state.detail=null;state.selectionVersion++;
      if(state.shown)void select(visible[0].id);
      else renderDetail();
    }
  }
  function setData(rows,client,error=""){
    if(!client)return;
    state.client=client;
    state.rows=Array.isArray(rows)?rows:[];
    state.error=error||"";
    renderList();
    if(state.shown){
      const selected=state.rows.find(r=>r.id===state.selectedId);
      const target=selected||filteredRows()[0];
      if(target)void select(target.id,!selected||selected.updated_at!==state.detailModified);
      else{state.detail=null;state.selectedId=null;state.selectionVersion++;renderDetail();}
    }
  }
  function show(){
    state.shown=true;
    renderList();
    const selection=filteredRows();
    if(selection.length)void select(selection.find(r=>r.id===state.selectedId)?.id||selection[0].id);
    else renderDetail();
  }
  function hide(){state.shown=false;}
  function reset(){
    state.client=null;state.rows=[];state.error="";state.shown=false;
    state.selectedId=null;state.detail=null;state.detailModified=null;state.selectionVersion++;
    state.photoUrls.clear();state.limit=30;notice("");
    renderList();renderDetail();
  }
  function wire(){
    $("rdoList").addEventListener("click",event=>{
      const node=event.target.closest("[data-rdo-id]");
      if(node)void select(node.dataset.rdoId);
    });
    $("rdoDetail").addEventListener("click",event=>{
      if(event.target.closest("#rdoDownloadPdf"))void downloadPdf();
      const pic=event.target.closest("[data-rdo-photo]");
      if(pic)openPhoto(pic.dataset.rdoPhoto);
      if(event.target.closest("#rdoReloadDetail")&&state.selectedId)void select(state.selectedId,true);
    });
    $("rdoSearch").addEventListener("input",apply);
    $("rdoStatusFilter").addEventListener("change",apply);
    $("rdoDateStart").addEventListener("change",apply);
    $("rdoDateEnd").addEventListener("change",apply);
    $("rdoClearFilters").addEventListener("click",()=>{
      $("rdoSearch").value="";
      $("rdoStatusFilter").value="all";
      $("rdoDateStart").value="";
      $("rdoDateEnd").value="";
      apply();
    });
    $("rdoMore").addEventListener("click",()=>{
      state.limit+=30;renderList();
    });
  }
  wire();
  window.RL_RDO_BOARD=Object.freeze({setData,show,hide,reset});
})();

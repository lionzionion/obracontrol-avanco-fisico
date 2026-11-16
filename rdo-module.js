/* RL Engenharia - RDO (Relatorio Diario de Obra)
   Fonte: apontamentos com work_date e fotos ligadas a esses apontamentos.
   Nunca infere clima, pessoas, equipamentos ou quantidades a partir da aparencia da fotografia.
*/
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v)||0;
const nf=(v,d=2)=>num(v).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:d});
const dateBR=s=>s?new Date(s+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const localToday=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10)};
const seq=r=>'RDO-'+String(r?.rdo_no||'NOVO').padStart(5,'0');
const fields=['weather','shift_description','workforce','equipment','safety_notes','occurrences','general_notes','engineer_name','reviewer_name'];
const draftDefaults=date=>({
 work_date:date,status:'draft',weather:'',shift_description:'',workforce:'',equipment:'',
 safety_notes:'',occurrences:'',general_notes:'',engineer_name:'',reviewer_name:'',
 activities:[],photo_manifest:[],source_entry_ids:[],source_generated_at:null
});
function buildDailySnapshot(bridge,date){
 const entries=(bridge.state?.entries||[]).filter(e=>e.date===date);
 const groups=new Map();
 for(const e of entries.filter(e=>e.kind==='production')){
   const item=bridge.getItem(e.itemId);
   if(!item)continue;
   const front=(e.front||'').trim(),key=item.id+'::'+front.toLowerCase(),unit=bridge.goal(item).unit;
   if(!groups.has(key))groups.set(key,{
     key,item_id:item.id,code:item.code,service:item.description,contract:item.contract,
     front,unit,qty:0,source_entry_ids:[],responsibles:[],summary:''
   });
   const g=groups.get(key);g.qty=Math.round((g.qty+num(e.qty))*100)/100;g.source_entry_ids.push(e.id);
   if(e.author&&!g.responsibles.includes(e.author))g.responsibles.push(e.author);
   if(e.note){g.summary+=(g.summary?'\n':'')+e.note.trim()}
 }
 const activities=Array.from(groups.values()).map(g=>({...g,summary:g.summary||'Execução registrada no apontamento diário. Quantidade conforme lançamento.'}));
 const byEntry=new Map(entries.map(e=>[e.id,e]));
 const photos=(bridge.state?.photos||[]).filter(p=>byEntry.has(p.entryId)).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
 const manifest=photos.map((p,index)=>{
   const entry=byEntry.get(p.entryId),item=bridge.getItem(p.itemId)||bridge.getItem(entry.itemId);
   return {
     photo_id:p.id,entry_id:p.entryId,item_id:p.itemId,path:p.path,
     source_name:p.name||'',include:true,position:index,
     caption:item?'Registro fotográfico do serviço '+item.code+' — '+item.description+'.':'Registro fotográfico da obra.'
   };
 });
 return {activities,photo_manifest:manifest,source_entry_ids:entries.map(e=>e.id),source_generated_at:new Date().toISOString()};
}
const mod={
 bridge:null,rows:[],draft:null,current:null,date:localToday(),dirty:false,busy:false,error:'',userId:null,
 get cloud(){return this.bridge?.cloud},
 get state(){return this.bridge?.state},
 get admin(){return this.state?.role==='admin'},
 reset(){this.rows=[];this.draft=null;this.current=null;this.dirty=false;this.userId=null;this.error='';},
 init(bridge){
   this.bridge=bridge;
   const actions=['click','change','input','submit'];
   document.addEventListener('click',ev=>{
     const btn=ev.target.closest('[data-rdo-action]');
     if(!btn)return;
     ev.preventDefault();
     const action=btn.dataset.rdoAction;
     Promise.resolve(this.action(action,btn.dataset.id||'')).catch(err=>this.notice('Falha no RDO: '+err.message,true));
   });
   document.addEventListener('input',ev=>{if(ev.target.closest('#rdoApp'))this.captureInput(ev.target)});
   document.addEventListener('change',ev=>{if(ev.target.closest('#rdoApp'))this.captureInput(ev.target)});
   document.addEventListener('submit',ev=>{
     if(ev.target.id!=='rdoForm')return;
     ev.preventDefault();void this.saveDraft();
   });
 },
 async refresh(){
   if(!this.state?.user){this.reset();return}
   if(this.userId!==this.state.user.id){this.reset();this.userId=this.state.user.id}
   const {data,error}=await this.cloud.from('obc_rdos').select('*').order('work_date',{ascending:false}).limit(366);
   if(error){this.error=error.message;this.notice('Erro ao carregar RDOs: '+error.message,true);return}
   this.rows=data||[];this.error='';
   if(this.current){const updated=this.rows.find(x=>x.id===this.current.id);if(updated&&!this.dirty)this.current=updated}
 },
 captureInput(target){
   if(!this.draft||this.current?.status==='final')return;
   if(target.id==='rdoDate')return;
   if(target.dataset.rdoField){
     const k=target.dataset.rdoField;
     if(fields.includes(k)){this.draft[k]=target.value;this.dirty=true}
   }
   if(target.dataset.rdoSummary){
     const a=this.draft.activities.find(x=>x.key===target.dataset.rdoSummary);
     if(a){a.summary=target.value;this.dirty=true}
   }
   if(target.dataset.rdoCaption){
     const p=this.draft.photo_manifest.find(x=>x.photo_id===target.dataset.rdoCaption);
     if(p){p.caption=target.value;this.dirty=true}
   }
   if(target.dataset.rdoInclude){
     const p=this.draft.photo_manifest.find(x=>x.photo_id===target.dataset.rdoInclude);
     if(p){p.include=target.checked;this.dirty=true}
   }
 },
 async action(action,id){
   if(this.busy)return;
   switch(action){
     case 'load':{
       const date=$('rdoDate')?.value;
       if(!date)return this.notice('Informe a data.',true);
       if(this.dirty&&!confirm('Descartar as alterações não salvas e abrir outra data?'))return;
       this.loadDate(date);break;
     }
     case 'open':
       if(this.dirty&&!confirm('Descartar as alterações não salvas e abrir outro RDO?'))return;
       this.loadDate(id);break;
     case 'sync':this.synchronize();break;
     case 'move-up':case 'move-down':this.reorder(id,action==='move-up'?-1:1);break;
     case 'save':await this.saveDraft();break;
     case 'pdf':await this.downloadPdf();break;
     case 'history-pdf':await this.downloadFromHistory(id);break;
     case 'finalize':await this.finalize();break;
     default:break;
   }
 },
 loadDate(date){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return this.notice('Data inválida.',true);
   this.date=date;
   this.current=this.rows.find(x=>x.work_date===date)||null;
   if(this.current){
     this.draft={...draftDefaults(date),...structuredClone(this.current)};
     if(!Array.isArray(this.draft.activities))this.draft.activities=[];
     if(!Array.isArray(this.draft.photo_manifest))this.draft.photo_manifest=[];
   }else{
     this.draft={...draftDefaults(date),...buildDailySnapshot(this.bridge,date)};
   }
   this.dirty=false;
   this.render(true);
 },
 synchronize(){
   if(!this.admin||!this.draft||this.current?.status==='final')return;
   if(!confirm('Atualizar os serviços e as fotos conforme os lançamentos atuais? As descrições e legendas já editadas serão mantidas.'))return;
   const fresh=buildDailySnapshot(this.bridge,this.draft.work_date);
   const oldActivities=new Map(this.draft.activities.map(a=>[a.key,a]));
   const oldPhotos=new Map(this.draft.photo_manifest.map(p=>[p.photo_id,p]));
   this.draft.activities=fresh.activities.map(a=>({...a,summary:oldActivities.get(a.key)?.summary||a.summary}));
   this.draft.photo_manifest=fresh.photo_manifest.map(p=>({
     ...p,
     caption:oldPhotos.get(p.photo_id)?.caption||p.caption,
     include:oldPhotos.get(p.photo_id)?.include??true,
     position:oldPhotos.get(p.photo_id)?.position??p.position
   })).sort((a,b)=>a.position-b.position).map((p,i)=>({...p,position:i}));
   this.draft.source_entry_ids=fresh.source_entry_ids;
   this.draft.source_generated_at=fresh.source_generated_at;
   this.dirty=true;
   this.render(true);this.notice('Serviços, fotos e quantitativos do dia atualizados.');
 },
 reorder(id,step){
   if(!this.admin||!this.draft||this.current?.status==='final')return;
   const p=this.draft.photo_manifest,at=p.findIndex(x=>x.photo_id===id),to=at+step;
   if(at<0||to<0||to>=p.length)return;
   [p[at],p[to]]=[p[to],p[at]];
   p.forEach((x,i)=>x.position=i);
   this.dirty=true;this.render(true);
 },
 render(force=false){
   const root=$('rdoApp');if(!root)return;
   if(!force&&((root.contains(document.activeElement)&&document.activeElement!==document.body) || this.dirty))return;
   if(!this.state?.user){root.innerHTML='<div class="empty">Faça login para acessar os RDOs.</div>';return}
   const isAdmin=this.admin,readonly=!isAdmin||this.current?.status==='final';
   const draftCount=this.rows.filter(x=>x.status==='draft').length;
   const finalCount=this.rows.filter(x=>x.status==='final').length;
   const records=this.bridge.state.entries.filter(e=>e.date===this.date);
   const photoCount=(this.bridge.state.photos||[]).filter(p=>records.some(e=>e.id===p.entryId)).length;
   const dateInput='<input id="rdoDate" class="input" type="date" value="'+esc(this.date)+'">';
   const top='<div class="rdo-stats"><div><small>RDOs finalizados</small><strong>'+finalCount+'</strong></div><div><small>Rascunhos</small><strong>'+draftCount+'</strong></div><div><small>Fotos na data</small><strong>'+photoCount+'</strong></div></div>'+
    '<div class="rdo-picker"><label>Data de referência do RDO '+dateInput+'</label><button type="button" class="btn primary" data-rdo-action="load">Abrir dia</button></div>'+
    '<div class="note">Os serviços e volumes vêm dos lançamentos de <strong>produção</strong> do dia. As fotos são reunidas pela <strong>data de execução do apontamento ao qual estão vinculadas</strong>, mesmo se enviadas posteriormente. Equipe, clima e equipamentos exigem conferência manual.</div>';
   if(!this.draft)this.loadDate(this.date);
   const d=this.draft||draftDefaults(this.date);
   const locked=readonly?'disabled':'';
   const draftStatus=this.current?.status==='final'
    ?'<span class="rdo-pill final">RDO finalizado · PDF arquivado</span>'
    :this.current?.id?'<span class="rdo-pill draft">Rascunho salvo</span>':'<span class="rdo-pill draft">Novo rascunho</span>';
   const sections=[
     ['weather','Clima / condições do tempo','Ex.: ensolarado (preenchimento manual)'],
     ['shift_description','Turno e horário de trabalho','Ex.: 07h às 17h'],
     ['workforce','Efetivo de pessoal','Ex.: 2 pedreiros, 4 serventes, 1 encarregado'],
     ['equipment','Equipamentos empregados','Ex.: 1 retroescavadeira, 1 caminhão'],
     ['safety_notes','Segurança do trabalho / DDS / liberações','Registre APR, integrações, inspeções e medidas aplicáveis'],
     ['occurrences','Ocorrências, interferências e paralisações','Registre fatos do dia ou indique sem ocorrências'],
     ['general_notes','Observações da fiscalização / administração','Comentários de execução e providências'],
     ['engineer_name','Engenheiro responsável pelo RDO','Nome completo do profissional responsável'],
     ['reviewer_name','Conferência / responsável pelo recebimento','Nome (se aplicável)']
   ];
   const fieldHTML=sections.map(([name,title,hint])=>{
     const big=['workforce','equipment','safety_notes','occurrences','general_notes'].includes(name);
     const fld=big?'<textarea class="textarea" rows="2" data-rdo-field="'+name+'" placeholder="'+esc(hint)+'" '+locked+'>'+esc(d[name]||'')+'</textarea>'
      :'<input class="input" data-rdo-field="'+name+'" value="'+esc(d[name]||'')+'" placeholder="'+esc(hint)+'" '+locked+'>';
     return '<label class="rdo-field '+(big?'wide':'')+'"><span>'+esc(title)+'</span>'+fld+'</label>';
   }).join('');
   const activityHTML=d.activities.length?d.activities.map(a=>'<div class="rdo-activity">'+
     '<div class="rdo-activity-head"><strong>'+esc(a.code)+' — '+esc(a.service)+'</strong><span>'+nf(a.qty)+' '+esc(a.unit)+'</span></div>'+
     '<small>'+esc(a.contract==='gabioes'?'Gabiões e drenagem':'Demolição e terraplenagem')+
     (a.front?' · Frente: '+esc(a.front):'')+(a.responsibles?.length?' · '+esc(a.responsibles.join(', ')):'')+'</small>'+
     '<label>Descrição técnica / ocorrências deste serviço<textarea class="textarea" rows="2" data-rdo-summary="'+esc(a.key)+'" '+locked+'>'+esc(a.summary||'')+'</textarea></label></div>').join('')
    :'<div class="empty"><b>Nenhuma produção lançada nesta data</b>Você pode registrar um RDO de paralisação e preencher as observações manualmente, sem inventar serviços executados.</div>';
   const photoHTML=d.photo_manifest.length?d.photo_manifest.map((p,i)=>{
     const record=this.bridge.state.photos.find(x=>x.id===p.photo_id);
     return '<div class="rdo-photo">'+
       '<div class="rdo-photo-visual">'+(record?.dataUrl?'<img src="'+esc(record.dataUrl)+'" loading="lazy" alt="'+esc(p.source_name||'Fotografia da obra')+'">':'<div class="rdo-missing">Imagem indisponível</div>')+'</div>'+
       '<div class="rdo-photo-content"><label class="rdo-select"><input type="checkbox" data-rdo-include="'+esc(p.photo_id)+'" '+(p.include?'checked':'')+' '+locked+'> Incluir no PDF</label>'+
       '<small>Foto '+(i+1)+' · '+esc(p.source_name||'Arquivo sem nome')+'</small>'+
       '<label>Legenda<textarea class="textarea" rows="2" data-rdo-caption="'+esc(p.photo_id)+'" '+locked+'>'+esc(p.caption||'')+'</textarea></label>'+
       (readonly?'':'<div class="rdo-order"><button type="button" class="btn" data-rdo-action="move-up" data-id="'+esc(p.photo_id)+'" '+(i===0?'disabled':'')+'>↑ Subir</button><button type="button" class="btn" data-rdo-action="move-down" data-id="'+esc(p.photo_id)+'" '+(i===d.photo_manifest.length-1?'disabled':'')+'>↓ Descer</button></div>')+
       '</div></div>';
   }).join(''):'<div class="empty"><b>Sem fotos vinculadas aos lançamentos desta data</b>Cadastre imagens na tela Lançar produção e depois use Atualizar registros do dia.</div>';
   const history=this.rows.slice(0,45).map(r=>'<div class="rdo-history-row"><div><strong>'+esc(seq(r))+' · '+dateBR(r.work_date)+'</strong><small>'+ (r.status==='final'?'Finalizado e arquivado':'Rascunho')+'</small></div>'+
    '<div class="rdo-history-actions"><button type="button" class="btn" data-rdo-action="open" data-id="'+esc(r.work_date)+'">Abrir</button><button type="button" class="btn" data-rdo-action="history-pdf" data-id="'+esc(r.id)+'">PDF</button></div></div>').join('')||'<div class="helpText">Nenhum RDO salvo nesta obra ainda.</div>';
   const buttons='<div class="rdo-actions">'+
    (this.admin&&this.current?.status!=='final'?'<button type="button" class="btn" data-rdo-action="sync">↻ Atualizar registros do dia</button><button type="submit" class="btn primary" id="rdoSaveButton">Salvar rascunho</button>':'')+
    '<button type="button" class="btn" data-rdo-action="pdf">⇩ '+(this.current?.status==='final'?'Baixar PDF arquivado':'Gerar PDF de prévia')+'</button>'+
    (this.admin&&this.current?.status!=='final'?'<button type="button" class="btn rdo-final-btn" data-rdo-action="finalize">✓ Finalizar e arquivar PDF</button>':'')+
    '</div>';
   const editor='<article class="panel rdo-editor"><div class="rdo-editor-title"><div><h2>'+esc(this.current?seq(this.current):'Novo RDO')+' · '+dateBR(d.work_date)+'</h2><small>AMBEV Itapissuma — Relatório Diário de Obra</small></div>'+draftStatus+'</div>'+
      '<form id="rdoForm"><h3>01. Serviços e produção registrados</h3><div class="rdo-activities">'+activityHTML+'</div>'+
      '<h3>02. Informações do dia (revisão do engenheiro)</h3><div class="rdo-fields">'+fieldHTML+'</div>'+
      '<h3>03. Relatório fotográfico <span class="rdo-counter">'+d.photo_manifest.filter(p=>p.include).length+' selecionadas</span></h3>'+
      '<div class="rdo-photos">'+photoHTML+'</div>'+buttons+
      '<p class="helpText">PDF em A4 com numeração, quantidades e fotos reais. Rascunhos são editáveis; finalização bloqueia alterações e arquiva uma cópia privada do PDF. O PDF não constitui assinatura digital.</p></form></article>';
   root.innerHTML=(this.error?'<div class="rdo-alert">'+esc(this.error)+'</div>':'')+top+editor+
    '<div class="panel rdo-history"><h2>Histórico de RDOs</h2>'+history+'</div>';
 },
 async saveDraft({silent=false}={}){
   if(!this.admin||this.current?.status==='final')return false;
   if(!this.draft||this.busy)return false;
   this.busy=true;
   try{
     const data=this.payload('draft');
     let response;
     if(this.current?.id){
       response=await this.cloud.from('obc_rdos').update(data)
         .eq('id',this.current.id).eq('updated_at',this.current.updated_at).select('*').maybeSingle();
     }else{
       response=await this.cloud.from('obc_rdos').insert({...data,work_date:this.draft.work_date,created_by:this.state.user.id})
         .select('*').single();
     }
     if(response.error)throw response.error;
     if(!response.data)throw new Error('Este RDO foi alterado por outro usuário. Atualize a página antes de salvar.');
     this.current=response.data;
     this.draft={...draftDefaults(this.date),...structuredClone(this.current)};
     this.dirty=false;await this.refresh();this.render(true);
     if(!silent)this.notice('Rascunho salvo na nuvem: '+seq(this.current));
     return true;
   }catch(err){this.notice('Falha ao salvar RDO: '+(err.message||err),true);return false}
   finally{this.busy=false}
 },
 payload(status){
   const d=this.draft;
   const out={status,updated_by:this.state.user.id,
     activities:d.activities,photo_manifest:d.photo_manifest,source_entry_ids:d.source_entry_ids,
     source_generated_at:d.source_generated_at};
   for(const name of fields)out[name]=String(d[name]||'').trim();
   return out;
 },
 async finalize(){
   if(!this.admin||this.current?.status==='final'||this.busy)return;
   if(!this.draft?.engineer_name?.trim())return this.notice('Preencha o nome do engenheiro responsável antes de finalizar.',true);
   if(!confirm('Finalizar e arquivar este RDO? Após finalizar, a edição fica bloqueada e uma cópia do PDF com as fotos selecionadas será preservada na nuvem.'))return;
   if(this.dirty||!this.current){
     const ok=await this.saveDraft({silent:true});if(!ok)return;
   }
   if(this.busy)return;
   this.busy=true;
   let path=null;
   try{
     this.notice('Montando PDF com fotografias do dia...');
     const blob=await this.buildPdf(true);
     if(blob.size>15*1024*1024)throw new Error('PDF excedeu 15 MB. Selecione menos imagens ou reduza o volume de fotos.');
     path=this.draft.work_date.slice(0,4)+'/'+this.current.id+'/'+crypto.randomUUID()+'.pdf';
     const upload=await this.cloud.storage.from('obc-rdo-pdfs').upload(path,blob,{contentType:'application/pdf',upsert:false});
     if(upload.error)throw upload.error;
     const {data,error}=await this.cloud.from('obc_rdos').update({
       status:'final',pdf_path:path,updated_by:this.state.user.id
     }).eq('id',this.current.id).eq('updated_at',this.current.updated_at).select('*').maybeSingle();
     if(error||!data)throw error||new Error('Este RDO foi alterado por outro usuário. Atualize e tente novamente.');
     this.current=data;this.draft=structuredClone(data);this.dirty=false;path=null;
     await this.refresh();this.render(true);
     this.saveBlob(blob,this.filename(data));
     this.notice('RDO finalizado, PDF arquivado e baixado: '+seq(data));
   }catch(err){
     if(path)await this.cloud.storage.from('obc-rdo-pdfs').remove([path]);
     this.notice('Não foi possível finalizar o RDO: '+(err.message||err),true);
   }finally{this.busy=false}
 },
 async downloadPdf(){
   if(!this.draft||this.busy)return;
   if(this.current?.status==='final')return this.downloadSaved(this.current);
   this.busy=true;
   try{
     const blob=await this.buildPdf(false);
     this.saveBlob(blob,this.filename(this.current||this.draft));
     this.notice('PDF de prévia gerado. Confira antes de finalizar.');
   }catch(err){this.notice('Não foi possível gerar PDF: '+(err.message||err),true)}
   finally{this.busy=false}
 },
 async downloadFromHistory(id){
   const r=this.rows.find(x=>x.id===id);if(!r)return this.notice('RDO não encontrado.',true);
   if(r.status==='final')return this.downloadSaved(r);
   if(this.dirty&&!confirm('Descartar alterações não salvas para gerar o PDF do histórico?'))return;
   this.loadDate(r.work_date);await this.downloadPdf();
 },
 async downloadSaved(r){
   if(!r.pdf_path)return this.notice('PDF arquivado não encontrado.',true);
   try{
     const {data,error}=await this.cloud.storage.from('obc-rdo-pdfs').download(r.pdf_path);
     if(error)throw error;
     this.saveBlob(data,this.filename(r));
     this.notice('PDF arquivado baixado.');
   }catch(err){this.notice('Erro ao baixar PDF: '+err.message,true)}
 },
 filename(r){return 'RL-'+seq(r)+'-'+(r.work_date||this.date)+'.pdf'},
 saveBlob(blob,name){
   const url=URL.createObjectURL(blob);
   const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),3000);
 },
 async ensureJsPdf(){
   if(window.jspdf?.jsPDF)return window.jspdf.jsPDF;
   if(this.jsPdfLoading)return this.jsPdfLoading;
   this.jsPdfLoading=new Promise((resolve,reject)=>{
     const script=document.createElement('script');
     script.src='https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
     script.onload=()=>window.jspdf?.jsPDF?resolve(window.jspdf.jsPDF):reject(Error('Biblioteca de PDF não carregada.'));
     script.onerror=()=>reject(Error('Falha de internet ao carregar o gerador PDF.'));document.head.appendChild(script);
   }).catch(err=>{this.jsPdfLoading=null;throw err});
   return this.jsPdfLoading;
 },
 async photoJpeg(photo){
   const path=photo.path||this.bridge.state.photos.find(p=>p.id===photo.photo_id)?.path;
   if(!path)throw Error('Caminho da foto não encontrado: '+photo.source_name);
   const {data:blob,error}=await this.cloud.storage.from('obc-fotos').download(path);
   if(error)throw Error('Não foi possível obter a foto '+photo.source_name+': '+error.message);
   const u=URL.createObjectURL(blob);
   try{
     const im=new Image();
     await new Promise((ok,fail)=>{im.onload=ok;im.onerror=()=>fail(Error('Foto não pôde ser decodificada'));im.src=u});
     const max=1300,k=Math.min(1,max/Math.max(im.width,im.height));
     const c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*k));c.height=Math.max(1,Math.round(im.height*k));
     const ctx=c.getContext('2d');if(!ctx)throw Error('Canvas indisponível para o PDF');
     ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(im,0,0,c.width,c.height);
     return {data:c.toDataURL('image/jpeg',0.74),ratio:c.width/c.height};
   }finally{URL.revokeObjectURL(u)}
 },
 async buildPdf(strictImages){
   const JsPDF=await this.ensureJsPdf();
   const d=this.draft;
   const pdf=new JsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
   const PW=210,PH=297,L=15,R=15,CW=PW-L-R;
   let y=43;
   const addHeader=()=>{
     pdf.setFillColor(11,35,58);pdf.rect(0,0,PW,33,'F');
     pdf.setFillColor(54,210,186);pdf.roundedRect(15,8,18,18,3,3,'F');
     pdf.setFont('helvetica','bold');pdf.setFontSize(12);pdf.setTextColor(4,37,46);pdf.text('RL',24,19.7,{align:'center'});
     pdf.setTextColor(242,250,253);pdf.setFontSize(13);pdf.text('RL ENGENHARIA',40,14.5);
     pdf.setFontSize(8);pdf.setFont('helvetica','normal');pdf.text('RELATORIO DIARIO DE OBRA | AMBEV - ITAPISSUMA/PE',40,21.5);
     pdf.text(seq(this.current||d)+'   |   '+dateBR(d.work_date),195,29.2,{align:'right'});
     if(this.current?.status!=='final'){
       pdf.setFillColor(246,233,207);pdf.roundedRect(144,6,51,7,1.4,1.4,'F');
       pdf.setTextColor(95,66,18);pdf.setFontSize(8);pdf.setFont('helvetica','bold');pdf.text('RASCUNHO - CONFERIR',169.5,10.8,{align:'center'});
     }
     pdf.setTextColor(33,49,66);y=41;
   };
   const newPage=()=>{pdf.addPage();addHeader()};
   const space=h=>{if(y+h>PH-23)newPage()};
   const ruleTitle=(txt)=>{
     space(17);pdf.setFillColor(229,239,245);pdf.roundedRect(L,y,CW,9,1.8,1.8,'F');
     pdf.setTextColor(23,58,77);pdf.setFont('helvetica','bold');pdf.setFontSize(10);
     pdf.text(txt,L+3,y+6.1);y+=13;pdf.setTextColor(36,49,60);
   };
   const paragraph=(text,sz=9,leading=4.5,color=[42,56,69],indent=0)=>{
     const value=String(text||'Nao informado');
     pdf.setFont('helvetica','normal');pdf.setFontSize(sz);
     const lines=pdf.splitTextToSize(value,CW-indent-1);
     for(const line of lines){
       space(leading+1);pdf.setTextColor(...color);pdf.text(line,L+indent,y);y+=leading;
     }
     y+=2;
   };
   const field=(label,value)=>{
     space(8);pdf.setFont('helvetica','bold');pdf.setFontSize(8.7);pdf.setTextColor(47,80,101);
     pdf.text(label,L,y);y+=4.8;paragraph(value||'Nao informado',8.8,4.5,[45,57,69],1);
   };
   addHeader();
   space(24);
   pdf.setFont('helvetica','bold');pdf.setFontSize(16);pdf.text('Diario de atividades - '+dateBR(d.work_date),L,y);y+=7;
   paragraph('Obra: AMBEV Itapissuma | Contratante: Solutio Engenharia | Contratada: RL Engenharia',8.8,4.5);
   ruleTitle('01. SERVICOS EXECUTADOS / PRODUCAO');
   if(!d.activities.length)paragraph('Nao ha apontamentos de producao cadastrados para a data selecionada.',9.1);
   for(const a of d.activities){
     space(17);
     pdf.setFont('helvetica','bold');pdf.setFontSize(9.4);pdf.setTextColor(20,78,92);
     const text=a.code+' - '+a.service;
     const lines=pdf.splitTextToSize(text,CW-4);
     for(const line of lines){space(5.1);pdf.text(line,L,y);y+=4.9}
     pdf.setFontSize(8.6);pdf.setTextColor(28,42,58);
     paragraph('Quantidade executada: '+nf(a.qty)+' '+a.unit+(a.front?'   |   Frente: '+a.front:''),8.6,4.2);
     paragraph(a.summary||'Sem observacoes deste servico.',8.7,4.3,[61,72,83]);
     if(a.responsibles?.length)paragraph('Apontado por: '+a.responsibles.join(', '),8,4,[83,101,114]);
     y+=1;
   }
   ruleTitle('02. RECURSOS / CONDICOES DE TRABALHO');
   field('Clima / condicoes do tempo',d.weather);
   field('Turno e horario',d.shift_description);
   field('Efetivo de pessoal',d.workforce);
   field('Equipamentos',d.equipment);
   ruleTitle('03. SEGURANCA / OCORRENCIAS / OBSERVACOES');
   field('Seguranca do trabalho',d.safety_notes);
   field('Ocorrencias, interferencias e paralisacoes',d.occurrences);
   field('Observacoes da fiscalizacao / administracao',d.general_notes);
   ruleTitle('04. REGISTRO FOTOGRAFICO');
   const selected=(d.photo_manifest||[]).filter(p=>p.include).sort((a,b)=>num(a.position)-num(b.position));
   if(!selected.length)paragraph('Nenhuma foto foi selecionada para este RDO.',9);
   for(let i=0;i<selected.length;i++){
     const p=selected[i];
     let jpeg;
     try{jpeg=await this.photoJpeg(p)}
     catch(err){if(strictImages)throw err;paragraph('Imagem '+(i+1)+' indisponivel: '+p.source_name,9,4.5,[130,57,57]);continue}
     const maxH=90,maxW=CW,w=Math.min(maxW,maxH*jpeg.ratio),h=w/jpeg.ratio;
     space(h+26);
     pdf.setTextColor(27,71,89);pdf.setFont('helvetica','bold');pdf.setFontSize(9);
     pdf.text('FOTO '+String(i+1).padStart(2,'0'),L,y);y+=5;
     pdf.addImage(jpeg.data,'JPEG',L+(CW-w)/2,y,w,h,undefined,'FAST');y+=h+5;
     paragraph(p.caption||'Registro fotografico da obra.',8.5,4.1,[55,69,80]);
     y+=2;
   }
   ruleTitle('05. RESPONSAVEIS / CONFERENCIA');
   space(33);
   pdf.setDrawColor(117,140,153);pdf.line(L,y+12,L+83,y+12);
   pdf.line(L+97,y+12,L+CW,y+12);
   pdf.setFont('helvetica','bold');pdf.setFontSize(8.5);pdf.setTextColor(46,65,78);
   pdf.text(d.engineer_name||'Engenheiro responsavel (a preencher)',L,y+17);
   pdf.text(d.reviewer_name||'Fiscalizacao / recebimento',L+97,y+17);y+=27;
   paragraph('Documento emitido pelo ObraControl. A geracao do PDF nao equivale a assinatura digital ou aprovacao da contratante.',7.7,4.1,[105,111,119]);
   for(let page=1;page<=pdf.getNumberOfPages();page++){
     pdf.setPage(page);pdf.setDrawColor(205,218,225);pdf.line(L,283,PW-R,283);
     pdf.setFont('helvetica','normal');pdf.setTextColor(105,120,134);pdf.setFontSize(7.5);
     pdf.text('RL ENGENHARIA  |  AMBEV ITAPISSUMA  |  '+seq(this.current||d),L,288);
     pdf.text('Pagina '+page+' de '+pdf.getNumberOfPages(),PW-R,288,{align:'right'});
   }
   return pdf.output('blob');
 },
 notice(message,error=false){
   const t=$('toast');if(!t){console.info(message);return}
   t.textContent=message;t.className='toast'+(error?' error':'');t.style.display='block';clearTimeout(this.toastTimer);
   this.toastTimer=setTimeout(()=>t.style.display='none',5500);
 }
};
window.ObraRDO=mod;
if(window.ObraRDOBridge)mod.init(window.ObraRDOBridge);
})();

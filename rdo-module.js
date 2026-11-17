/* RL Engenharia - RDO (Relatorio Diario de Obra)
   Fonte: apontamentos e registros manuais independentes; o RDO não altera medições.
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
const lockedStatus=s=>['submitted','approved','final'].includes(s);
const statusLabels={draft:'Rascunho',submitted:'Aguardando aprovação',returned:'Devolvido para ajuste',approved:'Aprovado',final:'Finalizado (legado)'};
const whenBR=s=>s?new Date(s).toLocaleString('pt-BR',{timeZone:'America/Recife',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
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
 bridge:null,rows:[],draft:null,current:null,date:localToday(),dirty:false,busy:false,uploading:false,manualPhotoUrls:{},manualPhotoExpiry:{},error:'',userId:null,
 get cloud(){return this.bridge?.cloud},
 get state(){return this.bridge?.state},
 get admin(){return this.state?.role==='admin'},
 reset(){this.rows=[];this.draft=null;this.current=null;this.dirty=false;this.uploading=false;this.manualPhotoUrls={};this.manualPhotoExpiry={};this.userId=null;this.error='';},
 init(bridge){
   this.bridge=bridge;
   document.addEventListener('click',ev=>{
     const btn=ev.target.closest('[data-rdo-action]');
     if(!btn)return;
     ev.preventDefault();
     const action=btn.dataset.rdoAction;
     Promise.resolve(this.action(action,btn.dataset.id||'')).catch(err=>this.notice('Falha no RDO: '+err.message,true));
   });
   document.addEventListener('input',ev=>{if(ev.target.closest('#rdoApp'))this.captureInput(ev.target)});
   document.addEventListener('change',ev=>{
     if(ev.target.id==='rdoNewPhotos'){void this.addPhotos(Array.from(ev.target.files||[]));return}
     if(ev.target.closest('#rdoApp'))this.captureInput(ev.target);
   });
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
   if(this.current){const updated=this.rows.find(x=>x.id===this.current.id);if(updated&&!this.dirty){
     this.current=updated;this.draft={...draftDefaults(updated.work_date),...structuredClone(updated)};
     if(this.admin&&!lockedStatus(updated.status))this.applySnapshot(buildDailySnapshot(this.bridge,updated.work_date));
   }}
 },
 captureInput(target){
   if(!this.draft||lockedStatus(this.current?.status))return;
   if(target.id==='rdoDate')return;
   if(target.dataset.rdoField){
     const k=target.dataset.rdoField;
     if(fields.includes(k)){this.draft[k]=target.value;this.dirty=true}
   }
   if(target.dataset.rdoActivityField&&target.dataset.rdoActivityId){
     const a=this.draft.activities.find(x=>x.kind==='manual'&&x.key===target.dataset.rdoActivityId);
     if(a&&['service','front','responsible','summary'].includes(target.dataset.rdoActivityField)){
       a[target.dataset.rdoActivityField]=target.value;this.dirty=true;
     }
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
   if(this.busy||this.uploading)return;
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
     case 'add-activity':this.addActivity();break;
     case 'remove-activity':this.removeActivity(id);break;
     case 'remove-photo':await this.removeManualPhoto(id);break;
     case 'move-up':case 'move-down':this.reorder(id,action==='move-up'?-1:1);break;
     case 'save':await this.saveDraft();break;
     case 'pdf':await this.downloadPdf();break;
     case 'supplement-pdf':await this.downloadSupplementPdf();break;
     case 'history-pdf':await this.downloadFromHistory(id);break;
     case 'submit':await this.submitForApproval();break;
     case 'approve':await this.review('approved');break;
     case 'return':await this.review('returned');break;
     case 'archive':await this.archiveApprovedPdf();break;
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
   if(this.admin&&!lockedStatus(this.current?.status)){
     const local=buildDailySnapshot(this.bridge,date);
     const changes=this.applySnapshot(local);
     if(changes.any)this.notice('Novos registros de produção/fotos incluídos na prévia. Confira e salve o RDO.');
   }
   this.render(true);
   void this.loadManualPhotoPreviews().catch(err=>this.notice('Falha ao abrir fotos avulsas: '+err.message,true));
 },

 inspectSnapshot(fresh){
   const d=this.draft||{activities:[],photo_manifest:[],source_entry_ids:[]};
   const oldEntries=new Set(Array.isArray(d.source_entry_ids)?d.source_entry_ids:[]);
   const oldPhotos=new Set((d.photo_manifest||[]).map(p=>p.photo_id));
   const currentAuto=(d.activities||[]).filter(a=>a.kind!=='manual');
   const oldAuto=new Map(currentAuto.map(a=>[a.key,a]));
   const changedActivities=fresh.activities.filter(a=>{
     const previous=oldAuto.get(a.key);
     return !previous||num(previous.qty)!==num(a.qty)||
       JSON.stringify([...(previous.source_entry_ids||[])].sort())!==
       JSON.stringify([...(a.source_entry_ids||[])].sort());
   });
   const removedActivities=currentAuto.filter(a=>!fresh.activities.some(v=>v.key===a.key));
   const missingEntries=fresh.source_entry_ids.filter(id=>!oldEntries.has(id));
   const deletedEntries=[...oldEntries].filter(id=>!fresh.source_entry_ids.includes(id));
   const missingPhotos=fresh.photo_manifest.filter(p=>!oldPhotos.has(p.photo_id));
   const removedPhotos=(d.photo_manifest||[]).filter(p=>p.kind!=='manual'&&!fresh.photo_manifest.some(v=>v.photo_id===p.photo_id));
   return {missingEntries,deletedEntries,missingPhotos,removedPhotos,changedActivities,removedActivities,
     any:!!(missingEntries.length||deletedEntries.length||missingPhotos.length||removedPhotos.length||
       changedActivities.length||removedActivities.length)};
 },
 applySnapshot(fresh){
   const change=this.inspectSnapshot(fresh);
   if(!change.any)return change;
   const oldActivities=new Map((this.draft.activities||[]).filter(a=>a.kind!=='manual').map(a=>[a.key,a]));
   this.draft.activities=[
     ...fresh.activities.map(a=>{
       const old=oldActivities.get(a.key);
       const generated='Execução registrada no apontamento diário. Quantidade conforme lançamento.';
       const edited=old?.summary&&old.summary!==generated;
       return {...a,summary:edited?old.summary:a.summary};
     }),
     ...this.draft.activities.filter(a=>a.kind==='manual')
   ];
   const incoming=new Map(fresh.photo_manifest.map(p=>[p.photo_id,p]));
   const merged=[];
   for(const p of this.draft.photo_manifest||[]){
     if(p.kind==='manual'){merged.push(p);continue}
     const current=incoming.get(p.photo_id);
     if(!current)continue;
     merged.push({...current,caption:p.caption??current.caption,include:p.include??true});
     incoming.delete(p.photo_id);
   }
   merged.push(...incoming.values());
   this.draft.photo_manifest=merged.map((p,i)=>({...p,position:i}));
   this.draft.source_entry_ids=fresh.source_entry_ids;
   this.draft.source_generated_at=fresh.source_generated_at;
   this.dirty=true;
   return change;
 },
 async latestSnapshot(){
   const date=this.draft?.work_date;
   if(!date)throw Error('Abra uma data do RDO antes de sincronizar.');
   const response=await this.cloud.from('obc_entries')
     .select('id,item_id,kind,work_date,qty,front,author,note,created_at')
     .eq('work_date',date).order('created_at',{ascending:true}).limit(1001);
   if(response.error)throw response.error;
   if((response.data||[]).length>1000)throw Error('Mais de 1000 lançamentos no dia. A sincronização precisa de paginação.');
   const entries=(response.data||[]).map(e=>({
     id:e.id,itemId:e.item_id,kind:e.kind,date:e.work_date,qty:num(e.qty),
     front:e.front,author:e.author,note:e.note,createdAt:e.created_at
   }));
   const photos=[];
   for(let i=0;i<entries.length;i+=80){
     const ids=entries.slice(i,i+80).map(e=>e.id);
     const result=await this.cloud.from('obc_photos')
       .select('id,entry_id,item_id,path,name,created_at')
       .in('entry_id',ids).order('created_at',{ascending:true}).limit(1001);
     if(result.error)throw result.error;
     if((result.data||[]).length>1000)throw Error('Há muitas fotos no dia para esta sincronização.');
     photos.push(...(result.data||[]).map(p=>({
       id:p.id,entryId:p.entry_id,itemId:p.item_id,path:p.path,name:p.name,createdAt:p.created_at
     })));
   }
   const snapshot=buildDailySnapshot({
     state:{entries,photos},getItem:this.bridge.getItem,goal:this.bridge.goal
   },date);
   return {snapshot,entries,photos};
 },
 async synchronize(){
   if(!this.admin||!this.draft||lockedStatus(this.current?.status)||this.busy||this.uploading)return;
   if(!confirm('Conferir os lançamentos de produção e fotos do dia no servidor? Atividades avulsas e legendas editadas serão preservadas.'))return;
   try{
     const latest=await this.latestSnapshot();
     const changes=this.applySnapshot(latest.snapshot);
     this.render(true);
     this.notice(changes.any?'Registros sincronizados. Confira as atividades e fotos e clique em Salvar rascunho.':
       'RDO já está atualizado com os lançamentos e fotos do dia.');
   }catch(err){this.notice('Não foi possível sincronizar: '+err.message,true)}
 },

 addActivity(){
   if(!this.admin||!this.draft||lockedStatus(this.current?.status))return;
   if(this.draft.activities.length>=100)return this.notice('Limite de 100 atividades por RDO.',true);
   const key='manual:'+crypto.randomUUID();
   this.draft.activities.push({kind:'manual',key,service:'',summary:'',front:'',responsible:''});
   this.dirty=true;this.render(true);
   const input=Array.from(document.querySelectorAll('[data-rdo-activity-field="service"]'))
     .find(el=>el.dataset.rdoActivityId===key);
   input?.focus();
 },
 removeActivity(key){
   if(!this.admin||!this.draft||lockedStatus(this.current?.status))return;
   const activity=this.draft.activities.find(a=>a.key===key&&a.kind==='manual');
   if(!activity||!confirm('Remover esta atividade avulsa do RDO?'))return;
   this.draft.activities=this.draft.activities.filter(a=>a!==activity);
   this.dirty=true;this.render(true);
 },
 async compressRdoPhoto(file){
   if(!file?.type?.startsWith('image/'))throw Error('Selecione apenas arquivos de imagem.');
   if(file.size>12*1024*1024)throw Error('A foto '+file.name+' excede 12 MB.');
   const url=URL.createObjectURL(file);
   try{
     const image=new Image();
     await new Promise((resolve,reject)=>{
       image.onload=resolve;image.onerror=()=>reject(Error('Imagem inválida ou não compatível: '+file.name));image.src=url;
     });
     const factor=Math.min(1,1600/Math.max(image.width,image.height));
     const canvas=document.createElement('canvas');
     canvas.width=Math.max(1,Math.round(image.width*factor));
     canvas.height=Math.max(1,Math.round(image.height*factor));
     const ctx=canvas.getContext('2d');
     if(!ctx)throw Error('Falha ao processar a imagem.');
     ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
     ctx.drawImage(image,0,0,canvas.width,canvas.height);
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.78));
     if(!blob||blob.size>4*1024*1024)throw Error('Não foi possível reduzir a foto '+file.name+' a 4 MB.');
     return blob;
   }finally{URL.revokeObjectURL(url)}
 },
 async loadManualPhotoPreviews(){
   if(!this.draft||!this.cloud)return;
   const date=this.draft.work_date;
   const paths=[...new Set(this.draft.photo_manifest.filter(p=>p.kind==='manual'&&p.path)
     .map(p=>p.path))].filter(path=>!this.manualPhotoUrls[path]||this.manualPhotoExpiry[path]<Date.now()+30000);
   if(!paths.length)return;
   const {data,error}=await this.cloud.storage.from('obc-rdo-photos').createSignedUrls(paths,3600);
   if(error){this.notice('Não foi possível carregar as miniaturas das fotos avulsas: '+error.message,true);return}
   if(this.draft?.work_date!==date)return;
   (data||[]).forEach((signed,i)=>{if(signed?.signedUrl){this.manualPhotoUrls[paths[i]]=signed.signedUrl;this.manualPhotoExpiry[paths[i]]=Date.now()+3600000}});
   this.render(true);
 },
 async addPhotos(files){
   if(!this.admin||!this.draft||lockedStatus(this.current?.status)||this.busy||this.uploading||!files.length)return;
   if(files.length>12)return this.notice('Selecione no máximo 12 fotos por envio.',true);
   if(this.draft.photo_manifest.length+files.length>50)return this.notice('O RDO admite até 50 fotos.',true);
   this.uploading=true;
   const uploaded=[],failures=[];
   let persisted=false;
   try{
     if((!this.current||this.dirty)&&!await this.saveDraft({silent:true}))return;
     for(const file of files){
       try{
         const blob=await this.compressRdoPhoto(file),id=crypto.randomUUID();
         const path=this.state.user.id+'/'+this.current.id+'/'+id+'.jpg';
         const {error}=await this.cloud.storage.from('obc-rdo-photos')
           .upload(path,blob,{contentType:'image/jpeg',upsert:false});
         if(error)throw error;
         uploaded.push({kind:'manual',photo_id:id,path,source_name:file.name.slice(0,140),
           caption:'Registro fotográfico da obra.',include:true,
           position:this.draft.photo_manifest.length+uploaded.length});
       }catch(err){failures.push(file.name+': '+(err.message||err))}
     }
     if(!uploaded.length)throw Error(failures.join(' | ')||'Nenhuma foto pôde ser enviada.');
     this.draft.photo_manifest.push(...uploaded);
     this.dirty=true;
     if(!await this.saveDraft({silent:true}))throw Error('As fotos chegaram ao armazenamento, mas o RDO não pôde ser salvo.');
     persisted=true;
     await this.loadManualPhotoPreviews();
     this.notice(uploaded.length+' foto(s) adicionada(s) ao RDO.'+
       (failures.length?' Não enviadas: '+failures.join(' | '):''),!!failures.length);
   }catch(err){
     if(!persisted&&uploaded.length){
       await this.cloud.storage.from('obc-rdo-photos').remove(uploaded.map(p=>p.path));
       this.draft.photo_manifest=this.draft.photo_manifest.filter(p=>!uploaded.some(u=>u.photo_id===p.photo_id));
       this.dirty=false;this.render(true);
     }
     this.notice('Erro ao adicionar fotos: '+(err.message||err),true);
   }finally{this.uploading=false;this.render(true)}
 },
 async removeManualPhoto(id){
   if(!this.admin||!this.draft||lockedStatus(this.current?.status))return;
   const photo=this.draft.photo_manifest.find(p=>p.photo_id===id&&p.kind==='manual');
   if(!photo||!confirm('Remover esta foto do RDO? A imagem será excluída do armazenamento.'))return;
   this.uploading=true;
   try{
     if(this.dirty&&!await this.saveDraft({silent:true}))return;
     const before=this.draft.photo_manifest;
     this.draft.photo_manifest=before.filter(p=>p.photo_id!==id).map((p,i)=>({...p,position:i}));
     this.dirty=true;
     if(!await this.saveDraft({silent:true})){
       this.draft.photo_manifest=before;this.dirty=false;this.render(true);return;
     }
     const {error}=await this.cloud.storage.from('obc-rdo-photos').remove([photo.path]);
     delete this.manualPhotoUrls[photo.path];delete this.manualPhotoExpiry[photo.path];
     if(error)this.notice('Foto removida do RDO, mas o arquivo requer limpeza: '+error.message,true);
     else this.notice('Foto avulsa removida do RDO.');
   }finally{this.uploading=false;this.render(true)}
 },
 reorder(id,step){
   if(!this.admin||!this.draft||lockedStatus(this.current?.status))return;
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
   const isAdmin=this.admin,readonly=!isAdmin||lockedStatus(this.current?.status);
   const state=this.current?.status||'draft',approved=state==='approved',submitted=state==='submitted',returned=state==='returned';
   const waitingCount=this.rows.filter(x=>x.status==='submitted').length;
   const approvedCount=this.rows.filter(x=>['approved','final'].includes(x.status)).length;
   const records=this.bridge.state.entries.filter(e=>e.date===this.date);
   const photoCount=this.draft?.work_date===this.date?this.draft.photo_manifest.length:(this.bridge.state.photos||[]).filter(p=>records.some(e=>e.id===p.entryId)).length;
   const dateInput='<input id="rdoDate" class="input" type="date" value="'+esc(this.date)+'">';
   const top='<div class="rdo-stats"><div><small>RDOs aprovados</small><strong>'+approvedCount+'</strong></div><div><small>Aguardando análise</small><strong>'+waitingCount+'</strong></div><div><small>Fotos no RDO</small><strong>'+photoCount+'</strong></div></div>'+
    '<div class="rdo-picker"><label>Data de referência do RDO '+dateInput+'</label><button type="button" class="btn primary" data-rdo-action="load">Abrir dia</button></div>'+
    '<div class="note">O RDO reúne lançamentos de <strong>produção</strong> e também aceita <strong>atividades e fotos avulsas</strong>, sem gerar quantitativos ou medições. As fotos dos lançamentos continuam vinculadas à data de execução. Equipe, clima e equipamentos exigem conferência manual.</div>';
   if(!this.draft)this.loadDate(this.date);
   const d=this.draft||draftDefaults(this.date);
   const locked=readonly?'disabled':'';
   const latestLocal=buildDailySnapshot(this.bridge,d.work_date);
   const gap=this.current?this.inspectSnapshot(latestLocal):null;
   const gapLabel=gap?
     [gap.missingEntries.length+' lançamento(s) novo(s)',
      gap.missingPhotos.length+' foto(s) nova(s)',
      gap.changedActivities.length+' serviço(s) diferente(s)'].join(' · '):'';
   const staleNotice=gap?.any&&this.current?.status==='approved'
     ?'<div class="rdo-outdated"><strong>⚠ RDO aprovado com registros posteriores não incluídos</strong>'+
       '<p>Foram identificados '+esc(gapLabel)+'. O PDF aprovado original permanece intacto. Baixe um complemento para conferência; esse documento complementar não representa nova aprovação.</p>'+
       '<button type="button" class="btn primary" data-rdo-action="supplement-pdf">Baixar PDF complementar com atividades e fotos faltantes</button></div>'
     :gap?.any&&this.current?.status==='submitted'
     ?'<div class="rdo-outdated"><strong>⚠ Novos registros após o envio</strong><p>'+esc(gapLabel)+'. Devolva este RDO para ajuste antes de aprová-lo.</p></div>'
     :gap?.any&&this.current?.status==='final'
     ?'<div class="rdo-outdated"><strong>⚠ RDO legado arquivado com diferenças nos apontamentos</strong><p>O original está protegido contra alterações.</p></div>'
     :'';
   const syncNotice=this.current&&!readonly&&this.dirty&&
     (JSON.stringify(this.draft.source_entry_ids)!==JSON.stringify(this.current.source_entry_ids)||
      this.draft.photo_manifest.some(p=>!this.current.photo_manifest?.some(q=>q.photo_id===p.photo_id)))
     ?'<div class="rdo-sync-notice">Novas atividades ou fotos foram incorporadas ao editor. Confira as informações e clique em <strong>Salvar rascunho</strong>.</div>':'';

   const draftStatus='<span class="rdo-pill '+(approved||state==='final'?'final':submitted?'pending':returned?'returned':'draft')+'">'+esc(this.current?statusLabels[state]||state:'Novo rascunho')+'</span>';
   const historyEvents=(Array.isArray(d.approval_history)?d.approval_history:[]).slice(-10);
   const approvalDetails='<section class="rdo-approval-panel"><h3>Fluxo de aprovação</h3>'+
     '<div class="rdo-approval-step"><span>1. Elaboração</span><strong>Engenheiro: '+esc(d.engineer_name||'Não informado')+'</strong></div>'+
     '<div class="rdo-approval-step"><span>2. Envio para análise</span><strong>'+(d.submitted_at?'Enviado em '+whenBR(d.submitted_at):'Ainda não enviado')+'</strong></div>'+
     '<div class="rdo-approval-step '+(approved?'is-approved':'')+'"><span>3. Decisão</span><strong>'+
       (approved?'APROVADO POR '+esc(d.approved_name||'—'):state==='final'?'Finalizado na versão anterior':submitted?'Aguardando aprovação do administrador':returned?'Devolvido para correções':'Aguardando envio')+
       '</strong>'+(approved?'<small>'+esc(d.approver_job_title||'Administrador')+' · '+whenBR(d.approved_at)+'</small>':'')+'</div>'+
     (approved&&d.approval_note?'<div class="rdo-approval-note">Observação de aprovação: '+esc(d.approval_note)+'</div>':'')+
     (returned&&d.return_reason?'<div class="rdo-approval-return"><strong>Motivo da devolução:</strong> '+esc(d.return_reason)+'</div>':'')+
     (historyEvents.length?'<details class="rdo-approval-history"><summary>Histórico de decisões ('+historyEvents.length+')</summary>'+historyEvents.map(h=>'<p><strong>'+esc(({submitted:'Enviado',returned:'Devolvido',approved:'Aprovado'})[h.action]||h.action)+'</strong> · '+esc(h.actor_name||'Administrador')+' · '+whenBR(h.at)+(h.note?' — '+esc(h.note):'')+'</p>').join('')+'</details>':'')+
     '<small class="rdo-approval-disclaimer">Aprovação administrativa registrada no ObraControl; não é assinatura digital nem aceite formal da Solutio.</small></section>';
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
   const activityHTML=d.activities.length?d.activities.map(a=>a.kind==='manual'
     ?'<div class="rdo-activity rdo-manual-activity">'+
       '<div class="rdo-activity-head"><strong>Atividade adicional (sem vínculo com medição)</strong>'+
       (readonly?'':'<button type="button" class="btn rdo-remove-btn" data-rdo-action="remove-activity" data-id="'+esc(a.key)+'">Remover</button>')+'</div>'+
       '<label>Título da atividade<input class="input" maxlength="180" placeholder="Ex.: Inspeção da frente de serviço" data-rdo-activity-field="service" data-rdo-activity-id="'+esc(a.key)+'" value="'+esc(a.service||'')+'" '+locked+'></label>'+
       '<div class="rdo-manual-grid"><label>Frente / local (opcional)<input class="input" maxlength="120" data-rdo-activity-field="front" data-rdo-activity-id="'+esc(a.key)+'" value="'+esc(a.front||'')+'" '+locked+'></label>'+
       '<label>Responsável (opcional)<input class="input" maxlength="120" data-rdo-activity-field="responsible" data-rdo-activity-id="'+esc(a.key)+'" value="'+esc(a.responsible||'')+'" '+locked+'></label></div>'+
       '<label>Descrição da atividade<textarea class="textarea" rows="2" maxlength="2500" placeholder="Descreva o que ocorreu, sem lançar quantidades na medição" data-rdo-activity-field="summary" data-rdo-activity-id="'+esc(a.key)+'" '+locked+'>'+esc(a.summary||'')+'</textarea></label></div>'
     :'<div class="rdo-activity">'+
     '<div class="rdo-activity-head"><strong>'+esc(a.code)+' — '+esc(a.service)+'</strong><span>'+nf(a.qty)+' '+esc(a.unit)+'</span></div>'+
     '<small>'+esc(a.contract==='gabioes'?'Gabiões e drenagem':'Demolição e terraplenagem')+
     (a.front?' · Frente: '+esc(a.front):'')+(a.responsibles?.length?' · '+esc(a.responsibles.join(', ')):'')+'</small>'+
     '<label>Descrição técnica / ocorrências deste serviço<textarea class="textarea" rows="2" data-rdo-summary="'+esc(a.key)+'" '+locked+'>'+esc(a.summary||'')+'</textarea></label></div>').join('')
    :'<div class="empty"><b>Nenhum serviço neste RDO</b>Adicione uma atividade avulsa, mesmo sem lançamento de produção, ou registre ocorrências e observações.</div>';
   const photoHTML=d.photo_manifest.length?d.photo_manifest.map((p,i)=>{
     const record=this.bridge.state.photos.find(x=>x.id===p.photo_id);
     const preview=p.kind==='manual'?this.manualPhotoUrls[p.path]:record?.dataUrl;
     return '<div class="rdo-photo">'+
       '<div class="rdo-photo-visual">'+(preview?'<img src="'+esc(preview)+'" loading="lazy" alt="'+esc(p.source_name||'Fotografia da obra')+'">':'<div class="rdo-missing">Imagem indisponível</div>')+'</div>'+
       '<div class="rdo-photo-content"><label class="rdo-select"><input type="checkbox" data-rdo-include="'+esc(p.photo_id)+'" '+(p.include?'checked':'')+' '+locked+'> Incluir no PDF</label>'+
       '<small>Foto '+(i+1)+(p.kind==='manual'?' · Adicionada diretamente ao RDO':' · Foto de produção')+' · '+esc(p.source_name||'Arquivo sem nome')+'</small>'+
       '<label>Legenda<textarea class="textarea" rows="2" data-rdo-caption="'+esc(p.photo_id)+'" '+locked+'>'+esc(p.caption||'')+'</textarea></label>'+
       (readonly?'':'<div class="rdo-order"><button type="button" class="btn" data-rdo-action="move-up" data-id="'+esc(p.photo_id)+'" '+(i===0?'disabled':'')+'>↑ Subir</button><button type="button" class="btn" data-rdo-action="move-down" data-id="'+esc(p.photo_id)+'" '+(i===d.photo_manifest.length-1?'disabled':'')+'>↓ Descer</button></div>')+
       (!readonly&&p.kind==='manual'?'<button type="button" class="btn rdo-remove-btn" data-rdo-action="remove-photo" data-id="'+esc(p.photo_id)+'">Remover foto avulsa</button>':'')+
       '</div></div>';
   }).join(''):'<div class="empty"><b>Sem fotos neste RDO</b>Envie fotos diretamente aqui ou use as fotos dos apontamentos do dia.</div>';
   const history=this.rows.slice(0,45).map(r=>'<div class="rdo-history-row"><div><strong>'+esc(seq(r))+' · '+dateBR(r.work_date)+'</strong><small>'+esc(statusLabels[r.status]||r.status)+(r.approved_name?' · Aprovado por '+esc(r.approved_name)+' em '+whenBR(r.approved_at):'')+'</small></div>'+
    '<div class="rdo-history-actions"><button type="button" class="btn" data-rdo-action="open" data-id="'+esc(r.work_date)+'">Abrir</button><button type="button" class="btn" data-rdo-action="history-pdf" data-id="'+esc(r.id)+'">PDF</button></div></div>').join('')||'<div class="helpText">Nenhum RDO salvo nesta obra ainda.</div>';
   const buttons='<div class="rdo-actions">'+
     (isAdmin&&!readonly?'<button type="button" class="btn" data-rdo-action="sync">↻ Atualizar registros do dia</button><button type="submit" class="btn primary" id="rdoSaveButton">Salvar rascunho</button><button type="button" class="btn rdo-submit-btn" data-rdo-action="submit">Enviar para aprovação</button>':'')+
     '<button type="button" class="btn" data-rdo-action="pdf">⇩ '+((approved||state==='final')&&this.current?.pdf_path?'Baixar PDF aprovado':'Gerar PDF de prévia')+'</button>'+
     (isAdmin&&submitted?'<button type="button" class="btn rdo-final-btn" data-rdo-action="approve">✓ Aprovar RDO</button><button type="button" class="btn rdo-return-btn" data-rdo-action="return">↶ Devolver para ajuste</button>':'')+
     (isAdmin&&approved&&!this.current?.pdf_path?'<button type="button" class="btn rdo-final-btn" data-rdo-action="archive">Arquivar PDF aprovado</button>':'')+
     '</div>';
   const editor=staleNotice+syncNotice+'<article class="panel rdo-editor"><div class="rdo-editor-title"><div class="rdo-heading-with-logo"><img class="rdo-head-logo" src="./assets/rl-logo.svg" alt="Logomarca RL Engenharia — Fazendo Acontecer"><div><h2>'+esc(this.current?seq(this.current):'Novo RDO')+' · '+dateBR(d.work_date)+'</h2><small>AMBEV Itapissuma — Relatório Diário de Obra</small></div></div>'+draftStatus+'</div>'+
      '<form id="rdoForm"><h3>01. Serviços e atividades do dia</h3><div class="rdo-activities">'+activityHTML+'</div>'+
      (readonly?'':'<div class="rdo-section-actions"><button type="button" class="btn rdo-add-btn" data-rdo-action="add-activity">+ Adicionar atividade avulsa</button><small>Sem vínculo com itens contratuais, avanço físico ou medições.</small></div>')+
      '<h3>02. Informações do dia (revisão do engenheiro)</h3><div class="rdo-fields">'+fieldHTML+'</div>'+
      '<h3>03. Relatório fotográfico <span class="rdo-counter">'+d.photo_manifest.filter(p=>p.include).length+' selecionadas</span></h3>'+ 
      (readonly?'':'<div class="rdo-upload-panel"><label for="rdoNewPhotos"><strong>Adicionar fotos diretamente ao RDO</strong><small>Não é necessário escolher um item ou fazer lançamento de produção. Até 12 fotos por envio (máximo 50 no RDO).</small></label><input id="rdoNewPhotos" type="file" class="input" accept="image/*" multiple '+(this.uploading?'disabled':'')+'></div>')+
      '<div class="rdo-photos">'+photoHTML+'</div>'+approvalDetails+buttons+
      '<p class="helpText">PDF A4 com logomarca RL, serviços e fotos reais. Após o envio, o administrador aprova ou devolve para ajustes. Nome, cargo e horário são registrados no servidor. O registro não constitui assinatura digital.</p></form></article>';
   root.innerHTML=(this.error?'<div class="rdo-alert">'+esc(this.error)+'</div>':'')+top+editor+
    '<div class="panel rdo-history"><h2>Histórico de RDOs</h2>'+history+'</div>';
 },
 async saveDraft({silent=false}={}){
   if(!this.admin||lockedStatus(this.current?.status))return false;
   if(!this.draft||this.busy)return false;
   if(this.draft.activities.some(a=>a.kind==='manual'&&!String(a.service||'').trim())){
     this.notice('Preencha o título de cada atividade avulsa antes de salvar.',true);return false;
   }
   this.busy=true;
   try{
     const latest=await this.latestSnapshot();
     const changes=this.applySnapshot(latest.snapshot);
     if(changes.any)this.render(true);
     const data=this.payload(this.current?.status==='returned'?'returned':'draft');
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
 async updateStatus(status,extra={}){
   if(!this.admin||!this.current?.id)return false;
   const previous=this.current;
   const {data,error}=await this.cloud.from('obc_rdos').update({
     status,updated_by:this.state.user.id,...extra
   }).eq('id',previous.id).eq('status',previous.status)
      .eq('updated_at',previous.updated_at).select('*').maybeSingle();
   if(error)throw error;
   if(!data)throw Error('O RDO foi alterado por outro usuário. Atualize antes de continuar.');
   this.current=data;
   this.draft={...draftDefaults(data.work_date),...structuredClone(data)};
   this.dirty=false;await this.refresh();this.render(true);
   return true;
 },
 async submitForApproval(){
   if(!this.admin||!this.draft||lockedStatus(this.current?.status)||this.busy)return;
   if(!this.draft.engineer_name?.trim())return this.notice('Informe o engenheiro que elaborou o RDO antes de enviar.',true);
   if(this.draft.activities.some(a=>a.kind==='manual'&&!String(a.service||'').trim()))return this.notice('Informe o título das atividades avulsas.',true);
   // Nunca envie uma versão congelada sem consultar lançamentos/fotos atuais no servidor.
   try{
     const latest=await this.latestSnapshot();
     const missing=this.applySnapshot(latest.snapshot);
     if(missing.any){
       this.render(true);
       return this.notice('Foram identificados novos lançamentos, fotos ou quantitativos. Eles foram incluídos no rascunho; confira e salve antes de enviar para aprovação.',true);
     }
   }catch(err){return this.notice('Envio bloqueado: não foi possível conferir os apontamentos atuais: '+err.message,true)}
   if(!this.draft.activities?.length&&!this.draft.occurrences?.trim()&&!this.draft.general_notes?.trim())
     return this.notice('Inclua serviços, ocorrências ou observações para justificar o diário.',true);
   if(!confirm('Enviar o RDO de '+dateBR(this.draft.work_date)+' para aprovação? Todos os lançamentos e fotos do dia foram conferidos. Os campos ficarão bloqueados até a decisão.'))return;
   if(this.dirty||!this.current){
     const saved=await this.saveDraft({silent:true});if(!saved)return;
   }
   this.busy=true;
   try{await this.updateStatus('submitted');this.notice('RDO enviado para aprovação. Aguardando decisão do administrador.')}
   catch(err){this.notice('Falha ao enviar RDO: '+err.message,true)}
   finally{this.busy=false}
 },
 async review(status){
   if(!this.admin||this.current?.status!=='submitted'||this.busy)return;
   if(status==='approved'){
     try{
       const latest=await this.latestSnapshot();
       const missing=this.inspectSnapshot(latest.snapshot);
       if(missing.any)return this.notice('Aprovação bloqueada: existem lançamentos, fotos ou quantitativos que não foram incluídos no RDO enviado. Devolva para ajuste, sincronize, salve e reenvie.',true);
     }catch(err){return this.notice('Aprovação bloqueada: não foi possível conferir os registros atuais: '+err.message,true)}
   }
   const reason=status==='returned'
     ?prompt('Motivo da devolução (mínimo de 5 caracteres):','')
     :prompt('Observação do aprovador (opcional):','');
   if(reason===null)return;
   if(status==='returned'&&reason.trim().length<5)return this.notice('Informe um motivo com ao menos 5 caracteres.',true);
   if(status==='approved'&&!confirm('Confirmar aprovação de '+seq(this.current)+'? Seu nome, cargo e horário serão registrados e o RDO ficará bloqueado.'))return;
   this.busy=true;
   try{
     await this.updateStatus(status,status==='approved'
       ?{approval_note:reason.trim().slice(0,1500)}
       :{return_reason:reason.trim().slice(0,1500)});
     if(status==='approved'){
       this.notice('Aprovação registrada. Gerando documento com o nome do aprovador...');
       this.busy=false;
       await this.archiveApprovedPdf();
     }else this.notice('RDO devolvido para ajuste, com justificativa registrada.');
   }catch(err){this.notice('Falha ao registrar decisão: '+err.message,true)}
   finally{this.busy=false}
 },
 async archiveApprovedPdf(){
   if(!this.admin||this.current?.status!=='approved'||this.busy)return;
   if(this.current.pdf_path)return this.downloadSaved(this.current);
   this.busy=true;
   let path=null;
   try{
     const blob=await this.buildPdf(true);
     if(blob.size>15*1024*1024)throw Error('O PDF excede 15 MB. É necessária adequação do limite de armazenamento.');
     path=this.current.work_date.slice(0,4)+'/'+this.current.id+'/'+crypto.randomUUID()+'.pdf';
     const upload=await this.cloud.storage.from('obc-rdo-pdfs').upload(path,blob,{contentType:'application/pdf',upsert:false});
     if(upload.error)throw upload.error;
     const {data,error}=await this.cloud.from('obc_rdos')
       .update({pdf_path:path,updated_by:this.state.user.id})
       .eq('id',this.current.id).eq('status','approved').is('pdf_path',null)
       .eq('updated_at',this.current.updated_at).select('*').maybeSingle();
     if(error||!data)throw error||Error('Outro usuário arquivou o RDO. Atualize a página para conferir.');
     path=null;this.current=data;this.draft=structuredClone(data);this.dirty=false;
     await this.refresh();this.render(true);this.saveBlob(blob,this.filename(data));
     this.notice('PDF aprovado com a marca RL e identidade do aprovador arquivado na nuvem.');
   }catch(err){
     if(path)await this.cloud.storage.from('obc-rdo-pdfs').remove([path]);
     this.notice('A aprovação ficou registrada, mas o PDF ainda não foi arquivado: '+err.message+'. Use Arquivar PDF aprovado para tentar novamente.',true);
   }finally{this.busy=false}
 },

 async downloadSupplementPdf(){
   if(this.busy||this.current?.status!=='approved'||!this.draft)return;
   this.busy=true;
   try{
     const latest=await this.latestSnapshot();
     const delta=this.inspectSnapshot(latest.snapshot);
     if(!delta.any)return this.notice('Não há novos registros para complementar este RDO.');
     const JsPDF=await this.ensureJsPdf(),logo=await this.brandLogoPng();
     const pdf=new JsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
     const PAGE_W=210,PAGE_H=297,LEFT=15,RIGHT=15,CONTENT=PAGE_W-LEFT-RIGHT;
     let y=43;
     const header=()=>{
       pdf.setFillColor(11,35,58);pdf.rect(0,0,PAGE_W,34,'F');
       pdf.addImage(logo,'PNG',13,5,60,17.6,undefined,'FAST');
       pdf.setTextColor(245,250,254);pdf.setFont('helvetica','bold');pdf.setFontSize(10);
       pdf.text('COMPLEMENTO DO RELATORIO DIARIO',81,14.5);
       pdf.setFontSize(8);pdf.setFont('helvetica','normal');
       pdf.text(seq(this.current)+' | '+dateBR(this.current.work_date),81,21);
       pdf.setFillColor(127,58,39);pdf.roundedRect(159,26.1,36,5.5,1.2,1.2,'F');
       pdf.setTextColor(255,238,227);pdf.setFont('helvetica','bold');pdf.setFontSize(7);
       pdf.text('NAO APROVADO',177,30,{align:'center'});
       pdf.setTextColor(39,55,67);y=42;
     };
     const newPage=()=>{pdf.addPage();header()};
     const ensure=h=>{if(y+h>PAGE_H-23)newPage()};
     const paragraph=(value,size=9,leading=4.5)=>{
       pdf.setFont('helvetica','normal');pdf.setFontSize(size);pdf.setTextColor(46,60,72);
       const lines=pdf.splitTextToSize(String(value||'Sem observacoes'),CONTENT);
       for(const line of lines){ensure(leading+1);pdf.text(line,LEFT,y);y+=leading}
       y+=3;
     };
     const heading=value=>{
       ensure(17);pdf.setFillColor(232,240,246);pdf.roundedRect(LEFT,y,CONTENT,9,1.4,1.4,'F');
       pdf.setTextColor(25,64,84);pdf.setFont('helvetica','bold');pdf.setFontSize(10);
       pdf.text(value,LEFT+3,y+6);y+=14;
     };
     header();
     paragraph('DOCUMENTO COMPLEMENTAR PARA CONFERENCIA. Nao altera o RDO aprovado nem substitui o PDF original. Requer analise e aprovacao especifica para adquirir valor formal.',9,5);
     paragraph('Data da extracao: '+new Date().toLocaleString('pt-BR',{timeZone:'America/Recife'})+
       ' | RDO original aprovado em: '+whenBR(this.current.approved_at),8.5,4.2);
     paragraph('Motivo: apontamentos de producao ou fotografias da data nao incorporados ao manifesto do documento original.',8.5,4.2);
     heading('01. ATIVIDADES AUSENTES OU ATUALIZADAS');
     if(!delta.changedActivities.length&&!delta.removedActivities.length)
       paragraph('Nenhuma diferenca de atividade fisica identificada.');
     for(const a of delta.changedActivities){
       ensure(17);
       pdf.setFont('helvetica','bold');pdf.setFontSize(9.3);pdf.setTextColor(20,78,92);
       const label=(a.code||'SERVICO')+' - '+(a.service||'Atividade registrada');
       const lines=pdf.splitTextToSize(label,CONTENT);
       for(const line of lines){ensure(5);pdf.text(line,LEFT,y);y+=5}
       paragraph('Quantidade TOTAL atual cadastrada: '+nf(a.qty)+' '+(a.unit||'')+
         (a.front?' | Frente: '+a.front:''),8.8,4.2);
       if(a.summary)paragraph(a.summary,8.7,4.3);
     }
     for(const old of delta.removedActivities)
       paragraph('ATENCAO: registro anterior nao consta mais nos apontamentos atuais: '+
         (old.code||'')+' - '+(old.service||''),8.5,4.3);
     heading('02. FOTOGRAFIAS NAO INCLUIDAS NO DOCUMENTO ORIGINAL');
     if(!delta.missingPhotos.length)paragraph('Nenhuma fotografia nova identificada.');
     for(let i=0;i<delta.missingPhotos.length;i++){
       const p=delta.missingPhotos[i];
       const jpeg=await this.photoJpeg(p);
       const maxH=88,w=Math.min(CONTENT,maxH*jpeg.ratio),h=w/jpeg.ratio;
       ensure(h+24);
       pdf.setFont('helvetica','bold');pdf.setFontSize(8.8);pdf.setTextColor(27,71,89);
       pdf.text('FOTO COMPLEMENTAR '+String(i+1).padStart(2,'0'),LEFT,y);y+=5;
       pdf.addImage(jpeg.data,'JPEG',LEFT+(CONTENT-w)/2,y,w,h,undefined,'FAST');
       y+=h+5;
       paragraph(p.caption||'Registro fotografico da obra.',8.5,4.1);
     }
     if(delta.removedPhotos.length){
       heading('03. REFERENCIAS FOTOGRAFICAS INDISPONIVEIS');
       paragraph(delta.removedPhotos.length+' fotografia(s) que constavam no manifesto do RDO original nao foram encontradas nos apontamentos atuais. Conferir antes de usar o complemento.',8.6);
     }
     for(let page=1;page<=pdf.getNumberOfPages();page++){
       pdf.setPage(page);pdf.setDrawColor(205,218,225);pdf.line(LEFT,283,PAGE_W-RIGHT,283);
       pdf.setFont('helvetica','normal');pdf.setTextColor(107,116,124);pdf.setFontSize(7.2);
       pdf.text('RL ENGENHARIA | '+seq(this.current)+' | COMPLEMENTO NAO APROVADO',LEFT,288);
       pdf.text('Pagina '+page+' de '+pdf.getNumberOfPages(),PAGE_W-RIGHT,288,{align:'right'});
     }
     this.saveBlob(pdf.output('blob'),'RL-'+seq(this.current)+'-COMPLEMENTO-'+this.current.work_date+'.pdf');
     this.notice('Complemento em PDF gerado para conferência. O documento aprovado original não foi alterado.');
   }catch(err){this.notice('Falha ao gerar o complemento do RDO: '+(err.message||err),true)}
   finally{this.busy=false}
 },
 async downloadPdf(){
   if(!this.draft||this.busy)return;
   if(this.current?.status==='final'||(this.current?.status==='approved'&&this.current?.pdf_path))return this.downloadSaved(this.current);
   if(this.current?.status==='approved')return this.archiveApprovedPdf();
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
   if(['final','approved'].includes(r.status)&&r.pdf_path)return this.downloadSaved(r);
   if(r.status==='approved'&&!this.admin)return this.notice('Aguardando arquivamento do PDF aprovado pelo administrador.',true);
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
     script.src='https://unpkg.com/jspdf@4.2.1/dist/jspdf.umd.min.js';
     script.onload=()=>window.jspdf?.jsPDF?resolve(window.jspdf.jsPDF):reject(Error('Biblioteca de PDF não carregada.'));
     script.onerror=()=>reject(Error('Falha de internet ao carregar o gerador PDF.'));document.head.appendChild(script);
   }).catch(err=>{this.jsPdfLoading=null;throw err});
   return this.jsPdfLoading;
 },
 async brandLogoPng(){
   if(this.logoPng)return this.logoPng;
   if(this.logoPromise)return this.logoPromise;
   this.logoPromise=(async()=>{
     const response=await fetch('./assets/rl-logo.svg',{cache:'force-cache'});
     if(!response.ok)throw Error('Logomarca oficial da RL não está acessível.');
     const svg=await response.blob(),url=URL.createObjectURL(svg);
     try{
       const image=new Image();
       await new Promise((resolve,reject)=>{
         image.onload=resolve;image.onerror=()=>reject(Error('Não foi possível renderizar a logomarca RL'));
         image.src=url;
       });
       const canvas=document.createElement('canvas');canvas.width=1121;canvas.height=329;
       const ctx=canvas.getContext('2d');
       if(!ctx)throw Error('Canvas não disponível para colocar a logomarca no PDF.');
       ctx.clearRect(0,0,canvas.width,canvas.height);
       ctx.drawImage(image,0,0,canvas.width,canvas.height);
       this.logoPng=canvas.toDataURL('image/png');
       return this.logoPng;
     }finally{URL.revokeObjectURL(url)}
   })().catch(e=>{this.logoPromise=null;throw e});
   return this.logoPromise;
 },
 async photoJpeg(photo){
   const path=photo.path||this.bridge.state.photos.find(p=>p.id===photo.photo_id)?.path;
   if(!path)throw Error('Caminho da foto não encontrado: '+photo.source_name);
   const bucket=photo.kind==='manual'?'obc-rdo-photos':'obc-fotos';
   const {data:blob,error}=await this.cloud.storage.from(bucket).download(path);
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
   const logoPng=await this.brandLogoPng();
   const d=this.draft;
   const pdf=new JsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
   const PW=210,PH=297,L=15,R=15,CW=PW-L-R;
   let y=43;
   const addHeader=()=>{
     pdf.setFillColor(11,35,58);pdf.rect(0,0,PW,33,'F');
     pdf.addImage(logoPng,'PNG',13,5,64,18.8,undefined,'FAST');
     pdf.setFont('helvetica','bold');pdf.setFontSize(10.5);pdf.setTextColor(242,250,253);
     pdf.text('RELATORIO DIARIO DE OBRA',83,13.7);
     pdf.setFont('helvetica','normal');pdf.setFontSize(7.4);
     pdf.text('AMBEV ITAPISSUMA/PE | RL ENGENHARIA',83,20.3);
     pdf.setFontSize(8);
     pdf.text(seq(this.current||d)+'   |   '+dateBR(d.work_date),195,29.2,{align:'right'});
     if(this.current?.status==='approved'){
       pdf.setFillColor(31,103,76);pdf.roundedRect(163,4.3,32,6.5,1.6,1.6,'F');
       pdf.setTextColor(212,251,225);pdf.setFont('helvetica','bold');pdf.setFontSize(7.2);
       pdf.text('APROVADO',179,8.8,{align:'center'});
     }else if(this.current?.status!=='final'){
       pdf.setFillColor(246,233,207);pdf.roundedRect(146,4.3,49,6.5,1.6,1.6,'F');
       pdf.setTextColor(95,66,18);pdf.setFontSize(7);pdf.setFont('helvetica','bold');
       pdf.text(this.current?.status==='submitted'?'EM APROVACAO':this.current?.status==='returned'?'DEVOLVIDO - REVISAR':'RASCUNHO - CONFERIR',170.5,8.8,{align:'center'});
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
     const text=a.kind==='manual'?'ATIVIDADE ADICIONAL - '+a.service:a.code+' - '+a.service;
     const lines=pdf.splitTextToSize(text,CW-4);
     for(const line of lines){space(5.1);pdf.text(line,L,y);y+=4.9}
     pdf.setFontSize(8.6);pdf.setTextColor(28,42,58);
     if(a.kind==='manual'){
       if(a.front)paragraph('Frente / local: '+a.front,8.6,4.2);
       paragraph(a.summary||'Sem descricao adicional.',8.7,4.3,[61,72,83]);
       if(a.responsible)paragraph('Responsavel: '+a.responsible,8,4,[83,101,114]);
     }else{
       paragraph('Quantidade executada: '+nf(a.qty)+' '+a.unit+(a.front?'   |   Frente: '+a.front:''),8.6,4.2);
       paragraph(a.summary||'Sem observacoes deste servico.',8.7,4.3,[61,72,83]);
       if(a.responsibles?.length)paragraph('Apontado por: '+a.responsibles.join(', '),8,4,[83,101,114]);
     }
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
   ruleTitle('05. ELABORACAO E APROVACAO');
   field('Elaborado por / responsavel tecnico',d.engineer_name);
   if(this.current?.status==='approved'){
     field('SITUACAO','APROVADO INTERNAMENTE');
     field('Aprovado por',d.approved_name);
     field('Funcao do aprovador',d.approver_job_title||'Administrador do sistema');
     field('Data e hora da aprovacao (Recife/PE)',whenBR(d.approved_at));
     if(d.approval_note)field('Observacao da aprovacao',d.approval_note);
   }else if(this.current?.status==='submitted'){
     field('SITUACAO','EM APROVACAO');
     field('Enviado para analise em (Recife/PE)',whenBR(d.submitted_at));
   }else if(this.current?.status==='returned'){
     field('SITUACAO','DEVOLVIDO PARA AJUSTES');
     field('Motivo da devolucao',d.return_reason);
   }else if(this.current?.status==='final'){
     field('SITUACAO','FINALIZADO NA VERSAO ANTERIOR (sem registro de aprovador)');
   }else field('SITUACAO','RASCUNHO - SEM APROVACAO');
   space(29);
   pdf.setDrawColor(117,140,153);pdf.line(L,y+12,L+83,y+12);pdf.line(L+97,y+12,L+CW,y+12);
   pdf.setFont('helvetica','bold');pdf.setFontSize(8.5);pdf.setTextColor(46,65,78);
   pdf.text(d.engineer_name||'Engenheiro responsavel (a preencher)',L,y+17);
   pdf.text(d.reviewer_name||'Conferencia / recebimento',L+97,y+17);y+=27;
   paragraph('Aprovacao administrativa registrada no ObraControl, sem assinatura digital. Nao substitui o aceite formal da Solutio nem conferencias contratuais.',7.7,4.1,[105,111,119]);
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

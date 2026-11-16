/* RL Engenharia - Controle de Boletins de Medicao (BM).
 * Os BMs oficiais sao um livro separado dos apontamentos diarios: nunca somar ambos.
 * Documentos e valores financeiros somente para administradores ativos (RLS).
 */
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v||0);
const nf=(v,d=2)=>n(v).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:d});
const money=v=>v==null?'—':n(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dt=d=>d?new Date(d+'T12:00:00').toLocaleDateString('pt-BR'):'Não informado';
const labels={approved:'Aprovado',pending:'Aguardando aprovação',draft:'Prévia'};
const badge=b=>'<span class="bm-status bm-'+esc(b.status)+'">'+esc(labels[b.status]||b.status)+'</span>';
const bm={
 bridge:null,bms:[],lines:[],selected:null,itemFocus:null,error:'',
 get cloud(){return this.bridge?.cloud},
 get state(){return this.bridge?.state},
 admin(){return this.state?.role==='admin'},
 init(bridge){
   this.bridge=bridge;
   document.addEventListener('click',e=>{
     const btn=e.target.closest('[data-bm-action]');
     if(!btn)return;
     e.preventDefault();
     this.action(btn.dataset.bmAction,btn.dataset.id);
   });
   document.addEventListener('submit',e=>{
     if(e.target.id==='bmCreateForm'){e.preventDefault();this.createBm(e.target)}
     if(e.target.id==='bmLineForm'){e.preventDefault();this.addLine(e.target)}
   });
   document.addEventListener('change',e=>{
     if(e.target.id==='bmPdfInput'&&e.target.files?.[0]){const file=e.target.files[0];e.target.value='';this.uploadPdf(file)}
   });
   document.addEventListener('input',e=>{
     if(e.target.id==='bmLineSearch'){
       const q=e.target.value.toLocaleLowerCase('pt-BR').trim();
       document.querySelectorAll('[data-bm-row]').forEach(row=>{row.hidden=!row.dataset.bmRow.includes(q)});
     }
   });
 },
 async refresh(){
   if(!this.admin()){this.bms=[];this.lines=[];this.selected=null;return}
   const [b,l]=await Promise.all([
     this.cloud.from('obc_bms').select('*').order('contract').order('number'),
     this.cloud.from('obc_bm_lines').select('*').order('item_code')
   ]);
   if(b.error||l.error){this.error=(b.error||l.error).message||'Falha ao carregar BMs';console.error('Falha BM',b.error||l.error);return}
   this.error='';
   this.bms=b.data||[];this.lines=l.data||[];
   if(!this.bms.some(x=>x.id===this.selected))this.selected=this.bms[0]?.id||null;
 },
 lineUnit(line){
   const item=this.bridge.getItem(line.item_id);
   if(!item)return line.unit||'—';
   return item.unit.toLowerCase()==='vb'?'%':line.unit||item.unit;
 },
 qtyLabel(line,qty){
   return this.lineUnit(line)==='%'?nf(n(qty)*100)+'%':nf(qty)+' '+esc(this.lineUnit(line));
 },
 totalFor(itemId,status){
   return this.lines.filter(l=>l.section==='base'&&l.item_id===itemId&&this.bms.some(b=>b.id===l.bm_id&&b.status===status)).reduce((a,l)=>a+n(l.period_qty),0);
 },
 itemMarkup(item){
   if(!this.admin())return '';
   const approved=this.totalFor(item.id,'approved'),pending=this.totalFor(item.id,'pending');
   const has=this.lines.some(l=>l.section==='base'&&l.item_id===item.id);
   if(!has)return '';
   const goal=this.bridge.goal(item),unit=item.unit.toLowerCase()==='vb'&&goal.unit==='%'?'%':goal.unit;
   const show=q=>unit==='%'?nf(q*100)+'%':nf(q)+' '+esc(unit);
   const pct=goal.planned?(unit==='%'?approved*100:approved)/goal.planned*100:0;
   return '<div class="bm-service"><div class="miniProgress"><span>BM oficialmente aprovado</span><strong>'+show(approved)+'</strong></div>'+
    '<div class="listbar bm-approved-bar"><i style="width:'+Math.max(0,Math.min(100,pct))+'%"></i></div>'+
    (pending?'<div class="miniProgress"><span>BM pendente (não somado)</span><strong>'+show(pending)+'</strong></div>':'')+
    '<button class="btn bm-service-link" type="button" data-bm-action="service" data-id="'+esc(item.id)+'">▤ Ver histórico dos BMs</button></div>';
 },
 priorQty(line,bmDoc){
   return this.lines.filter(l=>l.item_code===line.item_code&&l.section===line.section&&l.bm_id!==bmDoc.id&&this.bms.some(b=>b.id===l.bm_id&&b.contract===bmDoc.contract&&b.number<bmDoc.number&&b.status==='approved')).reduce((s,l)=>s+n(l.period_qty),0);
 },
 render(){
   const el=document.getElementById('bmApp');if(!el)return;
   if(!this.admin()){el.innerHTML='<div class="empty"><b>Acesso administrativo</b>Os BMs e valores contratuais são reservados à administração da obra.</div>';return}
   const contract=this.itemFocus?this.bridge.getItem(this.itemFocus)?.contract:this.state.contract;
   const visible=this.bms.filter(b=>!contract||contract==='all'||b.contract===contract);
   const approved=visible.filter(b=>b.status==='approved').length;
   const pending=visible.filter(b=>b.status==='pending').length;
   const draft=visible.filter(b=>b.status==='draft').length;
   const sel=this.bms.find(b=>b.id===this.selected&&visible.some(x=>x.id===b.id))||visible[0]||null;
   if(sel)this.selected=sel.id;
   const top='<div class="bm-summary"><div class="bm-kpi"><small>Aprovados</small><b>'+approved+'</b></div><div class="bm-kpi"><small>Em análise</small><b>'+pending+'</b></div><div class="bm-kpi"><small>Prévias</small><b>'+draft+'</b></div></div>'+
    '<div class="note">Controle oficial por <strong>incremento de cada BM</strong>. O BM 03 não entra no acumulado aprovado enquanto estiver pendente. Medições lançadas manualmente no aplicativo permanecem separadas para não duplicar quantitativos. PDFs e valores são restritos aos administradores.</div>';
   const card=visible.map(b=>'<button type="button" class="bm-card '+(sel?.id===b.id?'selected':'')+'" data-bm-action="select" data-id="'+esc(b.id)+'">'+
      '<b>'+esc(b.title)+'</b>'+badge(b)+'<small>'+dt(b.period_start)+' — '+dt(b.period_end)+'</small>'+
      '<span>Valor do período: <strong>'+money(b.reported_gross_value)+'</strong></span></button>').join('');
   const list='<div class="bm-list">'+card+'</div>';
   let details='';
   if(sel){
     const ls=this.lines.filter(l=>l.bm_id===sel.id).filter(l=>!this.itemFocus||l.item_id===this.itemFocus);
     const issues=this.lines.filter(l=>l.bm_id===sel.id&&Math.abs(this.priorQty(l,sel)-n(l.previous_qty))>0.011);
     const unmapped=this.lines.filter(l=>l.bm_id===sel.id&&!l.item_id&&l.section==='base');
     const sum=this.lines.filter(l=>l.bm_id===sel.id).reduce((a,l)=>a+n(l.reported_period_value),0);
     let actions='<button type="button" class="btn" data-bm-action="export" data-id="'+esc(sel.id)+'">⇩ CSV do BM</button>'+
       (sel.document_path?'<button type="button" class="btn" data-bm-action="pdf" data-id="'+esc(sel.id)+'">▧ Abrir PDF</button>':'')+
       '<button type="button" class="btn" data-bm-action="attach" data-id="'+esc(sel.id)+'">📎 '+(sel.document_path?'Substituir PDF':'Anexar PDF')+'</button>';
     if(sel.status!=='approved')actions+='<button type="button" class="btn primary" data-bm-action="approve" data-id="'+esc(sel.id)+'">✓ Confirmar aprovação</button>';
     if(sel.status==='draft')actions+='<button type="button" class="btn" data-bm-action="pending" data-id="'+esc(sel.id)+'">Enviar para análise</button>';
     const q=ls.map(l=>{
       const prev=this.priorQty(l,sel),diff=Math.abs(prev-n(l.previous_qty))>0.011;
       const item=this.bridge.getItem(l.item_id);
       const qty=this.qtyLabel.bind(this,l);
       const hint=(l.section==='aditivo'?'<span class="bm-addtag">ADITIVO</span>':'')+
           (diff?'<span class="bm-warning">⚠ Divergência de anterior</span>':'')+
           (!l.item_id&&l.section==='base'?'<span class="bm-warning">Sem vínculo com o catálogo</span>':'');
       return '<tr data-bm-row="'+esc((l.item_code+' '+(item?.description||l.description||'')).toLocaleLowerCase('pt-BR'))+'"><td><b>'+esc(l.item_code)+'</b>'+hint+'<small>'+esc(item?.description||l.description||'Serviço contratado')+'</small></td>'+
         '<td>'+qty(l.previous_qty)+'</td><td><b>'+qty(l.period_qty)+'</b></td><td>'+qty(l.reported_total_qty)+'</td>'+
         '<td>'+qty(prev)+'</td><td>'+money(l.reported_period_value)+'</td>'+
         '<td>'+(sel.status!=='approved'?'<button type="button" class="btn" data-bm-action="editline" data-id="'+esc(l.id)+'">✎</button>':'—')+'</td></tr>';
     }).join('');
     details='<article class="panel bm-detail"><div class="bm-detail-top"><div><h2>'+esc(sel.title)+'</h2>'+
       '<p class="helpText">'+dt(sel.period_start)+' até '+dt(sel.period_end)+' · '+badge(sel)+'</p></div>'+
       '<div class="bm-detail-actions">'+actions+'</div></div>'+
       '<div class="bm-pairs"><div><small>Acumulado anterior informado</small><b>'+money(sel.reported_previous_value)+'</b></div>'+
       '<div><small>Medição do período</small><b>'+money(sel.reported_gross_value)+'</b></div>'+
       '<div><small>Acumulado informado</small><b>'+money(sel.reported_accumulated_value)+'</b></div></div>'+
       '<p class="helpText">Documento de origem: '+esc(sel.source_filename||'Não informado')+
       (sel.document_path?' · PDF armazenado privadamente':' · <strong>PDF ainda não anexado ao sistema</strong>')+'</p>'+
       (sel.notes?'<div class="info">'+esc(sel.notes)+'</div>':'')+
       (issues.length?'<div class="bm-alert">⚠ '+issues.length+' item(ns) apresentam diferença entre o acumulado anterior do PDF e a soma dos boletins aprovados anteriores. Verifique antes de aprovar.</div>':'')+
       (unmapped.length?'<div class="bm-alert">⚠ '+unmapped.length+' item(ns) do boletim ainda não estão vinculados ao catálogo do aplicativo.</div>':'')+
       (Math.abs(sum-n(sel.reported_gross_value))>0.02?'<div class="bm-alert">⚠ Valores das linhas cadastradas não fecham com o total do PDF; verifique itens faltantes ou revisão.</div>':'')+
       '<div class="bm-table-head"><h3>Itens do boletim '+(this.itemFocus?'(serviço selecionado)':'')+'</h3><input class="input" id="bmLineSearch" type="search" placeholder="Filtrar código ou descrição"></div>'+
       '<div class="bm-table-wrap"><table class="bm-table"><thead><tr><th>Item / serviço</th><th>Anterior PDF</th><th>Neste BM</th><th>Total no PDF</th><th>Anterior recalculado</th><th>Valor no PDF</th><th>Editar</th></tr></thead><tbody>'+
       (q||'<tr><td colspan="7">Nenhum item cadastrado para esse filtro.</td></tr>')+'</tbody></table></div>'+
       (sel.status==='approved'?'':'<details class="bm-add-line"><summary>+ Incluir item neste BM</summary>'+this.lineForm(sel)+'</details>')+
       '<p class="helpText">Os valores e acumulados do PDF são referências documentais. O sistema calcula seu próprio acumulado por item considerando apenas BMs aprovados; aditivos têm controle separado.</p></article>';
   }
   const focus=this.itemFocus?'<div class="bm-focus">Filtrado pelo serviço '+esc(this.bridge.getItem(this.itemFocus)?.code||this.itemFocus)+' <button class="btn" data-bm-action="clearfocus" type="button">Ver todos</button></div>':'';
   el.innerHTML=(this.error?'<div class="bm-alert">'+esc(this.error)+'</div>':'')+top+focus+list+details+
    '<details class="bm-add-line bm-new"><summary>+ Criar próximo BM (inicialmente prévia)</summary>'+
    '<form id="bmCreateForm" class="bm-quick-form"><label>Contrato<select name="contract" class="select"><option value="gabioes">Gabiões e drenagem</option><option value="demolicao">Demolição e terraplenagem</option></select></label>'+
    '<label>Número<input name="number" class="input" type="number" min="1" step="1" required></label>'+
    '<label>Início do período<input name="start" class="input" type="date"></label>'+
    '<label>Fim do período<input name="end" class="input" type="date"></label>'+
    '<button class="btn primary" type="submit">Criar BM em prévia</button></form></details>'+
    '<input id="bmPdfInput" type="file" accept="application/pdf,.pdf" hidden>';
 },
 lineForm(b){
   const items=this.bridge.state ? this.bridge.state.role==='admin' ? window.ObraBMItems?.() : [] : [];
   const options=(items||[]).filter(i=>i.contract===b.contract).map(i=>'<option value="'+esc(i.id)+'">'+esc(i.code+' — '+i.description.slice(0,65))+'</option>').join('');
   return '<form id="bmLineForm" class="bm-quick-form"><label>Item do contrato<select name="itemId" class="select"><option value="">Sem vínculo / aditivo</option>'+options+'</select></label>'+
    '<label>Seção<select name="section" class="select"><option value="base">Contrato</option><option value="aditivo">Aditivo</option></select></label>'+
    '<label>Código do item<input name="code" class="input" required placeholder="B.2.1"></label>'+
    '<label>Unidade<input name="unit" class="input" required placeholder="vb, m², m³, m, t, und"></label>'+
    '<label>Quantidade no período<input type="number" name="qty" class="input" step=".01" min="0" required></label>'+
    '<label>Acumulado anterior no PDF<input type="number" name="prev" class="input" step=".01" min="0" value="0"></label>'+
    '<button class="btn primary" type="submit">Adicionar item</button></form>';
 },
 async action(action,id){
   if(!this.admin())return;
   if(action==='service'){this.openService(id);return}
   if(action==='select'){this.selected=id;this.itemFocus=null;this.render();return}
   if(action==='clearfocus'){this.itemFocus=null;this.render();return}
   if(action==='attach'){this.selected=id;document.getElementById('bmPdfInput')?.click();return}
   if(action==='pdf'){await this.openPdf(id);return}
   if(action==='approve'||action==='pending'){await this.changeStatus(id,action==='approve'?'approved':'pending');return}
   if(action==='editline'){await this.editLine(id);return}
   if(action==='export'){this.exportCSV(id);return}
 },
 openService(id){
   const item=this.bridge.getItem(id);if(!item)return;
   this.itemFocus=id;
   const match=this.bms.find(b=>b.contract===item.contract&&this.lines.some(l=>l.bm_id===b.id&&l.item_id===id));
   if(match)this.selected=match.id;
   if(this.state.contract!=='all'&&this.state.contract!==item.contract)this.bridge.switchContract('all');
   this.bridge.navigate('bm');this.render();
 },
 async changeStatus(id,newStatus){
   const b=this.bms.find(x=>x.id===id);if(!b||b.status==='approved')return;
   const title=esc(b.title);
   if(newStatus==='approved'){
     const issues=this.lines.filter(l=>l.bm_id===id&&Math.abs(this.priorQty(l,b)-n(l.previous_qty))>0.011);
     if(issues.length){this.notice('Há divergências entre os acumulados anteriores dos BMs. Corrija/concilie antes de aprovar.');return}
     if(!confirm('Confirmar que '+b.title+' foi formalmente APROVADO pela Solutio? Os quantitativos passarão a compor o total oficial.'))return;
   }
   try{
     const {data,error}=await this.cloud.from('obc_bms').update({status:newStatus,updated_by:this.state.user.id}).eq('id',id).eq('status',b.status).select('id').maybeSingle();
     if(error)throw error;
     if(!data)throw Error('Esse BM foi alterado por outro usuário. Atualize.');
     await this.refresh();this.render();this.bridge.render();this.notice('Situação do BM atualizada.');
   }catch(e){this.notice('Falha ao alterar BM: '+e.message,true)}
 },
 async editLine(id){
   const l=this.lines.find(x=>x.id===id),b=l&&this.bms.find(x=>x.id===l.bm_id);
   if(!l||!b||b.status==='approved')return;
   const raw=prompt('Corrigir quantidade incremental neste BM (não o acumulado)? Valor atual: '+nf(l.period_qty),String(l.period_qty));
   if(raw==null)return;
   const qty=Number(raw.replace(',','.'));
   if(!Number.isFinite(qty)||qty<0||Math.round(qty*100)/100!==qty){this.notice('Quantidade inválida: use até duas casas decimais.',true);return}
   try{
     const {data,error}=await this.cloud.from('obc_bm_lines').update({period_qty:qty,updated_at:new Date().toISOString()}).eq('id',id).eq('period_qty',l.period_qty).select('id').maybeSingle();
     if(error)throw error;if(!data)throw Error('O item foi alterado por outra pessoa. Atualize.');
     await this.refresh();this.render();this.notice('Quantidade atualizada. Compare com a referência do PDF.');
   }catch(e){this.notice('Falha: '+e.message,true)}
 },
 async createBm(form){
   const f=new FormData(form),contract=f.get('contract'),number=Number(f.get('number'));
   if(!this.admin()||!['gabioes','demolicao'].includes(contract)||!Number.isInteger(number)||number<1)return;
   const id=contract+'-bm'+String(number).padStart(2,'0');
   const row={id,contract,number,title:'BM '+String(number).padStart(2,'0')+' — '+(contract==='gabioes'?'Gabiões':'Demolição / terraplenagem'),status:'draft',period_start:f.get('start')||null,period_end:f.get('end')||null,source_filename:'',notes:'Boletim criado no aplicativo; conferir quantidades antes de submeter.'};
   try{
     const {error}=await this.cloud.from('obc_bms').insert(row);
     if(error)throw error;this.selected=id;this.itemFocus=null;await this.refresh();this.render();this.notice('BM criado como prévia.');
   }catch(e){this.notice('Não foi possível criar BM: '+e.message,true)}
 },
 async addLine(form){
   const b=this.bms.find(x=>x.id===this.selected);if(!b||b.status==='approved')return;
   const f=new FormData(form),section=f.get('section'),id=f.get('itemId'),item=this.bridge.getItem(id);
   const code=String(f.get('code')||'').trim(),unit=String(f.get('unit')||'').trim();
   const qty=Number(f.get('qty')),prev=Number(f.get('prev')||0);
   if(!code||!unit||!['base','aditivo'].includes(section)||!Number.isFinite(qty)||qty<0||!Number.isFinite(prev)||prev<0)return this.notice('Verifique o código, unidade e quantidades.',true);
   if(item&&item.contract!==b.contract)return this.notice('Item selecionado pertence a outro contrato.',true);
   const row={id:b.id+'-'+section+'-'+code,bm_id:b.id,section,item_id:section==='aditivo'?null:item?.id||null,item_code:code,description:item?.description||'Lançamento cadastrado manualmente',unit,previous_qty:prev,period_qty:qty,reported_total_qty:prev+qty};
   try{const {error}=await this.cloud.from('obc_bm_lines').insert(row);if(error)throw error;await this.refresh();this.render();this.notice('Item cadastrado no BM.')}catch(e){this.notice('Falha ao incluir item: '+e.message,true)}
 },
 async uploadPdf(file){
   const b=this.bms.find(x=>x.id===this.selected);
   if(!b||!this.admin())return;
   if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))return this.notice('Selecione um arquivo PDF.',true);
   if(file.size>15*1024*1024)return this.notice('O PDF deve ter até 15 MB.',true);
   const path=b.id+'/'+crypto.randomUUID()+'.pdf';
   try{
     this.notice('Enviando PDF para armazenamento privado...');
     const uploaded=await this.cloud.storage.from('obc-bm-pdfs').upload(path,file,{contentType:'application/pdf',upsert:false});
     if(uploaded.error)throw uploaded.error;
     const saved=await this.cloud.from('obc_bms').update({document_path:path,source_filename:file.name,updated_by:this.state.user.id}).eq('id',b.id).select('id').maybeSingle();
     if(saved.error||!saved.data){await this.cloud.storage.from('obc-bm-pdfs').remove([path]);throw saved.error||Error('Não foi possível vincular PDF')}
     if(b.document_path)await this.cloud.storage.from('obc-bm-pdfs').remove([b.document_path]);
     await this.refresh();this.render();this.notice('PDF anexado privadamente ao BM.');
   }catch(e){this.notice('Falha no envio: '+e.message,true)}
 },
 async openPdf(id){
   const b=this.bms.find(x=>x.id===id);if(!b?.document_path)return this.notice('Anexe o PDF primeiro.',true);
   const {data,error}=await this.cloud.storage.from('obc-bm-pdfs').createSignedUrl(b.document_path,600);
   if(error)return this.notice('Não foi possível abrir PDF: '+error.message,true);
   window.open(data.signedUrl,'_blank','noopener,noreferrer');
 },
 exportCSV(id){
   const b=this.bms.find(x=>x.id===id);if(!b)return;
   const headers=['BM','situacao','secao','codigo','descricao','unidade','anterior_pdf','medicao_atual','total_pdf','anterior_recalculado','valor_atual_pdf'];
   const lines=this.lines.filter(x=>x.bm_id===id).map(l=>[b.title,labels[b.status],l.section,l.item_code,l.description||this.bridge.getItem(l.item_id)?.description||'',l.unit,l.previous_qty,l.period_qty,l.reported_total_qty,this.priorQty(l,b),l.reported_period_value].map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';'));
   const csv='\ufeff'+headers.join(';')+'\n'+lines.join('\n');
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download=id+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
 },
 notice(message,error){
   if(typeof window.ObraBMToast==='function')window.ObraBMToast(message,error);
   else{const t=document.getElementById('toast');if(t){t.textContent=message;t.className='toast'+(error?' error':'');t.style.display='block';clearTimeout(this.timer);this.timer=setTimeout(()=>t.style.display='none',5200)}}
 }
};
window.ObraBM=bm;
if(window.ObraControlBMBridge)bm.init(window.ObraControlBMBridge);
})();

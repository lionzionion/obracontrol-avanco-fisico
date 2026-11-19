/* RL Movimentações e MTR | RL Engenharia
   Fonte inicial: Controle_MTR_AMBEV_Itapissuma_atualizado.xlsx.
   Segurança no Supabase (RLS): administrador e operador atribuído escrevem;
   diretoria consulta, nunca aprova CDF nem lança documentos.
   MTR, pesagem e CDF são evidências distintas. */
(() => {
"use strict";
const URL_SUPA="https://dpmofhdaefcqxohuhkfr.supabase.co";
const KEY="sb_publishable_JerHh05UE8RcnXJ91Ypuyg_IWdiAhh5";
const client=window.supabase?.createClient(URL_SUPA,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const val=v=>(v===null||v===undefined||v==="")?null:String(v).trim()||null;
const n=v=>Number(v)||0;
const dec=(v,d=2)=>Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d});
const money=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const day=v=>v?new Date(String(v).slice(0,10)+"T12:00:00").toLocaleDateString("pt-BR"):"Não informada";
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Recife",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const typeLabel={geracao:"Geração",entrada:"Entrada",transferencia:"Transferência",reaproveitamento:"Reaproveitamento",consumo:"Consumo",saida:"Saída"};
const kindLabel={mtr:"MTR",ticket:"Ticket de balança",cdf:"CDF",nf:"Nota fiscal",foto:"Fotografia",outro:"Outro"};
const SRC="Controle_MTR_AMBEV_Itapissuma_atualizado.xlsx";
let toastTimer;
const st={
  profile:null,works:[],workId:null,vehicles:[],shipments:[],fuel:[],materials:[],
  locations:[],internal:[],attachments:[],access:[],profiles:[],tab:"painel",
  detail:null,entry:null,loading:false
};
function selectedWork(){return st.works.find(w=>w.id===st.workId)}
function scoped(arr){return arr.filter(x=>x.work_id===st.workId)}
function getLoc(id){return st.locations.find(x=>x.id===id)?.name||"—"}
function getMaterial(id){return st.materials.find(x=>x.id===id)}
function isAdmin(){return st.profile?.role==="admin"}
function canWrite(){return isAdmin()||st.access.some(a=>a.work_id===st.workId&&a.user_id===st.profile?.id&&a.can_write)}
function canRead(){return Boolean(selectedWork())}
function currentAttachments(kind,id){
 const key=kind==="ship"?"shipment_id":kind==="fuel"?"fuel_id":"internal_id";
 return scoped(st.attachments).filter(a=>a[key]===id);
}
function toast(message,error=false){
 const el=$("toast");el.textContent=message;el.hidden=false;el.classList.toggle("error",error);
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true},7000);
}
function showAccess(ok){
 $("authScreen").hidden=ok;$("app").hidden=!ok;
 $("statusCloud").className="status "+(ok?"good":"bad");
 $("statusCloud").textContent=ok?(isAdmin()?"● ADMINISTRADOR":st.profile?.role==="diretoria"?"● DIRETORIA · CONSULTA":"● OPERADOR AUTORIZADO"):"● ACESSO PROTEGIDO";
}
async function authorize(){
 if(!client)throw Error("Biblioteca Supabase indisponível");
 const {data:current,error}=await client.auth.getUser();
 if(error||!current?.user){showAccess(false);return false}
 const {data:profile,error:pe}=await client.from("profiles")
   .select("id,role,active,display_name,username").eq("id",current.user.id).maybeSingle();
 if(pe||!profile?.active){showAccess(false);return false}
 if(profile.role!=="admin"&&profile.role!=="diretoria"){
   const {count,error:ae}=await client.from("rl_mov_operator_access")
     .select("id",{head:true,count:"exact"}).eq("user_id",current.user.id);
   if(ae||!count){showAccess(false);return false}
 }
 st.profile=profile;showAccess(true);return true;
}
async function pageFetch(table,fields,sort="created_at"){
 let output=[];
 for(let from=0;from<30000;from+=500){
   const {data,error}=await client.from(table).select(fields).order(sort,{ascending:false}).range(from,from+499);
   if(error)throw new Error(table+": "+error.message);
   output.push(...(data||[]));
   if(!data||data.length<500)break;
 }
 return output;
}
async function loadAll(){
 if(st.loading)return;
 st.loading=true;$("refresh").disabled=true;
 try{
   const [works,vehicles,shipments,fuel,materials,locations,internal,attachments,access,profiles]=await Promise.all([
     pageFetch("rl_mov_works","id,slug,name,location,planned_limit_t,limit_kind,note,created_at"),
     pageFetch("rl_mov_vehicles","id,work_id,plate,driver_reference,transport_company,transport_tax_id,notes,created_at"),
     pageFetch("rl_mov_shipments","id,work_id,movement_date,mtr_no,ticket_no,material_description,ibama_code,waste_class,generator,transporter,transporter_tax_id,recipient,recipient_tax_id,plate,driver,gross_kg,tare_kg,net_kg,mtr_t,cdf_status,cdf_no,cdf_date,ticket_document_observed,plate_mismatch,chronology_warning,code_warning,notes,technical_description,source_row,source_file,created_at","movement_date"),
     pageFetch("rl_mov_fuel","id,work_id,filled_date,vehicle_plate,driver,invoice_no,invoice_series,invoice_key,supplier,supplier_tax_id,fuel_type,litres,amount,notes,source_file,source_row,created_at","filled_date"),
     pageFetch("rl_mov_materials","id,work_id,name,unit,active","name"),
     pageFetch("rl_mov_locations","id,work_id,name,kind,active","name"),
     pageFetch("rl_mov_internal","id,work_id,movement_date,material_id,movement_type,origin_location_id,destination_location_id,qty,equipment,vehicle_plate,operator_name,reference_doc,notes,created_at","movement_date"),
     pageFetch("rl_mov_attachments","id,work_id,shipment_id,fuel_id,internal_id,kind,file_name,storage_path,created_at","created_at"),
     pageFetch("rl_mov_operator_access","id,work_id,user_id,can_write,created_at"),
     isAdmin()?pageFetch("profiles","id,display_name,username,role,active","display_name"):Promise.resolve([])
   ]);
   Object.assign(st,{works,vehicles,shipments,fuel,materials,locations,internal,attachments,access,profiles});
   if(!works.some(x=>x.id===st.workId))st.workId=works[0]?.id||null;
   render();
   void window.RL_MOV_DAILY?.load?.(st.workId);
 }catch(err){console.error("RL Movimentações",err);toast("Falha ao carregar: "+err.message,true)}
 finally{st.loading=false;$("refresh").disabled=false}
}
const trips=()=>scoped(st.shipments),fuels=()=>scoped(st.fuel),internal=()=>scoped(st.internal);
function diffT(x){return (n(x.net_kg)/1000)-n(x.mtr_t)}
function diverges(x){return x.mtr_t!=null&&Math.abs(diffT(x))>=.01}
function statusMarkup(x){return x.cdf_status==="recebido"?'<span class="badge success">CDF recebido</span>':'<span class="badge warn">CDF pendente</span>'}
function showTab(key){
 st.tab=key;
 document.querySelectorAll(".mov-tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===key));
 document.querySelectorAll(".mov-panel").forEach(p=>p.hidden=p.id!=="panel-"+key);
}
function render(){
 const selected=st.workId;
 $("workFilter").innerHTML=st.works.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join("");
 $("workFilter").value=selected||"";
 $("workLocation").textContent=selectedWork()?.location||"Sem obra cadastrada";
 $("workLimitLabel").textContent=selectedWork()?.planned_limit_t!=null?"Limite "+selectedWork().limit_kind+": "+dec(selectedWork().planned_limit_t,2)+" t":"Sem limite cadastrado";
 document.querySelectorAll(".can-write").forEach(el=>el.hidden=!canWrite());
 document.querySelectorAll(".admin-only").forEach(el=>el.hidden=!isAdmin());
 $("accessPanel").hidden=!isAdmin();
 renderStats();renderOverview();renderTrips();renderInternal();renderFuel();renderFleet();renderDocuments();renderAccess();
 showTab(st.tab);
}
function renderStats(){
 const xs=trips(),fs=fuels();
 const weight=xs.reduce((a,x)=>a+n(x.net_kg)/1000,0);
 const mtr=xs.reduce((a,x)=>a+n(x.mtr_t),0);
 const discrepant=xs.filter(diverges).length;
 const pending=xs.filter(x=>x.cdf_status!=="recebido").length;
 $("kpiTrips").textContent=String(xs.length);
 $("kpiWeight").textContent=dec(weight)+" t";
 $("kpiMtr").textContent=dec(mtr)+" t";
 $("kpiDiff").textContent=(weight-mtr>=0?"+":"")+dec(weight-mtr)+" t";
 $("kpiCdf").textContent=String(pending);
 $("kpiDivergent").textContent=String(discrepant);
 $("kpiFuel").textContent=String(fs.length);
 $("kpiDiesel").textContent=money(fs.reduce((a,x)=>a+n(x.amount),0));
 const plates=xs.filter(x=>x.plate_mismatch).length,missingNf=fs.filter(x=>!x.invoice_no).length;
 const warnings=[
  pending?'<span class="badge warn">'+pending+' CDFs pendentes</span>':"",
  discrepant?'<span class="badge warn">'+discrepant+' divergências de peso</span>':"",
  plates?'<span class="badge danger">'+plates+' divergência(s) de placa</span>':"",
  missingNf?'<span class="badge warn">'+missingNf+' abastecimento(s) sem NF informada</span>':""
 ].filter(Boolean);
 $("notices").innerHTML=warnings.join("");
 $("notices").hidden=warnings.length===0;
}
function renderOverview(){
 const xs=trips(),sum=xs.reduce((a,x)=>a+n(x.net_kg)/1000,0);
 const lim=selectedWork()?.planned_limit_t;
 const ratio=lim>0?sum/lim*100:0;
 $("limitRatio").textContent=lim>0?dec(ratio)+"% do limite":"Sem meta";
 $("limitDetails").textContent=lim>0?dec(sum)+" t de "+dec(lim)+" t planejadas":"Informe uma meta de acompanhamento";
 $("limitBar").style.width=Math.min(100,Math.max(0,ratio))+"%";
 $("summaryLimit").textContent=lim!=null?dec(lim)+" t ("+(selectedWork()?.limit_kind==="autorizado"?"autorizado":"planejado")+")":"Não cadastrado";
 $("summaryBalance").textContent=lim!=null?dec(n(lim)-sum)+" t":"—";
 $("summaryCertified").textContent=dec(xs.filter(x=>x.cdf_status==="recebido").reduce((a,x)=>a+n(x.net_kg)/1000,0))+" t";
 $("summaryPlates").textContent=String(xs.filter(x=>x.plate_mismatch).length);
 const recent=xs.slice().sort((a,b)=>String(b.movement_date).localeCompare(String(a.movement_date))).slice(0,6);
 $("lastTrips").innerHTML=recent.length?recent.map(x=>
  '<div class="compact-item"><div><strong>'+esc(x.ticket_no?"Ticket "+x.ticket_no:"MTR "+x.mtr_no)+'</strong>'+
  '<small>'+esc(day(x.movement_date))+' · '+esc(x.plate||"Sem placa")+' · '+dec(n(x.net_kg)/1000)+' t</small>'+
  '<small>'+esc(x.mtr_no?"MTR "+x.mtr_no:"Sem MTR")+' · '+(x.cdf_status==="recebido"?"CDF recebido":"CDF pendente")+'</small></div>'+
  '<button type="button" data-open="ship:'+esc(x.id)+'">Consultar</button></div>').join(""):'<p class="empty-note">Nenhuma viagem cadastrada.</p>';
 renderStock();
}
function allBalances(){
 const map=new Map();
 const add=(materialId,locationId,delta)=>{
   if(!locationId)return;
   const id=materialId+"|"+locationId;
   map.set(id,(map.get(id)||0)+delta);
 };
 for(const e of internal()){
   const quantity=n(e.qty);
   if(e.origin_location_id)add(e.material_id,e.origin_location_id,-quantity);
   if(e.destination_location_id)add(e.material_id,e.destination_location_id,quantity);
 }
 return [...map.entries()].map(([key,total])=>{
   const [materialId,locationId]=key.split("|");
   const mat=getMaterial(materialId);
   return {materialId,locationId,material:mat?.name||"Material excluído",location:getLoc(locationId),unit:mat?.unit||"?",balance:Math.round(total*1000)/1000};
 }).sort((a,b)=>a.material.localeCompare(b.material,"pt-BR")||a.location.localeCompare(b.location,"pt-BR"));
}
function renderStock(){
 const balances=allBalances();
 const cards=balances.filter(x=>x.balance!==0).slice(0,9);
 $("stockPreview").innerHTML=cards.length?cards.map(x=>
  '<div class="stock-mini"><strong>'+esc(x.material)+'</strong><small>'+esc(x.location)+'</small>'+
  '<b class="'+(x.balance<0?"stock-neg":"")+'">'+dec(x.balance,3)+' '+esc(x.unit)+'</b></div>').join("")
  :'<div class="empty-note">Ainda não existem movimentações internas. Cadastre um material e um local, registre a geração/entrada e depois as transferências.</div>';
 $("stockTable").innerHTML=balances.length?
  '<table><thead><tr><th>Material</th><th>Localização</th><th>Unidade</th><th class="right">Saldo calculado</th></tr></thead><tbody>'+
  balances.map(x=>'<tr><td>'+esc(x.material)+'</td><td>'+esc(x.location)+'</td><td>'+esc(x.unit)+'</td><td class="right"><strong class="'+(x.balance<0?"stock-neg":"")+'">'+dec(x.balance,3)+'</strong></td></tr>').join("")+
  '</tbody></table>':'<p class="empty-note">Sem saldo registrado. A planilha não contém movimentações internas; não foram gerados lançamentos fictícios.</p>';
}
function renderTrips(){
 const plates=[...new Set(trips().map(x=>x.plate).filter(Boolean))].sort();
 const sel=$("shipPlate"),last=sel.value;
 sel.innerHTML='<option value="all">Todas</option>'+plates.map(p=>'<option value="'+esc(p)+'">'+esc(p)+'</option>').join("");
 sel.value=plates.includes(last)?last:"all";
 const query=$("shipSearch").value.trim().toLocaleLowerCase("pt-BR"),
  status=$("shipStatus").value,plate=sel.value;
 const rs=trips().filter(x=>{
  if(plate!=="all"&&x.plate!==plate)return false;
  if(status==="pendente"&&x.cdf_status==="recebido")return false;
  if(status==="recebido"&&x.cdf_status!=="recebido")return false;
  if(status==="divergente"&&!diverges(x))return false;
  if(status==="placa"&&!x.plate_mismatch)return false;
  if(query&&![x.ticket_no,x.mtr_no,x.plate,x.driver,x.material_description].some(y=>String(y||"").toLocaleLowerCase("pt-BR").includes(query)))return false;
  return true;
 }).sort((a,b)=>String(b.movement_date).localeCompare(String(a.movement_date))||String(b.ticket_no||"").localeCompare(String(a.ticket_no||"")));
 $("shipRows").innerHTML=rs.length?rs.map(x=>
  '<tr><td>'+esc(day(x.movement_date))+'</td><td><strong>MTR '+esc(x.mtr_no||"—")+'</strong><span class="secondary">Ticket '+esc(x.ticket_no||"—")+'</span></td>'+
  '<td>'+esc(x.plate||"—")+'<span class="secondary">'+esc(x.driver||"")+'</span></td>'+
  '<td class="right">'+dec(n(x.net_kg)/1000)+'</td><td class="right">'+(x.mtr_t===null?"—":dec(x.mtr_t))+'</td>'+
  '<td class="right">'+(x.mtr_t===null?"—":(diffT(x)>=0?"+":"")+dec(diffT(x)))+'</td>'+
  '<td>'+statusMarkup(x)+(x.plate_mismatch?'<span class="badge danger">Placa</span>':'')+
  (x.chronology_warning?'<span class="badge warn">Data</span>':'')+(diverges(x)?'<span class="badge warn">Massa</span>':'')+'</td>'+
  '<td><button class="table-view" type="button" data-open="ship:'+esc(x.id)+'">Detalhes</button></td></tr>').join("")
  :'<tr><td colspan="8" class="empty">Nenhum transporte corresponde aos filtros.</td></tr>';
 $("shipCount").textContent=rs.length+" viagem(ns) · peso bruto e tara conferidos pelo cálculo bruto − tara";
}
function renderInternal(){
 const rs=internal().slice().sort((a,b)=>String(b.movement_date).localeCompare(String(a.movement_date)));
 $("internalRows").innerHTML=rs.length?rs.map(x=>{
  const mat=getMaterial(x.material_id);
  return '<tr><td>'+esc(day(x.movement_date))+'</td><td>'+esc(mat?.name||"—")+'</td>'+
  '<td>'+esc(typeLabel[x.movement_type]||x.movement_type)+'</td>'+
  '<td>'+esc(getLoc(x.origin_location_id))+' → '+esc(getLoc(x.destination_location_id))+'</td>'+
  '<td class="right">'+dec(x.qty,3)+' '+esc(mat?.unit||"")+'</td>'+
  '<td>'+esc(x.operator_name||"—")+'<span class="secondary">'+esc(x.equipment||"")+'</span></td>'+
  '<td><button class="table-view" data-open="internal:'+esc(x.id)+'">Detalhes</button></td></tr>';
 }).join(""):'<tr><td colspan="7" class="empty">Sem movimentação interna. Crie a primeira entrada ou geração real.</td></tr>';
}
function renderFuel(){
 const xs=fuels();
 const byPlate=new Map();
 xs.forEach(x=>{
  const k=x.vehicle_plate||"Sem placa",a=byPlate.get(k)||{amount:0,litres:0,litresKnown:0,qty:0};
  a.amount+=n(x.amount);a.qty++;
  if(x.litres!==null){a.litres+=n(x.litres);a.litresKnown++}
  byPlate.set(k,a);
 });
 $("fuelByPlate").innerHTML=[...byPlate.entries()].sort().map(([plate,v])=>
  '<div class="plate-summary"><strong>'+esc(plate)+'</strong><small>'+v.qty+' abastecimento(s)</small>'+
  '<small>'+dec(v.litres,3)+' L documentados'+(v.qty!==v.litresKnown?' · litros pendentes':'')+'</small><b>'+money(v.amount)+'</b></div>').join("");
 $("fuelRows").innerHTML=xs.length?xs.slice().sort((a,b)=>String(b.filled_date).localeCompare(String(a.filled_date))).map(x=>
  '<tr><td>'+esc(day(x.filled_date))+'</td><td><strong>'+esc(x.vehicle_plate)+'</strong><span class="secondary">'+esc(x.driver||"—")+'</span></td>'+
  '<td>'+(x.invoice_no?esc(x.invoice_no):'<span class="badge warn">Sem NF</span>')+'</td>'+
  '<td>'+esc(x.supplier||"Não informado")+'</td><td class="right">'+(x.litres===null?"—":dec(x.litres,3))+'</td>'+
  '<td class="right"><strong>'+money(x.amount)+'</strong></td><td><button class="table-view" data-open="fuel:'+esc(x.id)+'">Detalhes</button></td></tr>').join("")
  :'<tr><td colspan="7" class="empty">Nenhum abastecimento registrado.</td></tr>';
}
function renderFleet(){
 $("fleetList").innerHTML=scoped(st.vehicles).map(x=>
  '<div class="compact-item"><div><strong>'+esc(x.plate)+'</strong><small>'+esc(x.driver_reference||"Motorista não informado")+'</small>'+
  '<small>'+esc(x.transport_company||"Transportadora não informada")+'</small></div></div>').join("")||'<p class="empty-note">Nenhum veículo cadastrado.</p>';
 $("materialsList").innerHTML='<h4>Materiais cadastrados</h4>'+
   (scoped(st.materials).map(x=>'<div class="mini-item"><strong>'+esc(x.name)+'</strong><small>'+esc(x.unit)+'</small></div>').join("")||'<p class="empty-note">Nenhum material.</p>');
 $("locationsList").innerHTML='<h4>Locais cadastrados</h4>'+
   (scoped(st.locations).map(x=>'<div class="mini-item"><strong>'+esc(x.name)+'</strong><small>'+esc(x.kind)+'</small></div>').join("")||'<p class="empty-note">Nenhum local.</p>');
}
function renderDocuments(){
 const xs=trips(),fs=fuels(),docs=scoped(st.attachments);
 const categories=[
   {name:"CDFs pendentes",count:xs.filter(x=>x.cdf_status!=="recebido").length},
   {name:"Divergências entre MTR e ticket",count:xs.filter(diverges).length},
   {name:"Placas divergentes",count:xs.filter(x=>x.plate_mismatch).length},
   {name:"Cronologia a verificar",count:xs.filter(x=>x.chronology_warning).length},
   {name:"Classificação/código a conferir",count:xs.filter(x=>x.code_warning).length},
   {name:"Abastecimentos sem NF informada",count:fs.filter(x=>!x.invoice_no).length}
 ];
 $("pendingCards").innerHTML=categories.map(x=>
  '<div class="pending-card"><strong>'+x.count+'</strong><span>'+esc(x.name)+'</span></div>').join("");
 $("fileList").innerHTML=docs.length?docs.map(doc=>
  '<div class="compact-item"><div><strong>'+esc(doc.file_name)+'</strong><small>'+esc(kindLabel[doc.kind]||doc.kind)+' · '+esc(day(doc.created_at))+'</small></div>'+
  '<button type="button" data-file="'+esc(doc.id)+'">Baixar</button></div>').join("")
  :'<p class="empty-note">Ainda não há documentos armazenados no bucket privado. Os números originais foram importados da planilha; PDFs de MTR, ticket e CDF precisam ser anexados individualmente.</p>';
}
function renderAccess(){
 if(!isAdmin())return;
 const opts=st.profiles.filter(x=>x.active&&x.role==="colaborador").map(x=>
  '<option value="'+esc(x.id)+'">'+esc(x.display_name||x.username||x.id)+'</option>').join("");
 $("accessUser").innerHTML='<option value="">Selecione um colaborador</option>'+opts;
 const xs=st.access.filter(x=>x.work_id===st.workId);
 $("accessList").innerHTML=xs.map(x=>{
  const profile=st.profiles.find(p=>p.id===x.user_id);
  return '<div class="mini-item"><div><strong>'+esc(profile?.display_name||profile?.username||"Usuário")+'</strong>'+
   '<small>'+esc(x.can_write?"Lançamentos autorizados":"Somente leitura")+'</small></div>'+
   '<button class="link-button" type="button" data-revoke="'+esc(x.id)+'">Revogar</button></div>';
 }).join("")||'<p class="empty-note">Nenhuma atribuição operacional nesta obra.</p>';
}
function field(name,label,type="text",options={}){
 let control="";
 const at='name="'+esc(name)+'" id="f_'+esc(name)+'"';
 const required=options.required?" required":"";
 const placeholder=options.placeholder?' placeholder="'+esc(options.placeholder)+'"':"";
 const defaultValue=options.value!==undefined&&options.value!==null?esc(options.value):"";
 if(type==="select"){
   control='<select '+at+required+'>'+((options.items||[]).map(o=>
    '<option value="'+esc(o.value)+'"'+(String(o.value)===String(options.value)?" selected":"")+'>'+esc(o.label)+'</option>')).join("")+'</select>';
 }else if(type==="textarea"){
   control='<textarea '+at+placeholder+' rows="3">'+defaultValue+'</textarea>';
 }else if(type==="checkbox"){
   control='<label class="checkbox-label"><input type="checkbox" '+at+' '+(options.checked?"checked":"")+'>'+esc(label)+'</label>';
   return '<div class="'+(options.full?"span2":"")+'">'+control+'</div>';
 }else{
   const min=type==="number"?' min="'+(options.min??"0")+'" step="'+(options.step??"0.001")+'"':"";
   const max=options.maxlength?' maxlength="'+options.maxlength+'"':"";
   control='<input '+at+' type="'+type+'" value="'+defaultValue+'"'+placeholder+required+min+max+'>';
 }
 return '<div class="'+(options.full?"span2":"")+'"><label for="f_'+esc(name)+'">'+esc(label)+'</label>'+control+'</div>';
}
function materialOptions(){return scoped(st.materials).filter(x=>x.active).map(x=>({value:x.id,label:x.name+" ("+x.unit+")"}))}
function locationOptions(){return [{value:"",label:"Selecione o local"},...scoped(st.locations).filter(x=>x.active).map(x=>({value:x.id,label:x.name}))]}
function plateOptions(){return [{value:"",label:"Selecione o veículo"},...scoped(st.vehicles).map(x=>({value:x.plate,label:x.plate+" · "+(x.driver_reference||"sem motorista")}))]}
function openEntry(kind){
 if(!canWrite()&&!(kind==="work"&&isAdmin()))return;
 const id=st.workId,work=selectedWork();
 if(!id&&kind!=="work"){toast("Cadastre ou selecione uma obra.",true);return}
 st.entry=kind;
 const dateVal=today(),veh=plateOptions(),loc=locationOptions();
 let title="",fields="";
 if(kind==="ship"){
  title="Nova viagem de destinação";
  fields=[
   field("movement_date","Data da viagem","date",{value:dateVal,required:true}),
   field("plate","Placa do caminhão","select",{items:veh}),
   field("mtr_no","Número do MTR","text",{placeholder:"Ex.: 2114256370"}),
   field("ticket_no","Código do ticket","text",{placeholder:"Ex.: 65357"}),
   field("driver","Motorista","text"),
   field("material_description","Resíduo / material","text",{value:"Fresa asfáltica / resíduos de pavimentação",full:true,required:true}),
   field("ibama_code","Código IBAMA / resíduo","text"),
   field("waste_class","Classificação informada","text"),
   field("gross_kg","Peso bruto (kg)","number",{required:true,step:"0.01"}),
   field("tare_kg","Tara (kg)","number",{required:true,step:"0.01"}),
   field("mtr_t","Quantidade declarada no MTR (t)","number",{step:"0.001"}),
   field("transporter","Transportadora","text",{value:scoped(st.vehicles)[0]?.transport_company||""}),
   field("recipient","Destinador","text",{value:scoped(st.vehicles)[0]?.transport_company||""}),
   field("plate_mismatch","Existe divergência de placa","checkbox",{full:true}),
   field("chronology_warning","Existe divergência de datas","checkbox",{full:true}),
   field("notes","Observações e pendências","textarea",{full:true})
  ].join("");
 }else if(kind==="fuel"){
  title="Novo abastecimento";
  fields=[
   field("filled_date","Data do abastecimento","date",{value:dateVal,required:true}),
   field("vehicle_plate","Placa","select",{items:veh,required:true}),
   field("driver","Motorista","text"),
   field("invoice_no","Número da NF (se houver)","text"),
   field("invoice_series","Série da NF","text"),
   field("invoice_key","Chave NF-e","text"),
   field("supplier","Posto / fornecedor","text"),
   field("supplier_tax_id","CNPJ do fornecedor","text"),
   field("fuel_type","Combustível","select",{items:[{value:"Diesel S10",label:"Diesel S10"},{value:"Diesel S500",label:"Diesel S500"},{value:"Gasolina",label:"Gasolina"},{value:"Outro",label:"Outro"}]}),
   field("litres","Litros (se conhecido)","number",{step:"0.001"}),
   field("amount","Valor (R$)","number",{required:true,step:"0.01"}),
   field("notes","Observações","textarea",{full:true})
  ].join("");
 }else if(kind==="internal"){
  title="Nova movimentação interna";
  fields=[
   field("movement_date","Data","date",{value:dateVal,required:true}),
   field("material_id","Material","select",{items:materialOptions(),required:true}),
   field("movement_type","Operação","select",{items:Object.entries(typeLabel).map(([value,label])=>({value,label}))}),
   field("qty","Quantidade (na unidade do material)","number",{required:true,step:"0.001"}),
   field("origin_location_id","Origem","select",{items:loc}),
   field("destination_location_id","Destino","select",{items:loc}),
   field("equipment","Equipamento utilizado","text"),
   field("vehicle_plate","Placa (se houver)","text"),
   field("operator_name","Operador/responsável","text"),
   field("reference_doc","Referência ou ordem de serviço","text"),
   field("notes","Observações","textarea",{full:true})
  ].join("");
 }else if(kind==="material"){
  title="Cadastrar material";
  fields=field("name","Nome do material","text",{required:true,full:true})+
    field("unit","Unidade de controle","select",{required:true,items:["m³","t","kg","un","m²","m","viagem"].map(v=>({value:v,label:v}))});
 }else if(kind==="location"){
  title="Cadastrar local / frente";
  fields=field("name","Nome do local","text",{required:true,full:true})+
    field("kind","Categoria","select",{items:["Frente de escavação","Estoque temporário","Pátio","Reaproveitamento","Área de aplicação","Outro"].map(v=>({value:v,label:v}))});
 }else if(kind==="vehicle"){
  title="Cadastrar caminhão";
  fields=field("plate","Placa","text",{required:true})+field("driver_reference","Motorista de referência","text")+
    field("transport_company","Transportadora","text",{full:true})+
    field("transport_tax_id","CNPJ transportadora","text")+
    field("notes","Observações","textarea",{full:true});
 }else if(kind==="work"){
  title="Nova obra";
  fields=field("name","Nome da obra","text",{required:true,full:true})+
    field("location","Cidade / UF","text",{required:true})+
    field("planned_limit_t","Limite de acompanhamento em toneladas (opcional)","number",{step:"0.001"})+
    field("note","Observações","textarea",{full:true});
 }
 $("entryTitle").textContent=title;$("entryFields").innerHTML=fields;
 $("entryError").textContent="";
 $("entryDialog").showModal();
 if(kind==="internal"){
   if(!scoped(st.materials).length||!scoped(st.locations).length) {
     $("entryDialog").close();toast("Cadastre pelo menos um material e um local antes de registrar movimentações.",true);
   }
 }
}
function asForm(){return Object.fromEntries(new FormData($("entryForm")).entries())}
function currentBalance(materialId,locationId){
 return allBalances().find(x=>x.materialId===materialId&&x.locationId===locationId)?.balance||0;
}
async function saveEntry(event){
 event.preventDefault();const kind=st.entry;
 if(!canWrite()&&!(kind==="work"&&isAdmin()))return;
 const f=asForm();let table,record;
 $("entryError").textContent="";
 try{
  if(kind==="ship"){
   if(!val(f.mtr_no)&&!val(f.ticket_no))throw Error("Informe ao menos o MTR ou o código do ticket.");
   if(n(f.gross_kg)<=n(f.tare_kg)||n(f.tare_kg)<0)throw Error("O peso bruto precisa ser maior que a tara.");
   const vehicle=st.vehicles.find(x=>x.plate===f.plate&&x.work_id===st.workId);
   table="rl_mov_shipments";
   record={work_id:st.workId,movement_date:f.movement_date,mtr_no:val(f.mtr_no),ticket_no:val(f.ticket_no),
    plate:val(f.plate),driver:val(f.driver)||vehicle?.driver_reference||null,
    material_description:f.material_description.trim(),ibama_code:val(f.ibama_code),waste_class:val(f.waste_class),
    gross_kg:n(f.gross_kg),tare_kg:n(f.tare_kg),mtr_t:val(f.mtr_t)===null?null:n(f.mtr_t),
    transporter:val(f.transporter),recipient:val(f.recipient),
    plate_mismatch:f.plate_mismatch==="on",chronology_warning:f.chronology_warning==="on",
    code_warning:!val(f.ibama_code),notes:val(f.notes),cdf_status:"pendente",
    created_by:st.profile.id};
  }else if(kind==="fuel"){
   if(!val(f.vehicle_plate))throw Error("Selecione a placa do veículo.");
   if(n(f.amount)<=0)throw Error("Informe o valor do abastecimento.");
   const vehicle=st.vehicles.find(x=>x.plate===f.vehicle_plate&&x.work_id===st.workId);
   table="rl_mov_fuel";
   record={work_id:st.workId,filled_date:f.filled_date,vehicle_plate:f.vehicle_plate,
    driver:val(f.driver)||vehicle?.driver_reference||null,
    invoice_no:val(f.invoice_no),invoice_series:val(f.invoice_series),invoice_key:val(f.invoice_key),
    supplier:val(f.supplier),supplier_tax_id:val(f.supplier_tax_id),fuel_type:f.fuel_type,
    litres:val(f.litres)===null?null:n(f.litres),amount:n(f.amount),
    notes:val(f.notes),created_by:st.profile.id};
  }else if(kind==="internal"){
   const material=getMaterial(f.material_id);
   if(!material||material.work_id!==st.workId)throw Error("Material não pertence à obra.");
   const dest=val(f.destination_location_id),origin=val(f.origin_location_id),
     typ=f.movement_type,qty=n(f.qty);
   if(!(qty>0))throw Error("Quantidade deve ser maior que zero.");
   if(["geracao","entrada"].includes(typ)&&(!dest||origin))throw Error("Geração/entrada exige destino sem origem.");
   if(["saida","consumo"].includes(typ)&&(!origin||dest))throw Error("Saída/consumo exige origem sem destino.");
   if(["transferencia","reaproveitamento"].includes(typ)&&(!origin||!dest||origin===dest))
     throw Error("Transferência requer origem e destino diferentes.");
   if(origin&&currentBalance(material.id,origin)+.000001<qty)throw Error("Saldo insuficiente na origem. Registre primeiro a geração/entrada de material.");
   table="rl_mov_internal";
   record={work_id:st.workId,movement_date:f.movement_date,material_id:f.material_id,movement_type:typ,
     origin_location_id:origin,destination_location_id:dest,qty,
     equipment:val(f.equipment),vehicle_plate:val(f.vehicle_plate),
     operator_name:val(f.operator_name),reference_doc:val(f.reference_doc),
     notes:val(f.notes),created_by:st.profile.id};
  }else if(kind==="material"){
   table="rl_mov_materials";record={work_id:st.workId,name:f.name.trim(),unit:f.unit};
  }else if(kind==="location"){
   table="rl_mov_locations";record={work_id:st.workId,name:f.name.trim(),kind:f.kind};
  }else if(kind==="vehicle"){
   table="rl_mov_vehicles";record={work_id:st.workId,plate:f.plate.replace(/[^a-zA-Z0-9]/g,"").toUpperCase(),
     driver_reference:val(f.driver_reference),transport_company:val(f.transport_company),
     transport_tax_id:val(f.transport_tax_id),notes:val(f.notes)};
   if(!/^[A-Z0-9]{7}$/.test(record.plate))throw Error("Informe uma placa brasileira com 7 caracteres.");
  }else if(kind==="work"){
   if(!isAdmin())throw Error("Somente administrador cadastra obra.");
   table="rl_mov_works";
   const slug=f.name.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-")
     .replace(/^-|-$/g,"").slice(0,55)+"-"+crypto.randomUUID().slice(0,8);
   record={slug,name:f.name.trim(),location:val(f.location),limit_kind:"planejado",
     planned_limit_t:val(f.planned_limit_t)===null?null:n(f.planned_limit_t),note:val(f.note)};
  }else{throw Error("Tipo de lançamento não suportado.")}
  const button=$("entrySubmit");button.disabled=true;
  const {data,error}=await client.from(table).insert(record).select("id").single();
  button.disabled=false;
  if(error)throw error;
  $("entryDialog").close();$("entryForm").reset();
  if(kind==="work")st.workId=data.id;
  await loadAll();toast("Registro salvo no Supabase com sucesso.");
 }catch(err){$("entryError").textContent=err.code==="23505"?"Registro duplicado: confirme MTR, ticket, placa ou número de NF.":err.message;console.warn("Movimentações: ",err)}
}
function detailCell(label,v){return '<div class="detail-value"><span>'+esc(label)+'</span><strong>'+esc(v===null||v===undefined||v===""?"Não informado":v)+'</strong></div>'}
function detailSection(heading,html){return '<section class="detail-section"><h3>'+esc(heading)+'</h3>'+html+'</section>'}
function detailOf(kind,id){
 const src=kind==="ship"?st.shipments:kind==="fuel"?st.fuel:st.internal;
 const r=src.find(x=>x.id===id&&x.work_id===st.workId);
 if(!r)return;
 st.detail={kind,id};let title,html="";
 if(kind==="ship"){
  title="MTR "+(r.mtr_no||"—")+" / Ticket "+(r.ticket_no||"—");
  html='<p>'+statusMarkup(r)+'</p><div class="detail-grid">'+
   detailCell("Data",day(r.movement_date))+detailCell("Placa no controle",r.plate)+detailCell("Motorista",r.driver)+
   detailCell("Peso bruto",dec(r.gross_kg)+" kg")+detailCell("Tara",dec(r.tare_kg)+" kg")+
   detailCell("Peso líquido",dec(n(r.net_kg)/1000)+" t")+
   detailCell("Quantidade MTR",r.mtr_t===null?"Não informada":dec(r.mtr_t)+" t")+
   detailCell("Diferença",r.mtr_t===null?"—":(diffT(r)>=0?"+":"")+dec(diffT(r))+" t")+
   detailCell("Classificação",r.waste_class||"Não validada")+
   detailCell("Código IBAMA",r.ibama_code||"Conferência pendente")+
   detailCell("Nº CDF",r.cdf_no||"Não recebido")+
   detailCell("Data CDF",day(r.cdf_date))+'</div>';
  const alerts=[
   r.plate_mismatch?"Placa diferente entre MTR e ticket. Conferir documentos originais.":"",
   r.chronology_warning?"Data de emissão/transporte e pesagem precisam ser reconciliadas.":"",
   r.code_warning?"Código IBAMA e enquadramento do resíduo precisam ser confirmados.":"",
   diverges(r)?"Massa aferida no ticket diferente da quantidade declarada no MTR.":""
  ].filter(Boolean);
  if(alerts.length)html+=detailSection("Alertas de conferência",alerts.map(x=>'<p class="warning-line">'+esc(x)+'</p>').join(""));
  html+=detailSection("Resíduo e destinação",'<div class="detail-grid">'+detailCell("Resíduo",r.material_description)+
   detailCell("Transportadora",r.transporter)+detailCell("Destinador",r.recipient)+
   detailCell("CNPJ transportadora",r.transporter_tax_id)+detailCell("CNPJ destinador",r.recipient_tax_id)+
   detailCell("Gerador",r.generator)+'</div>');
  html+=detailSection("Observações e origem",'<p class="detail-note">'+esc(r.notes||"Sem observações")+'</p>'+
    '<p class="detail-note">'+esc(r.source_file?"Importado da planilha · linha "+r.source_row:"Lançamento no aplicativo")+'</p>');
 }else if(kind==="fuel"){
  title="Abastecimento "+(r.invoice_no?"NF "+r.invoice_no:r.vehicle_plate);
  html='<div class="detail-grid">'+detailCell("Data",day(r.filled_date))+detailCell("Placa",r.vehicle_plate)+
   detailCell("Motorista",r.driver)+detailCell("Valor",money(r.amount))+
   detailCell("Litros",r.litres===null?"Não informado":dec(r.litres,3)+" L")+
   detailCell("Preço por litro",r.litres>0?money(n(r.amount)/n(r.litres))+"/L":"Não disponível")+
   detailCell("NF",r.invoice_no||"Pendente")+detailCell("Série NF",r.invoice_series)+
   detailCell("Combustível",r.fuel_type)+detailCell("Fornecedor",r.supplier)+
   detailCell("CNPJ do fornecedor",r.supplier_tax_id)+detailCell("Chave NF-e",r.invoice_key)+'</div>';
  html+=detailSection("Observações",'<p class="detail-note">'+esc(r.notes||"Nenhuma")+
   '</p><p class="detail-note">Abastecimento operacional não registrado automaticamente no financeiro RL Custos.</p>');
 }else{
  title="Movimentação interna · "+(typeLabel[r.movement_type]||r.movement_type);
  const mat=getMaterial(r.material_id);
  html='<div class="detail-grid">'+detailCell("Data",day(r.movement_date))+
   detailCell("Material",mat?.name)+detailCell("Quantidade",dec(r.qty,3)+" "+(mat?.unit||""))+
   detailCell("Origem",getLoc(r.origin_location_id))+detailCell("Destino",getLoc(r.destination_location_id))+
   detailCell("Responsável",r.operator_name)+detailCell("Equipamento",r.equipment)+
   detailCell("Placa",r.vehicle_plate)+detailCell("Referência",r.reference_doc)+'</div>'+
   detailSection("Observações",'<p class="detail-note">'+esc(r.notes||"Nenhuma")+'</p>');
 }
 const docs=currentAttachments(kind,id);
 html+=detailSection("Documentos vinculados ("+docs.length+")",
  docs.length?docs.map(x=>'<div class="mini-item"><span>'+esc(kindLabel[x.kind]||x.kind)+
   ' · '+esc(x.file_name)+'</span><button class="link-button" type="button" data-file="'+esc(x.id)+'">Baixar</button></div>').join("")
   :'<p class="detail-note">Sem arquivo anexado. A existência de número de MTR/ticket no controle não significa que o PDF original esteja armazenado.</p>');
 $("detailTitle").textContent=title;$("detailBody").innerHTML=html;
 $("detailControls").hidden=!canWrite();
 $("cdfFormWrapper").hidden=!canWrite()||kind!=="ship"||r.cdf_status==="recebido";
 if(kind==="ship"){$("cdfNumber").value=r.cdf_no||"";$("cdfDate").value=r.cdf_date||""}
 $("docKind").value=kind==="ship"?"ticket":kind==="fuel"?"nf":"foto";
 $("docInput").value="";
 $("detailDialog").showModal();
}
async function saveDocument(kind,id,file,docType){
 if(!canWrite())throw Error("Operação permitida apenas a responsáveis com acesso de lançamento.");
 if(!file)throw Error("Selecione um arquivo.");
 if(file.size>15*1024*1024)throw Error("O arquivo deve ter até 15 MB.");
 const allowed=["application/pdf","image/jpeg","image/png","image/webp"];
 if(!allowed.includes(file.type))throw Error("Envie PDF, JPG, PNG ou WebP.");
 const entity=kind==="ship"?"shipments":kind==="fuel"?"fuel":"internal";
 const name=file.name.normalize("NFKD").replace(/[^\w.-]+/g,"_").slice(-130);
 const path=st.workId+"/"+entity+"/"+id+"/"+crypto.randomUUID()+"-"+name;
 const {error:upErr}=await client.storage.from("rl-mov-documentos").upload(path,file,{upsert:false,contentType:file.type});
 if(upErr)throw upErr;
 const obj={work_id:st.workId,kind:docType,file_name:file.name.slice(0,240),storage_path:path,
  uploaded_by:st.profile.id};
 obj[kind==="ship"?"shipment_id":kind==="fuel"?"fuel_id":"internal_id"]=id;
 const {error}=await client.from("rl_mov_attachments").insert(obj);
 if(error)throw Error("Arquivo armazenado, mas não foi possível vinculá-lo: "+error.message);
}
async function handleAttachment(){
 if(!canWrite()||!st.detail)return;
 const file=$("docInput").files[0],kind=$("docKind").value;
 const button=$("sendDoc");button.disabled=true;
 try{
  await saveDocument(st.detail.kind,st.detail.id,file,kind);
  const {kind:recordKind,id}=st.detail;
  await loadAll();detailOf(recordKind,id);
  toast("Documento anexado em armazenamento privado e vinculado ao registro.");
 }catch(err){toast(err.message,true)}finally{button.disabled=false}
}
async function downloadDocument(id){
 const doc=st.attachments.find(x=>x.id===id&&x.work_id===st.workId);
 if(!doc)return;
 try{
  const {data,error}=await client.storage.from("rl-mov-documentos").download(doc.storage_path);
  if(error)throw error;
  const objUrl=URL.createObjectURL(data),a=document.createElement("a");
  a.href=objUrl;a.download=doc.file_name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(objUrl),10000);
 }catch(err){toast("Não foi possível baixar: "+err.message,true)}
}
async function saveCdf(event){
 event.preventDefault();
 if(!canWrite()||st.detail?.kind!=="ship")return;
 const s=st.shipments.find(x=>x.id===st.detail.id&&x.work_id===st.workId);if(!s)return;
 const documentExists=currentAttachments("ship",s.id).some(a=>a.kind==="cdf");
 if(!documentExists){toast("Anexe primeiro o CDF original (PDF ou imagem) selecionando o tipo CDF.",true);return}
 const no=$("cdfNumber").value.trim(),date=$("cdfDate").value;
 if(!no||!date)return;
 const button=$("cdfForm").querySelector('button[type="submit"]');button.disabled=true;
 try{
  const {error}=await client.from("rl_mov_shipments")
    .update({cdf_no:no,cdf_date:date,cdf_status:"recebido"}).eq("id",s.id).eq("work_id",st.workId);
  if(error)throw error;
  $("detailDialog").close();await loadAll();
  toast("CDF registrado e vinculado. Conferir autenticidade do certificado no órgão emissor.");
 }catch(err){toast("CDF não atualizado: "+err.message,true)}finally{button.disabled=false}
}
async function grantAccess(event){
 event.preventDefault();if(!isAdmin())return;
 const user=$("accessUser").value,can_write=$("accessPermission").value==="write";
 if(!user||!selectedWork())return;
 const button=$("accessForm").querySelector('button[type="submit"]');button.disabled=true;
 try{
  const {error}=await client.from("rl_mov_operator_access")
   .upsert({work_id:st.workId,user_id:user,can_write},{onConflict:"work_id,user_id"});
  if(error)throw error;
  await loadAll();toast("Permissão da equipe atualizada.");
 }catch(err){toast(err.message,true)}finally{button.disabled=false}
}
async function revoke(id){
 if(!isAdmin())return;
 const a=st.access.find(x=>x.id===id&&x.work_id===st.workId);if(!a)return;
 if(!confirm("Revogar o acesso à obra para este colaborador?"))return;
 const {error}=await client.from("rl_mov_operator_access").delete().eq("id",id).eq("work_id",st.workId);
 if(error)toast(error.message,true);else{await loadAll();toast("Acesso revogado.")}
}
function wire(){
 $("refresh").addEventListener("click",loadAll);
 $("workFilter").addEventListener("change",e=>{st.workId=e.target.value;render();void window.RL_MOV_DAILY?.load?.(st.workId)});
 $("printScreen").addEventListener("click",()=>window.print());
 document.querySelectorAll(".mov-tab").forEach(x=>x.addEventListener("click",()=>showTab(x.dataset.tab)));
 $("shipSearch").addEventListener("input",renderTrips);
 $("shipStatus").addEventListener("change",renderTrips);
 $("shipPlate").addEventListener("change",renderTrips);
 for(const [id,key] of [["addShipment","ship"],["addInternal","internal"],["addFuel","fuel"],["addVehicle","vehicle"],["addMaterial","material"],["addLocation","location"],["newWork","work"]])
   $(id).addEventListener("click",()=>openEntry(key));
 $("entryForm").addEventListener("submit",saveEntry);
 $("accessForm").addEventListener("submit",grantAccess);
 $("sendDoc").addEventListener("click",handleAttachment);
 $("cdfForm").addEventListener("submit",saveCdf);
 $("app").addEventListener("click",e=>{
  const open=e.target.closest("[data-open]");
  if(open){const [kind,id]=open.dataset.open.split(":");detailOf(kind,id);return}
  const file=e.target.closest("[data-file]");
  if(file){downloadDocument(file.dataset.file);return}
  const revokeBtn=e.target.closest("[data-revoke]");
  if(revokeBtn)revoke(revokeBtn.dataset.revoke);
 });
 $("detailBody").addEventListener("click",e=>{
  const file=e.target.closest("[data-file]");
  if(file)downloadDocument(file.dataset.file);
 });
 document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
}
async function start(){
 wire();
 try{const allowed=await authorize();if(allowed)await loadAll();}
 catch(err){console.error("Movimentações access:",err);showAccess(false);toast("Acesso indisponível: "+err.message,true)}
}
window.RL_MOV_CORE=Object.freeze({client,st,canWrite,isAdmin,toast,selectedWork,loadAll,showTab});
if(new URLSearchParams(location.search).get("tab")==="diarias")st.tab="diarias";
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
else start();
})();
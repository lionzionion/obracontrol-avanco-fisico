/* Diárias e Fechamentos | RL Movimentações
 * Um apontamento por caminhão/data; aprovação administrativa e
 * fechamento atômico no Supabase com fotografia de tarifas por data.
 * Diretoria: consulta; operador: apontamento; admin: tarifa, aprovação e fechamento.
 */
(() => {
"use strict";
const core=window.RL_MOV_CORE;
if(!core){console.error("RL Diárias: módulo de movimentações não disponível");return;}
const {client,st}=core;
const $=id=>document.getElementById(id);
const E=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const amount=x=>Number(x||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const format=(x,d=2)=>Number(x||0).toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d});
const round=x=>Math.round((Number(x)||0)*100)/100;
const dateLabel=x=>x?new Date(String(x).slice(0,10)+"T12:00:00").toLocaleDateString("pt-BR"):"Não informada";
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Recife",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const monthBefore=day=>{const d=new Date(day+"T12:00:00");d.setDate(d.getDate()-29);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const statuses={pendente:"Aguardando conferência",aprovado:"Aprovada",devolvido:"Devolvida",fechada:"Fechada"};
const types={inteira:"Dia inteiro",meia:"Meia diária",disposicao:"À disposição",nao_trabalhou:"Não trabalhou"};
const state={work:null,logs:[],rates:[],closures:[],lines:[],attachments:[],busy:false,editing:null,detail:null,loaded:false};
const selectedWork=()=>core.selectedWork();
const selectedVehicle=vehicle=>st.vehicles.find(x=>x.id===vehicle&&x.work_id===st.workId);
const vehicles=()=>st.vehicles.filter(x=>x.work_id===st.workId).sort((a,b)=>a.plate.localeCompare(b.plate));
const myLogs=()=>state.logs.filter(x=>x.work_id===st.workId);
const isAdmin=()=>core.isAdmin();
const canWrite=()=>core.canWrite();
const canFinancial=()=>st.profile&&["admin","diretoria"].includes(st.profile.role);
function stateLabel(log){return log.closure_id?"fechada":log.review_status}
function rateFor(vehicle,date){return state.rates.filter(r=>r.vehicle_id===vehicle&&r.work_id===st.workId&&r.valid_from<=date)
 .sort((a,b)=>b.valid_from.localeCompare(a.valid_from))[0]||null}
function factor(type,rate){
 if(type==="inteira")return 1;
 if(type==="meia")return 0.5;
 if(type==="nao_trabalhou")return 0;
 return rate?.standby_factor===null||rate?.standby_factor===undefined?null:Number(rate.standby_factor);
}
function isEditable(log){return Boolean(canWrite()&&!log.closure_id&&["pendente","devolvido"].includes(log.review_status)&&
 (isAdmin()||log.reported_by===st.profile?.id))}
function vehicleOptions(sel,preserve){
 const selected=preserve??$(sel).value;
 $(sel).innerHTML=vehicles().map(v=>'<option value="'+E(v.id)+'">'+E(v.plate)+" · "+E(v.driver_reference||"motorista não informado")+'</option>').join("");
 if(vehicles().some(v=>v.id===selected))$(sel).value=selected;
}
async function collect(table,columns,order="created_at"){
 const out=[];
 for(let first=0;first<100000;first+=500){
  const {data,error}=await client.from(table).select(columns).order(order,{ascending:false}).range(first,first+499);
  if(error)throw new Error(table+": "+error.message);
  out.push(...(data||[]));
  if(!data||data.length<500)break;
 }
 return out;
}
async function load(workId){
 if(!workId||state.busy)return;
 state.busy=true;const prev=state.work;state.work=workId;
 try{
  const [logs,rates,closures,lines,attachments]=await Promise.all([
   collect("rl_mov_daily_logs","id,work_id,vehicle_id,work_date,day_type,review_status,driver_name,field_note,review_note,reported_by,reported_at,reviewed_by,reviewed_at,closure_id,updated_at","work_date"),
   canFinancial()?collect("rl_mov_daily_rates","id,work_id,vehicle_id,valid_from,full_day_rate,standby_factor,supplier,contract_reference,notes,created_at","valid_from"):Promise.resolve([]),
   canFinancial()?collect("rl_mov_daily_closures","id,work_id,vehicle_id,start_date,end_date,status,quantity_total,subtotal,extras,discounts,total_amount,notes,approved_by,approved_at,created_at","created_at"):Promise.resolve([]),
   canFinancial()?collect("rl_mov_daily_closure_items","id,closure_id,log_id,work_id,work_date,day_type,driver_name,day_factor,applied_day_rate,amount","work_date"):Promise.resolve([]),
   collect("rl_mov_daily_attachments","id,work_id,log_id,file_name,storage_path,created_at","created_at")
  ]);
  if(state.work!==workId)return;
  Object.assign(state,{logs,rates,closures,lines,attachments,loaded:true});
  render();
 }catch(error){
  console.warn("RL Diárias:",error);
  if(state.work===workId){$("dailyCount").textContent="Falha ao carregar diárias: "+error.message;core.toast("Não foi possível carregar diárias: "+error.message,true)}
 }finally{state.busy=false}
}
function refresh(){return load(st.workId)}
function visibleLogs(){
 const from=$("dailyFrom").value,to=$("dailyTo").value,vehicle=$("dailyPlateFilter").value,
  status=$("dailyReviewFilter").value;
 return myLogs().filter(l=>
  (!from||l.work_date>=from)&&(!to||l.work_date<=to)&&
  (vehicle==="all"||l.vehicle_id===vehicle)&&(status==="all"||stateLabel(l)===status)
 ).sort((a,b)=>b.work_date.localeCompare(a.work_date)||selectedVehicle(a.vehicle_id)?.plate.localeCompare(selectedVehicle(b.vehicle_id)?.plate||"")||0);
}
function render(){
 if(!st.workId||!$("panel-diarias"))return;
 document.querySelectorAll("#panel-diarias .can-write").forEach(x=>x.hidden=!canWrite());
 document.querySelectorAll("#panel-diarias .admin-only").forEach(x=>x.hidden=!isAdmin());
 document.querySelectorAll("#panel-diarias .finance-only").forEach(x=>x.hidden=!canFinancial());
 $("dailyAccessNote").textContent=isAdmin()?"Administrador · aprovação e fechamento":
  st.profile?.role==="diretoria"?"Diretoria · consulta":canWrite()?"Engenharia de campo · lançar diária":"Somente consulta";
 const plateFilter=$("dailyPlateFilter"),old=plateFilter.value;
 plateFilter.innerHTML='<option value="all">Todos</option>'+vehicles().map(v=>'<option value="'+E(v.id)+'">'+E(v.plate)+'</option>').join("");
 plateFilter.value=vehicles().some(v=>v.id===old)?old:"all";
 const rs=visibleLogs();
 $("dailyKpiTotal").textContent=String(rs.length);
 $("dailyKpiPending").textContent=String(rs.filter(x=>["pendente","devolvido"].includes(x.review_status)&&!x.closure_id).length);
 const approved=rs.filter(x=>x.review_status==="aprovado"&&!x.closure_id);
 const qty=approved.reduce((t,x)=>t+(x.day_type==="inteira"?1:x.day_type==="meia"?.5:
   x.day_type==="disposicao"&&canFinancial()?Number(rateFor(x.vehicle_id,x.work_date)?.standby_factor??0):0),0);
 $("dailyKpiQty").textContent=canFinancial()?format(qty,2):approved.length+" apont.";
 const cls=state.closures.filter(x=>x.work_id===st.workId);
 $("dailyKpiClosed").textContent=String(cls.length);
 $("dailyRows").innerHTML=rs.length?rs.map(x=>{
  const v=selectedVehicle(x.vehicle_id),status=stateLabel(x);
  const actions='<div class="day-buttons"><button type="button" data-day-open="'+E(x.id)+'">Detalhes</button>'+
    (isEditable(x)?'<button type="button" data-day-edit="'+E(x.id)+'">Editar</button>':"")+
    (isAdmin()&&!x.closure_id&&x.review_status!=="aprovado"?'<button class="approve" type="button" data-day-approve="'+E(x.id)+'">Aprovar</button>':"")+
    (isAdmin()&&!x.closure_id&&x.review_status!=="devolvido"?'<button class="return" type="button" data-day-return="'+E(x.id)+'">Devolver</button>':"")+"</div>";
  return '<tr><td>'+E(dateLabel(x.work_date))+'</td>'+
   '<td class="day-title"><strong>'+E(v?.plate||"—")+'</strong><small>'+E(x.driver_name||v?.driver_reference||"—")+'</small></td>'+
   '<td>'+E(types[x.day_type]||x.day_type)+'</td>'+
   '<td>'+E(x.reported_by===st.profile?.id?"Você":(st.profiles.find(p=>p.id===x.reported_by)?.display_name||"Equipe"))+'</td>'+
   '<td><span class="day-state '+E(status)+'">'+E(statuses[status])+'</span></td>'+
   '<td><div class="day-short">'+E(x.field_note||"—")+'</div></td><td>'+actions+'</td></tr>';
 }).join(""):'<tr><td class="empty" colspan="7">Nenhum apontamento nesse período. Use “Lançar diária” para começar.</td></tr>';
 $("dailyCount").textContent=rs.length+" registro(s) exibidos · Diárias não são geradas automaticamente por viagens/MTR.";
 renderClosures();renderRates();
}
function renderClosures(){
 if(!canFinancial())return;
 const cls=state.closures.filter(x=>x.work_id===st.workId);
 $("dailyClosuresRows").innerHTML=cls.length?cls.map(c=>{
  const veh=selectedVehicle(c.vehicle_id),adj=Number(c.extras)-Number(c.discounts);
  return '<tr><td><strong>'+E(veh?.plate||"—")+'</strong></td><td>'+E(dateLabel(c.start_date))+' a '+E(dateLabel(c.end_date))+'</td>'+
   '<td class="right">'+format(c.quantity_total,3)+'</td><td class="right">'+amount(c.subtotal)+'</td>'+
   '<td class="right">'+(adj>=0?"+":"")+amount(adj)+'</td><td class="right"><strong>'+amount(c.total_amount)+'</strong></td>'+
   '<td><div class="day-buttons"><button type="button" data-close-open="'+E(c.id)+'">Ver / PDF</button></div></td></tr>';
 }).join(""):'<tr><td class="empty" colspan="7">Ainda não há fechamento aprovado. Configure as tarifas, aprove as diárias e selecione o período.</td></tr>';
}
function renderRates(){
 if(!canFinancial())return;
 const rs=state.rates.filter(x=>x.work_id===st.workId).sort((a,b)=>b.valid_from.localeCompare(a.valid_from));
 $("dailyRatesRows").innerHTML=rs.length?rs.map(r=>
  '<tr><td>'+E(selectedVehicle(r.vehicle_id)?.plate||"—")+'</td><td>'+E(dateLabel(r.valid_from))+'</td>'+
  '<td class="right"><strong>'+amount(r.full_day_rate)+'</strong></td>'+
  '<td>'+E(r.standby_factor===null?"Não definido":format(r.standby_factor*100,0)+"% da diária")+'</td>'+
  '<td>'+E(r.supplier||"—")+'<span class="secondary">'+E(r.contract_reference||"")+'</span></td></tr>'
 ).join(""):'<tr><td colspan="5" class="empty">Tarifas ainda não cadastradas. Os valores serão informados conforme contrato.</td></tr>';
}
function openLog(log=null){
 if(!canWrite())return;
 if(log&&!isEditable(log))return;
 if(!vehicles().length){core.toast("Cadastre primeiro o caminhão na aba Frota.",true);return}
 state.editing=log?.id||null;
 $("dailyLogHeading").textContent=log?"Corrigir apontamento":"Nova diária do caminhão";
 vehicleOptions("dailyVehicle",log?.vehicle_id);
 $("dailyVehicle").disabled=Boolean(log);
 $("dailyDate").value=log?.work_date||today();
 $("dailyDate").disabled=Boolean(log);
 $("dailyDriver").value=log?.driver_name||selectedVehicle($("dailyVehicle").value)?.driver_reference||"";
 $("dailyNote").value=log?.field_note||"";
 document.querySelectorAll('input[name="dailyType"]').forEach(inp=>inp.checked===(inp.value===(log?.day_type||"inteira")));
 $("dailyPhoto").value="";$("dailyLogError").textContent="";
 $("dailyLogDialog").showModal();
}
function typeSelected(){return document.querySelector('input[name="dailyType"]:checked')?.value||"inteira"}
function checkFile(file){
 if(!file)return;
 if(file.size>15*1024*1024)throw Error("O arquivo deve ter no máximo 15 MB.");
 if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(file.type))throw Error("Use PDF, JPG, PNG ou WebP.");
}
async function attachLog(logId,file){
 if(!canWrite())throw Error("Sem permissão para anexar.");
 checkFile(file);
 const source=state.logs.find(x=>x.id===logId&&x.work_id===st.workId);
 if(!source)throw Error("Lançamento não encontrado.");
 const safe=file.name.normalize("NFKD").replace(/[^\w.-]/g,"_").slice(-120);
 const path=st.workId+"/diarias/"+logId+"/"+crypto.randomUUID()+"-"+safe;
 const {error:uploadError}=await client.storage.from("rl-mov-documentos").upload(path,file,{upsert:false,contentType:file.type});
 if(uploadError)throw uploadError;
 const {error}=await client.from("rl_mov_daily_attachments").insert({work_id:st.workId,log_id:logId,
  file_name:file.name.slice(0,230),storage_path:path,uploaded_by:st.profile.id});
 if(error)throw Error("Arquivo enviado, mas não vinculado: "+error.message);
}
async function saveLog(event){
 event.preventDefault();
 if(!canWrite())return;
 const button=$("dailyLogSave");button.disabled=true;$("dailyLogError").textContent="";
 try{
  const id=state.editing,veh=$("dailyVehicle").value,d=$("dailyDate").value;
  if(!veh||!d)throw Error("Selecione caminhão e data.");
  const photo=$("dailyPhoto").files?.[0];checkFile(photo);
  const payload={day_type:typeSelected(),driver_name:$("dailyDriver").value.trim()||null,
   field_note:$("dailyNote").value.trim()||null};
  let logId=id;
  if(id){
    const old=state.logs.find(x=>x.id===id&&x.work_id===st.workId);
    if(!old||!isEditable(old))throw Error("Não é possível alterar diária aprovada ou fechada.");
    const {data,error}=await client.from("rl_mov_daily_logs").update({...payload,review_status:"pendente"})
     .eq("id",id).eq("work_id",st.workId).select("id").single();
    if(error)throw error;logId=data.id;
  }else{
    const {data,error}=await client.from("rl_mov_daily_logs").insert({...payload,
      work_id:st.workId,vehicle_id:veh,work_date:d,review_status:"pendente",reported_by:st.profile.id})
     .select("id").single();
    if(error)throw error;logId=data.id;
  }
  let attachWarning="";
  if(photo){try{
    // Restore log into local state for attachment guard validation.
    if(!id)state.logs.push({id:logId,work_id:st.workId,vehicle_id:veh});
    await attachLog(logId,photo);
  }catch(err){attachWarning=" Apontamento salvo, mas foto pendente: "+err.message}}
  $("dailyLogDialog").close();await refresh();
  core.toast((id?"Diária corrigida.":"Diária enviada para conferência.")+attachWarning,Boolean(attachWarning));
 }catch(error){
  $("dailyLogError").textContent=error.code==="23505"?"Já existe uma diária desse caminhão nessa data. Consulte o histórico e edite o registro existente.":error.message;
 }finally{button.disabled=false}
}
async function setReview(id,action){
 if(!isAdmin())return;
 const old=state.logs.find(x=>x.id===id&&x.work_id===st.workId);
 if(!old||old.closure_id||old.review_status===action)return;
 let note=null;
 if(action==="devolvido"){
   note=prompt("Motivo da devolução ao engenheiro de campo:");
   if(!note?.trim())return;
 }
 const msg=action==="aprovado"?"Aprovar esta diária para fechamento?":"Devolver o apontamento ao responsável?";
 if(!confirm(msg))return;
 try{
  const {data,error}=await client.from("rl_mov_daily_logs").update({
    review_status:action,review_note:action==="devolvido"?note.trim():null
  }).eq("id",old.id).eq("work_id",st.workId).is("closure_id",null).select("id").single();
  if(error)throw error;
  if(!data?.id)throw Error("Diária não encontrada para aprovação.");
  await refresh();core.toast(action==="aprovado"?"Diária aprovada.":"Diária devolvida para correção.");
 }catch(err){core.toast("Falha na revisão: "+err.message,true)}
}
async function openRate(){
 if(!isAdmin())return;
 if(!vehicles().length){core.toast("Cadastre primeiro o caminhão na Frota.",true);return}
 vehicleOptions("dailyRateVehicle");
 $("dailyRateDate").value=today();$("dailyRateValue").value="";
 $("dailyRateStandby").value="";$("dailyRateSupplier").value=selectedVehicle($("dailyRateVehicle").value)?.transport_company||"";
 $("dailyRateContract").value="";$("dailyRateNotes").value="";$("dailyRateError").textContent="";
 $("dailyRateDialog").showModal();
}
async function saveRate(event){
 event.preventDefault();if(!isAdmin())return;
 const b=$("dailyRateSave");b.disabled=true;$("dailyRateError").textContent="";
 try{
  const v=$("dailyRateVehicle").value,amt=round($("dailyRateValue").value),d=$("dailyRateDate").value;
  if(!selectedVehicle(v)||amt<=0||!d)throw Error("Informe caminhão, vigência e valor contratual.");
  const standby=$("dailyRateStandby").value;
  const record={work_id:st.workId,vehicle_id:v,valid_from:d,full_day_rate:amt,
    standby_factor:standby===""?null:Number(standby),
    supplier:$("dailyRateSupplier").value.trim()||null,
    contract_reference:$("dailyRateContract").value.trim()||null,
    notes:$("dailyRateNotes").value.trim()||null,created_by:st.profile.id};
  const {error}=await client.from("rl_mov_daily_rates").insert(record);
  if(error)throw error;
  $("dailyRateDialog").close();await refresh();core.toast("Tarifa contratual salva para o caminhão.");
 }catch(err){$("dailyRateError").textContent=err.code==="23505"?"Já existe tarifa vigente nessa data para este caminhão. Use uma nova data de vigência.":err.message}
 finally{b.disabled=false}
}
function openClosing(){
 if(!isAdmin())return;
 if(!vehicles().length){core.toast("Cadastre primeiro o caminhão.",true);return}
 vehicleOptions("dailyCloseVehicle");
 $("dailyCloseTo").value=today();$("dailyCloseFrom").value=monthBefore(today());
 $("dailyCloseExtras").value="0";$("dailyCloseDiscounts").value="0";$("dailyCloseNote").value="";
 $("dailyCloseAgree").checked=false;$("dailyCloseError").textContent="";
 previewClosing();$("dailyClosureDialog").showModal();
}
function computeClosing(vehicle,from,to){
 const result={valid:false,qty:0,subtotal:0,extras:round($("dailyCloseExtras").value),
  discounts:round($("dailyCloseDiscounts").value),items:[],errors:[]};
 if(!vehicle||!from||!to){result.errors.push("Selecione caminhão e datas.");return result}
 const diff=(new Date(to+"T12:00:00")-new Date(from+"T12:00:00"))/86400000;
 if(diff<0||diff>93){result.errors.push("O período deve ser de até 94 dias.");return result}
 const overlapping=state.closures.find(c=>c.vehicle_id===vehicle&&c.work_id===st.workId&&c.start_date<=to&&c.end_date>=from);
 if(overlapping)result.errors.push("Há fechamento anterior sobreposto a esse período.");
 const logs=myLogs().filter(x=>x.vehicle_id===vehicle&&x.work_date>=from&&x.work_date<=to)
   .sort((a,b)=>a.work_date.localeCompare(b.work_date));
 if(!logs.length)result.errors.push("Não existem diárias nesse intervalo.");
 for(const log of logs){
  if(log.review_status!=="aprovado"||log.closure_id){result.errors.push(dateLabel(log.work_date)+": diária não aprovada ou já fechada.");continue}
  const rate=rateFor(vehicle,log.work_date),f=factor(log.day_type,rate);
  if(f===null){result.errors.push(dateLabel(log.work_date)+": defina o fator de disponibilidade no contrato.");continue}
  if(f>0&&!rate){result.errors.push(dateLabel(log.work_date)+": não há tarifa contratual vigente.");continue}
  const value=round(Number(rate?.full_day_rate||0)*f);
  result.qty+=f;result.subtotal=round(result.subtotal+value);
  result.items.push({log,f,value,rate});
 }
 if(result.extras<0||result.discounts<0)result.errors.push("Ajustes não podem ser negativos.");
 if(result.subtotal+result.extras<result.discounts)result.errors.push("Descontos excedem o valor devido.");
 if((result.extras>0||result.discounts>0)&&!$("dailyCloseNote").value.trim())result.errors.push("Justifique os adicionais ou descontos.");
 result.valid=result.errors.length===0;
 return result;
}
function previewClosing(){
 if(!isAdmin())return;
 const result=computeClosing($("dailyCloseVehicle").value,$("dailyCloseFrom").value,$("dailyCloseTo").value);
 $("dailyClosePreview").innerHTML=
  '<div><b>Diárias analisadas:</b> '+result.items.length+'</div>'+
  '<div><b>Quantidade equivalente:</b> '+format(result.qty,3)+' diária(s)</div>'+
  '<div><b>Subtotal:</b> '+amount(result.subtotal)+'</div>'+
  '<div><b>Adicionais:</b> '+amount(result.extras)+' · <b>Descontos:</b> '+amount(result.discounts)+'</div>'+
  '<div><strong>Total previsto: '+amount(round(result.subtotal+result.extras-result.discounts))+'</strong></div>'+
  result.errors.map(x=>'<p class="warning-line">'+E(x)+'</p>').join("")+
  (!result.errors.length?'<p class="form-hint">O banco confirmará novamente a elegibilidade e os valores ao fechar.</p>':"");
 $("dailyCloseSave").disabled=!result.valid||!$("dailyCloseAgree").checked;
}
async function saveClosing(event){
 event.preventDefault();if(!isAdmin())return;
 const vehicle=$("dailyCloseVehicle").value,from=$("dailyCloseFrom").value,to=$("dailyCloseTo").value;
 const pre=computeClosing(vehicle,from,to);if(!pre.valid||!$("dailyCloseAgree").checked){$("dailyCloseError").textContent="Resolva as pendências e marque a conferência.";return}
 const b=$("dailyCloseSave");b.disabled=true;$("dailyCloseError").textContent="";
 try{
  const extras=round($("dailyCloseExtras").value),discounts=round($("dailyCloseDiscounts").value);
  const {data,error}=await client.rpc("rl_mov_close_daily_period",{
    p_work_id:st.workId,p_vehicle_id:vehicle,p_start:from,p_end:to,
    p_extras:extras,p_discounts:discounts,p_notes:$("dailyCloseNote").value.trim()||null
  });
  if(error)throw error;
  $("dailyClosureDialog").close();await refresh();
  core.toast("Fechamento aprovado e registrado: "+amount(pre.subtotal+extras-discounts));
  if(data)showClosure(data);
 }catch(err){$("dailyCloseError").textContent=err.message;core.toast("Não foi possível fechar: "+err.message,true)}
 finally{b.disabled=false}
}
function detailKey(label,value){return '<div class="detail-value"><span>'+E(label)+'</span><strong>'+E(value??"—")+'</strong></div>'}
function showLog(id){
 const log=state.logs.find(x=>x.id===id&&x.work_id===st.workId);if(!log)return;
 const v=selectedVehicle(log.vehicle_id),status=stateLabel(log);
 state.detail={kind:"log",id};
 $("dailyDetailsTitle").textContent="Diária "+dateLabel(log.work_date)+" · "+(v?.plate||"");
 $("dailyDetailsBody").innerHTML='<p><span class="day-state '+E(status)+'">'+E(statuses[status])+'</span></p>'+
  '<div class="detail-grid">'+detailKey("Caminhão",v?.plate)+detailKey("Motorista",log.driver_name||v?.driver_reference)+
  detailKey("Data",dateLabel(log.work_date))+detailKey("Tipo",types[log.day_type])+
  detailKey("Situação",statuses[status])+detailKey("Fechamento",log.closure_id?"Incluída":"Ainda não encerrada")+'</div>'+
  '<div class="detail-section"><h3>Apontamento de campo</h3><p class="daily-note">'+E(log.field_note||"Sem observações")+'</p></div>'+
  (log.review_note?'<div class="detail-section"><h3>Devolução / conferência</h3><p class="warning-line">'+E(log.review_note)+'</p></div>':"")+
  '<div class="detail-section"><h3>Documentos</h3><div id="dayAttachmentsList"></div></div>';
 const actions=$("dailyDetailsActions");
 actions.innerHTML="";
 if(isEditable(log))actions.innerHTML+='<button type="button" class="button ghost" id="dayDetailEdit">Corrigir apontamento</button>';
 if(isAdmin()&&!log.closure_id&&log.review_status!=="aprovado")
  actions.innerHTML+='<button type="button" class="button primary" id="dayDetailApprove">Aprovar diária</button>';
 if(canWrite())actions.innerHTML+='<label class="day-upload button ghost">+ Anexar foto/PDF<input type="file" id="dayDetailFile" accept="image/jpeg,image/png,image/webp,application/pdf" hidden></label>';
 $("dailyDetailsDialog").showModal();
 renderLogAttachments(id);
 $("dayDetailEdit")?.addEventListener("click",()=>{$("dailyDetailsDialog").close();openLog(log)});
 $("dayDetailApprove")?.addEventListener("click",async()=>{await setReview(id,"aprovado");$("dailyDetailsDialog").close()});
 $("dayDetailFile")?.addEventListener("change",async event=>{
   const file=event.target.files?.[0];if(!file)return;
   try{await attachLog(id,file);await refresh();renderLogAttachments(id);core.toast("Arquivo da diária vinculado com sucesso.")}
   catch(err){core.toast("Não foi possível anexar: "+err.message,true)}
   finally{event.target.value=""}
 });
}
function renderLogAttachments(id){
 const list=$("dayAttachmentsList");
 if(!list)return;
 const docs=state.attachments.filter(x=>x.work_id===st.workId&&x.log_id===id);
 list.innerHTML=docs.length?docs.map(x=>
  '<div class="mini-item"><span>'+E(x.file_name)+' · '+E(dateLabel(x.created_at))+
  '</span><button type="button" class="link-button" data-day-file="'+E(x.id)+'">Baixar</button></div>').join("")
  :'<p class="daily-note">Nenhum documento anexado.</p>';
}
async function downloadAttachment(id){
 const doc=state.attachments.find(x=>x.id===id&&x.work_id===st.workId);
 if(!doc)return;
 const {data,error}=await client.storage.from("rl-mov-documentos").download(doc.storage_path);
 if(error){core.toast(error.message,true);return}
 const url=URL.createObjectURL(data),a=document.createElement("a");
 a.href=url;a.download=doc.file_name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),8000);
}
function showClosure(id){
 if(!canFinancial())return;
 const c=state.closures.find(x=>x.id===id&&x.work_id===st.workId);
 if(!c)return;
 state.detail={kind:"closure",id};
 const vehicle=selectedVehicle(c.vehicle_id);
 const lines=state.lines.filter(x=>x.closure_id===c.id).sort((a,b)=>a.work_date.localeCompare(b.work_date));
 $("dailyDetailsTitle").textContent="Fechamento "+(vehicle?.plate||"")+" · "+dateLabel(c.end_date);
 $("dailyDetailsBody").innerHTML=
  '<div class="daily-detail-kpis"><div><span>Diárias equivalentes</span><b>'+format(c.quantity_total,3)+'</b></div>'+
   '<div><span>Subtotal contratual</span><b>'+amount(c.subtotal)+'</b></div>'+
   '<div><span>Valor do fechamento</span><b>'+amount(c.total_amount)+'</b></div></div>'+
  '<div class="detail-grid">'+detailKey("Placa",vehicle?.plate)+
   detailKey("Transportadora",vehicle?.transport_company)+
   detailKey("Período",dateLabel(c.start_date)+" a "+dateLabel(c.end_date))+
   detailKey("Adicionais",amount(c.extras))+detailKey("Descontos",amount(c.discounts))+
   detailKey("Aprovado em",dateLabel(c.approved_at))+'</div>'+
  '<div class="detail-section"><h3>Composição do fechamento</h3>'+
   '<div class="table-wrap"><table><thead><tr><th>Data</th><th>Serviço</th><th class="right">Fator</th><th class="right">Diária vigente</th><th class="right">Total</th></tr></thead><tbody>'+
   lines.map(x=>'<tr><td>'+E(dateLabel(x.work_date))+'</td><td>'+E(types[x.day_type]||x.day_type)+'</td>'+
    '<td class="right">'+format(x.day_factor,3)+'</td>'+
    '<td class="right">'+(x.applied_day_rate==null?"—":amount(x.applied_day_rate))+'</td>'+
    '<td class="right">'+amount(x.amount)+'</td></tr>').join("")+'</tbody></table></div></div>'+
  '<div class="detail-section"><h3>Observações</h3><p class="daily-note">'+E(c.notes||"Sem ajustes ou observações")+
  '</p><p class="form-hint">Aprovação de fechamento não significa pagamento. Não cria despesa duplicada no RL Custos.</p></div>';
 $("dailyDetailsActions").innerHTML='<button type="button" class="button primary" id="dayPrintBtn">Imprimir / PDF da RL</button>';
 $("dailyDetailsDialog").showModal();
 $("dayPrintBtn").addEventListener("click",()=>printClosing(c,vehicle,lines));
}
function printClosing(c,vehicle,lines){
 if(!canFinancial())return;
 const work=selectedWork();
 const tbody=lines.map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+E(dateLabel(x.work_date))+'</td>'+
  '<td>'+E(types[x.day_type]||x.day_type)+'</td><td>'+E(x.driver_name||vehicle?.driver_reference||"—")+'</td>'+
  '<td>'+format(x.day_factor,3)+'</td><td>'+ (x.applied_day_rate===null?"—":amount(x.applied_day_rate))+
  '</td><td>'+amount(x.amount)+'</td></tr>').join("");
 $("dailyPrintRoot").innerHTML=
  '<div class="print-head"><img src="../../assets/rl-logo.svg" alt="RL Engenharia"><div><p>RL ENGENHARIA · FAZENDO ACONTECER</p>'+
  '<h1>FECHAMENTO DE DIÁRIAS DE CAMINHÃO</h1><p>Controle de transporte · Registro operacional aprovado</p></div></div>'+
  '<div class="print-grid"><p>OBRA<b>'+E(work?.name||"—")+'</b></p>'+
  '<p>PLACA<b>'+E(vehicle?.plate||"—")+'</b></p>'+
  '<p>TRANSPORTADORA<b>'+E(vehicle?.transport_company||"Não informada")+'</b></p>'+
  '<p>PERÍODO<b>'+E(dateLabel(c.start_date))+' a '+E(dateLabel(c.end_date))+'</b></p>'+
  '<p>MOTORISTA DE REFERÊNCIA<b>'+E(vehicle?.driver_reference||"Não informado")+'</b></p>'+
  '<p>DIÁRIAS EQUIVALENTES<b>'+format(c.quantity_total,3)+'</b></p></div>'+
  '<h2>Memória de cálculo</h2><table><thead><tr><th>Nº</th><th>Data</th><th>Tipo</th><th>Motorista</th>'+
  '<th>Fator</th><th>Tarifa</th><th>Valor</th></tr></thead><tbody>'+tbody+'</tbody></table>'+
  '<div class="print-grid"><p>SUBTOTAL<b>'+amount(c.subtotal)+'</b></p>'+
  '<p>ADICIONAIS<b>'+amount(c.extras)+'</b></p><p>DESCONTOS<b>'+amount(c.discounts)+'</b></p></div>'+
  '<div class="print-total">TOTAL DO FECHAMENTO: '+amount(c.total_amount)+'</div>'+
  (c.notes?'<p class="print-note">Observações: '+E(c.notes)+'</p>':"")+
  '<p class="print-note">Aprovado no sistema em '+E(dateLabel(c.approved_at))+
  '. Identificador '+E(c.id)+'. Documento de fechamento de diárias; não constitui comprovante de pagamento.</p>'+
  '<div class="print-foot"><div class="print-sign">Elaborado / Conferido pela Engenharia</div>'+
  '<div class="print-sign">Aprovação da Administração / RL Engenharia</div></div>';
 $("dailyPrintRoot").hidden=false;document.body.classList.add("daily-print-mode");
 window.print();
}
function afterPrint(){document.body.classList.remove("daily-print-mode");$("dailyPrintRoot").hidden=true}
function bind(){
 const end=today();
 $("dailyFrom").value=monthBefore(end);$("dailyTo").value=end;
 ["dailyFrom","dailyTo","dailyPlateFilter","dailyReviewFilter"].forEach(id=>$(id).addEventListener("change",render));
 $("dailyFilterReset").addEventListener("click",()=>{
  const now=today();$("dailyFrom").value=monthBefore(now);$("dailyTo").value=now;
  $("dailyPlateFilter").value="all";$("dailyReviewFilter").value="all";render()
 });
 $("dailyAdd").addEventListener("click",()=>openLog());
 $("dailyNewRate").addEventListener("click",openRate);
 $("dailyNewClosure").addEventListener("click",openClosing);
 $("dailyVehicle").addEventListener("change",()=>{
  $("dailyDriver").value=selectedVehicle($("dailyVehicle").value)?.driver_reference||"";
 });
 $("dailyRateVehicle").addEventListener("change",()=>{
  $("dailyRateSupplier").value=selectedVehicle($("dailyRateVehicle").value)?.transport_company||"";
 });
 $("dailyLogForm").addEventListener("submit",saveLog);
 $("dailyRateForm").addEventListener("submit",saveRate);
 $("dailyClosureForm").addEventListener("submit",saveClosing);
 ["dailyCloseVehicle","dailyCloseFrom","dailyCloseTo","dailyCloseExtras","dailyCloseDiscounts","dailyCloseNote","dailyCloseAgree"]
 .forEach(id=>$(id).addEventListener("input",previewClosing));
 $("panel-diarias").addEventListener("click",event=>{
  const button=event.target.closest("button");if(!button)return;
  if(button.dataset.dayOpen)showLog(button.dataset.dayOpen);
  else if(button.dataset.dayEdit)openLog(state.logs.find(x=>x.id===button.dataset.dayEdit));
  else if(button.dataset.dayApprove)void setReview(button.dataset.dayApprove,"aprovado");
  else if(button.dataset.dayReturn)void setReview(button.dataset.dayReturn,"devolvido");
  else if(button.dataset.closeOpen)showClosure(button.dataset.closeOpen);
 });
 $("dailyDetailsBody").addEventListener("click",event=>{
  const id=event.target.closest("[data-day-file]")?.dataset.dayFile;
  if(id)void downloadAttachment(id);
 });
 document.querySelectorAll('[data-close="dailyLogDialog"],[data-close="dailyRateDialog"],[data-close="dailyClosureDialog"],[data-close="dailyDetailsDialog"]')
 .forEach(button=>button.addEventListener("click",()=>$(button.dataset.close).close()));
 window.addEventListener("afterprint",afterPrint);
}
window.RL_MOV_DAILY=Object.freeze({load,render});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});
else bind();
})();
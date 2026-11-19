/* RL Custos | Contas a pagar, relatórios e fila de comprovantes.
   Usa a mesma sessão, políticas RLS e bucket privado do módulo financeiro. */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&#39;"}[c]));
const money=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const numeric=v=>Math.round((Number(v)||0)*100)/100;
const fmtDate=d=>d?new Date(String(d).slice(0,10)+"T12:00:00").toLocaleDateString("pt-BR"):"Não informada";
const today=()=>new Date().toLocaleDateString("sv-SE",{timeZone:"America/Recife"});
const dayDiff=(a,b)=>Math.round((Date.parse(a+"T12:00:00Z")-Date.parse(b+"T12:00:00Z"))/86400000);
const requestedTab=new URLSearchParams(window.location.search).get("aba");
const state={tab:requestedTab==="comprovantes"?"attachments":requestedTab==="pagar"?"payables":"payables",uploadExpenseId:null,rows:[]};
function api(){return window.RL_CUSTOS_API;}
function err(message){const label=$("financeStatusMessage");if(label){label.textContent=message;label.hidden=!message;}}
function currentData(){
 const access=api(),s=access?.snapshot();
 if(!s)return {rows:[],payments:[],missing:[],work:null,canEdit:false};
 const work=s.works.find(w=>w.id===s.workId);
 const payments=s.payments.filter(p=>s.expenses.some(e=>e.id===p.expense_id&&e.work_id===s.workId));
 const rows=s.expenses.filter(e=>e.work_id===s.workId).map(e=>{
   const paid=numeric(payments.filter(p=>p.expense_id===e.id).reduce((n,p)=>n+Number(p.amount||0),0));
   const amount=numeric(e.amount),balance=e.status==="realizada"?numeric(Math.max(0,amount-paid)):0;
   const hasAttachment=s.attachments.some(a=>a.expense_id===e.id);
   const days=e.due_date?dayDiff(e.due_date,today()):null;
   let situation=e.status!=="realizada"?e.status:balance<=0?"Quitada":days!==null&&days<0?"Vencida":paid>0?"Parcial":"Em aberto";
   return {...e,paid,balance,hasAttachment,days,situation};
 });
 return {rows,payments,missing:rows.filter(e=>!e.hasAttachment),work,canEdit:access.canEdit()};
}
function filters(rows,dateSelector){
 const search=$("financeSearch").value.trim().toLocaleLowerCase("pt-BR");
 const from=$("financeFrom").value,to=$("financeTo").value;
 const filter=$("financeSituation").value;
 return rows.filter(x=>{
   const d=dateSelector(x);
   if(search&&![x.supplier,x.description,x.document_no,x.category].some(v=>String(v||"").toLocaleLowerCase("pt-BR").includes(search)))return false;
   if(from&&(!d||d<from))return false;
   if(to&&(!d||d>to))return false;
   if(filter==="open"&&!(x.balance>0))return false;
   if(filter==="paid"&&!(x.status==="realizada"&&x.balance<=0))return false;
   if(filter==="overdue"&&!(x.balance>0&&x.days!==null&&x.days<0))return false;
   if(filter==="week"&&!(x.balance>0&&x.days!==null&&x.days>=0&&x.days<=7))return false;
   return true;
 });
}
function summary(data){
 const realized=data.rows.filter(x=>x.status==="realizada");
 const open=realized.filter(x=>x.balance>0);
 const overdue=open.filter(x=>x.days!==null&&x.days<0);
 const soon=open.filter(x=>x.days!==null&&x.days>=0&&x.days<=7);
 const sums=[open.reduce((n,x)=>n+x.balance,0),overdue.reduce((n,x)=>n+x.balance,0),soon.reduce((n,x)=>n+x.balance,0)];
 ["financeOpen","financeOverdue","financeSoon"].forEach((id,i)=>$(id).textContent=money(sums[i]));
 $("financeMissing").textContent=String(data.missing.length);
 $("financeWorkName").textContent=data.work?.name||"Selecione uma obra";
 $("financePrintDate").textContent="Emissão: "+new Date().toLocaleString("pt-BR",{timeZone:"America/Recife"});
}
function cell(v){return "<td>"+escapeHtml(v)+"</td>";}
function cash(v){return '<td class="right">'+escapeHtml(money(v))+"</td>";}
function action(id,label="Detalhes"){return '<button class="table-view" type="button" data-finance-open="'+escapeHtml(id)+'">'+escapeHtml(label)+"</button>";}
function dueBadge(row){
 if(row.balance<=0)return '<span class="badge paid">Quitada</span>';
 if(row.days===null)return '<span class="badge pending">Sem vencimento</span>';
 if(row.days<0)return '<span class="badge overdue">Vencida</span>';
 if(row.days<=7)return '<span class="badge partial">Próxima</span>';
 return '<span class="badge pending">Em aberto</span>';
}
function table(headers,body,empty){
 return '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th'+(h.right?' class="right"':'')+'>'+escapeHtml(h.label||h)+'</th>').join("")+'</tr></thead><tbody>'+(
   body.length?body.join(""):'<tr><td colspan="'+headers.length+'" class="empty">'+escapeHtml(empty)+'</td></tr>'
 )+'</tbody></table></div>';
}
function render(){
 const access=api();if(!access?.snapshot())return;
 const data=currentData();summary(data);
 document.querySelectorAll("[data-finance-tab]").forEach(b=>{b.classList.toggle("selected",b.dataset.financeTab===state.tab);b.setAttribute("aria-pressed",String(b.dataset.financeTab===state.tab));});
 const openRows=data.rows.filter(x=>x.status==="realizada"&&(x.balance>0||$("financeSituation").value==="paid"));
 const allRealized=data.rows.filter(x=>x.status==="realizada");
 const selected=state.tab==="payables"?filters(openRows,x=>x.due_date)
   :state.tab==="expenses"?filters(data.rows,x=>x.issue_date)
   :state.tab==="attachments"?filters(data.missing,x=>x.issue_date)
   :[];
 const headers=[],output=[];
 if(state.tab==="payables"){
   headers.push("Fornecedor / compromisso","Vencimento",{label:"Valor",right:true},{label:"Pago",right:true},{label:"Saldo",right:true},"Situação","Ação");
   selected.sort((a,b)=>String(a.due_date||"9999").localeCompare(String(b.due_date||"9999"))||b.balance-a.balance);
   selected.forEach(x=>output.push('<tr>'+cell(x.supplier+' — '+x.description)+cell(fmtDate(x.due_date))+cash(x.amount)+cash(x.paid)+cash(x.balance)+cell("").replace("<td></td>","<td>"+dueBadge(x)+"</td>")+
     '<td class="finance-commands">'+action(x.id)+(data.canEdit?'<button class="table-view" type="button" data-finance-due="'+escapeHtml(x.id)+'">Vencimento</button>':"")+"</td></tr>"));
   $("financeTableCaption").textContent=selected.length+" compromissos exibidos · Saldo filtrado: "+money(selected.reduce((n,x)=>n+x.balance,0))+". Compromissos autorizados ainda não executados não entram aqui.";
 }else if(state.tab==="expenses"){
   headers.push("Fornecedor","Categoria","Documento","Data",{label:"Líquido",right:true},{label:"Pago",right:true},"Estado","Ação");
   selected.sort((a,b)=>String(b.issue_date||"").localeCompare(String(a.issue_date||"")));
   selected.forEach(x=>output.push('<tr>'+cell(x.supplier)+cell(x.category)+cell(x.document_no||"—")+cell(fmtDate(x.issue_date))+cash(x.amount)+cash(x.paid)+cell(x.situation)+cell(action(x.id))+"</tr>"));
   $("financeTableCaption").textContent=selected.length+" lançamentos exibidos · Total de despesas realizadas: "+money(selected.filter(x=>x.status==="realizada").reduce((n,x)=>n+x.amount,0))+". Cotações e compras autorizadas são mostradas separadamente, sem compor o custo realizado.";
 }else if(state.tab==="payments"){
   headers.push("Fornecedor","Data pagamento","Forma",{label:"Valor pago",right:true},"Origem","Ação");
   const joined=data.payments.map(p=>{
     const expense=data.rows.find(x=>x.id===p.expense_id);
     return {p,expense};
   }).filter(x=>x.expense&&filters([x.expense],()=>x.p.payment_date).length);
   joined.sort((a,b)=>String(b.p.payment_date||"").localeCompare(String(a.p.payment_date||"")));
   joined.forEach(({p,expense})=>output.push("<tr>"+cell(expense.supplier)+cell(fmtDate(p.payment_date))+cell(p.payment_method||"—")+cash(p.amount)+cell(p.confirmation_source)+cell(action(expense.id))+"</tr>"));
   $("financeTableCaption").textContent=joined.length+" pagamentos · Total: "+money(joined.reduce((n,x)=>n+Number(x.p.amount||0),0))+". Pagamentos sem data efetiva ficam fora de filtros por período.";
 }else if(state.tab==="attachments"){
   headers.push("Fornecedor","Documento","Data",{label:"Valor",right:true},"Arquivo","Ação");
   selected.sort((a,b)=>String(b.issue_date||"").localeCompare(String(a.issue_date||"")));
   selected.forEach(x=>output.push("<tr>"+cell(x.supplier)+cell(x.document_no||"Não informado")+cell(fmtDate(x.issue_date))+cash(x.amount)+cell(x.source_document_name||"Comprovante pendente")+'<td class="finance-commands">'+action(x.id)+(data.canEdit?'<button type="button" class="table-view" data-finance-upload="'+escapeHtml(x.id)+'">Anexar arquivo</button>':"")+"</td></tr>"));
   $("financeTableCaption").textContent=selected.length+" lançamentos sem documento privado. O recibo não estará arquivado até o upload ser concluído e conferido.";
 }
 const tableHtml=table(headers,output,"Nenhum registro corresponde a este filtro.");
 $("financeTable").innerHTML=tableHtml;
 state.rows=selected;
 const upload=document.querySelectorAll("[data-finance-upload]");
 upload.forEach(b=>b.disabled=!data.canEdit);
 const note=$("financeHelp");
 note.textContent=state.tab==="attachments"?"Envie as imagens originais do seu dispositivo; o arquivo não será publicado no GitHub.":"Filtros e totais restritos à obra selecionada no topo da página.";
}
function toExport(){
 const data=currentData(),head=["Relatório","Obra","Fornecedor","Documento","Data documento","Vencimento","Valor líquido","Valor pago","Saldo a pagar","Situação"],out=[];
 const scope=state.tab==="payables"?filters(data.rows.filter(x=>x.status==="realizada"&&(x.balance>0||$("financeSituation").value==="paid")),x=>x.due_date)
  :filters(state.tab==="attachments"?data.missing:data.rows,x=>x.issue_date);
 if(state.tab==="payments"){
   const phead=["Relatório","Obra","Fornecedor","Data pagamento","Forma","Valor pago","Origem"];
   const payments=data.payments.filter(p=>{const exp=data.rows.find(x=>x.id===p.expense_id);return exp&&filters([exp],()=>p.payment_date).length;});
   payments.forEach(p=>{const exp=data.rows.find(x=>x.id===p.expense_id);out.push(["Pagamentos",data.work?.name,exp.supplier,p.payment_date||"",p.payment_method||"",p.amount,p.confirmation_source]);});
   return {head:phead,rows:out};
 }
 scope.forEach(x=>out.push([state.tab==="payables"?"Contas a pagar":state.tab==="attachments"?"Comprovantes pendentes":"Despesas",data.work?.name,x.supplier,x.document_no||"",x.issue_date||"",x.due_date||"",x.amount,x.paid,x.balance,x.situation]));
 return {head,rows:out};
}
function csvCell(value){
 const raw=String(value??"");
 const safe=/^[\s]*[=+@\-]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replace(/"/g,'""')+'"';
}
function exportCsv(){
 const {head,rows}=toExport();
 const content="\uFEFF"+[head,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");
 const blob=new Blob([content],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob),link=document.createElement("a");
 link.href=url;link.download="RL_Custos_"+state.tab+"_"+today()+".csv";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function openDue(id){
 const d=currentData().rows.find(x=>x.id===id);if(!d||!api()?.canEdit())return;
 $("financeDueExpense").value=id;$("financeDueTitle").textContent="Vencimento — "+d.supplier;
 $("financeDueInput").value=d.due_date||"";$("financeDueError").textContent="";
 $("financeDueDialog").showModal();
}
async function saveDue(event){
 event.preventDefault();const id=$("financeDueExpense").value,val=$("financeDueInput").value;
 if(!api()?.canEdit())return;
 $("financeDueSave").disabled=true;$("financeDueError").textContent="";
 try{await api().saveDueDate(id,val||null);$("financeDueDialog").close();await api().reload();render();}
 catch(e){$("financeDueError").textContent="Falha ao salvar vencimento: "+e.message}
 finally{$("financeDueSave").disabled=false}
}
async function attach(event){
 const file=event.target.files?.[0],id=state.uploadExpenseId;
 event.target.value="";if(!file||!id)return;
 const button=$("financeAttachmentInput");
 button.disabled=true;err("Enviando e conferindo arquivo privado...");
 try{
   await api().uploadDocument(id,file,$("financeAttachmentKind").value);
   await api().reload();err("");render();
   const toast=$("toast");if(toast){toast.textContent="Comprovante enviado e associado ao lançamento.";toast.hidden=false;setTimeout(()=>toast.hidden=true,5500);}
 }catch(e){err("Upload não concluído: "+e.message)}
 finally{button.disabled=false;state.uploadExpenseId=null}
}
async function attachBatch(event){
 const files=Array.from(event.target.files||[]);
 event.target.value="";
 if(!files.length||!api()?.canEdit())return;
 $("financeBatchUpload").disabled=true;
 const docs=currentData().rows;
 let uploaded=0;const problems=[];
 for(const file of files){
   const id=file.name.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase();
   const expense=docs.find(x=>x.id.toLowerCase()===id);
   if(!expense){problems.push(file.name+": identificador de lançamento ausente ou de outra obra");continue;}
   err("Enviando "+(uploaded+1)+" / "+files.length+": "+file.name);
   try{await api().uploadDocument(expense.id,file,"comprovante");uploaded++;}
   catch(e){problems.push(file.name+": "+e.message);}
 }
 await api().reload();
 $("financeBatchUpload").disabled=false;render();
 err(uploaded+" de "+files.length+" arquivos enviados e conferidos."+(problems.length?" Pendências: "+problems.join(" | "):""));
}
function wire(){
 $("financeReportTabs").addEventListener("click",e=>{const b=e.target.closest("[data-finance-tab]");if(!b)return;state.tab=b.dataset.financeTab;render();});
 ["financeFrom","financeTo","financeSituation","financeSearch"].forEach(id=>$(id).addEventListener(id==="financeSearch"?"input":"change",render));
 $("financeExport").addEventListener("click",exportCsv);
 $("financePrint").addEventListener("click",()=>{document.body.classList.add("finance-printing");window.print()});
 window.addEventListener("afterprint",()=>document.body.classList.remove("finance-printing"));
 $("financeTable").addEventListener("click",e=>{
   const b=e.target.closest("button");if(!b)return;
   if(b.dataset.financeOpen)api()?.openExpense(b.dataset.financeOpen);
   if(b.dataset.financeDue)openDue(b.dataset.financeDue);
   if(b.dataset.financeUpload&&api()?.canEdit()){state.uploadExpenseId=b.dataset.financeUpload;$("financeAttachmentInput").click();}
 });
 $("financeAttachmentInput").addEventListener("change",attach);
 $("financeBatchUpload").addEventListener("click",()=>$("financeBatchInput").click());
 $("financeBatchInput").addEventListener("change",attachBatch);
 $("financeDueForm").addEventListener("submit",saveDue);
 $("financeDueCancel").addEventListener("click",()=>$("financeDueDialog").close());
 $("financeDueClose").addEventListener("click",()=>$("financeDueDialog").close());
 window.addEventListener("rl-custos-updated",render);
}
function start(){if($("financeReports"))wire();}
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();

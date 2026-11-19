/* RL Custos de Obras | Aplicativo financeiro da Central RL
   Banco isolado: rl_cost_*. Autorização real pelas políticas RLS do Supabase.
   Receita contratual não é orçamento de custos. Não inventar data de pagamento. */
(() => {
"use strict";
const PROJECT_URL="https://dpmofhdaefcqxohuhkfr.supabase.co";
const PUBLISHABLE_KEY="sb_publishable_JerHh05UE8RcnXJ91Ypuyg_IWdiAhh5";
const $=id=>document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const round2=n=>Math.round((Number(n)||0)*100)/100;
const fmt=n=>Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const date=value=>value?new Date(String(value).slice(0,10)+"T12:00:00").toLocaleDateString("pt-BR"):"Não informada";
const num=value=>Number(value||0);
const statuses={cotacao:"Cotação",autorizada:"Compra autorizada",realizada:"Despesa realizada",cancelada:"Cancelada"};
const client=window.supabase?.createClient(PROJECT_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const state={profile:null,works:[],expenses:[],payments:[],lines:[],attachments:[],workId:null,detailId:null,loading:false};
let toastTimeout;

function toast(text,isError=false){
 const el=$("toast");el.textContent=text;el.hidden=false;el.classList.toggle("error",isError);
 clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.hidden=true,6500);
}
function btnBusy(el,busy){if(el)el.disabled=!!busy}
function statusChip(status){
 return '<span class="badge '+esc(status)+'">'+esc(statuses[status]||status)+'</span>';
}
function paymentTotal(id){return round2(state.payments.filter(p=>p.expense_id===id).reduce((acc,p)=>acc+num(p.amount),0))}
function paidStatus(expense){
 const paid=paymentTotal(expense.id);
 if(expense.status!=="realizada")return "";
 if(paid>=num(expense.amount)-.001)return '<span class="badge paid">Pago integralmente</span>';
 if(paid>0)return '<span class="badge partial">Pagamento parcial</span>';
 return '<span class="badge pending">A pagar</span>';
}
function selectedWork(){return state.works.find(w=>w.id===state.workId)}
function selectedExpenses(){return state.expenses.filter(e=>e.work_id===state.workId)}
function canEdit(){return state.profile?.role==="admin"}
function setAccess(granted){
 $("application").hidden=!granted;
 $("authScreen").hidden=granted;
 document.querySelectorAll(".admin-only").forEach(el=>el.hidden=!canEdit());
 $("connectionStatus").textContent=granted?(canEdit()?"● Admin · nuvem":"● Diretoria · consulta"):"● Acesso protegido";
 $("connectionStatus").className="status "+(granted?"good":"bad");
}
async function authorize(){
 if(!client)throw Error("Biblioteca de autenticação não disponível.");
 const {data:identity,error:userError}=await client.auth.getUser();
 if(userError||!identity?.user){setAccess(false);return false}
 const {data,error}=await client.from("profiles").select("id,display_name,role,active").eq("id",identity.user.id).maybeSingle();
 if(error||!data||!data.active||!["admin","diretoria"].includes(data.role)){setAccess(false);return false}
 state.profile=data;setAccess(true);return true;
}
async function fetchAll(table,fields,sort){
 const result=[];
 for(let start=0;start<100000;start+=500){
   const {data,error}=await client.from(table).select(fields).order(sort,{ascending:false}).range(start,start+499);
   if(error)throw error;
   result.push(...(data||[]));
   if(!data||data.length<500)break;
 }
 return result;
}
async function loadAll(silent=false){
 if(state.loading)return;
 state.loading=true;btnBusy($("refresh"),true);
 try{
   if(!silent)$("recordCount").textContent="Atualizando documentos da obra…";
   const [works,expenses,payments,lines,attachments]=await Promise.all([
     fetchAll("rl_cost_works","id,slug,name,client,municipality,state_code,contract_amount,target_cost,target_status,notes,active,created_at","created_at"),
     fetchAll("rl_cost_expenses","id,work_id,supplier,supplier_tax_id,document_no,document_kind,issue_date,category,description,status,gross_amount,discount_amount,freight_amount,amount,notes,source_document_name,created_at","created_at"),
     fetchAll("rl_cost_payments","id,expense_id,amount,payment_date,payment_method,confirmation_source,confirmation_note,recorded_at","recorded_at"),
     fetchAll("rl_cost_expense_lines","id,expense_id,line_no,product_code,description,unit,qty,unit_price,line_total","line_no"),
     fetchAll("rl_cost_attachments","id,expense_id,storage_path,file_name,document_type,created_at","created_at")
   ]);
   Object.assign(state,{works,expenses,payments,lines,attachments});
   if(!works.some(w=>w.id===state.workId))state.workId=works[0]?.id||null;
   render();
 }catch(error){console.error("Custos:",error);toast("Falha ao carregar dados financeiros: "+error.message,true);$("recordCount").textContent="Não foi possível consultar os dados";}finally{state.loading=false;btnBusy($("refresh"),false)}
}
function render(){
 const select=$("workFilter");
 const last=state.workId;
 select.innerHTML=state.works.map(w=>'<option value="'+esc(w.id)+'">'+esc(w.name)+'</option>').join("");
 select.value=last;
 const w=selectedWork();
 $("workLocation").textContent=w?[w.municipality,w.state_code].filter(Boolean).join(" / "):"Cadastre sua primeira obra";
 $("workBudgetStatus").textContent=w?.target_status==="aprovado"?"Meta de custo aprovada":w?.target_status==="provisorio"?"Meta de custo provisória":"Orçamento interno de custos pendente";
 renderMetrics();
 renderExpenseList();
}
function renderMetrics(){
 const work=selectedWork(),exps=selectedExpenses();
 const realized=exps.filter(e=>e.status==="realizada");
 const authorized=exps.filter(e=>e.status==="autorizada");
 const quotes=exps.filter(e=>e.status==="cotacao");
 const spent=round2(realized.reduce((sum,e)=>sum+num(e.amount),0));
 const paid=round2(realized.reduce((sum,e)=>sum+paymentTotal(e.id),0));
 const committed=round2(authorized.reduce((sum,e)=>sum+num(e.amount),0));
 const quoteValue=round2(quotes.reduce((sum,e)=>sum+num(e.amount),0));
 const due=Math.max(0,round2(spent-paid));
 $("contractValue").textContent=work?.contract_amount!=null?fmt(work.contract_amount):"Não informado";
 $("realizedValue").textContent=fmt(spent);
 $("paidValue").textContent=fmt(paid);
 $("payableValue").textContent=fmt(due);
 $("summaryPaid").textContent=fmt(paid);
 $("summaryApproved").textContent=fmt(committed);
 $("summaryQuotes").textContent=fmt(quoteValue);
 $("summaryBudget").textContent=work?.target_cost!=null?fmt(work.target_cost):"Pendente";
 $("budgetNote").textContent=work?.target_status==="aprovado"&&work.target_cost!=null
  ?"Custo planejado aprovado para a obra. O contrato representa receita e não deve ser tratado como orçamento de gastos."
  :"Orçamento interno de custos em conferência. Não exibimos margem prevista nem saldo orçamentário sem uma meta validada.";
 const categories=new Map();
 realized.forEach(exp=>categories.set(exp.category,(categories.get(exp.category)||0)+num(exp.amount)));
 const arr=[...categories.entries()].sort((a,b)=>b[1]-a[1]);
 $("categoriesChart").innerHTML=arr.length?arr.map(([name,value])=>
  '<div class="cat-row"><div class="cat-label"><span>'+esc(name)+'</span><strong>'+fmt(value)+'</strong></div>'+
  '<div class="track"><i style="width:'+Math.min(100,Math.round(value/Math.max(spent,.01)*100))+'%"></i></div></div>'
 ).join(""):'<p class="empty">Nenhum custo realizado para esta obra.</p>';
}
function visibleExpenses(){
 const term=$("searchFilter").value.toLocaleLowerCase("pt-BR").trim(),
       status=$("statusFilter").value,cat=$("categoryFilter").value;
 return selectedExpenses().filter(e=>{
   if(status!=="all"&&status!==e.status)return false;
   if(cat!=="all"&&cat!==e.category)return false;
   if(term&&![e.supplier,e.document_no,e.description,e.category].some(x=>String(x||"").toLocaleLowerCase("pt-BR").includes(term)))return false;
   return true;
 }).sort((a,b)=>String(b.issue_date||b.created_at).localeCompare(String(a.issue_date||a.created_at)));
}
function renderExpenseList(){
 const cats=[...new Set(selectedExpenses().map(x=>x.category))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
 const select=$("categoryFilter"),current=select.value;
 select.innerHTML='<option value="all">Todas as categorias</option>'+cats.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join("");
 select.value=cats.includes(current)?current:"all";
 const rows=visibleExpenses();
 $("recordCount").textContent=rows.length+" lançamento"+(rows.length===1?"":"s")+" encontrado"+(rows.length===1?"":"s");
 $("expenseRows").innerHTML=rows.length?rows.map(e=>{
   const paid=paymentTotal(e.id);
   return '<tr><td><strong>'+esc(e.supplier)+'</strong>'+
     '<span class="secondary">'+esc(e.document_no?"Documento "+e.document_no+" · ":"")+esc(e.description)+'</span></td>'+
     '<td>'+esc(e.category)+'</td>'+
     '<td>'+esc(date(e.issue_date))+'</td>'+
     '<td>'+statusChip(e.status)+' '+paidStatus(e)+'</td>'+
     '<td class="right"><strong>'+fmt(e.amount)+'</strong></td>'+
     '<td class="right">'+fmt(paid)+'</td>'+
     '<td><button class="table-view" type="button" data-expense="'+esc(e.id)+'">Detalhes</button></td></tr>';
 }).join(""):'<tr><td colspan="7" class="empty">Nenhum lançamento corresponde aos filtros.</td></tr>';
}
function detailCell(label,value){return '<div class="detail-value"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>'}
function detailSection(title,content){return '<section class="detail-section"><h3>'+esc(title)+'</h3>'+content+'</section>'}
function detailExpense(exp){
 const pay=paymentTotal(exp.id);
 const lines=state.lines.filter(l=>l.expense_id===exp.id).sort((a,b)=>a.line_no-b.line_no);
 const payments=state.payments.filter(p=>p.expense_id===exp.id).sort((a,b)=>String(b.recorded_at).localeCompare(String(a.recorded_at)));
 const att=state.attachments.filter(a=>a.expense_id===exp.id);
 const values='<div class="detail-grid">'+
   detailCell("Valor da despesa",fmt(exp.amount))+
   detailCell("Valor pago",fmt(pay))+
   detailCell("Saldo a pagar",fmt(Math.max(0,num(exp.amount)-pay)))+
   detailCell("Bruto",fmt(exp.gross_amount))+
   detailCell("Desconto",fmt(exp.discount_amount))+
   detailCell("Frete",fmt(exp.freight_amount))+
   '</div>';
 const header='<p>'+statusChip(exp.status)+' '+paidStatus(exp)+'</p>'+
   '<div class="detail-grid">'+
   detailCell("Fornecedor",exp.supplier)+
   detailCell("Documento",exp.document_no||"Não informado")+
   detailCell("Data documento",date(exp.issue_date))+
   detailCell("Categoria",exp.category)+
   detailCell("Tipo documento",exp.document_kind)+
   detailCell("Obra",selectedWork()?.name||"—")+'</div>';
 const itemList=lines.length?
   '<div class="table-wrap"><table><thead><tr><th>Produto / serviço</th><th>Un.</th><th class="right">Qtd.</th><th class="right">Valor un.</th><th class="right">Total</th></tr></thead><tbody>'+
   lines.map(l=>'<tr><td>'+esc(l.description)+'</td><td>'+esc(l.unit||"—")+'</td><td class="right">'+num(l.qty).toLocaleString("pt-BR")+'</td><td class="right">'+fmt(l.unit_price)+'</td><td class="right">'+fmt(l.line_total)+'</td></tr>').join("")+
   '</tbody></table></div><p class="detail-note">Valores das linhas conforme o documento. Total líquido considerado no lançamento: '+fmt(exp.amount)+'.</p>'
   :'<p class="detail-note">Lançamento sem discriminação de produtos.</p>';
 const paymentList=payments.length?
   '<div class="table-wrap"><table><thead><tr><th>Valor</th><th>Data efetiva</th><th>Forma</th><th>Confirmação</th></tr></thead><tbody>'+
   payments.map(p=>'<tr><td>'+fmt(p.amount)+'</td><td>'+esc(date(p.payment_date))+'</td><td>'+esc(p.payment_method||"Não informada")+'</td><td>'+esc(p.confirmation_source)+'</td></tr>').join("")+'</tbody></table></div>'
   :'<p class="detail-note">Nenhum pagamento registrado para esta despesa.</p>';
 const files=att.length?att.map(doc=>
   '<div class="summary-rows"><div><span>'+esc(doc.file_name)+' · '+esc(doc.document_type)+'</span>'+
   '<button type="button" class="table-view" data-file="'+esc(doc.id)+'">Baixar anexo</button></div></div>'
 ).join(""):'<p class="detail-note">Nenhum arquivo enviado ao armazenamento privado. A referência '+esc(exp.source_document_name||"do documento")+' foi registrada, mas o PDF precisa ser anexado no aplicativo.</p>';
 $("detailTitle").textContent=exp.supplier+" · "+(exp.document_no||"Documento");
 $("detailBody").innerHTML=header+values+
  detailSection("Descrição",'<p class="detail-note">'+esc(exp.description)+'</p>')+
  detailSection("Produtos e serviços ("+lines.length+")",itemList)+
  detailSection("Pagamentos registrados ("+payments.length+")",paymentList)+
  detailSection("Documentos privados ("+att.length+")",files)+
  (exp.notes?detailSection("Observações",'<p class="detail-note">'+esc(exp.notes)+'</p>'):"");
 $("detailAdmin").hidden=!canEdit();
 const remaining=round2(Math.max(0,num(exp.amount)-pay));
 $("paymentButton").disabled=exp.status!=="realizada"||remaining<=0;
 $("attachButton").disabled=!canEdit();
}
function openExpense(id){
 const exp=state.expenses.find(e=>e.id===id);if(!exp)return;
 state.detailId=id;detailExpense(exp);$("detailDialog").showModal();
}
async function saveExpense(event){
 event.preventDefault();
 if(!canEdit())return;
 const gross=round2($("expenseGross").value),discount=round2($("expenseDiscount").value),freight=round2($("expenseFreight").value);
 const status=$("expenseStatus").value,fullyPaid=$("expensePaid").checked;
 const button=$("expenseSubmit");
 $("expenseError").textContent="";
 if(gross<=0||gross-discount+freight<.01){$("expenseError").textContent="Confira os valores: total líquido deve ser positivo.";return}
 if(fullyPaid&&status!=="realizada"){$("expenseError").textContent="Para informar pagamento, selecione Despesa realizada.";return}
 btnBusy(button,true);
 try{
   const user=state.profile?.id,work=selectedWork();
   if(!work)throw Error("Selecione uma obra antes de lançar.");
   const record={work_id:work.id,supplier:$("expenseSupplier").value.trim(),
     document_no:$("expenseDocument").value.trim()||null,
     document_kind:$("expenseDocType").value,
     issue_date:$("expenseIssueDate").value||null,
     category:$("expenseCategory").value,
     description:$("expenseDescription").value.trim(),
     status,gross_amount:gross,discount_amount:discount,freight_amount:freight,
     notes:$("expenseNote").value.trim()||null,created_by:user};
   const {data,error}=await client.from("rl_cost_expenses").insert(record).select("id,amount").single();
   if(error)throw error;
   const warnings=[];
   if(fullyPaid){
     const result=await client.from("rl_cost_payments").insert({
       expense_id:data.id,amount:data.amount,
       payment_date:$("expensePaidDate").value||null,
       payment_method:$("expensePaidMethod").value.trim()||null,
       confirmation_source:"Lançamento do administrador no aplicativo RL Custos",
       recorded_by:user
     });
     if(result.error)warnings.push("Despesa criada, mas o pagamento não foi salvo: "+result.error.message+". Abra os detalhes e registre o pagamento.");
   }
   const file=$("expenseFile").files?.[0];
   if(file){try{await uploadDocument(data.id,file,$("expenseDocType").value);}
   catch(uploadError){warnings.push("Despesa salva, mas o anexo não foi enviado: "+uploadError.message)}}
   $("expenseDialog").close();$("expenseForm").reset();
   $("expenseDiscount").value="0";$("expenseFreight").value="0";
   await loadAll(true);
   toast(warnings.length?warnings.join(" "):"Despesa registrada com sucesso.",warnings.length>0);
 }catch(error){$("expenseError").textContent=error.code==="23505"?"Documento já cadastrado para este fornecedor e obra.":error.message}
 finally{btnBusy(button,false)}
}
async function uploadDocument(expenseId,file,kind){
 if(!canEdit())throw Error("Envio permitido somente para administradores.");
 if(file.size>12*1024*1024)throw Error("Arquivo maior que 12 MB.");
 if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(file.type))throw Error("Selecione PDF, JPG, PNG ou WebP.");
 const expense=state.expenses.find(e=>e.id===expenseId);
 const workId=expense?.work_id||selectedWork()?.id;
 if(!workId)throw Error("Obra não encontrada.");
 const simpleName=file.name.normalize("NFKD").replace(/[^\w.-]/g,"_").slice(-120);
 const path=workId+"/"+expenseId+"/"+crypto.randomUUID()+"-"+simpleName;
 const {error}=await client.storage.from("rl-custos-documentos").upload(path,file,{upsert:false,contentType:file.type});
 if(error)throw error;
 const types=["orcamento","recibo","nota_fiscal","comprovante"];
 const docType=types.includes(kind)?kind:"outro";
 const {error:dbError}=await client.from("rl_cost_attachments").insert({
   expense_id:expenseId,storage_path:path,file_name:file.name.slice(0,180),
   document_type:docType,uploaded_by:state.profile.id
 });
 if(dbError)throw Error("Arquivo enviado, mas o cadastro do anexo falhou: "+dbError.message);
}
async function attachToDetail(event){
 const file=event.target.files?.[0];if(!file||!state.detailId)return;
 try{
  const exp=state.expenses.find(e=>e.id===state.detailId);
  await uploadDocument(state.detailId,file,exp?.document_kind||"outro");
  await loadAll(true);const fresh=state.expenses.find(e=>e.id===state.detailId);if(fresh)detailExpense(fresh);
  toast("Documento armazenado com acesso protegido.");
 }catch(error){toast("Não foi possível anexar: "+error.message,true)}
 finally{event.target.value=""}
}
async function downloadFile(id){
 const file=state.attachments.find(f=>f.id===id);if(!file)return;
 try{
  const {data,error}=await client.storage.from("rl-custos-documentos").download(file.storage_path);
  if(error)throw error;
  const url=URL.createObjectURL(data),a=document.createElement("a");
  a.href=url;a.download=file.file_name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
 }catch(error){toast("Falha ao baixar anexo: "+error.message,true)}
}
function openPayment(){
 const expense=state.expenses.find(e=>e.id===state.detailId);if(!expense)return;
 const remaining=round2(num(expense.amount)-paymentTotal(expense.id));
 if(remaining<=0||expense.status!=="realizada")return;
 $("paymentContext").textContent="Saldo em aberto: "+fmt(remaining)+" — "+expense.supplier;
 $("paymentAmount").value=remaining;
 $("paymentDate").value="";$("paymentMethod").value="";
 $("paymentError").textContent="";
 $("paymentDialog").showModal();
}
async function savePayment(event){
 event.preventDefault();if(!canEdit())return;
 const expense=state.expenses.find(e=>e.id===state.detailId);if(!expense)return;
 const remaining=round2(num(expense.amount)-paymentTotal(expense.id));
 const amount=round2($("paymentAmount").value);
 if(amount<=0||amount>remaining+.001){$("paymentError").textContent="Valor maior que o saldo em aberto ou inválido.";return}
 const button=$("paymentSubmit");btnBusy(button,true);
 try{
  const {error}=await client.from("rl_cost_payments").insert({
   expense_id:expense.id,amount,payment_date:$("paymentDate").value||null,
   payment_method:$("paymentMethod").value.trim()||null,
   confirmation_source:"Registro administrativo no aplicativo RL Custos",
   recorded_by:state.profile.id
  });
  if(error)throw error;
  $("paymentDialog").close();await loadAll(true);
  const exp=state.expenses.find(e=>e.id===state.detailId);
  if(exp)detailExpense(exp);
  toast("Pagamento registrado: "+fmt(amount));
 }catch(error){$("paymentError").textContent=error.message}
 finally{btnBusy(button,false)}
}
async function saveWork(event){
 event.preventDefault();if(!canEdit())return;
 const name=$("workName").value.trim(),city=$("workCity").value.trim(),uf=$("workState").value.trim().toUpperCase();
 const contract=$("workContract").value.trim();
 const slug=name.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
   .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,57)+"-"+crypto.randomUUID().slice(0,8);
 const button=$("workSubmit");btnBusy(button,true);
 try{
  const {data,error}=await client.from("rl_cost_works").insert({
    slug,name,municipality:city||null,state_code:uf||null,
    contract_amount:contract===""?null:round2(contract),
    target_status:"pendente"
  }).select("id").single();
  if(error)throw error;
  state.workId=data.id;$("workDialog").close();$("workForm").reset();
  await loadAll();toast("Obra cadastrada.");
 }catch(error){$("workError").textContent=error.message}
 finally{btnBusy(button,false)}
}
function wire(){
 $("refresh").addEventListener("click",()=>loadAll());
 $("workFilter").addEventListener("change",e=>{state.workId=e.target.value;render()});
 $("searchFilter").addEventListener("input",renderExpenseList);
 $("statusFilter").addEventListener("change",renderExpenseList);
 $("categoryFilter").addEventListener("change",renderExpenseList);
 $("expenseRows").addEventListener("click",e=>{const b=e.target.closest("[data-expense]");if(b)openExpense(b.dataset.expense)});
 $("detailBody").addEventListener("click",e=>{const b=e.target.closest("[data-file]");if(b)void downloadFile(b.dataset.file)});
 $("newExpense").addEventListener("click",()=>{if(!canEdit())return;$("expenseError").textContent="";$("expenseDialog").showModal()});
 $("newWork").addEventListener("click",()=>{if(!canEdit())return;$("workError").textContent="";$("workDialog").showModal()});
 $("expenseStatus").addEventListener("change",()=>{
  if($("expenseStatus").value!=="realizada")$("expensePaid").checked=false;
  $("expensePaid").disabled=$("expenseStatus").value!=="realizada";
  $("paidFields").hidden=!$("expensePaid").checked;
 });
 $("expensePaid").addEventListener("change",()=>{$("paidFields").hidden=!$("expensePaid").checked});
 $("expenseForm").addEventListener("submit",saveExpense);
 $("paymentForm").addEventListener("submit",savePayment);
 $("workForm").addEventListener("submit",saveWork);
 $("attachButton").addEventListener("click",()=>$("attachmentInput").click());
 $("attachmentInput").addEventListener("change",attachToDetail);
 $("paymentButton").addEventListener("click",openPayment);
 document.querySelectorAll("[data-close]").forEach(button=>button.addEventListener("click",()=>$(button.dataset.close).close()));
}
async function start(){
 wire();
 try{
  const authorized=await authorize();
  if(authorized)await loadAll();
 }catch(error){console.error("RL Custos access:",error);setAccess(false);toast("Não foi possível verificar o acesso: "+error.message,true)}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
else start();
})();
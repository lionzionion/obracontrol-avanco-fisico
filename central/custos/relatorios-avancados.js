/* RL Engenharia — relatórios gerenciais, leitura sob RLS do RL Custos.
 * Separação obrigatória: realizado (competência), pago (caixa), autorizado e cotação. */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&#39;"}[ch]));
const brl=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const num=v=>Math.round((Number(v)||0)*100)/100;
const date=v=>v?new Date(String(v).slice(0,10)+"T12:00:00").toLocaleDateString("pt-BR"):"Sem data";
const nowDay=()=>new Date().toLocaleDateString("sv-SE",{timeZone:"America/Recife"});
const isoDate=v=>String(v||"").slice(0,10);
const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("pt-BR").trim().replace(/\s+/g," ");
const state={kind:"executivo",scope:"current",from:"",to:"",supplier:"all",category:"all",result:null};
const titles={executivo:"Resumo executivo",fornecedores:"Por fornecedor",categorias:"Por categoria",mensal:"Evolução mensal",pendencias:"Pendências e auditoria"};
const info={
 executivo:"Despesas realizadas e seus pagamentos acumulados. Autorizadas e cotações aparecem separadas, sem integrar o custo realizado.",
 fornecedores:"Valores de despesas realizadas, agrupados pelo CNPJ quando informado ou pelo nome normalizado do fornecedor.",
 categorias:"Distribuição das despesas realizadas por natureza. Pagamentos não são somados como novas despesas.",
 mensal:"Competência por data do documento; caixa por data efetiva do pagamento. Datas ausentes são mostradas separadamente.",
 pendencias:"Pendências de documentos e vencimentos de despesas realizadas. Um registro pode apresentar mais de uma pendência."
};
function snapshot(){return window.RL_CUSTOS_API?.snapshot()||null;}
function works(s){return (s?.works||[]).filter(w=>state.scope==="all"||w.id===s.workId);}
function between(d){
 if(!state.from&&!state.to)return true;
 if(!d)return false;
 return (!state.from||d>=state.from)&&(!state.to||d<=state.to);
}
function matches(e){
 if(state.supplier!=="all"&&norm(e.supplier)!==state.supplier)return false;
 if(state.category!=="all"&&e.category!==state.category)return false;
 return true;
}
function build(){
 const s=snapshot();if(!s)return null;
 const filteredWorks=works(s),workIds=new Set(filteredWorks.map(w=>w.id));
 const visible=(s.expenses||[]).filter(e=>workIds.has(e.work_id));
 const paymentMap=new Map();
 (s.payments||[]).forEach(p=>{
   if(!paymentMap.has(p.expense_id))paymentMap.set(p.expense_id,[]);
   paymentMap.get(p.expense_id).push(p);
 });
 const docs=new Set((s.attachments||[]).map(a=>a.expense_id));
 const exp=visible.filter(matches).map(e=>{
   const payments=paymentMap.get(e.id)||[];
   const totalPaid=num(payments.reduce((a,p)=>a+Number(p.amount||0),0));
   return {...e,amount:num(e.amount),paid:totalPaid,
     balance:e.status==="realizada"?num(Math.max(0,num(e.amount)-totalPaid)):0,
     hasDocument:docs.has(e.id),payments};
 });
 const competence=exp.filter(e=>between(isoDate(e.issue_date)));
 const realized=competence.filter(e=>e.status==="realizada");
 const paid=num(realized.reduce((a,e)=>a+e.paid,0));
 const spent=num(realized.reduce((a,e)=>a+e.amount,0));
 const open=num(realized.reduce((a,e)=>a+e.balance,0));
 const authorized=num(competence.filter(e=>e.status==="autorizada").reduce((a,e)=>a+e.amount,0));
 const quotes=num(competence.filter(e=>e.status==="cotacao").reduce((a,e)=>a+e.amount,0));
 const cashPayments=exp.filter(e=>e.status==="realizada").flatMap(e=>e.payments.map(p=>({...p,expense:e}))).filter(p=>between(isoDate(p.payment_date)));
 return {s,filteredWorks,exp,competence,realized,paid,spent,open,authorized,quotes,cashPayments};
}
function cols(...args){return args.map(arg=>typeof arg==="string"?{label:arg,type:"text"}:arg);}
function col(label,type="text"){return {label,type};}
function reportExecutive(d){
 const byWork=d.filteredWorks.map(w=>{
   const expenses=d.realized.filter(e=>e.work_id===w.id);
   const amount=num(expenses.reduce((a,e)=>a+e.amount,0));
   const paid=num(expenses.reduce((a,e)=>a+e.paid,0));
   return {work:w.name,amount,paid,balance:num(expenses.reduce((a,e)=>a+e.balance,0)),
     missing:expenses.filter(e=>!e.hasDocument).length,count:expenses.length};
 });
 const noDue=d.realized.filter(e=>e.balance>0&&!e.due_date).length;
 const noDoc=d.realized.filter(e=>!e.hasDocument).length;
 return {
  columns:cols("Obra",col("Despesas realizadas","money"),col("Pago","money"),col("A pagar","money"),col("Lançamentos","count"),col("Sem anexo","count")),
  rows:byWork.map(r=>[r.work,r.amount,r.paid,r.balance,r.count,r.missing]),
  numericColumns:[1,2,3,4,5],
  kpis:[["Custo realizado",d.spent],["Pagamento acumulado",d.paid],["Saldo a pagar",d.open],["Compromissos autorizados",d.authorized]],
  bars:byWork.map(r=>({label:r.work,value:r.amount})),
  foot:"Cotações não aprovadas: "+brl(d.quotes)+". Despesas sem comprovante: "+noDoc+"; saldos sem vencimento: "+noDue+". Valores contratuais não são usados como orçamento de custos."
 };
}
function reportSupplier(d){
 const groups=new Map();
 d.realized.forEach(e=>{
   const key=e.supplier_tax_id?"cnpj:"+String(e.supplier_tax_id).replace(/\D/g,""):"nome:"+norm(e.supplier);
   if(!groups.has(key))groups.set(key,{name:e.supplier,amount:0,paid:0,balance:0,count:0,missing:0});
   const g=groups.get(key);g.amount+=e.amount;g.paid+=e.paid;g.balance+=e.balance;g.count++;if(!e.hasDocument)g.missing++;
 });
 const grouped=[...groups.values()].sort((a,b)=>b.amount-a.amount);
 return {
  columns:cols("Fornecedor",col("Valor realizado","money"),col("Pago","money"),col("Saldo","money"),col("Despesas","count"),col("Sem arquivo","count")),
  rows:grouped.map(g=>[g.name,num(g.amount),num(g.paid),num(g.balance),g.count,g.missing]),
  numericColumns:[1,2,3,4,5],
  kpis:[["Fornecedores",grouped.length,"count"],["Custo realizado",d.spent],["Pago",d.paid],["Saldo aberto",d.open]],
  bars:grouped.slice(0,8).map(g=>({label:g.name,value:g.amount})),
  foot:"Agrupamento por CNPJ cadastrado; quando ausente, pelo nome do fornecedor. Não inclui cotações nem despesas apenas autorizadas."
 };
}
function reportCategory(d){
 const groups=new Map();
 d.realized.forEach(e=>{
   const key=e.category||"Sem categoria";
   if(!groups.has(key))groups.set(key,{name:key,amount:0,paid:0,balance:0,count:0});
   const g=groups.get(key);g.amount+=e.amount;g.paid+=e.paid;g.balance+=e.balance;g.count++;
 });
 const grouped=[...groups.values()].sort((a,b)=>b.amount-a.amount);
 return {
  columns:cols("Categoria",col("Realizado","money"),col("Pago","money"),col("A pagar","money"),col("Participação","percent"),col("Documentos","count")),
  rows:grouped.map(g=>[g.name,num(g.amount),num(g.paid),num(g.balance),d.spent?100*g.amount/d.spent:0,g.count]),
  numericColumns:[1,2,3,4,5],
  kpis:[["Categorias",grouped.length,"count"],["Custo realizado",d.spent],["Pago",d.paid],["Saldo aberto",d.open]],
  bars:grouped.map(g=>({label:g.name,value:g.amount})),
  foot:"Participação calculada sobre despesas realizadas no período. A categoria Outros pode conter despesas aguardando classificação."
 };
}
function reportMonthly(d){
 const monthly=new Map();
 const get=key=>{if(!monthly.has(key))monthly.set(key,{month:key,realized:0,paid:0,due:0,documents:0,payments:0});return monthly.get(key);};
 // Não inventar datas de competência ou pagamento.
 d.exp.filter(e=>e.status==="realizada").forEach(e=>{
   const issued=isoDate(e.issue_date),due=isoDate(e.due_date);
   if(between(issued)){const m=get(issued?issued.slice(0,7):"Sem data");m.realized+=e.amount;m.documents++;}
   if(e.balance>0&&between(due))get(due?due.slice(0,7):"Sem data").due+=e.balance;
   e.payments.forEach(p=>{const paidDate=isoDate(p.payment_date);if(between(paidDate)){const m=get(paidDate?paidDate.slice(0,7):"Sem data");m.paid+=Number(p.amount||0);m.payments++;}});
 });
 const arr=[...monthly.values()].sort((a,b)=>a.month.localeCompare(b.month));
 const fmtMonth=key=>key==="Sem data"?key:new Date(key+"-01T12:00:00").toLocaleDateString("pt-BR",{month:"short",year:"numeric"});
 const total=(name)=>num(arr.reduce((a,m)=>a+m[name],0));
 return {
  columns:cols("Mês",col("Despesas reconhecidas","money"),col("Pagamentos","money"),col("Saldo com vencimento","money"),col("Despesas","count"),col("Pagamentos","count")),
  rows:arr.map(m=>[fmtMonth(m.month),num(m.realized),num(m.paid),num(m.due),m.documents,m.payments]),
  numericColumns:[1,2,3,4,5],
  kpis:[["Competência",total("realized")],["Caixa pago",total("paid")],["A vencer por data",total("due")],["Meses exibidos",arr.length,"count"]],
  bars:arr.filter(x=>x.month!=="Sem data").map(x=>({label:fmtMonth(x.month),value:x.realized,secondary:x.paid})),
  foot:"Despesas por data do documento; pagamentos por data de quitação; saldo em aberto agrupado pelo vencimento. São séries distintas e não devem ser subtraídas mês a mês para apurar lucro. Valores sem data aparecem apenas quando não há filtro de período."
 };
}
function reportPending(d){
 const base=d.realized.map(e=>{
   const issues=[];
   if(!e.hasDocument)issues.push("Arquivo ausente");
   if(e.balance>0&&!e.due_date)issues.push("Sem vencimento");
   if(e.balance>0&&e.due_date&&e.due_date<nowDay())issues.push("Vencida");
   return {e,issues};
 }).filter(row=>row.issues.length);
 base.sort((a,b)=>b.e.balance-a.e.balance);
 return {
  columns:cols("Fornecedor", "Pendência","Documento","Vencimento",col("Saldo aberto","money"),col("Pago","money")),
  rows:base.map(({e,issues})=>[e.supplier,issues.join("; "),e.document_no||"—",date(e.due_date),e.balance,e.paid]),
  numericColumns:[4,5],
  kpis:[["Despesas com pendências",base.length,"count"],["Arquivos ausentes",base.filter(r=>r.issues.includes("Arquivo ausente")).length,"count"],["Sem vencimento",base.filter(r=>r.issues.includes("Sem vencimento")).length,"count"],["Saldo vencido",num(base.filter(r=>r.issues.includes("Vencida")).reduce((a,r)=>a+r.e.balance,0))]],
  bars:[],
  foot:"A auditoria não altera documentos nem pagamentos. Os comprovantes são considerados presentes apenas após vinculação na tabela privada de anexos."
 };
}
const factories={executivo:reportExecutive,fornecedores:reportSupplier,categorias:reportCategory,mensal:reportMonthly,pendencias:reportPending};
function format(v,type){
 if(type==="money")return brl(v);
 if(type==="count")return Number(v||0).toLocaleString("pt-BR");
 if(type==="percent")return Number(v||0).toLocaleString("pt-BR",{maximumFractionDigits:1,minimumFractionDigits:1})+"%";
 return String(v??"");
}
function table(res){
 const rows=res.rows.map(row=>"<tr>"+row.map((v,i)=>'<td'+(res.columns[i].type!=="text"?' class="right"':"")+">"+esc(format(v,res.columns[i].type))+"</td>").join("")+"</tr>").join("");
 let total="";
 if(res.rows.length){
  const values=res.columns.map((c,i)=>i===0?"TOTAL":res.numericColumns.includes(i)?num(res.rows.reduce((a,r)=>a+(Number(r[i])||0),0)):"");
  total="<tfoot><tr>"+values.map((v,i)=>'<td'+(res.columns[i].type!=="text"?' class="right"':"")+">"+(res.numericColumns.includes(i)?esc(format(v,res.columns[i].type)):(i===0?"TOTAL":""))+"</td>").join("")+"</tr></tfoot>";
  if(res.columns.some(c=>c.type==="percent"))total=""; // Percentuais nunca devem ser somados.
 }
 return '<div class="table-wrap"><table><thead><tr>'+res.columns.map(c=>'<th'+(c.type!=="text"?' class="right"':"")+">"+esc(c.label)+"</th>").join("")+"</tr></thead><tbody>"+(rows||'<tr><td colspan="'+res.columns.length+'" class="empty">Nenhum lançamento corresponde aos filtros.</td></tr>')+"</tbody>"+total+"</table></div>";
}
function chart(res){
 const arr=res.bars.slice(0,12);
 if(!arr.length)return '<p class="report-empty">Não há distribuição gráfica para este relatório.</p>';
 const max=Math.max(...arr.map(x=>x.value),1);
 return '<div class="report-bars">'+arr.map(x=>{
  const a=Math.max(0,Math.min(100,x.value/max*100));
  const second=x.secondary!=null?'<div class="report-bar2" style="width:'+Math.max(0,Math.min(100,x.secondary/max*100)).toFixed(1)+'%"></div>':"";
  return '<div class="report-barrow"><div class="report-barlabel"><span>'+esc(x.label)+'</span><strong>'+esc(brl(x.value))+(x.secondary!=null?" · Pago "+esc(brl(x.secondary)):"")+'</strong></div><div class="report-track"><div class="report-bar1" style="width:'+a.toFixed(1)+'%"></div>'+second+"</div></div>";
 }).join("")+"</div>";
}
function refreshOptions(selectId,values,selected){
 const elem=$(selectId),current=selected??elem.value;
 elem.innerHTML='<option value="all">Todos</option>'+values.map(x=>'<option value="'+esc(x.value)+'">'+esc(x.label)+"</option>").join("");
 elem.value=values.some(v=>v.value===current)?current:"all";
}
function printSubtitle(d){
 const period=state.from||state.to?(state.from?date(state.from):"Início")+" a "+(state.to?date(state.to):"Hoje"):"Todo o histórico";
 return [
  state.scope==="all"?"Todas as obras":(d.filteredWorks[0]?.name||"Obra não selecionada"),
  "Período: "+period,
  "Fornecedor: "+($("reportsSupplier").selectedOptions[0]?.textContent||"Todos"),
  "Categoria: "+($("reportsCategory").selectedOptions[0]?.textContent||"Todas")
 ].join(" | ");
}
function render(){
 const d=build();if(!d)return;
 const suppliers=[...new Set(d.exp.map(e=>norm(e.supplier)))].sort((a,b)=>a.localeCompare(b,"pt-BR")).map(v=>({value:v,label:v}));
 const cats=[...new Set(d.exp.map(e=>e.category))].filter(Boolean).sort((a,b)=>a.localeCompare(b,"pt-BR")).map(v=>({value:v,label:v}));
 // Sempre obter opções de todos os lançamentos no escopo, independentemente dos filtros correntes.
 const s=d.s,scopeWorks=new Set(d.filteredWorks.map(w=>w.id));
 const allInScope=s.expenses.filter(e=>scopeWorks.has(e.work_id));
 const allSuppliers=[...new Set(allInScope.map(e=>norm(e.supplier)))].sort((a,b)=>a.localeCompare(b,"pt-BR")).map(v=>({value:v,label:v}));
 const allCats=[...new Set(allInScope.map(e=>e.category))].filter(Boolean).sort((a,b)=>a.localeCompare(b,"pt-BR")).map(v=>({value:v,label:v}));
 refreshOptions("reportsSupplier",allSuppliers,state.supplier);
 refreshOptions("reportsCategory",allCats,state.category);
 const result=factories[state.kind](d);
 state.result={...result,context:d};
 $("reportsTitle").textContent=titles[state.kind];
 $("reportsSubtitle").textContent=info[state.kind];
 $("reportsPeriod").textContent=printSubtitle(d);
 $("reportsIssued").textContent="Emitido em "+new Date().toLocaleString("pt-BR",{timeZone:"America/Recife"});
 $("reportsKpis").innerHTML=result.kpis.map(([label,value,type])=>'<div class="report-kpi"><span>'+esc(label)+'</span><strong>'+esc(format(value,type||"money"))+"</strong></div>").join("");
 $("reportsTable").innerHTML=table(result);
 $("reportsChart").innerHTML=chart(result);
 $("reportsNote").textContent=result.foot;
 $("reportsCount").textContent=result.rows.length+" linha(s) no relatório · Dados conforme os registros disponíveis no RL Custos.";
 document.querySelectorAll("[data-report-kind]").forEach(el=>{
   const active=el.dataset.reportKind===state.kind;el.classList.toggle("selected",active);el.setAttribute("aria-pressed",String(active));
 });
}
function csvSafe(v){
 const raw=String(v??"");
 const safer=/^\s*[=+@-]/.test(raw)?"'"+raw:raw;
 return '"'+safer.replace(/"/g,'""')+'"';
}
function exportCSV(){
 const r=state.result;if(!r)return;
 const meta=[
  ["RL ENGENHARIA — RELATÓRIO FINANCEIRO",titles[state.kind]],
  ["Obra e filtros",printSubtitle(r.context)],
  ["Emissão",new Date().toLocaleString("pt-BR",{timeZone:"America/Recife"})],
  []
 ];
 const rows=[...meta,r.columns.map(c=>c.label),...r.rows.map(row=>row.map((v,i)=>{
  const type=r.columns[i].type;
  return type==="money"||type==="percent"?Number(v).toFixed(2).replace(".",","):v;
 }))];
 const text="\uFEFF"+rows.map(row=>row.map(csvSafe).join(";")).join("\r\n");
 const blob=new Blob([text],{type:"text/csv;charset=utf-8"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="RL_Custos_"+state.kind+"_"+nowDay()+".csv";
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),12000);
}
function printReport(){
 if(!state.result)return;
 document.body.classList.add("reports-printing");
 window.print();
}
function events(){
 const bind=(id,key)=>$(id).addEventListener("change",e=>{state[key]=e.target.value;render()});
 bind("reportsScope","scope");bind("reportsFrom","from");bind("reportsTo","to");bind("reportsSupplier","supplier");bind("reportsCategory","category");
 $("reportsKinds").addEventListener("click",e=>{
   const b=e.target.closest("[data-report-kind]");if(!b)return;
   state.kind=b.dataset.reportKind;render();
 });
 $("reportsClear").addEventListener("click",()=>{
   Object.assign(state,{from:"",to:"",supplier:"all",category:"all",scope:"current"});
   $("reportsFrom").value="";$("reportsTo").value="";$("reportsScope").value="current";render();
 });
 $("reportsExport").addEventListener("click",exportCSV);
 $("reportsPrint").addEventListener("click",printReport);
 window.addEventListener("afterprint",()=>document.body.classList.remove("reports-printing"));
 window.addEventListener("rl-custos-updated",render);
}
function start(){if(!$("reportsAdvanced"))return;events();render();}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
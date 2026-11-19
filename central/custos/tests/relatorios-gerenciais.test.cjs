/* Relatórios gerenciais: regressões com dados sintéticos, sem rede nem credenciais. */
"use strict";
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const source=fs.readFileSync("central/custos/relatorios-avancados.js","utf8");
const html=fs.readFileSync("central/custos/index.html","utf8");
const css=fs.readFileSync("central/custos/custos.css","utf8");
for(const id of ["reportsAdvanced","reportsScope","reportsFrom","reportsTo","reportsSupplier",
  "reportsCategory","reportsKinds","reportsTable","reportsChart","reportsKpis",
  "reportsPrint","reportsExport","reportsPeriod"]){
 assert.ok(html.includes('id="'+id+'"'),"Falta controle: "+id);
}
for(const name of ["executivo","fornecedores","categorias","mensal","pendencias"]){
 assert.ok(source.includes("report"+name[0].toUpperCase()+name.slice(1))||
   source.includes(name+":"),"Relatório ausente: "+name);
}
assert.match(css,/body\.reports-printing/);
assert.doesNotMatch(source,/service_role|sb_secret_/);
const elements=new Map();
const events={};
function element(id){
 if(!elements.has(id))elements.set(id,{
  id,value:id==="reportsScope"?"current":"all",innerHTML:"",textContent:"",
  selectedOptions:[{textContent:"Todos"}],classList:{toggle(){}},setAttribute(){},
  addEventListener(type,fn){events[id+":"+type]=fn;}
 });
 return elements.get(id);
}
const document={
 readyState:"complete",getElementById:element,
 querySelectorAll(){return[];},
 addEventListener(){}
};
const work="planalto",outside="ambev";
const expenses=[
 {id:"jp",work_id:work,supplier:"JP PREMOLDADOS",supplier_tax_id:null,document_no:null,
  description:"Meio-fio e paver",category:"Materiais",status:"realizada",amount:82955.84,
  issue_date:"2026-11-17",due_date:"2026-12-15"},
 {id:"epis",work_id:work,supplier:"UNIVERSO EPIS",supplier_tax_id:"21.852.418/0001-05",
  category:"EPI",status:"realizada",amount:436.95,issue_date:"2026-11-19",due_date:null},
 {id:"alexandre",work_id:work,supplier:"ALEXANDRE",category:"Outros",
  status:"realizada",amount:100,issue_date:"2026-11-18",due_date:null},
 {id:"quote",work_id:work,supplier:"FORNECEDOR COTACAO",category:"Materiais",
  status:"cotacao",amount:60000,issue_date:"2026-11-10"},
 {id:"order",work_id:work,supplier:"AUTORIZADA",category:"Materiais",
  status:"autorizada",amount:2000,issue_date:"2026-11-10"},
 {id:"otherwork",work_id:outside,supplier:"SERVICOS",category:"Serviços",
  status:"realizada",amount:300,issue_date:"2026-11-05"}
];
const payments=[
 {expense_id:"jp",amount:41467.68,payment_date:"2026-11-17"},
 {expense_id:"epis",amount:436.95,payment_date:"2026-11-19"},
 {expense_id:"alexandre",amount:100,payment_date:"2026-11-18"},
 {expense_id:"otherwork",amount:50,payment_date:"2026-12-03"}
];
const snapshot={workId:work,works:[{id:work,name:"Planalto"},{id:outside,name:"Ambev"}],
 expenses,payments,attachments:[{expense_id:"epis"}]};
const window={RL_CUSTOS_API:{snapshot:()=>snapshot},addEventListener(){}};
vm.runInNewContext(source,{document,window,console,Date,Intl,Number,Set,Map,Math});
assert.match(element("reportsKpis").innerHTML,/83\.492,79/,"Resumo deve conter apenas despesas realizadas");
assert.match(element("reportsKpis").innerHTML,/42\.004,63/,"Pagamentos acumulados errados");
assert.match(element("reportsKpis").innerHTML,/41\.488,16/,"Saldo em aberto incorreto");
assert.doesNotMatch(element("reportsKpis").innerHTML,/60\.000,00/,"Cotação não integra custo realizado");
assert.match(element("reportsNote").textContent,/2/,"Deve registrar documentos ausentes");
events["reportsKinds:click"]({target:{closest:()=>({dataset:{reportKind:"mensal"}})}});
const monthly=element("reportsTable").innerHTML;
assert.match(monthly,/nov\./i,"Competência de novembro ausente");
assert.match(monthly,/dez\./i,"Pagamento de dezembro em outra obra fica fora do filtro Planalto");
assert.match(monthly,/83\.492,79/,"Competência no mês incorreta");
events["reportsKinds:click"]({target:{closest:()=>({dataset:{reportKind:"pendencias"}})}});
assert.match(element("reportsTable").innerHTML,/Arquivo ausente/);
assert.match(element("reportsTable").innerHTML,/Sem vencimento/);
console.log("OK: relatórios gerenciais respeitam obra, cotações, pagamentos e documentos.");

/* RL Custos: regressões das telas de financeiro (sem conectar dados reais). */
"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const html=fs.readFileSync("central/custos/index.html","utf8");
const app=fs.readFileSync("central/custos/custos.js","utf8");
const reports=fs.readFileSync("central/custos/financeiro.js","utf8");
const css=fs.readFileSync("central/custos/custos.css","utf8");
for(const id of [
 "financeReports","financeReportTabs","financeTable","financeOpen",
 "financeOverdue","financeSoon","financeMissing","financeAttachmentInput",
 "financeBatchInput","financeBatchUpload","financeDueDialog",
 "financeDueInput","expenseDueDate","financeExport","financePrint"
])assert.ok(html.includes('id="'+id+'"'),"Faltando elemento financeiro: "+id);
for(const name of ["payables","expenses","payments","attachments"])
 assert.ok(reports.includes('state.tab==="'+name+'"')||reports.includes('financeTab="'+name+'"'),"Faltando relatório: "+name);
assert.match(app,/due_date/);
assert.match(reports,/saveDueDate/);
assert.match(app,/content_sha256/);
assert.match(app,/crypto\.subtle\.digest\("SHA-256"/);
assert.match(app,/verification\.data\.size!==file\.size/);
assert.match(reports,/attachBatch/);
assert.match(reports,/rl-custos-updated/);
assert.ok(!/service_role|sb_secret_/.test(html+app+reports),"Código não deve expor chave secreta");
assert.ok(!/storage\.from\([^)]*\)\.remove\s*\(/.test(app+reports),"Não excluir comprovantes");
assert.ok(css.includes("finance-printing"),"Estilo de relatório impresso ausente");
new Function(app);new Function(reports);
console.log("OK: RL Custos — relatórios, vencimentos e anexos privados.");

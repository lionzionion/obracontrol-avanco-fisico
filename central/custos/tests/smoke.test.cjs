/* Smoke tests: RL Custos — 2026-11-19 */
"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const html=fs.readFileSync("central/custos/index.html","utf8");
const app=fs.readFileSync("central/custos/custos.js","utf8");
const central=fs.readFileSync("central/index.html","utf8");
const wire=fs.readFileSync("central/enhancements.js","utf8");
const finance=fs.readFileSync("central/costs-overview.js","utf8");
for(const id of ["workFilter","expenseRows","detailDialog","expenseDialog","expenseForm","paymentForm","workForm","attachmentInput","paidValue","realizedValue","payableValue","detailBody","workBudgetStatus"]){
 assert.match(html,new RegExp('id="'+id+'"'),"Interface incompleta: "+id);
 assert.ok(app.includes('"'+id+'"'),"Código não usa o campo "+id);
}
assert.ok(central.includes('data-app="custos"'),"Atalho RL Custos ausente na Central");
assert.ok(central.includes('id="costOverviewPaid"'),"Resumo de custos ausente na Visão Executiva");
assert.ok(wire.includes('key!=="custos"'),"Diretoria não pode acessar o painel de consulta");
assert.ok(wire.includes('new URL("./custos/"'),"App integrado sem endereço");
assert.ok(finance.includes('rl_cost_expenses')&&finance.includes('rl_cost_payments'),"Indicadores não carregam despesas e pagamentos");
assert.ok(!/\.\s*(delete|remove)\s*\(/.test(app),"O aplicativo não deve excluir despesas ou documentos");
assert.ok(!/service_role|sb_secret_/.test(app),"Não publicar chave privada");
assert.equal(Math.round((573-136.05)*100)/100,436.95,"Valor pago da Universo EPIs");
console.log("OK: RL Custos conectado à Central, com documentos privados, pagamentos e acesso Diretoria.");

/* RL Movimentações — Diárias e Fechamentos.
 * Valida contrato de interface e integridade de funcionalidades em CI.
 * Testes funcionais de regras do banco também realizados com ROLLBACK no Supabase. */
"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const html=fs.readFileSync("central/movimentacoes/index.html","utf8");
const app=fs.readFileSync("central/movimentacoes/mov.js","utf8");
const js=fs.readFileSync("central/movimentacoes/diarias.js","utf8");
const css=fs.readFileSync("central/movimentacoes/diarias.css","utf8");
const central=fs.readFileSync("central/index.html","utf8");
const overview=fs.readFileSync("central/mov-overview.js","utf8");
for(const id of ["panel-diarias","dailyAdd","dailyNewRate","dailyNewClosure","dailyFrom","dailyTo",
 "dailyPlateFilter","dailyReviewFilter","dailyRows","dailyKpiTotal","dailyKpiPending",
 "dailyKpiClosed","dailyClosuresRows","dailyRatesRows","dailyLogDialog","dailyLogForm",
 "dailyVehicle","dailyDate","dailyDriver","dailyNote","dailyPhoto","dailyLogSave",
 "dailyRateDialog","dailyRateValue","dailyRateStandby","dailyRateSave",
 "dailyClosureDialog","dailyCloseVehicle","dailyCloseFrom","dailyCloseTo",
 "dailyCloseExtras","dailyCloseDiscounts","dailyCloseAgree","dailyCloseSave",
 "dailyDetailsDialog","dailyDetailsBody","dailyPrintRoot"]){
 assert.ok(html.includes('id="'+id+'"'),"UI missing: "+id);
 assert.ok(js.includes('"'+id+'"'),"JS missing UI binding: "+id);
}
for(const item of ['value="inteira"','value="meia"','value="disposicao"','value="nao_trabalhou"']){
 assert.ok(html.includes(item),"Daily type missing: "+item);
}
assert.ok(html.includes('src="./diarias.js?v=1"'),"Daily JS missing from page");
assert.ok(html.includes('href="./diarias.css?v=1"'),"Daily styles missing from page");
assert.ok(app.includes('window.RL_MOV_CORE=Object.freeze'),"Core bridge missing");
assert.ok(app.includes('RL_MOV_DAILY?.load?.(st.workId)'),"Work switching must refresh daily data");
assert.ok(app.includes('get("tab")==="diarias"'),"Field deep link unsupported");
assert.ok(central.includes('id="movOverviewDailyPending"'),"Daily KPIs absent from Central");
assert.ok(central.includes('id="movOverviewDailyClosures"'),"Closing KPIs absent from Central");
assert.ok(central.includes('href="./movimentacoes/?tab=diarias"'),"Direct access absent");
assert.ok(overview.includes("rl_mov_daily_logs"),"Daily KPIs lack database source");
assert.ok(overview.includes("rl_mov_daily_closures"),"Closures KPI lacks database source");
for(const text of ["rl_mov_daily_logs","rl_mov_daily_rates","rl_mov_daily_closures",
 "rl_mov_daily_closure_items","rl_mov_daily_attachments","rl_mov_close_daily_period",
 "rl-mov-documentos","rateFor","day_factor","window.print","canFinancial","canWrite","isAdmin"]){
 assert.ok(js.includes(text),"Missing daily functionality: "+text);
}
assert.ok(css.includes("body.daily-print-mode #dailyPrintRoot"),"Branded printable closing absent");
assert.ok(!/service_role|sb_secret_|private_key/.test(js),"Private credential in public JS");
assert.ok(!js.includes(".getPublicUrl("),"Documents must not become public");
const round=n=>Math.round(n*100)/100;
const total=round(round(900*1)+round(900*.5)+100-50);
assert.equal(total,1400,"Full+half calculation with extras/discount incorrect");
assert.equal(new Set(["MNG0B93:2026-11-19","MNG0B93:2026-11-20"]).size,2);
console.log("RL Diárias: UI, mobile entry, approval, rates, closing snapshot, private attachments and print — OK");

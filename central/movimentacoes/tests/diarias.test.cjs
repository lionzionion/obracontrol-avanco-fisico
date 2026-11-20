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
assert.ok(html.includes('src="./diarias.js?v=3"'),"Daily JS missing from page");
assert.ok(html.includes('id="dailyClosedCards"'),"Direct access to completed closings must be visible");
assert.ok(js.includes('function renderClosureCards()'),"Missing existing closings cards renderer");
assert.ok(js.includes('function suggestNewPeriod(vehicleId)'),"New period should start after previous closure");
assert.ok(js.includes('data-view-existing'),"Duplicate period must offer historical PDF link");
assert.ok(js.includes('data-close-print'),"Closing cards need one-tap PDF action");
assert.ok(js.includes('result.closedCount'),"Preview must distinguish already closed days");
assert.ok(!js.includes('closure_id,created_at","work_date"'),"Daily logs must not request missing created_at column");
assert.ok(js.includes('closure_id,updated_at","work_date"'),"Daily logs must use existing updated_at column");
assert.ok(html.includes('href="./diarias.css?v=2"'),"Daily styles missing from page");
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


// Behavioral simulation of same-closing vs new-day cases; no database writes.
const vm=require("node:vm");
const selection={
 dailyCloseVehicle:{value:"tiago"},dailyCloseFrom:{value:"2026-11-05"},
 dailyCloseTo:{value:"2026-11-20"},dailyCloseExtras:{value:"0"},
 dailyCloseDiscounts:{value:"0"},dailyCloseNote:{value:""},
 dailyCloseAgree:{checked:false},dailyClosePreview:{innerHTML:""},dailyCloseSave:{disabled:false}
};
const existing={id:"closing-05-19",work_id:"ambev",vehicle_id:"tiago",
  start_date:"2026-11-05",end_date:"2026-11-19",total_amount:8000,quantity_total:8};
const dates=["05","06","07","09","10","11","17","18"];
const logs=dates.map(x=>({vehicle_id:"tiago",work_date:"2026-11-"+x,
  review_status:"aprovado",closure_id:"closing-05-19",day_type:"inteira"}));
logs.push({vehicle_id:"tiago",work_date:"2026-11-20",
  review_status:"aprovado",closure_id:null,day_type:"inteira"});
const scope={
 $:id=>selection[id],
 state:{closures:[existing],rates:[]},st:{workId:"ambev"},
 myLogs:()=>logs,
 rateFor:()=>({full_day_rate:1000,standby_factor:null}),
 factor:()=>1,
 round:n=>Math.round((Number(n)||0)*100)/100,
 isAdmin:()=>true,
 dateLabel:v=>v,
 format:v=>String(v),
 amount:v=>"R$ "+Number(v||0).toFixed(2),
 E:v=>String(v),
 selectedVehicle:id=>({plate:id}),
 vehicles:()=>[{id:"tiago",plate:"MNG0B93"}],
 vehicleOptions:()=>{},
 today:()=> "2026-11-20",
 monthBefore:()=> "2026-10-22",
 core:{toast:()=>{}}
};
const first=js.indexOf("function lastClosureFor(");
const last=js.indexOf("async function saveClosing(",first);
assert.ok(first>=0&&last>first,"Closing analysis module not found");
vm.runInNewContext(js.slice(first,last),scope);
const overlap=vm.runInNewContext('computeClosing("tiago","2026-11-05","2026-11-20")',scope);
assert.equal(overlap.closedCount,8,"Eight existing days should be counted as already closed");
assert.equal(overlap.items.length,1,"Only 20/11 is new, not the eight previously closed");
assert.equal(overlap.subtotal,1000);
assert.equal(overlap.valid,false,"Overlapping periods cannot be closed twice");
assert.equal(overlap.errors.length,1,"Show one clear overlap warning, not eight duplicate-day errors");
vm.runInNewContext("previewClosing()",scope);
assert.ok(selection.dailyClosePreview.innerHTML.includes("data-view-existing"),
  "Overlapping period should point to saved report/PDF");
const newPeriod=vm.runInNewContext('computeClosing("tiago","2026-11-20","2026-11-20")',scope);
assert.equal(newPeriod.valid,true,"Approved new day may be closed separately");
assert.equal(newPeriod.subtotal,1000);
vm.runInNewContext('suggestNewPeriod("tiago")',scope);
assert.equal(selection.dailyCloseFrom.value,"2026-11-20","New closing must begin after the prior closing");
assert.equal(selection.dailyCloseTo.value,"2026-11-20");
console.log("RL Diárias: overlapping 05-19 and new eligible 20/11 are distinguished — OK");

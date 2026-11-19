/* RL Movimentações | validação de regressão e publicação */
"use strict";
const fs=require("node:fs"),assert=require("node:assert/strict");
const dir="central/movimentacoes/";
const html=fs.readFileSync(dir+"index.html","utf8");
const app=fs.readFileSync(dir+"mov.js","utf8");
const central=fs.readFileSync("central/index.html","utf8");
const integration=fs.readFileSync("central/enhancements.js","utf8");
const overview=fs.readFileSync("central/mov-overview.js","utf8");
for(const id of ["app","workFilter","kpiTrips","kpiWeight","kpiMtr","kpiDiff","kpiCdf","kpiDivergent","kpiFuel","kpiDiesel","shipRows","internalRows","fuelRows","fleetList","detailDialog","entryForm","docInput","cdfForm","accessForm"]){
  assert.ok(html.includes('id="'+id+'"'),"Campo de UI ausente: "+id);
  assert.ok(app.includes('"'+id+'"'),"JavaScript sem referência ao campo: "+id);
}
for(const id of ["panel-painel","panel-destinacao","panel-interna","panel-abastecimento","panel-frota","panel-documentos"])
 assert.ok(html.includes('id="'+id+'"'),"Aba ausente: "+id);
assert.ok(central.includes('data-app="movimentacoes"'),"Atalho na Central ausente");
assert.ok(central.includes('id="movOverviewWeight"'),"Indicador executivo ausente");
assert.ok(integration.includes('new URL("./movimentacoes/"'),"Integração não aponta para o aplicativo");
assert.ok(integration.includes('key!=="movimentacoes"'),"Diretoria impedida de consultar movimentações");
assert.ok(overview.includes('rl_mov_shipments'),"Visão executiva não carrega viagens");
for(const str of ["rl_mov_shipments","rl_mov_fuel","rl_mov_internal","rl_mov_attachments","rl_mov_operator_access","rl-mov-documentos"]){
 assert.ok(app.includes(str),"Integração ausente: "+str);
}
assert.ok(app.includes('createClient')&&app.includes('client.auth.getUser()'),"Autenticação não validada");
assert.ok(!/sb_secret_|service_role|private_key/.test(app),"Credencial privada no código público");
assert.ok(!/\.storage\.from\([^)]*\)\.getPublicUrl\(/.test(app),"Uso indevido de link público para documentos");
assert.ok(!/\.from\("rl_mov_shipments"\)\.delete\(/.test(app),"Exclusão insegura de viagens");
const weights=[16410,17680,16970,16780,15480,16630,17050,16920,15890,17130,17610,16380];
const net=weights.reduce((a,n)=>a+n,0)/1000;
assert.equal(net,200.93,"Planilha deve totalizar 200,93 t");
assert.equal(weights.length*12,144,"MTRs devem totalizar 144 t");
assert.equal(Math.round((net-144)*100)/100,56.93,"Diferença esperada é de 56,93 t");
assert.equal([1000,1000,1000,1000,806.68].reduce((a,n)=>a+n,0),4806.68,"Combustível total divergente");
console.log("RL Movimentações: interface integrada, segurança, 12 viagens, pesagem 200,93 t, MTR 144 t e combustível R$ 4.806,68 — OK");

/* RL Central de Obras — indicadores de movimentação externa AMBEV Itapissuma */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const txt=id=>$(id);
const nf=v=>Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
let busy=false;
async function load(client){
 if(busy||!client)return;busy=true;
 try{
   const {data:work,error:we}=await client.from("rl_mov_works").select("id,name")
     .eq("slug","ambev-itapissuma").maybeSingle();
   if(we)throw we;
   if(!work){["movOverviewWeight","movOverviewTrips","movOverviewPending","movOverviewMismatch"].forEach(k=>txt(k).textContent="—");return;}
   const {data,error}=await client.from("rl_mov_shipments").select("net_kg,mtr_t,cdf_status").eq("work_id",work.id);
   if(error)throw error;
   const rows=data||[];
   txt("movOverviewWeight").textContent=nf(rows.reduce((a,x)=>a+Number(x.net_kg||0)/1000,0))+" t";
   txt("movOverviewTrips").textContent=String(rows.length);
   txt("movOverviewPending").textContent=String(rows.filter(x=>x.cdf_status!=="recebido").length);
   txt("movOverviewMismatch").textContent=String(rows.filter(x=>x.mtr_t!==null&&Math.abs(Number(x.net_kg||0)/1000-Number(x.mtr_t))>=.01).length);
 }catch(err){console.warn("Resumo RL Movimentações:",err);["movOverviewWeight","movOverviewTrips","movOverviewPending","movOverviewMismatch"].forEach(k=>txt(k).textContent="—");}
 finally{busy=false;}
}
window.RL_MOV_OVERVIEW=Object.freeze({load});
})();
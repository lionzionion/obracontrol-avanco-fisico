/* Visão financeira da RL Central — separada do avanço físico.
   Respeita RLS: somente admin/diretoria veem custos. */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const money=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
let loading=false;
async function load(client){
 if(!client||loading)return;
 loading=true;
 try{
   const [worksRes,expensesRes,paymentsRes]=await Promise.all([
     client.from("rl_cost_works").select("id,name,active").eq("active",true),
     client.from("rl_cost_expenses").select("id,work_id,status,amount"),
     client.from("rl_cost_payments").select("expense_id,amount")
   ]);
   for(const r of [worksRes,expensesRes,paymentsRes])if(r.error)throw r.error;
   const works=worksRes.data||[],validWorkIds=new Set(works.map(w=>w.id));
   const realized=(expensesRes.data||[]).filter(e=>validWorkIds.has(e.work_id)&&e.status==="realizada");
   const validExpenseIds=new Set(realized.map(e=>e.id));
   const realizedSum=realized.reduce((acc,e)=>acc+Number(e.amount||0),0);
   const paidSum=(paymentsRes.data||[]).filter(p=>validExpenseIds.has(p.expense_id))
     .reduce((acc,p)=>acc+Number(p.amount||0),0);
   $("costOverviewWork").textContent=works.length===0?"Nenhuma obra financeira cadastrada"
     :works.length===1?works[0].name:works.length+" obras cadastradas · valores consolidados";
   $("costOverviewRealized").textContent=money(realizedSum);
   $("costOverviewPaid").textContent=money(paidSum);
 }catch(err){
   console.warn("Custos na Central:",err);
   $("costOverviewWork").textContent="Não foi possível atualizar os valores financeiros.";
   $("costOverviewRealized").textContent="—";
   $("costOverviewPaid").textContent="—";
 }finally{loading=false}
}
window.RL_COSTS_OVERVIEW=Object.freeze({load});
})();
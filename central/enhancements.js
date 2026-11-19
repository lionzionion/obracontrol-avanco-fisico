/* RL Central v2: leitura física, evolução por serviço e aplicativos integrados.
   Camada de visualização; nenhuma alteração no banco de dados. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = value => String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const nf=(v,d=2)=>Number(v||0).toLocaleString("pt-BR",{maximumFractionDigits:d,minimumFractionDigits:0});
  const pct=v=>nf(v,2)+"%";
  const dateBR=d=>d?new Date(d+"T12:00:00").toLocaleDateString("pt-BR"):"—";
  let snapshot=null;
  let selectedFocus=null;
  let selectedDaily=null;
  function figures(item){
    const goal=Math.max(0,Number(item.planned)||0);
    const executed=Math.max(0,Number(item.executed)||0);
    const approved=Math.max(0,Math.min(executed,Number(item.measured)||0));
    const pending=Math.max(0,executed-approved);
    const remaining=Math.max(0,goal-executed);
    const measuredFraction=goal?Math.min(100,approved/goal*100):0;
    const executionFraction=goal?Math.min(100,executed/goal*100):0;
    return {goal,executed,approved,pending,remaining,measuredFraction,
      pendingFraction:Math.max(0,executionFraction-measuredFraction),
      percent:goal?executed/goal*100:0,over:goal>0&&executed>goal+0.00001};
  }
  function stage(item,small=false){
    const v=figures(item),unit=esc(item.unit);
    const summary="Medido e aprovado: "+nf(v.approved)+" "+unit+"; executado ainda não medido: "+nf(v.pending)+" "+unit+"; saldo físico: "+nf(v.remaining)+" "+unit+".";
    return '<div class="progress-stage'+(small?' small':'')+'" role="img" aria-label="'+esc(summary)+'">'+
      '<span class="segment measured" style="width:'+v.measuredFraction+'%"></span>'+
      '<span class="segment pending" style="width:'+v.pendingFraction+'%"></span></div>';
  }
  function smallStage(item){
    const v=figures(item);
    return '<div class="stage-table"><span class="stage-caption'+(v.over?' has-over':'')+'"><strong>'+pct(v.percent)+'</strong>'+(v.over?' · Acima da meta':'')+'</span>'+
      stage(item,true)+'<span class="stage-caption">Medido '+pct(v.measuredFraction)+'</span></div>';
  }
  function stageWithDetails(item){
    const v=figures(item);
    return stage(item)+'<div class="stage-line"><span>Medido: <strong>'+nf(v.approved)+' '+esc(item.unit)+'</strong></span><strong>Saldo: '+nf(v.remaining)+' '+esc(item.unit)+'</strong></div>';
  }
  function optionHTML(row,selected){
    const label=row.code+" · "+row.description.slice(0,95)+" ("+row.unit+")";
    return '<option value="'+esc(row.id)+'"'+(selected===row.id?' selected':'')+'>'+esc(label)+'</option>';
  }
  function eligibleItems(){
    const active=snapshot.rows.filter(row=>row.executed>0||row.during>0);
    const others=snapshot.rows.filter(row=>!(row.executed>0||row.during>0));
    const byCode=(a,b)=>a.code.localeCompare(b.code,"pt-BR",{numeric:true});
    return [...active.sort(byCode),...others.sort(byCode)];
  }
  function picked(key){
    if(!snapshot.rows.length)return null;
    const rows=eligibleItems();
    const id=key==="focus"?selectedFocus:selectedDaily;
    let item=rows.find(row=>row.id===id);
    if(!item){
      item=rows.find(row=>row.executed>0&&row.executed<row.planned)
        ||rows.find(row=>row.executed>0)||rows[0];
      if(key==="focus")selectedFocus=item.id;
      else selectedDaily=item.id;
    }
    return item;
  }
  function fillSelect(select,item){
    const rows=eligibleItems();
    select.innerHTML=rows.map(row=>optionHTML(row,item.id)).join("");
    select.value=item.id;
  }
  function renderFocus(){
    if(!snapshot)return;
    const item=picked("focus");
    if(!item){$("focusProgress").innerHTML='<p class="empty">Nenhum serviço cadastrado na frente selecionada.</p>';$("focusServiceSelect").innerHTML="";return;}
    fillSelect($("focusServiceSelect"),item);
    const v=figures(item);
    const status=v.over?"Acima da meta":v.goal>0&&v.executed>=v.goal?"Meta física atingida":v.executed>0?"Em execução":"Não iniciado";
    $("focusProgress").innerHTML=
      '<div class="focus-header"><div><span class="item-code">'+esc(item.code+" · "+(item.contract==="gabioes"?"Gabiões e drenagem":"Demolição e terraplenagem"))+'</span><h3>'+esc(item.description)+'</h3></div><span class="status-pill">'+esc(status)+'</span></div>'+
      stage(item)+
      '<div class="stage-line"><span>Execução acumulada: <strong>'+nf(v.executed)+' '+esc(item.unit)+'</strong></span><strong>'+pct(v.percent)+' da meta</strong></div>'+
      '<div class="summary-breakdown" style="margin-top:18px">'+
        '<div class="summary-tile"><small>Medido e aprovado</small><strong>'+nf(v.approved)+' '+esc(item.unit)+'</strong><em>'+pct(v.measuredFraction)+' da meta • registros aprovados</em></div>'+
        '<div class="summary-tile"><small>Executado ainda a medir</small><strong>'+nf(v.pending)+' '+esc(item.unit)+'</strong><em>Produção registrada sem medição aprovada</em></div>'+
        '<div class="summary-tile"><small>Saldo para executar</small><strong>'+nf(v.remaining)+' '+esc(item.unit)+'</strong><em>Meta contratual: '+nf(v.goal)+' '+esc(item.unit)+(v.over?' • excedente '+nf(v.executed-v.goal)+' '+esc(item.unit):'')+'</em></div>'+
      '</div>';
  }
  function renderDaily(){
    if(!snapshot)return;
    const item=picked("daily");
    if(!item){$("dailyChart").innerHTML='<p class="empty">Nenhum serviço selecionado.</p>';$("dailySummary").textContent="";return;}
    fillSelect($("dailyServiceSelect"),item);
    const byDay=new Map();let total=0;
    for(const entry of snapshot.entries){
      if(entry.item_id!==item.id||entry.kind!=="production")continue;
      const qty=Number(entry.qty)||0;
      total+=qty;
      byDay.set(entry.work_date,(byDay.get(entry.work_date)||0)+qty);
    }
    $("dailySummary").innerHTML='<strong>'+nf(total)+' '+esc(item.unit)+'</strong><span>executados no período no serviço '+esc(item.code)+'</span>';
    const DAY=86400000;
    const from=new Date(snapshot.start+"T12:00:00").getTime();
    const to=new Date(snapshot.end+"T12:00:00").getTime();
    const count=Math.min(14,Math.max(1,Math.round((to-from)/DAY)+1));
    const days=[];
    for(let i=count-1;i>=0;i--){
      const date=new Date(to-i*DAY);
      days.push(date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0"));
    }
    const max=Math.max(1,...days.map(day=>byDay.get(day)||0));
    const width=680,height=220,left=43,right=13,top=26,bottom=38;
    const available=width-left-right,band=available/days.length;
    let svg='<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Produção diária de '+esc(item.code)+' em '+esc(item.unit)+'">';
    for(let i=0;i<=3;i++){
      const level=i/3,y=height-bottom-(height-bottom-top)*level;
      svg+='<line class="svg-grid" x1="'+left+'" y1="'+y+'" x2="'+(width-right)+'" y2="'+y+'"></line><text x="3" y="'+(y+3)+'">'+nf(max*level,1)+'</text>';
    }
    days.forEach((day,index)=>{
      const qty=byDay.get(day)||0;
      const boxHeight=(height-top-bottom)*qty/max;
      const x=left+index*band+band*.18,y=height-bottom-boxHeight,barWidth=band*.64;
      svg+='<rect x="'+x+'" y="'+y+'" width="'+barWidth+'" height="'+boxHeight+'" rx="4" fill="'+(qty?'#b2e666':'#264458')+'"><title>'+esc(dateBR(day)+": "+nf(qty)+" "+item.unit)+'</title></rect>';
      if(qty)svg+='<text x="'+(x+barWidth/2)+'" y="'+Math.max(14,y-8)+'" text-anchor="middle">'+nf(qty,1)+'</text>';
      if(index%2===0||count<=6||index===count-1)svg+='<text x="'+(x+barWidth/2)+'" y="'+(height-12)+'" text-anchor="middle">'+day.slice(8)+"/"+day.slice(5,7)+'</text>';
    });
    svg+='</svg>';
    $("dailyChart").innerHTML=svg;
    const hint=$("dailyChart").nextElementSibling;
    if(hint)hint.textContent="Gráfico: últimos "+count+" dias do filtro. O total acima corresponde ao período completo. Unidade: "+item.unit+".";
  }
  function enrichServiceCards(){
    if(!snapshot)return;
    const top=snapshot.rows.filter(r=>r.executed>0).sort((a,b)=>b.percent-a.percent).slice(0,6);
    const container=$("topServices");
    if(!top.length){container.innerHTML='<p class="empty">Nenhuma produção registrada até a data final.</p>';return;}
    container.innerHTML=top.map(item=>{
      const v=figures(item);
      return '<div class="service-mini"><div class="top"><div><b>'+esc(item.code+" · "+item.description)+'</b><span class="sub">'+nf(v.executed)+' de '+nf(v.goal)+' '+esc(item.unit)+'</span></div><small>'+pct(v.percent)+'</small></div>'+
        stageWithDetails(item)+'</div>';
    }).join("");
  }
  function update(value){
    snapshot=value;
    renderFocus();
    renderDaily();
    enrichServiceCards();
  }
  const apps={
    obras:{url:new URL("../",location.href).href,title:"ObraControl",description:"Produção, medições, fotos e lançamentos"},
    pedidos:{url:new URL("../../pedidos-almoco-Rlconstrucoes/app/",location.href).href,title:"RL Pedidos",description:"Gestão de refeições, restaurante e colaboradores"},
    custos:{url:new URL("./custos/",location.href).href,title:"RL Custos de Obras",description:"Controle financeiro, documentos, despesas e pagamentos por obra"}
  };
  function openApp(key){
    // Diretoria consulta os mesmos dados dentro da Central, sem abrir ferramentas
    // operacionais que permitiriam lançamentos ou alterações.
    if(document.body.classList.contains("viewer")&&key!=="custos"){
      const section=key==="obras"?"production":"food";
      document.querySelector('.nav-btn[data-screen="'+section+'"]')?.click();
      return;
    }
    const entry=apps[key];
    if(!entry||$("application").hidden)return;
    if(new URL(entry.url).origin!==location.origin)return;
    const frame=$("workFrame");
    $("main").hidden=true;$("workspace").hidden=false;
    $("workTitle").textContent=entry.title;
    $("workSubtitle").textContent=entry.description+" · Sessão compartilhada";
    if(window.RL_CENTRAL_ICONS?.icon)$("workIcon").innerHTML=window.RL_CENTRAL_ICONS.icon(key==="obras"?"production":key==="custos"?"chart":"food");
    frame.title=entry.title+" dentro da Central";
    if(frame.getAttribute("src")!==entry.url)frame.src=entry.url;
    $("workExternal").href=entry.url;
    document.querySelectorAll(".nav-btn[data-screen]").forEach(n=>n.classList.remove("active"));
    document.querySelectorAll(".app-button[data-app]").forEach(n=>n.classList.toggle("active",n.dataset.app===key));
    window.scrollTo(0,0);
  }
  function closeApp(){
    $("workspace").hidden=true;
    $("main").hidden=false;
    document.querySelectorAll(".app-button[data-app]").forEach(n=>n.classList.remove("active"));
    const current=document.querySelector('[data-screen="overview"]');
    if(current){
      current.click();
    }
  }
  function wire(){
    $("focusServiceSelect").addEventListener("change",e=>{selectedFocus=e.target.value;renderFocus();});
    $("dailyServiceSelect").addEventListener("change",e=>{selectedDaily=e.target.value;renderDaily();});
    document.querySelectorAll(".app-button[data-app]").forEach(node=>node.addEventListener("click",()=>openApp(node.dataset.app)));
    $("openCostsFromOverview")?.addEventListener("click",()=>openApp("custos"));
    $("workBack").addEventListener("click",closeApp);
    $("logoutBtn").addEventListener("click",()=>{$("workFrame").removeAttribute("src");$("workspace").hidden=true;$("main").hidden=false;});
  }
  window.RL_CENTRAL_ENHANCE=Object.freeze({update,stage,smallStage});
  wire();
})();

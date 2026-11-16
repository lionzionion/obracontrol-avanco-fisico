/* RL Central de Obras • consulta gerencial somente leitura.
   Reaproveita Auth/RLS do RL Pedidos e as tabelas obc_* do ObraControl.
   ATENÇÃO: a chave abaixo é publishable (pública). Nunca incluir service_role. */
(() => {
  "use strict";
  const PROJECT_URL = "https://dpmofhdaefcqxohuhkfr.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_JerHh05UE8RcnXJ91Ypuyg_IWdiAhh5";
  const ENTRY_GROUPS = {gabioes:"Gabiões e drenagem",demolicao:"Demolição e terraplenagem"};
  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const numeric = (value, decimals=2) => Number(value||0).toLocaleString("pt-BR",{minimumFractionDigits:0,maximumFractionDigits:decimals});
  const money = value => Number(value||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const pct = value => numeric(value,2)+"%";
  const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const dayLabel = value => value ? new Date(value+"T12:00:00").toLocaleDateString("pt-BR") : "—";
  const empty = message => '<p class="empty">'+escapeHTML(message)+'</p>';
  const client = window.supabase?.createClient(PROJECT_URL,PUBLISHABLE_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  const state = {
    profile:null,screen:"overview",start:"",end:"",contract:"all",
    items:[],entries:[],configs:[],photos:[],orders:[],profiles:[],rdos:[],rdoError:"",
    signedPhotos:new Map(),loading:false,ready:false,staffSummary:[],directorCredentials:null
  };

  function dateInRecife(date) {
    const parts = new Intl.DateTimeFormat("en-US",{timeZone:"America/Recife",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
    const take = type => parts.find(part=>part.type===type)?.value;
    return take("year")+"-"+take("month")+"-"+take("day");
  }
  function defaultRange() {
    const now = new Date();
    state.end = dateInRecife(now);
    state.start = dateInRecife(new Date(now.getTime()-29*86400000));
    $("startDate").value=state.start;
    $("endDate").value=state.end;
    $("contractFilter").value="all";
    state.contract="all";
  }
  function setNotice(message="",isError=false) {
    $("notice").textContent=message;
    $("notice").classList.toggle("error",isError);
  }
  function setLoginMessage(message) { $("loginError").textContent=message; }
  function showLogin(message="") {
    $("application").hidden=true;
    $("authGate").hidden=false;
    setLoginMessage(message);
    state.profile=null;
    state.ready=false;
    window.RL_RDO_BOARD?.reset?.();
    state.directorCredentials=null;
    if($("directorResult"))$("directorResult").hidden=true;
    if($("passwordSettingsButton"))$("passwordSettingsButton").hidden=true;
    if($("directorCreatedPassword"))$("directorCreatedPassword").textContent="";
    document.body.classList.remove("viewer");
  }
  function showApp() {
    $("authGate").hidden=true;
    $("application").hidden=false;
    const isViewer=state.profile.role==="diretoria";
    document.body.classList.toggle("viewer",isViewer);
    $("directorNav").hidden=isViewer;
    $("passwordSettingsButton").hidden=!isViewer;
    $("userLabel").textContent=state.profile.display_name+(isViewer?" · DIRETORIA":" · ADM");
  }
  async function checkAccess(session) {
    if(!session?.user){showLogin();return false;}
    const {data,error}=await client.from("profiles")
      .select("id,display_name,role,active").eq("id",session.user.id).single();
    if(error||!data||data.active!==true||!["admin","diretoria"].includes(data.role)){
      showLogin("Somente contas administrativas ou da Diretoria podem consultar este painel.");
      return false;
    }
    state.profile=data;
    showApp();
    return true;
  }
  async function signIn(event) {
    event.preventDefault();
    if(!client) return setLoginMessage("Biblioteca de conexão indisponível. Atualize a página.");
    const button=$("loginBtn");
    button.disabled=true;
    setLoginMessage("");
    try {
      const entered=$("login").value.toLowerCase().trim();
      const email=entered.includes("@")?entered:entered+"@acesso.rl-pedidos.invalid";
      const {data,error}=await client.auth.signInWithPassword({email,password:$("password").value});
      if(error)throw error;
      $("password").value="";
      if(await checkAccess(data.session)) await loadAll();
    } catch (error) {
      console.error("Falha de autenticação:",error);
      setLoginMessage("Não foi possível entrar. Confira usuário e senha.");
    } finally {button.disabled=false;}
  }
  async function signOut() {
    try {await client.auth.signOut();}catch(e){console.warn("Saída:",e);}
    state.items=[];state.entries=[];state.orders=[];state.photos=[];state.profiles=[];state.rdos=[];state.rdoError="";state.signedPhotos.clear();
    window.RL_RDO_BOARD?.reset?.();
    showLogin("Sessão encerrada.");
  }
  async function fetchAll(table,columns,sort) {
    const result=[];
    for(let offset=0;offset<100000;offset+=1000){
      const {data,error}=await client.from(table).select(columns)
        .order(sort,{ascending:false}).range(offset,offset+999);
      if(error)throw new Error("Falha ao consultar "+table+": "+error.message);
      result.push(...(data||[]));
      if(!data||data.length<1000) return result;
    }
    throw new Error("Limite de registros excedido em "+table+". Revise a paginação.");
  }
  async function loadAll() {
    if(!state.profile||state.loading)return;
    state.loading=true;
    $("refreshBtn").disabled=true;
    setNotice("Sincronizando os dados da nuvem…");
    try {
      const viewer=state.profile.role==="diretoria";
      const [items,entries,configs,photos,rawOrders,profiles,rdoResult]=await Promise.all([
        fetchAll("obc_items","id,contract,code,description,unit,planned,group_code","created_at"),
        fetchAll("obc_entries","id,item_id,kind,work_date,qty,front,author,note,created_at","created_at"),
        fetchAll("obc_configs","item_id,unit,planned,updated_at","updated_at"),
        fetchAll("obc_photos","id,entry_id,item_id,path,name,created_at","created_at"),
        viewer?client.rpc("rl_central_summary"):fetchAll("orders","id,order_day,meal,status,archived,price,company","order_day"),
        viewer?Promise.resolve([]):fetchAll("profiles","id,username,display_name,role,active,company","created_at"),
        fetchAll("obc_rdos","id,rdo_no,work_date,status,engineer_name,reviewer_name,approved_name,approved_at,submitted_at,pdf_path,updated_at","work_date")
          .then(rows=>({rows,error:""})).catch(error=>({rows:[],error:String(error.message||error)}))
      ]);
      if(viewer&&rawOrders.error)throw rawOrders.error;
      const summary=viewer?(rawOrders.data||{}):null;
      const orders=viewer?(summary.orders||[]).map(g=>({
        order_day:g.order_day,meal:g.meal,company:g.company,status:"confirmado",
        archived:false,count:Number(g.count)||0,price:Number(g.total)||0
      })):rawOrders;
      const staffSummary=viewer?(summary.staff||[]):[];
      if(!window.RL_QUANTITY)throw new Error("O módulo de conversão de verbas não foi carregado.");
      const itemById=new Map(items.map(item=>[item.id,item]));
      const configById=new Map(configs.map(config=>[config.item_id,config]));
      // Exibição somente: o ObraControl registra os itens VB em porcentagem de 0 a 100.
      const normalizedEntries=entries.map(entry=>{
        const item=itemById.get(entry.item_id),config=configById.get(entry.item_id);
        return {...entry,qty:window.RL_QUANTITY.quantity(item,config,entry.qty)};
      });
      Object.assign(state,{items,entries:normalizedEntries,configs,photos,orders,profiles,staffSummary,rdos:rdoResult.rows,rdoError:rdoResult.error,ready:true});
      state.signedPhotos.clear();
      renderEverything();
      $("syncedAt").textContent="Sincronizado em "+new Date().toLocaleString("pt-BR",{timeZone:"America/Recife"});
      setNotice("");
    }catch(error){
      console.error("Sincronização:",error);
      setNotice("Erro ao carregar dados. Confira a conexão e as permissões do Supabase. "+error.message,true);
    }finally{state.loading=false;$("refreshBtn").disabled=false;}
  }
  const itemMap = () => new Map(state.items.map(i=>[i.id,i]));
  const matchingItem = item => state.contract==="all"||item.contract===state.contract;
  const itemsInScope = () => state.items.filter(matchingItem);
  const periodMatch = date => Boolean(date&&date>=state.start&&date<=state.end);
  const entryAll = () => {
    const ids=new Set(itemsInScope().map(i=>i.id));
    return state.entries.filter(e=>ids.has(e.item_id)&&e.work_date<=state.end);
  };
  const periodEntries = () => entryAll().filter(e=>periodMatch(e.work_date));
  const periodPhotos = () => {
    const eids=new Set(periodEntries().map(e=>e.id));
    return state.photos.filter(p=>eids.has(p.entry_id));
  };
  const validOrders = () => state.orders.filter(o=>periodMatch(o.order_day)&&
    o.status!=="cancelado"&&!o.archived);
  const orderCount = rows=>rows.reduce((sum,o)=>sum+(Number(o.count)||1),0);
  const staffCount = ()=>state.profile?.role==="diretoria"
    ?state.staffSummary.reduce((sum,g)=>sum+(Number(g.count)||0),0)
    :state.profiles.filter(p=>p.active&&p.role==="colaborador").length;
  const staffCountByCompany = company=>state.profile?.role==="diretoria"
    ?state.staffSummary.filter(g=>(g.company||"RL")===company).reduce((sum,g)=>sum+(Number(g.count)||0),0)
    :state.profiles.filter(p=>p.active&&p.role==="colaborador"&&(p.company||"RL")===company).length;
  function serviceRows() {
    const all=entryAll();
    const period=periodEntries();
    const sums=new Map();
    const during=new Map();
    for(const e of all) {
      const key=e.item_id;
      const value=sums.get(key)||{production:0,measurement:0};
      value[e.kind]=(value[e.kind]||0)+safeNumber(e.qty);
      sums.set(key,value);
    }
    for(const e of period)if(e.kind==="production")during.set(e.item_id,(during.get(e.item_id)||0)+safeNumber(e.qty));
    const cfg=new Map(state.configs.map(c=>[c.item_id,c]));
    return itemsInScope().map(i=>{
      const c=cfg.get(i.id);
      const record=sums.get(i.id)||{production:0,measurement:0};
      const goal=window.RL_QUANTITY.goal(i,c);
      const planned=goal.planned;
      const executed=record.production;
      return {...i,planned,unit:goal.unit,executed,measured:record.measurement,
        during:during.get(i.id)||0,percent:planned>0?executed/planned*100:0};
    }).sort((a,b)=>b.executed-a.executed||a.code.localeCompare(b.code,"pt-BR"));
  }
  // Para um item VB controlado em percentual, 38 unidades brutas viram 0,38 VB.
  // Mantém a precisão do apontamento (ex.: 0,01% = 0,0001 VB).
  function itemDisplayUnit(item) {
    if(!item)return "";
    const config=state.configs.find(c=>c.item_id===item.id);
    return window.RL_QUANTITY.goal(item,config).unit;
  }
  function formatExecuted(qty,unit) {
    return numeric(qty,String(unit||"").toLowerCase()==="vb"?4:2);
  }
  function progressBar(value,cyan=false) {
    const width=Math.max(0,Math.min(100,safeNumber(value)));
    return '<div class="track"><div class="fill'+(cyan?' cyan':'')+'" style="width:'+width+'%"></div></div>';
  }
  function renderStatsRow(label,value,share,total,cyan=false) {
    const n=total>0?share/total*100:0;
    return '<div class="stat-row"><div class="line"><span>'+escapeHTML(label)+'</span><strong>'+escapeHTML(value)+'</strong></div>'+progressBar(n,cyan)+'</div>';
  }
  function overviewStats(rows,entries,photos,orders) {
    const started=rows.filter(r=>r.executed>0).length;
    const measured=rows.filter(r=>r.measured>0).length;
    const completed=rows.filter(r=>r.planned>0&&r.executed>=r.planned).length;
    const periodProduction=entries.filter(e=>e.kind==="production");
    $("kpiServices").textContent=numeric(started)+" / "+numeric(rows.length);
    $("kpiServicesSub").textContent=numeric(completed)+" concluídos nas metas cadastradas";
    $("kpiEntries").textContent=numeric(periodProduction.length);
    $("kpiEntriesSub").textContent="Lançamentos de produção no período";
    $("kpiPhotos").textContent=numeric(photos.length);
    $("kpiMeals").textContent=numeric(orderCount(orders));
    $("kpiMealsSub").textContent="Pedidos ativos RL e Solutio";
    $("healthStats").innerHTML=[
      renderStatsRow("Serviços iniciados",numeric(started)+" de "+numeric(rows.length),started,rows.length),
      renderStatsRow("Serviços na meta",numeric(completed)+" de "+numeric(rows.length),completed,rows.length),
      renderStatsRow("Serviços com medição",numeric(measured)+" de "+numeric(rows.length),measured,rows.length,true),
      renderStatsRow("Serviços sem execução",numeric(rows.length-started)+" de "+numeric(rows.length),rows.length-started,rows.length,true)
    ].join("");
    const top=rows.filter(r=>r.executed>0).sort((a,b)=>b.percent-a.percent).slice(0,6);
    $("topServices").innerHTML=top.length?top.map(r=>
      '<div class="service-mini"><div class="top"><div><b>'+escapeHTML(r.code+" · "+r.description)+'</b><span class="sub">'+numeric(r.executed)+' / '+numeric(r.planned)+' '+escapeHTML(r.unit)+'</span></div><small>'+pct(r.percent)+'</small></div>'+(window.RL_CENTRAL_ENHANCE?.stage?.(r)||progressBar(r.percent))+'</div>'
    ).join(""):empty("Ainda não existem serviços executados neste recorte.");
    const map=itemMap();
    const recents=entries.filter(e=>e.kind==="production").slice()
      .sort((a,b)=>b.work_date.localeCompare(a.work_date)||b.created_at.localeCompare(a.created_at)).slice(0,6);
    $("recentEntries").innerHTML=recents.length?recents.map(e=>{
      const i=map.get(e.item_id);
      return '<div class="recent"><div class="recent-icon">▤</div><div class="recent-main"><b>'+escapeHTML((i?.code||"Item")+" · "+formatExecuted(e.qty,itemDisplayUnit(i))+" "+itemDisplayUnit(i))+'</b><small>'+escapeHTML(dayLabel(e.work_date)+" • "+(e.front||"Frente não informada")+" • "+(e.author||"Responsável não informado"))+'</small></div></div>';
    }).join(""):empty("Sem produção lançada neste período.");
  }
  function renderChart(entries) {
    const dayMs=86400000;
    const end=new Date(state.end+"T12:00:00").getTime();
    const begin=new Date(state.start+"T12:00:00").getTime();
    const size=Math.min(14,Math.max(1,Math.round((end-begin)/dayMs)+1));
    const days=[];
    for(let t=size-1;t>=0;t--){
      const local=new Date(end-t*dayMs);
      days.push(local.getFullYear()+"-"+String(local.getMonth()+1).padStart(2,"0")+"-"+String(local.getDate()).padStart(2,"0"));
    }
    const counts=new Map();
    for(const e of entries)if(e.kind==="production")counts.set(e.work_date,(counts.get(e.work_date)||0)+1);
    const max=Math.max(1,...days.map(d=>counts.get(d)||0));
    const w=650,h=222,l=33,r=16,t=19,b=35;
    const x=i=>l+i*(w-l-r)/Math.max(1,days.length-1);
    const y=n=>t+(h-t-b)*(1-n/max);
    const points=days.map((d,i)=>[x(i),y(counts.get(d)||0)]);
    const line=points.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
    let svg='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Número de lançamentos por dia nos últimos '+size+' dias do filtro">';
    for(let j=0;j<=4;j++){
      const n=max*j/4;
      svg+='<line class="svg-grid" x1="'+l+'" y1="'+y(n)+'" x2="'+(w-r)+'" y2="'+y(n)+'"></line>';
      svg+='<text x="3" y="'+(y(n)+4)+'">'+numeric(n,0)+'</text>';
    }
    svg+='<path class="svg-line" d="'+line+'"></path>';
    for(let i=0;i<days.length;i++){
      if(i===0||i===days.length-1||i%3===0)svg+='<text x="'+x(i)+'" text-anchor="middle" y="'+(h-11)+'">'+days[i].slice(8)+"/"+days[i].slice(5,7)+'</text>';
      if(counts.get(days[i]))svg+='<circle class="svg-dot" cx="'+x(i)+'" cy="'+y(counts.get(days[i]))+'" r="5"><title>'+escapeHTML(dayLabel(days[i])+": "+counts.get(days[i])+" lançamentos")+'</title></circle>';
    }
    svg+='</svg>';
    $("activityChart").innerHTML=svg;
  }
  function renderProduction(rows,entries) {
    const term=$("serviceSearch").value.toLocaleLowerCase("pt-BR").trim();
    const visible=rows.filter(r=>(r.code+" "+r.description+" "+r.unit).toLocaleLowerCase("pt-BR").includes(term));
    $("serviceCount").textContent=visible.length+" serviços";
    $("serviceRows").innerHTML=visible.length?visible.map(r=>
      '<tr><td><span class="service-id">'+escapeHTML(r.code)+'</span><span class="service-name">'+escapeHTML(r.description)+'</span></td><td>'+escapeHTML(r.unit)+'</td><td class="numeric">'+numeric(r.planned)+'</td><td class="numeric">'+numeric(r.executed)+'</td><td class="numeric">'+numeric(r.measured)+'</td><td>'+(window.RL_CENTRAL_ENHANCE?.smallStage?.(r)||'<div class="meter"><span>'+pct(r.percent)+'</span>'+progressBar(r.percent)+'</div>')+'</td><td class="numeric">'+numeric(r.during)+'</td></tr>'
    ).join(""):'<tr><td colspan="7">'+empty("Nenhum serviço encontrado.")+'</td></tr>';
    const map=itemMap();
    const sorted=entries.slice().sort((a,b)=>b.work_date.localeCompare(a.work_date)||b.created_at.localeCompare(a.created_at));
    $("dailyRows").innerHTML=sorted.length?sorted.slice(0,150).map(e=>{
      const i=map.get(e.item_id);
      return '<tr><td>'+escapeHTML(dayLabel(e.work_date))+'</td><td>'+escapeHTML((i?.code||"")+' · '+(i?.description||"Item removido")).slice(0,135)+'</td><td class="numeric">'+formatExecuted(e.qty,itemDisplayUnit(i))+' '+escapeHTML(itemDisplayUnit(i))+'</td><td>'+escapeHTML(e.front||"—")+'</td><td>'+escapeHTML(e.author||"—")+'</td><td>'+escapeHTML(e.kind==="measurement"?"Medição":"Produção")+'</td></tr>';
    }).join(""):'<tr><td colspan="6">'+empty("Sem lançamentos neste período.")+'</td></tr>';
  }
  async function ensureSignedPhotos() {
    const photos=periodPhotos();
    const missing=photos.filter(p=>p.path&&!state.signedPhotos.has(p.id));
    if(!missing.length) return;
    for(let start=0;start<missing.length;start+=40){
      const chunk=missing.slice(start,start+40);
      const {data,error}=await client.storage.from("obc-fotos").createSignedUrls(chunk.map(p=>p.path),1800);
      if(error){console.warn("Fotos:",error);setNotice("Algumas fotos não puderam ser carregadas.",true);return;}
      for(let i=0;i<chunk.length;i++)if(data?.[i]?.signedUrl)state.signedPhotos.set(chunk[i].id,data[i].signedUrl);
    }
  }
  function renderPhotos(photos) {
    const map=itemMap(),entries=new Map(state.entries.map(e=>[e.id,e]));
    $("photoCount").textContent=photos.length+" imagens";
    $("photoGrid").innerHTML=photos.length?photos.map(p=>{
      const e=entries.get(p.entry_id),item=map.get(p.item_id);
      const url=state.signedPhotos.get(p.id);
      return url?'<button type="button" class="photo-card" data-photo="'+escapeHTML(p.id)+'"><img loading="lazy" src="'+escapeHTML(url)+'" alt="Registro fotográfico '+escapeHTML(item?.code||"")+'"><div class="photo-meta"><b>'+escapeHTML((item?.code||"")+" · "+(item?.description||p.name))+'</b><small>'+escapeHTML(dayLabel(e?.work_date)+" · "+(e?.front||"Obra AMBEV"))+'</small></div></button>'
      :'<div class="photo-card"><div class="photo-meta"><b>'+escapeHTML(p.name||"Foto protegida")+'</b><small>Prévia indisponível</small></div></div>';
    }).join(""):empty("Não existem fotos vinculadas aos lançamentos deste período.");
  }
  function renderFood(orders) {
    const total=orderCount(orders);
    const cost=orders.reduce((sum,o)=>sum+safeNumber(o.price),0);
    $("foodCount").textContent=numeric(total);
    $("foodCost").textContent=money(cost);
    $("staffCount").textContent=numeric(staffCount());
    $("foodByCompany").innerHTML=["RL","SOLUTIO"].map((co,i)=>{
      const list=orders.filter(o=>(o.company||"RL")===co);
      const sum=list.reduce((a,o)=>a+safeNumber(o.price),0);
      const count=orderCount(list),people=staffCountByCompany(co);
      return renderStatsRow(co==="RL"?"RL Construções":"Solutio",count+" refeições · "+money(sum)+" · "+people+" cadastrados",count,total,i===1);
    }).join("");
    $("foodByMeal").innerHTML=["almoco","cafe"].map((meal,i)=>{
      const list=orders.filter(o=>o.meal===meal);
      const count=orderCount(list);
      return renderStatsRow(meal==="almoco"?"Almoços":"Cafés da manhã",count+" pedidos",count,total,i===1);
    }).join("");
  }
  function renderReport(rows,entries,photos,orders) {
    $("reportPeriod").textContent="Período: "+dayLabel(state.start)+" a "+dayLabel(state.end)+" | "+(ENTRY_GROUPS[state.contract]||"Todas as frentes");
    const created=entries.filter(e=>e.kind==="production"),started=rows.filter(r=>r.executed>0);
    const map=itemMap(),byEntry=new Map(state.entries.map(e=>[e.id,e]));
    const top=rows.filter(r=>r.during>0).sort((a,b)=>b.during-a.during).slice(0,12);
    const recent=created.slice().sort((a,b)=>b.work_date.localeCompare(a.work_date)).slice(0,12);
    const mealCost=orders.reduce((acc,o)=>acc+safeNumber(o.price),0);
    const serviceTable=top.length?'<table><thead><tr><th>Item / Serviço</th><th class="numeric">Produção no período</th><th class="numeric">Execução acumulada</th><th class="numeric">Meta</th></tr></thead><tbody>'+
      top.map(r=>'<tr><td>'+escapeHTML(r.code+" · "+r.description)+'</td><td class="numeric">'+numeric(r.during)+' '+escapeHTML(r.unit)+'</td><td class="numeric">'+numeric(r.executed)+' '+escapeHTML(r.unit)+'</td><td class="numeric">'+pct(r.percent)+'</td></tr>').join("")+'</tbody></table>':empty("Sem produção no período selecionado.");
    const photoHtml=photos.slice(0,6).map(p=>{
      const url=state.signedPhotos.get(p.id);
      if(!url)return "";
      const e=byEntry.get(p.entry_id),i=map.get(p.item_id);
      return '<figure><img src="'+escapeHTML(url)+'" alt="Foto '+escapeHTML(i?.code||"")+'"><figcaption>'+escapeHTML((i?.code||"")+" · "+dayLabel(e?.work_date))+'</figcaption></figure>';
    }).join("");
    $("reportContent").innerHTML='<div class="report-kpis">'+
      '<div class="report-stat"><b>'+numeric(started.length)+'/'+numeric(rows.length)+'</b><small>Serviços iniciados</small></div>'+
      '<div class="report-stat"><b>'+numeric(created.length)+'</b><small>Apontamentos de produção</small></div>'+
      '<div class="report-stat"><b>'+numeric(photos.length)+'</b><small>Fotografias</small></div>'+
      '<div class="report-stat"><b>'+numeric(orderCount(orders))+'</b><small>Refeições válidas</small></div></div>'+
      '<h3>1. Principais produções do período</h3>'+serviceTable+
      '<h3>2. Últimos registros de execução</h3>'+
      (recent.length?'<table><thead><tr><th>Data</th><th>Serviço</th><th class="numeric">Quantidade</th></tr></thead><tbody>'+recent.map(e=>{
        const item=map.get(e.item_id);
        return '<tr><td>'+escapeHTML(dayLabel(e.work_date))+'</td><td>'+escapeHTML((item?.code||"")+" · "+(e.front||item?.description||""))+'</td><td class="numeric">'+formatExecuted(e.qty,itemDisplayUnit(item))+' '+escapeHTML(itemDisplayUnit(item))+'</td></tr>';
      }).join("")+'</tbody></table>':empty("Sem apontamentos."))+
      '<h3>3. Registro fotográfico (até 6 imagens)</h3>'+(photoHtml?'<div class="report-pics">'+photoHtml+'</div>':empty("Nenhuma fotografia acessível neste período."))+
      '<h3>4. Alimentação e apoio administrativo</h3><p>'+numeric(orderCount(orders))+' refeições válidas, subtotal de '+money(mealCost)+' (sem fretes). Cadastro: '+numeric(staffCount())+' colaboradores ativos; este total não confirma presença em obra.</p>'+
      '<h3>5. Ressalvas técnicas</h3><p>O progresso é calculado individualmente por serviço e meta; não existe percentual global ponderado ou Curva S homologada neste relatório. Medições e quantidades devem ser conferidas com os documentos contratuais.</p>';
  }
  function renderEverything() {
    if(!state.ready)return;
    const rows=serviceRows(),entries=periodEntries(),photos=periodPhotos(),orders=validOrders();
    overviewStats(rows,entries,photos,orders);
    renderChart(entries);
    renderProduction(rows,entries);
    renderPhotos(photos);
    renderFood(orders);
    renderReport(rows,entries,photos,orders);
    window.RL_RDO_BOARD?.setData?.(state.rdos,client,state.rdoError);
    window.RL_CENTRAL_ENHANCE?.update?.({rows,entries,photos,orders,start:state.start,end:state.end,contract:state.contract});
  }
  async function navigate(screen) {
    $("workspace").hidden=true;
    $("main").hidden=false;
    document.querySelectorAll(".app-button[data-app]").forEach(b=>b.classList.remove("active"));
    state.screen=screen;
    if(screen==="rdos")window.RL_RDO_BOARD?.show?.();
    else window.RL_RDO_BOARD?.hide?.();
    for(const button of document.querySelectorAll("[data-screen]"))button.classList.toggle("active",button.dataset.screen===screen);
    for(const section of document.querySelectorAll(".screen")){
      const current=section.id==="screen-"+screen;
      section.hidden=!current;
      section.classList.toggle("active",current);
    }
    const titles={
      overview:["Visão executiva","O que foi executado, registrado e acompanhado na obra."],
      production:["Produção e medições","Quantidade diária, acumulado, metas e medições físicas."],
      photos:["Galeria da obra","Evidências fotográficas vinculadas aos lançamentos."],
      rdos:["Relatórios Diários de Obra","Histórico, aprovação, atividades, fotos e PDFs arquivados."],
      food:["Alimentação e equipe","Refeições por empresa e colaboradores cadastrados."],
      report:["Relatório gerencial","Documento consolidado, pronto para impressão ou PDF."],
      access:["Acesso da Diretoria","Criar ou redefinir credenciais exclusivas, sem permissão de edição."]
    };
    $("pageTitle").textContent=titles[screen][0];
    $("pageSubtitle").textContent=titles[screen][1];
    if((screen==="photos"||screen==="report")&&state.ready){
      await ensureSignedPhotos();
      renderPhotos(periodPhotos());
      renderReport(serviceRows(),periodEntries(),periodPhotos(),validOrders());
    }
  }
  function applyFilters() {
    const start=$("startDate").value,end=$("endDate").value;
    if(!start||!end||start>end)return setNotice("Informe um período válido: data inicial não pode ser maior que a final.",true);
    state.start=start;state.end=end;state.contract=$("contractFilter").value;
    setNotice("");
    renderEverything();
    if(state.screen==="photos"||state.screen==="report")navigate(state.screen);
  }
  function exportCSV() {
    const data=serviceRows(),header=["codigo","servico","frente","unidade","meta","executado_acumulado","medido_acumulado","percentual_executado","producao_no_periodo"];
    const cell=value=>'"'+String(value??"").replace(/"/g,'""')+'"';
    const lines=[header.map(cell).join(";"),...data.map(r=>[r.code,r.description,ENTRY_GROUPS[r.contract]||r.contract,r.unit,r.planned,r.executed,r.measured,r.percent,r.during].map(cell).join(";"))];
    const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="RL_Central_Producao_"+state.start+"_"+state.end+".csv";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  async function printReport() {
    if(!state.ready)return setNotice("Aguarde a sincronização para emitir o relatório.",true);
    await navigate("report");
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    window.print();
  }
  async function openPhoto(event) {
    const button=event.target.closest("[data-photo]");
    if(!button)return;
    const photo=state.photos.find(p=>p.id===button.dataset.photo);
    if(!photo)return;
    const url=state.signedPhotos.get(photo.id);
    if(!url)return;
    const entry=state.entries.find(e=>e.id===photo.entry_id);
    const item=state.items.find(i=>i.id===photo.item_id);
    $("largePhoto").src=url;
    $("photoCaption").textContent=(item?.code||"")+" · "+dayLabel(entry?.work_date)+" · "+(entry?.front||"AMBEV Itapissuma")+" · "+(photo.name||"Foto da obra");
    $("photoModal").showModal();
  }

  // O servidor gera a senha e o front-end a mostra apenas nesta sessão administrativa.
  async function provisionDirector(event){
    event.preventDefault();
    if(state.profile?.role!=="admin")return;
    const username=$("directorUsername").value.trim().toLowerCase();
    const display_name=$("directorName").value.trim();
    const company=$("directorCompany").value;
    if(!/^[a-z][a-z0-9._-]{2,29}$/.test(username)||display_name.length<3){
      $("directorFeedback").textContent="Confira o usuário e o nome informado.";return;
    }
    const button=$("directorSubmitBtn");
    button.disabled=true;
    $("directorResult").hidden=true;
    state.directorCredentials=null;
    $("directorCreatedPassword").textContent="";
    $("directorFeedback").textContent="Solicitando credenciais ao servidor…";
    try{
      const existing=state.profiles.find(p=>p.username===username);
      if(existing&&existing.role!=="diretoria")throw new Error("Este usuário já pertence a outro perfil. Escolha outro nome.");
      const body=existing
        ?{action:"reset_password",id:existing.id,password:"AUTO"}
        :{action:"create",username,display_name,company,role:"diretoria",job_title:"Diretoria",password:"AUTO"};
      const {data,error}=await client.functions.invoke("manage-users",{body});
      if(error)throw error;
      if(data?.error)throw new Error(data.error);
      if(!data?.password)throw new Error("O servidor não retornou a senha. Atualize e tente novamente.");
      state.directorCredentials={username,password:data.password};
      $("directorCreatedUser").textContent=username;
      $("directorCreatedPassword").textContent=data.password;
      $("directorResult").hidden=false;
      $("directorFeedback").textContent=existing?"Senha de acesso redefinida. A anterior deixou de funcionar.":"Usuário da Diretoria criado no Supabase.";
      if(!existing)await loadAll();
    }catch(error){
      console.error("Criação do acesso gerencial:",error);
      $("directorFeedback").textContent="Não foi possível gerar o acesso: "+(error.message||"falha de conexão");
    }finally{button.disabled=false;}
  }
  async function copyDirectorCredentials(){
    const c=state.directorCredentials;
    if(!c)return;
    const payload="RL Engenharia | Central de Controle de Obras\n"+
      "Link: https://lionzionion.github.io/obracontrol-avanco-fisico/central/\n"+
      "Usuário: "+c.username+"\nSenha temporária: "+c.password+
      "\nPerfil: Diretoria (somente leitura). Altere a senha após entrar.";
    try{
      await navigator.clipboard.writeText(payload);
      $("directorFeedback").textContent="Credenciais copiadas. Envie somente em conversa privada ao destinatário.";
    }catch(error){
      $("directorFeedback").textContent="Não foi possível copiar automaticamente. Copie o usuário e a senha exibidos acima.";
    }
  }
  async function changeOwnPassword(event){
    event.preventDefault();
    if(!state.profile)return;
    const next=$("newPass").value,confirm=$("confirmPass").value;
    const status=$("passwordFeedback");
    if(next.length<12||next.length>72||!/[A-Z]/.test(next)||!/[a-z]/.test(next)||!/[0-9]/.test(next)||!/[^A-Za-z0-9]/.test(next)){
      status.textContent="Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.";return;
    }
    if(next!==confirm){status.textContent="As senhas não são iguais.";return;}
    $("savePassword").disabled=true;
    try{
      const {error}=await client.auth.updateUser({password:next});
      if(error)throw error;
      $("passwordForm").reset();
      $("passwordDialog").close();
      setNotice("Sua senha foi alterada com sucesso.");
    }catch(error){status.textContent="Não foi possível alterar a senha: "+error.message;}
    finally{$("savePassword").disabled=false;}
  }
  async function init() {
    defaultRange();
    $("loginForm").addEventListener("submit",signIn);
    $("directorCreateForm").addEventListener("submit",provisionDirector);
    $("directorCopyBtn").addEventListener("click",copyDirectorCredentials);
    $("passwordSettingsButton").addEventListener("click",()=>{
      $("passwordFeedback").textContent="";
      $("passwordDialog").showModal();
    });
    $("cancelPassword").addEventListener("click",()=>$("passwordDialog").close());
    $("passwordForm").addEventListener("submit",changeOwnPassword);
    $("logoutBtn").addEventListener("click",signOut);
    $("refreshBtn").addEventListener("click",loadAll);
    $("applyFilters").addEventListener("click",applyFilters);
    $("resetFilters").addEventListener("click",()=>{defaultRange();renderEverything();if(["photos","report"].includes(state.screen))navigate(state.screen);});
    $("serviceSearch").addEventListener("input",()=>renderProduction(serviceRows(),periodEntries()));
    $("csvBtn").addEventListener("click",exportCSV);
    $("printBtn").addEventListener("click",printReport);
    $("reportPrintBtn").addEventListener("click",printReport);
    $("photoGrid").addEventListener("click",openPhoto);
    $("closePhoto").addEventListener("click",()=>$("photoModal").close());
    document.querySelectorAll("[data-screen]").forEach(button=>button.addEventListener("click",()=>navigate(button.dataset.screen)));
    document.querySelectorAll("[data-jump]").forEach(button=>button.addEventListener("click",()=>navigate(button.dataset.jump)));
    if(!client){showLogin("Não foi possível carregar a biblioteca Supabase.");return;}
    try {
      const {data,error}=await client.auth.getSession();
      if(error)throw error;
      if(await checkAccess(data.session))await loadAll();
    }catch(error){console.error(error);showLogin("Não foi possível restaurar a sessão. Entre novamente.");}
    setInterval(()=>{if(state.profile&&!state.loading&&document.visibilityState==="visible")loadAll();},120000);
  }
  init();
})();

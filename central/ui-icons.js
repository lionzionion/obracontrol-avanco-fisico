/* Ícones vetoriais próprios da interface RL Central — sem emojis ou CDN externa. */
(() => {
  "use strict";
  const paths={
    overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    production:'<path d="M4 20V9l5-4 4 4 4-4 3 3v12Z"/><path d="M8 13h2m4 0h2M8 17h2m4 0h2"/>',
    photos:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    food:'<path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-4 2-6 6-6 11h6"/>',
    report:'<path d="M7 3h7l5 5v13H5V3h2Z"/><path d="M14 3v6h5M8 13h8M8 17h8"/>',
    rdos:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/><path d="m14 17 1.5 1.5 3-3"/>',
    external:'<path d="M13 5h6v6M19 5l-9 9"/><path d="M19 13v6H5V5h6"/>',
    right:'<path d="m9 18 6-6-6-6"/>',
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    back:'<path d="m15 18-6-6 6-6"/>',
    refresh:'<path d="M20 11a8 8 0 0 0-14-5L4 8"/><path d="M4 4v4h4M4 13a8 8 0 0 0 14 5l2-2"/><path d="M20 20v-4h-4"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 17v3h14v-3"/>',
    cloud:'<path d="M7 18H6a4 4 0 0 1 0-8c.3-3.3 3-6 6.4-6a7 7 0 0 1 6.8 6.2A4 4 0 0 1 18 18h-3"/><path d="m9 15 3 3 4-4"/>',
    gauge:'<path d="M5.1 17a9 9 0 1 1 13.8 0"/><path d="M12 13l4-5"/><path d="M7 20h10"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    media:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m4 18 6-6 4 4 3-3 4 4"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2"/><path d="M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5"/>',
    layers:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 17l9 5 9-5"/>',
    check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    ruler:'<path d="m3 17 14-14 4 4L7 21l-4-4Z"/><path d="m11 9 2 2m1-5 2 2m-8 4 2 2"/>',
    chart:'<path d="M3 20h18M5 18V9m5 9V5m5 13v-6m5 6V8"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    access:'<rect x="4" y="9" width="16" height="12" rx="2"/><path d="M8 9V6a4 4 0 1 1 8 0v3"/><circle cx="12" cy="15" r="1"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
  };
  function icon(name,extra="") {
    return '<svg class="rl-icon '+extra+'" width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.layers)+'</svg>';
  }
  for(const button of document.querySelectorAll('.nav-btn[data-screen]')) {
    const holder=button.querySelector('span');
    if(holder) {holder.className='nav-icon';holder.innerHTML=icon(button.dataset.screen);}
  }
  const labels=['gauge','clock','media','food'];
  document.querySelectorAll('#screen-overview .kpi .kpi-label > span').forEach((node,i)=>{
    node.classList.add('kpi-symbol');node.innerHTML=icon(labels[i]||'layers');
  });
  const appIcons={obras:'production',pedidos:'food'};
  for(const node of document.querySelectorAll('[data-icon]')){
    node.innerHTML=icon(node.dataset.icon);
  }
  for(const button of document.querySelectorAll('.app-button[data-app]')){
    const type=button.dataset.app;
    const spot=button.querySelector('[data-app-icon]');
    if(spot)spot.innerHTML=icon(appIcons[type]||'layers');
  }
  const enhancements=[
    ['refreshBtn','refresh','Atualizar'],
    ['printBtn','download','Relatório PDF'],
    ['csvBtn','download','Exportar CSV'],
    ['reportPrintBtn','download','Imprimir ou salvar em PDF'],
    ['logoutBtn','lock','Sair']
  ];
  for(const [id,ic,txt] of enhancements){
    const element=document.getElementById(id);
    if(element)element.innerHTML=icon(ic)+'<span>'+txt+'</span>';
  }
  const jump=document.querySelector('[data-jump="production"]');
  if(jump)jump.innerHTML='Ver todos '+icon('arrow');
  window.RL_CENTRAL_ICONS=Object.freeze({icon});
})();

/* RL Engenharia — cache apenas dos arquivos públicos da interface.
   Produção, medições, fotos e autenticação permanecem no Supabase. */
const CACHE="rl-engenharia-obra-shell-v2";
const ASSETS=["./","./index.html","./itens.json","./manifest.webmanifest","./icon.svg","./rl-theme.css","./rl-brand.js","./assets/rl-logo.svg"];
self.addEventListener("install",event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>
  (key.startsWith("obracontrol-shell-")||key.startsWith("rl-engenharia-obra-shell-"))&&key!==CACHE
 ).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 const url=new URL(request.url);
 if(request.method!=="GET"||url.origin!==self.location.origin)return;
 event.respondWith(fetch(request).then(response=>{
  if(response.ok){const clone=response.clone();caches.open(CACHE).then(c=>c.put(request,clone))}
  return response;
 }).catch(()=>caches.match(request).then(cached=>cached||(request.mode==="navigate"?caches.match("./index.html"):Response.error()))));
});

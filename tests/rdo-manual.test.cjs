const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// Não conecta ao banco real: simula snapshots, Storage e interface.
const source=fs.readFileSync(path.join(__dirname,'..','rdo-module.js'),'utf8');
const root={innerHTML:'',contains:()=>false};
const document={
  getElementById:id=>id==='rdoApp'?root:null,
  querySelectorAll:()=>[],activeElement:null,body:{}
};
let seq=0;
const window={};
vm.runInNewContext(source,{
  window,document,confirm:()=>true,
  crypto:{randomUUID:()=>('uuid-'+(++seq))},
  console,Date,setTimeout,clearTimeout
},{filename:'rdo-module.js'});
const rdo=window.ObraRDO;
assert.ok(rdo,'Módulo RDO disponível');

const calls=[];
const cloud={storage:{from:bucket=>({
  createSignedUrls:async paths=>{
    calls.push({type:'signed',bucket,paths});
    return {data:paths.map(p=>({signedUrl:'https://signed.example/'+p}))};
  },
  download:async path=>{
    calls.push({type:'download',bucket,path});
    return {error:{message:'Interrompido pelo teste antes de decodificar imagem'}};
  }
})}};
const entry={id:'e1',kind:'production',date:'2026-11-17',itemId:'i1',
  qty:1.75,front:'Frente 01',author:'Engenheiro',note:'Base executada'};
const state={role:'admin',user:{id:'user1'},entries:[entry],
  photos:[{id:'p1',entryId:'e1',itemId:'i1',path:'user1/e1/p1.jpg',name:'producao.jpg'}]};
rdo.bridge={state,cloud,getItem:id=>({id,code:'01',description:'Pavimentação',contract:'demolicao'}),
  goal:()=>({unit:'m²'})};
rdo.date='2026-11-17';
rdo.draft={work_date:rdo.date,status:'draft',activities:[],photo_manifest:[],source_entry_ids:[]};
rdo.notice=()=>{};

async function run(){
  const originalRender=rdo.render;
  rdo.render=()=>{};
  rdo.addActivity();
  assert.equal(rdo.draft.activities.length,1);
  const manual=rdo.draft.activities[0];
  manual.service='Limpeza de canaleta';
  manual.summary='Serviço avulso sem medição';
  manual.front='Canal';
  manual.responsible='Fiscal';
  rdo.draft.photo_manifest=[{kind:'manual',photo_id:'manual1',
    path:'user1/rdo1/manual1.jpg',source_name:'avulsa.jpg',
    include:true,position:0,caption:'Vista da frente'}];
  rdo.synchronize();
  assert.equal(rdo.draft.activities.length,2,'Atividade avulsa e produção coexistem');
  assert.equal(rdo.draft.activities.find(a=>a.kind==='manual').service,'Limpeza de canaleta');
  assert.equal(rdo.draft.activities.find(a=>a.code==='01').qty,1.75);
  assert.equal(rdo.draft.photo_manifest.length,2,'Foto avulsa e de produção coexistem');
  assert.equal(rdo.draft.photo_manifest[0].kind,'manual','Ordem das fotos mantida');
  assert.equal(state.entries.length,1,'Não cria lançamentos nem medições');
  entry.qty=3.25;
  rdo.synchronize();
  assert.equal(rdo.draft.activities.find(a=>a.code==='01').qty,3.25,
    'Atualiza quantitativos automáticos');
  assert.equal(rdo.draft.activities.find(a=>a.kind==='manual').service,'Limpeza de canaleta',
    'Não apaga atividades independentes ao sincronizar');
  assert.equal(rdo.draft.photo_manifest[0].kind,'manual',
    'Não apaga fotos independentes ao sincronizar');
  await rdo.loadManualPhotoPreviews();
  assert.equal(calls.at(-1).bucket,'obc-rdo-photos','Miniaturas usam bucket privado');
  await assert.rejects(rdo.photoJpeg(rdo.draft.photo_manifest[0]));
  assert.equal(calls.at(-1).bucket,'obc-rdo-photos','PDF lê foto independente');
  await assert.rejects(rdo.photoJpeg(rdo.draft.photo_manifest[1]));
  assert.equal(calls.at(-1).bucket,'obc-fotos','PDF mantém suporte a fotos antigas');
  rdo.render=originalRender;
  rdo.render(true);
  assert.match(root.innerHTML,/Adicionar atividade avulsa/);
  assert.match(root.innerHTML,/id="rdoNewPhotos"/);
  assert.match(root.innerHTML,/Limpeza de canaleta/);
  console.log('RDO: atividades e fotos independentes preservadas, PDF e interface validados.');
}
run().catch(e=>{console.error(e);process.exitCode=1});

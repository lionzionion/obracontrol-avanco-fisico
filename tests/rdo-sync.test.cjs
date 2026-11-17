const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','rdo-module.js'),'utf8');
const DATE='2026-11-17';
const entries=[
  {id:'entry-1',kind:'production',date:DATE,itemId:'g_3',qty:225,
    front:'PLATÔ CENTRAL NÍVEL INFERIOR',author:'Encarregado',note:'Execução da frente'},
  {id:'entry-2',kind:'production',date:DATE,itemId:'d_2.1',qty:19.99,
    front:'NÍVEL FABRICA',author:'Encarregado',note:'Escavação'}
];
const photos=Array.from({length:8},(_,i)=>({
  id:'photo-'+i,entryId:i<6?'entry-1':'entry-2',itemId:i<6?'g_3':'d_2.1',
  path:'user/entry-'+(i<6?'1':'2')+'/photo-'+i+'.jpg',
  name:'foto'+i+'.jpg',createdAt:String(i)
}));
const snap=()=>({
  activities:entries.map(e=>({key:e.itemId+'::'+e.front.toLowerCase(),item_id:e.itemId,
    code:e.itemId,service:'Serviço executado '+e.itemId,unit:'m³',qty:e.qty,
    front:e.front,summary:e.note,source_entry_ids:[e.id]})),
  photo_manifest:photos.map((p,i)=>({photo_id:p.id,entry_id:p.entryId,item_id:p.itemId,
    path:p.path,source_name:p.name,include:true,caption:'Fotografia '+i,position:i})),
  source_entry_ids:entries.map(e=>e.id),source_generated_at:new Date().toISOString()
});
function setup(status){
  const root={innerHTML:'',contains:()=>false};
  const document={getElementById:id=>id==='rdoApp'?root:null,querySelectorAll:()=>[],
    activeElement:null,body:{}};
  const window={};
  vm.runInNewContext(source,{window,document,console,Date,crypto:{randomUUID:()=>String(Math.random())},
    confirm:()=>true,prompt:()=>'',setTimeout,clearTimeout},{filename:'rdo-module.js'});
  const rdo=window.ObraRDO;
  const row={id:'rdo-4',rdo_no:4,work_date:DATE,status,engineer_name:'Engenheiro responsável',
    activities:[{kind:'manual',key:'manual-1',service:'Atividade complementar',summary:'Sem medição'}],
    photo_manifest:[],source_entry_ids:[],updated_at:'2026-11-17T19:01:20Z',
    approved_at:'2026-11-17T19:01:18Z',pdf_path:status==='approved'?'2026/rdo-4/approved.pdf':null
  };
  const notices=[];
  rdo.bridge={cloud:{},state:{role:'admin',user:{id:'user'},entries,photos},getItem:id=>({
    id,code:id,description:'Serviço executado '+id,contract:'demolicao'}),
    goal:()=>({unit:'m³'})};
  rdo.rows=[row];
  rdo.notice=(message,err)=>{notices.push([message,err])};
  rdo.loadDate(DATE);
  return {rdo,root,row,notices};
}
async function run(){
  // O cenário do RDO-00004: aprovado, sem fotos/produção mesmo existindo 2 lançamentos e 8 fotos.
  const app=setup('approved');
  const d=app.rdo.inspectSnapshot(snap());
  assert.equal(d.missingEntries.length,2);
  assert.equal(d.missingPhotos.length,8);
  assert.equal(d.changedActivities.length,2);
  assert.equal(app.rdo.current.status,'approved');
  assert.equal(app.rdo.draft.photo_manifest.length,0,'Não reescreve aprovação');
  assert.match(app.root.innerHTML,/Baixar PDF complementar/);
  let pdfSaved=null;
  const texts=[];
  class PdfStub{
    setFillColor(){} rect(){} addImage(){} setTextColor(){} setFont(){} setFontSize(){}
    text(t){texts.push(t)} roundedRect(){} splitTextToSize(t){return [t]}
    addPage(){} setPage(){} getNumberOfPages(){return 1} setDrawColor(){} line(){}
    output(){return {mock:true}}
  }
  app.rdo.latestSnapshot=async()=>({snapshot:snap(),entries,photos});
  app.rdo.ensureJsPdf=async()=>PdfStub;
  app.rdo.brandLogoPng=async()=> 'logo-data';
  app.rdo.photoJpeg=async()=>({data:'jpeg-data',ratio:1.6});
  app.rdo.saveBlob=(blob,name)=>{pdfSaved={blob,name}};
  await app.rdo.downloadSupplementPdf();
  assert.ok(pdfSaved,'Complemento gerado');
  assert.match(pdfSaved.name,/RDO-00004-COMPLEMENTO/);
  assert.ok(texts.some(t=>String(t).includes('NAO APROVADO')),'Identificação sem aprovação');
  assert.ok(texts.some(t=>String(t).includes('225')),'Quantidade atual exibida');
  assert.equal(app.rdo.current.status,'approved','Original preservado');
  assert.equal(app.rdo.draft.photo_manifest.length,0,'Sem edição do manifesto aprovado');

  // Novo rascunho deve se preencher automaticamente e preservar atividade manual.
  const draft=setup('draft');
  assert.equal(draft.rdo.draft.activities.length,3,'2 automáticos + 1 manual');
  assert.equal(draft.rdo.draft.photo_manifest.length,8,'Inclui fotos no editor');
  assert.equal(draft.rdo.dirty,true,'Exige salvar a versão importada');
  assert.equal(draft.rdo.draft.activities.filter(a=>a.kind==='manual').length,1);
  const submitted=setup('submitted');
  let called=false;
  submitted.rdo.latestSnapshot=async()=>({snapshot:snap(),entries,photos});
  submitted.rdo.updateStatus=async()=>{called=true};
  await submitted.rdo.review('approved');
  assert.equal(called,false,'Bloqueia aprovação desatualizada');
  assert.ok(submitted.notices.some(n=>/Aprovação bloqueada/.test(n[0])));
  console.log('RDO: divergência 2+8 detectada, complemento não aprovado, sincronização e bloqueio verificados.');
}
run().catch(err=>{console.error(err);process.exitCode=1});

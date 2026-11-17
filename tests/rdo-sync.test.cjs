const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','rdo-module.js'),'utf8');
const DATE='2026-11-17';
const entries=[
 {id:'entry-1',kind:'production',date:DATE,itemId:'g_3',qty:225,
   front:'PLATÔ CENTRAL NÍVEL INFERIOR',author:'Encarregado',note:'Execução registrada'},
 {id:'entry-2',kind:'production',date:DATE,itemId:'d_2.1',qty:19.99,
   front:'NÍVEL FABRICA',author:'Encarregado',note:'Escavação registrada'}
];
const photos=Array.from({length:8},(_,i)=>({
  id:'photo-'+i,entryId:i<6?'entry-1':'entry-2',
  itemId:i<6?'g_3':'d_2.1',path:'user/photos/'+i+'.jpg',
  name:'foto-'+i+'.jpg',createdAt:String(i)
}));
const snapshot=()=>({
 activities:entries.map(e=>({key:e.itemId+'::'+e.front.toLowerCase(),item_id:e.itemId,
   code:e.itemId,service:'Serviço '+e.itemId,unit:'m³',qty:e.qty,
   front:e.front,summary:e.note,source_entry_ids:[e.id]})),
 photo_manifest:photos.map((p,i)=>({photo_id:p.id,entry_id:p.entryId,item_id:p.itemId,
   path:p.path,source_name:p.name,include:true,caption:'Registro '+i,position:i})),
 source_entry_ids:entries.map(e=>e.id),source_generated_at:new Date().toISOString()
});
function setup(status,role='admin'){
  const root={innerHTML:'',contains:()=>false};
  const document={getElementById:id=>id==='rdoApp'?root:null,
    querySelectorAll:()=>[],activeElement:null,body:{}};
  const window={};let uuid=0;
  vm.runInNewContext(source,{window,document,console,Date,structuredClone,
    crypto:{randomUUID:()=>'uuid-'+(++uuid)},
    confirm:()=>true,prompt:()=>'',setTimeout,clearTimeout},{filename:'rdo-module.js'});
  const rdo=window.ObraRDO;
  let savedPayload=null;
  let row={id:'rdo-4',rdo_no:4,work_date:DATE,status,engineer_name:'Engenheiro responsável',
    activities:[{kind:'manual',key:'manual-1',service:'Atividade já informada',summary:'Sem medição'}],
    photo_manifest:[],source_entry_ids:[],updated_at:'2026-11-17T19:01:20Z',
    approved_at:'2026-11-17T19:01:18Z',approved_name:'Responsável',
    approval_history:[],pdf_path:['approved','final'].includes(status)?'2026/rdo-4/arquivo-original.pdf':null
  };
  const cloud={
    storage:{from:()=>({createSignedUrls:async paths=>({data:paths.map(p=>({signedUrl:'https://signed.example/'+p}))})})},
    from:table=>{
      if(table!=='obc_rdos')throw Error('Tabela inesperada: '+table);
      return {
        update(payload){
          savedPayload=payload;
          return {eq(){return this},select(){return this},
            async maybeSingle(){
              row={...row,...payload,updated_at:'2026-11-17T20:00:00Z',
                pdf_path:null,approval_history:[{action:'reopened',previous_pdf_path:row.pdf_path,
                  previous_status:row.status,at:'2026-11-17T20:00:00Z'}]};
              return {data:row};
            }};
        },
        select(){
          return {order(){return this},async limit(){return {data:[row]}}};
        }
      };
    }
  };
  const notices=[];
  rdo.bridge={cloud,state:{role,user:{id:'user'},entries,photos},
    getItem:id=>({id,code:id,description:'Serviço '+id,contract:'demolicao'}),
    goal:()=>({unit:'m³'})};
  rdo.userId='user';rdo.rows=[row];
  rdo.notice=(message,isError)=>notices.push({message,isError});
  rdo.latestSnapshot=async()=>({snapshot:snapshot(),entries,photos});
  rdo.loadLinkedPhotoPreviews=async()=>{};
  rdo.loadDate(DATE);
  return {rdo,root,notices,getSaved:()=>savedPayload,getRow:()=>row};
}
async function run(){
  const app=setup('approved');
  await app.rdo.refreshOpenedSnapshot(DATE,'rdo-4');
  assert.equal(app.rdo.current.status,'approved','RDO original ainda aprovado antes de salvar');
  assert.equal(app.rdo.draft.activities.length,3,'Preserva manual e adiciona dois serviços');
  assert.equal(app.rdo.draft.photo_manifest.length,8,'Oito fotos diretamente no editor');
  assert.equal(app.rdo.dirty,true,'Mudanças aguardam salvamento');
  assert.match(app.root.innerHTML,/Salvar alterações/);
  assert.match(app.root.innerHTML,/Adicionar fotos diretamente ao RDO/);
  assert.doesNotMatch(app.root.innerHTML,/PDF complementar|RDO aprovado com registros posteriores/);
  assert.ok(!app.root.innerHTML.includes('disabled> Incluir no PDF'),'Fotos editáveis');

  assert.equal(await app.rdo.saveDraft(),true,'Salva no próprio RDO');
  assert.equal(app.rdo.current.id,'rdo-4','Mantém identificador original');
  assert.equal(app.rdo.current.rdo_no,4,'Mantém numeração original');
  assert.equal(app.rdo.current.status,'draft','Nova revisão exige aprovação');
  assert.equal(app.getSaved().activities.length,3);
  assert.equal(app.getSaved().photo_manifest.length,8);
  assert.equal(app.getSaved().source_entry_ids.length,2);
  assert.match(app.root.innerHTML,/Enviar para aprovação/);
  assert.match(app.root.innerHTML,/PDFs anteriores \(1\)/);
  assert.doesNotMatch(app.root.innerHTML,/Baixar PDF complementar/);

  // Enviados também podem ser abertos, mas a aprovação deve conferir a cópia do banco.
  const submitted=setup('submitted');
  await submitted.rdo.refreshOpenedSnapshot(DATE,'rdo-4');
  let reviewed=false;
  submitted.rdo.updateStatus=async()=>{reviewed=true};
  await submitted.rdo.review('approved');
  assert.equal(reviewed,false,'Não aprova alterações locais não salvas');

  // Equipe sem permissão de administrador continua somente leitura.
  const collaborator=setup('approved','colaborador');
  assert.doesNotMatch(collaborator.root.innerHTML,/Salvar alterações|Adicionar fotos diretamente ao RDO/);
  assert.match(collaborator.root.innerHTML,/Baixar PDF aprovado/);

  console.log('RDO: aprovado editável, 2 produções, 8 fotos, mesmo número, histórico e nova aprovação.');
}
run().catch(error=>{console.error(error);process.exitCode=1});

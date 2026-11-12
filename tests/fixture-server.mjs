import { createServer } from "node:http";
import { createHmac } from "node:crypto";

// Separate test process. The app uses its normal SSR client and has no test auth path.
const actor="f0000000-0000-4000-8000-000000000001";
const org="f0000000-0000-4000-8000-000000000002";
const id="f0000000-0000-4000-8000-000000000003";
const email="layout@example.test";
const user={id:actor,aud:"authenticated",role:"authenticated",email,email_confirmed_at:"2026-11-09T12:00:00Z",created_at:"2026-11-09T12:00:00Z",app_metadata:{provider:"email"},user_metadata:{}};
const jwtPart=value=>Buffer.from(JSON.stringify(value)).toString("base64url");
const timestamp=Math.floor(Date.now()/1000);
const body=jwtPart({alg:"HS256",typ:"JWT"})+"."+jwtPart({sub:actor,email,aud:"authenticated",role:"authenticated",exp:timestamp+7200,iat:timestamp});
const token=body+"."+createHmac("sha256","isolated-browser-layout-fixture").update(body).digest("base64url");
const date=value=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(value);
const currentDate=date(new Date());
const expiredDate=date(new Date(Date.now()-172800000));
const organization={id:org,name:"Organização de teste visual",city:"São Luís",region:"MA",segments:"Serviços",message_name:"Equipe de teste",retention_days:365};
const lead={id,name:"Empresa fictícia de teste",sector:"Serviços",city:"São Luís",region:"MA",district:"Centro",address:"",domain:"empresa-layout.example",notes:"Fixture isolada de teste visual.",source_label:"Fixture de teste visual",source_url:null,consulted_on:"2026-11-09",stage:"review",website_status:"insufficient",priority:"alta",assignee_id:actor,next_action:"Confirmar evidência",follow_up:null,loss_reason:null,contract_value:null,updated_at:"2026-11-09T13:00:00Z",coverage:0,observed:0,confidence:"insuficiente",has_pending:true,organization_id:org};
let includeLead=true;
let includeEvidence=true;
const write=(response,status,data,extra={})=>{
  response.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store",...extra});
  response.end(data===null?undefined:JSON.stringify(data));
};
createServer((request,response)=>{
  const url=new URL(request.url??"/","http://127.0.0.1:3108");
  if(url.pathname==="/health")return write(response,200,{fixture:true});
  if((url.pathname==="/__fixture/leads"||url.pathname==="/__fixture/evidence")&&request.method==="POST"){
    const present=url.searchParams.get("present")!=="false";
    if(url.pathname.endsWith("/leads"))includeLead=present;else includeEvidence=present;
    return write(response,200,{includeLead,includeEvidence});
  }
  if(url.pathname==="/auth/v1/.well-known/jwks.json")return write(response,200,{keys:[]});
  if(url.pathname==="/auth/v1/token"&&request.method==="POST"){
    let payload="";
    request.on("data",chunk=>{payload+=chunk;});
    request.on("end",()=>{
      try{
        const input=JSON.parse(payload);
        if(input.email===email&&input.password==="Fixture-test-password")return write(response,200,{access_token:token,refresh_token:"isolated-test-refresh",token_type:"bearer",expires_in:7200,expires_at:timestamp+7200,user});
      }catch{}
      write(response,400,{msg:"Fixture credentials rejected",code:"invalid_credentials"});
    });
    return;
  }
  if(request.headers.authorization!=="Bearer "+token)return write(response,401,{message:"Fixture token invalid"});
  if(url.pathname==="/auth/v1/user")return write(response,200,user);
  if(!url.pathname.startsWith("/rest/v1/"))return write(response,404,{message:"Unknown fixture path"});
  const table=url.pathname.split("/").at(-1);
  const select=url.searchParams.get("select")??"";
  let rows=[];
  if(table==="organization_members")rows=[{organization_id:org,user_id:actor,role:"owner",organizations:organization}];
  if(table==="leads"||table==="lead_directory"){
    const wanted=url.searchParams.get("id");
    if(includeLead&&(!wanted||wanted==="eq."+id)&&(!url.searchParams.get("organization_id")||url.searchParams.get("organization_id")==="eq."+org))rows=[lead];
  }
  if(table==="evidence_items"&&includeEvidence)rows=[
    {id:"f0000000-0000-4000-8000-000000000004",kind:"Presença digital",observed:"A página oficial não é atualizada desde 2023.",url:null,provider:"manual",source_label:"Fixture de teste visual",consulted_on:"2026-11-09",method:"Fixture",excerpt:null,confidence:"pendente",review:"pending",review_note:null,expires_at:null,export_allowed:false},
    {id:"f0000000-0000-4000-8000-000000000005",kind:"Leitura do site",observed:"O site respondeu HTTP 200 e apresenta os serviços da empresa.",url:"https://empresa-layout.example",provider:"site_reader",source_label:"Leitura automática do site",consulted_on:currentDate,method:"Fixture",excerpt:null,confidence:"suficiente",review:"confirmed",review_note:null,expires_at:null,export_allowed:false},
    {id:"f0000000-0000-4000-8000-000000000006",kind:"Sinais de marketing",observed:"Informação antiga que não pode ser usada como atual.",url:null,provider:"site_reader",source_label:"Leitura automática do site",consulted_on:expiredDate,method:"Fixture",excerpt:null,confidence:"suficiente",review:"confirmed",review_note:null,expires_at:expiredDate,export_allowed:false}
  ];
  if(table==="evidence_items"&&url.searchParams.has("review")){
    const filter=url.searchParams.get("review")??"";
    if(filter.startsWith("in.")){const values=filter.slice(3).replace(/[()]/g,"").split(",");rows=rows.filter(row=>values.includes(row.review));}
    else if(filter.startsWith("eq."))rows=rows.filter(row=>row.review===filter.slice(3));
    const limit=Number(url.searchParams.get("limit"));if(Number.isSafeInteger(limit)&&limit>0)rows=rows.slice(0,limit);
  }
  // FIXTURE_READING=1: fila de leitura em andamento para ver o painel ao vivo
  if(process.env.FIXTURE_READING==="1"){
    const ago=m=>new Date(Date.now()-m*60000).toISOString();
    const queue=[["f0000000-0000-4000-8000-000000000011","Oral Smile Odontologia","done",null,ago(6),{points:45,maximum:85,signals:{site_vivo:true}}],
      ["f0000000-0000-4000-8000-000000000012","Dra. Mellina Lima","running","Pesquisando site, Instagram e CNPJ no Google",ago(1),null],
      ["f0000000-0000-4000-8000-000000000013","Sorriso e Cia: Dentista","pending",null,ago(7),null],
      ["f0000000-0000-4000-8000-000000000014","Clínica DENTEBRAS","pending",null,ago(7),null],
      ["f0000000-0000-4000-8000-000000000015","Smart Odonto","failed",null,ago(3),null]];
    if(table==="enrichment_requests"&&select.startsWith("lead_id,state,step,error_code,suggestion,requested_at"))
      rows=queue.map(([lead_id,,state,step,at,suggestion])=>({lead_id,state,step,error_code:state==="failed"?"lease_exhausted":null,suggestion,requested_at:ago(8),finished_at:state==="done"||state==="failed"?at:null}));
    if(table==="leads"&&select==="id,name")rows=queue.map(([id,name])=>({id,name}));
    if(table==="lead_contacts"&&select==="lead_id")rows=[1,2,3,4].map(()=>({lead_id:queue[0][0]}));
    // ficha da empresa com o que a leitura costuma achar
    const ev=(n,kind,observed,url,review="pending")=>({id:"f0000000-0000-4000-8000-00000000010"+n,kind,observed,url,provider:"site_reader",source_label:"Leitura automática do site",consulted_on:"2026-11-10",method:"Leitura automática",excerpt:null,confidence:"pendente",review,review_note:null,expires_at:null,export_allowed:false});
    if(table==="evidence_items")rows=[ev(1,"Leitura do site","O site respondeu HTTP 200. Título: Smart Odonto &#8211; Clínica Odontológica em São Luís.","https://empresa-layout.example/","confirmed"),
      ev(2,"Perfil do Instagram","@smartodontoslz: 21 mil seguidores, 1120 posts. 7 posts nos últimos 30 dias. Média de 13 curtidas por post (0,1% de engajamento).","https://www.instagram.com/smartodontoslz"),
      ev(3,"Google Maps","Encontrada no Google Maps como Clínica odontológica: nota 4,9 com 173 avaliações; Shopping da Ilha, Cohama, São Luís - MA.","https://www.google.com/maps/search/?api=1&query=x"),
      ev(4,"Cadastro na Receita","36.725.708/0001-57 (publicado no site); razão social CALISTO ODONTOLOGIA LTDA; situação ATIVA; aberta em 2020; porte EMPRESA DE PEQUENO PORTE.","https://brasilapi.com.br/api/cnpj/v1/36725708000157"),
      ev(5,"Anúncios na Meta","Nenhum anúncio ativo com o nome \"Smart Odonto\" na Biblioteca da Meta.","https://www.facebook.com/ads/library/?q=x"),
      ev(6,"Sinais de marketing","Página inicial: tem pixel de anúncio (Meta), rodapé parado em 2021, com botão de WhatsApp. Oportunidade sugerida: baixa.","https://empresa-layout.example/")];
    const ct=(n,kind,value,normalized,source_label,confirmed=false)=>({id:"f0000000-0000-4000-8000-00000000020"+n,kind,value,normalized,source_label,consulted_on:"2026-11-10",confirmed});
    if(table==="lead_contacts"&&select.startsWith("id,kind"))rows=[ct(1,"whatsapp","+55 98 98220 0011","+5598982200011","Leitura automática do site"),ct(2,"phone","+55 98 98246 7800","+5598982467800","Google Maps via Apify"),
      ct(3,"phone","+55 98 3311 8254","+559833118254","Leitura automática do site",true),ct(4,"email","atendimento@smartodontoslz.com.br","atendimento@smartodontoslz.com.br","Leitura automática do site"),
      ct(5,"instagram","@smartodontoslz","smartodontoslz","Leitura automática do site"),ct(6,"maps","https://www.google.com/maps/search/?api=1&query=x","x","Google Maps via Apify")];
    if(table==="enrichment_requests"&&select.startsWith("state,step"))rows=[{state:"done",step:null,error_code:null,finished_at:ago(30),suggestion:{points:80,maximum:85,opportunity:"baixa",rationale:"",signals:{site_vivo:true,instagram:true,email:true,telefone:true,whatsapp:true,cnpj:true,linkedin:false}}}];
    if(table==="audit_events")rows=[{id:"a1",event:"lead.enriched",detail:{source:"site_reader"},created_at:ago(30)},{id:"a2",event:"evidence_items.insert",detail:{},created_at:ago(30)},{id:"a3",event:"lead_contacts.insert",detail:{},created_at:ago(30)},{id:"a4",event:"lead.created",detail:{source:"maps"},created_at:ago(200)}];
  }
  const limit=Number(url.searchParams.get("limit"));if(Number.isSafeInteger(limit)&&limit>0)rows=rows.slice(0,limit);
  if(request.method==="HEAD")return write(response,200,null,{"Content-Range":rows.length?"0-0/1":"*/0"});
  if(select.includes("organizations")&&table!=="organization_members")return write(response,400,{message:"Unexpected fixture relation"});
  return write(response,200,rows,{"Content-Range":rows.length?"0-"+(rows.length-1)+"/"+rows.length:"*/0"});
}).listen(3108,"127.0.0.1");

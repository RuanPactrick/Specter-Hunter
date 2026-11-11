import { readFileSync,readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
const actorA="a0000000-0000-4000-8000-000000000001";
const actorB="a0000000-0000-4000-8000-000000000002";
const actorC="a0000000-0000-4000-8000-000000000003";
const request1="a0000000-0000-4000-8000-000000000011";
const request2="a0000000-0000-4000-8000-000000000012";
const request3="a0000000-0000-4000-8000-000000000013";
const db=new PGlite();
let orgA:string,orgB:string,leadA:string,leadB:string,evidenceA:string;
async function role(value:"authenticated"|"service_role"|"anon"|"postgres",id=""){
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  if(value!=="postgres")await db.exec("set role "+value);
}
async function first<T>(query:string,values:unknown[]=[]){
  const result=await db.query<T>(query,values);
  return result.rows[0];
}
const body=(name:string,domain:string|null=null)=>JSON.stringify({name,sector:"Serviços",city:"São Luís",region:"MA",source_label:"Fixture de teste",consulted_on:"2026-11-09",domain});
const create=async(org:string,name:string,domain?:string,override=false)=>
  (await first<{id:string}>("select public.create_lead($1,$2::jsonb,$3) id",[org,body(name,domain),override])).id;
const enqueue=async(org:string,id:string,max=3)=>(await first<{id:string}>(
  "select public.enqueue_research($1,$2,'São Luís','MA','','Cafeteria',5,$3,true) id",[org,id,max])).id;
const claim=()=>first<{id:string;lease_token:string;attempt:number;result_count:number;page_token:string|null}>("select * from public.claim_research()");
beforeAll(async()=>{
  await db.exec(`
create role authenticated;
create role anon;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
grant usage on schema auth to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,service_role;
grant select,insert,delete on storage.objects to authenticated;
`);
  for(const file of readdirSync("supabase/migrations").filter(name=>name.endsWith(".sql")).sort()){
    await db.exec(readFileSync("supabase/migrations/"+file,"utf8"));
  }
  await db.query("insert into auth.users values($1),($2),($3)",[actorA,actorB,actorC]);
  await role("authenticated",actorA);
  orgA=(await first<{id:string}>("select public.create_organization('Equipe de teste A','Responsável A','São Luís','MA','','Nome A') id")).id;
  leadA=await create(orgA,"Empresa Teste A","sample.example");
  evidenceA=(await first<{id:string}>("select id from public.evidence_items where lead_id=$1",[leadA])).id;
  await role("authenticated",actorB);
  orgB=(await first<{id:string}>("select public.create_organization('Equipe de teste B','Responsável B','São Luís','MA','','Nome B') id")).id;
  leadB=await create(orgB,"Empresa Teste B");
  await role("postgres");
  await db.query("insert into public.organization_members(organization_id,user_id,role) values($1,$2,'member')",[orgA,actorC]);
});
afterAll(async()=>{await db.close();});
describe("PostgreSQL embarcado com as migrations da aplicação",()=>{
  it("isola carteira, visão de exportação, detalhes, consultas e evidências",async()=>{
    await role("authenticated",actorA);
    expect((await db.query("select id from public.lead_directory order by id")).rows).toEqual([{id:leadA}]);
    expect((await db.query("select id from public.leads where id=$1",[leadB])).rows).toEqual([]);
    expect((await db.query("update public.leads set notes='invasão' where id=$1 returning id",[leadB])).rows).toEqual([]);
    await expect(create(orgB,"Entrada indevida")).rejects.toMatchObject({code:"42501"});
    await expect(db.query("insert into public.tasks(organization_id,lead_id,title,kind,due) values($1,$2,'Revisão','other','2026-11-10')",[orgA,leadB])).rejects.toMatchObject({code:"23503"});
    await expect(enqueue(orgB,request1)).rejects.toMatchObject({code:"42501"});
    await expect(db.query("select * from public.claim_research()")).rejects.toMatchObject({code:"42501"});
    await role("anon");
    await expect(db.query("select id from public.leads")).rejects.toMatchObject({code:"42501"});
  });
  it("reserva configurações ao proprietário e impede relações cruzadas",async()=>{
    await role("authenticated",actorC);
    expect((await db.query("select id from public.leads where id=$1",[leadA])).rows).toEqual([{id:leadA}]);
    expect((await db.query("update public.organizations set name='Sem permissão' where id=$1 returning id",[orgA])).rows).toEqual([]);
    await expect(db.query("insert into public.exclusions(organization_id,name) values($1,'Teste')",[orgA])).rejects.toMatchObject({code:"42501"});
    await expect(db.query("update public.leads set assignee_id=$2 where id=$1",[leadA,actorB])).rejects.toMatchObject({code:"23503"});
  });
  it("valida evidência do próprio lead, recalcula cobertura e esconde evidência expirada",async()=>{
    await role("authenticated",actorA);
    const draft="select public.assess_website($1,$2,'owned',$3,'sample.example','Vínculo informado','','')";
    await expect(db.query(draft,[orgA,leadA,evidenceA])).rejects.toMatchObject({code:"22023"});
    await db.query("update public.evidence_items set review='confirmed' where id=$1",[evidenceA]);
    await db.query(draft,[orgA,leadA,evidenceA]);
    const scoring="insert into public.opportunity_assessments(organization_id,lead_id,criterion,points,rationale,evidence_id) values($1,$2,'gap',16,'Justificativa de teste',$3)";
    await expect(db.query(scoring,[orgA,leadA,request1])).rejects.toMatchObject({code:"22023"});
    await db.query(scoring,[orgA,leadA,evidenceA]);
    expect(await first("select observed,coverage,website_status from public.lead_directory where id=$1",[leadA])).toEqual({observed:16,coverage:30,website_status:"owned"});
    await db.query("insert into public.evidence_items(organization_id,lead_id,kind,observed,source_label,consulted_on,method,expires_at,export_allowed) values($1,$2,'Teste expirado','Trecho expirado','Fixture',current_date,'Registro',now()-interval '1 day',true)",[orgA,leadA]);
    expect((await db.query("select id from public.evidence_items where kind='Teste expirado'")).rows).toEqual([]);
    await db.query("update public.evidence_items set review='conflict' where id=$1",[evidenceA]);
    expect(await first("select observed,coverage,confidence,effective_website_status from public.lead_directory where id=$1",[leadA])).toEqual({observed:0,coverage:0,confidence:"pendente",effective_website_status:"conflict"});
  });
  it("trata duplicados, exclusões de CSV e não contato na camada transacional",async()=>{
    await role("authenticated",actorA);
    await expect(create(orgA,"Empresa Teste A")).rejects.toMatchObject({code:"P2002"});
    await expect(create(orgA,"Outra empresa", "sample.example")).rejects.toMatchObject({code:"P2002"});
    await expect(create(orgA,"Cafe Boutique",undefined,true)).rejects.toMatchObject({code:"P2001"});
    const imported=await first<{result:{status:string}[]}>("select public.import_leads($1,$2::jsonb) result",[orgA,JSON.stringify([JSON.parse(body("CSV de teste")),JSON.parse(body("Mimos Pet")),JSON.parse(body("CSV de teste"))])]);
    expect(imported.result.map(r=>r.status)).toEqual(["created","suppressed","duplicate"]);
    await db.query("select public.move_lead($1,$2,'blocked','Pedido de não contato',false)",[orgA,leadA]);
    await expect(create(orgA,"Empresa Teste A",undefined,true)).rejects.toMatchObject({code:"P2001"});
    await expect(db.query("select public.record_outreach($1,$2,'draft','confirm','E-mail','Mensagem')",[orgA,leadA])).rejects.toMatchObject({code:"P2001"});
    await role("authenticated",actorC);
    await expect(db.query("select public.move_lead($1,$2,'review','Revisado',true)",[orgA,leadA])).rejects.toMatchObject({code:"42501"});
    await role("authenticated",actorA);
    await db.query("select public.move_lead($1,$2,'review','Revisão da organização',true)",[orgA,leadA]);
    await expect(db.query("select public.record_outreach($1,$2,'sent','confirm','WhatsApp','Mensagem')",[orgA,leadA])).rejects.toMatchObject({code:"22023"});
    await db.query("select public.record_outreach($1,$2,'sent','confirm','E-mail','Envio confirmado em teste')",[orgA,leadA]);
    expect(await first("select stage from public.leads where id=$1",[leadA])).toEqual({stage:"contact"});
  });
  it("processa fila idempotente, guarda parciais e cancela com isolamento",async()=>{
    await role("authenticated",actorA);
    const id=await enqueue(orgA,request1);
    expect(await enqueue(orgA,request1)).toBe(id);
    await expect(enqueue(orgA,request2)).rejects.toMatchObject({code:"P2004"});
    await role("authenticated",actorB);
    expect(await first("select public.cancel_research($1,$2) cancelled",[orgB,id])).toEqual({cancelled:false});
    expect((await db.query("select id from public.research_jobs")).rows).toEqual([]);
    await role("service_role");
    const job=await claim();
    expect(job.id).toBe(id);
    expect(await first("select public.reserve_research_request($1,$2) reserved",[id,job.lease_token])).toEqual({reserved:true});
    expect(await first("select * from public.store_research_page($1,$2,$3,$4)",[id,job.lease_token,["Place_a","Place_a","Place_b"],"token"])).toEqual({result_count:2,cancelled:false});
    await role("authenticated",actorA);
    expect(await first("select public.cancel_research($1,$2) cancelled",[orgA,id])).toEqual({cancelled:true});
    await role("service_role");
    expect(await first("select public.reserve_research_request($1,$2) reserved",[id,job.lease_token])).toEqual({reserved:false});
    await db.query("select public.finish_research($1,$2,'completed',null)",[id,job.lease_token]);
    await role("authenticated",actorA);
    expect(await first("select state,result_count from public.research_jobs where id=$1",[id])).toEqual({state:"cancelled",result_count:2});
    expect((await db.query("select provider_id from public.research_results order by provider_id")).rows).toEqual([{provider_id:"Place_a"},{provider_id:"Place_b"}]);
  });
  it("recupera lease, impede gravação antiga e não transforma falha em sucesso",async()=>{
    await role("authenticated",actorA);
    const id=await enqueue(orgA,request2);
    await role("service_role");
    const job=await claim();
    await db.query("select public.reserve_research_request($1,$2)",[id,job.lease_token]);
    await db.query("select * from public.store_research_page($1,$2,$3,$4)",[id,job.lease_token,["Place_c"],"continue"]);
    await db.query("select public.finish_research($1,$2,'pending','provider_unavailable',2)",[id,job.lease_token]);
    expect(await claim()).toBeUndefined();
    await role("postgres");
    await db.query("update public.research_jobs set next_attempt_at=now()-interval '1 second' where id=$1",[id]);
    await role("service_role");
    const retry=await claim();
    expect(retry).toMatchObject({id,attempt:2,page_token:"continue",result_count:1});
    expect((await db.query("select * from public.store_research_page($1,$2,$3,$4)",[id,job.lease_token,["Obsoleto"],null])).rows).toEqual([]);
    await role("postgres");
    await db.query("update public.research_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[id]);
    await role("service_role");
    const recovered=await claim();
    expect(recovered).toMatchObject({id,attempt:3,page_token:"continue"});
    await db.query("select public.finish_research($1,$2,'failed','provider_unavailable')",[id,recovered.lease_token]);
    await role("authenticated",actorA);
    expect(await first("select state,result_count,error_code from public.research_jobs where id=$1",[id])).toEqual({state:"partial",result_count:1,error_code:"provider_unavailable"});
    const limited=await enqueue(orgA,request3,1);
    await role("service_role");
    const limitJob=await claim();
    await db.query("select public.reserve_research_request($1,$2)",[limited,limitJob.lease_token]);
    await expect(db.query("select public.reserve_research_request($1,$2)",[limited,limitJob.lease_token])).rejects.toMatchObject({code:"P2005"});
    await db.query("select public.finish_research($1,$2,'limit_reached','query_budget')",[limited,limitJob.lease_token]);
  });
  it("enfileira leitura do site e grava só evidência pendente e contato não confirmado",async()=>{
    await role("authenticated",actorB);
    expect(await first("select public.request_enrichment($1,$2) n",[orgB,[leadA]])).toEqual({n:0});
    await role("authenticated",actorA);
    expect(await first("select public.request_enrichment($1,$2) n",[orgA,[leadA,leadB]])).toEqual({n:1});
    expect(await first("select public.request_enrichment($1,$2) n",[orgA,[leadA]])).toEqual({n:0});
    await expect(db.query("select * from public.claim_enrichment()")).rejects.toMatchObject({code:"42501"});
    await role("service_role");
    const item=await first<{lead_id:string;lease_token:string;domain:string}>("select * from public.claim_enrichment()");
    expect(item).toMatchObject({lead_id:leadA,domain:"sample.example"});
    const result=JSON.stringify({evidence:[{kind:"Contatos no site",observed:"Publicado no site: e-mail oi@sample.example.",url:"https://sample.example/"}],
      contacts:[{kind:"email",value:"oi@sample.example",normalized:"oi@sample.example"},{kind:"phone",value:"x",normalized:"invalido"},{kind:"maps",value:"x",normalized:"x"}],
      suggestion:{points:15,maximum:85}});
    expect(await first("select public.finish_enrichment($1,$2,gen_random_uuid(),$3::jsonb) ok",[orgA,leadA,result])).toEqual({ok:false});
    expect(await first("select public.finish_enrichment($1,$2,$3,$4::jsonb) ok",[orgA,leadA,item.lease_token,result])).toEqual({ok:true});
    await role("authenticated",actorA);
    expect(await first("select provider,review,confidence from public.evidence_items where lead_id=$1 and provider='site_reader'",[leadA])).toEqual({provider:"site_reader",review:"pending",confidence:"pendente"});
    expect((await db.query("select kind,confirmed from public.lead_contacts where lead_id=$1 and source_label='Leitura automática do site'",[leadA])).rows).toEqual([{kind:"email",confirmed:false}]);
    expect(await first("select state,suggestion->>'points' points from public.enrichment_requests where lead_id=$1",[leadA])).toEqual({state:"done",points:"15"});
    expect(await first("select public.request_enrichment($1,$2) n",[orgA,[leadA]])).toEqual({n:1});
    await role("authenticated",actorB);
    expect(await first("select public.request_enrichment($1,$2) n",[orgB,[leadB]])).toEqual({n:1});
    await role("service_role");
    const next=await first<{lead_id:string;lease_token:string;name:string;phones:string[]}>("select * from public.claim_enrichment()");
    expect(next).toMatchObject({lead_id:leadA,name:"Empresa Teste A",phones:[]});
    expect(await first("select public.reserve_enrichment_search($1,$2,$3,'apify',4) ok",[orgA,leadA,next.lease_token])).toEqual({ok:true});
    expect(await first("select public.reserve_enrichment_search($1,$2,gen_random_uuid(),'apify') ok",[orgA,leadA])).toEqual({ok:false});
    expect(await first("select public.enrichment_step($1,$2,$3,'Lendo o site') ok",[orgA,leadA,next.lease_token])).toEqual({ok:true});
    expect(await first("select public.enrichment_step($1,$2,gen_random_uuid(),'x') ok",[orgA,leadA])).toEqual({ok:false});
    const progress="select step from public.enrichment_requests where organization_id=$1 and lead_id=$2";
    await role("authenticated",actorA);
    expect(await first(progress,[orgA,leadA])).toEqual({step:"Lendo o site"});
    await expect(db.query("select lease_token from public.enrichment_requests")).rejects.toMatchObject({code:"42501"});
    await role("authenticated",actorB);
    expect(await first(progress,[orgA,leadA])).toBeUndefined();
    await role("service_role");
    // releitura com site no ar: troca a evidência pendente e classifica o site com a leitura confirmada
    const reread=JSON.stringify({site_status:"owned",site_url:"https://sample.example/",evidence:[{kind:"Leitura do site",observed:"O site respondeu HTTP 200.",url:"https://sample.example/"}],contacts:[],suggestion:{points:25,maximum:85}});
    expect(await first("select public.finish_enrichment($1,$2,$3,$4::jsonb) ok",[orgA,leadA,next.lease_token,reread])).toEqual({ok:true});
    await role("postgres");
    expect((await db.query("select kind,review from public.evidence_items where lead_id=$1 and provider='site_reader'",[leadA])).rows).toEqual([{kind:"Leitura do site",review:"confirmed"}]);
    expect(await first("select effective_website_status s from public.lead_directory where id=$1",[leadA])).toEqual({s:"owned"});
    expect(await first("select step,state from public.enrichment_requests where lead_id=$1",[leadA])).toEqual({step:null,state:"done"});
    expect(await first("select count(*)::int n from public.provider_usage where organization_id=$1 and provider='apify' and operation='enrich'",[orgA])).toEqual({n:4});
  });
  it("lê em lote só empresas nunca lidas, até a quantidade pedida",async()=>{
    await role("authenticated",actorA);
    const batch=(limit:number,needDomain=false)=>first("select public.request_enrichment_batch($1,$2,$3) n",[orgA,limit,needDomain]);
    const fresh=await create(orgA,"Empresa nunca lida","nova.example");
    await create(orgA,"Empresa sem site");
    expect(await batch(1,true)).toEqual({n:1});
    expect(await first("select state from public.enrichment_requests where lead_id=$1",[fresh])).toEqual({state:"pending"});
    expect(await batch(50,true)).toEqual({n:0});
    expect(await batch(50)).toEqual({n:2});
    expect(await batch(50)).toEqual({n:0});
    await expect(batch(51)).rejects.toMatchObject({code:"22023"});
    await role("authenticated",actorB);
    await expect(first("select public.request_enrichment_batch($1,1,false)",[orgA])).rejects.toMatchObject({code:"42501"});
  });
  it("cadastra na carteira as empresas do Maps, sem repetidas e sem as da lista de exclusão",async()=>{
    await role("authenticated",actorA);
    const id=await enqueue(orgA,"a0000000-0000-4000-8000-000000000014");
    await role("service_role");
    const job=await claim();
    expect(job.id).toBe(id);
    await db.query("select public.reserve_research_request($1,$2)",[id,job.lease_token]);
    expect(await first("select public.extend_research_lease($1,$2) ok",[id,job.lease_token])).toEqual({ok:true});
    const lead=(name:string,phone?:string)=>({name,sector:"Cafeteria",city:"São Luís",region:"MA",source_label:"Google Maps via Apify",source_url:"https://maps.google.com/?cid=1",consulted_on:"2026-11-10",
      contacts:phone?[{kind:"phone",value:phone,normalized:phone}]:[]});
    const rows=[{place_id:"Maps_1",lead:lead("Café Novo do Centro","+559832000001"),observed:"Encontrada no Google Maps: nota 4,5."},
      {place_id:"Maps_2",lead:lead("Empresa nunca lida"),observed:"Repetida."},{place_id:"Maps_3",lead:lead("Mimos Pet"),observed:"Excluída."},
      {place_id:"Maps_1",lead:lead("Café Novo do Centro"),observed:"Mesmo lugar."},{place_id:"Maps_4",lead:lead("Padaria Nova"),observed:"Nova."}];
    expect(await first("select * from public.store_maps_leads($1,$2,$3::jsonb)",[id,job.lease_token,JSON.stringify(rows)])).toEqual({result_count:4,created:2,cancelled:false});
    await db.query("select public.finish_research($1,$2,'completed',null)",[id,job.lease_token]);
    await role("authenticated",actorA);
    expect(await first("select provider,leads_created,result_count,state from public.research_jobs where id=$1",[id])).toEqual({provider:"apify",leads_created:2,result_count:4,state:"completed"});
    const made=await first<{id:string;source_kind:string;created_by:string}>("select id,source_kind,created_by from public.leads where name='Café Novo do Centro'");
    expect(made).toMatchObject({source_kind:"maps",created_by:actorA});
    expect((await db.query("select kind,provider from public.evidence_items where lead_id=$1 order by kind",[made.id])).rows).toEqual([{kind:"Cadastro",provider:"maps"},{kind:"Google Maps",provider:"maps"}]);
    expect(await first("select kind,confirmed from public.lead_contacts where lead_id=$1",[made.id])).toEqual({kind:"phone",confirmed:false});
    expect((await db.query("select id from public.leads where name='Mimos Pet'")).rows).toEqual([]);
  });
  it("isola objetos privados e revoga acesso a novas leituras",async()=>{
    await role("authenticated",actorA);
    const asset=request3,path=[orgA,leadA,asset].join("/");
    await db.query("insert into public.brand_assets(id,organization_id,lead_id,object_path,filename,mime,bytes,kind,origin,holder,permission_note,purpose,authorized_on) values($1,$2,$3,$4,'marca.png','image/png',10,'logo','Fixture','Titular de teste','Consentimento teste','Prévia',current_date)",[asset,orgA,leadA,path]);
    await db.query("insert into storage.objects(bucket_id,name) values('specter-materials',$1)",[path]);
    expect((await db.query("select name from storage.objects")).rows).toEqual([{name:path}]);
    await role("authenticated",actorB);
    expect((await db.query("select id from public.brand_assets")).rows).toEqual([]);
    expect((await db.query("select name from storage.objects")).rows).toEqual([]);
    await role("authenticated",actorA);
    await db.query("update public.brand_assets set revoked_at=now() where id=$1",[asset]);
    expect((await db.query("select name from storage.objects")).rows).toEqual([]);
    expect((await db.query("delete from public.brand_assets where id=$1 returning id",[asset])).rows).toEqual([]);
    await expect(db.query("select public.remove_lead($1,$2,'Empresa Teste A')",[orgA,leadA])).rejects.toMatchObject({code:"P2006"});
  });
});

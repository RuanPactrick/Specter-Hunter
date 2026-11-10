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
  if(table==="evidence_items"&&includeEvidence)rows=[{id:"f0000000-0000-4000-8000-000000000004",kind:"Presença digital",observed:"A página oficial não é atualizada desde 2023.",url:null,provider:"manual",source_label:"Fixture de teste visual",consulted_on:"2026-11-09",method:"Fixture",excerpt:null,confidence:"pendente",review:"pending",review_note:null,expires_at:null,export_allowed:false}];
  if(request.method==="HEAD")return write(response,200,null,{"Content-Range":rows.length?"0-0/1":"*/0"});
  if(select.includes("organizations")&&table!=="organization_members")return write(response,400,{message:"Unexpected fixture relation"});
  return write(response,200,rows,{"Content-Range":rows.length?"0-"+(rows.length-1)+"/"+rows.length:"*/0"});
}).listen(3108,"127.0.0.1");

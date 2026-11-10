import { describe,expect,it,vi } from "vitest";
import { brand,cnpjCandidates,pickInstagram,pickSite,receita,researchLead,validCnpj,type Receita } from "../src/lib/research";
import type { SiteRead } from "../src/lib/enrichment";
const lead={name:"Clínica Sorriso Feliz",city:"São Luís",region:"MA",phones:["+559832221234"]};
const r=(title:string,url:string,description="")=>({title,url,description});
const company=(municipio:string):Receita=>({cnpj:"11.222.333/0001-81",razao_social:"SORRISO FELIZ LTDA",nome_fantasia:null,situacao:"ATIVA",abertura:"2015-03-01",porte:"ME",atividade:"Odontologia",municipio,uf:"MA",decisor:"MARTA SILVA"});
const site=(phones:string[]):SiteRead=>({ok:true,url:"https://sorrisofeliz.com.br/",status:200,title:"Sorriso Feliz",found:{emails:[],phones,whatsapp:null,instagram:null,facebook:null,linkedin:null,cnpj:null},
  marketing:{pixel_meta:false,pixel_google:false,mobile:true,whatsapp_button:false,copyright:null,outdated:false}});
describe("Pesquisa na web do que o site não trouxe",()=>{
  it("tira palavras genéricas da marca e valida o dígito do CNPJ",()=>{
    expect(brand("Clínica Sorriso Feliz")).toEqual(["sorriso","feliz"]);
    expect(validCnpj("11.222.333/0001-81")).toBe(true);
    expect(validCnpj("11.222.333/0001-82")).toBe(false);
    expect(cnpjCandidates([r("CNPJ 11.222.333/0001-81","https://cnpj.biz/x","e 11.111.111/1111-11")])).toEqual(["11222333000181"]);
  });
  it("escolhe site e Instagram que carregam a marca, fora de diretórios",()=>{
    expect(pickSite([r("Sorriso Feliz - Doctoralia","https://www.doctoralia.com.br/x"),r("Blog de saúde","https://saude.com/sorriso"),r("Início","https://www.sorrisofeliz.com.br/")],lead.name)).toBe("sorrisofeliz.com.br");
    expect(pickInstagram([r("Clínica Sorriso Feliz (@sorrisofelizslz) • Instagram","https://www.instagram.com/sorrisofelizslz/","São Luís"),r("Post","https://www.instagram.com/p/abc/")],lead.name,lead.city)).toBe("sorrisofelizslz");
    expect(pickInstagram([r("Outra clínica","https://www.instagram.com/dentistaqualquer/")],lead.name,lead.city)).toBeNull();
  });
  it("aceita site achado só quando o telefone confere e CNPJ só na cidade do lead",async()=>{
    const search=vi.fn(async(q:string)=>q.startsWith("CNPJ")?[r("SORRISO FELIZ LTDA 11.222.333/0001-81","https://cnpj.biz/11222333000181")]
      :q.startsWith("site:instagram")?[r("Sorriso Feliz (@sorrisofelizslz)","https://www.instagram.com/sorrisofelizslz/")]:[r("Sorriso Feliz","https://sorrisofeliz.com.br/")]);
    const ok=await researchLead(lead,null,{search,read:async()=>site(["+5598932221234"]),receita:async()=>company("SAO LUIS")});
    expect(ok.site?.ok).toBe(true);
    expect(ok.evidence.map(e=>e.kind)).toEqual(["Site achado na pesquisa","Instagram achado na pesquisa","Cadastro na Receita"]);
    expect(ok.contacts).toEqual([{kind:"instagram",value:"@sorrisofelizslz",normalized:"sorrisofelizslz"}]);
    expect(ok.extra).toEqual({instagram:true,cnpj:true});
    expect(search.mock.calls.length).toBeLessThanOrEqual(4);
    const other=await researchLead(lead,null,{search,read:async()=>site(["+551130001111"]),receita:async()=>company("IMPERATRIZ")});
    expect(other.site).toBeNull();
    expect(other.evidence.map(e=>e.kind)).toEqual(["Possível domínio","Instagram achado na pesquisa","CNPJ não confirmado"]);
    expect(other.extra.cnpj).toBe(false);
  });
  it("lê a BrasilAPI e escolhe o sócio-administrador",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({cnpj:"11222333000181",razao_social:"SORRISO FELIZ LTDA",municipio:"SAO LUIS",uf:"MA",
      qsa:[{nome_socio:"JOAO",qualificacao_socio:"Sócio"},{nome_socio:"MARTA",qualificacao_socio:"Sócio-Administrador"}]})));
    expect(await receita("11.222.333/0001-81",fetcher)).toMatchObject({cnpj:"11.222.333/0001-81",decisor:"MARTA",municipio:"SAO LUIS"});
    expect(await receita("11222333000181",vi.fn(async()=>new Response("",{status:404})))).toBeNull();
  });
});

import { describe,expect,it,vi } from "vitest";
import { apifyProfile,cut,explainAds,explainProfile,instagramUser,isCompanyAd,profileMatches,socialLead,summarizeAds,summarizeProfile,type RawAd } from "../src/lib/social";
import { suggest } from "../src/lib/enrichment";
const now=Date.parse("2026-11-10T12:00:00Z");
const raw={username:"SorrisoFelizSLZ",fullName:"Clínica Sorriso Feliz 😁",followersCount:2300,postsCount:412,biography:"Dentistas em São Luís. (98) 3222-1234",externalUrl:null,
  latestPosts:[{timestamp:"2026-08-08T10:00:00Z",likesCount:40,commentsCount:6},{timestamp:"2026-08-01T10:00:00Z",likesCount:-1,commentsCount:2}]};
const ad=(pageName:string,linkUrl:string|null=null):RawAd=>({adArchiveID:"1",pageName,startDateFormatted:"2026-10-01",snapshot:{pageName,linkUrl}});
describe("Instagram e anúncios pelo Apify",()=>{
  it("resume o perfil, ignora curtida escondida e escreve a leitura",()=>{
    const p=summarizeProfile(raw,now)!;
    expect(p).toMatchObject({user:"sorrisofelizslz",followers:2300,idleDays:94,posts30:0,likes:40});
    expect(explainProfile(p)).toBe("2,3 mil seguidores, 412 posts. Último post há 94 dias: perfil parado. Média de 40 curtidas por post (1,9% de engajamento). Sem link na bio.");
    expect(summarizeProfile({username:"x",error:"not found"})).toBeNull();
    expect(instagramUser("https://www.instagram.com/reel/abc")).toBeNull();
    expect(cut("a\ud83d",5)).toBe("a");
  });
  it("só aceita o @ da pesquisa quando o perfil é da empresa",()=>{
    const p=summarizeProfile(raw,now)!;
    expect(profileMatches(p,"Clínica Sorriso Feliz",null,[])).toBe(true);
    const other={...p,user:"dentistaqualquer",name:"Outro",bio:"ligue 3222-1234"};
    expect(profileMatches(other,"Clínica Sorriso Feliz",null,[])).toBe(false);
    expect(profileMatches(other,"Clínica Sorriso Feliz",null,["+559832221234"])).toBe(true);
  });
  it("conta anúncio só da página da marca ou que leva ao site dela",()=>{
    expect(isCompanyAd(ad("Sorriso Feliz Odonto"),"Clínica Sorriso Feliz",null,null)).toBe(true);
    expect(isCompanyAd(ad("Agência X","https://sorrisofeliz.com.br/promo"),"Clínica Sorriso Feliz","sorrisofeliz.com.br",null)).toBe(true);
    const r=summarizeAds([ad("Sorriso Feliz"),ad("Revista Saúde"),{pageName:"sem id"}],"Clínica Sorriso Feliz",null,null);
    expect(r).toMatchObject({active:1,pages:["Sorriso Feliz"],citedBy:["Revista Saúde"],since:"2026-10-01"});
    expect(explainAds(r,"Clínica Sorriso Feliz")).toBe("Anuncia agora: 1 anúncio ativo na Meta, rodando desde 01/10/2026, pela página Sorriso Feliz. Alguém já cuida do tráfego.");
  });
  it("descarta @ da pesquisa que não é da empresa e não afirma nada sem ter consultado",async()=>{
    const dropped=await socialLead({name:"Clínica Sorriso Feliz",phones:[]},"https://www.instagram.com/outra",true,null,{profile:async()=>({...raw,username:"outra",fullName:"Outra",biography:""}),ads:async()=>[]});
    expect(dropped.dropped).toBe(true);
    expect(dropped.evidence.map(e=>e.kind)).toEqual(["Instagram descartado","Anúncios na Meta"]);
    const skipped=await socialLead({name:"Clínica Sorriso Feliz",phones:[]},"https://www.instagram.com/sorrisofelizslz",false,null,{profile:async()=>undefined,ads:async()=>undefined});
    expect(skipped).toEqual({evidence:[],dropped:false,adsActive:0});
  });
  it("anúncio ativo derruba a oportunidade para baixa",()=>{
    const site={ok:true as const,url:"https://x.com.br/",status:200,title:null,found:{emails:[],phones:[],whatsapp:null,instagram:null,facebook:null,linkedin:null,cnpj:null},
      marketing:{pixel_meta:false,pixel_google:false,mobile:false,whatsapp_button:false,copyright:null,outdated:true}};
    expect(suggest(site).opportunity).toBe("alta");
    expect(suggest(site,{ads:true}).opportunity).toBe("baixa");
  });
  it("chama o ator de perfil com o token no cabeçalho",async()=>{
    const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify([raw])));
    expect((await apifyProfile("sorrisofelizslz","token-de-teste",fetcher))?.followersCount).toBe(2300);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items");
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({Authorization:"Bearer token-de-teste"});
  });
});

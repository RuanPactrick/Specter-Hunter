import { describe,expect,it,vi } from "vitest";
import { apifyMaps,placeToLead,siteDomain } from "../src/lib/maps";
const job={segment:"Odontologia",city:"São Luís",region:"MA"};
const place={placeId:"ChIJ_teste1",title:"Clínica Sorriso",categoryName:"Dentista",address:"Rua A, 10 - Renascença, São Luís - MA",neighborhood:"Renascença",city:"São Luís",
  phoneUnformatted:"+559832221234",website:"https://www.sorriso.com.br/",url:"https://www.google.com/maps/place/?q=place_id:ChIJ_teste1",totalScore:4.8,reviewsCount:120};
describe("Busca no Google Maps pelo Apify",()=>{
  it("converte o lugar no cadastro da carteira com contatos e evidência",()=>{
    const row=placeToLead(place,job)!;
    expect(row.place_id).toBe("ChIJ_teste1");
    expect(row.lead).toMatchObject({name:"Clínica Sorriso",sector:"Odontologia",city:"São Luís",region:"MA",district:"Renascença",domain:"sorriso.com.br",source_label:"Google Maps via Apify"});
    expect(row.lead.contacts.map(c=>c.kind)).toEqual(["phone","website","maps"]);
    expect(row.lead.contacts[0].normalized).toBe("+559832221234");
    expect(row.observed).toContain("nota 4,8 com 120 avaliações");
  });
  it("descarta fechado ou sem nome e não usa rede social como site",()=>{
    expect(placeToLead({...place,permanentlyClosed:true},job)).toBeNull();
    expect(placeToLead({...place,title:" "},job)).toBeNull();
    expect(siteDomain("https://instagram.com/sorriso")).toBeNull();
    const social=placeToLead({...place,website:"https://linktr.ee/sorriso"},job)!;
    expect(social.lead.domain).toBeNull();
    expect(social.observed).toContain("rede social ou agregador");
  });
  it("chama o ator do Maps só com a lista, sem fotos nem avaliações",async()=>{
    const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify([place])));
    expect(await apifyMaps("Odontologia São Luís MA",15,"token-de-teste",fetcher)).toHaveLength(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({searchStringsArray:["Odontologia São Luís MA"],maxCrawledPlacesPerSearch:15,maxImages:0,maxReviews:0});
  });
});

import { describe,expect,it,vi } from "vitest";
import { enrichmentPayload,extract,internalLinks,marketing,readSite } from "../src/lib/enrichment";
const home=`<html><head><title>Clínica Sorriso</title><meta name="viewport" content="width=device-width"></head><body>
<a href="mailto:contato@sorriso.com.br">e-mail</a> <a href="https://wa.me/5598991234567">WhatsApp</a>
<a href="https://www.instagram.com/clinicasorriso">ig</a> <a href="/contato">Contato</a> <a href="https://outro.com/contato">fora</a>
<p>Ligue (98) 3222-1234. CNPJ 12.345.678/0001-90. Fale com logo@2x.png</p><footer>© 2019 Clínica</footer></body></html>`;
describe("Leitura automática do site",()=>{
  it("extrai contatos do HTML e descarta e-mail de lixo",()=>{
    const found=extract(home);
    expect(found.emails).toEqual(["contato@sorriso.com.br"]);
    expect(found.whatsapp).toBe("+5598991234567");
    expect(found.phones).toContain("+559832221234");
    expect(found.instagram).toBe("https://www.instagram.com/clinicasorriso");
    expect(found.cnpj).toBe("12.345.678/0001-90");
  });
  it("lê sinais de marketing sem contar Analytics como anúncio",()=>{
    expect(marketing(home,2026)).toMatchObject({pixel_meta:false,pixel_google:false,mobile:true,whatsapp_button:true,copyright:2019,outdated:true});
    expect(marketing('<script src="https://www.googletagmanager.com/gtag/js"></script>',2026).pixel_google).toBe(false);
    expect(marketing("<script>fbq('init')</script>",2026).pixel_meta).toBe(true);
  });
  it("segue só páginas de contato do mesmo domínio",()=>{
    expect(internalLinks(home,"https://sorriso.com.br/")).toEqual(["https://sorriso.com.br/contato"]);
  });
  it("monta evidências pendentes, contatos válidos e nota sugerida",async()=>{
    const read=vi.fn(async(url:string)=>({url,status:200,html:url.endsWith("/contato")?"<p>atendimento@sorriso.com.br</p>":home}));
    const site=await readSite("sorriso.com.br",read);
    const payload=enrichmentPayload(site);
    expect(read.mock.calls.map(c=>c[0])).toEqual(["https://sorriso.com.br/","https://sorriso.com.br/contato"]);
    expect(payload.evidence.map(e=>e.kind)).toEqual(["Leitura do site","Contatos no site","Sinais de marketing"]);
    expect(payload.contacts.map(c=>c.kind+":"+c.normalized)).toEqual(expect.arrayContaining(["email:atendimento@sorriso.com.br","whatsapp:+5598991234567","instagram:clinicasorriso"]));
    expect(payload.suggestion).toMatchObject({points:80,maximum:85,opportunity:"alta"});
  });
  it("site fora do ar vira evidência, não exceção",async()=>{
    const read=vi.fn(async()=>{throw new Error("address");});
    const payload=enrichmentPayload(await readSite("fora.com.br",read));
    expect(payload.contacts).toEqual([]);
    expect(payload.evidence[0].observed).toContain("não comprova");
    expect(payload.suggestion.points).toBe(0);
    expect(payload.site_status).toBeNull();
  });
  it("site que bloqueia robôs (403) conta como no ar",async()=>{
    const read=vi.fn(async(url:string)=>({url,status:403,html:null}));
    const payload=enrichmentPayload(await readSite("bloqueia.com.br",read));
    expect(payload).toMatchObject({site_status:"owned",site_url:"http://bloqueia.com.br/"});
    expect(payload.evidence[0].observed).toContain("não permite leitura automática");
    expect(payload.suggestion.points).toBe(25);
  });
});
describe("Identidade visual do site",()=>{
  it("acha cores da marca e fontes, ignorando cinzas e fontes genéricas",async()=>{
    const { identity }=await import("../src/lib/enrichment");
    const html=`<meta name="theme-color" content="#0e4d6e"><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700&family=Open+Sans&display=swap" rel="stylesheet">
<style>h1{color:#29A9E0;font-family:'Montserrat',sans-serif}p{color:#333333;font-family:Arial}a{background:#f4b400}.x{color:#29a9e0}</style>`;
    expect(identity(html)).toEqual({colors:["#0E4D6E","#29A9E0","#F4B400"],fonts:["Montserrat","Open Sans"],logo:null});
    expect(identity("<p>nada</p>")).toEqual({colors:[],fonts:[],logo:null});
  });
});
describe("Logo",()=>{
  it("acha o logo no site (imagem com logo, depois ícone) e resolve o endereço",async()=>{
    const { siteLogo }=await import("../src/lib/enrichment");
    expect(siteLogo(`<img src="/banner.jpg"><img class="site-logo" src="/img/marca.png">`,"https://clinica.com.br/")).toBe("https://clinica.com.br/img/marca.png");
    expect(siteLogo(`<link rel="icon" href="/favicon.ico"><link rel="apple-touch-icon" href="https://cdn.x.com/a.png">`,"https://clinica.com.br/")).toBe("https://cdn.x.com/a.png");
    expect(siteLogo(`<img src="data:image/png;base64,AAA" alt="logo"><link rel="shortcut icon" href="ico.png">`,"https://c.com.br/p/")).toBe("https://c.com.br/p/ico.png");
    expect(siteLogo(`<p>sem</p>`,"https://c.com.br/")).toBeNull();
  });
});

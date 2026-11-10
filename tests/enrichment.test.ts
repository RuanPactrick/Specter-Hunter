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
  });
});

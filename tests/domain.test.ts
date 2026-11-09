import { describe,expect,it } from "vitest";
import { contactValue,domain,messageTemplate,nameKey,phone,publicUrl,score,sites,whatsappLink,type Contact } from "../src/lib/domain";
import { csvCell,readCsv,suggestMap,toCsv } from "../src/lib/csv";
import { fileType } from "../src/lib/files";
describe("Dados comerciais",()=>{
  it("normaliza telefone comercial e rejeita ramais e formatos inválidos",()=>{
    expect(phone("(98) 3232-1234")?.normalized).toBe("+559832321234");
    expect(phone("abc 98 3232-1234")).toBeNull();
    expect(phone("+55 98 3232-1234 ramal 7")).toBeNull();
  });
  it("normaliza URLs e domínios sem aceitar credenciais ou esquemas inseguros",()=>{
    expect(publicUrl("WWW.Example.com/a#x")).toBe("https://www.example.com/a");
    expect(domain("https://www.Example.com/path")).toBe("example.com");
    expect(publicUrl("javascript:alert(1)")).toBeNull();
    expect(publicUrl("https://user:pass@example.com")).toBeNull();
    expect(publicUrl("https://127.1")).toBeNull();
    expect(publicUrl("https://example.com\\@evil.com")).toBeNull();
  });
  it("normaliza identificador social e nome para revisão de duplicidade",()=>{
    expect(contactValue("instagram","@Estudio_Oficial")?.normalized).toBe("estudio_oficial");
    expect(contactValue("instagram","https://example.com/perfil")).toBeNull();
    expect(contactValue("instagram","https://instagram.com/p/conteudo")).toBeNull();
    expect(nameKey("  Café    Pátio ")).toBe("cafe patio");
  });
  it("usa apenas evidências disponíveis ao calcular a pontuação parcial",()=>{
    const result=score([{criterion:"gap",points:23,evidence_id:"e1",rationale:"Confirmado"},{criterion:"fit",points:25,evidence_id:"inexistente",rationale:"Inválido"}],new Set(["e1"]));
    expect(result).toEqual({observed:23,maximum:30,coverage:30,provisional:true});
    expect(sites.not_found).toContain("nas consultas realizadas");
  });
  it("não sugere prévia inexistente e exige WhatsApp confirmado",()=>{
    const contact:Contact={id:"test",kind:"whatsapp",value:"Número de teste",normalized:"+15550100123",source_label:"Fixture",consulted_on:"2026-01-01",confirmed:true};
    expect(messageTemplate("preview","Pessoa teste","São Luís",null)).toBe("");
    expect(messageTemplate("confirm","Pessoa teste","São Luís",null)).toContain("criação de sites");
    expect(whatsappLink({...contact,kind:"phone"},"Olá")).toBeNull();
    expect(whatsappLink({...contact,confirmed:false},"Olá")).toBeNull();
    expect(whatsappLink(contact,"Olá & tudo bem?")).toBe("https://wa.me/15550100123?text=Ol%C3%A1%20%26%20tudo%20bem%3F");
  });
});
describe("Arquivos",()=>{
  it("neutraliza fórmulas, preserva aspas e reconhece cabeçalhos",()=>{
    expect(csvCell(" =SUM(A1:A2)")).toBe('"\' =SUM(A1:A2)"');
    expect(csvCell("\targumento")).toBe('"\'\targumento"');
    expect(csvCell('texto, "aspas"')).toBe('"texto, ""aspas"""');
    expect(toCsv([["=1"],["só texto"]])).toContain('"\'=1"');
    const csv=readCsv("Empresa,Segmento,Cidade,UF,Fonte,Data\nTeste,Serviços,São Luís,MA,Cadastro,2026-01-01");
    expect(suggestMap(csv.headers).region).toBe("3");
    expect(csv.rows[0][2]).toBe("São Luís");
    expect(()=>readCsv('col1,col2\n"unterminated,teste')).toThrow();
  });
  it("rejeita extensão, conteúdo ou MIME incoerente",()=>{
    const png=new Uint8Array([137,80,78,71,13,10,26,10]);
    expect(fileType("logo.PNG","image/png",png,"logo")).toBe("image/png");
    expect(fileType("logo.svg","image/svg+xml",png,"logo")).toBeNull();
    expect(fileType("logo.jpg","image/jpeg",png,"logo")).toBeNull();
    expect(fileType("logo.png","image/png",png,"document")).toBeNull();
  });
});

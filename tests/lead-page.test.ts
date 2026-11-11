import { describe, expect, it } from "vitest";
import { contactHref, decodeEntities, outreachChannel, outreachContacts, outreachHref, type Contact } from "../src/lib/domain";
describe("Ficha da empresa", () => {
  it("decodifica entidades de títulos de site", () => {
    expect(decodeEntities("Smart Odonto &#8211; Clínica &amp; Cia &#x2013; &nbsp;SLZ &bogus;")).toBe("Smart Odonto – Clínica & Cia –  SLZ &bogus;");
  });
  it("monta o atalho certo para cada canal e recusa o que não é válido", () => {
    expect(contactHref("whatsapp", "+5598982200011", "+55 98 98220 0011")).toBe("https://wa.me/5598982200011");
    expect(contactHref("phone", "+559833118254", "x")).toBe("tel:+559833118254");
    expect(contactHref("email", "oi@a.com.br", "oi@a.com.br")).toBe("mailto:oi@a.com.br");
    expect(contactHref("instagram", "smartodontoslz", "@smartodontoslz")).toBe("https://www.instagram.com/smartodontoslz");
    expect(contactHref("whatsapp", "123", "123")).toBeNull();
    expect(contactHref("website", "x", "javascript:alert(1)")).toBeNull();
  });
  it("oferece apenas canais confirmados e abre a ação correspondente", () => {
    const make=(id:string,kind:Contact["kind"],confirmed=true):Contact=>({id,kind,value:id+"@example.com",normalized:kind==="phone"||kind==="whatsapp"?"+5598982200011":id+"@example.com",source_label:"Teste",consulted_on:"2026-01-01",confirmed});
    const whatsapp=make("whatsapp","whatsapp"),email=make("contato","email"),phone=make("phone","phone"),pending=make("pendente","email",false),instagram=make("instagram","instagram");
    expect(outreachContacts([email,pending,instagram,phone,whatsapp])).toEqual([whatsapp,email,phone]);
    expect(outreachChannel(phone)).toBe("Ligação");
    expect(outreachHref(whatsapp,"Oi & olá","Empresa Teste")).toBe("https://wa.me/5598982200011?text=Oi%20%26%20ol%C3%A1");
    expect(outreachHref(email,"Oi & olá","Empresa Teste")).toBe("mailto:contato@example.com?subject=Sobre%20a%20presen%C3%A7a%20digital%20de%20Empresa%20Teste&body=Oi%20%26%20ol%C3%A1");
    expect(outreachHref(phone,"Oi","Empresa Teste")).toBe("tel:+5598982200011");
    expect(outreachHref(pending,"Oi","Empresa Teste")).toBeNull();
  });
});

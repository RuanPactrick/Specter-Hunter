import { describe, expect, it } from "vitest";
import { contactHref, decodeEntities } from "../src/lib/domain";
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
});

import { expect, test } from "vitest";
import { referenceSearches, sitePrompt, withReferences } from "../src/lib/site-prompt";

const base = { name: "Clínica Sorriso", sector: "Odontologia", place: "Centro, Recife – PE", colors: [], fonts: [], logo: false, instagram: false, facts: [] };

test("prompt sem dados não fala do que faltou e deixa a tecnologia explícita", () => {
  const text = sitePrompt({ ...base, facts: [{ kind: "Leitura do site", observed: "O site não permite leitura automática." }, { kind: "Anúncios na Meta", observed: "Nenhum anúncio ativo." }] });
  expect(text).toMatch(/HTML5.*CSS.*JavaScript puro/);
  expect(text).not.toMatch(/não permite|Nenhum anúncio|Identidade:|Diferenciais:|a definir|a confirmar/);
  expect(text).not.toMatch(/avaliações|como chegar/);
});

test("prompt usa só o que foi encontrado", () => {
  const text = sitePrompt({ ...base, colors: ["#112233"], fonts: ["Poppins", "Inter"], logo: true, rating: ["4,9", "173"], address: "Rua A, 10", whatsapp: "+55 81 99999-0000", instagram: true,
    facts: [{ kind: "Google Maps", observed: "Odontologia; Rua A, 10, Recife" }, { kind: "Leitura do site", observed: "O site respondeu HTTP 200. Título: Smart Odonto." },
      { kind: "Cadastro na Receita", observed: "36.725.708/0001-57; razão social X LTDA; situação ATIVA; aberta em 2020; porte ME." }] });
  expect(text).toContain("título do site atual: Smart Odonto | no mercado desde 2020");
  expect(text).not.toMatch(/HTTP|0001-57/);
  expect(text).toContain("cores #112233 (principal)");
  expect(text).toContain("fontes Poppins para títulos e Inter para textos");
  expect(text).toContain("nota 4,9 (173 avaliações");
  expect(text).toContain("Dados reais para usar no texto: Odontologia; Rua A, 10, Recife");
});

test("referências entram uma vez, antes da direção de arte, e saem quando apagadas", () => {
  const text = sitePrompt(base);
  const once = withReferences(withReferences(text, ["https://dribbble.com/shots/1", " "]), ["https://dribbble.com/shots/2"]);
  expect(once.match(/Referências visuais/g)).toHaveLength(1);
  expect(once).toContain("shots/2");
  expect(once.indexOf("Referências visuais")).toBeLessThan(once.indexOf("Direção de arte"));
  expect(withReferences(once, [])).toBe(text);
  expect(referenceSearches("Odontologia")[0].url).toBe("https://dribbble.com/search/dental%20clinic%20website");
});

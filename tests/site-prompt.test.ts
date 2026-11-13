import { expect, test } from "vitest";
import { noAiLook, noAiRules, referenceSearches, sitePrompt, withReferences } from "../src/lib/site-prompt";

const base = { name: "Clínica Sorriso", sector: "Odontologia", place: "Centro, Recife – PE", colors: [], fonts: [], logo: false, instagram: false, facts: [] };

test("prompt sem dados não fala do que faltou, deixa a tecnologia explícita e não inventa provas", () => {
  const text = sitePrompt({ ...base, facts: [{ kind: "Leitura do site", observed: "O site não permite leitura automática." }, { kind: "Anúncios na Meta", observed: "Nenhum anúncio ativo." }] });
  expect(text).toMatch(/HTML5.*CSS.*JavaScript puro/);
  expect(text).not.toMatch(/não permite|Nenhum anúncio|a definir|a confirmar|★|Conteúdo real|wa\.me/);
  expect(text).toContain("Crie uma paleta própria");
  expect(text).toContain("logotipo tipográfico");
  expect(text).toContain("[números da empresa");
  expect(text).toContain("antes e depois com slider"); // direção de arte de odontologia
  expect(text).toContain("quem procura odontologia em Recife");
  expect(text).not.toMatch(/\n\n\n|^\n|\n- \n/);
});

test("prompt usa o que foi encontrado, inclusive o conteúdo do site atual", () => {
  const text = sitePrompt({ ...base, colors: ["#112233"], fonts: ["Poppins", "Inter"], logo: true, rating: ["4,9", "173"], address: "Rua A, 10", whatsapp: "+55 81 99999-0000", instagram: true,
    facts: [{ kind: "Google Maps", observed: "Odontologia; Rua A, 10, Recife" }, { kind: "Leitura do site", observed: "O site respondeu HTTP 200. Título: Smart Odonto." },
      { kind: "Cadastro na Receita", observed: "36.725.708/0001-57; razão social X LTDA; situação ATIVA; aberta em 2020; porte ME." },
      { kind: "Perfil do Instagram", observed: "@sorriso: 21 mil seguidores, 1120 posts." },
      { kind: "Conteúdo do site", observed: "Itens e serviços: Implantes; Lentes de contato dental\nHorário: Segunda a sexta, das 8h às 18h\nImagens: https://sorriso.com.br/f.jpg (Consultório)" }] });
  expect(text).toContain("título do site atual: Smart Odonto | no mercado desde 2020");
  expect(text).not.toMatch(/HTTP|0001-57/);
  expect(text).toContain("#112233 (principal)");
  expect(text).toContain("Poppins nos títulos e Inter nos textos");
  expect(text).toContain("nota 4,9 ★ com 173 avaliações no Google · desde 2020 · 21 mil seguidores no Instagram");
  expect(text).toContain("3. Serviços: a partir de: Implantes; Lentes de contato dental.");
  expect(text).toContain("horário: Segunda a sexta, das 8h às 18h");
  expect(text).toContain("  Imagens: https://sorriso.com.br/f.jpg (Consultório)");
  expect(text).toContain("https://wa.me/5581999990000?text=Ol%C3%A1!%20Vi%20o%20site");
  expect(text).toContain("Rua A, 10, com mapa do Google Maps");
});

test("referências entram uma vez, logo depois do título da direção de arte, e saem quando apagadas", () => {
  const text = sitePrompt(base);
  const once = withReferences(withReferences(text, ["https://dribbble.com/shots/1", " "]), ["https://dribbble.com/shots/2"]);
  expect(once.match(/Referências visuais/g)).toHaveLength(1);
  expect(once).toContain("shots/2");
  expect(once).toContain("## Direção de arte\nReferências visuais:");
  expect(withReferences(once, [])).toBe(text);
  expect(withReferences("Direção de arte antiga", ["x"])).toMatch(/^Referências visuais: x.*\nDireção de arte antiga$/);
  expect(referenceSearches("Odontologia")[0].url).toBe("https://dribbble.com/search/dental%20clinic%20website");
});

test("as regras contra visual de IA sempre voltam, inteiras e no lugar, mesmo apagadas ou reescritas", () => {
  const text = sitePrompt(base);
  expect(text).toContain(noAiRules + "\n\n## Regras");
  expect(noAiLook(text)).toBe(text);
  const removed = text.replace(noAiRules + "\n\n", "");
  expect(noAiLook(removed)).toBe(removed + "\n\n" + noAiRules);
  const softened = text.replace(noAiRules, "## Proibido: cara de site feito por IA\nPode usar degradê roxo.");
  expect(noAiLook(softened)).toBe(text);
});

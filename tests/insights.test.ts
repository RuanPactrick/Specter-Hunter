import { describe, expect, it } from "vitest";
import { marketingChecks, metrics, salesAngle } from "../src/lib/insights";
import type { Evidence } from "../src/lib/domain";
const ev = (kind: string, observed: string) => ({ id: kind, kind, observed, review: "pending" }) as Evidence;
const ig = "@smartodontoslz: 21 mil seguidores, 1120 posts. 7 posts nos últimos 30 dias. Média de 13 curtidas por post (0,1% de engajamento).";
const maps = "Encontrada no Google Maps como Clínica odontológica: nota 4,9 com 173 avaliações; Shopping da Ilha.";
const mk = "Página inicial: tem pixel de anúncio (Meta), rodapé parado em 2021, com botão de WhatsApp. Oportunidade sugerida: baixa.";
describe("Achados em números", () => {
  it("lê as métricas que o robô escreve", () => {
    expect(metrics("Perfil do Instagram", ig)).toEqual([{ value: "21 mil", label: "seguidores" }, { value: "7", label: "posts em 30 dias", alert: false }, { value: "0,1%", label: "engajamento", alert: true }]);
    expect(metrics("Google Maps", maps).map(m => m.value)).toEqual(["4,9 ★", "173"]);
    expect(metrics("Sinais de marketing", mk)).toEqual([{ value: "2021", label: "última atualização", alert: true }]);
    expect(metrics("Anúncios na Meta", "Nenhum anúncio ativo com o nome \"X\".")[0].value).toBe("Nenhum");
    expect(metrics("Cadastro na Receita", "1; razão social X LTDA; situação ATIVA; aberta em 2020; porte ME")).toEqual([{ value: "Ativa", label: "situação" }, { value: "2020", label: "aberta em" }]);
  });
  it("transforma os sinais de marketing em lista e monta o argumento só com o que foi achado", () => {
    expect(marketingChecks(mk)).toEqual([{ text: "Tem pixel de anúncio (Meta)", ok: true }, { text: "Rodapé parado em 2021", ok: false }, { text: "Com botão de WhatsApp", ok: true }]);
    const angle = salesAngle([ev("Sinais de marketing", mk), ev("Perfil do Instagram", ig), ev("Google Maps", maps)]);
    expect(angle.hooks.map(h => h.title)).toEqual(["Site desatualizado", "0,1% de engajamento", "Nota 4,9 no Maps"]);
    expect(angle.chance).toBe("média");
    expect(salesAngle([]).hooks).toEqual([]);
  });
});
it("resume o texto quando os números já aparecem",async()=>{
  const { brief }=await import("../src/lib/insights");
  expect(brief("Leitura do site","O site respondeu HTTP 200. Título: Smart Odonto &#8211; Clínica.")).toBe("“Smart Odonto – Clínica”");
  expect(brief("Google Maps",maps)).toBe("Shopping da Ilha.");
  expect(brief("Cadastro na Receita","36.725.708/0001-57 (publicado no site); razão social CALISTO LTDA; situação ATIVA")).toBe("CALISTO LTDA · 36.725.708/0001-57");
  expect(brief("Perfil do Instagram",ig)).toBeNull();
});

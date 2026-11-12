import { expect, test } from "vitest";
import { analyzeFeed, downloadImage, feedText, pickPhotos, readAnalysis, readFeed } from "../src/lib/feed-photos";
import { feedImages } from "../src/lib/social";
import { sitePrompt } from "../src/lib/site-prompt";

const photo = (index: number, extra: object) => ({ index, person: false, kind: "ambiente", authority: 5, use: "ambiente", description: "Recepção clara", ...extra });
const raw = { palette: ["#1a2b3c", "azul", "#FFFFFF"], style: "Clean e claro", advice: "Uma foto da doutora de jaleco no consultório",
  photos: [photo(0, { kind: "texto", authority: 9, use: "não usar" }), photo(1, { person: true, kind: "profissional", authority: 7, use: "sobre", description: "Doutora sorrindo no consultório" }),
    photo(2, { person: true, kind: "profissional", authority: 9, use: "topo", description: "Doutora de jaleco, fundo neutro" }), photo(3, { authority: 2 }), photo(9, {}), photo(1, { authority: 10 })] };

test("valida a resposta do Gemini e escolhe primeiro a pessoa principal", () => {
  const a = readAnalysis(raw, 4);
  expect(a.palette).toEqual(["#1A2B3C", "#FFFFFF"]);
  expect(a.photos.map(p => p.index)).toEqual([0, 1, 2, 3]); // índice fora do enviado e repetido saem
  expect(pickPhotos(a).map(p => p.index)).toEqual([2, 1]); // texto, "não usar" e nota baixa ficam de fora
});

test("o texto salvo volta a ser lido e entra no prompt do site", () => {
  const a = readAnalysis(raw, 4);
  const text = feedText(a, pickPhotos(a));
  expect(text.length).toBeLessThanOrEqual(2000);
  const feed = readFeed(text)!;
  expect(feed).toMatchObject({ style: "Clean e claro", palette: ["#1A2B3C", "#FFFFFF"], advice: "Uma foto da doutora de jaleco no consultório" });
  expect(feed.photos).toEqual([{ n: 1, use: "topo", authority: 9, person: true, description: "Doutora de jaleco, fundo neutro" }, { n: 2, use: "sobre", authority: 7, person: true, description: "Doutora sorrindo no consultório" }]);
  const prompt = sitePrompt({ name: "X", sector: "Odontologia", place: "Recife", colors: feed.palette, fonts: [], logo: false, instagram: true, facts: [], photos: feed.photos, feedStyle: feed.style });
  expect(prompt).toContain("Fotos reais anexadas, na ordem: 1) topo: Doutora de jaleco, fundo neutro; 2) sobre:");
  expect(prompt).toContain("Estilo visual que a empresa já usa no Instagram: Clean e claro.");
  expect(prompt).not.toContain("fotos reais do Instagram da empresa no lugar");
});

test("só baixa imagem dos servidores do Instagram", async () => {
  let called = 0;
  const fetcher = (async () => { called++; return new Response(new Uint8Array([255, 216, 255]), { headers: { "content-type": "image/jpeg" } }); }) as typeof fetch;
  expect(await downloadImage("https://evil.example/a.jpg", fetcher)).toBeNull();
  expect(await downloadImage("https://scontent-gru2-1.cdninstagram.com/v/a.jpg", fetcher)).toMatchObject({ mime: "image/jpeg" });
  expect(called).toBe(1);
  expect(feedImages({ latestPosts: [{ timestamp: "2026-01-01", displayUrl: "https://a.cdninstagram.com/1", url: "p1" }, { timestamp: "2026-02-01", displayUrl: "http://x/2" }, { timestamp: "2026-03-01", displayUrl: "https://a.cdninstagram.com/3", url: "p3" }] } as never))
    .toEqual([{ image: "https://a.cdninstagram.com/3", post: "p3" }, { image: "https://a.cdninstagram.com/1", post: "p1" }]);
});

test("manda as fotos ao Gemini e tenta o próximo modelo se um falhar", async () => {
  const models: string[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    models.push(url.match(/models\/([^:]+)/)![1]);
    if (models.length === 1) return new Response("{}", { status: 404 });
    expect(JSON.parse(String(init.body)).contents[0].parts[1].inlineData).toEqual({ mimeType: "image/jpeg", data: "/9j/" });
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(raw) }] } }] });
  }) as typeof fetch;
  const a = await analyzeFeed([{ mime: "image/jpeg", bytes: new Uint8Array([255, 216, 255]) }], { name: "X", sector: "Odontologia" }, "k", ["sumido", "gemini-3.6-flash"], fetcher);
  expect(models).toEqual(["sumido", "gemini-3.6-flash"]);
  expect(a.photos.map(p => p.index)).toEqual([0]);
});

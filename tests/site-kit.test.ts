import { expect, test } from "vitest";
import { crc32 } from "node:zlib";
import { kitTexts } from "../src/lib/kit-files";
import { zip } from "../src/lib/zip";

// lê o ZIP pelo diretório central, como um descompactador faz
async function unzip(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer()), v = new DataView(buf.buffer), end = buf.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  let at = v.getUint32(end + 16, true);
  const out: Record<string, Uint8Array> = {};
  for (let i = 0; i < v.getUint16(end + 10, true); i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    const size = v.getUint32(at + 20, true), len = v.getUint16(at + 28, true), local = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(buf.subarray(at + 46, at + 46 + len));
    const data = buf.subarray(local + 30 + v.getUint16(local + 26, true), local + 30 + v.getUint16(local + 26, true) + size);
    expect(crc32(data)).toBe(v.getUint32(at + 16, true));
    out[name] = data; at += 46 + len;
  }
  return out;
}

test("a pasta leva o prompt final, o guia, as cores e os arquivos com acento no nome", async () => {
  const texts = kitTexts({ name: "Clínica Sorriso & Cia", sector: "Odontologia", address: "Rua A, 10" },
    { colors: ["#112233", "#FFFFFF"], fonts: ["Poppins", "Inter"], rating: ["x", "4,9", "173"] as never, place: "Centro, São Luís – MA",
      feed: { style: "Clean", palette: [], advice: "", photos: [{ n: 1, use: "topo", authority: 9, person: true, description: "Doutora de jaleco" }] },
      whatsapp: "+55 98 99999-0000", facts: [{ kind: "Google Maps", observed: "Encontrada no Google Maps como Clínica &amp; cia" }],
      photoNames: [{ n: 1, file: "1.jpg" }], logoFile: "logo.png" },
    "  Prompt editado pelo vendedor  ", ["https://dribbble.com/shots/1"]);
  const files = await unzip(zip([...texts, { name: "clinica-sorriso-cia-site/fotos/1.jpg", data: new Uint8Array([255, 216, 255]) }]));
  const text = (n: string) => new TextDecoder().decode(files["clinica-sorriso-cia-site/" + n]);
  expect(Object.keys(files)).toEqual(["clinica-sorriso-cia-site/prompt.txt", "clinica-sorriso-cia-site/LEIA-ME.md", "clinica-sorriso-cia-site/cores.css", "clinica-sorriso-cia-site/paleta.svg", "clinica-sorriso-cia-site/fotos/1.jpg"]);
  expect(text("prompt.txt")).toBe("Prompt editado pelo vendedor\n");
  expect(text("cores.css")).toContain("--cor-principal: #112233;");
  expect(text("cores.css")).toContain("--fonte-textos: \"Inter\"");
  const readme = text("LEIA-ME.md");
  expect(readme).toContain("Google: nota 4,9 com 173 avaliações");
  expect(readme).toContain("- fotos/1.jpg: topo · Doutora de jaleco");
  expect(readme).toContain("Clínica & cia");
  expect(readme).toContain("- https://dribbble.com/shots/1");
  expect(readme).not.toMatch(/\n\n\n/);
});

import { crc32 } from "node:zlib";

/** ZIP sem compressão (as imagens já vêm comprimidas): cabeçalho local, dados e diretório central de cada arquivo. */
export function zip(files: { name: string; data: Uint8Array | string }[]) {
  const enc = new TextEncoder(), parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = enc.encode(file.name), data = typeof file.data === "string" ? enc.encode(file.data) : file.data, crc = crc32(data);
    // versão 20, bit 11 = nome em UTF-8 (acentos), método 0 = guardado, data 1/1/2026
    const fields = (h: DataView, at: number) => { h.setUint16(at, 20, true); h.setUint16(at + 2, 0x800, true); h.setUint16(at + 4, 0, true); h.setUint16(at + 6, 0, true); h.setUint16(at + 8, (46 << 9) | (1 << 5) | 1, true);
      h.setUint32(at + 10, crc, true); h.setUint32(at + 14, data.length, true); h.setUint32(at + 18, data.length, true); h.setUint16(at + 22, name.length, true); };
    const local = new Uint8Array(30), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); fields(lv, 4);
    const dir = new Uint8Array(46), dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); fields(dv, 6); dv.setUint32(42, offset, true);
    parts.push(local, name, data); central.push(dir, name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end].map(p => p.slice()), { type: "application/zip" });
}

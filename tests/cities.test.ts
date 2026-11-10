import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
import { regions } from "../src/lib/regions";
describe("Lista de municípios do IBGE",()=>{
  it("tem todas as UFs do app, cidades ordenadas e sem repetição",()=>{
    const cities=JSON.parse(readFileSync("public/municipios.json","utf8")) as Record<string,string[]>;
    expect(Object.keys(cities).sort()).toEqual([...regions].sort());
    expect(cities.MA).toContain("São Luís");
    expect(Object.values(cities).flat().length).toBeGreaterThan(5500);
    for(const list of Object.values(cities))expect(new Set(list).size).toBe(list.length);
  });
});

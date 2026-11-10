"use client";
import { useEffect, useState } from "react";
import { regions } from "@/lib/regions";

// public/municipios.json: municípios do IBGE por UF (gerado da API de localidades, ~84 KB). Carregado uma vez por página.
let cache: Promise<Record<string, string[]> | null> | null = null;
const load = () => cache ??= fetch("/municipios.json").then(r => r.ok ? r.json() : null).catch(() => null).then(data => { if (!data) cache = null; return data; });

/** Estado e cidade ligados: escolher o estado troca as cidades. Sem a lista (falha de rede), a cidade vira campo de texto. */
export function StateCity({ region = "", city = "", filter = false }: { region?: string; city?: string; filter?: boolean }) {
  const [uf, setUf] = useState(region);
  const [name, setName] = useState(city);
  const [all, setAll] = useState<Record<string, string[]> | null | undefined>(undefined);
  useEffect(() => { void load().then(setAll); }, []);
  const options = uf ? all?.[uf] ?? [] : [];
  const list = name && !options.includes(name) ? [name, ...options] : options;
  const placeholder = filter ? "Todas" : !uf ? "Escolha o estado" : all === undefined ? "Carregando…" : "Selecione";
  return <>
    <label className="field"><span>Estado</span>
      <select name="region" value={uf} required={!filter} onChange={e => { setUf(e.target.value); setName(""); }}>
        {filter && <option value="">Todos</option>}
        {regions.map(r => <option key={r} value={r}>{r}</option>)}
      </select></label>
    <label className="field"><span>Cidade</span>
      {all === null
        ? <input name="city" value={name} onChange={e => setName(e.target.value)} required={!filter} maxLength={100} placeholder={filter ? "Todas" : ""}/>
        : <select name="city" value={name} required={!filter} onChange={e => setName(e.target.value)}>
            <option value="">{placeholder}</option>
            {list.map(c => <option key={c} value={c}>{c}</option>)}
          </select>}
    </label>
  </>;
}

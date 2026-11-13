"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Field } from "./ui";
import { CopyText } from "./copy-text";
import { AiRefine, type Refine } from "./ai-refine";
import { noAiLook, withReferences } from "@/lib/site-prompt";
/** Prompt do site: gerado com tudo o que sabemos da empresa, editável e refinado em conversa com a IA. */
export function PromptEditor({ initial, refine, aiName = "Gemini", download }: { initial: string; refine?: Refine; aiName?: string; download?: string }) {
  const [prompt, setPrompt] = useState(initial);
  const [refs, setRefs] = useState("");
  return <div className="stack">
    <Field label="Links de referência" hint="Um por linha (Dribbble, Behance, sites reais). Entram no prompt como direção visual."><textarea rows={2} maxLength={600} value={refs} placeholder="https://dribbble.com/shots/..."
      onChange={e => { setRefs(e.target.value); setPrompt(p => withReferences(p, e.target.value.split("\n"))); }} /></Field>
    <Field label="Prompt" hint="Gerado com identidade, fatos e diferenciais da empresa. Edite à vontade."><textarea className="prompt-box" rows={16} maxLength={12000} value={prompt} onChange={e => setPrompt(e.target.value)} /></Field>
    <div className="actions"><CopyText value={noAiLook(prompt)} label="Copiar prompt" /><a className="btn" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">Abrir no Claude ↗</a>
      {prompt !== initial && <button type="button" className="btn ghost" onClick={() => setPrompt(withReferences(initial, refs.split("\n")))}>Voltar ao gerado</button>}<span className="meta grow-right">{prompt.length} caracteres</span></div>
    {download && <form method="post" action={download} className="kit-download"><input type="hidden" name="prompt" value={noAiLook(prompt)} /><input type="hidden" name="refs" value={refs} />
      <button type="submit" className="btn primary"><Download size={16} aria-hidden="true" />Baixar pasta do site (.zip)</button>
      <span className="meta">Leva o prompt como está acima, o logo, as cores, as fontes, as fotos do feed e um guia de uso.</span></form>}
    {refine && <AiRefine refine={refine} name={aiName} content={prompt} purpose="Prompt do site de demonstração" onText={setPrompt} noun="prompt"
      quick={["Melhorar o prompt", "Fugir do visual padrão de IA", "Mais detalhes de cada seção", "Focar em agendamentos", "Deixar mais curto"]}
      placeholder="Ex.: tom mais premium; seção de antes e depois; paleta com mais contraste" />}
  </div>;
}

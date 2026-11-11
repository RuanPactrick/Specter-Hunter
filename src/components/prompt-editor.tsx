"use client";
import { useState } from "react";
import { Field } from "./ui";
import { CopyText } from "./copy-text";
import { AiRefine, type Refine } from "./ai-refine";
import { withReferences } from "@/lib/site-prompt";
/** Prompt do site: gerado com tudo o que sabemos da empresa, editável e refinado em conversa com a IA. */
export function PromptEditor({ initial, refine, aiName = "Gemini" }: { initial: string; refine?: Refine; aiName?: string }) {
  const [prompt, setPrompt] = useState(initial);
  const [refs, setRefs] = useState("");
  return <div className="stack">
    <Field label="Links de referência" hint="Um por linha (Dribbble, Behance, sites reais). Entram no prompt como direção visual."><textarea rows={2} maxLength={600} value={refs} placeholder="https://dribbble.com/shots/..."
      onChange={e => { setRefs(e.target.value); setPrompt(p => withReferences(p, e.target.value.split("\n"))); }} /></Field>
    <Field label="Prompt" hint="Gerado com identidade, fatos e diferenciais da empresa. Edite à vontade."><textarea className="prompt-box" rows={12} maxLength={3400} value={prompt} onChange={e => setPrompt(e.target.value)} /></Field>
    <div className="actions"><CopyText value={prompt} label="Copiar prompt" /><a className="btn" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">Abrir no Claude ↗</a>
      {prompt !== initial && <button type="button" className="btn ghost" onClick={() => setPrompt(withReferences(initial, refs.split("\n")))}>Voltar ao gerado</button>}<span className="meta grow-right">{prompt.length} caracteres</span></div>
    {refine && <AiRefine refine={refine} name={aiName} content={prompt} purpose="Prompt do site de demonstração" onText={setPrompt} noun="prompt"
      quick={["Melhorar o prompt", "Fugir do visual padrão de IA", "Mais detalhes de cada seção", "Focar em agendamentos", "Deixar mais curto"]}
      placeholder="Ex.: tom mais premium; seção de antes e depois; paleta com mais contraste" />}
  </div>;
}

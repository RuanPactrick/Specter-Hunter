"use client";
import { useState } from "react";
import { Field } from "./ui";
import { CopyText } from "./copy-text";
import { AiRefine, type Refine } from "./ai-refine";
/** Prompt do site: gerado com tudo o que sabemos da empresa, editável e refinado em conversa com a IA. */
export function PromptEditor({ initial, refine, aiName = "Gemini" }: { initial: string; refine?: Refine; aiName?: string }) {
  const [prompt, setPrompt] = useState(initial);
  return <div className="stack">
    <Field label="Prompt" hint="Gerado com identidade, fatos e diferenciais da empresa. Edite à vontade."><textarea className="prompt-box" rows={12} maxLength={3400} value={prompt} onChange={e => setPrompt(e.target.value)} /></Field>
    <div className="actions"><CopyText value={prompt} label="Copiar prompt" /><a className="btn" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">Abrir no Claude ↗</a>
      {prompt !== initial && <button type="button" className="btn ghost" onClick={() => setPrompt(initial)}>Voltar ao gerado</button>}<span className="meta grow-right">{prompt.length} caracteres</span></div>
    {refine && <AiRefine refine={refine} name={aiName} content={prompt} purpose="Prompt do site de demonstração" onText={setPrompt} noun="prompt"
      quick={["Melhorar o prompt", "Fugir do visual padrão de IA", "Mais detalhes de cada seção", "Focar em agendamentos", "Deixar mais curto"]}
      placeholder="Ex.: tom mais premium; seção de antes e depois; paleta com mais contraste" />}
  </div>;
}

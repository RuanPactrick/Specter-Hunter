"use client";
import { useActionState } from "react";
import type { AssistiveState } from "@/lib/assistive-action";
import { CopyText } from "./copy-text";
import { Field,Notice,Select } from "./ui";
import { Submit } from "./submit";
export function AssistiveEditor({action,options,evidence}:{action:(state:AssistiveState,data:FormData)=>Promise<AssistiveState>;options:Record<string,string>;evidence:{id:string;observed:string}[]}) {
  const [state,submit]=useActionState(action,{});
  return <div className="pad stack"><form action={submit} className="stack"><Field label="Finalidade da IA"><Select name="mode" options={options}/></Field>
    <fieldset><legend className="font-bold">Selecione até oito observações autorizadas</legend>{evidence.map(e=><label className="check" key={e.id}><input type="checkbox" name="evidence_id" value={e.id}/>{e.observed}</label>)}</fieldset>
    <label className="check"><input type="checkbox" name="permission" required/>Revisei os trechos selecionados e autorizo enviá-los ao provedor para gerar este rascunho.</label><Submit>Gerar sugestões</Submit>
  </form>{state.error&&<Notice tone="error">{state.error}</Notice>}{state.draft!==undefined&&<div className="stack"><Notice>Rascunho gerado por IA. Revise cada inferência antes de copiar.</Notice>
  {state.facts?.length?<div><h3>Observações selecionadas</h3><ul className="list-disc pl-5">{state.facts.map(f=><li key={f}>{f}</li>)}</ul></div>:null}
  {state.suggestions?.length?<div><h3>Inferências e sugestões</h3><ul className="list-disc pl-5">{state.suggestions.map((s,i)=><li key={i}>{s.text}<div className="meta">Evidências: <code>{s.refs.join(", ")}</code></div></li>)}</ul></div>:null}
  {state.questions?.length?<div><h3>Perguntas</h3><ul className="list-disc pl-5">{state.questions.map((q,i)=><li key={i}>{q}</li>)}</ul></div>:null}
  <Field label="Rascunho para revisão"><textarea readOnly value={state.draft}/></Field>{state.draft&&<CopyText value={state.draft} label="Copiar rascunho"/>}</div>}</div>;
}

"use client";
import { useActionState,useState } from "react";
import type { AssistiveState } from "@/lib/assistive-action";
import { CopyText } from "./copy-text";
import { Field,Notice,Select } from "./ui";
import { Submit } from "./submit";
export function AssistiveEditor({action,options,evidence,company,provider}:{action:(state:AssistiveState,data:FormData)=>Promise<AssistiveState>;options:Record<string,string>;evidence:{id:string;observed:string;source:string}[];company:string;provider:string}) {
  const [state,submit]=useActionState(action,{});
  const modes=Object.keys(options);
  return <div className="inner stack"><form action={submit} className="stack">
    {modes.length===1?<input type="hidden" name="mode" value={modes[0]}/>:<Field label="O que você quer gerar?"><Select name="mode" options={options}/></Field>}
    {modes.includes("objection")&&<Field label="O que a empresa respondeu" hint="Só para responder a uma objeção. Ex.: já temos site, agora não, quanto custa?"><input name="reply" maxLength={400}/></Field>}
    <p>Cadastro enviado: <strong>{company}</strong></p>
    <fieldset><legend className="font-bold">Selecione de uma a oito evidências confirmadas</legend>{evidence.map(e=><label className="check" key={e.id}><input type="checkbox" name="evidence_id" value={e.id}/><span>{e.observed}<small className="block meta">{e.source}</small></span></label>)}</fieldset>
    <label className="check"><input type="checkbox" name="permission" required/>Autorizo enviar o cadastro acima e os trechos selecionados ao {provider}. Use apenas informações comerciais públicas, sem dados pessoais ou confidenciais.</label><Submit>Gerar rascunho</Submit>
  </form>{state.error&&<Notice tone="error">{state.error}</Notice>}{state.draft!==undefined&&<div className="stack"><Notice>Revise o rascunho e confirme as sugestões antes de usar.</Notice>
  {state.facts?.length?<div><h3>Fatos confirmados</h3><ul className="list-disc pl-5">{state.facts.map(f=><li key={f.id}>{f.text}<div className="meta">{f.source}</div></li>)}</ul></div>:null}
  {state.suggestions?.length?<div><h3>Sugestões</h3><ul className="list-disc pl-5">{state.suggestions.map((s,i)=><li key={i}>{s.text}<div className="meta">Com base em: {s.refs.join("; ")}</div></li>)}</ul></div>:null}
  {state.questions?.length?<div><h3>O que confirmar</h3><ul className="list-disc pl-5">{state.questions.map((q,i)=><li key={i}>{q}</li>)}</ul></div>:null}
  <EditableDraft key={state.draft} initial={state.draft}/></div>}</div>;
}
function EditableDraft({initial}:{initial:string}) {
  const [value,setValue]=useState(initial);
  return <><Field label="Rascunho editável"><textarea rows={8} value={value} onChange={e=>setValue(e.target.value)}/></Field><CopyText value={value} label="Copiar rascunho"/></>;
}

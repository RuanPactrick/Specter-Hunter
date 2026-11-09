"use client";
import { useActionState } from "react";
import { Field, Notice, SafeLink } from "./ui";
import { Submit } from "./submit";
import type { LookupState } from "@/lib/research-actions";
function Result({ state }:{state:LookupState}) {
  return <>{state.error&&<Notice tone="error">{state.error}</Notice>}
  {state.source&&<p className="meta font-bold">{state.source}</p>}
  {state.notice&&<p className="muted">{state.notice}</p>}
  {state.items?.length ? <ul className="stack">{state.items.map((item,index)=><li key={index}><strong>{item.url?<SafeLink url={item.url}>{item.title}</SafeLink>:item.title}</strong>{item.description&&<p className="meta">{item.description}</p>}</li>)}</ul>:null}</>;
}
export function LiveLookup({run,label}:{run:()=>Promise<LookupState>;label:string}) {
  const [state,action]=useActionState(run,{});
  return <div className="stack"><form action={action}><Submit style="small">{label}</Submit></form><Result state={state}/></div>;
}
export function OfficialLookup({run}:{run:(state:LookupState,data:FormData)=>Promise<LookupState>}) {
  const [state,action]=useActionState(run,{});
  return <form action={action} className="pad stack"><Field label="URL pública oficial"><input name="url" required inputMode="url" maxLength={2048}/></Field>
  <label className="check"><input type="checkbox" name="permission" required/>Confirmei que a consulta pontual a esta página é permitida.</label>
  <Submit>Verificar disponibilidade</Submit><Result state={state}/></form>;
}

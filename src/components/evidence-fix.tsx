"use client";
import { useRef } from "react";
import { X } from "lucide-react";
import { Field, Select } from "./ui";
import { Submit } from "./submit";
import { reviews } from "@/lib/domain";
/** Botão "Corrigir" que abre um modal com o valor encontrado, o valor correto e o motivo. */
export function EvidenceFix({ action, kind, source, observed, review, note }: { action: (data: FormData) => Promise<void>; kind: string; source: string; observed: string; review: string; note: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className="btn small ghost" onClick={() => dialog.current?.showModal()}>Corrigir</button>
    <dialog ref={dialog} className="fix-dialog" aria-labelledby={"fix-" + kind}>
      <form action={action} className="stack">
        <div className="fix-head"><div><h2 id={"fix-" + kind}>Corrigir informação</h2><p className="meta">{kind} · {source}</p></div>
          <button type="button" className="btn icon small" aria-label="Fechar" onClick={() => dialog.current?.close()}><X size={16} aria-hidden="true" /></button></div>
        <div className="fix-found"><span className="meta">O robô encontrou</span><p>{observed}</p></div>
        <Field label="Valor correto"><textarea name="observed" defaultValue={observed} required maxLength={2000} rows={4} /></Field>
        <Field label="Situação"><Select name="review" options={reviews} defaultValue={review === "pending" ? "corrected" : review} /></Field>
        <Field label="Por que corrigir" hint="Obrigatório quando marcar conflito."><input name="review_note" defaultValue={note} maxLength={1000} placeholder="Ex.: conferi no perfil e completei" /></Field>
        <div className="fix-foot"><button type="button" className="btn" onClick={() => dialog.current?.close()}>Cancelar</button><Submit>Salvar correção</Submit></div>
      </form>
    </dialog>
  </>;
}

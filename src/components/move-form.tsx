import { Field, Select } from "./ui";
import { Submit } from "./submit";
import { stages, type Lead } from "@/lib/domain";
import { moveLead } from "@/lib/lead-actions";
export function MoveForm({lead,owner,origin}:{lead:Pick<Lead,"id"|"stage">;owner:boolean;origin:"lead"|"pipeline"}) {
  return <details className="disclosure"><summary>Mover para etapa</summary>
    <form action={moveLead.bind(null,lead.id,origin)} className="inner stack">
      <Field label="Etapa"><Select name="stage" options={stages} defaultValue={lead.stage} disabled={lead.stage==="blocked"&&!owner}/></Field>
      <Field label="Motivo" hint="Obrigatório para perda, bloqueio e desbloqueio."><input name="reason" maxLength={500}/></Field>
      {lead.stage==="blocked"&&<label className="check"><input type="checkbox" name="unblock" required disabled={!owner}/>Revisei e autorizo retirar o bloqueio.</label>}
      {lead.stage==="blocked"&&!owner?<p className="muted">Somente o proprietário pode liberar contato.</p>:<Submit style="small primary">Confirmar etapa</Submit>}
    </form></details>;
}

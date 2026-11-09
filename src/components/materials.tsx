import { context } from "@/lib/auth";
import { formatDate, today, type Lead } from "@/lib/domain";
import { assetKinds } from "@/lib/files";
import { revokeMaterial, uploadMaterial } from "@/lib/material-actions";
import { Submit } from "./submit";
import { Empty, Field, Pairs, Panel, Select, Tag } from "./ui";
export async function MaterialsTab({lead}:{lead:Lead}) {
  const {db,org,role,userId}=await context();
  const {data,error}=await db.from("brand_assets").select("id,filename,kind,origin,holder,permission_note,purpose,restrictions,authorized_on,revoked_at,created_by").eq("organization_id",org.id).eq("lead_id",lead.id).order("created_at",{ascending:false}).limit(50);
  if(error)throw new Error("Falha ao carregar materiais");
  return <div className="grid-two"><Panel title="Materiais da empresa" description="Acesso restrito à organização com links temporários.">
  {data?.length?data.map(a=><div key={a.id} className="row !block"><details className="disclosure"><summary><span className="inline spread">{a.filename}<Tag tone={a.revoked_at?"error":"success"}>{a.revoked_at?"Revogado":"Autorização registrada"}</Tag></span></summary>
  <div className="inner stack"><Pairs items={[["Tipo",assetKinds[a.kind as keyof typeof assetKinds]],["Origem",a.origin],["Titular",a.holder],["Autorização",a.permission_note],["Finalidade",a.purpose],["Restrições",a.restrictions||"Nenhuma registrada"],["Data",formatDate(a.authorized_on)]]}/>
  {!a.revoked_at&&<><a className="btn" href={"/api/material/"+a.id}>Baixar material</a>{(role==="owner"||a.created_by===userId)&&<form className="stack" action={revokeMaterial.bind(null,lead.id,a.id)}><label className="check"><input type="checkbox" name="confirm" required/>Confirmo revogar a autorização de uso.</label><Submit style="danger">Revogar autorização</Submit></form>}</>}
  </div></details></div>):<Empty title="Nenhum material autorizado" description="Cadastre um arquivo acompanhado da origem e da autorização de uso."/>}</Panel>
  <Panel title="Adicionar material"><form action={uploadMaterial.bind(null,lead.id)} className="pad stack">
  <Field label="Categoria"><Select name="kind" options={assetKinds}/></Field>
  <Field label="Arquivo" hint="PNG, JPEG, WebP, MP4 ou PDF. Até 5 MiB."><input type="file" name="file" accept=".png,.jpg,.jpeg,.webp,.mp4,.pdf" required/></Field>
  <Field label="Origem"><input name="origin" required maxLength={240}/></Field><Field label="Titular"><input name="holder" required maxLength={180}/></Field>
  <Field label="Como foi autorizado"><textarea name="permission_note" required maxLength={1000}/></Field>
  <Field label="Finalidade"><input name="purpose" required maxLength={300}/></Field>
  <Field label="Restrições"><textarea name="restrictions" maxLength={1000}/></Field>
  <Field label="Data da autorização"><input type="date" name="authorized_on" defaultValue={today()} required/></Field>
  <label className="check"><input type="checkbox" name="permission" required/>O titular autorizou o uso nesta finalidade.</label><Submit>Salvar material</Submit></form></Panel></div>;
}

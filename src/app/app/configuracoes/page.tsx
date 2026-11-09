import Link from "next/link";
import { ButtonLink, Empty, Field, Flash, Heading, Panel, Select, type Search } from "@/components/ui";
import { Submit } from "@/components/submit";
import { context } from "@/lib/auth";
import { logout, switchOrganization } from "@/lib/auth-actions";
import { addExclusion, removeExclusion, saveOrganization } from "@/lib/settings-actions";
import { regions } from "@/lib/domain";
import { leadPath } from "@/lib/data";
export default async function Settings({searchParams}:{searchParams:Promise<Search>}) {
  const {db,org,role,memberships,email}=await context();
  const [exclusions,blocked]=await Promise.all([db.from("exclusions").select("id,name").eq("organization_id",org.id).order("name").limit(150),
    db.from("leads").select("id,name,city,region").eq("organization_id",org.id).eq("stage","blocked").order("name").limit(150)]);
  if(exclusions.error||blocked.error)throw new Error("Falha ao carregar configurações");
  const owner=role==="owner";
  return <><Heading group="Espaço de trabalho" title="Configurações" description="Gerencie a organização, o perfil e as exclusões da prospecção."><ButtonLink href="/onboarding">Nova organização</ButtonLink></Heading>
  <Flash params={await searchParams}/><div className="grid-two"><Panel title="Organização"><form className="pad stack" action={saveOrganization}><div className="fields">
  <Field label="Nome da organização" full><input name="name" defaultValue={org.name} maxLength={120} required disabled={!owner}/></Field>
  <Field label="Cidade padrão"><input name="city" defaultValue={org.city} maxLength={100} required disabled={!owner}/></Field>
  <Field label="Estado"><Select name="region" options={regions} defaultValue={org.region} disabled={!owner}/></Field>
  <Field label="Segmentos de interesse"><input name="segments" defaultValue={org.segments} maxLength={500} disabled={!owner}/></Field>
  <Field label="Nome nas mensagens"><input name="message_name" defaultValue={org.message_name} maxLength={100} required disabled={!owner}/></Field>
  <Field label="Retenção de revisão em dias" hint="Define a recomendação de revisão periódica. Evidências com data de expiração deixam de aparecer ao expirar."><input name="retention_days" type="number" min={30} max={3650} defaultValue={org.retention_days} disabled={!owner}/></Field></div>
  {owner&&<Submit>Salvar organização</Submit>}</form></Panel><Panel title="Perfil"><div className="pad stack"><p>{email}</p><p className="muted">{owner?"Proprietário":"Membro"}</p>
  {memberships.length>1&&<form className="stack" action={switchOrganization}><Field label="Organização ativa"><Select name="id" options={Object.fromEntries(memberships.map(m=>[m.organizations.id,m.organizations.name]))} defaultValue={org.id}/></Field><Submit style="">Trocar organização</Submit></form>}
  <form action={logout}><Submit style="">Sair</Submit></form></div></Panel></div>
  <div className="grid-two"><Panel title="Exclusões de cadastro" description="Nomes excluídos não entram pelo cadastro nem pela importação.">
  {exclusions.data?.map(x=><div className="row" key={x.id}><strong>{x.name}</strong>{owner&&<form action={removeExclusion.bind(null,x.id)}><Submit style="small ghost">Remover exclusão</Submit></form>}</div>)}
  {owner&&<form action={addExclusion} className="pad stack"><Field label="Nome a excluir"><input name="name" required maxLength={160}/></Field><Submit>Adicionar exclusão</Submit></form>}</Panel>
  <Panel title="Lista de não contato">{blocked.data?.length?blocked.data.map(l=><div className="row" key={l.id}><div><strong>{l.name}</strong><p className="meta">{l.city}, {l.region}</p></div><Link href={leadPath(l.id)}>Revisar lead</Link></div>):<Empty title="Sem leads bloqueados" description="Use a etapa Não contatar no detalhe do lead para registrar uma restrição."/>}</Panel></div></>;
}

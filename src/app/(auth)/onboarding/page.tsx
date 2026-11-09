import { identity } from "@/lib/auth";
import { createOrganization } from "@/lib/auth-actions";
import { Field, Flash, Panel, Select, type Search } from "@/components/ui";
import { Submit } from "@/components/submit";
import { regions } from "@/lib/domain";
export default async function Onboarding({ searchParams }:{searchParams:Promise<Search>}) {
  await identity();
  return <Panel title="Crie seu espaço de trabalho" description="Defina os dados usados na carteira e nas mensagens."><form className="pad stack" action={createOrganization}><Flash params={await searchParams}/><div className="fields">
  <Field label="Nome da organização" full><input name="name" required maxLength={120}/></Field>
  <Field label="Responsável"><input name="responsible" required maxLength={120}/></Field>
  <Field label="Nome nas mensagens"><input name="message_name" required maxLength={100}/></Field>
  <Field label="Cidade padrão"><input name="city" defaultValue="São Luís" maxLength={100} required/></Field>
  <Field label="Estado"><Select name="region" defaultValue="MA" options={regions}/></Field>
  <Field label="Segmentos de interesse" full><input name="segments" placeholder="Ex.: Estética, Cafeteria" maxLength={500}/></Field>
  <Field label="Por onde começar?" full><Select name="start" options={{manual:"Cadastro manual",integracoes:"Configurar integrações"}}/></Field>
  </div><Submit>Criar organização</Submit></form></Panel>;
}

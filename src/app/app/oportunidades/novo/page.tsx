import { createLead } from "@/lib/lead-actions";
import { context } from "@/lib/auth";
import { regions, today, sectors } from "@/lib/domain";
import { ButtonLink, Field, Flash, Heading, Notice, Panel, Select, type Search } from "@/components/ui";
import { Submit } from "@/components/submit";
export const metadata={title:"Cadastrar empresa"};
export default async function NewLead({ searchParams }:{searchParams:Promise<Search>}) {
  const { org }=await context();
  return <><Heading group="Carteira de prospecção" title="Cadastrar empresa" description="Informe a origem do cadastro e registre apenas os canais comerciais necessários."><ButtonLink href="/app/oportunidades">Voltar à carteira</ButtonLink></Heading>
  <Flash params={await searchParams}/><form action={createLead} className="stack wide-gap"><div className="grid-two">
    <Panel title="Empresa"><div className="fields pad">
      <Field label="Nome da empresa" full><input name="name" maxLength={160} required/></Field>
      <Field label="Segmento"><input name="sector" list="sectors" maxLength={100} required/><datalist id="sectors">{sectors.map(item=><option key={item} value={item}/>)}</datalist></Field>
      <Field label="Cidade"><input name="city" defaultValue={org.city} maxLength={100} required/></Field>
      <Field label="Estado"><Select name="region" options={regions} defaultValue={org.region}/></Field>
      <Field label="Bairro"><input name="district" maxLength={100}/></Field>
      <Field label="Endereço comercial (opcional)" full><input name="address" maxLength={250}/></Field>
      <Field label="Observações" full><textarea name="notes" maxLength={2500}/></Field>
    </div></Panel>
    <div className="stack"><Panel title="Fonte do cadastro"><div className="pad stack">
      <Field label="Fonte"><input name="source_label" placeholder="Ex.: contato comercial direto" maxLength={200} required/></Field>
      <Field label="URL da fonte"><input name="source_url" inputMode="url" maxLength={2048}/></Field>
      <Field label="Data da consulta"><input name="consulted_on" type="date" defaultValue={today()} required/></Field>
    </div></Panel><Notice>Os canais informados começam pendentes de confirmação. O telefone comercial fica separado do WhatsApp.</Notice></div>
  </div>
  <Panel title="Canais comerciais" description="Preencha apenas os canais públicos ou fornecidos pela empresa."><div className="pad fields">
    <Field label="Site"><input name="website" inputMode="url" maxLength={2048}/></Field>
    <Field label="Instagram"><input name="instagram" placeholder="@empresa" maxLength={2048}/></Field>
    <Field label="Google Maps"><input name="maps" inputMode="url" maxLength={2048}/></Field>
    <Field label="Telefone comercial"><input name="phone" type="tel" maxLength={60}/></Field>
    <Field label="E-mail comercial"><input name="email" type="email" maxLength={254}/></Field>
  </div></Panel><div className="panel pad inline spread"><label className="check"><input type="checkbox" name="override"/>Revisei uma possível duplicação e confirmei que é outra unidade.</label><Submit>Cadastrar empresa</Submit></div></form></>;
}

import Link from "next/link";
import { Download, Plus, ScanSearch, Search as SearchIcon, SlidersHorizontal, Upload } from "lucide-react";
import { ButtonLink, Empty, Flash, Field, Heading, Notice, Select, type Search } from "@/components/ui";
import { Refresh } from "@/components/refresh";
import { context } from "@/lib/auth";
import { pageSize, queryLeads } from "@/lib/data";
import { sectors, sites, stages } from "@/lib/domain";
import { StateCity } from "@/components/state-city";
import { LeadTable } from "@/components/lead-table";
import { Submit } from "@/components/submit";
import { requestEnrichmentAll } from "@/lib/research-actions";
export const metadata={title:"Oportunidades"};
export default async function Opportunities({ searchParams }:{searchParams:Promise<Search>}) {
  const params=await searchParams;
  const [{ leads,total,filters },{ memberships,userId,org,db }]=await Promise.all([queryLeads(params),context()]);
  const [{ data:memberRows },{ data:places },{ data:queue }]=await Promise.all([
    db.from("organization_members").select("user_id,role").eq("organization_id",org.id).limit(100),
    db.from("leads").select("sector").eq("organization_id",org.id).limit(2000),
    db.from("enrichment_requests").select("state").eq("organization_id",org.id).in("state",["pending","running"]).limit(200)
  ]);
  const running=(queue??[]).filter(q=>q.state==="running").length, waiting=(queue??[]).length-running;
  // segmentos do app mais os já usados na carteira
  const segments=[...new Set([...sectors,...(places??[]).map(p=>String(p.sector)),filters.sector].filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  const owners=Object.fromEntries((memberRows??[]).map(m=>[String(m.user_id),m.user_id===userId?"Minha responsabilidade":String(m.role==="owner"?"Proprietário ":"Membro ")+String(m.user_id).slice(0,8)]));
  if(!Object.keys(owners).length&&memberships.length) owners[userId]="Minha responsabilidade";
  const query=new URLSearchParams();
  for(const [name,value] of Object.entries(filters)) if(name!=="page"&&value) query.set(name,typeof value==="boolean"?"1":String(value));
  const url=(page:number)=>"/app/oportunidades?"+new URLSearchParams([...query,["page",String(page)]]).toString();
  const max=Math.max(1,Math.ceil(total/pageSize));
  const expanded=Boolean(filters.district||filters.stage||filters.priority||filters.owner||filters.date||filters.confidence||filters.pending||filters.order!=="updated");
  return <><Heading group="Carteira de prospecção" title="Oportunidades" description="Revise evidências e decida o próximo passo de cada empresa.">
    <ButtonLink href="/app/oportunidades/novo" style="primary"><Plus size={16} aria-hidden="true"/>Cadastrar empresa</ButtonLink></Heading>
    <Flash params={params}/><Refresh active={Boolean(queue?.length)}/>
    {Boolean(queue?.length)&&<Notice><strong>Leitura em andamento:</strong> {running?running+" empresa(s) sendo lida(s) agora":"nenhuma sendo lida neste instante"}{waiting?", "+waiting+" na fila":""}. A etapa de cada empresa aparece na tabela e a página se atualiza sozinha. Cada empresa leva de 1 a 3 minutos, e o robô verifica a fila a cada 5 minutos.</Notice>}
    <section className="panel">
    <form action="/app/oportunidades" className="filters" aria-label="Filtrar oportunidades"><div className="filter-grid">
      <Field label="Buscar empresa"><span className="search-field"><SearchIcon size={15} aria-hidden="true"/><input type="search" name="q" defaultValue={filters.q} placeholder="Nome, domínio ou segmento"/></span></Field>
      <StateCity region={filters.region} city={filters.city} filter/>
      <Field label="Segmento"><Select name="sector" options={segments} defaultValue={filters.sector} empty="Todos"/></Field>
      <Field label="Situação do site"><Select name="site" options={sites} defaultValue={filters.site} empty="Todas"/></Field>
      <button className="btn primary" type="submit"><SearchIcon size={15} aria-hidden="true"/>Buscar</button></div>
      <details className="disclosure" open={expanded}><summary><span className="inline"><SlidersHorizontal size={15} aria-hidden="true"/>Mais filtros</span></summary><div className="inner filter-grid filter-more">
      <Field label="Bairro"><input name="district" defaultValue={filters.district}/></Field>
      <Field label="Etapa"><Select name="stage" options={stages} defaultValue={filters.stage} empty="Todas"/></Field>
      <Field label="Prioridade"><Select name="priority" options={{alta:"Alta",media:"Média",baixa:"Baixa"}} defaultValue={filters.priority} empty="Todas"/></Field>
      <Field label="Responsável"><Select name="owner" options={owners} defaultValue={filters.owner} empty="Todos"/></Field>
      <Field label="Confiança"><Select name="confidence" options={{suficiente:"Evidências suficientes",pendente:"Revisão pendente",insuficiente:"Dados insuficientes"}} defaultValue={filters.confidence} empty="Todas"/></Field>
      <Field label="Última consulta a partir de"><input type="date" name="date" defaultValue={filters.date}/></Field>
      <Field label="Ordenar por"><Select name="order" options={{updated:"Atualização",name:"Nome",consulted:"Última consulta"}} defaultValue={filters.order}/></Field>
      <label className="check"><input type="checkbox" name="pending" value="1" defaultChecked={filters.pending}/>Com pendências</label>
      </div></details>
    </form>
    <div className="table-top"><span className="inline"><strong>{total} {total===1?"oportunidade":"oportunidades"}</strong><Link href="/app/oportunidades">Limpar filtros</Link></span>
      <div className="actions">
        <form action={requestEnrichmentAll} className="batch-read" title="Só empresas que ainda não foram lidas. Cada uma usa até 6 execuções do Apify.">
          <input type="number" name="limit" min={1} max={50} defaultValue={10} aria-label="Quantas empresas ler" inputMode="numeric"/>
          <Submit style="small"><ScanSearch size={15} aria-hidden="true"/>Ler sites</Submit></form>
        <ButtonLink href="/app/oportunidades/importar" style="small"><Upload size={15} aria-hidden="true"/>Importar</ButtonLink>
        <a className="btn small" href={"/api/exportar?"+query.toString()}><Download size={15} aria-hidden="true"/>Exportar</a>
      </div></div>
    {!leads.length?<Empty title={total?"Página sem registros":"Nenhuma oportunidade encontrada"} description={total?"Volte à primeira página.":"Cadastre uma empresa, importe um CSV ou ajuste os filtros."}><ButtonLink href={total?url(1):"/app/oportunidades/novo"} style="primary">{total?"Primeira página":"Cadastrar empresa"}</ButtonLink></Empty>:<LeadTable leads={leads}/>}
    <div className="table-foot"><span>Página {filters.page} de {max}</span><div className="actions">{filters.page>1&&<ButtonLink href={url(filters.page-1)} style="small">Anterior</ButtonLink>}{filters.page<max&&<ButtonLink href={url(filters.page+1)} style="small">Próxima</ButtonLink>}</div></div>
    </section></>;
}

import { lastDay } from "@/lib/usage";
import { aiConfig } from "@/lib/assistive";
import { context } from "@/lib/auth";
import { braveEnabled,googleEnabled,policies,readerEnabled } from "@/lib/providers";
import { formatDate } from "@/lib/domain";
import { ButtonLink,Heading,Notice,Pairs,Panel,Tag } from "@/components/ui";
export default async function Integrations() {
  const {db,org}=await context();
  const since=lastDay();
  const sources=[["google_places",googleEnabled()],["brave",braveEnabled()],["official_page",readerEnabled()]] as const;
  const stats=await Promise.all(sources.map(([provider])=>db.from("provider_usage").select("created_at",{count:"exact"}).eq("organization_id",org.id).eq("provider",provider).gte("created_at",since).order("created_at",{ascending:false}).limit(1)));
  if(stats.some(result=>result.error))throw new Error("Falha ao carregar consumo");
  const {data:lastJob,error}=await db.from("research_jobs").select("state,error_code").eq("organization_id",org.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(error)throw new Error("Falha ao carregar estado da pesquisa");
  return <><Heading group="Espaço de trabalho" title="Integrações" description="Configure credenciais no servidor e acompanhe o uso por organização."><ButtonLink href="/app/pesquisa">Abrir pesquisa</ButtonLink></Heading>
  <Notice>Sem integrações configuradas, você pode cadastrar e analisar leads manualmente. Credenciais externas são lidas apenas no servidor.</Notice>
  <div className="grid-two equal">{sources.map(([provider,enabled],i)=>{
    const info=policies[provider];const stat=stats[i];const failed=provider==="google_places"&&lastJob?.state==="failed";const limited=provider==="google_places"&&lastJob?.state==="limit_reached";
    return <Panel key={provider} title={info.name} description={info.purpose} action={<Tag tone={!enabled?"warning":failed?"error":limited?"warning":"success"}>{!enabled?"Não configurada":failed?"Erro na última execução":limited?"Limite atingido":"Configurada"}</Tag>}>
    <div className="pad stack"><Pairs items={[["Credencial",info.credential],["Consultas reservadas em 24 h",stat.count??0],["Última reserva",formatDate(stat.data?.[0]?.created_at??null)],["Limite",info.limit],["Retenção",info.retention],["Exportação",info.export]]}/></div></Panel>;})}
  <Panel title="IA assistiva" description="Modelos determinísticos disponíveis para abordagem e briefing." action={<Tag tone={aiConfig()?"success":""}>{aiConfig()?"OpenAI configurada":"Modelos locais"}</Tag>}><p className="pad muted">O editor usa os dados confirmados e as pendências do lead como contexto de revisão.</p></Panel>
  <Panel title="Armazenamento privado" description="Supabase Storage com acesso limitado por organização." action={<Tag tone="info">Bucket privado</Tag>}><p className="pad muted">Links para materiais autorizados expiram em um minuto.</p></Panel></div></>;
}

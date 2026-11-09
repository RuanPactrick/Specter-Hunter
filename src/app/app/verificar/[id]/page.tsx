import { loadLead,leadPath } from "@/lib/data";
import { braveEnabled,readerEnabled } from "@/lib/providers";
import { checkBrave,checkOfficial } from "@/lib/research-actions";
import { LiveLookup,OfficialLookup } from "@/components/live-lookup";
import { ButtonLink,Heading,Notice,Panel } from "@/components/ui";
export default async function Verify({params}:{params:Promise<{id:string}>}) {
  const lead=await loadLead((await params).id);
  return <><Heading group="Presença digital" title="Verificar fontes externas" description={lead.name}><ButtonLink href={leadPath(lead.id,"presenca")}>Voltar à avaliação</ButtonLink></Heading>
  <Notice>As respostas são transitórias e exigem revisão humana. Registre evidências próprias na aba do lead.</Notice>
  <div className="grid-two"><Panel title="Busca web · Brave Search"><div className="pad stack">{braveEnabled()?<LiveLookup label="Pesquisar uma vez" run={checkBrave.bind(null,lead.id)}/>:<p className="muted">A busca web precisa ser habilitada no servidor.</p>}</div></Panel>
  <Panel title="Consulta de página oficial">{readerEnabled()?<OfficialLookup run={checkOfficial.bind(null,lead.id)}/>:<p className="pad muted">A leitura controlada precisa ser habilitada no servidor.</p>}</Panel></div></>;
}

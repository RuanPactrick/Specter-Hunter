import Link from "next/link";
import { generateAssistance } from "@/lib/assistive-action";
import { aiConfig,assistiveCompany,assistiveModes,minimizeEvidence,type AssistiveMode } from "@/lib/assistive";
import { leadPath } from "@/lib/data";
import { decodeEntities,evidenceUsable,formatDate,type Evidence,type Lead } from "@/lib/domain";
import { AssistiveEditor } from "./assistive-editor";

export function LeadAssistant({lead,evidence,modes}:{lead:Lead;evidence:Evidence[];modes:[AssistiveMode,...AssistiveMode[]]}) {
  const config=aiConfig();
  if(!config||lead.stage==="blocked")return null;
  const provider=config.provider==="gemini"?"Gemini":"OpenAI";
  const items=evidence.filter(evidenceUsable).slice(0,12).map(e=>({
    id:e.id,observed:minimizeEvidence(decodeEntities(e.observed)),source:e.kind+" · "+e.source_label+" · "+formatDate(e.consulted_on)
  }));
  const company=Object.values(assistiveCompany(lead)).join(" · ");
  return <details className="panel disclosure"><summary>{assistiveModes[modes[0]]} com {provider}</summary>
    {items.length?<AssistiveEditor action={generateAssistance.bind(null,lead.id,config.provider)} company={company} provider={provider}
      options={Object.fromEntries(modes.map(mode=>[mode,assistiveModes[mode]]))} evidence={items}/>
      :<p className="inner">Confirme ao menos uma evidência em <Link href={leadPath(lead.id,"fontes")}>Fontes e conferência</Link> para gerar um rascunho.</p>}
  </details>;
}

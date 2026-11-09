import { ButtonLink, Heading, Panel } from "@/components/ui";
import { Importer } from "@/components/importer";
export default function ImportPage() {
  return <><Heading group="Carteira de prospecção" title="Importar CSV" description="Mapeie os campos, confira a prévia e confirme os registros da organização."><ButtonLink href="/app/oportunidades">Voltar à carteira</ButtonLink></Heading><Panel title="Importação de dados próprios"><Importer/></Panel></>;
}

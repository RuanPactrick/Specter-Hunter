import { ButtonLink, Empty } from "@/components/ui";
export default function NotFound() {
  return <section className="panel"><Empty title="Registro indisponível" description="O registro não foi encontrado na organização ativa. Volte para a carteira."><ButtonLink href="/app/oportunidades" style="primary">Ver oportunidades</ButtonLink></Empty></section>;
}

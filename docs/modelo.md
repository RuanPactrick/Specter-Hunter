# Modelo e escopo

| Área | Relações |
| --- | --- |
| Identidade | Supabase Auth, **profiles**, **organizations**, **organization_members** |
| Carteira | **leads**, **lead_contacts**, **evidence_items**, **website_assessments**, **opportunity_assessments** e a visão **lead_directory** |
| CRM | **tasks**, **outreach_events**, **previews**, **offers**, **exclusions**, **suppression_entries**, **audit_events** |
| Materiais | **brand_assets** e bucket privado **specter-materials** |
| Descoberta | **research_jobs**, **research_job_steps**, **research_results**, **provider_usage** |

As relações dependentes usam chaves compostas com a organização para bloquear referências entre tenants. A visão da carteira usa **security_invoker**. Operações que precisam de atomicidade passam por funções com verificação de associação, incluindo cadastro, bloqueio, avaliação de site, contato e enfileiramento. Os campos de origem no cadastro têm finalidade comercial e a origem da evidência fica registrada separadamente.

A revisão de duplicidade usa domínio, telefone normalizado, Instagram e nome com localização. No caso de duas unidades legítimas, o cadastro manual exige confirmação antes de ultrapassar o alerta. O vínculo entre registros relacionados é auditado. A mesclagem física de dois registros e seus anexos não faz parte deste MVP.

O perfil proprietário pode excluir um lead mediante confirmação por nome. A operação preserva o bloqueio de contato para evitar reimportação. Leads com materiais vinculados exigem tratamento dos arquivos pelo operador antes da exclusão. A revogação bloqueia novos acessos e links previamente emitidos duram até 60 segundos. O registro de autorização não valida automaticamente licenças ou titularidade. Capturas podem ser armazenadas como materiais privados da categoria correspondente.

O prazo de revisão configurável sinaliza consultas antigas. A expiração explícita da evidência retira a informação da leitura. Limpeza definitiva de objetos, retenção de auditoria e tratamento de solicitações de privacidade devem entrar no procedimento operacional.

O MVP modela papéis proprietário e membro e oferece troca de organização. Provisionamento de membros adicionais depende do operador do Supabase. Não há interface de convites. Outros pontos fora do escopo desta entrega incluem deduplicação automática entre IDs de provedores diferentes, importação de mídias de redes sociais, classificação automática de franquias e administração de segredos por organização.

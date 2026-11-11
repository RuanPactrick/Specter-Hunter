# Operação do worker

Rode **npm run worker** em processo Node 22+ persistente, separado do Next.js. Em Windows, pode ser uma segunda janela de terminal. Em hospedagem, use um serviço de processos ou contêiner persistente. Configure a URL do Supabase, **SUPABASE_SERVICE_ROLE_KEY**, **ENABLE_GOOGLE_PLACES** e **GOOGLE_PLACES_API_KEY** nesse processo. O aplicativo web deve receber a chave publicável e as flags e chaves de seus adaptadores, sem a service role.

1. A aplicação cria um job com UUID idempotente. Uma organização pode ter um job ativo por vez.
2. O worker reserva um job com **FOR UPDATE SKIP LOCKED**. Cada processo executa um job de cada vez. O lease de 90 segundos recebe um token novo a cada retomada.
3. Antes de cada chamada, o worker reserva orçamento de consultas. A página normalizada guarda identificadores distintos e o cursor de continuação. O estado parcial fica disponível durante o processamento.
4. Erros temporários agendam uma nova tentativa com backoff e Retry-After. O número de tentativas e de requisições é limitado. Falha depois de resultados gravados é preservada como parcial.
5. Cancelamento é cooperativo. Uma resposta em trânsito pode ser faturada, mas uma página recebida depois de reconhecido o cancelamento não entra nos resultados.
6. Ao interromper o processo, o lease expirado permite a retomada. O token impede que uma execução antiga grave resultados depois de perder o lease. Uma falha entre a chamada externa e a confirmação da página pode repetir a consulta. Cada tentativa é contabilizada e os identificadores são deduplicados.

A tela atualiza os dados do job enquanto está aberta. Se ficar Pendente sem iniciar, verifique o processo, o endpoint do Supabase e as migrations. Falha de credenciais aparece como Aguardando configuração ou Parcial quando houver IDs preservados. Depois de corrigir a configuração, crie um novo job. Não execute o loop em função serverless ou em uma rota Next.js.

A identidade do usuário é verificada ao enfileirar ou cancelar. As funções de claim, reserva e encerramento só são concedidas à service role. Separe a credencial e restrinja o acesso operacional a esse processo.

## Leitura automática do site

Com **ENABLE_OFFICIAL_PAGE_READING=true** no processo do worker, quando não há pesquisa na fila ele atende os pedidos de **Ler o site** (aba Presença digital do lead) e **Ler sites dos leads** (Oportunidades). Cada pedido tem lease de 120 segundos e até 3 tentativas. Um site fora do ar vira evidência, não falha. Lead bloqueado no meio do caminho é descartado sem gravar nada.

Com **ENABLE_APIFY=true** e **APIFY_TOKEN** (preferido) ou **ENABLE_BRAVE_SEARCH=true** e **BRAVE_SEARCH_API_KEY** também no processo do worker, a leitura pesquisa na web o site, o Instagram e o CNPJ que faltarem, e lead sem domínio também pode ser lido. Cada busca é reservada no banco antes da chamada. Quando a cota acaba, o lead é gravado com o que já foi achado e uma evidência avisando.

## Na Vercel (padrão)

O robô roda dentro da própria Vercel, sem servidor à parte:

- **Logo depois do clique** em Ler, Ler sites ou Nova pesquisa, a ação processa a fila em segundo plano (`after` do Next, até 300 s).
- **Vercel Cron a cada minuto** chama `/api/worker` (`vercel.json`) para o que ficou na fila. A rota só aceita o Vercel, que manda `Authorization: Bearer CRON_SECRET`.

Cadastre na Vercel (**Settings → Environment Variables**, Production): **SUPABASE_SERVICE_ROLE_KEY**, **APIFY_TOKEN** e **CRON_SECRET** (texto aleatório longo, por exemplo gerado com `openssl rand -hex 32`). Depois faça Redeploy. As filas usam lease no banco, então o cron e o clique podem rodar ao mesmo tempo sem pegar o mesmo item.

## Reserva: GitHub Actions (manual)

O arquivo `.github/workflows/worker.yml` roda o worker a cada 5 minutos em modo rodada única (`WORKER_ONCE=1`): ele esvazia a fila e encerra, então não precisa de servidor ligado o tempo todo. Em repositório público os minutos do Actions são ilimitados. O GitHub pode atrasar rodadas agendadas em alguns minutos, e desliga o agendamento depois de 60 dias sem commits no repositório (basta reativar em Actions).

Cadastre em **Settings → Secrets and variables → Actions** do repositório: **SUPABASE_URL**, **SUPABASE_SERVICE_ROLE_KEY** e **APIFY_TOKEN**. Sem as duas chaves do Supabase, a rodada termina sem fazer nada. Para rodar na hora, use **Actions → Worker (rodada agendada) → Run workflow**.

Na prática o GitHub atrasa muito as rodadas de 5 em 5 minutos (pode passar horas sem rodar). Para a leitura começar na hora em que você clica em "Ler", cadastre na Vercel **GITHUB_DISPATCH_TOKEN** (token *fine-grained* do GitHub, só deste repositório, com permissão **Actions: Read and write**) e **GITHUB_DISPATCH_REPO=RuanPactrick/Specter-Hunter**. O app aciona o workflow na hora; continua gratuito.

Se a rodada falhar, a etapa "Conferir as chaves" diz qual secret está com formato errado (sem mostrar o valor): **SUPABASE_URL** tem de ser exatamente `https://<projeto>.supabase.co`.

No site (Vercel), bastam **ENABLE_APIFY=true** e **ENABLE_OFFICIAL_PAGE_READING=true** para mostrar a busca no Maps e o Ler sites. O token do Apify e a chave service role ficam só no GitHub.

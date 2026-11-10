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

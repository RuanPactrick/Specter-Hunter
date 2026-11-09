# Specter Hunter

**Oportunidades além do óbvio.** Carteira comercial para descobrir empresas, revisar evidências de presença digital e organizar a prospecção de serviços de criação de sites. São Luís, MA, é o padrão inicial editável.

A aplicação usa Next.js App Router, TypeScript estrito, Tailwind CSS, Lucide, Zod e Supabase Auth, PostgreSQL e Storage. A navegação grafite, os painéis claros, as fontes Manrope e IBM Plex Mono e o símbolo seguem os mockups entregues. A marca é conceitual e sua disponibilidade jurídica não foi verificada.

## Instalação e operação manual

1. Instale Node.js 22 ou superior e execute **npm ci** no diretório do projeto.
2. Escolha um projeto Supabase dedicado. Para desenvolvimento local com Docker em execução, rode **npx supabase start**. Se precisar aplicar migrations pendentes na instância local existente, use **npx supabase migration up --local**. Para um projeto hospedado, siga o guia de deploy antes de aplicar qualquer alteração.
3. Copie **.env.example** para **.env.local** e preencha **NEXT_PUBLIC_SUPABASE_URL**, **NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY** e **APP_URL**. A chave publicável também pode ser a chave anon legada do Supabase local. Deixe os provedores desabilitados para a operação manual.
4. Configure a URL do site e inclua **APP_URL/auth/callback** na lista de redirecionamentos do Supabase Auth. Configure a entrega de e-mail ou consulte a caixa local do Supabase para confirmar a conta. Em recuperação, permita também o callback com o parâmetro **flow=recovery**.
5. Rode **npm run dev** e acesse http://localhost:3000. Cadastre e confirme uma conta, crie uma organização e selecione Cadastro manual.

A carteira começa vazia. Cadastre uma empresa com fonte e data, revise o canal e as evidências, registre a classificação de presença digital e organize a próxima ação. As três exclusões iniciais estão em **Configurações**. As alterações de organização, a remoção de exclusões e o desbloqueio revisado dependem da função de proprietário.

O telefone e o WhatsApp são canais separados. O botão de WhatsApp só fica disponível para um canal explicitamente confirmado e abre uma conversa com texto editável. A confirmação do envio é uma ação manual separada. Modelos de abordagem e briefing funcionam sem IA. Com o adaptador opcional OpenAI habilitado, a aba Abordagem oferece sugestões estruturadas sobre evidências selecionadas e autorizadas.

## Primeira pesquisa externa

O fluxo de descoberta exige habilitar Google Places nos processos web e worker. Leia as restrições de licença, atribuição e exportação em [Integrações e política por fonte](docs/integracoes.md) antes de habilitar. Configure **ENABLE_GOOGLE_PLACES**, **GOOGLE_PLACES_API_KEY** e, somente no worker, **SUPABASE_SERVICE_ROLE_KEY**. Rode **npm run worker** em um processo separado e inicie o lote em **Nova pesquisa**. A tela acompanha o processamento, preserva identificadores parciais e permite cancelamento. Os detalhes são consultados separadamente, com atribuição.

As consultas ao Brave e a leitura controlada de uma página podem ser habilitadas na tela **Presença digital** do lead. O cadastro comercial usa informações de fonte independente e segue funcionando sem essas integrações.

## Regras de interpretação

O índice comercial usa cinco critérios com evidência revisada e justificativa. Exemplo: 18 de 30 observados, com 30% de cobertura, é uma avaliação provisória. Pontos de critérios ausentes não são imputados. A classificação de site se refere às consultas feitas e às evidências associadas. O produto não estima probabilidade de fechamento.

O CSV de importação tem prévia, mapeamento, validação por linha, limite de 100 linhas e origem obrigatória. A exportação inclui dados comerciais próprios e notas. Contatos, registros de materiais, detalhes de provedores e observações das evidências ficam fora desse CSV. O evento de exportação é registrado.

## Verificações

- **npm run lint**
- **npm run typecheck**
- **npm test** para regras de domínio, testes de provedor com transporte simulado, segurança de URLs e execução das migrations em PostgreSQL embarcado.
- **npx playwright install chromium** e **npm run e2e** para o teste de navegador sem configuração. O caminho de um Chromium instalado pode ser definido em **PLAYWRIGHT_CHROMIUM_EXECUTABLE**.
- **npm run build** para a compilação de produção.
- Para o E2E completo, use Supabase **local dedicado**, migrations aplicadas, **RUN_SUPABASE_E2E=1**, URL e chave publicável exportadas no shell, **SUPABASE_SERVICE_ROLE_KEY** de teste e redirecionamento permitido na porta 3107. O teste cria e remove apenas as próprias fixtures de duas organizações. Ele não usa APIs de descoberta, envia mensagens ou exerce entrega real de e-mail.

## Operação e entrega

- [Integrações e política por fonte](docs/integracoes.md)
- [Operação do worker](docs/worker.md)
- [Implantação e segurança](docs/deploy-seguranca.md)
- [Modelo de dados e escopo](docs/modelo.md)
- [Resultados de verificação neste ambiente](docs/verificacao.md)

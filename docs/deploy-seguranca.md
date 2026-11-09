# Implantação e segurança

## Implantação

1. Crie um Supabase dedicado. Revise as migrations e faça backup antes de qualquer alteração em um ambiente existente. Em um projeto novo, vincule o CLI com **npx supabase link --project-ref REF** e aplique as migrations com **npx supabase db push** após aprovação do responsável.
2. Configure confirmação por e-mail, SMTP de produção, limites de autenticação e redirecionamento de recuperação. Use HTTPS e a origem canônica em **APP_URL**. Aplique as variáveis públicas antes do build.
3. Importe o código em um projeto Vercel ou em um servidor Node. Configure **NEXT_PUBLIC_SUPABASE_URL**, **NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY**, **APP_URL** e apenas as flags e credenciais server-side habilitadas. Use **npm ci**, **npm run build** e, em hospedagem Node, **npm start**.
4. Se habilitar descoberta, inicie um worker separado com a service role. Configure reinício, logs sem conteúdo sensível, monitoramento da fila e limites de uso no provedor.
5. Valide o login, o isolamento, os fluxos de recuperação, a assinatura de objetos, o consumo e a visualização de dados de provedores antes de autorizar uso em produção.

## Checklist operacional

- [ ] RLS, chaves compostas e isolamento confirmados no Supabase que será usado.
- [ ] E-mail de confirmação e recuperação verificados com a configuração real.
- [ ] Credenciais do worker separadas das variáveis do aplicativo web e do navegador.
- [ ] Alertas e limites configurados nas contas de provedor.
- [ ] Uso, atribuição e retenção revisados com base nos contratos das fontes.
- [ ] Bucket privado e links temporários verificados. Definir política de limpeza, inspeção de arquivos e backup.
- [ ] Bloqueio de contato, revisão de desbloqueio e exclusão confirmados.
- [ ] Auditoria e tratamento de solicitações de privacidade definidos.
- [ ] Acesso de saída do leitor restrito na infraestrutura além das verificações do aplicativo.
- [ ] Testes E2E com Supabase real e teste de falha de worker executados em ambiente dedicado.

O leitor verifica a resolução DNS a cada destino e fixa o IP validado na conexão. Bloqueia redes privadas, endereços especiais, portas fora dos padrões HTTP(S), credenciais na URL e redirecionamentos inválidos. Não executa scripts nem encaminha cookies. A leitura é opcional e não substitui revisão de permissões de acesso.

Não há bypass de autenticação ou dados demonstrativos no aplicativo. As fixtures vivem nos testes. A aplicação guarda somente canais comerciais necessários e não implementa disparos. A operação comercial e as políticas de privacidade e retenção exigem revisão do responsável.

- [Supabase SSR com Next.js](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)
- [Supabase CLI e ambiente local](https://supabase.com/docs/guides/local-development)
- [Controle de acesso do Supabase Storage](https://supabase.com/docs/guides/storage/security/access-control)
- [Implantação do Next.js](https://nextjs.org/docs/app/getting-started/deploying)

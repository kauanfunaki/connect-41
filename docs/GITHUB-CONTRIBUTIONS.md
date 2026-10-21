# GitHub — Contribuições

O módulo mostra a atividade diária de cada usuário nos repositórios monitorados pela conta GitHub conectada ao escritório. Conta commits, aberturas de pull requests e issues e revisões submetidas. A conexão fica em **Integrações → GitHub**; o painel abre em `/github`.

O módulo `tech_github_contributions` é exclusivo do **Tech**, nasce desligado e respeita o plano contratado. Não pode ser transferido para outro setor. Administradores mantêm o acesso amplo previsto nos papéis do Connect.

## Preparar e ativar

1. Em uma publicação autorizada, aplicar `prisma/migrations/20261021120000_github_contributions/migration.sql` pelo fluxo normal `prisma migrate deploy`. É uma migration aditiva: cria oito tabelas do GitHub, sem alterar registros dos outros módulos. Não usar reset ou db push em produção.
2. Cadastrar um **OAuth App** no GitHub para o ambiente e informar o callback `<APP_PUBLIC_URL>/api/integrations/github/callback`.
3. Configurar no servidor `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `APP_PUBLIC_URL` e a chave `SECRETS_ENCRYPTION_KEY` já usada pelo Connect. O domínio dos cookies continua seguindo `APP_DOMAIN`. Em produção, o endereço público deve usar HTTPS; HTTP é aceito apenas em loopback para verificação local.
4. Publicar o build normal do Connect e habilitar **GitHub — Contribuições** em Módulos, no Tech.
5. Como administrador, abrir **Integrações → GitHub**, clicar em **Conectar GitHub** e autorizar a conta. Manter o mesmo escritório e a mesma sessão até retornar.
6. Clicar em **Processar pendências** para carregar os repositórios, selecionar os desejados e usar **Salvar e sincronizar**. Repositórios próprios, de colaboração e de organizações aparecem conforme o acesso autorizado.

Para ler repositórios privados, OAuth usa o escopo `repo`, que também concede escrita. O módulo implementa somente consultas de atividade; o token não é tecnicamente restrito à leitura. Organizações podem exigir aprovação do aplicativo ou autorização SSO. Não ampliar permissões de uma organização automaticamente. Referências: [escopos OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps) e [autorização por organizações](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/authorizing-oauth-apps#oauth-apps-and-organizations).

A conta é compartilhada pelo escritório. Quem tem permissão para consultar o módulo verá a atividade dos repositórios selecionados, inclusive privados, sem precisar conectar sua própria conta GitHub. Se houver exigência de token estritamente de leitura, será necessário adotar GitHub App e autorizar sua instalação nos repositórios; esse não é o fluxo desta versão.

## Uso do painel

- Filtrar por período de até 12 meses, repositório, organização/dono, login e tipo de contribuição. A seleção fica na URL.
- Consultar os totais separados por tipo e o calendário de cada usuário. A comparação é paginada em 20 usuários.
- Selecionar um dia para abrir as atividades e seus links no GitHub. O detalhe tem páginas de 50 eventos.
- Usar as setas do teclado no calendário: cima/baixo mudam o dia; esquerda/direita mudam a semana; Home/End vão ao início/fim do período.
- Bots ficam ocultos por padrão. Marcar **Incluir bots** para consultá-los.
- Para acompanhar uma pessoa sem atividade no período, informar seu login em **Integrações → GitHub → Acompanhar usuário**.

O padrão do calendário é `America/Sao_Paulo`. O fuso pode ser ajustado antes da primeira coleta; depois disso fica fixo para preservar os agrupamentos. A escala de cores é a mesma para todos: zero, 1–2, 3–5, 6–9 e 10 ou mais contribuições no dia.

Dias sem registro só representam zero confirmado depois que a cobertura estiver completa. Enquanto houver coleta pendente, falhas ou repositórios sem confirmação de acesso, o painel mostra cobertura parcial e os dias vazios ficam listrados. A informação **Dados coletados até** indica o alcance temporal confirmado, quando disponível.

## Significado das contagens

| Tipo | O que conta | Data |
| --- | --- | --- |
| Commit | Um SHA por repositório no histórico do branch padrão, atribuído ao autor principal vinculado pelo GitHub | Data de commit informada pela API |
| Pull request | Uma abertura por PR; fechar ou fazer merge não cria outra abertura | Criação do PR |
| Issue | Uma abertura por issue, sem contar novamente os PRs retornados pelo endpoint de issues | Criação da issue |
| Revisão | Uma revisão submetida por ID; rascunho pendente não conta | Submissão da revisão |

Um PR pode ter abertura, commits e revisões contados separadamente. O mesmo SHA em dois repositórios conta uma vez em cada repositório; considere isso ao selecionar forks. Coautoria e commits existentes somente em outros branches não entram nesta versão.

Usuários são identificados pelo ID estável do GitHub, não pelo nome ou e-mail. A descoberta inclui autores e revisores, mesmo quem nunca fez commit. Autoria sem vínculo de usuário fica como **Autoria não identificada**, fora da comparação individual.

O calendário representa os repositórios escolhidos no Connect. Pode diferir do calendário do perfil GitHub e não deve ser apresentado como uma nota de produtividade.

## Sincronização

O intervalo padrão é de 30 minutos, configurável entre 10 e 1.440 minutos. O botão **Atualizar dados** cria tarefas persistidas; não depende de trabalho solto após uma resposta HTTP.

Para operação contínua, configurar o agendador existente para chamar `POST /api/cron/github-sync`, por exemplo a cada minuto, usando o header `Authorization: Bearer <CRON_SERVICE_TOKEN>`. O módulo decide quais conexões e tarefas estão vencidas; o intervalo da conta não exige um agendamento separado por escritório. A criação do módulo não instala nem altera tarefas externas.

Enquanto o administrador processa pendências na tela de Integrações ou solicita uma atualização no painel, a interface consome os mesmos lotes, com requisições limitadas. Fechar a tela preserva o progresso; o agendador continua de onde parou quando estiver configurado. Usuários de consulta não executam a sincronização manual.

A carga inicial prioriza os últimos 30 dias e depois completa os últimos 12 meses. REST é consultada com paginação de até 100 itens. Cada repositório e recurso tem cursor e cobertura próprios. Revisões de PRs antigos atualizados no período também são consultadas. Semanalmente, uma reconciliação percorre novamente a janela histórica.

Commits incrementais usam comparação entre heads para incluir commits antigos incorporados por merge. Se houver divergência ou reescrita, uma coleta do branch padrão reconcilia os commits atuais antes de retirar os antigos dos totais. Registros anteriores permanecem no banco.

Há uma lease no banco por identidade GitHub, compartilhada entre conexões, e verificação de geração a cada gravação. Um executor que perde a lease ou responde depois de pausa/troca de conta não publica seu lote. Checkpoint, contribuições e agregados são confirmados na mesma transação. Reiniciar ou repetir uma página não duplica a contagem.

`Retry-After` e os headers de limite do GitHub são respeitados. A espera fica persistida; não há laço de novas tentativas durante a mesma espera. Falhas transitórias usam tentativas limitadas e espera progressiva, sem bloquear os outros escritórios. **Atualizar dados** permite reagendar tarefas com falha após corrigir a causa.

## Permissões e recuperação

- Consulta: acesso ao Tech e ao módulo habilitado, conforme os papéis existentes.
- Atualização manual: gestão do módulo. Assinatura em somente leitura impede novas sincronizações, preservando a consulta autorizada.
- Conectar, trocar conta, selecionar repositórios, configurar, pausar e desconectar: administração do escritório e gestão do módulo.
- Integração, histórico e consultas são separados por escritório. Todas as rotas repetem a autorização no servidor.

O acesso da conta e dos repositórios selecionados é confirmado novamente em intervalos de até cinco minutos. A verificação é limitada por consulta; dados de repositórios ainda não confirmados ficam fora dos totais até concluir a conferência. Após revogação detectada, a visualização é bloqueada e pede reconexão. Uma restrição específica de repositório o retira dos totais, preservando os dados para recuperação.

**Pausar** interrompe novos lotes e mantém o acervo confirmado, sujeito à verificação de acesso. **Desconectar** retira os tokens locais e interrompe coleta e visualização, sem apagar o histórico. A desconexão não revoga indiscriminadamente uma autorização que possa atender outra conexão no GitHub; a remoção definitiva da concessão pode ser feita no próprio GitHub.

Reconectar a mesma conta permite retomar. Trocar de conta arquiva a conexão anterior, remove seus tokens e cria uma conexão nova. O histórico anterior permanece no banco e fica fora do painel da nova conta.

| Situação | Ação |
| --- | --- |
| Conexão ainda não configurada | Conferir as credenciais do OAuth App e o endereço público no servidor |
| Sessão de conexão mudou ou expirou | Voltar ao mesmo escritório e repetir a conexão |
| Organização não aparece | Conferir aprovação do aplicativo e SSO com o administrador da organização |
| Limite de consultas | Aguardar o prazo indicado pelo GitHub; o checkpoint foi preservado |
| Carga parada ao fechar a tela | Conferir a chamada autenticada do agendador e os registros em Integrações |
| Migração ausente | Aplicar a migration no fluxo autorizado; a tela não cria tabelas automaticamente |

O servidor nunca devolve tokens, códigos OAuth ou a configuração cifrada ao navegador. Os registros guardam IDs, datas, tipos e links; não guardam código-fonte, diffs, corpos completos de issues/revisões ou e-mails privados. Não há clone de repositórios.

## Implementação e verificações

Tecnologia: Next.js 16, React 19, Prisma e MariaDB/MySQL existentes. Sem serviço, pacote de gráficos ou fila externos novos.

- `src/lib/github/`: OAuth, cliente REST, regras, persistência, sincronização e consultas.
- `src/components/github/`: painel, calendário e detalhe diário.
- `src/components/admin/GithubIntegration.tsx`: conta, seleção e controles em Integrações.
- `/api/github`, `/api/github/events`, `/api/github/integration` e `/api/github/sync`: APIs autenticadas.
- `/api/integrations/github/connect` e `/callback`: autorização OAuth com PKCE e estado de uso único, vinculado à sessão e ao escritório.
- `/api/cron/github-sync`: lotes do agendador com token de serviço.

As oito tabelas são `github_connections`, `github_repositories`, `github_users`, `github_contributions`, `github_daily_contributions`, `github_sync_jobs`, `github_account_leases` e `github_oauth_attempts`. Credenciais ficam somente em `TenantIntegration.configEnc`. O histórico de rodadas reutiliza `IntegrationRun`.

Verificações reproduzíveis:

```powershell
npm run test:github
npx tsc --noEmit
npm run lint
```

Os testes de banco e navegador exigem **banco descartável explícito em localhost:33381/connect41**, separado da porta usada por outros módulos. Nunca apontar para `.env` ou banco de produção:

```powershell
$env:GITHUB_TEST_DATABASE_URL = 'mysql://root:<senha-local>@127.0.0.1:33381/connect41'
npm run test:github:db
node scripts/build-github-verification.mjs
npm run test:github:ui
```

O teste de banco confere a migration e exercita paginação, datas, contagens, retomada, concorrência, histórico reescrito, tokens, revogação, isolamento, permissões e OAuth com GitHub simulado. O teste de navegador usa o standalone, pessoas fictícias, API GitHub simulada e capturas em `.local/github/`, incluindo celular, tema escuro e áreas úteis equivalentes a 125%, 150% e 200%. A cópia de build não carrega credenciais de produção nem interrompe servidores existentes.

Validação local em 21/10/2026: 32 testes do GitHub aprovados, nove cenários de navegador aprovados sem erros de JavaScript, migration aplicada e compatível com o schema no banco descartável, TypeScript e build standalone aprovados. A suíte completa passou com 5.490 testes; o lint terminou sem erros e com um aviso preexistente em `scripts/exportar-empresas-para-prototipos.ts`. O banco descartável foi encerrado ao concluir.

Essas verificações não substituem a homologação do OAuth App real com as organizações desejadas. Prazo da carga inicial e capacidade devem ser medidos com os volumes reais, respeitando os limites da API.

## Atualização e retorno

Preservar a chave de cifra, configurações e banco. A migration é aditiva; para interromper o módulo, desativá-lo em Módulos e pausar/desconectar em Integrações. Retornar a um build anterior não exige apagar as tabelas novas ou históricos. Não remover registros ou checkpoints como tentativa de corrigir uma falha.

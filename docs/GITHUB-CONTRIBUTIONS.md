# GitHub — Contribuições

O módulo mostra a atividade diária de cada usuário nos repositórios monitorados pela conta GitHub conectada ao escritório. Conta commits, aberturas de pull requests e issues e revisões submetidas. A conexão fica em **Integrações → GitHub**. O menu lateral **GitHub** oferece **Geral** (`/github`), **Desenvolvedores** (`/github/desenvolvedores`) e **Repositórios** (`/github/repositorios`).

O módulo `tech_github_contributions` é exclusivo do **Tech**, nasce desligado e respeita o plano contratado. Não pode ser transferido para outro setor. Administradores mantêm o acesso amplo previsto nos papéis do Connect.

## Preparar e ativar

1. Em uma publicação autorizada, aplicar `prisma/migrations/20261021120000_github_contributions/migration.sql` pelo fluxo normal `prisma migrate deploy`. É uma migration aditiva: cria oito tabelas do GitHub, sem alterar registros dos outros módulos. Não usar reset ou db push em produção.
2. Configurar no servidor `APP_PUBLIC_URL` e a chave `SECRETS_ENCRYPTION_KEY` já usada pelo Connect. Cada instalação de empresa, com seu banco próprio, deve ter sua própria chave. Guardar a chave junto ao backup seguro da instalação: restaurar o banco exige a mesma chave para ler as credenciais. O domínio dos cookies continua seguindo `APP_DOMAIN`. Em produção, o endereço público deve usar HTTPS; HTTP é aceito apenas em loopback para verificação local.
3. Publicar o build normal do Connect e habilitar **GitHub — Contribuições** em Módulos, no Tech.
4. Cadastrar um **OAuth App** no GitHub da empresa. Copiar a **Authorization callback URL** exibida em **Integrações → GitHub → OAuth App da empresa** para o cadastro no GitHub. Preencher **Client ID** e **Client Secret** nessa tela e clicar em **Salvar credenciais**. O cadastro segue a [documentação oficial do GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).
5. Como administrador, abrir **Integrações → GitHub**, clicar em **Conectar GitHub** e autorizar a conta. Manter o mesmo escritório e a mesma sessão até retornar.
6. Aguardar o carregamento automático dos repositórios, selecionar os desejados e usar **Salvar e sincronizar**. Repositórios próprios, de colaboração e de organizações aparecem conforme o acesso autorizado. A coleta continua no servidor mesmo depois de fechar a página.

Client ID e Client Secret ficam cifrados em `TenantIntegration.configEnc`, no banco da empresa. A tela devolve apenas o Client ID e a indicação de segredo salvo. Não é necessário configurar `GITHUB_CLIENT_ID` ou `GITHUB_CLIENT_SECRET` no ambiente. Para instalações que usavam essas variáveis, preencher as mesmas credenciais na tela e autorizar a conta novamente; o histórico é preservado.

Ao editar, deixar Client Secret vazio mantém o segredo do mesmo Client ID. Trocar o Client ID exige informar seu novo segredo. Alterar qualquer credencial cancela autorizações pendentes, remove os tokens locais, pausa a sincronização e exige conectar novamente. Salvar os mesmos valores preserva a conexão. **Desconectar** remove apenas os tokens da conta e mantém as credenciais do OAuth App para reconexão. A renovação dos tokens usa as credenciais daquela conexão, conforme o [fluxo OAuth do GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

Para ler repositórios privados, OAuth usa o escopo `repo`, que também concede escrita. O módulo implementa somente consultas de atividade; o token não é tecnicamente restrito à leitura. Organizações podem exigir aprovação do aplicativo ou autorização SSO. Não ampliar permissões de uma organização automaticamente. Referências: [escopos OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps) e [autorização por organizações](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/authorizing-oauth-apps#oauth-apps-and-organizations).

A conta é compartilhada pelo escritório. Quem tem permissão para consultar o módulo verá a atividade dos repositórios selecionados, inclusive privados, sem precisar conectar sua própria conta GitHub. Se houver exigência de token estritamente de leitura, será necessário adotar GitHub App e autorizar sua instalação nos repositórios; esse não é o fluxo desta versão.

## Vínculo da conta pessoal (27/10/2026)

Quem vê o módulo (o Tech e os administradores) encontra em **Sua conta → GitHub** o botão **Vincular conta GitHub**. O GitHub confirma quem a pessoa é pelo mesmo OAuth App do escritório, **sem escopo**: o token só lê dados públicos e é descartado depois de ler o ID estável da conta. Nada da conexão do escritório muda. O retorno usa `/api/integrations/github/callback/conta`, um subcaminho da Authorization callback URL já cadastrada — o GitHub aceita `redirect_uri` em subdiretório dela, então o OAuth App não precisa de outro cadastro. Estado e PKCE seguem as regras da conexão, em tentativas marcadas como `purpose = account`, que não servem para a conexão do escritório (nem o contrário).

O vínculo fica em `github_account_links` (uma conta GitHub por pessoa e por escritório, pelo ID estável). Uma conta já vinculada a outra pessoa é recusada. **Desvincular** apaga só o vínculo; o histórico continua. Auditoria: `github.account_link` e `github.account_unlink`.

No painel o nome aparece ao lado do login: `login — Nome no Connect`.

## Uso do painel

- **Geral** reúne commits, PRs abertos, revisões e desenvolvedores ativos, gráfico de cadência, atividade do time e oito eventos mais recentes. As contagens abrangem todos os desenvolvedores dos filtros, sem o limite de vinte pessoas da lista. O gráfico agrupa períodos longos em até trinta janelas, somando as contribuições; o detalhe de cada ponto informa a janela. A atividade do time soma os quatro tipos, sem nota de produtividade.
- **Por padrão as três abas contam só quem vinculou a conta** em Sua conta. **Mostrar todos** inclui os autores sem vínculo (`all=1` na URL); clicar de novo volta aos integrados. Sem nenhum vínculo, o painel avisa e aponta para Sua conta.
- **Repositórios** lista todos os repositórios selecionados, do mais ativo ao menos (20 por página), cada um com os totais por tipo, o calendário do repositório e, ao lado, a contribuição de cada desenvolvedor no período. Clicar num dia abre as atividades daquele repositório.
- **Desenvolvedores** lista as pessoas acompanhadas e autores descobertos nos repositórios com acesso confirmado, incluindo quem está sem atividade no período, com os heatmaps e o detalhe diário existentes. O tipo selecionado também restringe os autores descobertos. Bots e autorias não identificadas seguem as regras abaixo.
- As duas abas preservam a busca e o período na navegação. Desde 26/10/2026 a barra tem só **De**, **Até** e a busca por desenvolvedor, sem a caixa **Filtros** nem o botão **Aplicar filtros**: a busca se aplica sozinha após 300 ms sem digitar, e cada data ao ser escolhida. **Limpar** aparece quando há busca ou período escolhido e volta ao padrão. Cobertura, fila e andamento da coleta ficam somente em **Integrações → GitHub**; o painel mostra um aviso apenas quando não há o que exibir (conta desconectada, nenhum repositório selecionado ou todos sem acesso).
- O detalhe do dia mostra o SHA curto do commit (ou o número do PR/issue) e o título: a primeira linha da mensagem do commit ou o título do PR/issue, gravados em `github_contributions.title` desde 27/10/2026. Contribuições coletadas antes disso ficam sem título até a próxima coleta delas; para preencher o histórico de uma vez, usar **Forçar atualização completa** em Integrações. Linhas alteradas, status de aprovação/merge e variações percentuais continuam fora.
- Filtrar por período de até 12 meses e login. A seleção fica na URL. A API ainda aceita repositório, organização/dono, tipo e bots, e links antigos com esses parâmetros continuam filtrando até usar **Limpar**.
- Consultar os totais separados por tipo e o calendário de cada usuário. A comparação é paginada em 20 usuários.
- Selecionar um dia com contribuições para abrir as atividades (SHA ou número, título, repositório e horário) e seus links no GitHub. Os eventos são consultados só ao abrir o dia, em páginas de 50. Dias sem contribuição aparecem como uma caixa com um traço e não são botões.
- Usar as setas do teclado no calendário, que andam entre os dias com contribuições: cima/baixo vão ao dia anterior/seguinte com atividade; esquerda/direita, a um dia com atividade uma semana ou mais antes/depois; Home/End, ao primeiro/último dia com atividade.
- Bots ficam ocultos no painel.
- Para acompanhar uma pessoa sem atividade no período, informar seu login em **Integrações → GitHub → Acompanhar usuário**.

O padrão do calendário é `America/Sao_Paulo`. O fuso pode ser ajustado antes da primeira coleta; depois disso fica fixo para preservar os agrupamentos. A escala de cores é a mesma para todos: zero, 1–2, 3–5, 6–9 e 10 ou mais contribuições no dia.

O painel lê o acervo já gravado no banco, sem consultar o GitHub ao abrir. Um dia vazio significa que nada foi coletado para ele; enquanto a primeira coleta de um repositório não termina, o painel pode mostrar menos atividade. O andamento e as falhas da coleta ficam em **Integrações → GitHub**.

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

O intervalo padrão é de 30 minutos, configurável entre 10 e 1.440 minutos. Os botões de Integrações criam tarefas persistidas; não dependem de trabalho solto após uma resposta HTTP.

No servidor persistente de produção (standalone/EasyPanel), `src/instrumentation.ts` inicia o executor GitHub automaticamente. Ele retoma tarefas na subida e verifica a fila a cada dez segundos depois de terminar o lote anterior, sem sobrepor rodadas no mesmo processo. A lease no banco coordena réplicas e o cron. Reinícios preservam os checkpoints. Desenvolvimento e build não iniciam esse executor. Falhas do relógio aguardam um minuto; as tarefas também respeitam seus próprios prazos de nova tentativa e o limite do GitHub.

Não é necessário configurar um cron externo. A rota autenticada `POST /api/cron/github-sync` continua disponível para contingência, com `Authorization: Bearer <CRON_SERVICE_TOKEN>`. Para usar exclusivamente um agendador externo, definir `GITHUB_SYNC_ENABLED=false` no servidor e chamar essa rota periodicamente. Ambientes serverless precisam desse agendador externo; o relógio interno requer processo Node persistente.

**Salvar e sincronizar**, **Retomar** e **Forçar atualização completa** colocam as tarefas na fila do servidor. As telas apenas consultam o resultado; nenhuma depende de manter Chrome aberto ou em primeiro plano. O status informa tarefas concluídas, pendentes, falhas, última atividade e prazo de nova tentativa. O total de tarefas pode aumentar quando PRs geram consultas de revisões, por isso não é apresentado como percentual fixo.

A carga inicial prioriza os últimos 30 dias e depois completa os últimos 12 meses. REST é consultada com paginação de até 100 itens. Cada repositório e recurso tem cursor e cobertura próprios. Revisões de PRs antigos atualizados no período também são consultadas. Depois da carga inicial, cada rodada busca só as alterações desde a última coleta, com um dia de sobreposição. Desde 26/10/2026 não há mais a reconciliação semanal de todos os repositórios: os 12 meses só são percorridos de novo para um repositório recém-selecionado (ainda sem cobertura) ou ao usar **Forçar atualização completa** em Integrações. Essa ação (auditada como `github.full_sync`) exige a sincronização ativa, renova a geração da conexão e coloca as tarefas de commits, issues e PRs de cada repositório selecionado na fila com a marca `forceFull` no cursor; a próxima coleta de cada tarefa percorre os 12 meses uma vez e descarta a marca. Pausar e retomar preserva o pedido, inclusive com a coleta completa já em andamento.

Commits incrementais usam comparação entre heads para incluir commits antigos incorporados por merge. Se houver divergência ou reescrita, uma coleta do branch padrão na mesma janela incremental reconcilia os commits atuais antes de retirar os antigos dos totais. Commits mais antigos que saíram do branch só deixam os totais na próxima atualização completa forçada. Registros anteriores permanecem no banco.

Há uma lease no banco por identidade GitHub, compartilhada entre conexões, e verificação de geração a cada gravação. Um executor que perde a lease ou responde depois de pausa/troca de conta não publica seu lote. Checkpoint, contribuições e agregados são confirmados na mesma transação. Reiniciar ou repetir uma página não duplica a contagem.

`Retry-After` e os headers de limite do GitHub são respeitados. A espera fica persistida; não há laço de novas tentativas durante a mesma espera. Falhas transitórias usam tentativas limitadas e espera progressiva, sem bloquear os outros escritórios. A rodada seguinte do intervalo reagenda tarefas com falha; em Integrações, **Pausar**/**Retomar** também as reagendam após corrigir a causa.

## Permissões e recuperação

- Consulta: acesso ao Tech e ao módulo habilitado, conforme os papéis existentes.
- Atualização manual pela rota `/api/github/sync`: gestão do módulo. O painel não tem mais o botão **Atualizar dados**. Assinatura em somente leitura impede novas sincronizações, preservando a consulta autorizada.
- Conectar, trocar conta, selecionar repositórios, configurar, forçar a atualização completa, pausar e desconectar: administração do escritório e gestão do módulo.
- Integração, histórico e consultas são separados por escritório. Todas as rotas repetem a autorização no servidor.

O executor começa a revalidar conta e repositórios após quatro minutos, em lotes de até vinte repositórios e com orçamento de tempo. As leituras do painel e dos eventos usam apenas o banco, sem chamadas à API GitHub ou disputa da lease. Desde 26/10/2026 elas mostram o acervo gravado dos repositórios selecionados, de conexão ativa e do mesmo escritório, sem exigir confirmação de acesso dos últimos cinco minutos (essa janela escondia os dados até o executor passar). Após revogação detectada pelo executor, a conexão passa a pedir reconexão e a visualização é bloqueada. Um repositório marcado sem acesso sai dos totais, preservando os dados para recuperação. Pausar a coleta mantém a conferência periódica de acesso.

**Pausar** interrompe novos lotes e mantém o acervo confirmado, sujeito à verificação de acesso. **Desconectar** retira os tokens locais e interrompe coleta e visualização, sem apagar o histórico. A desconexão não revoga indiscriminadamente uma autorização que possa atender outra conexão no GitHub; a remoção definitiva da concessão pode ser feita no próprio GitHub.

Reconectar a mesma conta permite retomar. Trocar de conta arquiva a conexão anterior, remove seus tokens e cria uma conexão nova. O histórico anterior permanece no banco e fica fora do painel da nova conta.

| Situação | Ação |
| --- | --- |
| Credenciais do OAuth App ausentes | Preencher Client ID e Client Secret em Integrações → GitHub |
| Instalação sem endereço público ou proteção de credenciais | Configurar APP_PUBLIC_URL e SECRETS_ENCRYPTION_KEY no servidor |
| Sessão de conexão mudou ou expirou | Voltar ao mesmo escritório e repetir a conexão |
| Organização não aparece | Conferir aprovação do aplicativo e SSO com o administrador da organização |
| Limite de consultas | Aguardar o prazo indicado pelo GitHub; o checkpoint foi preservado |
| Carga parada ao fechar a tela | Publicar a versão com executor interno, conferir GITHUB_SYNC_ENABLED e os logs do processo Node; se false, conferir o cron externo |
| Migração ausente | Aplicar a migration no fluxo autorizado; a tela não cria tabelas automaticamente |

O servidor nunca devolve tokens, códigos OAuth ou a configuração cifrada ao navegador. Os registros guardam IDs, datas, tipos e links; não guardam código-fonte, diffs, corpos completos de issues/revisões ou e-mails privados. Não há clone de repositórios.

## Implementação e verificações

Tecnologia: Next.js 16, React 19, Prisma e MariaDB/MySQL existentes. Sem serviço, pacote de gráficos ou fila externos novos.

- `src/lib/github/`: OAuth, cliente REST, regras, persistência, sincronização e consultas.
- `src/components/github/`: painel, calendário e detalhe diário.
- `src/lib/github/scheduler.ts`: relógio automático com um lote por vez; `progress.ts`: resumo persistido do andamento.
- Calendário leve (27/10/2026): os dias vazios são o fundo da grade — uma máscara CSS de 16 px repetida, com a caixa e o traço —, e só os dias com contribuição são elementos (botões posicionados na grade). A montagem/desmontagem por IntersectionObserver saiu: refazia milhares de nós a cada cartão que cruzava a área visível e era o que travava a rolagem de Desenvolvedores. Os cartões usam `content-visibility: auto`, então o navegador não pinta nem diagrama o que está fora da tela. No banco local, 20 calendários de um ano somam ~3,3 mil nós na página inteira e cada passo de rolagem custa ~2 ms de layout, sem trabalho do React. Clique e teclado continuam tratados uma vez na grade. Datas usam um único formatador e cache limitado.
- O painel consulta `/api/github` uma vez por busca ou período, sem polling nem revisão (26/10/2026). A resposta não traz cobertura, fila ou progresso, que ficam em `/api/github/integration`; por isso a leitura não toca `github_sync_jobs` nem a lease. Cada consulta continua autorizada no servidor; não há cache compartilhado de dados privados. Consultas independentes são executadas em paralelo, e em Desenvolvedores os totais por tipo e o calendário por dia são agrupados em consultas separadas.
- `src/components/admin/GithubIntegration.tsx`: conta, seleção e controles em Integrações.
- `/api/github`, `/api/github/events`, `/api/github/integration` e `/api/github/sync`: APIs autenticadas.
- `/api/integrations/github/connect` e `/callback`: autorização OAuth com PKCE e estado de uso único, vinculado à sessão e ao escritório.
- `/api/cron/github-sync`: lotes do agendador com token de serviço.

As nove tabelas são `github_connections`, `github_repositories`, `github_users`, `github_contributions`, `github_daily_contributions`, `github_sync_jobs`, `github_account_leases`, `github_oauth_attempts` e `github_account_links` (27/10/2026, migration aditiva `20261027120000_github_account_links`, que também acrescenta `github_contributions.title` e `github_oauth_attempts.purpose`). Credenciais ficam somente em `TenantIntegration.configEnc`. O histórico de rodadas reutiliza `IntegrationRun`.

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

Validação inicial do módulo em 21/10/2026: 32 testes do GitHub aprovados, nove cenários de navegador aprovados sem erros de JavaScript, migration aplicada e compatível com o schema no banco descartável, TypeScript e build standalone aprovados. A suíte completa passou com 5.490 testes; o lint terminou sem erros e com um aviso preexistente em `scripts/exportar-empresas-para-prototipos.ts`. O banco descartável foi encerrado ao concluir.

Validação do cadastro OAuth por empresa em 21/10/2026: 38 testes do GitHub com MySQL descartável e API simulada e 70 testes relacionados de auditoria/catálogo aprovados. Onze verificações no navegador aprovadas, incluindo o formulário no celular, segredo oculto, callback da instalação, salvamento sem alterações, troca de segredo e retorno OAuth sem variáveis GitHub no servidor. TypeScript, lint dos arquivos alterados e build standalone aprovados. Nenhuma nova migration é necessária para esta alteração. Capturas e resultado do navegador em `.local/github/github-integration.png`, `github-oauth-mobile.png` e `ui-result.json`. O MySQL usado nesta rodada foi criado somente para verificação e encerrado ao concluir.

Validação da execução automática e desempenho em 22/10/2026: 42 testes do módulo com MySQL descartável/API simulada e 13 checks de navegador aprovados, sem erros de JavaScript. O standalone concluiu a fila com o navegador em `about:blank`, sem tela Connect aberta. No cenário com 20 usuários e um ano de calendário, a primeira área exibida montou 366 botões de dias em vez de 7.320 (95% menos); os demais calendários são montados com a rolagem. Cobertura, filtros, detalhes, teclado, celular e escalas continuaram funcionando. Build standalone, TypeScript, lint dos arquivos alterados e `git diff --check` aprovados. A fixture SQL usa UTC para representar os mesmos instantes do Prisma. Não há nova migration; o contêiner descartável foi encerrado e removido ao concluir. Relatório e capturas em `.local/github/ui-result.json` e `.local/github/github-*.png`.

Essas verificações não substituem a homologação do OAuth App real com as organizações desejadas. Prazo da carga inicial e capacidade devem ser medidos com os volumes reais, respeitando os limites da API.

Validação das abas Geral e Desenvolvedores em 23/10/2026: 49 testes do módulo com MySQL descartável e GitHub simulado aprovados, incluindo resumo de uma equipe maior que a paginação, usuário sem atividade e retirada de dados após expiração de acesso. TypeScript, lint dos arquivos alterados, build standalone isolado e 16 verificações de navegador aprovados. A validação visual cobre menu lateral, filtros entre abas, heatmaps, detalhe diário, teclado, celular e escalas de 125%, 150% e 200%, incluindo a largura dos campos de data. Relatório e capturas em `.local/github/ui-result.json` e `.local/github/github-*.png`. Sem nova migration nem alteração da integração real.

Painel leve e coleta incremental em 26/10/2026: barra só com busca e período, sem a seção de cobertura/sincronização nas abas, dias vazios sem botão, leitura sem a janela de cinco minutos e fim da reconciliação semanal, com **Forçar atualização completa** em Integrações. TypeScript e testes unitários do módulo aprovados (incluindo a janela de coleta em `store.test.ts`); os testes com MySQL descartável foram atualizados, mas não executados nesta rodada por falta do banco em 33381. Sem nova migration: a marca de atualização completa fica no cursor JSON da tarefa.

## Atualização e retorno

Preservar a chave de cifra, configurações e banco. A migration é aditiva; para interromper o módulo, desativá-lo em Módulos e pausar/desconectar em Integrações. Retornar a um build anterior não exige apagar as tabelas novas ou históricos. Não remover registros ou checkpoints como tentativa de corrigir uma falha.

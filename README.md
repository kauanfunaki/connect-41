# Connect 41

Plataforma web da 41 Tech para organizar o trabalho de escritórios contábeis e o atendimento aos seus clientes. Reúne cadastros, tarefas, processos, rotinas financeiras, pessoas, documentos e integrações em um sistema **multiempresa, multissetor e multi-tenant**.

Este README é o ponto de entrada do projeto. Os detalhes de operação e implantação de cada recurso ficam nos guias de [documentação](#onde-encontrar-informações).

Atalhos: [iniciar localmente](#como-iniciar-localmente) · [setores e módulos](#escritórios-setores-e-módulos) · [integrações](#integrações-e-execução-externa) · [estrutura do código](#estrutura-do-repositório) · [verificações](#verificações) · [documentação](#onde-encontrar-informações).

## Visão geral

O repositório reúne quatro frentes:

| Frente | O que oferece | Entrada |
|---|---|---|
| Equipe do escritório | Meu dia, quadros, cadastros, transferências entre setores, agenda e módulos operacionais | `/login` → `/home` |
| Portal do Cliente | Documentos, arquivos, solicitações, pendências, aprovações e acompanhamento das empresas vinculadas à conta | `/portal/login` |
| Administração | Escritório, usuários, permissões, setores, módulos, integrações e configurações do portal; gestão de workspaces e planos para o Super Admin | `/admin` |
| Páginas públicas | Site de apresentação, links de documentos e admissão, testes e portal de carreiras | Rotas e domínios próprios de cada fluxo |

O portal também tem suporte a PWA e um projeto Android TWA em [`android/`](android/README.md), que abre o mesmo portal. O servidor Next.js continua sendo necessário.

### Tecnologias

- **Next.js 16.2.9**, com App Router e Turbopack; **React 19.2.4** e **TypeScript**.
- **Tailwind CSS 4**, estilos globais e componentes compartilhados, com temas claro e escuro.
- **Prisma 7**, adapter MariaDB e banco **MySQL/MariaDB**; o ambiente local usa MySQL 8 em Docker.
- Autenticação própria com **JWT**, cookies e renovação de sessão; sessões distintas para equipe e portal.
- **Vitest** para testes de regras e **Playwright** nos roteiros de navegador.
- Build **standalone**, distribuído em Docker para o EasyPanel. CI e Docker usam **Node.js 22**.

As versões e os comandos oficiais estão em [`package.json`](package.json) e [`package-lock.json`](package-lock.json). Use npm e preserve o lockfile.

## Como iniciar localmente

O caminho abaixo usa o ambiente de demonstração já mantido no repositório: banco próprio, dados fictícios e lançador que confere se a URL do banco é local.

> O `.env` de uma cópia de trabalho pode conter conexão de produção. Não o use como configuração de desenvolvimento. O Next não carrega `.env.localdev` automaticamente: execute os comandos pelo `com-banco-local.mjs`. Ele sobrepõe os valores definidos nesse arquivo e recusa bancos fora de `localhost`/`127.0.0.1`; variáveis omitidas ainda podem vir do terminal ou dos arquivos que a ferramenta carregar.

### 1. Pré-requisitos e dependências

Tenha **Node.js 22**, npm e **Docker Desktop** em execução. No terminal, a partir da raiz do repositório:

```powershell
cd C:\Dev\connect-41
npm ci
```

O caminho acima é o checkout usado neste ambiente; ajuste-o se tiver clonado em outro lugar. Os scripts de preparação usam `npx tsx`, que pode solicitar o download da ferramenta na primeira execução.

### 2. Criar a configuração local

Crie `.env.localdev` na raiz, sem substituir um arquivo local já configurado. Use este modelo com valores exclusivos de teste:

```dotenv
LOCAL_MYSQL_ROOT_PASSWORD=troque_por_uma_senha_local
DATABASE_URL=mysql://root:troque_por_uma_senha_local@127.0.0.1:3307/connect41?allowPublicKeyRetrieval=true
JWT_ACCESS_SECRET=troque_por_um_segredo_local_longo_e_aleatorio
JWT_REFRESH_SECRET=troque_por_outro_segredo_local_longo_e_aleatorio
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
SECRETS_ENCRYPTION_KEY=troque_por_uma_chave_local_longa_e_aleatoria
CRON_SERVICE_TOKEN=troque_por_um_token_local_longo_e_aleatorio
SEED_ADMIN_PASSWORD=troque_por_uma_senha_local_de_12_ou_mais_caracteres
LOCAL_PORTAL_PASSWORD=troque_por_outra_senha_local
APP_PUBLIC_URL=http://localhost:3100
APP_DOMAIN=
SECTOR_HOST_SUFFIX=
SECTOR_HOST_SUFFIX_ANTIGO=
GITHUB_SYNC_ENABLED=false

# Sem credenciais externas no ambiente de demonstração
HUB_API_URL=
HUB_SERVICE_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
PORTAL_GOOGLE_REDIRECT_URI=
PORTAL_GOOGLE_LIGADO=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=
VAPID_PUBLIC_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
SERPRO_TRIAL_TOKEN=
CARREIRAS_HOSTS=
CARREIRAS_HOST_PRINCIPAL=
PORTAL_ESCRITORIO_SLUG=
SPED_API_URL=
SPED_API_TOKEN=
```

Use `CHAVE=valor`, **sem aspas nem espaços ao redor do `=`**: o lançador local faz uma leitura simples desse arquivo. A senha da URL deve corresponder a `LOCAL_MYSQL_ROOT_PASSWORD`; se contiver caracteres reservados de URL, codifique-os na URL. O banco deve se chamar **`connect41`**, como exige `prisma.config.ts`, e a porta padrão dos scripts locais é **3307**.

As variáveis vazias evitam herdar essas configurações de outro ambiente. SPED, Omie, Chatwoot, GitHub e IA têm credenciais próprias no banco por escritório; deixar o ambiente vazio não desliga uma conexão já cadastrada. Use o banco fictício, sem importar dados ou conexões de produção. `SPED_API_URL` e `SPED_API_TOKEN` são nomes legados e não configuram a integração atual.

O inventário de variáveis do servidor está em [`.env.example`](.env.example). Ele inclui exemplos de produção: consulte as descrições, mas ajuste banco, URLs e segredos para o ambiente local. Nunca versione `.env`, `.env.localdev` ou credenciais reais.

### 3. Gerar o cliente Prisma e preparar o banco

```powershell
node scripts/local/com-banco-local.mjs npx prisma generate
```

**Somente na primeira preparação ou quando quiser descartar a demonstração existente**, execute:

```powershell
node scripts/local/recriar-banco.mjs
```

Esse comando cria ou inicia o container **`connect41-local`**, publica MySQL em **`127.0.0.1:3307`**, **apaga e recria o banco local `connect41`** e carrega escritório, administrador, empresas, pessoas e cenários fictícios. Não execute para apenas atualizar uma base local que deseja preservar.

As tabelas locais são geradas do schema atual com `prisma migrate diff --from-empty`. O histórico de migrations inclui alterações sobre tabelas anteriores ao versionamento completo e **não reconstrói uma base vazia sozinho**. Por isso, `prisma migrate deploy` não substitui este preparo local. O seed isolado também não cria tabelas nem todos os dados da demonstração.

### 4. Iniciar em desenvolvimento

```powershell
node scripts/local/com-banco-local.mjs npm run dev -- --port 3100
```

| Acesso | Endereço | Conta local |
|---|---|---|
| Equipe | [localhost:3100/login](http://localhost:3100/login) | `adm6@41bpo.com.br` + `SEED_ADMIN_PASSWORD` |
| Portal | [localhost:3100/portal/login](http://localhost:3100/portal/login) | `cliente.demo@exemplo.invalido` + `LOCAL_PORTAL_PASSWORD` |

As contas acima são preparadas pelos scripts locais. O seed não redefine a senha de um administrador que já existe. Para encerrar o servidor, use **Ctrl+C** no terminal correspondente. Em outra sessão, inicie o banco existente com `docker start connect41-local`; não é necessário recriá-lo.

No ambiente local, deixe `APP_DOMAIN` vazio e escolha o setor pelo seletor do Connect. Não é necessário configurar DNS ou subdomínios.

### 5. Conferir o build compilado

Pare o servidor anterior antes de gerar outro build. Para executar o mesmo formato de servidor usado no Docker:

```powershell
node scripts/local/com-banco-local.mjs npm run build:local
$env:PORT = '3100'
$env:HOSTNAME = '127.0.0.1'
node scripts/local/com-banco-local.mjs node .next/standalone/server.js
```

`build:local` verifica se há standalone em execução no Windows e então chama `build`. O build gera o cliente Prisma, compila o Next e copia os assets para o standalone; **não atualiza o banco**. O script `start` do pacote corresponde a `next start`; para o artefato standalone, use `server.js`, como acima.

Em `next dev`, o agendador interno de alertas e a coleta automática do GitHub não iniciam. O servidor compilado inicia as rotinas de produção; mantenha o banco fictício e as integrações sem credenciais reais. No modelo local acima, `GITHUB_SYNC_ENABLED=false` também desliga o executor automático do GitHub.

### Atualizar o banco local preservando os dados

Depois de receber mudanças de schema, pare o servidor e primeiro consulte a diferença:

```powershell
node scripts/local/atualizar-banco.mjs
```

Para aplicar as alterações aceitas pelo atualizador:

```powershell
node scripts/local/atualizar-banco.mjs --aplicar
node scripts/local/com-banco-local.mjs npx prisma generate
```

O atualizador exige o banco `connect41` na porta 3307 e, para aplicar, confere o container `connect41-local`. Salva backup em `storage/backups`, preserva dados e senhas e bloqueia mudanças fora das regras aditivas e da exceção revisada de auditoria. Se recusar uma diferença, revise-a; não use a recriação como atualização automática.

O guia completo de demonstração, perfis por setor, e-mail local e gravação de vídeos está em [`scripts/local/README.md`](scripts/local/README.md). Para preparar a prévia fiscal fictícia:

```powershell
node scripts/local/com-banco-local.mjs npx tsx scripts/local/preparar-fiscal.ts
```

### Problemas comuns

| Sintoma | O que conferir |
|---|---|
| Falta `.env.localdev` ou URL local recusada | Arquivo na raiz, formato sem aspas e host `127.0.0.1`/`localhost` |
| Prisma informa banco diferente do esperado | Nome `connect41` na URL; use o lançador para sobrepor uma `DATABASE_URL` herdada |
| Conexão recusada ou timeout do banco | Docker aberto, container iniciado e porta 3307 disponível; confirme o destino local antes de qualquer comando de banco |
| Prisma Client ou tabelas ausentes | Gere o cliente; na primeira preparação, crie o banco com o roteiro acima; nas seguintes, use o atualizador |
| Login local recusado | Banco de demonstração correto e senha usada quando a conta foi criada; repetir apenas o seed não troca essa senha |
| Tela de módulo retorna 404 | Verifique ativação do módulo, plano, papel e setores do usuário |
| Standalone ausente ou assets não carregam | Pare o servidor anterior e refaça `build:local`; inicie pelo lançador com os assets do mesmo build |
| E-mail ou push indisponível | A demonstração não envia e-mail externo; SMTP local e chaves VAPID de teste são opcionais, conforme o guia local |

## Escritórios, setores e módulos

### Escritório é o limite dos dados

Um **Tenant** representa um escritório/workspace. Dentro dele ficam empresas clientes (`Company`), pessoas (`Person`), equipe, setores, módulos e configurações. Uma empresa atendida pelo escritório não é outro tenant. O portal dá acesso apenas às empresas vinculadas à conta do cliente.

Usuários comuns ficam no próprio escritório. O `SUPER_ADMIN` pode alternar para outros workspaces mediante as concessões de acesso previstas no sistema; o tenant ativo continua delimitando as consultas.

### Setor organiza equipe e operação

Os setores vivem no banco por escritório. O administrador pode cadastrar, renomear, ordenar e desativar setores em **Configurações → Setores e módulos** (`/admin/setores`). Os nomes e cores iniciais vêm de [`sector-constants.ts`](src/lib/sector-constants.ts); depois, vale o cadastro do escritório.

Uma pessoa pode pertencer a vários setores. O seletor no topo escolhe o contexto de navegação e o filtro padrão. **Trocar o setor ativo não concede nem retira permissões.** A opção “Todos os setores” reúne somente o alcance que o usuário já tem.

### Módulo define uma funcionalidade

O catálogo em [`module-catalog.ts`](src/lib/module-catalog.ts) define os módulos implementados, suas rotas, setor de origem, grupo, ícone e ativação inicial. A configuração do escritório decide quais ficam ligados, respeitando os módulos permitidos pelo plano.

Em **Setores e módulos**, o administrador pode:

- Ligar ou desligar um módulo para o escritório, dentro do permitido pelo plano.
- Usar **Mover para…** para mudar o setor dono.
- Usar **Também em…** para disponibilizar a mesma tela a outros setores. A rota e os dados continuam sendo os da mesma funcionalidade; registros com escopo próprio continuam respeitando esse escopo.
- Ajustar quais telas do **menu Geral** aparecem em cada setor. Essa preferência de menu altera visibilidade; a autorização continua sendo conferida no servidor.

O usuário alcança uma tela compartilhada se puder acessar algum dos setores ligados a ela, no nível exigido pela ação. Avisos destinados ao setor dono continuam indo para ele. Módulos com `fixedSector`, como GitHub — Contribuições, têm restrição de movimentação e compartilhamento.

Desligar um módulo bloqueia suas telas e ações protegidas, preservando os registros. Ligar um módulo não configura automaticamente sua integração externa. Nem toda aba é um módulo independente: algumas são visões da mesma funcionalidade.

### Divisão funcional atual

Esta tabela mostra o **setor de origem do catálogo**. O escritório pode ter uma distribuição diferente por movimentação ou compartilhamento.

| Setor | Funcionalidades |
|---|---|
| **Tech** | Controle interno (Lista, Kanban e Agenda por prazo), Ops Center, GitHub — Contribuições, chamados internos e controle de vencimento de certificados digitais |
| **Controladoria** | Conversas do Chatwoot e avaliação de atendimento, solicitações dos clientes e Arquivos |
| **Comercial** | Leads e acompanhamento de interessados em contratar o escritório |
| **Recrutamento** | Vagas, candidatos, colaboradores de clientes, testes e WhatsApp de recrutamento; conexão com o portal de carreiras |
| **DP** | Colaboradores, admissões, férias e desligamentos; afastamentos, horas extras, escalas, treinamentos e avaliações |
| **Gestão** | Painel de Gestão, cargos e salários, indicadores de RH e Valora para precificação de honorários |
| **Societário** | Processos, Minha área, exigências e prazos, relatórios e licenças |
| **BPO** | Contas a pagar/receber, lançamentos, cobrança, fluxo de caixa, conciliação OFX, fornecedores e sacados, tabela dinâmica, painel da carteira, pendências, aprovações e comunicação com clientes; DRE financeira/econômica, análises, orçamento, manuais, cofre de senhas e emissão de NFS-e via Omie |
| **Fiscal** | SPED: classificação, documentos/importações, ICMS/IPI, PIS/COFINS, conferência, configurações, execução e arquivos gerados; autorizações de acesso e acervo de documentos fiscais |
| **Contábil** | SPED Contábil: conferência, regras e arquivos pela API/fila do motor SPED |
| **Financeiro e Corretora** | Setores cadastrados no padrão inicial, sem módulo de origem próprio no catálogo atual. Podem usar o núcleo comum e receber módulos movidos ou compartilhados |

Alguns módulos nascem **desligados**, como Ops Center, GitHub, chamados, certificados, WhatsApp de recrutamento, licenças, Valora, DREs/análises/orçamento, documentos fiscais e emissão de NFS-e. A referência exata é `defaultEnabled` no catálogo, combinada com plano e configuração do tenant.

O menu agrupa módulos por assunto. Solicitações, Arquivos e Chamados ficam no **Geral**, com suas regras específicas; fornecedores e sacados aparecem nos **Cadastros** para quem alcança o módulo. Pendências e aprovações do BPO também aparecem como abas das Solicitações quando estas estão ligadas. No Fiscal, uma entrada **SPED** reúne as áreas internas, mantendo a ativação independente dos módulos.

### Papéis e escopo

| Papel | Alcance geral |
|---|---|
| `SUPER_ADMIN` | Administração da plataforma e acesso aos workspaces autorizados |
| `ADMIN` | Administração e operação ampla do escritório ativo |
| `SECTOR_ADMIN` | Gestão e operação nos setores aos quais pertence |
| `SECTOR_USER` | Consulta e ações operacionais permitidas nos seus setores |
| `READONLY` | Consulta ampla do escritório, sem escrita operacional |

O papel não substitui as regras do módulo, do registro ou dos campos sensíveis. A assinatura também pode colocar o escritório em somente leitura. Exclusão de registros/configurações exige administrador, conforme a política central e suas exceções documentadas em [`auth/papeis.ts`](src/lib/auth/papeis.ts).

O núcleo compartilhado inclui empresas, pessoas, serviços contratados por empresa/setor, quadros/pipelines, tarefas, atividades, transferências (`Handoff`), campos personalizados, notificações e agenda. O escopo de empresas e pessoas considera serviços, vínculos e participação nos fluxos; não basta filtrar apenas o menu. Páginas, ações e downloads validam acesso no servidor.

## Integrações e execução externa

As conexões ficam em **Configurações → Integrações e IA** (`/admin/integracoes`). Módulo ligado, credencial configurada e autorização para executar são condições distintas.

| Integração | Configuração e função |
|---|---|
| SPED Generator | URL e tokens por escritório na tela de integrações; Connect consulta a API do motor e envia operações à fila/agentes, sem acessar diretamente o banco do SPED |
| Omie | Credenciais das conexões das empresas; cadastros, financeiro e emissão de NFS-e conforme o fluxo habilitado. Emissão pode gerar documento real |
| Chatwoot | Conta, URL, token e webhook por escritório; histórico de conversas, vínculos e avaliação |
| GitHub | OAuth App e conexão por escritório na UI, repositórios selecionados e sincronização retomável; callback derivado de `APP_PUBLIC_URL` |
| IA / Ceci | Provedor e chave por escritório na UI; recursos e permissões variam por módulo. Não exige chave global de OpenAI/Anthropic no ambiente |
| Google e Microsoft | Cliente OAuth no servidor e conexão da conta na UI para agenda/reuniões; Google também pode atender ao login do portal |
| SMTP e Web Push | E-mail de envio do escritório na administração; chaves VAPID no servidor para notificações do navegador |
| Serpro | Conexão, ambiente e autorizações conforme a integração; o token do trial, quando usado, vem de `SERPRO_TRIAL_TOKEN` |
| Ops Center e pasta de rede | Bots externos enviam heartbeat/eventos com chave do escritório; o robô de rede é um processo separado e só atende empresas autorizadas no piloto |
| 41-Tech-Hub | `HUB_API_URL` e token de serviço para solicitações de acesso/recuperação pelo login |

Credenciais sensíveis das integrações são cifradas no servidor. Preserve `SECRETS_ENCRYPTION_KEY` junto ao backup seguro: trocar a chave pode impedir a leitura das configurações existentes. Segredos não devem ir para frontend, logs ou Git.

**Fiscal: demonstração e motor real.** A integração SPED configurada tem precedência. Sem ela, o banco local preparado oferece a prévia fictícia; sem nenhuma das fontes, a tela informa indisponibilidade. A prévia não gera nem transmite obrigações reais. No modo real, as ações dependem dos endpoints do motor e do token de escrita; funcionalidades ainda não fornecidas pela API aparecem como indisponíveis. Consulte o [guia fiscal](docs/FISCAL-PREVIA-VISUAL.md#modo-real-motor-sped).

Não conecte serviços, execute bots de rede, emita notas ou envie comunicações reais para validar o ambiente de demonstração. Os contratos e roteiros específicos estão nos guias abaixo.

## Estrutura do repositório

```text
src/
  app/
    (app)/          Equipe, módulos e administração; páginas e Server Actions
    (portal)/       Portal do Cliente
    api/            APIs, callbacks, webhooks, downloads e endpoints de bots
    carreiras/      Portal público de vagas e candidaturas
    login/          Entrada da equipe
  components/       Componentes por domínio; ui/, shared/ e shell/ compartilhados
  lib/              Regras, consultas, permissões, integrações e testes por domínio
  generated/prisma/ Cliente gerado; não editar nem versionar
  proxy.ts          Autenticação, contexto e roteamento por host/setor
  instrumentation.ts Inicialização das rotinas internas do servidor
prisma/
  schema.prisma     Modelo de dados
  migrations/       Histórico versionado de alterações
  seed.ts           Escritório e administrador iniciais
scripts/
  local/            Banco, dados fictícios e verificações locais
  videos/           Gravação dos roteiros de ajuda
docs/               Guias técnicos, levantamentos, propostas e fluxos
public/             Assets, ícones, fontes e service worker
android/            App TWA do Portal do Cliente
storage/            Arquivos privados e backups locais de execução; fora do Git
.github/workflows/  CI
```

As rotas da equipe normalmente combinam `page.tsx`, `actions.ts` e componentes do domínio. A lógica reutilizável fica em `src/lib`. O alias `@/` aponta para `src/`.

### Onde alterar cada regra

| Assunto | Referência no código |
|---|---|
| Setores iniciais e cadastro por escritório | [`sector-constants.ts`](src/lib/sector-constants.ts), [`sectors.ts`](src/lib/sectors.ts) |
| Módulos, rotas, grupos e padrões de ativação | [`module-catalog.ts`](src/lib/module-catalog.ts) |
| Ativação, plano, setor dono e compartilhamento | [`modules.ts`](src/lib/modules.ts), [`modulo-setor.ts`](src/lib/modulo-setor.ts) |
| Permissão para abrir/operar um módulo | [`auth/modulo.ts`](src/lib/auth/modulo.ts) |
| Contexto, papéis, escopo dos registros e setor ativo | [`auth/context.ts`](src/lib/auth/context.ts), [`auth/papeis.ts`](src/lib/auth/papeis.ts), [`auth/scope.ts`](src/lib/auth/scope.ts), [`auth/activeSector.ts`](src/lib/auth/activeSector.ts) |
| Menu e navegação | [`AppShell.tsx`](src/components/shell/AppShell.tsx), [`menuGeral.ts`](src/lib/menuGeral.ts), [`menu-sped.ts`](src/lib/fiscal/menu-sped.ts) |
| Áreas das configurações | [`configuracoes/areas.ts`](src/lib/configuracoes/areas.ts) |
| Integrações disponíveis e configuração | [`integracoes/catalogo.ts`](src/lib/integracoes/catalogo.ts), [`integracoes/data.ts`](src/lib/integracoes/data.ts) |
| Ajuda e vídeos exibidos no produto | [`ajuda/artigos.ts`](src/lib/ajuda/artigos.ts), [`ajuda/videos.ts`](src/lib/ajuda/videos.ts) |
| Estrutura e conexão do banco | [`schema.prisma`](prisma/schema.prisma), [`prisma.config.ts`](prisma.config.ts), [`prisma.ts`](src/lib/prisma.ts) |

## Verificações

Para conferir uma alteração, use as verificações proporcionais ao que mudou. O CI executa geração do Prisma, tipos de rota, TypeScript, ESLint, Vitest e build standalone. Para reproduzir os checks gerais com a configuração local:

```powershell
node scripts/local/com-banco-local.mjs npx prisma generate
node scripts/local/com-banco-local.mjs npx next typegen
npx tsc --noEmit
npm run lint
node scripts/local/com-banco-local.mjs npm test
node scripts/local/com-banco-local.mjs npm run build:local
```

`npm run test:watch` mantém o Vitest aberto. Há suítes específicas `test:ops`, `test:helpdesk` e `test:github`, além das variantes `:db` e `:ui`.

**Testes com banco e navegador exigem um banco descartável explícito**, que pode ser recriado pelos roteiros. Configure `OPS_TEST_DATABASE_URL`, `HELPDESK_TEST_DATABASE_URL` ou `GITHUB_TEST_DATABASE_URL` conforme o guia correspondente. Não aponte para produção nem para uma base de demonstração cujos dados queira preservar. Consulte os guias para portas, fixtures e preparo do build de cada suíte.

Os testes de regras ficam próximos ao código, em `src/**/*.test.ts`. As opções do Vitest estão em [`vitest.config.ts`](vitest.config.ts); os passos do CI, em [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Build, publicação e dados persistentes

[`Dockerfile`](Dockerfile) instala as dependências com `npm ci`, executa `npm run build` e inicia o `server.js` do standalone como usuário sem privilégios. A configuração está em [`next.config.ts`](next.config.ts).

Em uma implantação autorizada, configure banco, JWT, chave de cifra e `APP_PUBLIC_URL` no servidor. `APP_DOMAIN` habilita os endereços por setor; `SECTOR_HOST_SUFFIX` e `SECTOR_HOST_SUFFIX_ANTIGO` controlam os sufixos e redirecionamentos. OAuth, portal de carreiras, push e Android têm variáveis adicionais descritas em `.env.example` e nos seus guias.

O Controle interno do Tech e as chaves adicionais do Ops Center dependem das migrations `20261021160000_tech_internal` e `20261023120000_ops_multiple_keys`; aplique-as no ambiente autorizado antes da publicação. O SPED Contábil exige a implantação separada da API contábil do motor SPED.

Preserve o banco e os diretórios graváveis **`storage/`** e **`public/uploads/`** com volumes e backups apropriados. O build não executa migrations. Alterações do banco de um ambiente existente devem seguir o fluxo de publicação autorizado, com revisão das migrations e backup; o atualizador em `scripts/local/` atende somente ao banco local especificado nele.

## Onde encontrar informações

Na aplicação, a **Ajuda** (`/ajuda`) reúne artigos e vídeos por funcionalidade; as configurações ficam em `/admin`. No repositório:

| Informação | Documento |
|---|---|
| Ambiente fictício completo, perfis por setor, SMTP local e vídeos | [Guia local](scripts/local/README.md) |
| Navegação fiscal, simulação, conexão com o motor e limites dos endpoints reais | [Fluxo SPED local e modo real](docs/FISCAL-PREVIA-VISUAL.md) |
| Monitoramento, credencial dos bots (chave principal e adicionais), heartbeat, eventos e testes | [Ops Center](docs/OPS-CENTER.md) |
| Lista, Kanban e Agenda por prazo do Tech | [Controle interno do Tech](docs/TECH-CONTROLE-INTERNO.md) |
| Conferência, regras e arquivos do SPED Contábil | [SPED Contábil](docs/CONTABIL-SPED.md) |
| Classificação por grupo e categoria, formulários, SLA, aprovações, visibilidade e IA (do escritório, com alternativa Groq) | [Chamados internos](docs/HELPDESK.md) |
| OAuth, coleta, contagens, permissões e validação do painel | [GitHub — Contribuições](docs/GITHUB-CONTRIBUTIONS.md) |
| Modelo das pastas, empresas do piloto e robô de importação | [Pasta de rede](docs/PASTA-DE-REDE.md) |
| Fluxos de trabalho e automações do Societário | [Índice dos fluxos](docs/fluxos/README.md), [fluxo do setor](docs/fluxos/societario.html), [portais e robôs](docs/fluxos/societario-robos.html) |
| App do portal e publicação Android | [Android TWA](android/README.md), [Play Store](android/play-store/README.md) |
| Ceci no Portal do Cliente e implantação piloto | [Ceci no portal](docs/CECI-NO-PORTAL-PILOTO.md) |
| Estudo de telas compartilhadas entre setores | [Tela em vários setores](docs/TELA-EM-VARIOS-SETORES.md) |
| Contexto inicial e decisões antigas de arquitetura | [Onboarding](docs/ONBOARDING-NATHAN.md) |
| Levantamentos funcionais de BPO e pessoas | [BPO](docs/BPO-MODULO-LEVANTAMENTO.md), [Planilhas e requisitos](docs/PLANILHAS.md) |
| Estudos de integração e evolução da arquitetura | [Chatwoot](docs/CHATWOOT_INTEGRATION_FEASIBILITY.md), [apps como módulos](docs/VIABILIDADE-APPS-COMO-MODULOS.md), [plano do backend fiscal](docs/PLANO-BACKEND-FISCAL-SPED.md) |
| Variáveis, scripts e modelo de dados | [`.env.example`](.env.example), [`package.json`](package.json), [`schema.prisma`](prisma/schema.prisma) |
| Regras para contribuir com auxílio de agentes | [`AGENTS.md`](AGENTS.md), [`CLAUDE.md`](CLAUDE.md) |

Documentos de **plano, proposta, levantamento e status com data** registram o contexto de quando foram escritos. O onboarding e alguns estudos descrevem etapas anteriores do produto; não use seus comandos ou listas antigas como inventário atual. Para implementação e disponibilidade, confira o catálogo, as rotas, o schema, os guias operacionais e a configuração do escritório.

Antes de alterar código Next.js, leia o guia pertinente da versão instalada em **`node_modules/next/dist/docs/`**, conforme `AGENTS.md`. Preserve arquitetura, componentes e alterações locais de outras tarefas. Não versione segredos, dados de clientes, dumps, anexos, logs, builds ou runtimes.

# Connect local, com dados fictícios

O menu lateral oferece uma entrada **SPED**, que abre **Classificação e apuração**,
**SPED gerados** e **Executar** ao passar o mouse ou clicar, inclusive na faixa
recolhida e no celular. Classificação e apuração abre em Classificação; Executar
tem as abas Executar e Histórico. As operações são simuladas e
salvas no banco local. Guia e roteiro: [Fluxo SPED local](../../docs/FISCAL-PREVIA-VISUAL.md).

Um Connect inteiro rodando na máquina, com banco próprio no Docker e só dado
inventado. Existe para gravar os vídeos da ajuda (`scripts/videos/`), que vão para
o YouTube e não podem mostrar cliente de verdade — e serve para qualquer teste que
não deva tocar a produção.

> O `.env` da raiz aponta para a **produção**. Nada aqui o usa: tudo passa pelo
> `com-banco-local.mjs`, que carrega o `.env.localdev` e se recusa a rodar se a
> `DATABASE_URL` não for de `127.0.0.1`/`localhost`.

## Primeira vez

1. Docker Desktop instalado e aberto.
2. Criar o `.env.localdev` na raiz (fora do git — está no `.gitignore` pelo `.env*`),
   com valores **só de teste**, nunca os da produção:

   ```
   LOCAL_MYSQL_ROOT_PASSWORD=<qualquer senha local>
   DATABASE_URL=mysql://root:<a mesma senha>@127.0.0.1:3307/connect41?allowPublicKeyRetrieval=true
   JWT_ACCESS_SECRET=<texto aleatório>
   JWT_REFRESH_SECRET=<outro texto aleatório>
   JWT_ACCESS_TTL=15m
   JWT_REFRESH_TTL=7d
   SECRETS_ENCRYPTION_KEY=<texto aleatório longo>
   CRON_SERVICE_TOKEN=<texto aleatório>
   APP_PUBLIC_URL=http://localhost:3100
   SEED_ADMIN_PASSWORD=<senha do administrador local>
   LOCAL_PORTAL_PASSWORD=<senha do cliente do portal local>
   SPED_API_URL=
   SPED_API_TOKEN=
   ```

   As duas últimas ficam **vazias de propósito**: sem elas no arquivo, o Next leria
   as da produção no `.env`.

3. `npm run build` (o servidor local roda o build, como em produção).

## Recriar o banco

```
node scripts/local/recriar-banco.mjs
```

Sobe o MySQL (`connect41-local`, porta 3307) se ele não existir, apaga e recria o
banco, cria as tabelas pelo schema e carrega:

- o seed (escritório "41 Tech", setores e o administrador `adm6@41bpo.com.br`, que
  no banco local se chama **Camila Duarte**, pessoa fictícia);
- a demonstração antiga do BPO (`scripts/local/demonstracao-transportes.ts` — a da produção, desde 15/10/2026, é a Padaria Pão de Ouro de `scripts/dados-de-demonstracao.ts`): o Grupo Modelo, a
  Transportes Modelo, contas, extrato, pendências, aprovações;
- o preparo dos vídeos (`preparar-ambiente.ts`): setor Controladoria, senha do
  cliente do portal (que se chama **Rafael Nogueira**, fictício), a filial, um
  comunicado, notas fiscais, uma conta a pagar e uma a receber a conferir, os
  módulos que nascem desligados e têm vídeo (DRE, Documentos Fiscais,
  Certificados…), o SMTP apontado para a caixa de e-mail local (abaixo), e tira
  a marca `[demo]` dos textos.
- os modelos de processo do Societário (`scripts/seed-societario.ts`): órgãos, tipos e etapas;
- os dados fictícios das outras telas (`dados-ficticios.ts`): uma equipe de cinco
  pessoas sem senha (Renata, Bruno, Larissa, Paulo e Marina, uma por setor), seis
  empresas, colaboradores com férias, afastamentos, desligamentos e horas extras,
  processos e licenças do Societário, vagas e candidatos, quadros do Kanban,
  transferências, solicitações do portal e reuniões na agenda. Para os vídeos
  da equipe (06/10/2026), também: um processo da Transportes Modelo (o Início do
  portal), as contas que esperam aprovação "lançadas" pela Marina (quem lança
  não aprova), três leads, quatro competências da avaliação de desempenho, a
  permissão de ver salário para o administrador e dois processos com a Camila
  (a Minha área do Societário). Tudo inventado.

Rode antes de cada rodada de gravação: alguns vídeos mudam os dados (aprovam uma
conta, respondem uma pendência), e só o banco recriado garante o mesmo vídeo.

### Por que o banco nasce do schema, e não das migrations

As migrations **não reconstroem o banco do zero**: a
`20260728150734_manual_page_cover` altera `manual_pages`, que nenhuma migration
cria (a tabela entrou na produção antes de as migrations virarem regra). Então o
banco local vem de `prisma migrate diff --from-empty --to-schema` e não de
`migrate deploy`. Nunca `db push`.

Consequência: dado que só existe porque uma migration o inseriu (como o setor
Controladoria) não vem junto. O `preparar-ambiente.ts` repõe o que os vídeos usam.

## Atualizar o banco sem perder os dados

Depois de um pull, pare o servidor com Ctrl+C e rode:

```powershell
node scripts/local/atualizar-banco.mjs --aplicar
npm run build:local
```

O atualizador aceita apenas adições de schema e salva um backup em
`storage/backups` antes de aplicar. Não apaga o banco, não executa seeds e não
altera senhas. Sem `--aplicar`, mostra apenas a comparação. Use somente com o
container `connect41-local` na porta 3307; não é um migrador de produção.

A única exceção revisada é a atualização de `audit_logs`: acrescenta o nome do
ator e permite `userId` nulo, recriando a chave com `ON DELETE SET NULL`.
Ela preserva todos os registros; outras remoções ou alterações continuam bloqueadas.

O comando opcional `build:local` no Windows recusa iniciar enquanto houver um
standalone rodando, evitando que o Next apague arquivos antes de encontrar a
pasta bloqueada. O `build` compartilhado permanece igual em outras máquinas e CI;
nenhuma atualização do banco é executada automaticamente por esses comandos.

## Subir o Connect

### Dados fiscais de teste no banco

Após atualizar o schema local, execute pelo lançador protegido:

```
node scripts/local/com-banco-local.mjs npx tsx scripts/local/preparar-fiscal.ts
```

Prepara os documentos fictícios em `local_fiscal_scenarios`, separados por usuário
e escritório, sem versões ou protocolos iniciais. Repetir o comando preserva as
alterações existentes. As ações fiscais passam pelo servidor com permissões e
controle de revisão; o navegador não grava mais o cenário no localStorage.
Essa simulação aceita somente `connect41` em localhost:3307. Continua sem gerar
arquivos fiscais reais; o motor Python será integrado separadamente.

```
$env:PORT='3100'
node scripts/local/com-banco-local.mjs node .next/standalone/server.js
```

- equipe: http://localhost:3100/login — `adm6@41bpo.com.br` e a `SEED_ADMIN_PASSWORD`;
- portal: http://localhost:3100/portal/login — `cliente.demo@exemplo.invalido` e a
  `LOCAL_PORTAL_PASSWORD`.

Depois de recriar o banco, reinicie o servidor.

### E-mail e avisos no navegador

O SMTP do escritório local aponta para `127.0.0.1:2525`, a caixa de e-mail de
mentira de `caixa-de-email.ts`: ela aceita tudo e joga fora, e nada sai da
máquina. O `scripts/videos/gravar.ts` a abre enquanto grava. Fora da gravação,
com a caixa fechada, o envio só falha — e a tela diz quantos e-mails falharam.

Sem chaves VAPID, o Connect mostra "Indisponível neste ambiente" em
Configurações → Notificações e esconde o bloco de avisos do Início do portal.
Para gravar como na produção, gere chaves **de teste** (nunca as da produção) e
acrescente `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e
`VAPID_SUBJECT=mailto:nao-responda@exemplo.invalido` ao `.env.localdev` — ou
passe as três no terminal, antes do `node scripts/local/com-banco-local.mjs`:

```
node -e "const k=require('web-push').generateVAPIDKeys();console.log(k)"
```

## Perfis de um setor só

A conta do administrador vê tudo, então não serve para conferir se uma tela fecha
para quem não é do setor. Para isso:

```
node scripts/local/com-banco-local.mjs npx tsx scripts/local/perfis-de-teste.ts
```

Cria `bpo.teste@`, `dp.teste@`, `dpcoord.teste@` e `fiscal.teste@exemplo.invalido` (coordenador do
BPO, usuário do DP, coordenador do DP e usuário do Fiscal), com a `LOCAL_PORTAL_PASSWORD`, e uma
colaboradora fictícia para a ficha da pessoa. Rode depois de recriar o banco.

## Conferir a demonstração do BPO da produção (15/10/2026)

A demonstração da apresentação ao BPO (Padaria Pão de Ouro, `scripts/dados-de-demonstracao.ts`)
não entra no banco local de sempre (ele segue com a Transportes Modelo dos vídeos). Para
conferir a de produção num banco local, grave-a e rode a conferência — DRE, saldo e
sugestões da conciliação, Meu dia, Meu time e o motor de avisos, pelas mesmas funções das telas:

```
node scripts/local/com-banco-local.mjs npx tsx scripts/dados-de-demonstracao.ts --usuario <e-mail> --aplicar
node scripts/local/com-banco-local.mjs npx tsx scripts/local/verificar-demonstracao-bpo.ts --usuario <e-mail>
node scripts/local/com-banco-local.mjs npx tsx scripts/dados-de-demonstracao.ts --limpar --aplicar
```

A limpeza tira **todas** as empresas "[demo]" do banco — a Transportes Modelo também. Depois,
`node scripts/local/recriar-banco.mjs` para voltar ao banco dos vídeos.

## Vídeos

Ver o cabeçalho de `scripts/videos/gravar.ts`: grupos `portal` e `equipe`, e
`RASCUNHO=1` para acertar um roteiro novo a um décimo das pausas. A lista do que
foi gravado (título, chave da ajuda e duração) sai em `videos/{grupo}/_lista.json`.

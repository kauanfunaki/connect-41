# Connect local, com dados fictícios

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
- a demonstração do BPO (`scripts/dados-de-demonstracao.ts`): o Grupo Modelo, a
  Transportes Modelo, contas, extrato, pendências, aprovações;
- o preparo dos vídeos (`preparar-ambiente.ts`): setor Controladoria, senha do
  cliente do portal, a filial, um comunicado, notas fiscais, e tira a marca
  `[demo]` dos textos.

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

## Subir o Connect

```
node scripts/local/com-banco-local.mjs npx next start -p 3100
```

- equipe: http://localhost:3100/login — `adm6@41bpo.com.br` e a `SEED_ADMIN_PASSWORD`;
- portal: http://localhost:3100/portal/login — `cliente.demo@exemplo.invalido` e a
  `LOCAL_PORTAL_PASSWORD`.

Depois de recriar o banco, reinicie o servidor.

## Perfis de um setor só

A conta do administrador vê tudo, então não serve para conferir se uma tela fecha
para quem não é do setor. Para isso:

```
node scripts/local/com-banco-local.mjs npx tsx scripts/local/perfis-de-teste.ts
```

Cria `bpo.teste@`, `dp.teste@` e `dpcoord.teste@exemplo.invalido` (coordenador do
BPO, usuário do DP e coordenador do DP), com a `LOCAL_PORTAL_PASSWORD`, e uma
colaboradora fictícia para a ficha da pessoa. Rode depois de recriar o banco.

## Vídeos

Ver o cabeçalho de `scripts/videos/gravar.ts`.

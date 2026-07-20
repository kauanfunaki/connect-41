# Connect 41 — Onboarding para o Nathan (+ Claude dele)

> Este documento existe para o Nathan e o Claude Code dele conseguirem entrar no projeto
> sem depender de contexto que só está na cabeça do Kauan ou nas sessões passadas do
> Claude do Kauan. Leia isto antes de mexer em qualquer coisa.

## 1. O que é o Connect 41

CRM interno **multi-setor** e **multi-tenant** da 41 Tech (41 Contábil), pensado para
eventualmente ser vendido para outros escritórios contábeis. Substitui o fluxo atual de
boca-a-boca/planilhas por uma plataforma única com visibilidade por setor e comunicação
controlada entre setores.

Duas entidades centrais:
- **Empresa** (`Company`) — cliente contratante da 41 Tech.
- **Pessoa** (`Person`) — candidato ou colaborador dessa empresa (`type`: `CANDIDATO` |
  `COLABORADOR`).

11 setores da 41 Tech circulam por essas entidades: Tech, DP/RH, Recrutamento,
Societário, Financeiro, Fiscal, Contábil, BPO, Comercial, Corretora e Gestão/Diretoria.
Cada setor vê o que é dele; ADMIN/SUPER_ADMIN/READONLY veem tudo; setores se comunicam
via **Handoff**.

## 2. Onde está e como rodar

```
Repo:   https://github.com/kauanfunaki/connect-41
Local:  C:\Users\kauan.brasileiro\Documents\1. Apps\connect-41
Deploy: EasyPanel (conta dev41tech), build via Dockerfile (Next standalone)
Prod:   https://useconnect.com.br
Banco:  MySQL/MariaDB único (sem ambiente de homologação separado) em
        vps.41tech.cloud:3330/connect41 — o .env local do Kauan já aponta
        para produção. Cuidado ao rodar comandos de banco.
```

```bash
npm install
npm run dev     # roda prisma generate + next dev
npm run build    # EXATAMENTE o que o Dockerfile roda — use isso pra reproduzir erro de build antes de fazer push
```

Variáveis de ambiente necessárias (`.env`, nunca commitado):
```
DATABASE_URL=mysql://usuario:senha@vps.41tech.cloud:3330/connect41
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
```
Peça essas credenciais pro Kauan — não estão no repo.

**Importante — este projeto usa Next.js 16, que tem breaking changes vs. o que qualquer
LLM aprendeu em treino.** Existe um `AGENTS.md`/`CLAUDE.md` na raiz do repo que já avisa
isso e manda consultar `node_modules/next/dist/docs/` antes de codar. O Claude do Nathan
vai ler esse arquivo automaticamente ao abrir o projeto — não ignore o aviso.

## 3. Stack

Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4 (CSS vars,
tema claro/escuro completo) · Prisma 7 com adapter MariaDB · JWT próprio (não usa
NextAuth) · IBM Plex Sans/Mono.

## 4. Modelo de dados (schema atual, sem nenhuma pendência de migration)

```
Tenant          — workspace (multi-tenant desde o dia 1)
User, UserSector, RefreshToken — auth
Sector          — setores CADASTRÁVEIS pela UI (não é mais hardcoded em código;
                  tabela nova adicionada na Fase C, com auto-seed dos 11 setores
                  originais no primeiro acesso de cada tenant)
Company, CompanyService — empresa cliente + quais setores ela contratou
Person          — candidato/colaborador (CPF, email, telefone, nascimento,
                  currentCompanyId)
Pipeline, PipelineStage, PipelineItem — motor de funil genérico: qualquer setor
                  cria pipeline com estágios configuráveis, aponta pra Company OU
                  Person (relação polimórfica por entityId, sem FK)
Activity        — timeline (nota, mudança de estágio, etc.) — ATENÇÃO: hoje só
                  existe DENTRO de um PipelineItem (pipelineItemId é obrigatório).
                  Não existe timeline genérica solta por pessoa/empresa ainda.
CustomField, CustomValue — campos extras configuráveis por setor + tipo de
                  entidade (texto/número/data/seleção/sim-não/texto longo).
                  Só guarda 1 valor por chave por entidade — não serve para dados
                  repetidos/históricos (tipo férias por ano, lançamentos mensais).
Handoff         — transferência de acompanhamento entre setores (fromSector →
                  toSector), com aceitar/rejeitar
Notification    — notificação simples por usuário
```

Nenhum model de **Documento/Anexo** existe ainda em lugar nenhum do schema — é uma
lacuna conhecida (CV, atestado, certificado etc. vão precisar disso).

## 5. RBAC — como o acesso funciona

5 papéis fixos (`UserRole` enum): `SUPER_ADMIN`, `ADMIN`, `SECTOR_ADMIN`, `SECTOR_USER`,
`READONLY`.

- `SUPER_ADMIN`/`ADMIN` → acesso total, qualquer setor, leitura e escrita.
- `READONLY` → leitura total, nunca escreve (ex.: Diretoria).
- `SECTOR_ADMIN` → CRUD + handoffs, só no(s) próprio(s) setor(es).
- `SECTOR_USER` → leitura + atividades (nota, mover estágio de pipeline) só no(s)
  próprio(s) setor(es). Não cria/edita/exclui Empresa, Pessoa, Pipeline ou solicita
  handoff.

Como Empresa/Pessoa não têm `sectorCode` próprio, o escopo por setor é resolvido
indiretamente:
- **Empresa** → via `CompanyService.sectorCode` (serviços contratados) OU aparecer
  como item num `PipelineItem` de um pipeline daquele setor.
- **Pessoa** → via os pipelines em que ela aparece (`PipelineItem` → `Pipeline.sectorCode`)
  OU via a empresa vinculada (`currentCompany`).

Toda essa lógica está centralizada em:
```
src/lib/auth/context.ts   — getAuthContext(), canWrite, canManageSector, canActOnSector, isFullAccess/isFullWrite
src/lib/auth/scope.ts     — scopedCompanyWhere, scopedPersonWhere, scopedPipelineWhere, scopedHandoffWhere
```
**Regra de ouro:** toda página de lista/detalhe usa esses `scoped*Where` no `where` do
Prisma (retorna 404 em vez de vazar que o registro existe fora do escopo). Toda Server
Action revalida permissão E escopo no servidor — nunca confia só em esconder botão na
UI. Se for mexer em qualquer tela nova, siga esse padrão.

## 6. Convenções de código (já estabelecidas, não reinvente)

- Sem API REST manual: Server Actions (`"use server"`) com `useActionState` no client.
  Handlers de evento (`onClick` etc.) sempre em componente `"use client"` separado —
  Server Components não serializam funções.
- Padrão de arquivo por feature: `src/app/(app)/<recurso>/page.tsx` (lista),
  `[id]/page.tsx` (detalhe), `[id]/editar/page.tsx`, `nova|novo/page.tsx`, e um
  `actions.ts` único por recurso com todas as Server Actions.
- Formulários client em `src/components/<recurso>/<Recurso>Form.tsx`, sempre com
  `useActionState` + estado `{ error: string } | null`.
- **Regra crítica de bundling:** nunca importe, num Client Component, algo de um
  arquivo que também tenha `getPrisma()` — mesmo que a coisa importada seja uma
  constante inofensiva, o bundler tenta empacotar o módulo inteiro (que puxa o driver
  MariaDB, que usa `fs`/`net`/`tls` do Node) e quebra o build do Docker. Isso já
  aconteceu uma vez (ver seção 8). Constantes puras vivem em arquivo próprio
  (`*-constants.ts`), nunca no mesmo arquivo que tem acesso a banco.
- Setores, papéis e status têm sempre um mapa `LABEL` centralizado
  (`src/lib/roles.ts`, `src/lib/sectors.ts`) — não hardcode texto de setor/papel
  espalhado pelas telas.
- Design: **proibido parecer gerado por IA** — sem gradiente, sem pílula colorida
  gritante, sem hero genérico. Base de texto 14px, hairlines de 1px, cantos 6–10px,
  cor por setor como ponto discreto (não bloco). Tokens em `src/app/globals.css`
  (`--c41-*`), tema claro/escuro já 100% funcional via `data-theme` + toggle no topbar.

## 7. Estado atual do projeto (o que já está pronto)

Entregue e em produção:
- Fundação técnica: auth JWT, multi-tenancy, schema do núcleo, deploy EasyPanel.
- CRUD completo de Empresas e Pessoas (com auto-fill de CNPJ via BrasilAPI).
- Motor de Pipeline genérico com kanban drag-and-drop.
- **Fase A** — RBAC enforcement (escopo por setor em tudo).
- **Fase B** — `/admin/usuarios` (CRUD + papel + setor) e `/admin/tenant`.
- **Fase C** — `/handoffs` (solicitar, aceitar, rejeitar entre setores) + **Setores
  dinâmicos** (`/admin/setores`, CRUD, sem exclusão — só desativação).
- **Fase D** — `/admin/campos` (campos customizados por setor + tipo de entidade).
- **Fase E** — Dashboard (`/home`) com contadores reais por escopo + notificações
  (sino no topbar, `/notificacoes`).
- **Fase F** — tema claro/escuro persistido por cookie.

Pendente/aberto:
- Validar com usuários reais os papéis `SECTOR_ADMIN`/`SECTOR_USER`/`READONLY` em
  produção (só foi testado como ADMIN até agora).
- Nenhum campo customizado real foi cadastrado ainda (a engine existe, vazia).
- Tema escuro não foi validado visualmente em todas as telas internas.
- **Fase 3 do plano original** (consolidação setorial) segue bloqueada esperando os
  11 setores devolverem o DOCX de alinhamento assinado.
- **Análise funcional em andamento para Recrutamento/RH/DP** (ver seção 9) —
  **ainda não aprovada para implementação**, é só diagnóstico.
- Projeto 2 (Dashboard analítico/BI) deliberadamente adiado até o CRM ter dados
  reais de uso.

## 8. Incidentes já resolvidos (não repetir)

1. **Bug de bundling client/server:** `SetorForm.tsx` (client) importava uma
   constante de `lib/sectors.ts`, que também tinha `getPrisma()` → build do Docker
   quebrava com "Module not found: fs/net/tls". Resolvido separando constantes puras
   em `lib/sector-constants.ts`. **Sempre reproduza `npm run build` local antes de
   dar push** — é o comando exato que roda no Dockerfile.
2. **500 após deploy de tabela nova:** ao adicionar o model `Sector`, o código foi
   deployado antes da tabela existir em produção → login quebrava com 500. Precisou
   rodar `npx prisma db push` contra o banco de produção depois do deploy.
   **Qualquer schema novo precisa de `prisma db push` em produção — não existe
   ambiente de homologação separado, e isso é sempre uma ação que exige confirmação
   explícita do Kauan antes de rodar** (classificador de auto mode do Claude Code
   bloqueia isso por padrão, e com razão).
3. **Bug de UX:** `/handoffs` não tinha nenhum jeito de criar handoff sem vir de uma
   ficha específica (URL com query string) — corrigido com botão "+ Novo Handoff" +
   seletor de entidade na própria tela.

## 9. Próxima frente: Recrutamento, RH e DP (ainda em análise, não implementada)

O Kauan trouxe um levantamento funcional completo (14 módulos: núcleo de
colaboradores, recrutamento/vagas, processo seletivo, cargos/salários, férias,
folha, horas extras, absenteísmo/afastamentos, benefícios, turnover/desligamento,
escala, treinamentos, desempenho, indicadores). Já foi feita uma análise objetiva
(sem código, sem alteração de arquivo) mapeando o que já é reaproveitável
(Person/Company/Pipeline/CustomField/Handoff) contra o que precisa de model novo
(Cargo, Férias, Folha, Horas Extras, Afastamentos, Benefícios, Escala, Treinamentos,
Desempenho, e um model genérico de Documento/Anexo que hoje não existe em lugar
nenhum).

Decisões ainda em aberto antes de qualquer implementação (perguntar ao Kauan se
o assunto vier à tona):
1. RH e DP continuam um setor só (`dprh`) ou viram dois setores separados?
2. "Vaga" vira um `Pipeline` (reaproveitando o motor) ou uma entidade nova própria?
3. "Cargo" já nasce como entidade de primeira classe com faixa salarial/histórico,
   ou começa simples via Campo Customizado?
4. Dados sensíveis (atestado, dado médico, dado bancário) precisam de permissão
   mais granular do que o RBAC por setor atual?
5. Colaborador pode ter histórico de vínculo com mais de uma empresa ao longo do
   tempo, ou "uma empresa atual" (`currentCompanyId`) resolve por enquanto?
6. Timeline do colaborador continua presa a um Pipeline, ou precisa virar genérica?
7. Folha de Pagamento é só controle/conferência (não motor de cálculo trabalhista)?
8. A página de hub por setor (`/setor/[code]`) — hoje um **link morto** na
   navegação lateral (nunca foi criada) — deve ser feita antes desses módulos?

**Se o Nathan for tocar essa frente: não implemente nada disso sem essas decisões
validadas com o Kauan primeiro** — foi um pedido explícito dele nesta etapa.

## 10. Como trabalhar junto (Kauan + Nathan, Claude + Claude)

- Push direto pra `main` sempre exige confirmação explícita do usuário **na sessão
  atual** — não vale confirmação de sessão anterior, e isso vale pros dois.
- Qualquer schema novo/migration em produção (`prisma db push`) é ação sensível —
  sempre confirmar antes, mesmo que pareça só "adicionar uma tabela".
- Antes de propor uma tela nova, verificar se não dá pra reaproveitar
  Company/Person/Pipeline/CustomField/Handoff — o projeto é desenhado pra isso.
- Rodar sempre `npx tsc --noEmit`, `npx eslint .` e, se mexeu em algo que pode
  afetar bundling client/server, `npm run build` completo antes de commitar.
- Memória do projeto (histórico de decisões, sessões anteriores) vive no Obsidian
  do Kauan, fora deste repo — se o Claude do Nathan precisar de contexto histórico
  que não está aqui, perguntar ao Kauan em vez de assumir.

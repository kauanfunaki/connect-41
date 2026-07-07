# Connect 41 — status e divisão de trabalho (04/07/2026)

> Documento de handoff pro Nathan. Objetivo: trabalharmos em paralelo — eu
> (Kauan) mexendo em design/estrutura geral, o Nathan nos módulos de
> Recrutamento e RH/DP — sem pisar no trabalho um do outro.

---

## O que é o Connect 41

CRM interno da 41 Tech (contabilidade/BPO) pra gerenciar Empresas-cliente,
Pessoas (candidatos/colaboradores), um Kanban de atendimento por setor
(Fiscal, Contábil, DP/RH, Societário, Comercial, Recrutamento etc.) e
transferências entre setores. Visão de longo prazo: comercializar pra outras
empresas de contabilidade (multi-tenant).

**Stack**: Next.js 16 (App Router, atenção — versão com breaking changes vs.
o Next.js "clássico", ver `AGENTS.md` na raiz) + Tailwind CSS v4 + Prisma 7
(MariaDB adapter) + JWT próprio (não é NextAuth).

---

## O que já está pronto e em produção

### Núcleo (Fases A–F, anteriores a este ciclo)
- RBAC (`SUPER_ADMIN`/`ADMIN`/`SECTOR_ADMIN`/`SECTOR_USER`/`READONLY`)
- Setores dinâmicos cadastráveis (`Sector`), Empresas, Pessoas
- Handoffs entre setores (motor — hoje renomeado "Transferências" na UI)
- Campos Customizados por setor/entidade
- Dashboard inicial + Notificações
- Tema claro/escuro (tokens `--c41-*` em `globals.css`)
- Fundação de módulos plugáveis (`TenantModule` + catálogo em código) —
  **ainda vazia, é exatamente o que o Nathan vai preencher** (ver seção
  própria abaixo)

### Fases G–L (deste ciclo, 02–04/07/2026)
- **G** — Pipeline renomeado pra "Kanban" (rota `/kanban`), bug de fuso
  horário corrigido, polimento visual do board
- **H** — Kanban avançado: prazo + badge de atraso, catálogo de Tags por
  setor (reaproveitável entre kanbans do mesmo setor), responsáveis internos
  N:N (`PipelineItemAssignee`), redesenho do detalhe do item (Trello-like)
- **I** — Handoffs → "Transferências" (rota + texto), `/admin/tenant` fora da
  sidebar, destaque de página ativa no menu
- **I.1** — Login split-screen, "X dias na etapa" + timeline de movimentação
  no Kanban
- **J** — Busca global (Empresas+Pessoas+Kanban), foto de perfil (upload
  real), engrenagem de admin → página `/admin` com cards, sidebar/topbar
  reorganizados, widgets novos na Início (prazos próximos, atividade recente)
- **K** — Seleção em massa com barra flutuante em Empresas/Pessoas/Admin→
  Usuários; campo `Person.active` novo
- **L** — Multi-tenant: Filial (`Branch`, só etiqueta organizacional, **não**
  isola dados — decisão explícita), múltiplos workspaces por `SUPER_ADMIN`
  (`UserTenantAccess` + seletor na sidebar), `/admin/workspaces`

Todas essas fases estão **implementadas, verificadas (`tsc`/`eslint`/
`build`) e com deploy confirmado em produção**.

### Mapeamento (não implementado ainda)
- `docs/LEVANTAMENTO-MELHORIAS.md` — melhorias mapeadas mas não construídas:
  Fase J (parte já feita), tabelas/listagens (K, parcialmente feita), e um
  levantamento novo de pontos em **Empresas** (campo de ID externo, data de
  abertura, contatos múltiplos incluindo pessoas da 41, responsável por
  departamento, mostrar regime tributário/tags na listagem) — aguardando
  priorização, ainda não é pra mexer nisso.

---

## O que eu (Kauan) estou fazendo agora — não mexer em paralelo nisso

Estou refazendo **todo o design visual** do app (paleta, tipografia, layout)
via Claude Design — o design atual (azul corporativo `#1A5FA8` + IBM Plex)
está sendo substituído por uma direção nova. Já escolhi uma direção
("Tinta & Cobre", títulos em Space Grotesk, dark-first com toggle claro) e
estou com um prototype das 3 telas-núcleo (Login, Shell/sidebar-topbar,
Kanban) em andamento. Quando isso fechar, vai virar uma leva de mudanças nos
tokens em `src/app/globals.css` e nos componentes de shell/login/kanban.

**Por que isso importa pro Nathan**: qualquer tela nova que ele construir vai
herdar os tokens (`bg-canvas`, `text-fg`, `bg-brand` etc.) — **não hardcode
cor/espaçamento**, use sempre os tokens/classes Tailwind que já existem hoje.
Quando o redesign for implementado, tudo que usa os tokens corretamente
atualiza sozinho; o que tiver cor/tamanho fixo (hex direto, `px` fixo fora da
escala) vai ficar destoante e vai precisar de retrabalho.

---

## O que o Nathan vai construir: módulos de Recrutamento e RH/DP

### A fundação já existe, só está vazia
- `src/lib/module-catalog.ts` — array `MODULE_CATALOG: ModuleDef[]`, hoje
  **vazio** (`[]`). Cada módulo é `{ code, label, sectorCode, description,
  defaultEnabled }`. Um módulo só "existe" de verdade quando a tela dele
  existe — este catálogo é só metadado (não precisa nada no banco pra
  registrar um módulo novo, só editar este arquivo).
- `src/lib/modules.ts` — funções já prontas: `getTenantModuleStates`,
  `getEnabledModuleCodes`, `isModuleEnabled`, `getSectorsWithEnabledModules`,
  `setModuleEnabled`. A ativação/desativação por tenant já funciona
  (`/admin/modulos`, tabela `TenantModule` já existe no banco).
- **O que o Nathan precisa fazer pra registrar os módulos novos**: adicionar
  entradas em `MODULE_CATALOG` (ex.: `{ code: "recrutamento_pipeline",
  sectorCode: "recrutamento", ... }`) e construir as telas reais atrás delas.
  Não precisa mexer no schema pra isso — só ao criar as entidades/dados
  específicos de cada módulo (ver abaixo).

### Motor que já dá pra reaproveitar
- **Kanban genérico** (`Pipeline`/`PipelineStage`/`PipelineItem` +
  Tags/Responsáveis/Prazo/Atividades, tudo pronto) já é setor-agnóstico —
  criar um Kanban novo pro setor de Recrutamento ou DP/RH é só cadastrar via
  `/kanban/novo` apontando pro `sectorCode` certo, sem precisar de código
  novo. Se o módulo de Recrutamento for "essencialmente um Kanban com cara
  própria", talvez nem precise de tela nova nenhuma — só ativar o módulo e
  usar o Kanban que já existe.
- **Campos Customizados** (`CustomField`/`CustomValue`, por setor+entidade)
  já permite adicionar campos específicos em Empresa/Pessoa sem schema novo
  — útil se Recrutamento/RH precisar de campos extras em `Person` (ex:
  "cargo pretendido", "data de admissão") sem migração.
- **RBAC**: helpers em `src/lib/auth/context.ts` (`canWrite`, `canManageSector`,
  `canActOnSector`, `canViewSector`, `isFullAccess`, `isFullWrite`) e escopo
  em `src/lib/auth/scope.ts` — usar os mesmos padrões pra qualquer tela nova,
  não inventar checagem de permissão diferente.
- **Padrão de arquivo**: cada recurso tem seu `actions.ts` (Server Actions,
  `"use server"`) próprio, seguindo exatamente o padrão de `src/app/(app)/
  empresas/actions.ts` ou `kanban/actions.ts` — criar/atualizar/excluir com
  `useActionState` no client, `revalidatePath` + `redirect` no server.
- **CRUD de catálogo admin**: se o módulo precisar de um catálogo próprio
  (tipo Setores/Tags/Filiais), o padrão já está bem estabelecido em
  `src/app/(app)/admin/tags/` — copiar essa estrutura (actions.ts + page.tsx
  + novo/page.tsx + [id]/editar/page.tsx + Form component) é o caminho mais
  rápido.

### Convenções obrigatórias (não são sugestão)
- `npx prisma db push` contra o banco de produção **sempre precisa de
  confirmação explícita** antes de rodar — nunca aplicar migração sem avisar.
- **Nunca fazer commit/push** — cada um comita o próprio trabalho.
- Verificação antes de considerar algo pronto: `npx tsc --noEmit`, `npx
  eslint .`, `npm run build` (mesmo comando do Dockerfile) — os três limpos.
- Ler `node_modules/next/dist/docs/` antes de usar qualquer API do Next —
  essa versão tem breaking changes reais vs. o Next.js "de treino".

---

## Como não pisar um no outro

- Eu mexo em: `globals.css` (tokens), componentes de `src/components/shell/*`,
  `src/components/login/*`, `src/components/kanban/KanbanBoard.tsx` (visual),
  e o que mais o redesign pedir depois que o prototype fechar.
- Nathan mexe em: `module-catalog.ts` (só adicionar entradas), telas novas
  dos módulos de Recrutamento/RH-DP (arquivos novos, não deveria conflitar
  com o que eu tocar).
- Ponto de atenção: se o Nathan criar componentes visuais novos (não
  reaproveitando os já existentes), usar os tokens/classes atuais mesmo
  sabendo que vão ser trocados — não inventar paleta paralela.
- Se surgir dúvida sobre alguma tela que os dois achem que precisa mudar
  (ex: Nathan mexe no Kanban por causa de Recrutamento, e eu também vou
  mexer no Kanban pelo redesign) — avisar um ao outro antes, pra não
  sobrescrever trabalho.

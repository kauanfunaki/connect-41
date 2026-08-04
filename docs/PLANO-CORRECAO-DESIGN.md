# Plano de Correção de Design — Connect 41

> Base: [LEVANTAMENTO-DESIGN-2026-07-30.md](./LEVANTAMENTO-DESIGN-2026-07-30.md)
> · 7 etapas · nenhuma toca schema, Server Action ou regra de negócio.

---

## Princípio que ordena o plano

**Consertar o sistema antes de aplicar o sistema.** Hoje o token de corpo diz
15px e o app inteiro usa 13px. Se começarmos substituindo os 1.605 `text-[Npx]`
pelos tokens atuais, a aparência de todas as telas muda de uma vez — e a
mudança seria *errada*, porque o valor do token é que está fora de sincronia
com a prática, não o contrário.

Por isso: **Etapas 1–3 mexem em poucos arquivos e destravam tudo. Etapas 4–7
são as campanhas de volume.** Fazer na ordem inversa gera retrabalho garantido.

---

## Etapa 1 — Escala tipográfica ✅ EXECUTADA (31/07/2026)

**Arquivos:** `src/app/globals.css` (só ele).

### Correção de premissa feita durante a execução

O plano original dizia "o token mente: `--fs-body` é 15px mas o corpo real é
13px" e propunha baixar o token para 13px. **Isso estava errado.** Antes de
editar, os 45 call-sites de `--fs-body` foram lidos: são o *conteúdo de
leitura* do app — corpo das tabelas de Empresas/Pessoas/Usuários, títulos de
item na Home, mensagem de transferência, feed de atividade, descrição de
tarefa, título de EmptyState. Estão corretos em 15px, apenas aplicados em
poucos lugares.

Os ~700 `text-[13px]` são outra coisa: label, metadado, linha densa, chrome.

Ou seja: **o app tem dois níveis tipográficos que nunca foram nomeados.** Baixar
`--fs-body` para 13px teria encolhido justamente as tabelas que o levantamento
apontou como modelo a copiar — consistência por nivelamento para baixo. Além
disso `body { font-size: var(--fs-body) }`, então a mudança atingiria todo texto
herdado, não só os 45 sites.

**Decisão (confirmada com o usuário):** preservar 15px como nível de conteúdo e
criar `--fs-ui: 13px` para o nível denso que não tinha token.

### O que foi feito

- **9 primitivos** (`--fs-1` … `--fs-9`): 11 · 12 · 13 · 14 · 15 · 16 · 18 · 22 · 30.
- **17 papéis** reancorados nos primitivos, com a separação conteúdo × UI densa
  documentada em comentário no próprio arquivo.
- **3 papéis novos:** `--fs-ui` (13px, nível denso), `--fs-micro` (11px, header
  de tabela e badge pequeno), `--fs-title` (22px, destino dos 22–26px avulsos).
- **Regra de arredondamento** documentada no CSS, fechando os 23 tamanhos em 9:
  `8/9/10/10.5/11/11.5 → 11` · `12/12.5 → 12` · `13/13.5 → 13` · `14/14.5 → 14` ·
  `15 → 15` · `16/17 → 16` · `18/20 → 18` · `22/23/24/26 → 22` · `28/30/32 → 30`.
- **`--fs-body` não foi renomeado** para `--fs-content`: renomear obrigaria a
  tocar 45 call-sites sem servir ao objetivo.

### Mudança visual

Praticamente nula, por construção. Só dois papéis trocaram de valor:

| Papel | Antes | Depois | Call-sites afetados |
|---|---|---|---|
| `--fs-badge` | 12.5px | 12px | **1** |
| `--fs-search` | 15px | 14px | **0** |

Todos os demais mantiveram o valor. `--fs-body` segue em 15px.

**Verificação:** `tsc --noEmit` limpo · `eslint src --max-warnings 0` limpo ·
`vitest run` 18 arquivos / 125 testes passando · `npm run build` completo.
Conferência visual pendente com o usuário.

---

## Etapa 2 — Escala de raio + documentação ✅ EXECUTADA (31/07/2026)

**Arquivos:** 94 arquivos (`globals.css`, `ds-bundle/README.md`, 92 `.tsx`).

### Correção de escopo feita durante a execução

O plano dizia "4 componentes usam `rounded-2xl`" e propunha diferenciar
`--radius-lg` para 14px. A medição real mostrou um problema maior e diferente:

| Classe | Valor renderizado | Call-sites |
|---|---|---|
| `rounded-lg` | `--radius-lg` = **16px** | 240 |
| `rounded-xl` | `--radius-xl` = **16px** | 26 |
| `rounded-2xl` | default do Tailwind = **16px** | 82 |
| `rounded-sm` | `--radius-sm` = 6px | **0** |

**Três nomes de classe para um único valor, em 348 call-sites.** A escala real
do app tem dois valores (10px e 16px); o resto era ruído de nomenclatura.

Isso inverteu a decisão do item 1. Baixar `lg` para 14px teria *criado* uma
distinção entre 240 e 108 call-sites que hoje são visualmente idênticos — uma
diferença que ninguém desenhou e que a análise estática não consegue atribuir
("esse é `lg` porque devia ser menor" vs. "alguém digitou `lg`"). O certo é o
oposto: **unificar os nomes e preservar os valores.**

### O que foi feito

1. `rounded-2xl` (82) → `rounded-lg` — mesmo 16px, zero mudança visual
2. `rounded-xl` (26) → `rounded-lg` — mesmo 16px, zero mudança visual
3. `rounded-[10px]` (34) → `rounded-md` — mesmo 10px, zero mudança visual
4. `rounded-[5px]` (1, checkbox do Checklist) → `rounded-sm` — 5px → 6px, +1px
   numa caixa de 18px; revive o token `sm`, que estava com zero usos
5. `--radius-xl` **removido** do `@theme` (ficou sem consumidores). Escala final
   de 3 degraus honestos, documentada em comentário no CSS:
   `sm 6px` chip/checkbox · `md 10px` input/botão · `lg 16px` card/modal/painel
6. `ds-bundle/README.md`: tabela de raios corrigida (documentava `4/6/8/12px`)
   e seção de tipografia reescrita com os dois níveis (`--fs-body` 15px
   conteúdo × `--fs-ui` 13px UI densa) e a escala primitiva de 9 degraus da
   Etapa 1. O snippet de exemplo passou a usar tokens em vez de px cravado.

**Resultado:** `rounded-md` 406 · `rounded-lg` 348 · `rounded-full` 129 ·
`rounded-sm` 1 · **zero** raios arbitrários.

### Mudança visual

Um pixel, num único elemento (o checkbox do Checklist do Kanban, 5→6px). Todo
o resto é renomeação com valor idêntico.

**Verificação:** `tsc` limpo · `eslint --max-warnings 0` limpo · `vitest`
125 testes · `npm run build` compilado, 78 páginas estáticas geradas.

### Não feito

- **Recompilar `ds-bundle/_ds_bundle.css`** (marcador `_ds_needs_recompile`
  segue pendente). É artefato gerado pela `design-sync-cli`, que não está
  disponível como ferramenta nesta sessão — o `DesignSync` publica num projeto
  claude.ai/design, não recompila o bundle local. Precisa rodar o CLI à mão.
- 5 usos de `rounded-r`/`rounded-t` (direcionais sem tamanho) caem no default
  do Tailwind, fora da escala. Pré-existentes e visualmente irrelevantes;
  ficam para a Etapa 7.

---

## Etapa 3 — Acessibilidade ✅ EXECUTADA (31/07/2026)

### 3a — Semântica de diálogo ✅ (8 componentes, não 2)

Criado `src/components/ui/useDialog.ts`: fecha no ESC, prende o Tab dentro do
painel, move o foco pra dentro ao abrir, devolve o foco ao gatilho ao fechar e
trava o scroll do `<body>`.

O plano previa 2 arquivos (`Modal`, `SlideOver`). A busca por overlays
(`fixed inset-0` + `bg-black/`) achou **7 diálogos**, cinco deles feitos à mão
fora da biblioteca. Todos receberam `role`/`aria-modal`/`tabIndex={-1}`/
`aria-labelledby` e o hook:

| Componente | Antes | Depois |
|---|---|---|
| `ui/Modal` | só ESC + clique-fora | completo |
| `ui/SlideOver` | só ESC | completo |
| `ui/ConfirmDialog` | `alertdialog`, foco inicial, ESC | + trap, scroll lock, retorno de foco |
| `agenda/CreateMeetingDialog` | `dialog`, ESC | + trap, scroll lock, retorno de foco |
| `agenda/EditMeetingDialog` | `dialog`, ESC | idem |
| `kanban/KanbanItemModal` | só ESC, sem `role` | completo |
| `shared/ImageCropModal` | nada | completo |
| `shell/MeetingAlertOverlay` | `alertdialog` | + trap, scroll lock |

Três detalhes de comportamento preservados de propósito:

- **ESC não fecha durante ação em voo** (`ConfirmDialog`, os dois de reunião,
  `ImageCropModal`) — a pessoa perderia o retorno de algo já disparado no
  servidor.
- **`MeetingAlertOverlay` não fecha no ESC** — exige ciência explícita no
  botão. Entrou no hook só pelo trap/scroll lock.
- **`ConfirmDialog` foca o botão de confirmar**, não o primeiro controle
  (que seria "Cancelar"): num diálogo de confirmação a ação esperada é o Enter.

O `onClose` fica numa ref dentro do hook, fora das dependências do efeito —
senão qualquer consumidor com handler inline (ou que troca de handler conforme
o estado, como o `ConfirmDialog` quando `pending` muda) remontaria o efeito,
reabrindo o scroll e roubando o foco de onde a pessoa estava.

Corrigido de quebra: `ConfirmDialog`, `CreateMeetingDialog`, `EditMeetingDialog`
e `MeetingAlertOverlay` usavam `id` **fixo** no título (`"confirm-title"`,
`"meeting-alert-title"`…). Dois na mesma tela gerariam `id` duplicado e
`aria-labelledby` apontando pro lugar errado. Agora usam `useId()`.

### 3b — Rótulo de botão ✅

**O levantamento errou a métrica aqui.** Ele comparou 195 `title=` contra 66
`aria-label` *no app inteiro* e concluiu que a maioria dos 331 botões estava sem
nome acessível. Comparar totais de elementos diferentes não mede nada: a maior
parte daqueles `title=` está em `div`/`span`/`td`, não em botão.

Medido de verdade, com um scanner que casa `<button>` respeitando aninhamento e
chaves:

| Situação | Botões |
|---|---|
| Só-ícone, sem nome acessível nenhum | **5** |
| Com `title=` e sem `aria-label` | **20** |
| **Total corrigido** | **25** (de 331) |

Os 5 sem nome ganharam `aria-label` descritivo (`"Desvincular tarefa"`,
`"Cancelar busca"`, `"Fechar"`, `"Mover estágio para cima"`, e um par
`aria-label`/`aria-expanded` dinâmico no colapsar/expandir de lista). Os 20 com
`title` tiveram o valor espelhado em `aria-label`.

### 3c — `<img>` → `next/image` ❌ NÃO FEITO (premissa errada)

O plano justificava a migração por "risco de `alt` ausente". **Não há risco:
os 15 `<img>` têm `alt`.** Verificado um a um. Além disso o repositório tem 13
`eslint-disable @next/next/no-img-element` — a escolha por `<img>` cru foi
deliberada, não descuido.

Sem ganho de a11y, sobra o ganho de performance — que é outra etapa e não é
trivial aqui:

- **2 são impossíveis**: as do `ConnectLoadingScreen` estão dentro de uma
  *string* de HTML (tela pré-hidratação, usa `class=`, não `className=`).
- **6 são SVG de marca** — `next/image` não otimiza SVG.
- **As 7 restantes são URLs dinâmicas** (logo de tenant, capa de manual, anexo,
  avatar) sem dimensão intrínseca conhecida: exigiriam `fill` + pai posicionado,
  e `remotePatterns` no `next.config.ts`. Hoje a CSP já limita imagens a
  `img-src 'self' data: blob:`.

**Recomendação:** tirar da Etapa 3 (acessibilidade) e avaliar na Etapa 7 como
item de performance, se valer a pena.

**Verificação:** `tsc` limpo · `eslint --max-warnings 0` limpo · `vitest` 125
testes · `build` compilado. **Falta conferir com teclado**: Tab não deve sair
do diálogo, ESC fecha (menos nos casos acima), foco volta ao gatilho.

---

## Etapa 4 — Componentes órfãos ✅ EXECUTADA (31/07/2026)

A regra "se o encaixe não for bom, o componente é que muda" foi acionada nos
**três** casos. Nenhum dos órfãos estava sem consumidor por desconhecimento —
cada um tinha um motivo estrutural diferente.

### `IconButton` — servia exatamente um lugar ✅

Estava fixo em 38×38 com moldura obrigatória, e o comentário dele pregava
"nunca ícone solto sem fundo/borda própria". A medição contradisse as duas
coisas:

| | Botões só-ícone |
|---|---|
| Com moldura (o que o componente fazia) | 24 |
| **Sem moldura** (ícone discreto, aparece no hover) | **33** |

E os com moldura vão de `w-4` (16px) a `w-9` (36px) mais o 38px. O componente
cabia num único call-site: o `NotificationBell`, de onde tinha sido extraído.

Ganhou `size` (`sm` 28 · `md` 32 · `lg` 38 — o `md` casa com `<Button size="sm">`)
e `variant` (`framed` para controle permanente de topbar, `ghost` para ação
secundária dentro de conteúdo — que é o padrão dominante do app e agora é o
default). Adotado em `NotificationBell` (framed/lg), `Modal`, `SlideOver` e
`DeleteTaskButton` (ghost/md).

**Não** forcei os outros ~50 botões-ícone: eles somam 8 tamanhos e 2
tratamentos visuais diferentes, e uniformizá-los é decisão de design, não
refatoração — fica para uma passada dedicada.

### `MetricCard` — não estava morto, estava superado ✅

A Home tinha um `StatCard` **local** que era superconjunto dele: mesmo layout,
mas com ícone e sublinha de apoio, e já em uso 4×. O da biblioteca ficou parado
enquanto a versão real evoluía dentro de `home/page.tsx`.

Consolidados num só, no slot da biblioteca: `icon`, `sub` e `href` opcionais,
cobrindo tanto o card da Home quanto o caso simples. As 42 linhas duplicadas
saíram da Home, que agora importa `ui/MetricCard`. Fica disponível para os
dashboards de setor/RH.

### `FormShell` — tinha um defeito de contrato, foi removido ✅

Correção da correção: no plano eu disse que o valor dele era a "barra de ações
sticky no rodapé". Lendo com atenção, **essa é justamente a parte que não
funciona**. O `actions` é renderizado como irmão de `children`, fora dele:

```tsx
<div className="bg-surface …">
  <div>{children}</div>          {/* aqui entra o <form> */}
  {actions && <div className="sticky …">{actions}</div>}   {/* fora do form */}
</div>
```

Um `<button type="submit">` em `actions` fica **fora do `<form>`** — e os 60
formulários do app são `<form action={serverAction}>`. A prop é inutilizável
como está; precisaria de `form="id"` ou de o próprio FormShell renderizar o
`<form>`.

O que ele resolve de verdade é o **casco**: o wrapper
`bg-surface border border-border rounded-lg p-6` está duplicado à mão em ~10
páginas de novo/editar. Adotado nesse papel como piloto em `cargos/novo` e
`cargos/[cargoId]/editar`, com o `FormFooter` seguindo dentro do `<form>`, onde
sempre esteve.

**Decidido (2026-08-04):** componente removido. Na releitura, as três props
(`title`, `subtitle`, `actions`) estavam sem nenhum consumidor — as duas páginas
piloto usavam `<FormShell>` pelado, o que é literalmente
`<Card className="px-6 py-5">`. Consertar o `actions` exigiria FormShell
renderizar o `<form>` e `CargoForm` devolver `pending`/`state` pra fora, um
refactor sem demanda. Ficou `Card` + `FormFooter` (que já rodava dentro do
`<form>`, onde sempre esteve), e `src/components/ui/FormShell.tsx` foi apagado.

Efeito colateral bom: some a colisão de nome com o `FormShell` **local** de
`transferencias/novo/page.tsx`, que é outro componente (`backHref`/`backLabel`)
e continua onde está.

**Verificação:** `tsc` limpo · `eslint --max-warnings 0` limpo · `vitest` 125
testes · `build` compilado.

**Mudança visual real** (primeira etapa com isso): os botões de fechar de
`Modal`/`SlideOver` e o menu do `DeleteTaskButton` passaram de `rounded-lg`
(16px) para `rounded-md` (10px) — 16px num quadrado de 32px era quase pílula,
e 10px é a convenção de botão-ícone do app. O card da Home ficou com o mesmo
padding de antes (`px-4 py-3.5`, o do `StatCard` vivo).

---

## Etapa 5 — `PageHeader` ✅ EXECUTADA (31/07/2026)

**Resultado: 119 das 141 páginas usam `PageHeader`** (eram 18). Restam 5 `<h1>`
crus, todos deliberados (ver abaixo).

### A decisão de tamanho

A medição contradisse o plano, que dizia "101 páginas, cada uma com seu tamanho".
Não havia dispersão — havia **dois grupos**:

| Tamanho do `<h1>` | Páginas |
|---|---|
| `text-[16px]` | **85** |
| `--fs-display` (30px) | 17 |
| 18 / 20 / 22px | 8 |

Ou seja: **Empresas rodava títulos a 30px e todo o resto a 16px.** Não era
inconsistência dentro de módulo — era entre módulos, herdada da auditoria de
20/07, que converteu só Empresas e classificou 16px como bug ("peso visual de
título de card, não de página").

Adotar `PageHeader` como estava dobrava o título em 85 telas. **Confirmado com
o usuário antes de aplicar:** seguir a direção de 20/07, 30px em tudo — o
tamanho já está em produção na Home e em Empresas, e com corpo a 13px um
título de 16px praticamente não cria hierarquia.

### Mudanças na API do `PageHeader`

Duas ampliações foram necessárias, ambas descobertas pelo compilador:

- **`subtitle: string` → `React.ReactNode`** — a maioria dos subtítulos
  interpola contagem e pluralização (`{total} {total === 1 ? "ação" : "ações"}
  registradas neste workspace`), que não é string.
- **`title: string` → `React.ReactNode`** — em `testes/[id]` e
  `vagas/[id]/candidaturas/[id]` o título é o nome da pessoa dentro de um
  `<Link>` clicável.

### As 5 páginas que ficaram de fora (de propósito)

`carreiras/[slug]`, `carreiras/[slug]/[vagaId]`, `admissao/[token]`,
`d/[token]`, `teste/[token]` — todas **públicas**, fora do `(app)` e fora do
shell autenticado. Têm design próprio (títulos a 22px, centralizados) e não
devem herdar o cabeçalho interno do produto.

### Método

Transformação por script em 3 formas de cabeçalho (wrapper flex com ação ·
wrapper simples · `<h1>` solto), em 4 passadas, na ordem do mapa de calor:
`admin` (28 arquivos) → `kanban`+`pessoas` (14) → resto (37) → passada final
permissiva para as variantes multi-linha (11).

**Verificação:** `tsc` limpo · `eslint --max-warnings 0` limpo · `vitest` 125
testes · `build` compilado.

**Dois reparos manuais** que o `tsc` pegou: 3 títulos com `<Link>` (resolvidos
alargando `title`) e o cabeçalho da Home, onde o `action` tinha um `<div>`
aninhado e o regex fechou no lugar errado.

**Efeito visual: grande e intencional.** 85 páginas com título de 16→30px, mais
o espaçamento do bloco padronizado em `mb-7`. É a etapa que mais muda a
aparência do app — vale conferir `/admin`, `/kanban` e `/pessoas` lado a lado
com `/empresas`, que já era assim.

---

## Etapa 6 — `Button` — EM ANDAMENTO (iniciada 31/07/2026)

O plano previa "331 botões, 168 arquivos, começar por módulo (kanban →
admin → pessoas)". A checagem prévia que o próprio plano mandou fazer —
"conferir se as 4 variantes cobrem os casos reais" — revelou um problema mais
sério do que "faltam variantes": **duas das quatro variantes existentes
estavam descrevendo o botão errado.** Isso mudou o método por completo: não dá
para migrar por módulo até o componente estar calibrado, senão cada módulo
herdaria o mesmo defeito.

### Achado 1 — `Button.secondary` era o inverso do "Cancelar" real

Medição de 327 `<button>` cravados no app (fora de `ui/Button.tsx`):

- Só **89** têm `className` estática que casa uma variante inteira — o resto é
  botão com estado (ativo/selecionado/pendente), que não é conversão mecânica,
  é decisão de design por botão.
- Desses, o "secondary" declarado (`bg-surface-hover … hover:bg-surface`, fundo
  cinza permanente) **não bate com nenhum "Cancelar" real do app.** O
  `FormFooter`, o `ConfirmDialog` e a maioria dos formulários usam
  `border border-border-strong text-fg hover:bg-surface-hover` — sem fundo em
  repouso, ganha fundo só no hover. É o oposto do que a variante fazia.

### Achado 2 — `Button.danger` tinha 3 linguagens visuais concorrentes no app

- A do componente: fundo+borda sólidos, vira vermelho cheio no hover.
- Uma "outline" (`border-danger/30`, sem fundo, tinge levemente no hover) — que
  por acaso é **exatamente** o estilo de `ui/DeleteButton.tsx`, componente da
  biblioteca com 10 consumidores.
- A do `ConfirmDialog` (fundo `bg-danger` sólido + texto branco).

Nenhuma das três batia com as outras duas. **Confirmado com o usuário**: seguir
o mesmo método das Etapas 1/2 — o componente se calibra pela convenção já
estabelecida, não o contrário. `danger` foi decidido por mim, sem nova
pergunta, aplicando a mesma regra que o usuário já tinha validado: a variante
com base real na biblioteca (`DeleteButton`) venceu sobre a variante sem
nenhum consumidor prévio.

### Achado 3 — o tamanho `md` também estava calibrado errado

`h-9` no app real é dominantemente `px-4 text-[13px]` (69 de ~75 ocorrências
estáticas medidas). `Button` declarava `px-[18px] text-[length:var(--fs-button)]`
(18px / 15px) — um tamanho que **nunca foi observado em uso**, porque só 9
arquivos usavam o componente antes desta sessão.

### `Button.tsx` recalibrado

```tsx
primary:   bg-brand text-on-brand hover:bg-brand-hover        (sem mudança)
secondary: border border-border-strong text-fg hover:bg-surface-hover
ghost:     bg-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg (sem mudança)
danger:    border border-danger/30 text-danger hover:bg-danger/8

xs: h-7 px-2.5 text-[length:var(--fs-ui)]
sm: h-8 px-3   text-[length:var(--fs-ui)]
md: h-9 px-4   text-[length:var(--fs-ui)]   (era px-[18px] + --fs-button)
```

Os 5 consumidores pré-existentes de `variant="secondary"` (botões
"Voltar"/"Salvar rascunho" em `EmpresaForm`/`PessoaForm`) mudam de aparência —
de pílula cinza pra outline. É a direção correta pela decisão do usuário:
são exatamente os botões que deveriam ter sido assim desde o início. Nenhum
consumidor de `danger` existia ainda.

### `href` — o buraco que o plano já esperava

`Button` agora aceita `href: string` e renderiza `<Link>` com a mesma
aparência, via union type discriminada (`ButtonProps | LinkProps`) — sem isso,
os ~85 `<Link>` estilizados como botão continuariam fora do alcance da
biblioteca. Tipo construído com `Omit<T, keyof CommonProps>` pra evitar colidir
`className`/`variant`/`size` no spread de atributos nativos.

### Conversão mecânica aplicada nesta rodada

Só os call-sites com `className` **estática** casando variante + tamanho +
`text-[13px]` inteiros — critério propositalmente restritivo, porque só nesse
caso a troca é garantidamente zero-mudança-visual:

| | Convertidos |
|---|---|
| `<button>` → `<Button>` | 46, em 43 arquivos |
| `<Link>` → `<Button href>` | 35, em 24 arquivos |
| **Total** | **81 em 62 arquivos** |

**Verificação:** `tsc` limpo · `eslint --max-warnings 0` limpo · `vitest` 125
testes · `build` compilado (78 páginas).

### Um bug do próprio script, pego e corrigido na hora

O primeiro script de conversão calculava o fim de `</button>` com um regex que
parava antes do `>` de fechamento (`\b` casa depois de "button", não depois de
">"), deixando um `>` órfão em todo call-site convertido — 43 arquivos
quebrados ao mesmo tempo, todos com o mesmo sintoma (`</Button>>`). Pego pelo
`tsc` antes de qualquer verificação de mais alto nível. Como nada estava
commitado (confirmado via `git status` antes de tocar em qualquer arquivo),
corrigi com uma substituição de texto simples nos 43 arquivos, sem precisar de
`git checkout`. O script do `<Link>`, escrito depois com o fechamento de tag
corrigido, converteu os 35 call-sites de primeira, sem erro.

### O que ainda falta (deliberadamente fora desta rodada)

Dos 327 `<button>` originais, **238 não foram tocados** — são majoritariamente
botões com estado (chip de tag selecionável, toggle ativo/inativo, linha de
tabela em edição), que não têm uma variante estática única: a aparência muda
conforme uma condição do React, não conforme uma classe fixa. Migrar esses é
trabalho de **decisão de design por botão**, não campanha mecânica — cada um
precisa ser lido e ou (a) expresso como `<Button>` com props condicionais
(`variant={ativo ? "primary" : "ghost"}`), ou (b) reconhecido como um controle
que não é um "botão genérico" e não deve virar `Button` de jeito nenhum (ex.:
chip de filtro, célula de tabela clicável).

Recomendação: próxima sessão retoma por módulo como o plano original previa
(`kanban` primeiro, maior massa), mas módulo a módulo revisando cada botão de
estado — não há mais atalho mecânico depois que a fatia estática acabou.

---

## Etapa 7 — Card, estados de tela e responsividade — ✅ EXECUTADA (31/07/2026)

Padrão que se repetiu nesta etapa mais do que em qualquer outra: **quase todo
item do plano original, medido de perto, era menor ou diferente do que o
grep bruto do levantamento sugeria.** Nenhum dos 5 itens saiu do jeito que foi
proposto.

### `Card` — 87 convertidos, com um incidente no meio do caminho

`Card.tsx` ganhou repasse de atributos nativos (`...rest`) — sem isso, os 16
dos 224 candidatos que tinham `onClick`/`role`/`style` perderiam comportamento
silenciosamente na conversão. Os 5 painéis de diálogo (`Modal`, `SlideOver`,
`ConfirmDialog`, `ImageCropModal`, `MeetingAlertOverlay`) ficaram **de fora**
de propósito: precisam de `ref` pro focus trap da Etapa 3, e isso pediria
`forwardRef` num componente usado em 200+ lugares só para 5 casos.

**Incidente:** o primeiro script de conversão tratava todo `<div>` aninhado
como abertura, mesmo quando era autofechado (`<div ... />`). Isso desbalanceou
a contagem de profundidade e, por causa de índices de edição sobrepostos
aplicados contra o texto original, **truncou o fim de pelo menos um arquivo**
de verdade (não só quebrou sintaxe — apagou conteúdo). Só 3 dos 131 arquivos
tocados deram erro de `tsc`, mas os outros ~127 *pareciam* válidos sem estarem
necessariamente corretos — o bug não garante erro de sintaxe.

**Ação:** parei, expliquei o achado e pedi autorização antes de reverter (é
uma operação destrutiva, e o classificador de auto-mode bloqueou o primeiro
`git checkout` até eu confirmar com o usuário). Confirmado que os 131 arquivos
sujos eram só desta sessão — nada do usuário em risco — revertido por
completo com `git checkout -- .`, o `Card.tsx` bom reaplicado, e a conversão
refeita com um método muito mais restrito: **só divs sem nenhum `<div>`
aninhado dentro**, que elimina de vez essa classe de bug (a busca do fechamento
vira "primeiro `</div>` depois da abertura", sem precisar contar profundidade).

**Resultado da versão segura:** 87 conversões em 73 arquivos (vs. 224
candidatos totais — os 137 com `<div>` aninhado ficam de fora, coerente com o
método restrito). `tsc`/`eslint --max-warnings 0`/`vitest`/`build` limpos.

### `error.tsx` — a "lacuna" não existia do jeito que o levantamento descreveu

O levantamento dizia "2 `error.tsx` para 141 páginas — falha em qualquer outra
rota sobe até o boundary raiz". **Isso ignorava como error boundary do Next.js
funciona:** `(app)/error.tsx` já cobre por herança as ~30 rotas internas do
produto (admin, kanban, pessoas, empresas…) — não é preciso um arquivo por
rota. `home/error.tsx` é só uma sobrescrita específica.

**O gap real, achado ao verificar:** as **9 páginas públicas** fora do grupo
`(app)` — `admissao/[token]`, `carreiras/[slug]` (+ `[vagaId]` aninhada),
`d/[token]`, `teste/[token]`, e as 4 de `login/` — não tinham *nenhum* error
boundary. São vistas por candidatos e clientes externos, sem sidebar pra "os
outros módulos continuam acessíveis". Criados **5 arquivos** (o aninhamento do
Next cobre `carreiras/[slug]` + `[vagaId]` com um só, e `login/` cobre as 4
páginas de login com um só), no mesmo layout centralizado que essas rotas já
usam pro estado de link inválido/expirado.

### `loading.tsx` — 9 rotas sem, nenhuma delas é lista

Verificado se as 9 rotas de 1º nível sem `loading.tsx` próprio
(`assinatura`, `avaliacao-atendimentos`, `bpo-financeiro`, `bpo-manual`,
`bpo-senhas`, `configuracoes`, `conversas`, `setor`, `testes`) eram
listas simples (que `ListPageSkeleton` já cobre de pronto). **Nenhuma é** —
são dashboard de card, workspace de pastas, formulário de configuração, chat.
Aplicar `ListPageSkeleton` às cegas produziria um flash de formato errado no
carregamento, pior que a ausência de skeleton em alguns casos. **Não feito** —
fica para uma passada dedicada, desenhando o esqueleto certo por rota, mesmo
tratamento dado aos botões de estado da Etapa 6.

### `grid-cols-*` sem breakpoint — o "148" media a coisa errada

O levantamento contou 148 grid-cols sem breakpoint contra 129 com. Medindo por
classe real (não por substring), a contagem "148" incluía `grid-cols-1` — a
base legítima de todo grid responsivo (`grid-cols-1 sm:grid-cols-2`), que
está funcionando exatamente como deveria. **O número real de grids sem
nenhuma variante responsiva na mesma classe é 5**, não 148. Verificados um a
um:

- `MiniCalendar`/`MonthGrid` (`grid-cols-7`, 3 ocorrências): calendário —
  7 colunas é estrutural (dias da semana), não existe "menos colunas" que
  faça sentido; a resposta a telas estreitas é encolher célula, não recolher
  coluna.
- `ManualWorkspace` (`grid-cols-6`): seletor de emoji dentro de um popover de
  `w-60` (240px) fixo — 6 ícones de 32px cabem sempre, independente da tela.
- `TemaSelector` (`grid-cols-2`): seletor claro/escuro com `max-w-sm` — 2
  colunas dentro de um bloco já limitado em largura.

**Nenhum dos 5 é bug.** Fechado sem alterar código — só corrigindo a leitura
no levantamento.

### Texto abaixo de 11px — a mesma lição do `grid-cols`, em miniatura

Levantamento apontava "38 arquivos com texto <11px, ruim pra leitura".
Medido por contexto: a maioria (8px/9px, e 14 dos 44 casos de 10/10.5px) está
dentro de **badges/avatares de contêiner fixo** (círculo de 16–20px com
iniciais, selo de extensão de arquivo) — aumentar o texto ali faria estourar
o contêiner, não ajudar a leitura. Só os **30 casos genuínos** (texto corrido
solto — timestamp, meta, label — sem nenhuma restrição de espaço) foram
arredondados para `--fs-micro` (11px, o piso da Etapa 1). O caso de 16px com
duas iniciais (`ActivityFeed.tsx`) foi identificado e deixado de propósito.

**Verificação:** `tsc`/`eslint --max-warnings 0`/`vitest` (125)/`build`
limpos em cada sub-etapa.

---

## Sequenciamento

```
1 ──▶ 2 ──▶ 3 ──▶ 4 ──▶ 5 ──▶ 6
                    └──────────┴──▶ 7 (pode correr em paralelo)
```

| Etapa | Arquivos | Risco | Tamanho | Trava |
|---|---|---|---|---|
| 1 · Escala tipográfica ✅ | 1 | baixo | pequena | **destravou 5, 6, 7** |
| 2 · Raios + docs ✅ | 94 | baixo | pequena | destravou 4 |
| 3 · A11y (diálogo + rótulo) ✅ | 22 | baixo | pequena | independente |
| 4 · Componentes órfãos ✅ | 3 + 8 telas | médio | média | destravou 6 |
| 5 · PageHeader ✅ | 91 páginas | médio (visual) | média | — |
| 6 · Button — 🔶 parcial (81/327) | 62 de ~200 arquivos | médio | **grande** | — |
| 7 · Card, estados, grid ✅ | 73 arquivos + 5 novos + docs | baixo | grande | — |

**Regra de execução:** as etapas 5, 6 e 7 são **por módulo, um commit por
módulo**, replicando o método da auditoria de Empresas — o módulo auditado tem
índice 1,6 px-cravados/arquivo contra 32,0 do `bpoManual`. O método já provou
que funciona; o que faltou foi cobertura.

**Verificação em toda etapa:** `npx tsc --noEmit` · `npx eslint src
--max-warnings 0` · `npx vitest run` · `npm run build`. Conferência visual fica
com o usuário (sem credencial de login neste ambiente).

---

## Fora de escopo — não tocar

- Paleta e mecanismo de tema (contraste verificado: 5,06:1 claro / 5,33:1 escuro)
- `lucide-react` (129 arquivos vs 10 SVG inline)
- Tabelas semânticas de `EmpresasTable`/`PessoasTable` — são o modelo a copiar
- `PageContainer` (124/131 páginas)
- `Input`/`Select`/`Checkbox` — a repaginação de 14/07 pegou
- Escala de espaçamento — está disciplinada (`p-2/3/4/5/6`, só 4 valores
  arbitrários no app inteiro)
- Hex de cor de estágio de pipeline e de série de gráfico — são dado, não estilo

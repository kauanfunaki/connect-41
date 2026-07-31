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

### `FormShell` — tem um defeito de contrato ⚠️

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

**Pendente de decisão:** ou o `actions` é consertado (FormShell passa a
renderizar o `<form>`), ou é removido da API e o componente vira um casco puro
— aí ele se sobrepõe ao `Card`, e talvez o certo seja `Card` + `FormFooter`.
Não decidi sozinho porque muda a API de um componente da biblioteca.

**Verificação:** `tsc` limpo · `eslint --max-warnings 0` limpo · `vitest` 125
testes · `build` compilado.

**Mudança visual real** (primeira etapa com isso): os botões de fechar de
`Modal`/`SlideOver` e o menu do `DeleteTaskButton` passaram de `rounded-lg`
(16px) para `rounded-md` (10px) — 16px num quadrado de 32px era quase pílula,
e 10px é a convenção de botão-ícone do app. O card da Home ficou com o mesmo
padding de antes (`px-4 py-3.5`, o do `StatCard` vivo).

---

## Etapa 5 — `PageHeader` nas 101 páginas

**Objetivo:** o maior ganho de consistência percebida por unidade de esforço.
Cabeçalho é a primeira coisa que o olho encontra em toda tela; hoje 101 páginas
montam `<h1>` + subtítulo + ação à mão, cada uma com seu tamanho e espaçamento.

`PageHeader` já tem a API certa (`title` / `subtitle` / `action`) e já é usado
em 18 arquivos. É substituição, não construção.

**Como:** por módulo, na ordem `kanban` → `admin` → `pessoas` → resto —
mesma ordem do mapa de calor. Um commit por módulo, revisável.

**Risco:** baixo. **Tamanho:** sessão média, dividida por módulo.

---

## Etapa 6 — `Button` nos 331 `<button>` crus

**Objetivo:** a maior massa de inconsistência do app. 168 arquivos escrevem
`<button className="h-8 px-3 rounded-[10px] text-[13px] …">` à mão; `Button`
já define 4 variantes × 2 tamanhos e é importado em 9 arquivos.

**Como:** estritamente por módulo, começando pelas maiores massas —
`kanban` (175 px cravados / 31 arquivos) → `admin` (106/29) →
`pessoas` (96/23) → `teste` (43/8) → resto.

**Antes de começar:** conferir se as 4 variantes cobrem os casos reais. Pela
amostragem, faltam pelo menos dois: botão só-ícone (→ é `IconButton`, Etapa 4)
e botão-link/`<a>`. Se faltarem, estender `Button` **primeiro** — senão a
campanha gera 20 exceções `className` que recriam o problema.

**Risco:** médio. **Tamanho:** grande — é a etapa que deve ser fatiada em
várias sessões, nunca feita de uma vez.

---

## Etapa 7 — Card, estados de tela e responsividade

Volume baixo de risco, alto de repetição. Pode correr em paralelo às etapas 5–6
ou depois.

| Item | Escala |
|---|---|
| `Card` nos 196 blocos ad-hoc | Definir 2–3 variantes de padding antes (hoje convivem `p-4` 113×, `p-5` 111×, `p-6` 64×) e só então substituir |
| `error.tsx` por rota de 1º nível | 2 existem no app inteiro; uma falha de servidor em qualquer outra rota sobe até o boundary raiz |
| `loading.tsx` / `ListPageSkeleton` | 26 para 141 páginas (~18%) |
| 148 `grid-cols-*` sem breakpoint | ~53% dos grids são fixos; priorizar telas de detalhe (Kanban, Pessoas, Empresas) |
| Texto abaixo de 11px | 38 arquivos, concentrado nas linhas de tabela de Pessoas, Kanban e Agenda; a Etapa 1 já dá o degrau de destino |

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
| 5 · PageHeader | 101 páginas | baixo | média | — |
| 6 · Button | 168 arquivos | médio | **grande** | — |
| 7 · Card, estados, grid | ~200 pontos | baixo | grande | — |

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

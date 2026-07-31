# Levantamento de Design — Connect 41 (app inteiro)

> Data: 30/07/2026 · Escopo: todo o `src/` (413 arquivos `.tsx`, 141 páginas,
> 31 rotas de 1º nível) · Método: leitura da fundação de tokens + medição
> quantitativa de aderência por grep sobre o código real. Nenhuma alteração
> foi feita — este documento é diagnóstico.

---

## 1. Resumo executivo

O Connect tem uma **fundação de design madura e bem pensada** (Design System V2
"Perímetro"): ~60 tokens de cor com troca claro/escuro completa, escala
tipográfica por papel, 11 cores setoriais, foco acessível sitewide, scrollbar
customizada, skeletons e animações com `prefers-reduced-motion`. A camada de
cor está correta inclusive em contraste — os dois tons críticos de texto
secundário rendem 5,06:1 (claro) e 5,33:1 (escuro), acima do mínimo AA.

O problema não é a fundação. É a **taxa de adoção**. A biblioteca existe, mas a
maior parte do app não a consome:

| Camada | Intenção (token/componente) | Realidade no código |
|---|---|---|
| Tipografia | 14 tokens `--fs-*` | **192** usos de token vs **1.605** `text-[Npx]` cravados (**8,4×**) |
| Botões | `ui/Button` | importado em **9** arquivos vs **331** `<button>` crus em **168** arquivos |
| Cards | `ui/Card` | **9** arquivos vs **196** cards ad-hoc (`bg-surface border rounded-*`) |
| Cabeçalho de página | `ui/PageHeader` | **18** arquivos vs **101** páginas com `<h1>` próprio |
| Container | `shared/PageContainer` | **124 de 131** páginas ✅ (única peça com adoção real) |

Consequência prática: o app **parece** consistente porque as cores são tokens,
mas as proporções não são. Cada tela reinventa tamanho de texto, altura de
botão e padding de card. É por isso que ajustes visuais viram sempre trabalho
de 30–50 arquivos em vez de 1.

**Três coisas quebradas de fato** (não é gosto, é defeito):
1. `ui/Modal` não tem `role="dialog"`, `aria-modal`, focus trap nem scroll lock.
2. Três componentes da biblioteca (`IconButton`, `MetricCard`, `FormShell`) têm
   **zero** consumidores — são código morto que engana quem busca padrão.
3. A documentação do `ds-bundle/` contradiz `globals.css` nos raios de borda.

---

## 2. A fundação — o que está bom (não mexer)

`src/app/globals.css` (396 linhas) é a fonte da verdade e está bem construída:

- **Cor:** escala de marca 50–900 ancorada em `#1F5EEA`, semânticas
  (success/warning/danger/info) com par claro/escuro separado, 11 cores
  setoriais, superfícies em 5 níveis (`canvas` → `surface-elevated`).
- **Tema:** troca por `data-theme` no `<html>` + fallback `prefers-color-scheme`.
  Sem provider React, sem flash. Arquitetura correta.
- **Contraste:** `--c41-fg-muted` já foi corrigido de `#8B8695` para `#6B6577`
  no tema claro, com o raciocínio documentado em comentário no próprio arquivo.
  Verificado: 5,59:1 sobre `surface`, 5,06:1 sobre `canvas`, 5,33:1 no escuro.
  **Passa AA nos três casos.**
- **Foco:** `:focus-visible` global com `box-shadow` de 3px — cobre inclusive os
  331 `<button>` crus. Este é o motivo de a acessibilidade de teclado não ter
  desabado junto com a consistência visual.
- **Movimento:** todas as animações (`kanban-card-enter`, `reveal-in`,
  `slide-over-in`) respeitam `prefers-reduced-motion`.
- **Ícones:** `lucide-react` em 129 arquivos, apenas 10 `<svg>` inline.
  Consistência quase total — a peça mais bem padronizada do app.

---

## 3. Achados por camada

### 3.1 Tipografia — o achado dominante

A escala existe e quase ninguém usa:

| Token | Valor | Usos reais |
|---|---|---|
| `--fs-helper` | 13px | 67 |
| `--fs-body` | 15px | 45 |
| `--fs-section` | 18px | 28 |
| `--fs-display` | 30px | 18 |
| `--fs-label` | 14px | 10 |
| `--fs-button` | 15px | 6 |
| `--fs-input` | 16px | 5 |
| `--fs-kanban-meta` | 12px | 4 |
| `--fs-dropdown` | 14px | 3 |
| `--fs-metric` / `--fs-kanban-title` | 30/14px | 2 cada |
| `--fs-card-title` / `--fs-badge` | 16/12.5px | **1 cada** |
| `--fs-search` | 15px | **0** |

Contra isso, **23 tamanhos distintos** cravados em pixel, 1.605 ocorrências:

```
699× text-[13px]    379× text-[12px]    153× text-[11px]     92× text-[16px]
 77× text-[14px]     47× text-[10px]     39× text-[12.5px]   38× text-[11.5px]
 28× text-[15px]     12× text-[10.5px]    8× text-[9px]        7× text-[18px]
  7× text-[13.5px]   +10 outros (8, 17, 14.5, 20, 22, 23, 24, 26, 28, 32px)
```

Dois problemas embutidos:

1. **O token mente.** `--fs-body: 15px` diz que o corpo do app é 15px. O corpo
   real é **13px** (699 ocorrências). Quem seguir o token produz tela
   destoante; quem seguir a prática ignora o token. Os dois caminhos erram.
2. **Meios-pixels sem critério.** 12.5, 11.5, 13.5, 10.5, 14.5px — 97
   ocorrências de tamanhos que não pertencem a escala nenhuma e não sobrevivem
   a zoom do navegador.

**Texto abaixo de 11px em 38 arquivos** (8px, 9px, 10px, 10.5px), concentrado
em linhas de tabela de Pessoas (`AfastamentoRow`, `BeneficioRow`, `FeriasRow`,
`ExameRow`, `HoraExtraRow`, `EscalaRow`, `DesligamentoRow`), Kanban, Agenda e
Charts. Não reprova WCAG (não há mínimo normativo de tamanho), mas é o tipo de
densidade que gera reclamação de leitura — e são justamente as telas
operacionais de uso diário.

### 3.2 Componentes — a biblioteca é ignorada ou está morta

30 componentes em `src/components/ui/`. Adoção medida por import:

| Faixa | Componentes |
|---|---|
| **Morto (0 consumidores)** | `IconButton`, `MetricCard`, `FormShell` |
| **Quase morto (1–6)** | `SlideOver` (1), `FieldGrid` (2), `FormSection` (2), `Stepper` (2), `Tabs` (3), `FormFooter` (5), `ConfirmDialog` (5), `Badge` (6) |
| **Baixo (8–15)** | `Modal` (8), `Card` (9), `Button` (9), `Dropdown` (10), `Toast` (13), `Textarea` (15) |
| **Real (30+)** | `Checkbox` (30), `EmptyState` (53), `Select` (63), `Input` (83) |

O padrão é claro: **campos de formulário foram padronizados de verdade**
(`Input` 284 usos vs 87 `<input>` crus — herança da repaginação de 14/07), e
**nada mais foi**.

- **Botão** é o caso extremo: `Button.tsx` define 4 variantes e 2 tamanhos, e é
  usado em 9 arquivos. Os outros 168 arquivos escrevem `<button className="h-8
  px-3 rounded-[10px] text-[13px] …">` à mão. `rounded-[10px]` aparece 34 vezes
  cravado — é literalmente o valor de `--radius-md`, reescrito à mão.
- **Card**: 196 blocos `bg-surface border border-border rounded-*` inline
  contra 9 usos do componente. Cada um com padding próprio.
- **PageHeader**: 18 arquivos. 101 páginas montam `<h1>` + subtítulo + ação por
  conta própria — exatamente a inconsistência que a auditoria de Empresas
  (20/07) corrigiu **dentro de um módulo só**. O resto do app nunca recebeu.

### 3.3 Acessibilidade

O que está certo: foco global, tabelas semânticas (`<table>/<thead>/<th>` com
`min-w` + `overflow-x-auto`), apenas **1** `onClick` em elemento não-semântico
no app inteiro, ícones decorativos.

O que falta:

- **`ui/Modal` sem contrato de diálogo.** Tem ESC e clique-fora, mas não tem
  `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trap, retorno
  de foco ao fechar, nem lock de scroll do body. Leitor de tela não anuncia
  como modal e o Tab escapa para a página atrás. Mesmo diagnóstico vale para
  `ui/SlideOver` (só ESC).
- **Rótulo de ação por `title=`, não por `aria-label`.** 195 `title=` contra 66
  `aria-label` no app todo, sobre 331 botões — a maior parte deles só-ícone.
  `title` não é lido de forma confiável por leitor de tela e não aparece em
  toque. Cada botão só-ícone sem `aria-label` é um controle sem nome acessível.
- **15 `<img>` crus** contra 1 arquivo usando `next/image` — sem otimização e
  com risco de `alt` ausente.

### 3.4 Layout e responsividade

- `PageContainer` em **124 das 131** páginas — a única peça com adoção real.
  As 7 exceções: `avaliacao-atendimentos`, `setor/[code]/[moduleCode]`,
  `(app)/page.tsx`, e os 4 arquivos de rota interceptada de Kanban/BPO (estes
  são modais, então provavelmente corretos).
- `variant="narrow"` em 42 lugares — o segundo padrão de largura convive bem
  com o `wide`, resolvido na auditoria de 20/07.
- **148 `grid-cols-*` sem breakpoint** contra 129 com. Ou seja, ~53% dos grids
  são fixos em todas as larguras. A auditoria mobile de 14/07 corrigiu ~35
  grids de formulário; o resto do app não foi varrido.
- **117 `w-[Npx]`** e 19 `min-w-[Npx]` cravados.
- Apenas **13** usos de `hidden md:*` / `md:hidden` — quase não há
  troca de layout por breakpoint; a resposta a telas estreitas é encolher, não
  reorganizar.

### 3.5 Estados de tela

- `EmptyState` em 53 arquivos — boa cobertura, resultado direto das auditorias
  anteriores.
- **26 `loading.tsx`** para 141 páginas (~18%). `ListPageSkeleton` em 15
  arquivos. A maioria das rotas não tem estado de carregamento próprio.
- **2 `error.tsx`** no app inteiro (`(app)/error.tsx` e `home/error.tsx`). Uma
  falha de servidor em qualquer outra rota sobe até o boundary raiz.

### 3.6 Cor — desvios pontuais

47 hex cravados em **21 arquivos**, concentrados em Kanban (5 arquivos),
páginas de detalhe (`empresas/[id]`, `home`, `tarefas`, `transferencias`,
`setor/[code]`, `bpo-financeiro/[id]`), `Charts.tsx`, `ConnectLoadingScreen` e
`layout.tsx`. Parte é legítima (cores de estágio de pipeline escolhidas pelo
usuário, séries de gráfico); parte não. **Zero** ocorrências de
`text-gray-*`/`bg-slate-*` — nenhuma cor crua do Tailwind vazou. A disciplina
de cor é boa; o desvio é localizado.

### 3.7 Drift de documentação — `ds-bundle/`

O `ds-bundle/` (bundle publicado do design system, 49 componentes) tem um
`README.md` que **contradiz o `globals.css`**:

| Raio | `ds-bundle/README.md` diz | `globals.css` define |
|---|---|---|
| `rounded-sm` | 4px | **6px** |
| `rounded-md` | 6px | **10px** |
| `rounded-lg` | 8px | **16px** |
| `rounded-xl` | 12px | **16px** |

Além disso o README documenta "texto 11–13px para corpo/labels", que é a
prática real mas contradiz `--fs-body: 15px`. E há um marcador
`ds-bundle/_ds_needs_recompile` no repositório — o bundle está desatualizado em
relação ao código.

Dois detalhes menores na própria escala: `--radius-lg` e `--radius-xl` têm
**valor idêntico** (16px), então a escala tem 3 degraus, não 4 — e `ui/Card` e
`ui/Modal` usam `rounded-2xl`, que não pertence a `@theme` (cai no default do
Tailwind, 16px por coincidência).

---

## 4. Mapa de calor por módulo

Densidade de `text-[Npx]` cravado (indicador de "quanto essa área foge do
sistema"):

| Módulo | px cravados | arquivos | por arquivo | Leitura |
|---|---|---|---|---|
| `bpoManual` | 32 | 1 | **32,0** | escrito à mão do zero |
| `admissao` | 16 | 1 | 16,0 | idem |
| `avaliacaoAtendimentos` | 29 | 2 | 14,5 | idem |
| `bpoSenhas` | 14 | 1 | 14,0 | idem |
| `documents` | 12 | 1 | 12,0 | idem |
| `conversas` | 30 | 3 | 10,0 | idem |
| `candidatos` | 23 | 4 | 5,8 | |
| `kanban` | **175** | 31 | 5,6 | **maior massa absoluta** |
| `teste` | 43 | 8 | 5,4 | |
| `agenda` | 33 | 7 | 4,7 | |
| `vagas` | 17 | 4 | 4,3 | |
| `folha` | 21 | 5 | 4,2 | |
| `pessoas` | 96 | 23 | 4,2 | 2ª maior massa |
| `login` | 20 | 5 | 4,0 | |
| `home` | 4 | 1 | 4,0 | |
| `admin` | 106 | 29 | 3,7 | 3ª maior massa |
| `shell` | 33 | 11 | 3,0 | |
| `treinamentos` | 12 | 4 | 3,0 | |
| `transferencias` | 14 | 5 | 2,8 | |
| `documentosCliente` | 14 | 6 | 2,3 | redesenhado recentemente |
| `shared` | 38 | 23 | 1,7 | |
| `empresas` | 27 | 17 | **1,6** | **auditado em 20/07 — melhor índice** |
| `ui` | 26 | 31 | 0,8 | a própria biblioteca |

Padrão evidente: **módulos que passaram por auditoria (Empresas, 1,6) estão 3–20×
mais aderentes que módulos escritos direto (bpoManual, 32)**. As auditorias
funcionam; elas só nunca cobriram o app inteiro.

---

## 5. Plano priorizado

Ordenado por (impacto × permanência) ÷ risco. Tudo abaixo é visual/estrutural —
nenhum item toca schema, Server Action ou regra de negócio.

### Onda 1 — Corrigir o sistema antes de aplicar (risco baixo, 1 sessão)

1. **Realinhar a escala tipográfica com a realidade.** Redefinir os `--fs-*`
   para os valores efetivamente usados (13px como corpo, não 15px) em vez de
   forçar 1.605 call-sites a mudar de tamanho. Sem isso, qualquer campanha de
   substituição muda a aparência do app inteiro de uma vez.
2. **Reconciliar `ds-bundle/README.md` com `globals.css`** (raios e tipografia)
   e recompilar o bundle (`_ds_needs_recompile` está pendente). Enquanto
   divergirem, os dois documentos que deveriam ensinar o padrão ensinam
   padrões diferentes.
3. **Colapsar `--radius-lg`/`--radius-xl`** (hoje idênticos) e trocar
   `rounded-2xl` por token em `Card`/`Modal`.
4. **Decidir sobre os 3 componentes mortos**: `IconButton` e `MetricCard` são
   úteis e deveriam ser adotados (há 331 botões e vários blocos de métrica
   candidatos); `FormShell` é redundante com `FormSection`/`FieldGrid` e
   provavelmente deve sair.

### Onda 2 — Acessibilidade (risco baixo, alto retorno)

5. **`ui/Modal` + `ui/SlideOver`**: adicionar `role="dialog"`,
   `aria-modal="true"`, `aria-labelledby`, focus trap, retorno de foco e scroll
   lock. **Um arquivo cada, corrige todos os consumidores de uma vez.**
6. **Varredura de botão só-ícone**: `aria-label` onde hoje só há `title`.
   Mecânico, ~195 pontos, sem risco visual.
7. **Trocar os 15 `<img>` por `next/image`** com `alt` obrigatório.

### Onda 3 — Adoção de componente (por módulo, não global)

8. **`PageHeader` nas 101 páginas** com `<h1>` próprio — é o item de maior
   ganho de consistência percebida por unidade de esforço, porque cabeçalho é a
   primeira coisa que o olho encontra em toda tela.
9. **`Button` nos 331 `<button>` crus**, começando por Kanban (175 px cravados,
   31 arquivos) e Admin (106/29) — as duas maiores massas.
10. **`Card` nos 196 blocos ad-hoc.**

Recomendação de sequência: aplicar 8→10 **um módulo por vez**, na ordem
`kanban` → `admin` → `pessoas`, replicando o método da auditoria de Empresas
(que produziu o melhor índice do app). Uma campanha global de 331 arquivos numa
sessão só não é revisável.

### Onda 4 — Robustez de tela

11. `error.tsx` por rota de 1º nível (hoje 2 no app inteiro).
12. `loading.tsx`/`ListPageSkeleton` nas rotas de listagem sem estado de carga.
13. Varredura dos 148 `grid-cols-*` sem breakpoint, priorizando telas de
    detalhe (Kanban, Pessoas, Empresas).

---

## 6. O que NÃO deve ser tocado

- **A paleta e o mecanismo de tema.** Contraste verificado e aprovado nos dois
  temas; a arquitetura `data-theme` sem provider está correta.
- **Ícones.** `lucide-react` em 129 arquivos contra 10 `<svg>` inline — já é padrão.
- **Tabelas.** `EmpresasTable`/`PessoasTable` usam markup semântico com tokens
  e `min-w` + scroll horizontal. São o modelo a copiar, não a corrigir.
- **`PageContainer`.** 124/131 — funciona.
- **`Input`/`Select`/`Checkbox`.** A repaginação de 14/07 pegou; não desfazer.
- **Os hex de cor de estágio de pipeline e de série de gráfico** — são dado, não
  estilo.

---

## 7. Método e limites

- Fundação lida por completo (`globals.css`, `Button`, `Card`, `Modal`,
  `ds-bundle/README.md`, `AppShell`, tabelas de referência).
- Medições por `grep` sobre `src/**/*.tsx` — contagens são de ocorrência
  textual; um punhado de falsos positivos (ex.: `<button>` dentro do próprio
  `Button.tsx`) não altera as ordens de grandeza.
- **Não houve verificação visual em navegador** (conforme preferência
  registrada: validar por `tsc`/`eslint`/`vitest`/`build`, não por preview).
  Este levantamento é estático — não mede fluxo, tempo de tarefa nem percepção
  do usuário final.
- Nenhum arquivo foi alterado nesta rodada.

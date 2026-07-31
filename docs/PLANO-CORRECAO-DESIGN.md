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

## Etapa 2 — Consertar a escala de raio e a documentação divergente

**Objetivo:** eliminar a contradição entre as duas fontes que ensinam o padrão.

**Arquivos:** `globals.css`, `ds-bundle/README.md`, `ui/Card.tsx`,
`ui/Modal.tsx`, `ui/FormShell.tsx`, `ui/MetricCard.tsx`.

**O que fazer:**

1. `--radius-lg` e `--radius-xl` hoje são **ambos 16px** — a escala tem 3
   degraus fingindo ter 4. Definir: `sm 6` · `md 10` · `lg 14` · `xl 16`.
2. Trocar `rounded-2xl` (fora do `@theme`, cai no default do Tailwind) por
   `rounded-xl` nos 4 componentes que o usam.
3. Substituir os 34 `rounded-[10px]` cravados por `rounded-md` — é o mesmo
   valor, escrito à mão.
4. Corrigir a tabela de raios do `ds-bundle/README.md`, que documenta
   `4/6/8/12px` quando o real é `6/10/16/16px`, e o trecho de tipografia, que
   contradiz o `--fs-body`.
5. Recompilar o bundle — o marcador `ds-bundle/_ds_needs_recompile` está
   pendente no repositório.

**Risco:** baixo (item 1 muda `rounded-lg` de 16→14px em 240 call-sites — é
sutil, mas é mudança visual real; se preferir risco zero, manter 16 e apenas
documentar que a escala tem 3 degraus).
**Tamanho:** sessão pequena.

---

## Etapa 3 — Acessibilidade de diálogo e de rótulo

**Objetivo:** os dois defeitos funcionais de a11y. Alto retorno porque a
correção é por componente, não por call-site.

### 3a — `Modal` e `SlideOver` (2 arquivos, corrige todos os consumidores)

Falta em ambos: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
apontando para o título, focus trap, retorno de foco ao elemento que abriu, e
lock de scroll do `<body>`. Hoje só há ESC e clique-fora — o Tab escapa para a
página atrás e leitor de tela não anuncia como diálogo.

### 3b — Rótulo de botão só-ícone

195 `title=` contra 66 `aria-label` no app inteiro, sobre 331 botões em sua
maioria só-ícone. `title` não é lido de forma confiável por leitor de tela nem
existe em toque. Adicionar `aria-label` onde só há `title` — mecânico, sem
efeito visual.

### 3c — `<img>` → `next/image`

15 ocorrências cruas, 1 arquivo usando `next/image`. Migrar com `alt`
obrigatório.

**Risco:** baixo (3b e 3c são aditivos). **Tamanho:** 3a sessão pequena; 3b
sessão média.
**Verificação:** navegação por teclado nos modais (Tab não deve sair do
diálogo; ESC fecha; foco volta ao gatilho).

---

## Etapa 4 — Ressuscitar os componentes órfãos

**Objetivo:** três componentes bem construídos têm **zero** consumidores. Não
são código morto a deletar — são padrão pronto que ninguém sabe que existe.

> Correção ao levantamento: eu havia sugerido que `FormShell` fosse removido
> por redundância. Lendo o arquivo, não é — ele traz cabeçalho com borda e
> **barra de ações sticky no rodapé**, que nenhum dos 60 formulários do app tem
> hoje. É para adotar, não para apagar.

| Componente | Onde aplicar |
|---|---|
| `IconButton` | 38×38 com estados `active`/`hasDot` — topbar (`shell/`) e ações de card. É o padrão que os botões-ícone crus tentam imitar à mão. |
| `MetricCard` | blocos de métrica da Home e dos dashboards de setor/RH |
| `FormShell` | os 60 arquivos `*Form.tsx`, começando pelos multi-step (`EmpresaForm`, `PessoaForm`) |

Fazer como **prova de conceito em 2–3 telas primeiro**. Se o encaixe não for
bom, o componente é que precisa mudar — não force a adoção.

**Risco:** médio (muda aparência real onde aplicado).
**Tamanho:** sessão média.

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
| 2 · Raios + docs | 6 | baixo | pequena | destrava 4 |
| 3 · A11y (modal, rótulo, img) | ~30 | baixo | pequena/média | independente |
| 4 · Componentes órfãos | 3 + telas-piloto | médio | média | destrava 6 |
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

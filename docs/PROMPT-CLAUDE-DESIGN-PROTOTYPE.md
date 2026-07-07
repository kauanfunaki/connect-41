# Prompt para o Claude Design (Prototype) — Connect 41

> Cole no campo de prompt ao criar o Prototype dentro do projeto
> **"connect-41 design system"** já conectado via GitHub/Claude Code.
> Esse projeto já tem os componentes reais sincronizados (`AuthShell`, `AppShell`,
> `KanbanBoard`, e as peças da sidebar/topbar) — o prompt abaixo pede pra usar
> eles como base real, não inventar telas do zero sem referência.

---

## Prompt inicial (já enviado)

Este projeto de design system já tem os componentes reais do **Connect 41**
sincronizados (`components/login/AuthShell`, `components/shell/AppShell`,
`components/kanban/KanbanBoard`, e as peças soltas de navegação/topbar). Use
esses cards como a **referência real e atual** de estrutura, espaçamento e
comportamento — não são mockups, são os componentes de verdade rodando em
produção hoje.

Quero um **prototype explorando uma nova direção visual** pra 3 telas, nesta
ordem de prioridade:
1. **Login** (card `AuthShell`)
2. **Shell** — sidebar + topbar (card `AppShell`)
3. **Kanban** — o board de trabalho (card `KanbanBoard`)

### O que está errado na versão atual (não é ajuste incremental, é redesign)
1. **Maior problema: desperdício de espaço.** As telas do app real usam um
   container centralizado estreito (`max-w-3xl`/`max-w-2xl` com `p-6`) dentro
   de monitores largos — sobra 1/3 a 2/3 da tela em branco. Quero um sistema
   de layout que realmente aproveite a largura disponível, com densidade de
   informação pensada por tipo de tela (lista, formulário, board), não um
   container único genérico.
2. **Genérico** — hoje parece um template de admin dashboard qualquer, sem
   identidade própria da 41 Tech (empresa de contabilidade/BPO brasileira).
3. **Paleta atual não convence** — um azul corporativo (`#1A5FA8`) com
   neutros frios, sem personalidade.

### Direção
- Pode propor paleta, tipografia e tom visual **totalmente diferentes** do
  que está sincronizado hoje — nada de cor/tipografia está protegido.
- Tom de referência: **Linear, Vercel, Mercury** — B2B minimalista e técnico,
  tipografia com presença, espaço negativo usado com intenção, boa dose de
  foco em dark mode. Nada de "cara de gerado por IA" (sem gradiente roxo
  genérico, sem pílula colorida gritante, sem espaçamento robótico de
  template).
- **Densidade**: é uma ferramenta de trabalho interna (não landing page) —
  pode ser mais densa que um SaaS consumer, desde que a hierarquia visual
  fique clara.
- **Logo**: os cards já usam a logo real (triângulo em traço mono, preto/
  branco) — trate isso como fixo e independente da paleta nova; só garanta
  que continua legível em cima do fundo escolhido.
- **Tema claro/escuro**: aberto a repensar. Se a nova direção ficar mais forte
  comprometendo com um só tema (ex.: só escuro), pode propor isso — não
  precisa manter os dois obrigatoriamente.
- Idioma da interface: português (pt-BR), tom profissional (equipe interna
  de contabilidade, não produto consumer).

### O que quero como entrega
1. **2–3 direções estéticas distintas** (paleta com hex, tipografia, princípios
   de layout/densidade) — quero comparar, não uma resposta única.
2. Depois que eu escolher uma: o **prototype interativo** das 3 telas acima
   aplicando essa direção, mostrando especificamente como resolve o problema
   de espaço desperdiçado em telas largas.
3. Os tokens de design concretos por trás da direção escolhida (cores,
   escala tipográfica, espaçamento, raio de borda, sombras) — isso vai voltar
   pra sessão de código do Connect 41 pra virar implementação de verdade.

---

## Respostas às perguntas de escopo do Claude Design

O Claude Design pediu esclarecimentos antes de propor as direções. Respostas
dadas:
- **Tema**: escuro como padrão, com toggle para claro.
- **Escopo do Kanban**: vai ter todo o conteúdo mapeado (prazo/badge de
  atraso, tags coloridas, responsáveis/avatares, "X dias na etapa", timeline
  de movimentação) — o app terá módulos por setor que usam esse mesmo motor,
  então o Kanban precisa suportar tudo isso de verdade no prototype, não uma
  versão simplificada.
- **Conteúdo do Login**: simples — só e-mail + senha (sem os elementos extras
  tipo SSO/redes sociais).
- **Realismo dos dados de exemplo**: livre, a critério do Claude Design.
- **Nível de interatividade do prototype**: livre, a critério do Claude
  Design.

## Direções propostas e escolha

O Claude Design devolveu 3 direções, todas dark-first com toggle claro
planejado, já resolvendo a densidade/largura direto nos mockups:
- **1a — Grafite & Âmbar**
- **1b — Carvão & Menta**
- **1c — Tinta & Cobre**

**Escolhida: 1c (Tinta & Cobre)**, com um ajuste — títulos em **Space
Grotesk** (em vez da tipografia de título originalmente proposta nessa
direção).

## Prompt de continuação (enviado)

Vou com a direção **1c — Tinta & Cobre**, com um ajuste: use **Space
Grotesk** para os títulos/headings (mantém a tipografia de corpo que você
propôs nessa direção para o restante do texto).

Pode seguir com o prototype interativo completo das 3 telas (Login, Shell,
Kanban) nessa direção, usando os componentes reais do design system
(`AuthShell`, `AppShell`, `KanbanBoard`) como base funcional. Ao final, quero
também os tokens de design concretos por trás dessa direção — paleta com
valores hex (incluindo as duas variantes, escura e clara, já que o tema
claro via toggle faz parte do escopo), a escala tipográfica completa (Space
Grotesk pros títulos + a fonte de corpo escolhida, com tamanhos/pesos), a
escala de espaçamento, raio de borda e sombras — isso vai voltar pra sessão
de código do Connect 41 pra virar implementação de verdade.

## Prompt de expansão de escopo (próximo a enviar)

> Contexto: o Claude Design só recebeu pedido pras 3 telas-núcleo até agora
> (Login/Shell/Kanban) — ele não tem acesso de escrita ao repositório real,
> então "CampoForm", "UsuariosTable" etc. nunca foram tocados por não terem
> sido pedidos. Antes de fechar os tokens definitivos, você decidiu validar
> a direção também nas telas de listagem/formulário — que são o padrão mais
> repetido no app inteiro (Empresas, Pessoas, Admin) — usando os componentes
> reais já sincronizados no design system.

Antes de fechar os tokens definitivos, quero validar a direção **1c — Tinta
& Cobre + Space Grotesk** também nos padrões de **listagem e formulário**,
que se repetem no app inteiro (Empresas, Pessoas, telas de Admin). Use os
componentes reais já sincronizados no design system como base:

- **Listagem com seleção em massa**: card `EmpresasTable` (ou `UsuariosTable`
  — mesma família de padrão).
- **Formulário de cadastro**: card `EmpresaForm` (ou `CampoForm`/`FilialForm`
  — mesma família).
- **Navegação**: cards `NavItem`/`SectorNavItem` já usados no `AppShell`, só
  confirmando que o estilo de item ativo/hover fica consistente fora do
  contexto da sidebar isolada.

Aplique a mesma direção (paleta, tipografia, tokens de espaçamento) que você
já usou nas 3 telas-núcleo — não é pra propor uma direção nova, é pra
confirmar que ela se sustenta nesse padrão de tela mais denso e repetitivo
antes de eu fechar os tokens finais.

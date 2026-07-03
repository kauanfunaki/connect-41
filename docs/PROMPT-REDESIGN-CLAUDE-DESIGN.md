# Prompt para sessão de design — Connect 41 (redesign completo)

> Cole o bloco abaixo numa conversa nova do Claude dedicada a design (fora deste ambiente de código).
> O objetivo dessa conversa é chegar a uma **direção visual nova**, não implementar código —
> a implementação volta pra esta sessão depois que a direção estiver fechada.

---

## Prompt

Estou redesenhando do zero a identidade visual do **Connect 41**, um CRM interno que a
**41 Tech** (empresa de contabilidade/BPO no Brasil) usa para gerenciar empresas-cliente,
pessoas (candidatos/colaboradores), um Kanban de atendimento por setor (Fiscal, Contábil,
DP/RH, Societário, Comercial, Recrutamento, etc.) e transferências entre setores. A visão de
longo prazo é comercializar essa plataforma para outras empresas de contabilidade
(multi-tenant), então a identidade precisa aguentar ser "marca própria" e não parecer um
template genérico.

**Não gostei do estado visual atual e quero repensar do zero — não é um ajuste incremental.**

### O que está errado hoje
1. **Desperdício de espaço**: quase toda tela usa um container centralizado estreito
   (ex.: `max-w-3xl mx-auto` ou `max-w-2xl mx-auto` num padding de `p-6`) dentro de telas de
   monitor largas — sobra 1/3 a 2/3 da tela em branco dos dois lados. Isso é o problema nº 1:
   preciso de um sistema de layout que realmente aproveite o espaço disponível (grids
   responsivos, densidade de informação pensada por tipo de tela — lista vs. formulário vs.
   board — não um container único genérico pra tudo).
2. **Genérico**: hoje parece um template de admin dashboard qualquer, sem cara própria da
   41 Tech.
3. **Paleta de cores não convence**: a paleta atual é um azul corporativo (`#1A5FA8`) com
   neutros frios — não tem personalidade, não é memorável.

### Direção desejada
- Quero uma **direção nova e ousada**, não um polimento do que existe. Pode (e deve) propor
  paleta, tipografia e tom visual diferentes do que existe hoje — nada está "protegido" além
  do que descrevo abaixo.
- Referência de tom: produtos como **Linear, Vercel, Mercury** — B2B minimalista e técnico,
  tipografia com presença forte, espaço negativo usado com intenção (não por acidente/preguiça
  como hoje), boa dose de foco em dark mode. Não quero clichê de "AI slop" (sem gradiente
  roxo genérico, sem pílulas coloridas gritantes, sem espaçamento robótico de template).
- **Densidade de informação**: como é uma ferramenta interna de trabalho (não um site de
  marketing), a densidade pode e deve ser mais alta que um SaaS consumer — só que organizada
  com hierarquia clara, não espremida.

### Coisas que já existem e não fazem parte da decisão de cor/paleta
- **Logo**: já existe uma logo nova, um triângulo/montanha em traço monocromático
  (preto no tema claro, branco no tema escuro) — ela é uma decisão fechada e independente,
  não precisa influenciar a paleta de cores nova. Trate a paleta como uma decisão em aberto,
  a logo só precisa continuar funcionando em cima do fundo que for escolhido (clara e
  legível).
- **Idioma**: interface 100% em português (pt-BR), usuários são equipe interna de uma
  contabilidade — tom deve ser profissional/sério, não descontraído.

### Tema claro/escuro
Hoje o app tem os dois temas. Estou aberto a repensar isso: se a nova direção ficar mais forte
comprometendo com **um só tema** (por exemplo, só escuro, ao estilo Linear/Vercel), pode
propor isso — não é obrigatório manter os dois. Se propuser abrir mão de um tema, explique o
trade-off (usuários vão usar isso o dia todo, em ambiente de escritório).

### Restrições técnicas (pra calibrar o que é realista)
- Stack: Next.js (App Router) + Tailwind CSS v4, tokens de cor hoje vivem como CSS custom
  properties (`--c41-*`) mapeadas pro Tailwind via `@theme inline`. Tipografia atual é IBM
  Plex Sans (texto) + IBM Plex Mono (números/código) via `next/font`. Isso pode mudar, mas
  qualquer fonte proposta precisa ter licença de uso web viável (Google Fonts ou equivalente).
- É uma aplicação real funcionando, não um site estático — a proposta final precisa ser
  traduzível em: tokens de cor, escala tipográfica, sistema de espaçamento/grid, e componentes
  base (botão, input, card, tabela, badge) que depois eu (ou outra sessão do Claude, dentro do
  código) vou implementar de verdade no projeto.

### Por onde começar (escopo desta rodada)
Não precisa desenhar o app inteiro de uma vez. Quero fechar a direção nestas telas-núcleo
primeiro — o resto do app herda o sistema depois que essas estiverem validadas:
1. **Login** (hoje é split-screen: formulário de um lado, painel de marca do outro).
2. **Shell da aplicação** — sidebar + topbar (navegação principal, busca global, notificações,
   menu de perfil).
3. **Kanban** — o board principal de trabalho (colunas por estágio, cards com prazo/tags/
   responsáveis).

### O que eu preciso que a conversa produza
1. Perguntas de esclarecimento se precisar, antes de propor.
2. 2–3 direções estéticas distintas (paleta, tipografia, princípios de layout/densidade) —
   não uma só, quero comparar.
3. Depois que eu escolher uma direção: os tokens de design concretos (cores com valores hex,
   escala tipográfica com tamanhos/pesos, escala de espaçamento, raio de borda, sombras) e uma
   descrição/mockup de como ficam as 3 telas-núcleo acima aplicando esses tokens — especialmente
   mostrando como resolve o problema de desperdício de espaço em telas largas.

# Uma tela em mais de um setor — proposta

**Data:** 21/10/2026 · **Pedido:** Kauan, 21/10 ("fazer a opção recomendada do estudo de 14/10")

> O estudo de 14/10 não está no repositório (nem em `docs/`, nem nos PRs e
> branches). A opção abaixo foi reconstruída pelo código de hoje — é a única das
> três que cabe nos 6 a 7 dias do estudo, porque o trabalho grande é trocar o
> gate de ~300 pontos que hoje perguntam "qual é **o** setor da tela". Se o
> estudo dizia outra coisa, este PR é o lugar para corrigir antes de juntar.

## Como é hoje

- Cada tela (módulo) tem **um** setor: o do catálogo (`src/lib/module-catalog.ts`)
  ou, se o administrador moveu, o de `tenant_modules.sector_code`
  ("Mover para…" em Configurações › Setores e módulos).
- O menu do setor mostra as telas daquele setor. O acesso é
  `canViewSector` / `canActOnSector` / `canManageSector` **no setor da tela**:
  quem é do setor vê e age, o gestor do setor gere, administrador faz tudo.
- A URL é uma só por tela (`/cadastros-financeiros`, `/fiscal/conferencia`…).

## As três saídas que o código permite

| | Como | Custo | Problema |
|---|---|---|---|
| A. Cópia por setor | Uma rota por setor (`/fiscal/notas`, `/bpo/notas`) | baixo | duas telas para manter, favorito e busca em dobro |
| **B. Setor dono + setores que também usam** | A tela segue com um setor dono; o administrador liga outros setores a ela | **6–7 dias** | é preciso trocar o gate em todo lugar |
| C. Permissão por tela, sem setor | Cada pessoa recebe telas, não setores | semanas | muda a regra de acesso de todo mundo |

**Recomendada: B.**

## Como fica (opção B)

**Ligação.** Cada tela continua com o seu **setor dono** (o de hoje, sem mudar
nada) e ganha uma lista de **setores que também usam**, numa tabela nova
`tenant_module_sectors` (escritório, tela, setor). Os setores da tela são
`[dono, ...os ligados]`.

**Escolha do administrador.** Em Configurações › Setores e módulos, cada tela
do setor ganha, ao lado de "Mover para…", o botão **"Também em…"**: uma lista
dos setores ativos com uma caixa de marcar em cada. A tela compartilhada aparece
também na lista dos outros setores ligados, com a etiqueta "Também em" ou
"De <setor dono>". Só Administrador e Super Admin mudam, como hoje, e cada
mudança vai para a Auditoria (`module.share`).

**Menu.** A tela aparece no menu de cada setor ligado, no grupo dela (as notas
ficam em "Documentos" no Fiscal, no Contábil e no BPO). "Todas as telas do
setor", o grupo do menu e a troca de setor no topo seguem a mesma lista.

**URL.** Continua **uma só**. O item do menu de cada setor leva ao mesmo
endereço; a lateral continua no setor escolhido no topo. Favorito, link de
notificação e link copiado continuam valendo.

**Permissão.** A regra é a de hoje, aplicada a cada setor da tela: pode ver
quem pode ver **algum** dos setores dela; pode agir quem pode agir em algum;
pode gerir o gestor de algum deles. Administrador segue vendo tudo. Uma tela
ligada a um setor a mais passa a abrir para quem é desse setor — é exatamente
o que o administrador pediu ao ligar.

**IA, busca, ajuda e favoritos.** Todos leem a lista de telas que a pessoa
alcança, e essa lista passa a contar todos os setores da tela. A tela aparece
uma vez só na busca (Ctrl+K) e nos favoritos, com o nome do setor dono.

**Avisos.** Notificação "para o setor da tela" (ex.: o cliente respondeu no
portal) continua indo para o **setor dono**, para ninguém passar a receber
aviso que não recebia.

## O que muda para quem já usa

**Nada, até um administrador ligar uma tela a outro setor.**
A migration só cria a tabela nova, vazia. O setor de cada tela continua onde
está (`tenant_modules.sector_code` ou o catálogo) — ninguém ganha nem perde
acesso por causa da migração.

## Casos que motivaram

- **Fornecedores e sacados** (`bpo_cadastros`): continua só do BPO, no grupo
  "Cadastros" do menu do BPO. Nada a ligar.
- **Prévia do SPED e notas** (`fiscal_conferencia`, `fiscal_acervo`): dono
  Fiscal, ligadas ao Contábil e ao BPO por "Também em…".
- **Recrutamento sem algumas telas gerais**: já resolvido pelo "Menu Geral por
  setor" (14/10); esta mudança não mexe nisso.

## Fora desta entrega

- Escolher, por pessoa, um setor diferente do dono para receber os avisos.
- Mostrar a tela num grupo diferente em cada setor.

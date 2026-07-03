# Levantamento de Melhorias — Frente 1 (Polimento do CRM base)

> Documento vivo. Só mapeamento — **nada aqui foi implementado ainda**. Vamos alinhando
> tópico por tópico e implementamos depois, em bloco ou por prioridade, a combinar.

---

## Roadmap de Fases (proposta — aguardando sua aprovação, nada implementado)

Separei tudo que já foi mapeado em fases, seguindo a mesma lógica das Fases A–F (RBAC/Admin/Handoff/Campos/Dashboard/Tema). Ordem pensada assim: primeiro o que é rápido e de baixo risco, depois o que precisa de schema novo mas é contido, depois o redesenho maior de UI, e por último as duas mudanças de maior porte arquitetural/técnico (multi-tenant e integração OAuth) — essas duas não bloqueiam nada das anteriores, então dá pra remanejar a ordem delas livremente se você quiser priorizar diferente.

| Fase | Nome | Conteúdo | Porte |
|---|---|---|---|
| **G** | Kanban — rebrand + bugfix | Renomear Pipeline→Kanban (rota `/kanban` inclusa), corrigir bug de fuso horário em Atividades, aplicar skill de front-end no visual do board | Pequeno/rápido |
| **H** | Kanban — card avançado | Expor `dueDate` + badge de atraso, model de Tag por setor (reaproveitável), responsáveis internos N:N, redesenho do card/detalhe do item no formato Trello (comentários/atividade mais clean) | Médio (schema novo: Tag, tabela pivot de responsáveis) |
| **I** | Nomenclatura e sidebar — ajustes diretos | Handoffs→Transferências (rota + texto), remover `/admin/tenant` da sidebar, destaque visual de página ativa no menu | Pequeno |
| **I.1** | Redesign visual — Login split-screen + Kanban dark com timeline | Login em duas colunas (form + painel de marca), Kanban com cor de estágio no card + "X dias na etapa" + timeline de movimentação do board | Pequeno/Médio (visual, mantendo cores/tokens atuais) |
| **J** | Topbar/Sidebar — redesenho completo | Busca global (Empresas+Pessoas+Kanban), foto de perfil (campo+upload novo) com dropdown de nome/papel/sair, engrenagem→página `/admin` com cards, tema no canto inferior esquerdo, logo centralizada, "Início" com mais widgets (placeholder) | Médio (schema novo: foto de perfil; página nova `/admin`) |
| **K** | Tabelas e listagens | Novo padrão visual (referência Geniusee) em todas as listas; seleção em massa + barra flutuante só em Empresas, Pessoas e Admin→Usuários (Pessoas precisa de campo `active` novo) | Médio/Grande (retrabalho em várias telas pra manter consistência) |
| **L** | Multi-tenant — workspaces e filiais | Múltiplos tenants por `SUPER_ADMIN` (tabela de vínculo nova), model de Filial vinculado ao Tenant + seletor pra qualquer usuário da empresa, fluxo interno de criação de workspace (CNPJ/nome na criação) | Grande (mudança de modelo de conta) |
| **M** | Reuniões — Google Meet + Microsoft Teams | Model de Reunião vinculável a item do Kanban, módulo "Agenda" plugável por setor (usa a fundação de módulos já existente), integração OAuth com Google Calendar/Meet e Microsoft Teams/Outlook | Grande (maior risco técnico — autenticação de dois provedores externos) |

**Por que essa ordem:** G/I são ganhos rápidos e não têm dependência de nada. H e K precisam de schema novo mas são contidos a uma área cada. J depende só de decisões já fechadas, sem pré-requisito técnico de outra fase. L e M são as duas maiores mudanças estruturais — nenhuma delas bloqueia as anteriores, então a ordem das duas últimas é a mais fácil de você trocar se a prioridade de negócio mudar (ex.: se a comercialização virar urgente, L sobe na fila; se um setor precisar de agenda logo, M sobe).

**Ainda faltam tópicos seus** (Empresas, Pessoas e outros que você ainda não passou) — quando vierem, entram como fases novas ou se encaixam dentro de K se forem sobre a tabela dessas telas.

---

## Fase I.1 — Redesign visual: Login split-screen + Kanban dark com timeline

> **Regra pra essa fase inteira:** aproveitar a **estrutura/layout** das duas referências,
> mas com as cores, tokens e tipografia que já são do Connect 41 (`--c41-brand`, IBM Plex
> Sans, tema claro/escuro já existentes) — não copiar a paleta violeta/azul-neon nem os
> efeitos de glow das imagens de referência. Mesmo espírito da adaptação que já fizemos
> com o componente do uiverse pro login atual.

### 1. Login — layout split-screen (duas colunas)
Hoje o login é um card centralizado único. A referência traz:
- **Coluna esquerda:** logo "41 Tech" (ícone + wordmark) no topo, título "Connect 41" + subtítulo, formulário (e-mail, senha, lembrar de mim + esqueci a senha na mesma linha), botão "Entrar".
- **Coluna direita:** painel decorativo de marca — fundo com grid/linhas sutis, um bloco de destaque, headline curta + texto de apoio mencionando os setores da 41 Tech.
- Mantém tudo que já existe hoje (campos, links pra Esqueci a senha/Solicitar acesso, remember me, herança de tema) — é só reestruturar o layout em 2 colunas em vez de 1 card central.
- **Nota pra mais adiante (não bloqueia agora):** o texto do painel direito ("Todos os setores da 41 Tech...") hoje seria fixo — quando a Fase L (multi-tenant/comercialização) existir, pode valer a pena esse texto ser configurável por tenant (white-label), mas isso não impede implementar com texto fixo agora.

### 2. Kanban — board escuro com cor por estágio + timeline de movimentação
Duas peças novas em relação ao que já estava mapeado nas Fases G/H:
- **2.1 — Card com cor de estágio na borda esquerda:** cada card ganha uma borda lateral colorida igual à cor do estágio onde está (a cor do estágio já existe no schema, `PipelineStage.color` — é só aplicar visualmente no card também, hoje só é usada no cabeçalho da coluna).
- **2.2 — Meta-linha secundária no card:** referência mostra "Origem · Responsável" direto no card fechado, sem precisar abrir o detalhe. Isso reforça a necessidade dos "responsáveis internos N:N" já mapeados na Fase H — aparecem resumidos aqui.
- **2.3 — "X dias na etapa":** contagem de quantos dias o item está no estágio atual — dá pra calcular a partir do `createdAt` da última `Activity` do tipo `STATUS_CHANGE` daquele item (ou da data de criação do item, se nunca mudou de estágio). Não precisa de campo novo no schema.
- **2.4 — Painel "Timeline de movimentação" abaixo do board:** feed horizontal com os eventos recentes de mudança de estágio de **todo o board** (não só de um item) — nome da pessoa/empresa, ação ("avançou para Gestor", "aprovada", "reprovada"), tempo relativo. **Isso é novo:** hoje a timeline (`Activity`) só é vista dentro do detalhe de um item específico; esse painel agrega as atividades de todos os itens do pipeline num só lugar. Não precisa de model novo — é uma query nova (`Activity` de tipo `STATUS_CHANGE` de todos os itens daquele pipeline, mais recentes primeiro).

---

## Pipelines → Kanban

### 1. Renomear "Pipeline" para "Kanban" em toda a UI
- Trocar o termo em telas, botões, breadcrumbs, títulos (`/pipelines` → provavelmente `/kanban` ou manter rota e só mudar o texto visível — **a decidir**: muda a URL também ou só o texto?).
- Não muda o motor por trás (continua o mesmo `Pipeline`/`PipelineStage`/`PipelineItem` no schema) — é troca de nomenclatura na camada visual, não estrutural.

### 2. Aplicar a skill de front-end pra deixar o visual mais bonito
- Revisão de design do board Kanban como um todo (não só o card).

### 3. Bug: horário da seção "Atividades" 3 horas adiantado
- Mesma classe de bug já visto e corrigido no 41-Tech-Hub (`TIMESTAMP WITHOUT TIME ZONE` + conexão setando timezone = timestamp gravado errado). Precisa confirmar se o Connect 41 tem o mesmo padrão de conexão (`pool.on("connect")` fazendo `SET timezone`) ou se é só exibição (`toLocaleString` sem timezone explícito no client).
- **Tratar como bug, não como melhoria de design** — mas registrado aqui pra entrar no mesmo pacote de mudanças do Kanban já que foi encontrado nessa revisão.

### 4. Redesenho do card (referência: card do Trello anexado)
Card do Trello mostrado tem: título, checklist, membros, data de entrega com badge de atraso, descrição, e painel lateral de comentários/atividade separado do conteúdo do card.

- **4.1 — Data de entrega/prazo no card**
  - Já existe `PipelineItem.dueDate` no schema (não é usado na UI hoje). É só expor no card + no formulário de criar/editar item.
  - Replicar o badge "Em atraso" do Trello quando `dueDate < hoje` e item não está no estágio terminal.
- **4.2 — Tags nos cards**
  - **Não existe campo de tag em `PipelineItem` hoje.** Precisa de decisão: tag livre (texto) ou lista pré-definida por pipeline/setor (tipo os `PipelineStage` já são configuráveis)? Isso afeta se precisa de schema novo (`Json` array simples vs. tabela `Tag` própria com cor).
- **4.3 — Vincular pessoas aos cards**
  - Ambíguo — precisa alinhar: é (a) atribuir um **responsável interno** (`User`) — o schema já tem `PipelineItem.assignedUserId`, também não exposto na UI hoje — ou (b) vincular uma **Pessoa** (candidato/colaborador, entidade `Person`) além da entidade principal do item? Ou os dois? Card do Trello usa "membros" = pessoas do time (equivalente a `User`, não `Person`).
- **4.4 — Comentários e atividade em formato mais clean**
  - Timeline já existe (`Activity`: nota + mudança de estágio). É reformulação visual, não de dado — deixar mais parecido com o painel lateral do Trello (separado do corpo do card, com avatar, texto e timestamp mais discretos).
- **4.5 — Layout geral do card mais organizado/separado por seção**
  - Reestruturar a página de detalhe do item (`/pipelines/[id]/itens/[itemId]`) nesse formato: corpo principal (título, descrição, data, tags, membros) + painel lateral de atividade — parecido com o modal do Trello.

### Decisões confirmadas
- **Rota muda para `/kanban`** (não é só o texto — a URL muda de verdade: `/pipelines` → `/kanban`, e todas as subrotas).
- **Tags: lista pré-definida com cor**, reaproveitável entre pipelines do mesmo setor (não por pipeline individual) — mesmo espírito do catálogo de Setores/Módulos: cadastro centralizado por setor, reutilizado onde fizer sentido.
- **Vincular pessoas = responsável interno da 41 Tech, podendo ser mais de um.** Hoje `PipelineItem.assignedUserId` é singular (1 responsável só) — precisa virar relação N:N (`PipelineItemAssignee` ou tabela pivot) pra suportar múltiplos responsáveis, como "membros" no Trello.

---

## Nomenclatura e navegação geral

### 1. "Handoffs" → termo em português
- Motivo: termo em inglês confunde parte da equipe, menos familiarizada.
- **Pendente decisão de nome:** sugestões — "Transferências", "Repasses" ou "Encaminhamentos". Qual soa mais natural pro dia a dia de vocês?
- Mesmo padrão do Kanban: muda rota (`/handoffs` → `/transferencias` ou equivalente) + todo texto visível + nome dos e-mails/notificações relacionadas.

### 2. "Início" (`/home`) — mais "cara de dashboard" sem ser um módulo de BI
- **Decisão confirmada:** não é o "Projeto 2 — Dashboard analítico" (esse continua adiado). É só a tela `/home` deixar de parecer crua (hoje: 4 cards + frase de boas-vindas) e mostrar mais dados reais da plataforma pra dar uma visão geral logo de cara.
- **Confirmado:** liberdade pra eu decidir o conteúdo — por enquanto é **placeholder** até a plataforma ficar mais estruturada e o usuário conseguir escolher gráficos/campos de verdade na Home. Candidatos a incluir quando for implementar: feed de atividade recente (últimas notas/mudanças de estágio no Kanban), prazos próximos vencendo (usa o `dueDate` que vai ganhar visibilidade no Kanban), distribuição de itens por estágio, resumo de notificações não lidas, atalhos rápidos pros módulos do setor do usuário.
- Referência visual trazida (print "SupplyChain"): cards de KPI no topo + gráficos + listas — dá o tom de "bastante informação organizada em blocos", não necessariamente replicar gráfico por gráfico.

### 3. Topbar + Sidebar — redesenho geral (referência: print "SupplyChain")
Reorganização de onde cada elemento vive hoje:

| Elemento | Hoje | Vai para |
|---|---|---|
| Busca | não existe | **início da header** (barra de pesquisa) |
| Notificações (sino) | topbar, direita | topbar, canto superior direito (mantém) |
| Acesso à Administração | seção "Administração" cheia na sidebar (Usuários, Setores, Módulos, Campos, Tenant) | **ícone de engrenagem no topbar** — sidebar fica só com o núcleo + setores, sem a lista de admin poluindo |
| Foto de perfil + nome + papel ("cargo") | nome do papel + contador de setor no rodapé da sidebar | **canto superior direito do topbar**, ao lado do sino/engrenagem |
| Troca de tema (☀️/🌙) | topbar, direita | **canto inferior esquerdo**, onde hoje fica o rodapé da sidebar (perto de onde o botão Sair deveria continuar) |
| Logo + "Connect 41" | alinhado à esquerda no topo da sidebar (ícone quadrado azul "41" + texto ao lado) | **centralizado** (dentro da área da sidebar) |

**Decisões confirmadas:**
- **Foto de perfil:** campo novo no `User` (`photoUrl` ou similar) + upload de arquivo de verdade — mesmo espírito do que o 41-Tech-Hub já tem (`POST /api/users/me/photo`). Precisa decidir só o mecanismo de armazenamento na hora de implementar (disco do container via volume, ou outro storage — o Hub guarda como upload local; replicar esse padrão é o caminho mais simples).
- **Logout:** vai para dentro de um **dropdown do perfil** (clica na foto/nome no topbar → abre menu → botão Sair lá dentro), igual ao print de referência. O rodapé da sidebar deixa de ter nome/papel/sair.
- **Engrenagem de Admin:** abre uma **página `/admin` nova**, com cards (um por área: Usuários, Setores, Módulos, Campos, Tenant) que levam pras páginas já existentes (`/admin/usuarios`, `/admin/setores` etc.) — não é dropdown, é uma tela intermediária.
- **Busca do header:** é **busca global de verdade** — Empresas + Pessoas + Kanban (e possivelmente Transferências) ao mesmo tempo, não um atalho visual. Isso conecta direto com o pilar "Busca e filtro" já registrado nas diretrizes gerais — na hora de implementar, avaliar se dá uma tela de resultados dedicada ou um dropdown de resultados rápidos abaixo da barra.

---

## Diretrizes gerais pra todas as frentes (não são tarefas, são princípios a manter em mente)
Você trouxe 4 pilares que valem pra qualquer tela daqui pra frente, não só pra um tópico específico — vou aplicar como critério de revisão em cada frente, não como item isolado de implementação:
1. **Busca e filtro** dinâmico por palavra-chave em telas com lista grande (Empresas, Pessoas, Kanban).
2. **Atualização em tempo real** sem precisar recarregar a página (notificações, contadores, mudanças de estágio vistas por outro usuário).
3. **UI responsiva** — desktop, tablet e celular.
4. **Analytics/Reporting** embutido — acompanhar uso e comportamento dentro do próprio app.

---

## Perguntas em aberto (preciso da sua decisão antes de implementar)
- [x] Tag: **reaproveitável entre pipelines do mesmo setor** (confirmado).
- [x] Nome em português pra "Handoffs": **Transferências** (confirmado).
- [x] Conteúdo da "Início": **placeholder, a meu critério**, até a plataforma ficar mais estruturada (confirmado).
- [x] Foto de perfil: **campo/upload novo** (confirmado).
- [x] Logout: **dropdown do perfil** no topbar (confirmado).
- [x] Engrenagem de Admin: **página `/admin` nova com cards** (confirmado).
- [x] Busca do header: **busca global de verdade** — Empresas+Pessoas+Kanban (confirmado).

Todas as perguntas deste tópico estão fechadas — pronto pra entrar na fila de implementação quando você der o sinal.

---

## Reuniões (Google Meet / Teams e afins)
- Demanda de alguns setores: ter uma forma de **visualizar reuniões realizadas e a realizar direto na plataforma**, sem precisar sair pro Google Calendar/Outlook pra saber o que tem marcado.
- **Não é modelado no schema hoje** — não existe conceito de "Reunião" em lugar nenhum.
- **Decisão confirmada: integração OAuth real com Google Calendar/Meet E Microsoft Teams/Outlook** (não é só registro manual). É o item de maior porte técnico deste levantamento até agora — autenticação de terceiros (dois provedores diferentes), armazenamento seguro de tokens, refresh automático, e decisão de infraestrutura (conta/app registrado no Google Cloud Console e no Azure/Entra ID da 41 Tech).
- **Decisão confirmada: duas formas de uso, não mutuamente exclusivas:**
  1. Reunião **vinculada a um item do Kanban** (a reunião aparece dentro do card/timeline daquele item).
  2. **Agenda própria**, independente de Kanban — mas **só nos setores que realmente fazem reunião** como parte do trabalho, não em todos. Isso amarra direto com a **fundação de Módulos** já construída: "Agenda" nasce como módulo plugável, ligado só nos setores/tenants que precisam, em vez de aparecer pra todo mundo.
- Fica pra próxima rodada de detalhamento (quando for implementar): qual provedor entra primeiro (Google ou Microsoft), e se cada usuário conecta a própria conta ou é uma conta de setor/departamento compartilhada.

## Multi-tenant: seletor de workspace + onboarding de novo cliente
Pensando na fase de comercialização (múltiplas instâncias do CRM pra múltiplos clientes):

### 2. Seletor de workspace/tenant na sidebar
- Um bloco novo **acima da label "Geral"**, pra vocês (times internos da 41 Tech) trocarem rapidamente entre instâncias/tenants diferentes sem precisar deslogar e logar em outra conta.
- **Decisão confirmada: só `SUPER_ADMIN` tem acesso a múltiplos tenants.** ADMIN/SECTOR_ADMIN/SECTOR_USER/READONLY de um cliente continuam presos a 1 tenant só, como hoje. Precisa de tabela nova de vínculo `SUPER_ADMIN` ↔ tenants (algo como `UserTenantAccess`), já que `User.tenantId` hoje é uma FK única.
- **Decisão confirmada: duas camadas de troca, papéis diferentes em cada uma:**
  1. **Trocar de tenant/cliente (Empresa X ↔ Empresa Y):** só `SUPER_ADMIN`.
  2. **Trocar de filial dentro do mesmo tenant:** `SUPER_ADMIN` configura quantas filiais a Empresa X tem, e a partir daí **qualquer usuário daquela empresa** (qualquer papel) pode trocar entre as filiais dela no seletor da sidebar — não é exclusivo de `SUPER_ADMIN`.
  - Precisa de model novo de Filial (`Branch`, vinculado ao `Tenant`) + tabela de vínculo `SUPER_ADMIN` ↔ tenants pra camada 1.
  - **Fica pra detalhamento técnico (na hora de implementar):** o que uma filial isola de fato — cada filial tem seu próprio conjunto de Empresas/Pessoas/Kanban (partição de dados), ou todas as filiais compartilham a mesma base de dados do tenant e a filial é só um contexto/etiqueta? Essa escolha muda bastante o design do banco.

### 3. Onboarding obrigatório ao criar um novo workspace
- Ao registrar um novo workspace/tenant, o fluxo exige preencher os dados da empresa cliente (CNPJ, nome) **na criação** — não depois.
- **Decisão confirmada: cadastro é feito por vocês (41 Tech)** — "nós vamos cadastrar o cliente", não é autoatendimento/cadastro público. Então é uma tela interna (provavelmente só `SUPER_ADMIN`), não um fluxo de signup aberto.
- **Decisão confirmada:** `/admin/tenant` **é removida da sidebar** (deixa de ocupar espaço como item de navegação próprio). Os dados do workspace (nome, CNPJ) passam a ser visualizados dentro da **configuração do workspace** — que vive junto com o fluxo de criação/gestão de workspaces (área do `SUPER_ADMIN`), não como uma página solta de admin do cliente.

## Tabelas e listagens — redesenho geral (referência: print "Geniusee")
Aplica-se a **todas as telas de lista** (Empresas, Pessoas, Kanban visão-lista se existir, Transferências, listas dentro do Admin) — não é uma tela isolada, é um novo padrão visual pra reutilizar em tudo (registrado explicitamente por você no item 4.4).

- **4.1 — Estética da tabela + filtros acima dela:** espaçamento, tipografia e paleta do print — botões de ação (tipo "Export"/"Share" no exemplo) na mesma tonalidade de azul usada como cor de destaque/seleção ativa na plataforma (`--c41-brand`).
- **4.2 — Página atual destacada na sidebar:** hoje **não existe** — nenhum item de menu marca visualmente em qual tela o usuário está. Precisa comparar a rota atual (`usePathname`) com o `href` de cada item de nav pra aplicar o estilo ativo.
- **4.3 — Seleção em massa com barra flutuante:** checkbox por linha + barra fixa na parte inferior mostrando "N itens selecionados" com as ações em massa disponíveis.

  **Decisões confirmadas por tela:**
  - **Empresas:** `Alterar status em massa` (disponível pra quem já pode editar hoje) + `Excluir em massa` (**restrito só a `SUPER_ADMIN`** — mais restrito que a exclusão individual, que hoje qualquer `canWrite` faz).
  - **Pessoas:** `Inativar em massa` — **gap encontrado:** `Person` não tem campo de status/ativo hoje (só `type`: Candidato/Colaborador). Precisa de campo novo (`active` ou `status`) antes de "inativar" fazer sentido — hoje não existe o que inativar.
  - **Admin → Usuários:** `Ativar/Desativar em massa` + `Atribuir setor em massa`.
  - **Transferências:** **sem seleção em massa** — cada uma continua sendo revisada individualmente (decisão explícita: contexto próprio por transferência, evita aceitar/rejeitar em lote por engano).
  - **Admin → Setores:** sem seleção em massa (poucos setores por tenant, individual já basta).
  - **Admin → Campos Customizados:** sem seleção em massa (excluir já apaga valores preenchidos — fazer em lote aumenta risco de acidente).
  - **Notificações:** sem seleção em massa além do que já existe ("marcar todas" + marcar individual ao clicar).
  - **Itens do Kanban (cards):** sem seleção em massa — fica de fora do redesenho de tabela, é board visual com drag-and-drop, não lista.

  **Resumo final — só ganham seleção em massa de verdade: Empresas, Pessoas, Admin → Usuários.**
- **4.4 — Consistência:** qualquer novo padrão de tabela vira o padrão de **todas** as listagens do app, não só uma tela — isso é bastante retrabalho de escopo (Empresas, Pessoas, Admin/Usuários, Admin/Setores, etc. todas seguem o mesmo componente novo).

---

## Perguntas em aberto — tópicos desta rodada
- [x] Reuniões: **integração OAuth real com Google E Microsoft** (confirmado) — provedor a priorizar e modelo de conta (individual vs. setor) ficam pra rodada de detalhamento técnico.
- [x] Reunião vincula a quê: **Kanban + agenda própria por setor** (módulo plugável), ambos (confirmado).
- [x] Seletor de workspace: **múltiplos tenants só pra `SUPER_ADMIN`** + **filiais dentro do mesmo tenant** (confirmado) — falta só confirmar se troca de filial é exclusiva de `SUPER_ADMIN` ou vale pra usuários do próprio cliente também.
- [x] Criação de novo workspace: **só internamente pela 41 Tech** (confirmado).
- [x] `/admin/tenant`: **removida da sidebar**, dados do workspace ficam dentro da configuração do workspace (área de gestão do `SUPER_ADMIN`) (confirmado).
- [x] Ações em massa por tela: **definidas** (Empresas, Pessoas, Admin→Usuários ganham; Transferências, Setores, Campos, Notificações e Kanban não).
- [x] Troca de filial: **qualquer usuário da empresa** troca entre as filiais dela; só `SUPER_ADMIN` troca entre empresas/tenants diferentes (confirmado).

## Pergunta técnica nova (fica pra quando for detalhar a implementação, não bloqueia o mapeamento)
- [ ] Filial isola dados de verdade (cada filial com seu próprio conjunto de Empresas/Pessoas/Kanban) ou é só um contexto/etiqueta sobre a mesma base de dados do tenant?

---

## Empresas — cadastro e tela inicial

> Mapeamento puro — nada implementado ainda. Registrado a partir dos pontos trazidos por você em 02/07/2026.

### 1. Campo "ID" da empresa (ID do domínio/Acessorias)
- Hoje não existe nenhum campo de ID externo em `Company` — só o `id` interno (uuid), que não é visível/editável.
- Pedido: um campo **"ID"** visível tanto no formulário de cadastro quanto na listagem de Empresas, que é sempre o mesmo ID usado no sistema de domínio (a julgar pelo contexto, o Acessorias).
- **Precisa de confirmação:** esse ID é sempre numérico/alfanumérico fixo vindo de fora (você digita manualmente o ID que já existe no Acessorias) ou o Connect 41 deveria gerar algo e sincronizar pro Acessorias? Pelo que você descreveu, parece ser **só um campo de referência manual** (você cola o ID que já existe lá) — a confirmar.
- Schema: campo novo `Company.externalId` (string, opcional, provavelmente com índice pra busca rápida).

### 2. Data de abertura da empresa
- Não existe hoje. Pedido: campo de **data de abertura da empresa**, relacionado à Inscrição Municipal (você mencionou os dois juntos duas vezes, parece ser algo que sempre preenche junto).
- **UF já existe** no cadastro hoje (`stateCode`, na seção Endereço) — se o pedido for ter a UF junto da Inscrição Municipal/Fiscal (seção "Dados Fiscais", que hoje só tem Inscrição Estadual/Municipal/NIRE), é reposicionar campo existente, não criar novo.
- Schema: campo novo `Company.foundationDate` (Date, opcional).

### 3. Área de contatos — múltiplos, incluindo pessoas da 41
- Hoje `Company` só tem `email` e `phone` simples (1 de cada).
- Pedido: uma seção de **contatos múltiplos**, misturando:
  - Contatos do cliente (telefone/e-mail de quem responde na empresa).
  - Contatos internos da 41 responsáveis por aquela empresa (ex: "Tati" aparece em todas, "Amanda" quando é BPO).
- Isso é estruturalmente diferente do campo simples — precisa de uma **tabela nova** (`CompanyContact` ou similar): nome, tipo (cliente / interno 41), cargo/papel, telefone, e-mail, e talvez vínculo com `User` quando for alguém da 41 (pra não digitar o nome à mão toda vez).
- **Precisa de confirmação:** contatos internos da 41 são sempre os mesmos poucos nomes (Tati, Amanda...) — vale um catálogo pré-cadastrado (tipo Tags/Setores) pra só marcar quem é responsável, em vez de digitar nome toda vez?

### 4. Campo "Responsáveis pelos departamentos"
- Pedido: saber quem da 41 é responsável por cada **setor/serviço** que aquela empresa contratou (ex: quem responde pelo Fiscal daquela empresa, quem responde pelo DP).
- Isso conecta direto com `CompanyService` (já existe: qual setor uma empresa contratou) — provavelmente é um campo de responsável (`User`) dentro de cada `CompanyService`, não um campo solto em `Company`.
- **Se sobrepõe com o item 3** (contatos internos) — pode ser a mesma solução: um responsável por serviço/setor é um tipo específico de "contato interno".

### 5. Tela inicial de Empresas — repensar coluna "E-mail"
- Você notou que a coluna "E-mail" na listagem não é muito útil, já que várias empresas têm mais de um e-mail de contato.
- **Decorre direto do item 3** — assim que existir contato múltiplo, a coluna da listagem provavelmente troca de "e-mail único" pra algo como "contato principal" ou some, sobrando só no detalhe da empresa.

### 6. Tela inicial de Empresas — mostrar Regime Tributário e Tags
- Hoje Regime Tributário só aparece dentro do cadastro/detalhe da empresa, não na listagem.
- Pedido: mostrar na tela inicial (lista) o **Regime Tributário** e, abaixo dele, as **Tags** (as mesmas tags coloridas por setor criadas na Fase H para o Kanban, aplicadas aqui em Empresas — ou um conceito de tag próprio de Empresas, a confirmar).
- **Precisa de confirmação:** as "tags" mencionadas aqui são as mesmas do catálogo de Tags do Kanban (Fase H) reaproveitadas em Empresas, ou é um conceito de tag diferente, específico de Empresas?

---

## DP/RH/Recrutamento/Gestão — processos trazidos por você (mapeamento bruto)

> Colado por você em 03/07/2026, registrado aqui como está — **nada avaliado ou implementado
> ainda**. São processos/checklists de trabalho real do setor, não telas prontas. Cada bloco
> abaixo é candidato a virar um **módulo plugável** dentro da fundação de Módulos já existente
> no Connect 41 (`TenantModule` + `MODULE_CATALOG`, o mesmo mecanismo do módulo de
> Recrutamento) — a maioria não tem equivalente hoje no schema (`Pipeline`/`PipelineItem`
> genéricos não cobrem os campos específicos desses fluxos: ASO, verbas rescisórias, período
> aquisitivo de férias, faixas salariais etc.), então cada um provavelmente exige model novo
> próprio quando for priorizado.

### 1. Admissão e Controle de Exames Admissionais
**Setor sugerido:** DP/RH
- Solicitação e acompanhamento dos exames admissionais
- Encaminhamento do candidato para clínica ocupacional
- Controle de realização e prazo de entrega do ASO
- Conferência do ASO admissional e status de aptidão
- Controle de pendências documentais antes do início do colaborador
- Organização dos documentos admissionais em arquivo físico ou digital
- Interface com clínica, contabilidade ou departamento pessoal

**Nota:** conecta com o fluxo de Recrutamento (candidato aprovado → vira admissão) — avaliar se
isso é a continuação natural do Pipeline de Recrutamento ou um módulo separado que recebe o
candidato aprovado.

### 2. Conferência de RCT e Rescisões
**Setor sugerido:** DP/RH
- Conferência do Termo de Rescisão do Contrato de Trabalho
- Análise das verbas rescisórias: saldo de salário, férias, 13º e aviso prévio
- Conferência de férias vencidas, proporcionais e 1/3 constitucional
- Validação de descontos, faltas, atrasos e apontamentos
- Conferência de médias de horas extras, adicionais, comissões ou variáveis
- Verificação de FGTS, multa rescisória e prazos legais, quando aplicável
- Identificação de inconsistências e apoio na correção com a contabilidade
- Organização dos documentos rescisórios e acompanhamento das pendências

### 3. Gestão e Controle de Férias
**Setor sugerido:** DP/RH
- Controle de períodos aquisitivos e concessivos
- Identificação de férias vencidas ou próximas do vencimento
- Elaboração e atualização do calendário de férias
- Programação de férias junto aos gestores e áreas envolvidas
- Controle de férias individuais, coletivas e fracionadas, quando aplicável
- Acompanhamento de prazos de aviso e pagamento
- Conferência de recibos, datas de início, retorno e saldo
- Envio de alertas periódicos para evitar passivos trabalhistas
- Emissão de relatórios de status por colaborador, área ou gestor

**Nota:** os "alertas periódicos" e "relatórios de status" aqui têm sobreposição direta com o
item 6 (Indicadores e Relatórios de RH) — considerar desenhar como uma coisa só.

### 4. Implantação de Cargos e Salários
**Setor sugerido:** Gestão (ou DP/RH — a confirmar, é mais estratégico/estrutural que operacional)
- Levantamento da estrutura organizacional atual
- Mapeamento de áreas, setores, cargos existentes e funções exercidas
- Padronização de nomenclaturas de cargos
- Elaboração de descrições de cargo com missão, atividades e requisitos
- Definição de responsabilidades, competências e níveis de senioridade
- Organização de cargos por família, área ou hierarquia
- Apoio na construção de faixas salariais e critérios de progressão
- Identificação de distorções internas e oportunidades de ajuste
- Criação de matriz simples de cargos e salários
- Apoio na comunicação e implantação do modelo junto à liderança

**Nota:** é o item mais distante do modelo atual do Connect 41 (não é um fluxo recorrente tipo
Kanban, é um projeto de consultoria/estruturação) — provavelmente vira uma tela de cadastro/
matriz própria, não um pipeline.

### 5. Rotinas de Departamento Pessoal e Apoio Administrativo
**Setor sugerido:** DP/RH
- Conferência e organização de documentos dos colaboradores
- Controle de contratos de experiência e prazos de vencimento
- Acompanhamento de alterações cadastrais, promoções e transferências
- Controle de afastamentos, atestados médicos e pendências
- Apoio no envio de informações para folha de pagamento
- Conferência de informações enviadas à contabilidade ou DP externo
- Organização de arquivos digitais e controles internos
- Apoio em comunicados internos e fluxos administrativos de RH

**Nota:** é o bloco mais "guarda-chuva" — várias dessas rotinas (contratos de experiência com
prazo de vencimento, afastamentos) parecem reaproveitáveis do mecanismo de `dueDate`/badge de
atraso que já existe no Kanban (Fase H), aplicado a um Pipeline de "Colaborador ativo" em vez
de "Candidato".

### 6. Indicadores e Relatórios de RH
**Setor sugerido:** Gestão (cross-cutting — puxa dado de DP/RH e Recrutamento)
- Controle de admissões, desligamentos e movimentações internas
- Acompanhamento de turnover e absenteísmo
- Relatórios de vagas abertas, em andamento e encerradas
- Relatórios de férias vencidas, programadas e pendentes
- Relatórios de treinamentos realizados, vencidos e a vencer
- Controle de pendências documentais e operacionais
- Criação de dashboards simples em planilhas
- Apresentação de pontos de atenção e recomendações para a gestão

**Nota:** isso é essencialmente um dashboard analítico setorial — mesma família do "Projeto 2 —
Dashboard analítico" que já está registrado como adiado em outro ponto do levantamento geral.
Só faz sentido depois que os itens 1, 2, 3 e 5 existirem de verdade (não tem o que reportar
antes de ter o dado).

### Perguntas em aberto (antes de qualquer um destes virar fase)
- [ ] Cada bloco acima vira um módulo/Pipeline próprio, ou dá pra agrupar mais de um numa tela
      só (ex.: Admissão + Rotinas de DP num único módulo "Colaboradores")?
- [ ] Existe ordem de prioridade entre os 6 blocos, ou entram todos na fila igual?
- [ ] Item 4 (Cargos e Salários) — confirmar se é mesmo Gestão ou DP/RH.
- [ ] Item 6 (Indicadores) — depende dos outros existirem primeiro; não priorizar isoladamente.

---

## Próximos tópicos (aguardando)
- [x] Empresas (mapeado acima — itens 1 a 6, aguardando priorização e confirmações antes de entrar em fase; item "Apelido e-Contínuo" descartado a pedido seu em 02/07/2026)
- [x] DP/RH/Recrutamento/Gestão — processos (mapeado acima em 6 blocos, 03/07/2026 — aguardando priorização e confirmações, nenhum ainda em fase)
- [ ] Pessoas
- [ ] (outros, conforme você for passando)

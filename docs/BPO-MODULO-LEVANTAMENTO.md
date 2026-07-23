# Levantamento — Módulo BPO Financeiro no Connect

> Baseado no documento "Connect Alinhamento Setorial - BPO.docx" (validado com o setor). Atualizado após respostas do usuário em 2026-07-21: pendências do setor confirmadas OK, BPO confirmado como setor interno, prioridade nº1 definida (comunicação e tarefas internas), e um processo novo identificado (emissão de notas e CT-e). Atualizado novamente em 2026-07-22: todas as perguntas em aberto da seção 7 respondidas — escopo das fases fechado, pronto para desenho técnico da Fase 1. Só levantamento — nenhuma implementação feita.

## 1. Resumo executivo

**BPO Financeiro é um setor interno da 41 Tech** (confirmado) — mesmo estatuto de Fiscal/Contábil/DP, só que operacionalmente ele funciona como uma central de BPO financeiro terceirizado: cada analista mantém, para uma carteira fixa de clientes externos (25+ empresas/grupos hoje), a contabilidade financeira completa (contas a pagar/receber, extratos, impostos, relatórios) dentro do Omie, com uma **rotina recorrente por competência** (mensal/quinzenal/semanal/diária conforme o item).

Boa notícia: boa parte da fundação já existe no Connect e é reaproveitável quase 1:1 (seção 3). A resposta à pergunta central do documento — *"se pudesse resolver UMA coisa com o CRM, o que seria?"* — já veio: **comunicação e tarefas internas**. Isso muda a ordem de prioridade: a Fase 1 não precisa esperar o motor de recorrência sub-mensal (que segue sendo uma lacuna real, seção 4) — dá pra atacar "comunicação e tarefas internas" quase inteiramente com o que **já existe** no Connect hoje (Kanban, Transferências com @menção, notificações), só configurando o setor. Ver seção 5 (fases) revisada.

## 2. O que é o setor, em síntese (fatos do documento)

- **Equipe**: 1 coordenadora (Amanda Oliveira, concentra fechamento consolidado + faturamento do BPO + processos societários/bancários + urgências) + ~6 analistas, cada uma com **carteira fixa de empresas-cliente**.
- **Clientes**: 25+ empresas/grupos externos (não outro setor interno) — ex. Automec, Axel, Grupo BLD (~10 empresas), Multi, Cargo Time, etc.
- **Entrada de trabalho**: não é demanda avulsa — é uma **rotina fixa recriada a cada competência**, com frequências diferentes por tipo de item:
  - Diária (ex.: título Sicredi)
  - Semanal (contas a receber)
  - Quinzenal (limite de crédito com fornecedor)
  - Mensal em **dia fixo por cliente** (guia de imposto — dia 12, 25 ou 30 conforme o cliente)
  - Esporádica (abertura de conta, distrato, alteração societária — tag própria no ClickUp)
- **Processos principais** (3 detalhados no documento):
  1. Fechamento Financeiro Mensal por Empresa (o processo-núcleo, recorrente)
  2. Implantação de Novo Cliente no BPO (onboarding no Omie — sequência longa de etapas, muitas com tag "aguardando cliente")
  3. Processos Societários/Bancários/Impostos do Grupo (abertura de empresa/filial, alteração societária, conta bancária — concentrado na coordenação)
- **Saída/entrega**: guias pagas, extratos conciliados → **Contábil**, XML/relatórios de nota → **Fiscal**, relatórios operacionais → cliente, planilha de fechamento de RH, base Omie atualizada. Ou seja, o BPO **alimenta** Fiscal e Contábil todo mês — é o mesmo desenho de handoff que já existe no Connect, só que hoje acontece por e-mail/planilha, sem processo formal.
- **Maiores dores citadas**:
  1. Falta de acesso bancário em alguns clientes (trava a coleta de extratos) — hoje só marcado pontualmente em tarefas do ClickUp, sem cadastro histórico centralizado.
  2. Alto volume de tarefas recorrentes recriadas manualmente todo mês/semana/dia para 25+ clientes, sem automação — risco real de atraso em prazo fixo com multa.
- **Ferramentas hoje**: ClickUp (operacional), Omie (ERP financeiro, uma base por cliente), portais bancários/fiscais, planilhas, e-mail. Grupo BLD já tem automações em n8n (Watchers com IA lendo pastas de rede).
- **Processo adicional, não capturado no documento** (confirmado pelo usuário — não é uma tarefa fixa do ClickUp, por isso não apareceu no levantamento original): **emissão de notas fiscais e CT-e**. Fica registrado como um processo real do setor a endereçar — escopo exato (checklist/controle dentro do Connect vs. integração de emissão de verdade) ainda em aberto, ver seção 7.
- ~~Muitos campos do documento vieram marcados como "[A confirmar com o setor]"~~ — **todas as pendências foram confirmadas pelo usuário como OK**, não bloqueiam mais o desenho (a seção 6 abaixo fica só como registro histórico do que foi perguntado).

## 3. O que já existe no Connect e cobre a necessidade (sem trabalho novo)

| Necessidade do BPO | Já existe como | Observação |
|---|---|---|
| Cliente atendido = empresa cadastrada | `Company` | Os 25+ clientes do BPO já seriam `Company` normais no tenant, como qualquer outro setor. |
| Carteira fixa de cliente por analista | `CompanyService` (`sectorCode` + `responsibleUserId`) | Já é exatamente "responsável por setor/serviço" — só precisa existir um `Sector` "BPO" (ou granular por sub-atividade) e cada analista virar `responsible` do serviço BPO nas empresas da própria carteira. |
| Handoff formal BPO → Fiscal/Contábil | `Handoff`/`HandoffSector` (módulo Transferências) | É literalmente o que falta hoje ("handoff implícito, via e-mail, sem processo formal" — citado no documento). Os 15 modelos de texto que acabamos de adicionar em Transferências já cobrem parte disso; falta um modelo específico para "Fechamento mensal BPO → Fiscal/Contábil" (ver seção 5). |
| Onboarding de cliente novo (Implantação no Omie) | `Pipeline` + `PipelineStage` + `PipelineItem` (Kanban genérico) | Um Kanban "Implantação BPO" com uma etapa por fase (configurações iniciais → cadastro → certificado/contas → NFS-e/NF-e → parametrização → categorias → testes → treinamento → entrega) resolve isso sem código novo, só configuração. |
| Processos societários/bancários do grupo (esporádicos) | `Handoff` (Transferências) já usado para isso em outros setores | Os modelos de texto de Transferências que acabamos de portar do Acessórias (Baixa de CNPJ, Alteração Contratual, Abertura de Nova Empresa, Regularização Municipal/Estadual etc.) já cobrem quase todos os cenários societários/bancários citados neste documento. |
| Campo dinâmico por setor (ex.: "situação de acesso bancário") | `CustomField`/`CustomValue` (por `sectorCode` + `entityType`) | Dá pra criar um campo customizado "Status de acesso bancário" (SELECT: OK / Pendente / Bloqueado) na Empresa, escopado ao setor BPO, sem alterar schema. |
| Documentos recebidos do cliente (contrato social, docs societários) | Módulo de Documentos (`Document`) | Já existe upload/categoria/sensível por entidade. |

## 4. Lacuna real — o que precisa ser construído

1. **Motor de recorrência sub-mensal.** `RecurringObligation` hoje só gera **1 item por mês** (`dayOfMonth`, prorrogado pro próximo dia útil). O BPO precisa de diário, semanal e quinzenal também — isso é uma extensão real do modelo e do gerador (`src/lib/recurringObligations.ts`), não só configuração. É a peça que resolve a dor #2 do setor (recriação manual).
2. **Calendário centralizado de vencimento por cliente.** Hoje "dia 12/25/30 conforme o cliente" só existe implícito na tarefa recriada manualmente no ClickUp. Isso já teria uma solução natural **assim que o item 1 existir** (o próprio `RecurringObligation.dayOfMonth` já é esse calendário, só que por enquanto só mensal) — não é uma peça nova separada, é consequência do item 1.
3. **Registro histórico de status de acesso bancário por cliente.** Hoje é uma marcação pontual em tarefa avulsa, sem histórico. Um `CustomField` resolve a parte de "estado atual", mas não dá histórico/auditoria de quando mudou — se o setor quiser rastrear isso ao longo do tempo (não só o estado atual), é uma decisão a tomar (campo simples vs. um pequeno log).
4. **Dashboard financeiro por cliente/consolidado.** Citado como iniciativa já em andamento no ClickUp mas ainda não estruturada ("Dashboard Financeiro" em construção, pasta "Faturamento Fiscal" vazia). Não existe hoje nada equivalente pronto no Connect para reaproveitar — seria módulo novo de verdade (métricas/relatórios).
5. **Integração com Omie.** Citada como o sistema onde o trabalho de fato acontece (uma base por cliente). O documento não pede explicitamente "integrar com Omie" — mas se um dos objetivos do CRM for reduzir digitação dupla, essa seria uma integração nova, no mesmo espírito arquitetural do que fizemos com o Chatwoot (ver `docs/CHATWOOT_INTEGRATION_FEASIBILITY.md` como referência de como abordamos isso). Segue sem decisão de escopo/fase (pergunta 3 da seção 7).
6. **Modelo de texto de Transferência específico para o handoff mensal BPO → Fiscal/Contábil.** Os 15 modelos que já existem cobrem cenários societários/abertura/CNAE, mas nenhum cobre "entrega mensal de fechamento" (extratos + XML + relatórios, recorrente, não societário). Seria um 16º modelo, pequeno — e já entra naturalmente na Fase 1 (comunicação/tarefas internas), não depende de nada novo.
7. **Emissão de Notas Fiscais e CT-e.** Processo real do setor, não capturado no documento original (não é tarefa fixa recriada no ClickUp). Preciso de definição de escopo antes de desenhar — ver pergunta 6 da seção 7.

## 5. Recorte de módulo proposto — fases fechadas após respostas de 2026-07-22

Nomeando só pra alinhar conceito — nada disto está implementado. Escopo de cada fase confirmado pelo usuário; segue para desenho técnico.

**Fase 1 — Comunicação e tarefas internas (configuração, sem código novo)** ✅ validada, ponto de partida
- Criar o `Sector` "BPO" em Admin → Setores.
- Cadastrar os 25+ clientes como `Company` (se ainda não estiverem) + `CompanyService` com `sectorCode: "BPO"` e `responsibleUserId` = analista da carteira — dá visibilidade imediata de "quem cuida de quem".
- Criar o Kanban ("Pipeline") de tarefas internas do BPO — mesmo mecanismo genérico usado por outros setores hoje, com colunas ao gosto do setor (ex.: A fazer / Em andamento / Aguardando cliente / Feito, espelhando as tags que já usam no ClickUp).
- Ativar Transferências (Handoff) entre BPO e Fiscal/Contábil, já com @menção pra avisar a pessoa certa — resolve diretamente a queixa "handoff hoje é implícito, por e-mail, sem processo formal".
- 16º modelo de texto em Transferências: "Fechamento mensal BPO → Fiscal/Contábil" (item 6 da seção 4).
- RBAC: **sem permissão nova** — `SECTOR_ADMIN`/`SECTOR_USER` padrão já bastam. BPO vê só o próprio setor; coordenação (Amanda) não recebe visão cross-analista especial (decisão confirmada, pergunta 5).
- **Nada disso exige schema novo ou migration** — é rollout de um setor novo usando a fundação que já existe.

**Fase 2 — Motor de recorrência sub-mensal**
- Extensão do `RecurringObligation` pra suportar `frequency: DAILY | WEEKLY | BIWEEKLY | MONTHLY` (hoje só mensal) — mata a dor nº2 do setor (recriação manual de tarefa por competência).
- Consequência direta: o calendário de vencimento por cliente passa a existir de fato (é o próprio `dayOfMonth`/frequência cadastrados), sem precisar de tela nova separada.
- **Emissão de Notas e CT-e entra aqui como opção (a)**: mais um tipo de item recorrente/checklist dentro do motor de recorrência — controle interno de "nota emitida / pendente", sem chamar API externa de emissão (opção (b), integração real, fica descartada por ora — ver seção 7, pergunta 6, revisitar só se aparecer necessidade concreta).

**Fase 3 — Controle de acesso bancário**
- `CustomField` "Status de acesso bancário" (SELECT) na Empresa, escopado ao setor BPO — resolve a dor nº1 (estado atual). Se o setor quiser histórico de mudança (não só o estado atual), decidir se vale um log dedicado ou se o Audit Log genérico já basta.

**Fase 4 — Dashboard financeiro**
- Entra no escopo desta leva de fases (confirmado, pergunta 4) — módulo novo de métricas/relatórios por cliente e consolidado, mesmo tratando-se de tela nova de verdade (não reaproveita nada existente 1:1, ver item 4 da seção 4).

**Fase 5 — Telas preparatórias para integração Omie (sem integração de verdade ainda)**
- Confirmado (pergunta 3): a integração real com Omie **fica como iniciativa futura/possível**, não entra nesta leva. Mas o usuário pediu que as **telas que dependeriam dessa integração sejam construídas agora** (ex.: onde ficaria o status de sincronização por cliente, campos que hoje são digitados 2x) — servem de base pra decisão posterior sobre implementar ou não a integração de verdade, sem acoplar a UI a uma API real ainda (dados manuais/mockados nesta fase).

## 6. Pendências do setor — status

Todas as pendências levantadas na versão anterior deste documento (composição da equipe, canal de entrada de demanda, tempo médio dos processos, o que deve ser mantido/substituído, metas, comunicação com outros setores, dado restrito x compartilhado, maior problema percebido) foram **confirmadas como OK pelo usuário** — não bloqueiam mais o desenho. Mantido só como registro histórico do que foi perguntado originalmente; não é necessário voltar à coordenação do BPO por causa delas.

## 7. Perguntas em aberto — todas respondidas em 2026-07-22

1. ~~Quer que eu já leve essas pendências pra Amanda/coordenação?~~ — resolvida, pendências já confirmadas.
2. ~~Fase 1 validada como ponto de partida?~~ — **sim, validada**, sem nada específico de comunicação interna faltando.
3. ~~Integração com Omie: escopo deste módulo ou futura?~~ — **iniciativa futura/possível**. Decisão: construir agora as **telas** que dependeriam dessa integração (sem integração real), pra decidir depois se implementa de fato → Fase 5 revisada.
4. ~~Dashboard financeiro: nesta fase ou depois?~~ — **entra nesta leva de fases** → virou Fase 4.
5. ~~RBAC — coordenação precisa de permissão extra?~~ — **não**. BPO vê só o próprio setor; sem visão cross-analista para a coordenação.
6. ~~Emissão de Notas e CT-e — (a) checklist interno ou (b) integração real?~~ — **(a) checklist/controle de tarefa recorrente** dentro da Fase 2 (motor de recorrência). Opção (b) (integração real com API de NFe/CT-e) fica descartada por ora, revisitar só se surgir necessidade concreta.

## 8. Próximos passos

1. ~~Confirmar ordem de fases da seção 5~~ — feito, fases 1-5 fechadas (ver seção 5 revisada).
2. ~~Responder pergunta 6~~ — feito, opção (a).
3. ~~Desenho técnico da Fase 1 em detalhe~~ — feito, ver seção 9. Ainda sem implementar nada — aguardando validação do desenho.

## 9. Desenho técnico — Fase 1 (comunicação e tarefas internas)

Confirmado por leitura direta do código: os quatro pontos da Fase 1 são **100% configuração via UI já existente**, sem migration, sem schema novo, sem tela nova. Nenhum dos passos abaixo altera código — exceto o passo 4 (16º modelo de texto), que é a única edição de arquivo desta fase.

### 9.1 Criar o Sector "BPO Financeiro"
- `Sector` é tabela normal por tenant (`prisma/schema.prisma:421`, `@@unique([tenantId, code])`), não enum fixo — Fiscal/Contábil/DP são dados de tenant, não algo hardcoded.
- Criar em `/admin/setores/novo` (`src/app/(app)/admin/setores/novo/page.tsx`). O `code` sai de slug automático do `label` digitado (ex. label "BPO Financeiro" → code `bpo-financeiro`) via `slugify` em `actions.ts:12`.
- Exige `isFullWrite(ctx.role)` — só `SUPER_ADMIN`/`ADMIN` criam setor. Ação: `criarSetor` (`actions.ts:22`).
- Depois de criado, atribuir os analistas ao setor via `UserSector` (tela de usuário/permissões — fora do escopo já mapeado aqui, mas é o mesmo fluxo usado pra vincular gente a Fiscal/Contábil hoje).

### 9.2 Cadastrar os 25+ clientes com CompanyService no setor BPO
- Não tem campo de setor no cadastro inicial da empresa — é sempre pós-cadastro, na ficha da empresa (`src/components/empresas/ServicesSection.tsx`), card "Serviços contratados".
- Por empresa: "Adicionar setor…" → seleciona "BPO Financeiro" (`addAction`) → linha nova de `CompanyService` com `sectorCode: "bpo-financeiro"` → `<Select>` na própria linha atribui `responsibleUserId` = analista da carteira (`assignAction`).
- Só quem tem `canManageSector` no setor BPO vê a opção de gerenciar essa linha (`manageableSectors`).
- Trabalho operacional, não técnico: repetir isso pras 25+ empresas-cliente (ou já existirem como `Company` — se não existirem, cadastrar primeiro).

### 9.3 Kanban de tarefas internas do BPO
- `Pipeline`/`PipelineStage` também não são seed — criados pela própria UI de usuário (não admin) em `/kanban`, ação `criarPipeline` (`src/app/(app)/kanban/actions.ts:12`).
- Formulário pede `name` (ex. "Tarefas BPO Financeiro"), `sectorCode` = `bpo-financeiro`, e lista dinâmica de estágios com nome livre — sugestão: espelhar as tags do ClickUp hoje (A fazer / Em andamento / Aguardando cliente / Feito).
- Exige `canManageSector(ctx, "bpo-financeiro")` — SECTOR_ADMIN do BPO ou full-write. Ou seja: assim que o setor existir e a coordenadora (Amanda) for `SECTOR_ADMIN` dele, ela mesma cria o Kanban, sem precisar de dev.

### 9.4 Ativar Transferências (Handoff) BPO ↔ Fiscal/Contábil
- Não precisa de setup — Handoff já funciona entre quaisquer setores existentes no tenant (`scopedHandoffWhere` inclui setor de origem OU destino, `src/lib/auth/scope.ts`). Assim que o Sector BPO existir, ele já aparece como opção de origem/destino em `/transferencias/novo`.
- @menção já é autocomplete real (não texto livre) — `MentionTextarea.tsx` sugere qualquer usuário ativo do tenant (não restrito a setor), insere `@Nome Completo `, e `findMentionedUserIds` (`src/lib/handoffMentions.ts`) dispara notificação pro mencionado. Nenhum ajuste necessário aqui.

### 9.5 16º modelo de texto: "Fechamento mensal BPO → Fiscal/Contábil" (única edição de código da Fase 1)
- Modelos de texto **não são dado de tenant** — são array hardcoded `HANDOFF_TEMPLATES` em `src/lib/handoffTemplates.ts` (15 entradas hoje, linhas 43-794), sem tela de edição (confirmado por comentário no próprio arquivo).
- Adicionar 1 objeto novo ao array: `key` (ex. `"fechamento-mensal-bpo"`), `label` (ex. "Fechamento mensal BPO → Fiscal/Contábil"), `message` com placeholders `[EMPRESA]`/`[CNPJ]` (substituídos automaticamente pela empresa selecionada, via `renderHandoffTemplate`), `description`, e opcionalmente `sectorHints: ["fiscal", "contabil"]` pra já sugerir o setor de destino certo (`matchSectorsForTemplate`).
- Único artefato de código desta fase — um objeto a mais no array, sem migration, sem tela nova.

### Status — Fase 1 concluída em 2026-07-22
- Passos 1-4 (Sector `bpo`, CompanyService das 25+ empresas, vínculo `UserSector` dos analistas/Amanda) — feitos manualmente na UI pelo usuário.
- Passo 5 (16º modelo de texto) — implementado em `src/lib/handoffTemplates.ts` (`FECHAMENTO_MENSAL_BPO`), texto rascunhado a partir do processo descrito na seção 2 (entregas separadas por Contábil/Fiscal, situação de acesso bancário, entregas complementares).
- **Ajuste de escopo pedido pelo usuário durante a execução**: o Kanban do BPO não usa a tela genérica `/kanban` — ganhou módulo dedicado em "Meus Setores" → "BPO Financeiro" (ver seção 10, que também cobre a Fase 2).

### 9.6 Módulo dedicado "BPO Financeiro" em Meus Setores (ajuste pedido em 2026-07-22)
Decisão: reaproveitar o schema `Pipeline`/`PipelineStage`/`PipelineItem` por baixo, mas com rotas e UI **100% dedicadas**, fora das telas gerais (`/kanban`). "Meus Setores" só ganha módulos dedicados extensíveis por setor — por ora só o BPO usa esse padrão, os demais setores continuam nas telas gerais.

Implementado:
- `src/lib/module-catalog.ts` — módulo `bpo_tarefas` (setor `bpo`, `defaultEnabled: true`) — é o que faz "BPO Financeiro" aparecer em Meus Setores na sidebar (setor só aparece lá se tiver ao menos 1 módulo do catálogo habilitado, ver `getSectorsWithEnabledModules` em `src/lib/modules.ts`).
- `src/app/(app)/setor/[code]/[moduleCode]/page.tsx` — rota `bpo_tarefas` mapeada para `/bpo-financeiro`.
- `src/app/(app)/bpo-financeiro/` — rotas próprias espelhando 1:1 a estrutura de `/kanban/[id]/*` (board, item detalhado, modal interceptado, novo item), restritas a `sectorCode: "bpo"`. Se o setor tem só 1 pipeline (o esperado), `/bpo-financeiro` pula direto pro board.
- `src/components/kanban/KanbanBoard.tsx` ganhou prop `basePath` (antes o link do card era fixo em `/kanban/{id}`) — usado pelo board do BPO pra linkar pros próprios itens.
- `src/app/(app)/kanban/actions.ts` ganhou helper `boardPath()` — as server actions (mover, editar, excluir item etc.) são únicas para ambas as telas; só o redirect/revalidate final aponta pra `/bpo-financeiro/{id}` quando `sectorCode === "bpo"`, ou `/kanban/{id}` nos demais setores.
- Verificado com `tsc --noEmit`, `eslint` e `next build` (produção) — todas as rotas novas compilam.

## 10. Status — Fase 2 (motor de recorrência sub-mensal), implementada em 2026-07-22

- Schema: `RecurringObligation` ganhou `frequency` (enum `DAILY | WEEKLY | BIWEEKLY | MONTHLY`, default `MONTHLY`), `dayOfWeek` (1=segunda..7=domingo, usado em WEEKLY/BIWEEKLY), e `dayOfMonth` virou opcional (só obrigatório em MONTHLY). Migration `20260722130000_recurring_obligation_frequency` aplicada direto no banco de dev (`vps.41tech.cloud`) via `prisma db execute` — não usei `prisma migrate dev` porque havia **drift pré-existente** no banco (tabela `interview_scorecards` aplicada sem migration correspondente no repo, provavelmente de outra sessão/dev) que faria o Prisma pedir um `migrate reset` (apaga dados). Recomendo investigar esse drift separadamente antes de rodar `migrate dev` de novo nesse banco.
- Gerador (`src/lib/recurringObligations.ts`): agora resolve o período ativo por frequência — mensal (comportamento antigo, inalterado), diária (todo dia útil), semanal e quinzenal (por `dayOfWeek`, quinzenal usa paridade de semana contada a partir de uma época fixa). Dedup por período via `AlertDispatch` como antes, só que a chave/`sentOn` variam por frequência (dia/semana/mês) em vez de sempre mensal.
- **Emissão de Notas e CT-e (decisão da pergunta 6, opção a)**: ainda não tem tipo de item específico — por ora é só mais uma obrigação recorrente comum (ex. frequência mensal, `title: "Emissão de notas — [cliente]"`), sem checklist estruturado dedicado. Se quiser um checklist mais rico (múltiplos sub-itens por nota), é uma extensão futura.
- UI: `/admin/obrigacoes` — formulário (`AddObrigacaoForm`) ganhou seletor de frequência com campos condicionais (dia do mês vs. dia da semana); listagem mostra a frequência de cada obrigação.
- Verificado com `tsc --noEmit`, `eslint` e `next build`.
- **Nada commitado, nem PR aberto** — mudanças só no working tree local. Banco de dev já tem a coluna nova aplicada (independe de commit).

### Pendente
- Escopo de Notas/CT-e como checklist estruturado (se quiser ir além de "obrigação recorrente comum").
- Drift do banco (`interview_scorecards`) — investigar com quem aplicou antes de rodar `migrate dev` de novo nesse ambiente.
- Fases 3 (acesso bancário), 4 (dashboard financeiro) e 5 (telas preparatórias Omie) seguem não iniciadas.

## 11. Reformulação do gerenciamento de tarefas (referência ClickUp), 2026-07-22

Fora do escopo das fases do BPO, mas afeta diretamente o módulo: o usuário pediu uma reformulação geral de como tarefas funcionam no Connect, usando o ClickUp como referência de comportamento (não de implementação). Resumo do que mudou — cobre inclusive o board do BPO (`/bpo-financeiro`), já que reaproveita a mesma engine `Pipeline`/`PipelineItem`:

- **Tarefa como entidade central**: `PipelineItem` ganhou `title` próprio (opcional) e `parentItemId` (subtarefa — 1 nível), independente de precisar de uma Company/Person "de verdade" pra existir.
- **Subtarefas**: reaproveitam o próprio `PipelineItem` — ganham status, prioridade, prazo, responsável, comentários e anexos de graça.
- **Checklist**: modelo novo `ChecklistItem`, flat, por item.
- **Histórico completo**: `Activity` cobre agora criação, prioridade, prazo, descrição, responsável, etiqueta, checklist, subtarefa, conclusão/reabertura e apontamento de tempo (antes só cobria mudança de estágio e nota).
- **Comentários avançados**: responder a comentário específico, editar/excluir, @menção (reaproveita `MentionTextarea`/`findMentionedUserIds` de Transferências), notificação a mencionados/interessados.
- **Participante/observador**: `PipelineItemWatcher`, distinto de responsável.
- **Views e filtros**: toggle Quadro/Lista (`BoardView`/`TaskListView`), filtro por responsável (incl. "sem responsável"), criador, etiqueta, prioridade, prazo, busca textual — tudo client-side sobre os dados já carregados.
- **Busca global**: `/api/search` e `GlobalSearch` ganharam categoria "Tarefas".
- **Conclusão/reabertura explícita**: botão dedicado (`CompletionBanner`), continua movendo pro estágio terminal por baixo, mas com evento de histórico próprio e banner "concluída por X em Y".
- **Descrição rica**: `DescriptionEditor` passou a usar o `RichTextEditor` (Tiptap) que já existia no projeto (módulo de Documentos para Cliente) — negrito, títulos, listas, sanitizado no servidor.
- **Estimativa e tempo**: `estimateMinutes` no item + `TimeEntry` (apontamento manual por usuário, sem cronômetro ao vivo).
- **Duplicar Pipeline**: `duplicarPipeline` clona um Pipeline inteiro (estágios, tarefas, subtarefas, checklist, tags) pra uma Company/Person de destino diferente — prazos e responsáveis não são copiados. Botão "Duplicar" no header do board.

Todas as migrations (`20260722140000` histórico, `20260722150000` subtarefas/checklist, `20260722160000` comentários/participantes, `20260722170000` conclusão/tempo) aplicadas no banco de dev via `db execute` + `migrate resolve` (mesmo procedimento das fases do BPO, por causa do drift do `interview_scorecards`). Verificado com `tsc`, `eslint` e `next build` a cada etapa.

### Fase B/C — tabela de tarefas + modal redesenhado (referência prints ClickUp), 2026-07-22
- **Lista como padrão**: `BoardView` abre em modo Lista, Quadro é secundário (toggle invertido).
- **Status editável inline** na lista, **"+ Adicionar Tarefa"** por grupo, **grupos colapsáveis**, **prioridade por responsável** (`PipelineItemAssignee.priority`, seletor no avatar), tag ao lado do nome, **prazo com recorrência** (`PipelineItem.recurring`/`recurrenceFrequency`, reaproveita o enum `RecurringFrequency`).
- **Criação sem exigir empresa**: `entityType`/`entityId` do `PipelineItem` viraram opcionais (`title` obrigatório quando não há entidade) — `criarTarefaRapida` cria só com o nome.
- **Modal bem mais largo** (94vw/1400px), **título grande**, **`TaskFieldsPanel`** (Status/Responsáveis/Participantes/Datas+recorrência/Prioridade/Estimativa/Rastrear tempo com cronômetro ao vivo/Etiquetas, com "Recolher campos vazios").
- **Descrição → botões** (não formulário sempre aberto): Adicionar subtarefa / Vincular itens ou dependências (`PipelineItemLink`, novo) / Criar checklist / Anexar arquivo.
- **Chat invertido** (mais recente embaixo, perto do input), busca no chat, anexo de arquivo e menção de tarefa (`[texto](href)`) direto no composer.
- Reuniões removidas do detalhe do Kanban (ficam só na Agenda e em Vagas/Candidaturas, que usam `MeetingsSection` de forma independente). `CardActionBar.tsx` (obsoleto) removido.
- Migration `20260722190000_fase_b_c_task_fields`.

### Fase D — Espaço → Pasta → Lista + remoção do menu genérico, 2026-07-22
- **Espaço ≠ Setor**: `Space` é entidade nova, N por setor (ex. setor `bpo` pode ter espaços "BLD", "BPO" — nomenclatura real usada pelo setor hoje). `Folder` é opcional, sempre dentro de um Space. Toda Lista (`Pipeline`) agora tem `spaceId` obrigatório + `folderId` opcional.
- Backfill automático: todo Pipeline pré-existente (de qualquer setor) ganhou um Space padrão (nome = code do setor) — sem perda de dado.
- `/bpo-financeiro` passou a navegar por Espaço → Pasta → Lista (ao invés de listar Pipelines direto). Padrão genérico equivalente criado para os demais setores em `/setor/[code]/espacos/[spaceId]` e `/setor/[code]/pastas/[folderId]`, com o hub do setor (`/setor/[code]`) ganhando seção "Espaços".
- **Aba "Kanban" removida do menu geral** — cada setor acessa suas Listas pelo próprio hub (`/setor/[code]`) ou, no caso do BPO, pelo card do módulo dedicado. Rotas `/kanban`, `/kanban/novo`, `/kanban/[id]` continuam funcionando (só não tem mais link direto no menu).
- "Timeline de movimentação" removida de todo o Connect (não só do BPO).
- "Nova lista": modal com nome obrigatório + "+ descrição" opcional (`criarListaSimples`, estágios padrão A Fazer/Em Andamento/Aguardando Cliente/Concluído, `entityType: COMPANY` por padrão).
- Migrations `20260722180000_spaces_and_folders`, `20260722181000_pipeline_description`, `20260722182000_pipeline_color_and_dates`.

### Fase E — Documentos/Canvas, 2026-07-22
- **`CanvasPage`**: página em branco (não upload de arquivo) via `RichTextEditor`, sempre vinculada a uma tarefa (`pipelineItemId` obrigatório) — sanitizada com a mesma allowlist da descrição/Documentos para Cliente.
- Na tarefa: botão "Criar documento" (mesmo padrão de botão-vira-seção das outras — Subtarefa/Vincular/Checklist/Anexar), lista + editor inline expansível por documento.
- **Agregação no Espaço e na Pasta**: seção "Documentos" mostrando todos os canvases das Listas daquele Espaço/Pasta, layout ícone | nome | "• em {Tarefa X}" (mais apagado) — implementada em `src/lib/canvasAggregation.ts` (`getSpaceDocuments`/`getFolderDocuments`), reaproveitada nas 4 páginas de Espaço/Pasta (BPO + genérico).
- Migration `20260722200000_canvas_pages`.

### Status geral do redesenho de tarefas (fases A-E): **completo**. Verificado com `tsc --noEmit`, `eslint` e `next build` a cada etapa. Nada testado no navegador (sem credenciais de login disponíveis nesta sessão) — recomendo teste manual antes de considerar pronto pra produção. Nada commitado nem em PR.

## 12. Processo "Implantação - Cliente Novo" (BPO), populado em 2026-07-22

Adaptação do template de implantação de cliente novo (originalmente escrito pra ClickUp) pro Connect, usando a engine de tarefas reformulada na seção 11 — **não** foi colocado dentro do board genérico "Tarefas do BPO" (`bpo_tarefas`), e sim como um **Pipeline próprio** no mesmo setor `bpo`, acessível a partir de `/bpo-financeiro` (a home do módulo lista os pipelines quando há mais de um).

### O que foi criado
- Pipeline **"Implantação - Cliente Novo"** (setor `bpo`, `entityType: COMPANY`), com 4 estágios: A Fazer / Em Andamento / Aguardando Cliente / Concluído (último terminal).
- **17 tarefas principais** (uma por "Tarefa X.Y" ou módulo do documento original), cada uma marcada com uma tag de fase (`Fase 1 · Comercial` até `Fase 9 · Encerramento`) — dá pra filtrar por fase direto no board (filtro de etiqueta já existe, seção 11).
- **112 subtarefas** (as "Subtarefas" do documento original), cada uma como subtarefa de verdade (`parentItemId`), não checklist — porque no ClickUp original cada subtarefa deveria ter status/responsável/prioridade/data própria, e isso é exatamente o que o modelo de subtarefa do Connect oferece.
- Dependências entre fases (ex. "só iniciar implantação após contrato assinado") registradas na **descrição** das tarefas relevantes (1.1 e 4.3) — não existe um campo de "dependência formal" bloqueante no Connect hoje, então ficou como texto/instrução.
- Empresa placeholder **"Template BPO — Implantação de Cliente"** (status `INACTIVE`) — necessária porque todo `PipelineItem` exige uma Company/Person real vinculada; ao duplicar (ver abaixo), o clone inteiro é reapontado pra Company real do cliente.

### Campos personalizados do ClickUp — mapeamento pro Connect
Não recriamos campos custom 1:1 porque `CustomField` no Connect só suporta `entityType: COMPANY | PERSON`, não `PIPELINE_ITEM` — mudar isso seria alteração de schema mais ampla, fora do escopo pedido. Mapeamento adotado:

| Campo ClickUp | Onde fica no Connect |
|---|---|
| Cliente | A própria Company vinculada ao item (`entityId`) |
| CNPJ | Já existe na ficha da Company ("Ver ficha completa") |
| Responsável Interno | Campo "Responsáveis" (assignee) do item |
| Responsável Cliente | Sem campo dedicado — registrar na descrição rica da tarefa "Criar Projeto de Implantação" (nota deixada no próprio item) |
| ERP | Idem — descrição da tarefa "Criar Projeto de Implantação" (hoje sempre Omie) |
| Data de Início / Prevista | Prazo (`dueDate`) das tarefas relevantes de cada fase |
| Data Go Live | `dueDate` da tarefa "Entrada em Produção" (Fase 8) |
| Status da Implantação (%) | **Automático** — já é a barra de progresso de subtarefas (concluídas/total) que a tela de detalhe mostra pra qualquer tarefa com subtarefas |
| Complexidade | Sem campo dedicado — sugestão: usar a Prioridade (Normal/Alta/Urgente) como proxy, ou registrar na descrição |
| Tipo de Projeto | Sem campo dedicado — registrar na descrição (hoje só existe este tipo de projeto) |
| Observações | Descrição rica do item, ou comentários |

### Status e automações — deixado documentado, não configurado (pedido explícito do usuário)
- **Status**: os 4 estágios acima (A Fazer/Em Andamento/Aguardando Cliente/Concluído) são o padrão genérico do Connect — se quiser estágios mais específicos por fase, é só editar o Pipeline (não precisa de dev).
- **Automações sugeridas no documento original** (criar tarefa seguinte automaticamente, mover de fase ao concluir, notificar em "Aguardando Cliente", concluir tarefa principal quando todas as subtarefas terminarem, atualizar progresso automaticamente, lembretes de vencidas, alertar gestor em atraso > 3 dias) — **nenhuma foi implementada**. O Connect não tem motor de automação condicional genérico hoje (o que existe é o motor de alertas fixo em `src/lib/alerts.ts` e o de obrigações recorrentes). Implementar isso seria um projeto à parte — fica registrado aqui como pedido em aberto, não como pendência da Fase de tarefas.

### Duplicar por cliente novo
Feature nova: **"Duplicar Pipeline"** (`duplicarPipeline` em `src/app/(app)/kanban/actions.ts`, botão no header do board). Clona o Pipeline inteiro — estágios, as 17 tarefas, as 112 subtarefas, tags e checklist — pra uma Company de destino diferente, com nome novo. Prazos e responsáveis **não** são copiados (ficam em branco na cópia, já que são específicos de cada execução real). Fluxo pretendido: manter "Implantação - Cliente Novo" intocado como template, e a cada cliente novo, abrir o template → Duplicar → escolher a Company do cliente real → renomear.

### Verificação
Populado via script one-off (`npx tsx`, mesmo padrão de `prisma/seed.ts`), rodando contra o banco de dev. Não passa por commit (é dado, não código). `tsc`/`eslint`/`next build` já cobriram o código da feature "Duplicar Pipeline" na seção 11.

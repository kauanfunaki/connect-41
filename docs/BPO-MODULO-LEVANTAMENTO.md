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

### Resumo — nada bloqueia começar a Fase 1 hoje
Passos 1-4 (setor, serviços, kanban, handoff) são inteiramente operacionais — dá pra rodar em produção assim que você validar. Passo 5 (16º modelo de texto) é o único PR necessário nesta fase, e é pequeno (edição de um array de constantes).

**Pendente antes de eu abrir o PR do passo 5**: confirmar o texto exato do modelo (o que deve constar no "Fechamento mensal BPO → Fiscal/Contábil" — quais itens de entrega: extratos conciliados, XML/relatório de nota, outros?). Posso rascunhar um texto padrão a partir do que já sei do processo (seção 2) e você ajusta, ou prefere ditar o texto você mesmo?

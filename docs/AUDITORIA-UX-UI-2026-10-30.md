# Auditoria de UX/UI — Connect 41 (app inteiro, 30/10/2026)

> Escopo: `src/` inteiro — 1.064 arquivos `.tsx`, 296 páginas (426 arquivos e 86 páginas
> criados depois da última auditoria, de 30/09). Método: medição por script sobre o código
> + leitura do código em 7 frentes paralelas (fundação/shell, Fiscal/Contábil/DRE, BPO e
> Gestão, Pessoas/DP/Recrutamento, Admin/Empresas/Societário, Kanban/Chamados/Conversas,
> portal e telas públicas), com as skills `frontend-design`, `ui-ux-pro-max` e
> `uiux-design-review`, contra as 5 diretrizes do Kauan. Os achados graves foram
> reconferidos no código antes de entrar aqui. Nenhum arquivo foi alterado.
> Antecessores: `LEVANTAMENTO-DESIGN-2026-07-30.md`, `PLANO-CORRECAO-DESIGN.md` e a
> auditoria de design de 14–15/10 (PRs #126–#139).

---

## 1. Resumo executivo

**A camada visual está resolvida; o que falta agora é comportamento.** As campanhas de
julho a outubro funcionaram: o app dobrou de tamanho e a aderência ao Perímetro subiu em
vez de cair. Tipografia, cor, raio, sombra, cabeçalho de página, cartão e tabela seguem o
sistema quase sem exceção — inclusive no código novo.

Os problemas que restam são de outra natureza, e é por isso que grep não os pega:

1. **Ação com consequência sem confirmação** — contratar um candidato, finalizar um
   desligamento, emitir certidão cobrada, encerrar chamado com a seta do teclado.
2. **Sucesso falso ou silencioso** — ações que recusam sem avisar e a tela diz
   "excluído"; mover cartão no Kanban sem tratar erro; baixa sem toast.
3. **Teclado preso em peças compartilhadas** — o menu "⋯" não recebe foco (e Inativar,
   Excluir etc. só existem lá); Esc num calendário dentro de um modal fecha o modal
   inteiro e perde o que foi digitado.
4. **Módulos novos que reinventaram peças** — Chamados, Ops, integração do GitHub,
   Certidões e as tabelas do motor fiscal não usam o casco, o "⋯" nem o "Filtros".

A boa notícia: **seis peças compartilhadas concentram metade dos achados**. Corrigidas
num PR só, consertam centenas de telas de uma vez (seção 4).

| Severidade | Achados confirmados |
|---|---|
| Crítico | 1 (seleção em massa do BPO age sobre contas escondidas) |
| Alto | 18 |
| Médio | ≈ 35 |
| Baixo | ≈ 40 |

(Médio e Baixo são aproximados: as frentes se sobrepõem em alguns padrões.)

---

## 2. Métricas — julho × outubro

| Medida | 30/07 | 30/10 | Leitura |
|---|---|---|---|
| Arquivos `.tsx` / páginas | 413 / 141 | 1.064 / 296 | app 2,5× maior |
| `text-[Npx]` cravado | 1.605 | **88** | todos em site/carrosséis de marketing, dentro de cenas `aria-hidden` |
| Uso de token de fonte | 192 | **3.124** | lint barra o px cravado |
| `<Button>` × `<button>` cru | 9 arq. × 331 | **1.035 × 189** | o cru que sobra é chip/controle de estado |
| `<Card>` × cartão à mão | 9 × 196 | **428 × 139** | |
| `PageHeader` | 18 arquivos | **208 usos** | só 20 `<h1>` à mão |
| `EmptyState` | 53 arquivos | **210 usos** | |
| `loading.tsx` / `error.tsx` | 26 / 2 | **64 / 9** | |
| Cor crua do Tailwind (`gray-500`…) | 0 | **0** | |
| `confirm()`/`alert()` nativo | ~25 | **0** | |
| `onClick` em `div/span/li/tr` | 1 | 16 | 4 em código novo |
| `outline-none` | — | 33 | quase todos com substituto; `Calendario` (5) conferido |

O índice de px cravado por arquivo, que em julho ia de 1,6 (Empresas) a 32 (BPO manual),
hoje é **0,0 em todas as rotas internas**. A disciplina de sistema virou hábito — o que
sobrou não é visual.

---

## 3. Pontos fortes (manter como modelo)

- **`useDialog`** — foco preso, foco inicial, retorno de foco e trava de rolagem em Modal,
  SlideOver, ConfirmDialog e alerta de reunião.
- **`GlobalSearch`** — combobox de verdade (`aria-activedescendant`, grupos, Ctrl+K).
- **Calendário, `CampoData`, `Select`** — setas na grade, `aria-current="date"`, feriado
  dito no `aria-label`.
- **`ExcluirCadastro`** — o modelo de ação destrutiva: prévia do que sai, nome digitado
  quando há histórico, relatório do que ficou na auditoria.
- **Candidatura em passos (carreiras)** — `aria-current="step"`, foco no título do passo,
  erro junto do campo com `aria-invalid`/`aria-describedby`, foco no primeiro erro,
  revisão com "Editar" por bloco, botões de 48px, skip link.
- **Motor fiscal** — idempotência, progresso real ("Apurando N de M"), retomar de onde
  parou, consulta pausada com a aba oculta.
- **Lote do BPO** — prévia honesta de quem fica de fora e por quê; botão diz o que faz
  ("Pagar 12 contas · R$ X").
- **Kanban do Tech (`VisoesTech`)** e **funil de Recrutamento** — mudar situação sem
  arrastar (alternativa de teclado), otimista com volta quando o servidor recusa, toast.
- **Cor nunca sozinha** — `Selo`, `StatusDot`, DRE com sinal, ▲▼ com texto, "Atrasado"
  escrito. Nenhuma área violou.
- **Arquivos** — `FileDropzone` com progresso por arquivo, reenvio que pula o que já subiu.

---

## 4. Onda 1 — peças compartilhadas (maior alavanca)

Um PR, ~9 arquivos de `ui/`/`shell/`. Cada linha corrige todas as telas que usam a peça.

| # | Sev. | Peça | Problema | Correção | Alcance |
|---|---|---|---|---|---|
| C1 | **Alto** | `ui/Popover.tsx`, `ui/PainelFlutuante.tsx` | O painel vai para o fim do `body` e o foco não entra. Por teclado, o "⋯" abre e o Tab pula para a página: **Inativar, Excluir, Revogar ficam inalcançáveis** (regra de 30/09 manda essas ações para o "⋯"). Esc não devolve o foco ao gatilho. | Focar o primeiro item ao abrir; setas/Tab dentro; Esc e clique-fora devolvem o foco ao gatilho (o `PainelDoItem` já faz). | 36 arquivos com `MenuDeMaisAcoes` + 12 com `Popover`, sino, mini-calendário |
| C2 | **Alto** | `ui/useDialog.ts:78` | Esc fecha o diálogo sem olhar `defaultPrevented`, e o ouvinte dele roda antes do painel aberto depois. Esc para fechar um calendário/lista **dentro** de Modal/SlideOver fecha o formulário e perde o digitado. Inclui o modal da tarefa do Kanban. | Ignorar o Esc quando o alvo está num painel flutuante aberto (`[data-c41-flutuante]`), ou painéis escutando na captura. | `CampoData`, `CampoMes`, `SearchableSelect` (31 arq.), `Popover`, `Dropdown` dentro de diálogo |
| C3 | **Alto** | `ui/DeleteButton.tsx:34` + actions `Promise<void>` | A ação recusa com `return` (sem permissão, documento já enviado, somente leitura) e o botão trata `undefined` como sucesso: **toast "excluído" sem ter excluído**. Mesma família: `transferirModulo`, `ligarModuloAoSetor`, `alternarModulo`, `definirPapelDoRemetente`, vínculos de atendimento, tags do candidato, remover desligamento. | Toda saída antecipada devolve `{ error }`; o `DeleteButton` só dá sucesso com `{ ok: true }`. Vale um teste que proíba `Promise<void>` em action ligada a botão de confirmação. | 6+ actions; padrão para as novas |
| C4 | Médio | `ui/ConfirmDialog.tsx:78` | O foco inicial vai para o botão de confirmar mesmo quando `destructive`. Um Enter apressado exclui. | Com `destructive`, focar o Cancelar. | toda exclusão do app |
| C5 | Médio | `ui/CampoForm.tsx:42` | Erro e ajuda são `<p>` sem `id`; o campo não recebe `aria-describedby` nem `aria-invalid`. Leitor de tela não lê o erro ao focar. | Gerar `${id}-ajuda`/`${id}-erro` e injetar no controle. | 167 arquivos |
| C6 | Médio | `ui/Toast.tsx:52` | Todo aviso some em 5 s, **inclusive erro**, sem pausar no hover/foco. | Erro fica até fechar; pausa no hover/foco. | app inteiro |
| C7 | Médio | `shell/AppShell.tsx`, `portal/PortalShell.tsx` | Sem "Pular para o conteúdo": antes do `<main>` o Tab passa pela busca, 15–25 itens de menu e 6 controles do topo. Carreiras já tem. | Link `sr-only focus:not-sr-only` para `#conteudo` nos dois cascos. | todas as telas |
| C8 | Médio | `shared/SearchableSelect.tsx` | "Limpar" é `span role=button` dentro de `<button>`; sem `aria-activedescendant`; lista `absolute` cortada por contêiner; Esc perde o foco. Dois seletores com comportamentos diferentes no app. | Migrar os 31 usos para `ui/Select` (que já faz tudo certo). | 31 arquivos |
| C9 | Baixo | `ui/Tabs.tsx:29`, `configuracoes/TemaSelector.tsx:75` | `role=tab`/`radio` sem setas e sem tabindex móvel; no TemaSelector seleção e foco têm o mesmo anel. | Tabindex móvel com ←/→; seleção só pela borda. | 6 abas, 4 grupos de rádio |

Junto, no mesmo PR (pequenos, mesma família):
- `shell/ProfileMenu.tsx` — "Sua conta" navega sem `close()`; o menu fica aberto na tela nova.
- `shell/NotificationBell.tsx:143` — remover/arquivar otimista sem `catch` nem desfazer.
- `shell/ChatDeIA.tsx:914` — resposta e "pensando" sem `role="log" aria-live`; erro só em vermelho; no celular cobre a tela sem prender o foco.
- `shell/AppShell.tsx:770` — no celular os controles do topo somam ~270px fixos; em 360–390px a lupa invade o seletor de tema (**conta feita no código, confirmar no navegador**). Abaixo de `sm`, Tema e Configurações vão para o menu do perfil.
- `agenda/TimeGrid.tsx:216` — um botão "Criar reunião" por hora por dia: 70–100 paradas de Tab. `tabIndex={-1}` nos horários.

---

## 5. Onda 2 — ações com consequência (bugs de comportamento)

| # | Sev. | Onde | Problema | Correção |
|---|---|---|---|---|
| B1 | **Crítico** | `financeiro/AcoesEmLoteDasContas.tsx:16` + `ContasTable.tsx:200` | As caixas dos cartões de celular (só escondidas por `md:hidden`) e as da tabela têm o mesmo `form`. No desktop o contador mostra o dobro, a caixa do cabeçalho nunca fica marcada e **"Marcar todas" marca também as contas que o funil escondeu** — "Pagar/Conferir/Alterar marcadas" age sobre elas. "Conferir" age direto, sem janela nem desfazer. | Contar/marcar só caixas visíveis e não filtradas, ou renderizar a caixa do cartão sem `form` no desktop. Usar `useLinhasVisiveis` (sobra 3 do plano de 30/09). |
| B2 | **Alto** | `vagas/[id]/actions.ts:259` + `RecruitmentFunnel.tsx:165` | Soltar em "Contratado" contrata e promove a pessoa a colaborador **sem confirmar**, e o cartão trava (sem arraste, select nem "⋯"). O nome leva a `/candidatos/{id}`, que filtra candidato e dá 404. | Confirmação antes de contratar, "Desfazer contratação", link para `/pessoas/{id}` quando já é colaborador. |
| B3 | **Alto** | `pessoas/DesligamentoRow.tsx:80` + `desligamento/actions.ts:86` | Situação "Finalizado" + "Atualizar" marca a pessoa como DESLIGADO e grava a demissão sem confirmar; voltar a situação não desfaz. | Confirmar ao finalizar; reverter o vínculo quando sair de "Finalizado". |
| B4 | **Alto** | `societario/BotoesDaCertidao.tsx:17` | "Emitir agora" é consulta **cobrada** (InfoSimples), aparece até 5× por empresa na carteira inteira, é ghost e dispara num clique. O custo só está no `title`. Para leitor de tela são dezenas de botões com o mesmo nome. | `ConfirmDialog` com empresa, tipo e custo; `aria-label` com empresa e tipo. |
| B5 | **Alto** | `kanban/KanbanBoard.tsx:50` | `useState(initialItems)` só lê na montagem: busca e filtros não mudam o quadro, e mudança de outra pessoa só aparece ao remontar. | Derivar da prop e sobrepor o movimento com `useOptimistic`. |
| B6 | **Alto** | `KanbanBoard.tsx:56`, `TaskListView.tsx:757-778`, `TaskFieldsPanel.tsx:145` (+ Checklist, Subtasks, Tags, Assignees) | Mover/reordenar/concluir é "dispara e esquece": a promise nem volta ao `startTransition`; falha é silenciosa e o cartão fica na coluna errada. | Padrão do `VisoesTech`: `await`, toast, devolver o cartão quando falhar. |
| B7 | **Alto** | `chamados/DetalheDoChamado.tsx:77` | `<Select>` de situação grava a cada mudança e inclui Resolvido/Cancelado. No Chrome/Windows, as setas num select fechado já disparam a mudança: navegar pelo teclado **encerra o chamado**. | `Dropdown` com itens; confirmar estados finais. |
| B8 | **Alto** | `lancamentos/dominio/page.tsx:186` | O `<a download>` registra a exportação mas a tela não atualiza (botões do 1º download continuam, "Última planilha" não aparece). "Mês inteiro de novo", que **duplica na Domínio**, não confirma. | Botão cliente com `router.refresh()`; `useConfirm` no "de novo". |
| B9 | **Alto** | `dre/MoverCategoria.tsx:258` | `onBlur`/`onKeyDown` passados ao `Select` não disparam (documentado no próprio `Select.tsx:95`): o "Mover" não fecha por Esc nem saindo do foco; a escolha grava na hora e o desfazer fica noutro painel. | `Popover` + `ItemDoMenu`, e "Desfazer" junto do "Movida". |
| B10 | **Alto** | `agenda/MeetingItem.tsx:127` | Popover da reunião `absolute` dentro de célula com `overflow-hidden` (`MonthGrid.tsx:96`, `AgendaCalendar.tsx:122`): Entrar/Editar/Excluir provavelmente cortados na visão Mês; sem Esc nem `aria-expanded`. **Confirmar no navegador.** | Migrar para `Popover`. |
| B11 | Médio | `pessoas/AddAfastamentoForm.tsx:35` (+6 `Add*Form` da ficha) | `<form action>` com campos não controlados: o React limpa o formulário quando a action termina, **inclusive com erro** — até 9 campos perdidos. | `onSubmit` + `startTransition`, como `DadosPessoaisDoCandidato`; erro em `Aviso` acima do rodapé. |
| B12 | Médio | `pessoas/FeriasRow.tsx:73` | A ficha nunca mostra início/retorno das férias e os campos abrem vazios, embora a action grave. | Mostrar "Gozo: dd/mm a dd/mm" e `defaultValue`. |
| B13 | Médio | `AdmissaoCard.tsx:121` | "Gerar novo link (invalida o atual)" sem confirmação (o mesmo gesto em Teste confirma). | `requestConfirm`. |
| B14 | Médio | `Conversa.tsx:107`, `ConversasLista.tsx:85`, `TriagemDaVaga.tsx:111` | Handler assíncrono sem `finally`: se a action lançar, a conversa/triagem fica travada até recarregar, sem mensagem. "Desfazer o vínculo" (perigoso) e "Reprocessar todas (N)" (gasta IA) sem confirmar. | `try/catch/finally` + `Aviso`; `useConfirm`. |
| B15 | Médio | `EscritasComuns.tsx:189` | "Desistir e apagar as partes" apaga no motor, é ghost e não confirma. | `useConfirm`, `variant="danger"`. |
| B16 | Médio | `admin/usuarios/page.tsx:155` | Seção "Atendimento" fica abaixo do Cancelar/Salvar mas grava na hora — Cancelar não desfaz, sem feedback. | Trazer para dentro do formulário ou separar com feedback próprio. |
| B17 | Médio | `app/(app)/not-found.tsx` | Sem permissão vira 404 "não existe ou foi removido" em 23 páginas de admin, robô e Radar. Quem recebe link não sabe que é acesso. | Tela "sem acesso" (ou texto "não existe ou você não tem acesso"). |

---

## 6. Onda 3 — padrões transversais (Hick, consistência, feedback)

**6.1 Ações de linha soltas em vez de botão + "⋯"** (regra de 30/09). A linha pendente da
conciliação chega a **7 botões** com dois primários (`TransacoesDaConta.tsx:391`); regras
de conciliação com Excluir vermelho em toda linha (`RegraDeConciliacao.tsx:459`); 5 tabelas
do motor fiscal (Operação, Entregas, Quarentena, Decisões, Pagamentos — este com "Aceitar"
primário em todas as linhas, `EscritasFechamento.tsx:55`); GitHub com 5 botões e dois
primários. → Ação sugerida em botão, o resto no `MenuDeMaisAcoes`.

**6.2 Módulos que reinventaram peças** — o achado de consistência mais visível:
- **Chamados** não importa `Selo`, `EmptyState`, `CampoForm`, `AbasDeLink`, `Pagination`,
  `AvatarImage`; toda situação tem a mesma pílula azul e toda prioridade o mesmo cinza
  (Urgente = Baixa); SLA estourado não aparece.
- **Ops** (`OpsCenter.tsx:236`) — histórico com tabela crua, filtros em grade e paginação própria.
- **GitHub / credenciais do Ops** (`GithubIntegration`, `OpsCredentialForm`, `OpsAdditionalKeys`) —
  rótulo à mão, erro em `<p>`, sem `loading`, "Revogar" colado no primário.
- **Certidões** — pílulas de recorte, tabela fora do casco, "Abrir" como link sublinhado.
- **Contábil** (`PendenciasContabeis.tsx`) — `Select` solto fora do "Filtros", paginação à mão.
- **Robô do Societário** — tabela fora do casco e o estado vazio mostra `docs/ROBO-DO-SOCIETARIO.md` ao usuário.
- **Tabela dinâmica** — `Campo` próprio em caixa alta, cabeçalho com o token errado.
- 5 cópias à mão do `CopyLinkButton` em Pessoas/Recrutamento; 9 rodapés de modal à mão no
  fiscal com o primário à esquerda (contra a regra).

**6.3 Dado cru do motor fiscal.** `TabelaLivre`/`BlocoLivre` em 11 lugares mostram chaves em
`SNAKE_CASE` e números sem formato pt-BR; a "Conferência dos pagamentos" corta em 200
linhas sem paginação numa fila de até 2.000. O Contábil já resolveu o mesmo problema no
`ListaDados` em 26/10 — replicar. Selos de cobertura mostram o nome da cor ("vermelho")
em vez do significado.

**6.4 Sucesso silencioso.** Baixa integral, edição de lançamento, conferir, pausar regra,
salvar integração do GitHub, marcar taxa como paga, salvar situação nas 7 linhas do DP.
→ `toast.success` com o mesmo verbo do botão.

**6.5 Erro sem anúncio.** ~20 arquivos do DP/Recrutamento mostram erro em
`<p className="text-danger">` sem `role="alert"`. → `Aviso` ou `erro` do `FormFooter`.
**Alto** no fechamento fiscal (`EscritasFechamento.tsx:108` e `:165`): o `CampoFiscal`
recebe dois filhos (campo + `<span>` de erro), o `isValidElement` falha, o `id` não é
injetado e o rótulo fica desligado do campo. → passar o erro pela prop `erro=`, que existe
desde 26/10.

**6.6 Texto cortado sem dica fora de tabela.** A `DicaFlutuante` só pega `.truncate`
sozinha dentro de tabela: cartão do Kanban, nome de arquivo/pasta (com `title="Abrir"`
que vira a dica errada), faixa do foco da empresa, adiantamentos, cartões, seletor de
pessoas. → `data-dica={nome}` ou `c41-cortavel`; no cartão do Kanban, `line-clamp-2`.

**6.7 Estado mostrado e editado ao mesmo tempo.** 7 linhas do DP mostram o `Selo` e um
`Select` + "Atualizar" sempre abertos — mudam e não salvam, Selo e Select divergem. →
"Editar situação" no "⋯".

---

## 7. Onda 4 — portal (APK) e telas públicas

Aqui celular e acessibilidade pesam de verdade (cliente, candidato, colaborador admitido).

| Sev. | Onde | Problema | Correção |
|---|---|---|---|
| **Alto** | `portal/CeciDoPortal.tsx:157` | No celular o chat abre em tela cheia mas não é diálogo: sem `role=dialog`, sem Esc, o fundo segue no Tab/TalkBack, foco não volta; fechar com 28px. | Padrão `useDialog`; fechar maior no celular. |
| **Alto** | `admissao/AdmissaoForm.tsx:111` | Seis documentos de até 10 MB num `fetch` só, com "Enviando…": minutos sem progresso no 4G; falha reenvia tudo. | `uploadComProgresso` por documento. |
| Médio | `ui/Input`, `Button`, `IconButton` no portal | 36px/32px/28px no APK; ações de linha com 4px entre ícones. | `max-lg:h-11` num contexto de toque (`data-toque` no casco do portal e das públicas). Desktop interno fica como está. |
| Médio | `CeciDoPortal.tsx:140` | Botão flutuante cobre o "Baixar" da última linha e a paginação. | `pb-24` no `<main>` com a Ceci ligada. |
| Médio | `entrada/CarrosselDeEntrada.tsx:27` | Avança a cada 6,5 s sem botão de pausar (WCAG 2.2.2); pontos com ~20px. | Copiar o "Pausar" do `CeciNosSetores`. |
| Médio | `CarrosselDeEntrada.tsx:93`, `MolduraDeEntrada.tsx:188` | Os **dois únicos textos abaixo de AA** do app: 11px `white/40` (~3,1:1) e `white/60` (~3,4:1) sobre o azul — o 2º é a primeira tela do APK. | `white/75`+. |
| Médio | `portal/redefinir-senha` | Link expirado só aparece depois de digitar as duas senhas, sem "pedir outro". | Conferir o token ao abrir; `TelaDeAvisoPublica` com "Pedir novo link". |
| Médio | `public/sw.js` + `portal/(area)/error.tsx` | Sem rede o APK mostra a página do Chrome; ação offline cai em "Algo deu errado". | Página offline em cache; mensagem de conexão quando `!navigator.onLine`. |
| Médio | `AdmissaoForm.tsx:146` | CPF, PIS, CEP, agência, conta sem `inputMode="numeric"` nem `autocomplete`; validação só no servidor, erro numa caixa geral. | `inputMode`, `autoComplete`, validação no campo. |
| Baixo | `login/page.tsx:79` | Login da equipe sem `loading` nem trava (clique duplo); o do portal tem. | `useFormStatus` + `loading`. |
| Baixo | `not-found.tsx:12` | "Ir para o início" manda candidato/visitante ao login da equipe. | Destino pelo prefixo da URL ou "Voltar". |
| Baixo | admissão, `d/`, `teste/`, `TelaDeAvisoPublica` | Raiz `div` sem `<main>` e `min-h-screen` (100vh) em vez de `dvh`. | `<main>` + `min-h-dvh`. |
| Baixo | `carreiras/41/ChipDeFiltro.tsx:60` | Folha de filtro no celular sem foco dentro; Tab sai com o painel aberto. | Focar a 1ª opção; fechar no `focusout`. |

---

## 8. Onde as diretrizes genéricas não se aplicam

O prompt das 5 diretrizes foi escrito sem conhecer o Connect. Onde ele conflita com decisão
já tomada e medida, **a decisão do projeto vence** — e a auditoria não reportou como defeito:

- **Alvo de 44×44px no desktop interno.** É sistema denso de uso diário com mouse;
  botões de 32px (barra) e 36px (formulário) são decisão de 30/09. Os 44px valem onde há
  toque: portal/APK, carreiras, admissão (seção 7).
- **Escala de 4/8px estrita.** O app usa meio-degrau (6px, 10px — `py-1.5`, `gap-2.5`) em
  ~1.500 lugares, sempre do Tailwind, nunca arbitrário (só 22 `p-[Npx]`). É ritmo de 2px
  coerente para UI densa; converter mudaria a aparência do app inteiro sem ganho.
- **"Body 16px".** O corpo de leitura é 15px (`text-body`) e o nível denso 13px
  (`text-ui`); só o campo é 16px (evita zoom do iOS). Medido e decidido em 31/07.
- **Tabela alinhada à esquerda.** Regra do Connect é centralizada (`.c41-tabela`), com as
  exceções da DRE e da árvore de empresas.
- **Rótulo em caixa alta** no painel do Filtros foi aprovado pelo Kauan.

---

## 9. Plano sugerido

| Onda | O quê | Tamanho | Risco |
|---|---|---|---|
| 1 | Peças compartilhadas C1–C9 + os 5 pequenos do shell | ~12 arquivos, 1 PR | baixo — comportamento de teclado/feedback, sem visual |
| 2 | B1 (crítico) primeiro, depois B2–B10, depois B11–B17 | 1 PR por área | médio — mexe em fluxo; B1, B2, B3, B5 pedem teste |
| 3 | Padrões 6.1–6.7, **um módulo por vez**: Chamados → motor fiscal → conciliação → Ops/GitHub → Certidões → DP | 1 PR por módulo | baixo |
| 4 | Portal/APK e públicas (seção 7) | 1–2 PRs | baixo |

**Guarda-corpo para tela nova** (para não reabrir esta lista daqui a um mês):
1. Action chamada por botão de confirmação devolve `{ ok } | { error }` — nunca `Promise<void>`.
2. Mudança de estado com consequência (contratar, finalizar, cobrar, encerrar) passa por
   `useConfirm` com a consequência escrita; o foco inicial é o Cancelar.
3. Mais de 2 ações por linha → botão + `MenuDeMaisAcoes`.
4. Todo envio: `loading` no botão, toast de sucesso com o verbo do botão, erro em `Aviso`.
5. Formulário que pode falhar não usa `<form action>` com campo não controlado.
6. `truncate` fora de tabela leva `data-dica`.
7. Antes de criar `Campo`, paginação, abas, selo ou copiar-link próprio, procurar em `ui/` e `shared/`.

---

## 10. Andamento

**30/10 — Onda 1 + B1 feitas** (branch `onda1-ux-pecas-compartilhadas`):

- **B1:** a seleção em massa conta e marca só as caixas visíveis; o contador acompanha o
  funil e a troca de largura; caixa do cabeçalho com estado intermediário; barra de
  seleção anunciada.
- **C2 (Esc):** pilha de camadas (`ui/camadas.ts`) — diálogo, painel flutuante e
  `Dropdown` entram nela, e o Esc fecha só o de cima; quem trata o Esc sozinho
  (`preventDefault`) é respeitado. Teste em `camadas.test.ts`.
- **C1 ("⋯"):** o `Popover` põe o foco no primeiro item, anda com ↑/↓/Home/End, fecha
  no Tab que sai da ponta e devolve o foco ao botão que abriu.
- **C3:** `useConfirm` mostra o `{ error }` que a ação devolve; as actions de módulo
  (mover, compartilhar, ativar), excluir documento, papel do atendente, tag do
  candidato e remover desligamento dizem o motivo da recusa. Tags desfazem a marca na
  tela quando o servidor recusa.
- **C4–C7, C9:** foco no Cancelar em confirmação destrutiva; `CampoForm` liga ajuda e
  erro ao campo (`aria-describedby`, `aria-invalid`); toast de erro fica 10 s e todos
  pausam com o ponteiro ou o foco; "Pular para o conteúdo" no app e no portal; abas e
  seletor de tema com setas e uma parada só no Tab (a escolha do tema deixou de usar o
  anel do foco).
- **C8:** `SearchableSelect` corrigido no lugar (não migrado): "Limpar" saiu de dentro
  do botão, a busca virou combobox com `aria-activedescendant`, Esc e escolha devolvem
  o foco ao campo. A migração dos 31 usos para `ui/Select` segue pendente.
- **Shell:** menu do perfil fecha ao navegar; sino desfaz e avisa quando remover/
  arquivar falha (e o Esc dele foi para a pilha); chat da Ceci em região viva com erro
  em `Aviso`; horários da agenda fora do Tab.

**Não feito nesta rodada:** topo do shell no celular (precisa de navegador para medir),
`MeetingItem` (B10) e as ondas 2 a 4.

## 11. Método e limites

- Medição por script em `src/**/*.tsx` (contagens textuais; ordem de grandeza confiável).
- Leitura de código em 7 frentes; os achados Crítico/Alto foram reconferidos no código
  (B1, B2, B4, B5, B6, C1, C2, C3, C4, C5 lidos diretamente nesta consolidação).
- **Sem verificação em navegador** (preferência do projeto). Dois achados dependem de
  layout real e estão marcados: B10 (popover cortado na agenda) e o topo do shell no celular.
- Não mede tempo de tarefa nem percepção do usuário — a próxima rodada útil é observar a
  equipe usando BPO, DP e Chamados.

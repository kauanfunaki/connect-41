# Fluxos dos setores

Documentação visual do que cada setor faz, e de como isso vira Connect.

Existe porque o protótipo do Marcos é esqueleto de tela, não descrição de
trabalho: ele mostra que existe uma tela de processos, não o que acontece dentro
de um processo. O fluxo do setor é a fonte; o protótipo é conferência.

## As duas frentes

Todo passo de um fluxo cai numa de duas frentes, e a diferença é o custo de
errar:

| Frente | O que é | Quando construir |
|---|---|---|
| **Motor** | Modelo de dados e máquina de estado — processo, etapa, laço de exigência, protocolo, licença, prazo, executor | **Só com o fluxo do setor.** Errar aqui é migration com dado dentro. |
| **Tela** | Campos, colunas, o conteúdo de cada template, rótulo | **Não espera fluxo.** O setor vai mudar na validação de qualquer jeito, e mudar é barato. |

A regra que decide sem discussão: **onde o Connect já é dono do modelo, segue
agora; onde o modelo é novo, espera o fluxo.**

## O padrão de fluxograma

Um arquivo HTML por setor, aberto no navegador, sem dependência externa. Cada um
tem três camadas sobre o mesmo desenho:

1. **O que o setor faz** — as etapas como o setor as descreve, na ordem e com o
   vocabulário dele. É o que o coordenador valida.
2. **Quem executa** — pessoa, robô ou integração. Marcado em cada etapa, porque
   é isso que diz onde a automação entra e o que ela economiza.
3. **O que sustenta** — qual modelo do Connect segura aquela etapa, e se ele já
   existe ou é motor novo.

### Notação

- **Etapa numerada** — passo executado, na ordem do setor.
- **Losango** — decisão do órgão ou do sistema, com as duas saídas nomeadas.
- **Laço de volta** — reapresentação depois de exigência. Desenhado explícito:
  é o que faz um prazo de 7 dias virar 30, e o contador de voltas é KPI.
- **Ramificação paralela** — caminhos que correm ao mesmo tempo e independentes
  (as três licenças do alvará). Nunca numerar como sequência.
- **Chip de executor** — `pessoa` · `robô` · `integração`.
- **Chip de camada** — `motor` (precisa de fluxo) · `tela` (não precisa).

### Ao escrever um fluxo novo

Comece pelo desenho que o setor já usa, se existir — o do Societário veio de um
fluxograma que o próprio setor montou. Traduza sem reordenar: mudar a ordem para
caber num modelo é como se perde a validação.

Quando o fluxo revelar algo que o modelo do protótipo não segura, **anote no
próprio arquivo**, na seção "O que isto exige do motor". É essa lista que vira
migration, e é ela que a validação final confere.

## Perguntas para os coordenadores

Decisões que tomamos para não travar o motor, e que o setor precisa confirmar na
validação. Cada uma tem o custo de estar errada anotado — é o que decide se vale
perguntar antes ou depois.

| Setor | Pergunta | O que assumimos | Custo se estiver errado |
|---|---|---|---|
| Societário | "Prazo médio: 4 a 7 dias" é em dias **úteis** ou **corridos**? | Úteis, decidido em 11/09/2026 | Baixo. Trocar é apagar uma chamada de função. Mas muda quem aparece como atrasado: 7 úteis são 9 ou 10 corridos. |
| Societário | Concluir a etapa 6 depende do deferimento sair, ou o setor segue tocando em paralelo? | O desfecho vem do protocolo, e a etapa segue aberta até ele sair | Médio. Se o setor trabalha adiantado, a fila mostra menos trabalho disponível do que existe. |
| Societário | Licença dispensada e licença não iniciada são a mesma coisa para o setor? | Não: `DISPENSADA` encerra a etapa, `PENDENTE` a mantém esperando | Médio. Se forem a mesma, sobra um estado que ninguém usa. |

Acrescente aqui ao traduzir cada fluxo novo. **É esta tabela que a validação
final percorre** — ela existe para o coordenador confirmar ou apontar, em vez de
ter que lembrar sozinho do que faltou.

## Arquivos

| Setor | Arquivo | Fluxo do setor | Estado |
|---|---|---|---|
| Societário | [societario.html](./societario.html) | sim, recebido em 10/09 | traduzido |
| BPO | — | **pedir** — conciliação, cobrança e o que é manual hoje | aguardando |
| Fiscal | — | pedir | aguardando |
| DP | — | pedir | aguardando |
| Recrutamento | — | pedir | aguardando |
| Gestão / DRE | — | pedir | aguardando |

Sem o fluxo, o motor daquele setor não começa — só a camada de tela sobre modelo
que já existe.

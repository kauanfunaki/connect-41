// Artigos da base de conhecimento: telas do financeiro (BPO, DRE e fiscal).
//
// Escritos a partir do código das telas em 02/10/2026. Os nomes entre “ ” são
// os rótulos como aparecem na tela — se um botão mudar de nome, mude aqui.

import type { ArtigoDeAjuda } from "../tipos";

export const ARTIGOS_FINANCEIROS: ArtigoDeAjuda[] = [
  // ─── Contas a pagar ───────────────────────────────────────────────────────
  {
    chave: "bpo_contas_pagar",
    titulo: "Contas a pagar",
    caminhos: ["/pagar"],
    resumo:
      "Lista o que as empresas clientes têm a pagar, do documento fiscal até a baixa, pelo valor líquido. Aqui você confere cada conta, registra o pagamento e acompanha o que está vencido.",
    secoes: [
      {
        titulo: "Encontrar as contas que você procura",
        passos: [
          "Use os cartões do topo: “Em aberto”, “Vencido” e “Vence hoje” — com a “Situação” em “Todas”, aparece também o “Pago”. Clique em “Em aberto” ou “Vencido” para ver só essas contas.",
          "Clique em “Filtros” e escolha a “Situação” (“Vencidas” ou “Todas”), a “Competência” (o mês a que a conta pertence) ou a “Empresa”.",
          "Para refinar a lista, clique no ícone de filtro ao lado do nome da coluna, como “Vencimento”, “Fornecedor” ou “Categoria”.",
          "Contas marcadas com “sem categoria” ainda precisam ser classificadas.",
          "Na aba “Análise — atraso e ranking”, veja as “Faixas de atraso” e os “Maiores fornecedores em aberto”.",
        ],
      },
      {
        titulo: "Conferir e registrar o pagamento",
        passos: [
          "Na linha da conta, clique em “Conferir” para marcar que ela foi revisada. O botão só aparece enquanto a conta está a conferir.",
          "Clique em “Pagar”.",
          "Em “Data do pagamento”, informe o dia em que o dinheiro saiu. Não é possível usar data futura.",
          "Clique em “Confirmar”. Registrar o pagamento é o que se chama de baixa.",
          "Se errou, clique no botão “⋯” da conta paga e escolha “Desfazer pagamento”.",
        ],
      },
      {
        titulo: "Ver a nota, abrir pendência ou enviar para aprovação",
        passos: [
          "Clique no botão “⋯” (Mais ações) na linha da conta.",
          "Escolha “Ver nota fiscal” para abrir o documento que originou a conta.",
          "Escolha “Abrir pendência” para pedir algo ao cliente sobre esta conta. O pedido já nasce ligado a ela.",
          "Escolha “Enviar para aprovação” para que o cliente ou a coordenação autorize o pagamento antes da baixa.",
        ],
      },
      {
        titulo: "Definir o centro de custo de várias contas",
        passos: [
          "Marque a caixa à esquerda das contas, ou a do cabeçalho para marcar todas. As caixas só aparecem quando a empresa tem centros de custo (unidades, obras ou projetos).",
          "Na barra que aparece, escolha o centro de custo.",
          "Clique em “Definir centro de custo”.",
          "Para retirar o centro, escolha “Sem centro de custo” e clique no mesmo botão.",
        ],
      },
    ],
    dicas: [
      "Conta “Aguardando aprovação” ou “Reprovada” não pode ser paga: o botão “Pagar” fica desativado e mostra o motivo logo abaixo.",
      "As contas nascem do lançamento de um documento fiscal ou da tela “Lançamentos”. Não há botão para criar conta nesta tela.",
      "“Abrir pendência” e “Enviar para aprovação” só aparecem quando o escritório usa esses módulos.",
    ],
  },

  // ─── Contas a receber ─────────────────────────────────────────────────────
  {
    chave: "bpo_contas_receber",
    titulo: "Contas a receber",
    caminhos: ["/receber"],
    resumo:
      "Lista o que as empresas clientes têm a receber, do documento fiscal emitido até o recebimento. Aqui você confere cada conta, registra o recebimento e acompanha o que está vencido.",
    secoes: [
      {
        titulo: "Encontrar as contas que você procura",
        passos: [
          "Use os cartões do topo: “Em aberto”, “Vencido” e “Vence hoje” — com a “Situação” em “Todas”, aparece também o “Recebido”. Clique em “Em aberto” ou “Vencido” para ver só essas contas.",
          "Clique em “Filtros” e escolha a “Situação” (“Vencidas” ou “Todas”), a “Competência” (o mês a que a conta pertence) ou a “Empresa”.",
          "Para refinar a lista, clique no ícone de filtro ao lado do nome da coluna, como “Vencimento”, “Cliente” ou “Categoria”.",
          "Na aba “Análise — atraso e ranking”, veja as “Faixas de atraso” e os “Maiores clientes em aberto”.",
        ],
      },
      {
        titulo: "Conferir e registrar o recebimento",
        passos: [
          "Na linha da conta, clique em “Conferir” para marcar que ela foi revisada. O botão só aparece enquanto a conta está a conferir.",
          "Clique em “Receber”.",
          "Em “Data do recebimento”, informe o dia em que o dinheiro entrou. Não é possível usar data futura.",
          "Clique em “Confirmar”. Registrar o recebimento é o que se chama de baixa.",
          "Se errou, clique no botão “⋯” da conta recebida e escolha “Desfazer recebimento”.",
        ],
      },
      {
        titulo: "Ver a nota, abrir pendência ou ir para a cobrança",
        passos: [
          "Clique no botão “⋯” (Mais ações) na linha da conta.",
          "Escolha “Ver nota fiscal” para abrir o documento que originou a conta.",
          "Escolha “Abrir pendência” para pedir algo ao cliente sobre esta conta.",
          "Se a conta tiver um selo de cobrança, como “Em cobrança” ou “Prometeu pagar”, clique nele para abrir o título na tela “Cobrança”.",
        ],
      },
      {
        titulo: "Definir o centro de custo de várias contas",
        passos: [
          "Marque a caixa à esquerda das contas, ou a do cabeçalho para marcar todas. As caixas só aparecem quando a empresa tem centros de custo (unidades, obras ou projetos).",
          "Na barra que aparece, escolha o centro de custo.",
          "Clique em “Definir centro de custo”.",
          "Para retirar o centro, escolha “Sem centro de custo” e clique no mesmo botão.",
        ],
      },
    ],
    dicas: [
      "As contas nascem do lançamento de um documento fiscal ou da tela “Lançamentos”. Não há botão para criar conta nesta tela.",
      "Conta “Renegociada” ou “Perda” saiu do em aberto pela tela “Cobrança” (acordo ou baixa por perda).",
    ],
  },

  // ─── Lançamentos ──────────────────────────────────────────────────────────
  {
    chave: "bpo_lancamentos",
    titulo: "Lançamentos",
    caminhos: ["/lancamentos"],
    resumo:
      "Registra as contas que não nascem de nota fiscal, como aluguel, folha, pró-labore e tarifas, lançadas à mão ou importadas de planilha.",
    secoes: [
      {
        titulo: "Lançar uma conta sem nota",
        passos: [
          "Escolha a empresa em “Buscar empresa…” e clique em “Aplicar”.",
          "Clique em “Novo lançamento”, no topo da tela.",
          "Em “Tipo”, escolha “Conta a pagar” ou “Conta a receber” e selecione o “Fornecedor” ou o “Cliente (sacado)”. Se ele ainda não existe, escolha “+ Cadastrar nova contraparte”.",
          "Escolha a “Categoria” (obrigatória em conta a pagar) e preencha “Competência” (o mês a que a conta pertence), “Vencimento” e “Valor”.",
          "Se a conta já foi paga ou recebida, informe a data em “Já pago em” ou “Já recebido em”. Se não, deixe em branco.",
          "Clique em “Lançar”. A conta já aparece em Contas a pagar ou a receber e na DRE.",
        ],
      },
      {
        titulo: "Importar lançamentos de uma planilha",
        passos: [
          "Escolha a empresa e clique em “Importar CSV”, no topo da tela.",
          "Monte a planilha com as colunas do modelo mostrado na tela e salve em CSV (texto separado por vírgula ou ponto e vírgula).",
          "Clique em “Escolher arquivo” ou arraste o arquivo para a faixa.",
          "Confira a prévia: cada linha aparece como válida, “Duplicada” ou “Erro”, com o motivo.",
          "Clique em “Importar” seguido do número de linhas válidas. Nada é gravado antes desse clique.",
        ],
      },
      {
        titulo: "Consultar e cancelar o que foi lançado à mão",
        passos: [
          "Abra “Lançamentos” no menu. Se estiver lançando ou importando, volte pela trilha, em “Lançamentos”.",
          "Escolha a empresa e o mês e clique em “Aplicar”.",
          "Veja a situação de cada um: “A conferir”, “Em aberto”, “Liquidado” ou “Cancelado”.",
          "Para cancelar, clique em “Cancelar” na linha e confirme em “Cancelar lançamento”.",
        ],
      },
    ],
    dicas: [
      "Cancelar não apaga: o lançamento sai dos totais e fica no histórico. Para desfazer, só com um lançamento novo.",
      "Lançamento já pago só é cancelado depois de desfazer a baixa em Contas a pagar ou a receber, que é onde também se registra o pagamento.",
      "Os botões “Novo lançamento” e “Importar CSV” só aparecem para quem atua no setor. Em empresa com alçada de aprovação, a conta a pagar nasce aguardando aprovação.",
    ],
  },

  // ─── Fluxo de caixa ───────────────────────────────────────────────────────
  {
    chave: "bpo_fluxo_caixa",
    titulo: "Fluxo de caixa",
    caminhos: ["/fluxo-de-caixa"],
    resumo:
      "Mostra o que entrou e saiu nos últimos meses e o que as contas em aberto indicam que vai entrar e sair, por empresa ou de todas juntas.",
    secoes: [
      {
        titulo: "Ver o realizado e a projeção",
        passos: [
          "Em “Buscar empresa…”, escolha uma empresa ou deixe “Todas as empresas”.",
          "Escolha o mês e clique em “Aplicar”.",
          "Na aba “Realizado e projeção”, o quadro “Saldo das contas” mostra o saldo bancário que vem da conciliação.",
          "A tabela do realizado traz entradas, saídas e saldo dos seis meses até o mês escolhido, pela data em que as contas foram pagas ou recebidas.",
          "Os cartões da projeção somam o que vence de hoje até 7, 15, 30, 60, 90 e 180 dias: o que há a receber menos o que há a pagar.",
        ],
      },
      {
        titulo: "Comparar as empresas",
        passos: [
          "Clique na aba “Por empresa”.",
          "Escolha o mês e clique em “Aplicar”.",
          "Veja, para cada empresa, “Pago no mês”, “Recebido no mês”, “Saldo” e quantas contas estão vencidas.",
          "Clique no número de “Vencidas a pagar” ou “Vencidas a receber” para abrir a lista dessas contas.",
        ],
      },
    ],
    dicas: [
      "Sem conta bancária cadastrada, o fluxo não mostra o saldo real: cadastre a conta e importe o extrato em “Conciliação bancária”.",
      "Contas já vencidas e não pagas ficam fora das janelas da projeção e aparecem num aviso logo abaixo dos cartões.",
      "A projeção só considera o que já está lançado.",
    ],
  },

  // ─── Conciliação bancária ─────────────────────────────────────────────────
  {
    chave: "bpo_conciliacao",
    titulo: "Conciliação bancária",
    caminhos: ["/conciliacao"],
    resumo:
      "Confere o extrato do banco com os lançamentos da empresa: o que já foi pago, o que falta lançar e se o saldo fecha. Conciliar é ligar cada movimento do extrato ao lançamento que ele paga ou recebe.",
    secoes: [
      {
        titulo: "Cadastrar a conta bancária",
        passos: [
          "Escolha a empresa em “Buscar empresa…” e clique em “Aplicar”.",
          "Clique em “Nova conta”.",
          "Preencha “Nome da conta”, “Tipo”, “Banco (COMPE)” (o código do banco, como 001 ou 341), “Agência” e “Conta com dígito”.",
          "Se quiser conferir o saldo, informe o “Saldo inicial” e a data em “Data do saldo inicial”.",
          "Clique em “Salvar”.",
        ],
      },
      {
        titulo: "Importar o extrato",
        passos: [
          "No internet banking, baixe o extrato da conta em OFX, o arquivo de extrato que o banco gera para outros sistemas (às vezes aparece como Money ou Quicken).",
          "No Connect, clique no nome da conta bancária para selecioná-la.",
          "Em “Importar extrato OFX”, clique em “Escolher arquivo” ou arraste o arquivo.",
          "Clique em “Importar”. A tela mostra quantas transações novas entraram e o saldo informado pelo banco.",
        ],
      },
      {
        titulo: "Conciliar as transações",
        passos: [
          "A lista abre nas transações “Pendentes”, da mais antiga para a mais nova.",
          "Quando aparecer uma “Sugestão”, confira o lançamento indicado, clique em “Confirmar” e confirme.",
          "Sem sugestão, clique em “Escolher lançamentos”, marque um ou mais até o “Selecionado” fechar o valor no centavo e clique em “Conciliar”.",
          "Se a conta ainda não foi lançada, clique em “Criar lançamento”, escolha o “Fornecedor” ou o “Cliente (sacado)”, a “Categoria” e a “Competência” e clique em “Criar e conciliar”.",
        ],
      },
      {
        titulo: "Ignorar, desfazer ou reabrir uma transação",
        passos: [
          "Para tirar da fila um movimento que não é conta (como um resgate automático), clique em “Ignorar”, escreva o “Motivo” e clique em “Ignorar”.",
          "Clique em “Filtros” e, em “Situação”, escolha “Conciliadas”, “Ignoradas” ou “Todas”. Para limitar as datas, preencha o período e clique em “Filtrar período”.",
          "Numa transação conciliada por engano, clique em “Desfazer” e confirme.",
          "Numa transação ignorada, clique em “Reabrir” para que ela volte às pendentes.",
        ],
      },
    ],
    dicas: [
      "Conciliar marca os lançamentos como pagos na data do extrato; “Desfazer” devolve cada um ao que era antes.",
      "Reimportar o mesmo período não duplica nada. Banco e número da conta não mudam depois do primeiro extrato importado.",
      "Conta travada na aprovação não é conciliada: concilie depois que ela for aprovada, sem criar outro lançamento.",
    ],
  },

  // ─── Fornecedores e sacados ───────────────────────────────────────────────
  {
    chave: "bpo_cadastros",
    titulo: "Fornecedores e sacados",
    caminhos: ["/cadastros-financeiros"],
    resumo:
      "Cadastro das contrapartes de cada empresa cliente: fornecedores (de quem ela compra) e sacados (os clientes que pagam a ela), além dos centros de custo e do plano de contas da empresa.",
    secoes: [
      {
        titulo: "Cadastrar um fornecedor ou sacado",
        passos: [
          "Escolha a empresa em “Buscar empresa…” e clique em “Aplicar”.",
          "Clique em “Novo cadastro”.",
          "Preencha “Nome” e, se tiver, “CPF ou CNPJ” e “E-mail”.",
          "Escolha a “Categoria padrão” e o “Centro de custo padrão”, que a próxima conta dessa contraparte herda.",
          "Clique em “Cadastrar”.",
        ],
      },
      {
        titulo: "Encontrar, editar ou inativar um cadastro",
        passos: [
          "Use as abas “Fornecedores”, “Sacados” ou “Todos”. Cadastro ainda sem conta aparece nas duas primeiras.",
          "Digite em “Buscar por nome ou documento…” e tecle Enter.",
          "Clique em “Editar” na linha do cadastro.",
          "Altere os dados ou mude a “Situação” para “Inativo” e clique em “Salvar”.",
        ],
      },
      {
        titulo: "Cadastrar centros de custo",
        passos: [
          "Clique na aba “Centros de custo”. Centro de custo é uma unidade, obra ou projeto da empresa, usado para ver o resultado separado.",
          "Clique em “Novo centro de custo”.",
          "Preencha o “Nome” e, se quiser, o “Código”.",
          "Clique em “Cadastrar”. Para mudar ou inativar, use “Editar”.",
        ],
      },
      {
        titulo: "Ajustar o plano de contas da empresa",
        passos: [
          "Clique na aba “Plano de contas”. O plano de contas é a lista de categorias de receita e despesa.",
          "Para mudar onde uma categoria entra na DRE desta empresa, escolha outra opção em “Linha da DRE nesta empresa”. A troca é gravada na hora.",
          "Para esconder uma categoria do padrão que a empresa não usa, clique em “Não usar nesta empresa”.",
          "Para criar uma categoria só desta empresa, clique em “Nova categoria”, no topo da tela, preencha “Nome”, “Tipo”, “Grupo do plano” e “Linha da DRE” e clique em “Cadastrar”.",
        ],
      },
    ],
    dicas: [
      "Cadastro não é apagado: inativo continua nas contas antigas e deixa de aparecer no lançamento manual.",
      "O e-mail do sacado é para onde vão os lembretes da régua de cobrança. Sacado sem e-mail fica fora dela.",
      "Só quem atua no setor vê os botões de cadastrar e editar.",
    ],
  },

  // ─── Pendências ao cliente ────────────────────────────────────────────────
  {
    chave: "bpo_pendencias",
    titulo: "Pendências ao cliente",
    caminhos: ["/pendencias"],
    resumo:
      "Pedidos de documento, informação ou confirmação ao cliente, com prazo e conversa. O cliente recebe o aviso por e-mail e responde pelo portal.",
    secoes: [
      {
        titulo: "Abrir uma pendência",
        passos: [
          "Clique em “Nova pendência”.",
          "Escolha a “Empresa” e o “Tipo”: “Documento”, “Informação” ou “Confirmação”.",
          "Se quiser, informe o “Prazo”.",
          "Escreva o “Título”. Ele vai no e-mail ao cliente, então não coloque valores nem dados sensíveis.",
          "Detalhe o pedido em “Descrição” e, se precisar, inclua “Anexos”.",
          "Clique em “Abrir pendência”.",
        ],
      },
      {
        titulo: "Acompanhar a fila",
        passos: [
          "Use os cartões do topo: “Aguardando cliente”, “Respondidas”, “Vencidas” e “Encerradas”. Clique em um deles para ver só aquelas.",
          "Clique em “Filtros” para escolher “Situação”, “Empresa” ou “Prazo” (“Só vencidas”).",
          "“Respondidas” são as que o cliente já respondeu e esperam a equipe.",
          "Clique no título da pendência para abrir a conversa.",
        ],
      },
      {
        titulo: "Responder e encerrar",
        passos: [
          "Na pendência aberta, leia a conversa e os anexos.",
          "Escreva em “Mensagem”, inclua “Anexos” se precisar e clique em “Responder”. O cliente recebe um e-mail só com o título e o link.",
          "Quando o pedido estiver atendido, clique em “Resolver” e confirme.",
          "Se o pedido não vale mais, clique em “Cancelar” e confirme em “Cancelar pendência”.",
          "Para retomar uma pendência encerrada, clique em “Reabrir”.",
        ],
      },
    ],
    dicas: [
      "Se o prazo passar sem resposta, o cliente recebe lembretes automáticos por e-mail com 1, 3, 7 e 15 dias de atraso.",
      "Pendência resolvida sai da fila e o cliente não consegue mais responder.",
      "Para pedir algo sobre uma conta específica, use “Abrir pendência” no botão “⋯” da conta em Contas a pagar ou a receber.",
    ],
  },

  // ─── Aprovações ───────────────────────────────────────────────────────────
  {
    chave: "bpo_aprovacoes",
    titulo: "Aprovações",
    caminhos: ["/aprovacoes"],
    resumo:
      "Contas a pagar que esperam o “pode pagar” do cliente ou da coordenação antes da baixa, e o cadastro das alçadas — o valor máximo que cada usuário do portal do cliente pode aprovar.",
    secoes: [
      {
        titulo: "Cadastrar uma alçada",
        passos: [
          "Clique na aba “Alçadas”.",
          "Escolha a empresa em “Buscar empresa…” e clique em “Aplicar”.",
          "Clique em “Nova alçada”, no topo da tela, escolha o “Usuário do portal” e informe o “Teto”, o valor máximo que ele pode aprovar.",
          "Clique em “Salvar alçada”.",
          "Para suspender uma alçada, clique em “Desativar” na lista; para voltar, em “Reativar”.",
        ],
      },
      {
        titulo: "Aprovar ou reprovar uma conta",
        passos: [
          "Na aba “Fila”, use os cartões “Aguardando” e “Reprovadas” ou o botão “Filtros” para escolher “Situação” e “Empresa”.",
          "Clique em “Histórico” para ver quem já decidiu e quando.",
          "Para liberar o pagamento, clique em “Aprovar” e confirme.",
          "Para recusar, clique em “Reprovar”, escreva o “Motivo” e clique em “Reprovar”. Quem lançou a conta recebe esse motivo.",
        ],
      },
      {
        titulo: "Enviar ou reenviar uma conta para aprovação",
        passos: [
          "Para uma conta reprovada que foi corrigida, clique em “Reenviar para aprovação” na fila.",
          "Para uma conta antiga, que não entrou sozinha, abra “Contas a pagar”.",
          "Clique no botão “⋯” da conta e escolha “Enviar para aprovação”.",
        ],
      },
    ],
    dicas: [
      "Conta aguardando ou reprovada não pode ser paga nem conciliada. Com ao menos uma alçada ativa na empresa, toda conta a pagar nova em aberto já nasce aguardando.",
      "Quem lançou a conta não pode aprová-la nem reprová-la.",
      "A aba “Alçadas” e a aprovação pela equipe são só da coordenação do setor, que aprova sem teto.",
    ],
  },

  // ─── Conversa com o cliente ───────────────────────────────────────────────
  {
    chave: "bpo_comunicacao",
    titulo: "Conversa com o cliente",
    caminhos: ["/comunicacao"],
    resumo:
      "Conversa livre com cada empresa cliente, com anexos — para recados que não são pedido com prazo. Quando o escritório usa as Solicitações do portal, esta tela fica só como histórico e não envia mensagens novas.",
    secoes: [
      {
        titulo: "Abrir uma conversa",
        passos: [
          "Ao abrir a tela, a lista mostra as empresas que já têm conversa, com a última mensagem.",
          "O selo “Esperando o escritório” indica que o cliente escreveu por último.",
          "Clique na empresa para abrir a conversa.",
          "Para falar com outra empresa, escolha-a em “Buscar empresa…” e clique em “Aplicar”.",
        ],
      },
      {
        titulo: "Enviar uma mensagem",
        passos: [
          "Com a conversa aberta, escreva no campo “Mensagem”.",
          "Para anexar, clique em “Escolher arquivo” ou arraste o arquivo. Use “Outro anexo” para mandar mais de um.",
          "Clique em “Enviar mensagem”.",
          "O cliente recebe um e-mail avisando que há mensagem nova e lê o conteúdo no portal.",
        ],
      },
    ],
    dicas: [
      "Pedido com prazo é pendência: use “Pendências ao cliente” quando precisar de um documento ou resposta até uma data.",
    ],
  },

  // ─── Cobrança ─────────────────────────────────────────────────────────────
  {
    chave: "bpo_cobranca",
    titulo: "Cobrança",
    caminhos: ["/cobranca"],
    resumo:
      "Acompanha as contas a receber vencidas: quem cobrar hoje, o que foi combinado com cada sacado (o cliente que deve), os acordos de parcelamento e a régua de lembretes por e-mail.",
    secoes: [
      {
        titulo: "Trabalhar a fila de vencidos",
        passos: [
          "Na aba “Fila”, veja os cartões “Títulos vencidos”, “Valor”, “Sem contato” e “Sacado sem e-mail”.",
          "Comece pelo quadro “Próximas ações de hoje”, com os contatos agendados para o dia.",
          "Clique em “Filtros” para escolher “Empresa”, “Atraso”, “Situação” ou “Responsável” (“Meus” mostra só os seus).",
          "Clique em “Abrir” na linha do título para ver os detalhes e agir.",
        ],
      },
      {
        titulo: "Registrar um contato com o sacado",
        passos: [
          "No título aberto, escolha quem cuida dele em “Responsável”.",
          "Em “Registrar contato”, preencha “Data do contato”, “Canal” e “Resultado”.",
          "Informe a “Próxima ação” ou, se o sacado prometeu pagar, a “Data prometida”.",
          "Escreva o que foi combinado em “Anotação interna”.",
          "Clique em “Registrar contato”. Ele entra no “Histórico” do título.",
        ],
      },
      {
        titulo: "Fazer um acordo de parcelamento",
        passos: [
          "No título aberto, clique em “Criar acordo”.",
          "Marque os títulos vencidos do sacado que entram no acordo.",
          "Preencha “Valor do acordo” (vazio usa a soma dos originais), “Parcelas” e “1ª parcela vence em”.",
          "Clique em “Revisar e confirmar”, confira as parcelas e clique no botão que começa com “Confirmar:” para criar o acordo.",
          "Acompanhe na aba “Acordos”. Se o sacado parar de pagar, clique em “Marcar como quebrado”; para voltar atrás, em “Desfazer”.",
        ],
      },
      {
        titulo: "Ligar a régua de lembretes por e-mail",
        passos: [
          "Clique na aba “Régua”. A régua manda um e-mail ao sacado em cada passo de atraso, em nome da empresa credora.",
          "Em “Situação”, escolha “Ligada”.",
          "Em “Passos (dias de atraso)”, informe os dias separados por vírgula, como 1, 7, 15, 30.",
          "Clique em “Salvar” e confirme em “Ligar”.",
          "Para uma empresa que cobra os próprios sacados, escolha-a em “Empresas fora da régua” e clique em “Tirar da régua”.",
        ],
      },
    ],
    dicas: [
      "A régua e as ações “Baixar por perda” e “Reverter perda”, na ficha do título, são só da coordenação do setor.",
      "A régua pausa enquanto o título está em acordo, se o último contato contestou ou até a data prometida passar. Sacado sem e-mail fica fora.",
      "A anotação interna só a equipe vê; o portal do cliente mostra a data, o canal e o resultado do contato.",
    ],
  },

  // ─── Repositório de senhas ────────────────────────────────────────────────
  {
    chave: "bpo_senhas",
    titulo: "Repositório de senhas",
    caminhos: ["/bpo-senhas"],
    resumo:
      "Guarda as credenciais de portais, bancos e sistemas dos clientes num lugar só, com registro de quem consultou cada senha.",
    secoes: [
      {
        titulo: "Consultar uma senha",
        passos: [
          "Digite em “Buscar por título, empresa ou usuário…”.",
          "Na linha da credencial, clique no ícone de olho (“Revelar senha”).",
          "Clique no ícone de copiar (“Copiar senha”) para levar a senha à área de transferência.",
          "Clique no olho de novo para esconder a senha.",
        ],
      },
      {
        titulo: "Cadastrar uma credencial",
        passos: [
          "Clique em “Nova credencial”.",
          "Preencha o “Título”, como e-CAC ou o nome do banco.",
          "Escolha a “Empresa”, ou deixe “Geral (sem empresa)” para uma credencial do setor.",
          "Preencha “Usuário”, “Senha” e, se quiser, “URL” e “Notas”.",
          "Clique em “Criar”.",
        ],
      },
      {
        titulo: "Editar ou excluir uma credencial",
        passos: [
          "Na linha da credencial, clique em “Editar”.",
          "Altere os dados. Deixe a “Senha” em branco para manter a atual.",
          "Clique em “Salvar”.",
          "Para excluir, clique no botão “⋯”, escolha “Excluir” e confirme.",
        ],
      },
    ],
    dicas: [
      "Cada vez que alguém revela uma senha, o acesso fica registrado.",
      "Cadastrar, editar e excluir é só da coordenação do setor. A exclusão não pode ser desfeita.",
    ],
  },

  // ─── Repositório de manuais ───────────────────────────────────────────────
  {
    chave: "bpo_manual",
    titulo: "Repositório de manuais",
    caminhos: ["/bpo-manual"],
    resumo:
      "Instruções internas escritas pela própria equipe, organizadas em documentos e páginas, para ninguém ficar sem saber o que fazer em ausências e férias.",
    secoes: [
      {
        titulo: "Criar um documento e suas páginas",
        passos: [
          "No pé da lista à esquerda, clique em “Novo documento”.",
          "Digite o título e tecle Enter.",
          "Abaixo do documento, clique em “Página”.",
          "Digite o título da página e tecle Enter.",
        ],
      },
      {
        titulo: "Escrever uma página",
        passos: [
          "Clique na página na lista à esquerda.",
          "Clique no título ou no texto e escreva direto na folha.",
          "O texto grava sozinho; o canto de cima mostra “Salvando…” e depois “Salvo”.",
          "Para ilustrar, clique em “Adicionar capa” e escolha uma imagem.",
        ],
      },
      {
        titulo: "Organizar os documentos",
        passos: [
          "Clique no nome de um documento para renomeá-lo e tecle Enter.",
          "Clique no ícone ao lado do nome (“Escolher ícone”) para dar um ícone ao documento.",
          "Use as setas ao lado dos documentos para expandir ou recolher as páginas.",
          "Para excluir, passe o mouse sobre o documento ou a página e clique no ícone de lixeira.",
        ],
      },
    ],
    dicas: [
      "Excluir documento ou página é só da coordenação do setor e não pode ser desfeito. Excluir um documento remove todas as páginas dele.",
    ],
  },

  // ─── DRE (caixa) ──────────────────────────────────────────────────────────
  {
    chave: "bpo_dre",
    titulo: "DRE",
    caminhos: ["/dre"],
    resumo:
      "Demonstrativo de resultado (receitas menos custos e despesas) de cada empresa, pelo regime de caixa: conta o que foi efetivamente pago e recebido em cada mês.",
    secoes: [
      {
        titulo: "Ver o DRE de um mês",
        passos: [
          "Escolha a empresa em “Buscar empresa…”. A tela troca sozinha.",
          "Na aba “Por mês”, o DRE abre no mês mais recente com movimento.",
          "Para ver outro mês, clique em “Filtros” e escolha o “Mês”.",
          "Confira, abaixo do relatório, quantos lançamentos entraram e se algum valor não fechou.",
        ],
      },
      {
        titulo: "Ver o ano inteiro",
        passos: [
          "Clique na aba “Ano inteiro”.",
          "Para trocar o ano, clique em “Filtros” e escolha o “Ano”.",
          "Compare os doze meses lado a lado. A coluna “Média” divide pelos meses com movimento, não por doze.",
        ],
      },
      {
        titulo: "Classificar categorias sem grupo",
        passos: [
          "Quando aparecer o aviso de categorias sem grupo no DRE, veja a lista logo abaixo dele.",
          "Em cada categoria, escolha o grupo em “Classificar em…”. Para movimentos entre contas da própria empresa, escolha “Transferência entre contas (fora do DRE)”.",
          "Clique em “Salvar”.",
          "Para desfazer uma classificação feita só para esta empresa, clique em “voltar ao padrão” no quadro “Fora do padrão nesta empresa”.",
        ],
      },
      {
        titulo: "Importar um mês do Omie",
        passos: [
          "No Omie, exporte a planilha de Contas a Pagar ou a Receber, sem mudar as colunas.",
          "No quadro “Importar do Omie”, escolha o arquivo .xlsx.",
          "Clique em “Importar”.",
          "Confira o resumo: quantas linhas entraram em cada mês.",
        ],
      },
    ],
    dicas: [
      "Valor sem grupo não entra em nenhuma linha do relatório até ser classificado.",
      "Importar de novo o mesmo mês do Omie substitui o que estava lá.",
      "Para o resultado pelo mês a que cada conta pertence, pago ou não, use a “DRE econômica”.",
    ],
  },

  // ─── DRE econômica ────────────────────────────────────────────────────────
  {
    chave: "dre_economica",
    titulo: "DRE econômica",
    caminhos: ["/dre/economica"],
    resumo:
      "Demonstrativo de resultado pelo regime de competência: soma o que pertence a cada mês, tenha sido pago ou não.",
    secoes: [
      {
        titulo: "Ver o resultado do período",
        passos: [
          "Escolha a empresa em “Buscar empresa…”, o mês, e clique em “Aplicar”.",
          "Escolha a visão nas abas: “Mês”, “Acumulado no ano” ou “Últimos 12 meses”.",
          "Leia os cartões do topo: “Receita bruta”, “Margem de contribuição”, “Resultado operacional” e “Resultado do período”.",
          "Confira os avisos em amarelo, como lançamentos ainda a conferir que entram no resultado.",
        ],
      },
      {
        titulo: "Ver por centro de custo",
        passos: [
          "Se a empresa tem centros de custo, escolha um no seletor ao lado do mês (ou “Sem centro de custo”) e clique em “Aplicar”.",
          "Outra forma: no quadro “Resultado por centro de custo”, clique no nome do centro.",
          "Para voltar ao total, clique em “Ver a empresa inteira”.",
        ],
      },
      {
        titulo: "Comparar com o orçamento",
        passos: [
          "Com o orçamento aprovado do ano, a tela mostra o orçado ao lado do realizado nas visões “Mês” e “Acumulado no ano”.",
          "Deixe o centro de custo em “Todos os centros de custo”: o orçamento é da empresa inteira.",
          "Verde indica resultado melhor que o orçado; vermelho, pior.",
          "Clique em “ver orçamento” para abrir a versão usada na comparação.",
        ],
      },
    ],
    dicas: [
      "Valores sem grupo ficam fora do resultado. Classifique na tela “DRE”, que usa o mesmo de-para.",
      "O que foi pago e recebido no mês está na “DRE” (caixa). A diferença entre os dois regimes está em “Análises gerenciais”.",
    ],
  },

  // ─── Análises gerenciais ──────────────────────────────────────────────────
  {
    chave: "dre_analises",
    titulo: "Análises gerenciais",
    caminhos: ["/dre/analises"],
    resumo:
      "Análises sobre a DRE por competência e o caixa de cada empresa: comparativos, projeção, cenários, indicadores e respostas prontas para as perguntas mais comuns.",
    secoes: [
      {
        titulo: "Abrir uma análise",
        passos: [
          "Escolha a empresa em “Buscar empresa…”, o mês, e clique em “Aplicar”.",
          "Clique na aba da análise. Trocar de aba mantém a empresa e o mês.",
          "“Econômico × financeiro” põe o resultado por competência ao lado do caixa e mostra os atrasos médios.",
          "“Reconciliação lucro → caixa” explica, passo a passo, por que o lucro do mês é diferente do caixa.",
          "“Indicadores” traz rentabilidade, capital de giro, caixa e risco, com a fórmula de cada um.",
        ],
      },
      {
        titulo: "Comparar períodos ou empresas",
        passos: [
          "Clique na aba “Comparativos”.",
          "Clique em “Filtros” e escolha a “Comparação”, como “Mês × mesmo mês do ano anterior” ou “Empresa × empresa”.",
          "Em “Regime”, escolha “Competência” ou “Caixa”.",
          "Na comparação entre empresas, escolha a outra em “Comparar com”.",
        ],
      },
      {
        titulo: "Projetar os próximos meses",
        passos: [
          "Clique na aba “Forecast”, a projeção dos próximos meses.",
          "Clique em “Filtros” e escolha o “Método”: “Tendência linear”, “Média móvel (3 meses)” ou “Sazonalidade”.",
          "A última coluna mostra o que já está lançado vencendo em cada mês.",
        ],
      },
      {
        titulo: "Simular um cenário",
        passos: [
          "Clique na aba “Cenários”.",
          "Em “Cenário”, escolha “Pessimista”, “Base”, “Otimista” ou “Personalizado”.",
          "Ajuste os percentuais de “Receita”, “CMV além da receita” (custo da mercadoria vendida), “Despesas fixas” e “Despesas financeiras”.",
          "Compare a coluna “Simulado” com a DRE do mês.",
        ],
      },
    ],
    dicas: [
      "A aba “CFO” responde perguntas prontas, como “Por que minha margem mudou este mês?”, com diagnóstico, evidências e plano de ação.",
      "A projeção pede ao menos três meses com lançamento. A simulação de cenário não é gravada.",
      "Tudo é calculado pelo próprio Connect, sem IA externa.",
    ],
  },

  // ─── Orçamento ────────────────────────────────────────────────────────────
  {
    chave: "dre_orcamento",
    titulo: "Orçamento",
    caminhos: ["/dre/orcamento"],
    resumo:
      "Orçamento anual de cada empresa por grupo da DRE, mês a mês, com versões. A versão aprovada é comparada com o realizado na DRE econômica e nas análises.",
    secoes: [
      {
        titulo: "Criar uma versão do orçamento",
        passos: [
          "Escolha a empresa em “Buscar empresa…”, digite o ano e clique em “Aplicar”.",
          "Clique em “Nova versão”, no topo da tela, e dê o nome em “Nome da versão”.",
          "Em “Partir de”, escolha “Grade vazia”, “Outra versão, com reajuste” ou “Realizado de um ano, com reajuste”.",
          "Se partir de outra versão ou do realizado, escolha a origem e informe o “Reajuste” em percentual.",
          "Clique em “Criar versão”.",
        ],
      },
      {
        titulo: "Preencher a grade",
        passos: [
          "Clique na aba da versão que você quer editar.",
          "Digite o valor de cada grupo em cada mês, sempre positivo: o sinal vem do grupo (receita soma, despesa subtrai).",
          "Acompanhe os totais e subtotais, que são recalculados enquanto você digita.",
          "Clique em “Salvar grade”.",
        ],
      },
      {
        titulo: "Aprovar ou reabrir uma versão",
        passos: [
          "Abra a versão e clique em “Aprovar versão”.",
          "Confirme em “Aprovar”. Se outra versão do ano estava aprovada, ela volta a rascunho.",
          "Clique em “Ver orçado × realizado” para conferir a comparação.",
          "Para mudar uma versão aprovada, clique em “Reabrir” e confirme.",
        ],
      },
    ],
    dicas: [
      "Só há uma versão aprovada por ano, e ela fica somente leitura.",
      "Aprovar e reabrir são só da coordenação do setor. Enquanto a versão estiver reaberta, o orçado some das telas de DRE.",
      "O orçamento é da empresa inteira: não há orçado por centro de custo nem por categoria.",
    ],
  },

  // ─── Autorizações de acesso ───────────────────────────────────────────────
  {
    chave: "fiscal_autorizacoes",
    titulo: "Autorizações de acesso",
    caminhos: ["/autorizacoes"],
    resumo:
      "Quais clientes já autorizaram o escritório na Receita Federal (a antiga procuração do e-CAC), quem falta pedir, o que está esperando validação no Portal e o que vai vencer. A tela não fala com a Receita: a situação é marcada pelo setor.",
    secoes: [
      {
        titulo: "Ver quem falta",
        passos: [
          "Abra “Autorizações de acesso” na barra lateral do setor Fiscal.",
          "A lista abre em “Pendentes”, com o mais urgente em cima: o que precisa ser validado no Portal, o que caiu ou venceu, o que vence em 60 dias e o que falta pedir.",
          "Clique nos cartões “Validar no Portal”, “Falta pedir”, “Com o cliente” ou “Ativas” para ver só aquele grupo.",
          "Para filtrar por regime (por exemplo, só o Simples Nacional), clique em “Filtros” e escolha em “Regime”.",
          "Cada linha é uma raiz de CNPJ: a autorização dada pela matriz vale para as filiais, que aparecem embaixo do nome.",
        ],
      },
      {
        titulo: "Pedir a autorização ao cliente",
        passos: [
          "Clique em “Como pedir ao cliente”.",
          "Na primeira vez, a coordenação do setor clica em “Definir”, em “Quem recebe as autorizações”, e informa o nome e o CNPJ do escritório contábil. É esse CNPJ que vai no texto.",
          "Clique em “Copiar texto”.",
          "Mande o texto ao cliente pelo WhatsApp ou por e-mail. Ele traz o passo a passo do Portal de Serviços da Receita, com o CNPJ do escritório.",
          "Na linha do cliente, clique em “Atualizar”, escolha “Pedida ao cliente” e clique em “Salvar”.",
        ],
      },
      {
        titulo: "Registrar o cadastro e a validação",
        passos: [
          "Quando o cliente avisar que cadastrou, clique em “Atualizar”, escolha “Cliente cadastrou (falta validar)” e informe o dia. A tela mostra até quando validar.",
          "Valide no Portal de Serviços da Receita, aba “Recebidas”, em até 30 dias. Depois disso a autorização cai e o cliente precisa cadastrar de novo.",
          "De volta ao Connect, clique em “Atualizar”, escolha “Validada” e preencha “Válida até” com a data do Portal.",
          "Se o cliente escolheu só alguns serviços, desmarque “Todos os serviços” e informe os códigos.",
        ],
      },
      {
        titulo: "Atualizar vários clientes de uma vez",
        passos: [
          "Clique em “Atualizar em lote”.",
          "Cole os CNPJs (por exemplo, os da aba “Recebidas” do Portal). Pode colar com nome, pontuação e em qualquer ordem.",
          "Escolha a situação e as datas, e clique em “Atualizar”.",
          "Confira o resultado: quantos clientes foram atualizados e quais documentos não têm empresa no Connect.",
        ],
      },
      {
        titulo: "Conferir no Serpro",
        passos: [
          "Com o Serpro ligado (Administração › Integrações), abra “Atualizar” num cliente e clique em “Conferir no Serpro”. A situação é atualizada com o que o Serpro disser.",
          "Para conferir todos, clique em “Conferir no Serpro” no topo da tela, confira o custo e o teto do mês e confirme.",
          "A conferência roda aos poucos, em lotes a cada 15 minutos. O andamento aparece no topo da tela e o aviso chega no sino quando terminar.",
          "Em “Consumo do Serpro” você vê as chamadas cobradas do mês, o custo estimado e o teto.",
        ],
      },
    ],
    dicas: [
      "Cada conferência no Serpro é uma consulta cobrada. Quando o mês chega no teto, o Connect para de chamar até o mês virar.",
      "O setor recebe aviso faltando 10 e 3 dias para o prazo de validação e no último dia, e 60, 30 e 7 dias antes do fim da validade.",
      "A situação também aparece na ficha da empresa, na “Visão geral”, com o botão de atualizar.",
      "Use “Não se aplica” para o cliente que não precisa (por exemplo, o MEI que só emite a guia, que dispensa autorização).",
      "Marcar e atualizar é de quem atua no setor Fiscal; os demais só consultam.",
    ],
  },

  // ─── Documentos Fiscais ───────────────────────────────────────────────────
  {
    chave: "fiscal_documentos",
    titulo: "Documentos fiscais",
    caminhos: ["/documentos-fiscais"],
    resumo:
      "Acervo das notas fiscais eletrônicas (NF-e, NFC-e e NFS-e) de cada empresa por competência. Aqui você traz o que falta e decide o que vira conta a pagar ou a receber — nada é emitido nesta tela.",
    secoes: [
      {
        titulo: "Encontrar um documento",
        passos: [
          "Use os cartões “Pendentes de decisão”, “Lançados” e “Ignorados” para ver cada grupo.",
          "Busque em “Número, contraparte ou chave de acesso” (o código de 44 dígitos da nota) e tecle Enter.",
          "Clique em “Filtros” para escolher “Empresa”, “Competência”, “Tipo” ou “Destino”.",
          "Clique no número do documento para abrir a ficha.",
        ],
      },
      {
        titulo: "Trazer notas pelo arquivo XML",
        passos: [
          "Clique em “Entrada de XML”. O XML é o arquivo eletrônico da nota.",
          "Em “Arquivos XML”, arraste ou escolha um ou mais arquivos.",
          "Deixe a “Empresa” em “Deduzir do XML”, a não ser que as duas pontas da nota sejam empresas do escritório.",
          "Clique em “Importar”.",
          "Confira o “Resultado” de cada arquivo: “Aceito”, “Duplicata”, “Inválido”, “Empresa não cadastrada” ou “Ambígua”. Clique em “Abrir” para ver o documento aceito.",
        ],
      },
      {
        titulo: "Lançar o documento no financeiro",
        passos: [
          "Na ficha do documento, vá até o quadro “Lançamento”.",
          "Escolha a “Categoria” (obrigatória quando vira conta a pagar).",
          "Confira o “Vencimento”: ele vem presumido em 30 dias, porque a nota não traz a data da duplicata.",
          "Se a empresa usa centro de custo, escolha um em “Centro de custo”.",
          "Clique em “Lançar”. A conta nasce a conferir em Contas a pagar ou a receber. Para desfazer, use “Estornar lançamento”.",
        ],
      },
      {
        titulo: "Deixar um documento fora do financeiro",
        passos: [
          "Na ficha do documento, vá até o quadro “Destino”.",
          "Clique em “Ignorado”.",
          "Em “Por que fica fora do financeiro?”, escreva o motivo.",
          "Clique em “Ignorar documento”. Para voltar atrás, clique em “Pendente”.",
        ],
      },
    ],
    dicas: [
      "Lançar, estornar e mudar o destino são só da coordenação do setor fiscal.",
      "CT-e não entra no acervo: use “Consultar CT-e” para a consulta ao vivo.",
      "Nota cancelada depois de lançada aparece com aviso na ficha, e o estorno no financeiro é manual.",
    ],
  },
];

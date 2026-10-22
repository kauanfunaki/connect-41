// Artigos da base de conhecimento: telas do financeiro (BPO, DRE e fiscal).
//
// Escritos a partir do código das telas em 02/10/2026. Os nomes entre “ ” são
// os rótulos como aparecem na tela — se um botão mudar de nome, mude aqui.

import type { ArtigoDeAjuda } from "../tipos";

export const ARTIGOS_FINANCEIROS: ArtigoDeAjuda[] = [
  // ─── Uma empresa por vez (21/10/2026) ─────────────────────────────────────
  {
    chave: "geral:empresa-por-vez",
    titulo: "Trabalhar numa empresa por vez",
    caminhos: [],
    resumo:
      "Para não lançar na empresa errada: escolha a empresa em que vai trabalhar, e as telas do financeiro passam a mostrar e gravar só ela — com a matriz e as filiais juntas —, até você trocar ou sair. É como abrir a base da empresa no Omie.",
    secoes: [
      {
        titulo: "Começar a trabalhar numa empresa",
        passos: [
          "Abra a ficha da empresa, em “Empresas”.",
          "Clique em “Trabalhar nesta empresa”, no topo da ficha.",
          "Pronto: ao abrir “Contas a pagar”, “Contas a receber”, “Lançamentos”, “Conciliação”, “Fluxo de caixa”, “Tabela dinâmica”, “Fornecedores e sacados”, “Cobrança”, “Emitir NFS-e” ou a DRE, a faixa “Trabalhando em”, logo abaixo do topo, mostra o nome da empresa.",
          "No campo “Empresa” de cada tela aparecem só a empresa, a matriz e as filiais dela. Onde a tela oferecia “Todas as empresas”, aparece “Todas da base (matriz e filiais)”.",
        ],
      },
      {
        titulo: "Trocar de empresa ou sair",
        passos: [
          "Na faixa do topo, clique em “Trocar empresa” e busque a outra empresa por nome ou CNPJ. A tela volta para o começo, já na nova empresa.",
          "Para voltar a ver todas as empresas, clique em “Sair”, na faixa. As telas abrem na última empresa que você abriu.",
          "Na ficha da empresa em que você está trabalhando, o selo “Trabalhando nesta empresa” tem o mesmo “Sair”.",
        ],
      },
      {
        titulo: "Quando algo é de outra empresa",
        passos: [
          "Um link para outra empresa (de uma notificação, por exemplo) abre a tela na empresa em que você está trabalhando, com um aviso dizendo o que o link pedia. Clique em “Sair do foco e abrir” no aviso para ver a outra.",
          "Se algo tentar gravar em outra empresa — pagar, lançar, conciliar, alterar em lote, exportar —, nada é gravado, e o Connect diz em que empresa você está. Use “Trocar empresa” ou “Sair”, na faixa do topo, e faça de novo.",
        ],
      },
    ],
    dicas: [
      "A escolha fica guardada neste navegador, por um mês: ao abrir o Connect de novo, você continua na mesma empresa. Em outro computador ou navegador, escolha de novo.",
      "A matriz e as filiais são uma base só: na empresa com filiais, você lança e confere em qualquer uma delas sem trocar.",
      "A faixa aparece só nas telas do financeiro. As outras telas do Connect continuam mostrando todas as empresas.",
    ],
  },

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
          "Clique em “Filtros” e escolha a “Situação” (“Vencidas” ou “Todas”) ou a “Competência” (o mês a que a conta pertence). A empresa se escolhe em “Empresa”, no topo: a tela abre na última empresa que você abriu, e “Todas as empresas” mostra o escritório inteiro. Trabalhando numa empresa por vez, a tela abre nela, e “Todas da base” mostra a matriz e as filiais juntas.",
          "Para refinar a lista, clique no ícone de filtro ao lado do nome da coluna, como “Vencimento”, “Fornecedor” ou “Categoria”.",
          "Contas marcadas com “sem categoria” ainda precisam ser classificadas.",
          "Na aba “Análise — atraso e ranking”, veja as “Faixas de atraso” e os “Maiores fornecedores em aberto”.",
        ],
      },
      {
        titulo: "Conferir e registrar o pagamento",
        passos: [
          "Conta com o selo “A conferir” ainda não foi revisada: clique no botão “⋯” da linha e escolha “Conferir”. Para várias de uma vez, marque as caixas à esquerda e clique em “Conferir marcadas”.",
          "Clique em “Pagar”, o botão azul da linha.",
          "Na janela, informe a data, a conta bancária e o valor. A conta corrente prevista no título já vem marcada. Não é possível usar data futura; valor menor que o da conta é um pagamento parcial, e o resto continua em aberto.",
          "Clique em “Registrar pagamento”. Registrar o pagamento é o que se chama de baixa.",
          "Se errou, clique em “Ver baixa” na linha da conta paga e em “Desfazer” no pagamento errado.",
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
        titulo: "Alterar várias contas de uma vez",
        passos: [
          "Marque a caixa à esquerda das contas, ou a do cabeçalho para marcar todas.",
          "Na barra que aparece, clique em “Alterar marcadas”.",
          "Na janela, marque o que muda — “Vencimento”, “Previsão”, “Competência”, “Categoria”, “Centro de custo”, “Projeto” ou “Conta corrente” — e escolha o novo valor. O que não for marcado fica como está em cada conta.",
          "Confira quantas contas vão mudar e as que ficam de fora, com o motivo: conta paga ou conciliada não muda o vencimento, e conta que vem do Omie se altera no Omie.",
          "Clique em “Alterar”. Para tirar o centro, o projeto ou a conta, marque o campo e escolha “Sem centro de custo”, “Sem projeto” ou “Não prevista”. Conta com rateio fica de fora quando muda a categoria, o centro ou o projeto: esses se mudam nas linhas do rateio, em “Editar”.",
        ],
      },
    ],
    dicas: [
      "Conta “Aguardando aprovação” ou “Reprovada” não pode ser paga: o botão “Pagar” fica desativado, e o motivo aparece ao passar o mouse sobre ele.",
      "Pagou o fornecedor antes da conta chegar? Escolha a empresa e, em “Adiantamentos a fornecedores”, clique em “Novo adiantamento”: o dinheiro sai do banco e fica guardado para ele, fora da DRE. Quando a conta chegar, clique em “Pagar” e escolha o adiantamento em “Saiu da conta” — a despesa entra na DRE ali, e o banco não se mexe de novo.",
      "Pagou no cartão de crédito? Cadastre o cartão uma vez, com a empresa escolhida, em “Cartões de crédito” › “Novo cartão”, com o dia em que a fatura fecha e o dia em que vence. Depois, ao pagar a conta, escolha o cartão em “Saiu da conta” (ou, ao lançar, em “Conta corrente”, com “Já pago em”): a despesa entra na DRE no dia da compra, e a compra vai para a fatura do ciclo — uma conta a pagar ao cartão, criada e somada sozinha. Pague a fatura pelo banco, como qualquer conta; é aí que o dinheiro sai no fluxo de caixa. Para tirar uma compra da fatura, desfaça a baixa da conta; a fatura que já tem pagamento não muda.",
      "Conta com “R$ X retidos” embaixo do valor tem imposto retido na fonte: o valor é o líquido, e cada imposto tem a conta dele. Para mudar uma retenção, clique em “Editar” na conta do fornecedor e abra “Retenções na fonte”; a conta do imposto acompanha enquanto não tiver baixa. Cancelar a conta do fornecedor cancela as dos impostos em aberto.",
      "As contas nascem do lançamento de um documento fiscal ou da tela “Lançamentos”. Não há botão para criar conta nesta tela.",
      "“Abrir pendência” e “Enviar para aprovação” só aparecem quando o escritório usa esses módulos.",
      "Para levar a lista para o Excel, clique em “Exportar” › “Excel”, na barra da tabela: vão a empresa, a competência e o recorte escolhidos (os funis das colunas não entram). O arquivo vem numa Tabela do Excel, com data como data e valor como número — no Excel, “Inserir” › “Tabela dinâmica” já pega a tabela. Conta rateada sai numa linha por parte do rateio. “Exportar” › “CSV” continua para outros sistemas.",
      "Enquanto a empresa é lida do Omie, a conta que veio de lá se paga, cancela e altera no Omie, e a leitura traz para cá. Depois da virada (Configurações › Integrações › Omie por empresa › “Virar para o Connect”), tudo isso passa a ser no Connect.",
      "A conta rateada no Omie chega rateada: uma linha por categoria e departamento, com o departamento no centro de custo de mesmo nome ou código. A conta com um departamento só chega no centro dele. Departamento sem centro correspondente fica “Sem centro”. Até a virada, o rateio e o centro que vieram do departamento também se alteram no Omie.",
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
          "Clique em “Filtros” e escolha a “Situação” (“Vencidas” ou “Todas”) ou a “Competência” (o mês a que a conta pertence). A empresa se escolhe em “Empresa”, no topo: a tela abre na última empresa que você abriu, e “Todas as empresas” mostra o escritório inteiro. Trabalhando numa empresa por vez, a tela abre nela, e “Todas da base” mostra a matriz e as filiais juntas.",
          "Para refinar a lista, clique no ícone de filtro ao lado do nome da coluna, como “Vencimento”, “Cliente” ou “Categoria”.",
          "Na aba “Análise — atraso e ranking”, veja as “Faixas de atraso” e os “Maiores clientes em aberto”.",
        ],
      },
      {
        titulo: "Conferir e registrar o recebimento",
        passos: [
          "Conta com o selo “A conferir” ainda não foi revisada: clique no botão “⋯” da linha e escolha “Conferir”. Para várias de uma vez, marque as caixas à esquerda e clique em “Conferir marcadas”.",
          "Clique em “Receber”, o botão azul da linha.",
          "Na janela, informe a data, a conta bancária e o valor. A conta corrente prevista no título já vem marcada. Não é possível usar data futura; valor menor que o da conta é um recebimento parcial, e o resto continua em aberto.",
          "Clique em “Registrar recebimento”. Registrar o recebimento é o que se chama de baixa.",
          "Se errou, clique em “Ver baixa” na linha da conta recebida e em “Desfazer” no recebimento errado.",
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
        titulo: "Alterar várias contas de uma vez",
        passos: [
          "Marque a caixa à esquerda das contas, ou a do cabeçalho para marcar todas.",
          "Na barra que aparece, clique em “Alterar marcadas”.",
          "Na janela, marque o que muda — “Vencimento”, “Previsão”, “Competência”, “Categoria”, “Centro de custo”, “Projeto” ou “Conta corrente” — e escolha o novo valor. O que não for marcado fica como está em cada conta.",
          "Confira quantas contas vão mudar e as que ficam de fora, com o motivo: conta paga ou conciliada não muda o vencimento, e conta que vem do Omie se altera no Omie.",
          "Clique em “Alterar”. Para tirar o centro, o projeto ou a conta, marque o campo e escolha “Sem centro de custo”, “Sem projeto” ou “Não prevista”. Conta com rateio fica de fora quando muda a categoria, o centro ou o projeto: esses se mudam nas linhas do rateio, em “Editar”.",
        ],
      },
    ],
    dicas: [
      "As contas nascem do lançamento de um documento fiscal ou da tela “Lançamentos”. Não há botão para criar conta nesta tela.",
      "Conta “Renegociada” ou “Perda” saiu do em aberto pela tela “Cobrança” (acordo ou baixa por perda).",
      "O cliente pagou antes da conta a receber? Escolha a empresa e, em “Adiantamentos de clientes”, clique em “Novo adiantamento”. Depois, ao receber a conta, escolha o adiantamento em “Entrou na conta”.",
      "Para levar a lista para o Excel, clique em “Exportar” › “Excel”, na barra da tabela: vão a empresa, a competência e o recorte escolhidos (os funis das colunas não entram). O arquivo vem numa Tabela do Excel, com data como data e valor como número — no Excel, “Inserir” › “Tabela dinâmica” já pega a tabela. Conta rateada sai numa linha por parte do rateio. “Exportar” › “CSV” continua para outros sistemas.",
      "Enquanto a empresa é lida do Omie, a conta que veio de lá se paga, cancela e altera no Omie, e a leitura traz para cá. Depois da virada (Configurações › Integrações › Omie por empresa › “Virar para o Connect”), tudo isso passa a ser no Connect.",
      "A conta rateada no Omie chega rateada: uma linha por categoria e departamento, com o departamento no centro de custo de mesmo nome ou código. A conta com um departamento só chega no centro dele. Departamento sem centro correspondente fica “Sem centro”. Até a virada, o rateio e o centro que vieram do departamento também se alteram no Omie.",
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
          "Em “Empresa”, no topo da tela, escolha a empresa. A tela troca sozinha e, da próxima vez, já abre na última empresa que você abriu — ou, trabalhando numa empresa por vez, nela.",
          "Clique em “Novo lançamento”, no topo da tela.",
          "Em “Tipo”, escolha “Conta a pagar” ou “Conta a receber” e selecione o “Fornecedor” ou o “Cliente (sacado)”. Se ele ainda não existe, escolha “+ Cadastrar nova contraparte”.",
          "Escolha a “Categoria” (obrigatória em conta a pagar) e preencha “Competência” (o mês a que a conta pertence), “Vencimento” e “Valor”.",
          "Se a conta deve ser paga em outro dia que não o vencimento, informe a “Previsão”: o fluxo de caixa projeta por ela.",
          "Para dividir a conta entre categorias, centros de custo ou projetos, clique em “Ratear”, ao lado de “Categoria”. Monte as linhas por valor ou por percentual; embaixo aparece o que falta para fechar o valor da conta. A DRE soma cada linha na categoria dela.",
          "Se a nota de um serviço tomado tem imposto retido (IRRF, PIS, COFINS, CSLL, INSS ou ISS), abra “Retenções na fonte” e informe cada um. O “Valor” passa a ser o bruto da nota, a conta do fornecedor fica no líquido, e cada imposto ganha a conta dele, a pagar à Receita (ou à prefeitura, no ISS), vencendo no dia 20 do mês seguinte (o ISS, no dia 10).",
          "Se quiser, escolha a “Conta corrente” por onde a conta deve ser paga ou recebida: a baixa já vem com ela.",
          "Se a conta já foi paga ou recebida, informe a data em “Já pago em” ou “Já recebido em”. Se não, deixe em branco.",
          "Clique em “Lançar”. A conta já aparece em Contas a pagar ou a receber e na DRE.",
        ],
      },
      {
        titulo: "Repetir uma conta (aluguel, folha, mensalidade)",
        passos: [
          "No lançamento, abra o bloco “Repetir” e escolha a “Frequência”: todo mês, a cada 15 dias, toda semana, todo ano ou todo dia útil.",
          "Em “Termina”, escolha “Depois de algumas vezes” e informe o total em “Quantas vezes”, contando esta; “Até uma data” e informe o último vencimento em “Até”; ou “Sem data de fim”.",
          "Em “Em fim de semana ou feriado”, escolha adiar, antecipar ou manter a data. No todo dia útil, o fim de semana e o feriado já ficam de fora.",
          "Clique em “Lançar”. Com número de vezes, todas as contas nascem junto. Até uma data ou sem fim, nascem as do próximo ano (dois meses no todo dia útil), e as seguintes nascem sozinhas conforme o tempo anda, copiando a última conta da série.",
          "Nas listas, a posição na série aparece antes da descrição, como “3/12”, ou “3/∞” na sem fim. Cada conta se edita, paga e cancela sozinha.",
          "Para parar a série, clique em “Cancelar” numa das contas e escolha “Esta e as próximas da série”. As anteriores e a já paga não mudam, e nenhuma conta nova nasce depois.",
        ],
      },
      {
        titulo: "Importar lançamentos de uma planilha",
        passos: [
          "Confira a empresa em “Empresa” e clique em “Importar CSV”, no topo da tela.",
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
          "Escolha a empresa em “Empresa”; depois o mês, e clique em “Aplicar”.",
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

  // ─── Tabela dinâmica (20/10/2026) ─────────────────────────────────────────
  {
    chave: "bpo_tabela_dinamica",
    titulo: "Tabela dinâmica",
    caminhos: ["/tabela-dinamica"],
    resumo:
      "Monta as contas e as baixas em linhas e colunas — por categoria, fornecedor, centro de custo, mês — e soma o valor, o pago, o saldo ou a quantidade, como as tabelas dinâmicas do Omie. Tem visões prontas e leva tudo para o Excel.",
    secoes: [
      {
        titulo: "Abrir uma visão pronta",
        passos: [
          "Em “Empresa”, no topo, escolha a empresa ou “Todas as empresas” (“Todas da base”, trabalhando numa empresa por vez).",
          "Clique numa das visões prontas, como “Despesas por categoria” ou “A pagar por fornecedor”. A tabela se monta com a configuração dela.",
          "Ajuste o que quiser no quadro de configuração e clique em “Aplicar”.",
        ],
      },
      {
        titulo: "Montar a sua tabela",
        passos: [
          "Em “Base”, escolha “Contas” (os títulos, pela competência ou pelo vencimento) ou “Baixas” (o que entrou e saiu de verdade, pelo mês do pagamento).",
          "Em “Linhas”, escolha o que fica à esquerda — até dois níveis, como “Centro de custo” e depois “Categoria”. Em “Colunas”, o que fica no topo, como o mês.",
          "Em “Valor”, escolha o que somar: valor, pago ou recebido, saldo em aberto, entradas menos saídas ou a quantidade.",
          "Filtre pelo tipo (a pagar ou a receber), pelo período e, nas contas, pela situação. Clique em “Aplicar”.",
          "Com dois níveis de linha, clique numa linha para abrir o detalhe dela.",
        ],
      },
      {
        titulo: "Levar para o Excel",
        passos: [
          "Clique em “Exportar Excel”, acima da tabela. Vai a mesma configuração da tela.",
          "O arquivo traz três abas: a tabela montada, os dados linha a linha numa Tabela do Excel (para você fazer a sua tabela dinâmica lá) e os filtros usados.",
        ],
      },
    ],
    dicas: [
      "Conta com rateio entra em cada categoria, centro e projeto pela parte dela; na quantidade, conta uma vez só.",
      "A tela mostra até 300 linhas e 36 colunas; o resto vai para “Outros”. A exportação leva tudo.",
      "O link da tela guarda a configuração: dá para salvar nos favoritos ou mandar para alguém.",
    ],
  },
  // ─── Fluxo de caixa ───────────────────────────────────────────────────────
  {
    chave: "bpo_fluxo_caixa",
    titulo: "Fluxo de caixa",
    caminhos: ["/fluxo-de-caixa"],
    resumo:
      "Mostra o que entrou e saiu nos últimos meses e o que as contas em aberto indicam que vai entrar e sair, uma empresa por vez — e, na aba “Por empresa”, todas lado a lado.",
    secoes: [
      {
        titulo: "Ver o realizado e a projeção",
        passos: [
          "Em “Empresa”, no topo, escolha a empresa — o realizado e a projeção são de uma empresa por vez. A soma de todas, mês a mês, fica na aba “Por empresa” — trabalhando numa empresa por vez, só a matriz e as filiais dela.",
          "Escolha o mês e clique em “Aplicar”.",
          "Na aba “Realizado e projeção”, o quadro “Saldo das contas” mostra o saldo bancário que vem da conciliação.",
          "A tabela do realizado traz entradas, saídas e saldo dos seis meses até o mês escolhido, pela data em que as contas foram pagas ou recebidas.",
          "Os cartões da projeção somam o que vence de hoje até 7, 15, 30, 60, 90 e 180 dias: o que há a receber menos o que há a pagar. Conta com “Previsão” entra na data prevista, não no vencimento.",
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
          "Em “Empresa”, no topo da tela, escolha a empresa. A tela troca sozinha e, da próxima vez, já abre na última empresa que você abriu — ou, trabalhando numa empresa por vez, nela.",
          "Clique em “Nova conta”.",
          "Preencha “Nome da conta”, “Tipo”, “Banco (COMPE)” (o código do banco, como 001 ou 341), “Agência” e “Conta com dígito”.",
          "O “Tipo” diz o que a conta faz. “Com extrato” (conta corrente, poupança, conta de pagamento, conta garantida, aplicação) importa OFX e concilia. “Dinheiro sem extrato” (caixinha, carteira virtual) entra no saldo e no fluxo de caixa pelas baixas feitas por ela. “Fora do caixa” (empréstimo, mútuo, crediário, administradora de cartões) não é dinheiro da empresa: fica fora do saldo bancário e do fluxo, e o dinheiro anda quando se transfere entre ela e o banco, na linha do extrato. Sem extrato, banco e número são opcionais.",
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
    caminhos: ["/fornecedores-e-sacados"],
    resumo:
      "Cadastro das contrapartes de cada empresa cliente: fornecedores (de quem ela compra) e sacados (os clientes que pagam a ela), além dos centros de custo e do plano de contas da empresa.",
    secoes: [
      {
        titulo: "Cadastrar um fornecedor ou sacado",
        passos: [
          "Abra “Cadastros” na barra lateral e clique na aba “Fornecedores e sacados”. A aba só aparece para quem é do BPO.",
          "Em “Empresa”, no topo da tela, escolha a empresa. A tela troca sozinha e, da próxima vez, já abre na última empresa que você abriu — ou, trabalhando numa empresa por vez, nela.",
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
          "Escolha a empresa em “Empresa”. A tela troca sozinha.",
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
          "Ao abrir a tela, a lista à esquerda mostra as empresas que já têm conversa, com a última mensagem. As que estão esperando o escritório vêm primeiro.",
          "O selo “Esperando o escritório” indica que o cliente escreveu por último.",
          "Clique na empresa para abrir a conversa no painel ao lado. Use ↑ e ↓ para passar para a anterior ou a próxima, e o X para fechar.",
          "Para falar com outra empresa, escolha-a em “Empresa”, no topo. A tela troca sozinha.",
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

  // ─── Painel da carteira (22/10/2026) ──────────────────────────────────────
  {
    chave: "bpo_painel_carteira",
    titulo: "Painel da carteira",
    caminhos: ["/carteira-bpo"],
    resumo:
      "Mostra, numa linha por empresa atendida pelo BPO, o que pede atenção: contas vencidas a pagar e a receber, dias sem extrato, linhas a conciliar, saldo que não bate, pendências, aprovações e o último acesso do cliente ao portal.",
    secoes: [
      {
        titulo: "Achar a empresa que precisa de você",
        passos: [
          "Abra “Painel da carteira”. A lista começa pelas empresas mais urgentes: as que somam mais contas vencidas e linhas a conciliar.",
          "Os cartões do topo somam a carteira que está na tela — com o filtro de analista, só as empresas dele.",
          "Clique no nome de uma coluna para ordenar por ela; clique de novo para inverter. No celular, a ordem fica em “Filtros”, em “Ordem”.",
          "Busque pelo nome da empresa ou pelo CNPJ no campo de busca.",
        ],
      },
      {
        titulo: "Filtrar pelo analista",
        passos: [
          "Quem é o analista de alguma empresa abre o painel nas suas empresas (“Minhas empresas”).",
          "Clique em “Filtros”, depois em “Analista”, e escolha “Todos os analistas”, “Sem analista” ou uma pessoa.",
          "O analista é o responsável do serviço do BPO na ficha da empresa.",
        ],
      },
      {
        titulo: "Ir direto ao que resolver",
        passos: [
          "Clique no valor vencido para abrir “Contas a pagar” ou “Contas a receber” já na empresa, só nas vencidas.",
          "Clique nos dias sem extrato, nas linhas a conciliar ou no saldo que não bate para abrir a “Conciliação bancária” da empresa.",
          "Clique nas pendências ou nas aprovações para abrir a fila delas já filtrada na empresa.",
        ],
      },
    ],
    dicas: [
      "A carteira são as empresas com o serviço do BPO ativo. Empresa inativa ou que saiu não aparece.",
      "“Sem conta” quer dizer que a empresa não tem conta bancária com extrato cadastrada; “nunca”, que tem conta e nenhum extrato foi importado.",
      "O painel mostra a carteira inteira mesmo quando você está trabalhando numa empresa por vez.",
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
          "A fila abre na última empresa que você abriu (ou na empresa em que você está trabalhando); troque em “Empresa”, no topo, ou escolha “Todas as empresas”. Clique em “Filtros” para escolher “Atraso”, “Situação” ou “Responsável” (“Meus” mostra só os seus).",
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
      "Cadastrar e editar é da coordenação do setor. Excluir é só do Administrador ou do Super Admin, e não pode ser desfeito.",
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
      "Excluir documento, página ou capa é só do Administrador ou do Super Admin e não pode ser desfeito. Excluir um documento remove todas as páginas dele.",
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
          "Em “Empresa”, no topo da tela, escolha a empresa. A tela troca sozinha e, da próxima vez, já abre na última empresa que você abriu — ou, trabalhando numa empresa por vez, nela.",
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
        titulo: "Escolher onde entram os impostos",
        passos: [
          "No modelo padrão, ao lado dos filtros, clique em “Impostos no EBITDA” (o padrão) ou em “Impostos fora do resultado”.",
          "Em “Impostos no EBITDA”, os impostos sobre a receita descontam do “Gerador de caixa (EBITDA)” e do resultado líquido.",
          "Em “Impostos fora do resultado”, eles aparecem só na receita líquida; o aviso em amarelo mostra quanto ficou de fora.",
          "A escolha vai junto ao trocar de mês, de aba e de empresa, e também para o arquivo de “Exportar”.",
        ],
      },
      {
        titulo: "Trocar o modelo do DRE da empresa",
        passos: [
          "Com a empresa escolhida, clique em “Modelo”, ao lado dos filtros. O botão diz o modelo em uso: “Padrão” ou “Customizado”.",
          "Leia a descrição de cada modelo e escolha o que a empresa usa. O painel mostra o que muda antes de gravar: de onde sai o grupo de cada categoria e quais ficam para classificar.",
          "Clique em “Usar este modelo”. O DRE, a DRE econômica, as análises, o orçamento e a exportação da empresa passam a usar os grupos e as linhas do modelo.",
          "Se alguma categoria ficou sem grupo, clique em “Classificar” e escolha o grupo dela no modelo novo.",
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
      "O modelo do DRE é de cada empresa: o padrão, ou um customizado como o de despesas por área. Só a coordenação do setor troca o modelo.",
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
          "Escolha a empresa em “Empresa” (a tela troca sozinha); depois o mês, e clique em “Aplicar”.",
          "Escolha a visão nas abas: “Mês”, “Acumulado no ano” ou “Últimos 12 meses”.",
          "Leia os cartões do topo: “Receita bruta”, “Margem de contribuição”, “Resultado operacional (EBITDA)” e “Resultado do período”.",
          "No modelo padrão, para tirar os impostos sobre a receita do resultado, clique em “Impostos fora do resultado”, ao lado dos filtros. “Impostos no EBITDA” é o padrão.",
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
          "Escolha a empresa em “Empresa” (a tela troca sozinha); depois o mês, e clique em “Aplicar”.",
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
          "Ajuste os percentuais de “Receita”, “Custo operacional além da receita”, “Custo administrativo” e “Financiamentos e empréstimos”.",
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
          "Escolha a empresa em “Empresa” (a tela troca sozinha); depois digite o ano e clique em “Aplicar”.",
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
          "Com o Serpro ligado (Configurações › Integrações), abra “Atualizar” num cliente e clique em “Conferir no Serpro”. A situação é atualizada com o que o Serpro disser.",
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
          "O acervo mostra uma empresa por vez: escolha em “Empresa”, no topo (a tela abre na última empresa que você abriu). Clique em “Filtros” para escolher “Competência”, “Tipo” ou “Destino”.",
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

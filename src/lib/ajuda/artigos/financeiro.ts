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
      {
        titulo: "Pagar várias contas de uma vez",
        passos: [
          "Marque a caixa à esquerda das contas e clique em “Pagar marcadas”, na barra que aparece.",
          "Informe a data do pagamento e, para cada empresa, a conta de onde o dinheiro saiu.",
          "Para cobrar o atraso, marque “Calcular juros e multa pelo atraso”: vale a regra de cada conta — a do fornecedor, senão a da empresa —, do vencimento dela até a data informada, e o desconto vale para quem paga até o vencimento.",
          "Confira o total e clique no botão “Pagar”, que diz quantas contas e quanto. Cada conta é paga pelo saldo; para juros digitados à mão ou pagamento parcial, use o “Pagar” da linha.",
        ],
      },
    ],
    dicas: [
      "Na baixa, a conta em “Saiu da conta” é a que a conciliação procura no extrato. Juros e multa vão para a categoria de encargos, e o desconto para a de descontos.",
      "Na aba “Análise”, a conta que vence hoje conta como a vencer.",
      "Conta “Aguardando aprovação” ou “Reprovada” não pode ser paga: o botão “Pagar” fica desativado, e o motivo aparece ao passar o mouse sobre ele.",
      "Pagou o fornecedor antes da conta chegar? Escolha a empresa e, em “Adiantamentos a fornecedores”, clique em “Novo adiantamento”: o dinheiro sai do banco e fica guardado para ele, fora da DRE. Quando a conta chegar, clique em “Pagar” e escolha o adiantamento em “Saiu da conta” — a despesa entra na DRE ali, e o banco não se mexe de novo.",
      "Pagou no cartão de crédito? Cadastre o cartão uma vez, com a empresa escolhida, em “Cartões de crédito” › “Novo cartão”, com o dia em que a fatura fecha e o dia em que vence. Depois, ao pagar a conta, escolha o cartão em “Saiu da conta” (ou, ao lançar, em “Conta corrente”, com “Já pago em”): a despesa entra na DRE no dia da compra, e a compra vai para a fatura do ciclo — uma conta a pagar ao cartão, criada e somada sozinha. Pague a fatura pelo banco, como qualquer conta; é aí que o dinheiro sai no fluxo de caixa. Para tirar uma compra da fatura, desfaça a baixa da conta; a fatura que já tem pagamento não muda. Mudar o dia de fechamento ou de vencimento do cartão vale para as próximas compras: a que já está numa fatura fica nela.",
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
      {
        titulo: "Receber várias contas de uma vez",
        passos: [
          "Marque a caixa à esquerda das contas e clique em “Receber marcadas”, na barra que aparece.",
          "Informe a data do recebimento e, para cada empresa, a conta em que o dinheiro entrou.",
          "Para cobrar o atraso, marque “Calcular juros e multa pelo atraso”: vale a regra de cada conta — a do cliente, senão a da empresa —, do vencimento dela até a data informada, e o desconto vale para quem paga até o vencimento.",
          "Confira o total e clique no botão “Receber”, que diz quantas contas e quanto. Cada conta é recebida pelo saldo; para juros digitados à mão ou recebimento parcial, use o “Receber” da linha.",
        ],
      },
    ],
    dicas: [
      "As contas nascem do lançamento de um documento fiscal ou da tela “Lançamentos”. Não há botão para criar conta nesta tela.",
      "Na baixa, a conta em “Entrou na conta” é a que a conciliação procura no extrato. Juros e multa vão para a categoria de encargos, e o desconto para a de descontos.",
      "Na aba “Análise”, a conta que vence hoje conta como a vencer.",
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
          "Se a conta já foi paga ou recebida, informe a data em “Já pago em” ou “Já recebido em”. Se não, deixe em branco. Com a data, o valor pago em branco quita a conta; para pagamento parcial, informe o valor e acrescente os outros pagamentos, cada um com a sua data.",
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
        titulo: "Parcelar uma compra",
        passos: [
          "No lançamento, abra o bloco “Parcelar” e informe em “Parcelas” em quantas vezes. O “Valor” passa a ser o total de todas as parcelas, e o vencimento, o da 1ª parcela.",
          "Escolha para onde vão os “Centavos que sobram”, o que fazer “Em fim de semana ou feriado” e a “Competência” das parcelas: a do mês em que cada uma vence, ou a desta conta (a compra é uma só).",
          "Confira a divisão: dá para mudar o vencimento e o valor de cada parcela, e a soma precisa fechar o total.",
          "Clique em “Lançar”. Cada parcela vira uma conta em aberto, com o mesmo número de documento, ligada às outras pela série (“3/12”). Cada uma se edita, paga e cancela sozinha.",
          "Para mudar o valor ou o dia de todas as próximas de uma vez, use “Mudar daqui em diante”, ao lado de “Editar”.",
        ],
      },
      {
        titulo: "Exportar as baixas para a Domínio",
        passos: [
          "Na lista de lançamentos, escolha a empresa e o mês e clique em “Exportar”.",
          "Em “De-para da empresa”, preencha o código Matriz/Filial e a conta contábil da Domínio de cada banco, categoria e fornecedor que as baixas do mês usam, e clique em “Salvar de-para”. A baixa com alguma conta faltando fica fora do arquivo.",
          "Clique em “Domínio (.xlsx)” ou “Domínio (.txt)” e importe na Domínio pela importação de lançamentos.",
          "Se algo mudou depois, baixe a “Correção”: ela leva só as baixas novas e o estorno das que saíram ou mudaram. Baixar o mês inteiro de novo duplica na Domínio o que já foi importado.",
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
      "Editar muda a classificação a qualquer momento; o valor e o vencimento, só com a conta em aberto.",
      "Na série que se repete, cada conta nasce em aberto, com o mesmo valor, contraparte e categoria, e a competência anda com o mês do vencimento; os feriados são os de Configurações › Feriados. Na série até uma data ou sem fim, o que você mudar numa conta vale para as que nascerem depois.",
      "Com retenção na fonte, o rateio e as parcelas são digitados sobre o bruto: cada parcela fica com a parte dela das retenções e paga o líquido dela, e o rateio guarda as linhas na proporção do líquido.",
      "Na planilha CSV: uma linha por conta, separada por vírgula ou ponto e vírgula, com datas em dd/mm/aaaa ou aaaa-mm-dd. Competência em branco herda o mês do vencimento. A categoria precisa existir no plano de contas com o mesmo tipo. O centro de custo casa pelo nome ou pelo código de um centro ativo; em branco, vale o centro padrão da contraparte. Linha igual a um lançamento que já existe é ignorada.",
    ],
  },

  // ─── Tabela dinâmica (20/10/2026; campos e áreas em 16/11/2026, melhoria-719) ─
  {
    chave: "bpo_tabela_dinamica",
    titulo: "Tabela dinâmica",
    caminhos: ["/tabela-dinamica"],
    resumo:
      "Monta as contas e as baixas em linhas e colunas — por categoria, fornecedor, centro de custo, mês — e soma o valor, o pago, o saldo ou a quantidade, como as tabelas dinâmicas do Omie e do Excel. Você escolhe os campos e onde cada um fica, e a tabela muda na hora. Tem visões prontas e leva tudo para o Excel.",
    secoes: [
      {
        titulo: "Abrir uma visão pronta",
        passos: [
          "Em “Empresa”, no topo, escolha a empresa ou “Todas as empresas” (“Todas da base”, trabalhando numa empresa por vez).",
          "Clique em “Visões prontas”, na barra, e escolha uma, como “Despesas por categoria” ou “A pagar por fornecedor”. A tabela se monta com a configuração dela, e o botão passa a mostrar o nome da visão.",
          "Ajuste o que quiser nos campos e nos filtros: a tabela acompanha cada mudança.",
        ],
      },
      {
        titulo: "Montar a sua tabela",
        passos: [
          "Na barra, escolha a base: “Contas” (os títulos, pela competência ou pelo vencimento) ou “Baixas” (o que entrou e saiu de verdade, pelo mês do pagamento).",
          "Em “Campos”, clique no “+” do campo e escolha “Em linhas” (fica à esquerda) ou “Em colunas” (fica no topo, como o mês). O campo em uso aparece marcado com o lugar onde está.",
          "Em “Linhas” cabem até três campos, um dentro do outro — como “Centro de custo”, depois “Categoria”, depois “Fornecedor ou cliente”. Use as setas da ficha para subir ou descer um campo, e o “x” para tirar.",
          "Em “Colunas” fica um campo só; sem nenhum, a tabela mostra só o total.",
          "Em “Valores”, escolha o que somar: valor, pago ou recebido, saldo em aberto, entradas menos saídas ou a quantidade.",
          "Clique em “Filtros” para escolher o tipo (a pagar ou a receber), o período e, nas contas, a situação. O que está filtrado aparece ao lado do botão, com um “x” para tirar.",
          "Com mais de um campo nas linhas, clique numa linha da tabela para abrir o detalhe dela.",
        ],
      },
      {
        titulo: "Levar para o Excel",
        passos: [
          "Clique em “Exportar Excel”, na barra. Vai a mesma configuração da tela.",
          "O arquivo traz três abas: a tabela montada, os dados linha a linha numa Tabela do Excel (para você fazer a sua tabela dinâmica lá) e os filtros usados.",
        ],
      },
    ],
    dicas: [
      "Não há botão de aplicar: cada escolha já refaz a tabela. A de antes fica esmaecida por um instante, até a nova chegar.",
      "Conta com rateio entra em cada categoria, centro e projeto pela parte dela; na quantidade, conta uma vez só.",
      "A tela mostra até 300 linhas e 36 colunas; o resto vai para “Outros”. A exportação leva tudo.",
      "As linhas precisam de pelo menos um campo: o último não sai, só troca de lugar com o das colunas.",
      "Marque “Sem período”, em “Filtros”, para ver o histórico inteiro.",
      "O link da tela guarda a configuração: dá para salvar nos favoritos ou mandar para alguém. Os links salvos antes continuam abrindo a mesma tabela.",
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
      "A projeção só considera o que já está lançado. Com saldo nas contas, o saldo projetado soma o saldo das contas ao que vence em cada janela.",
      "Na tabela do realizado, o acumulado soma os saldos a partir do primeiro mês da tabela: é movimento de lançamentos, não o saldo da conta, que está no quadro “Saldo das contas”.",
      "Na aba “Por empresa”, pago e recebido vão pela data da baixa, e as vencidas são a posição de hoje. Empresa sem movimento no mês e sem conta vencida não aparece.",
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
        titulo: "Lançar o que se repete com uma regra",
        passos: [
          "Na conciliação, clique em “Regras de conciliação” e em “Nova regra”. Ou, depois de criar o lançamento de uma linha, clique em “Criar regra” — a regra já vem com os dados dela.",
          "Em “Quando a linha do extrato…”, diga se é saída ou entrada, o texto que o histórico ou o favorecido contém, o valor e a conta.",
          "Em “…lançar como”, escolha o fornecedor ou o cliente, a categoria e, se quiser, o centro de custo, o projeto e a descrição.",
          "Em “O que a regra faz”, escolha “Sugerir” (a regra aparece na linha e alguém confirma) ou “Lançar sozinha” (lança e concilia ao importar o extrato) e clique em “Criar regra”.",
          "Para as linhas que já estão pendentes, clique em “Aplicar às pendentes”, confira a prévia, desmarque o que não for e clique em “Lançar”.",
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
      "Reimportar o mesmo período não duplica nada. O arquivo OFX precisa ser da conta selecionada. Tipo, banco e número da conta não mudam depois do primeiro extrato importado: são eles que conferem o arquivo.",
      "A sugestão aparece só quando um lançamento de mesmo valor se destaca pela data e pelo nome: nada é conciliado sem confirmação.",
      "Em “Escolher lançamentos”, dá também para marcar uma conta só e lançar a diferença como juros, desconto ou baixa parcial.",
      "“Criar lançamento”, a transferência e a regra fazem o lançamento já pago no dia da linha, com o valor dela e a competência do mês dela, e já conciliado. Na transferência nascem os dois lados — a saída de uma conta e a entrada na outra —, na categoria de transferência, fora da DRE; se o extrato da outra conta já tem a linha desse valor, ela é conciliada junto.",
      "Transação ignorada sai das pendentes, mas continua no saldo da conta: o dinheiro passou por ela.",
      "A regra em “Lançar sozinha” só sugere quando há dúvida: outra regra pega a mesma linha, há lançamento em aberto de mesmo valor, ou alguém já desfez o que ela lançou ali. Desfazer o que a regra lançou cancela o lançamento e devolve a linha às pendentes.",
      "Em conta ligada ao Omie, “Trazer do Omie” traz o que o BPO já conciliou lá no mês. É um espelho: só entra o lançamento conciliado no Omie, e conta com OFX no mesmo mês é recusada. A linha do extrato que bate no valor e no dia com uma única baixa já conciliada no Omie sai da fila sozinha, como “Conciliada no Omie”.",
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
          "Na barra lateral, clique em “Cadastros” e escolha “Fornecedores e sacados”. A tela só aparece para quem é do BPO.",
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
          "Use as abas “Fornecedores” (os cadastros com contas a pagar), “Sacados” (com contas a receber) ou “Todos”. A mesma ficha aparece nas duas primeiras quando tem contas a pagar e a receber; cadastro ainda sem conta fica só em “Todos”.",
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
      {
        titulo: "Cobrar juros e multa pelo atraso",
        passos: [
          "Clique na aba “Juros e multa”.",
          "Em “Regra da empresa”, preencha “Multa”, “Juros ao mês” e “Desconto” e clique em “Salvar regra”. Ao dar baixa com data depois do vencimento, a janela já vem com a multa e os juros calculados sobre o valor baixado; até o vencimento, com o desconto. Quem baixa ainda pode mudar.",
          "Para um fornecedor ou sacado com regra própria, clique em “Editar” na ficha dele e abra “Juros e multa por atraso”. Vazio segue a regra da empresa; com algum campo preenchido, vale a regra da ficha, e o campo vazio vale zero.",
          "As fichas com regra própria, que passam por cima da regra da empresa, aparecem em “Com regra própria”, na aba “Juros e multa”.",
        ],
      },
    ],
    dicas: [
      "Cadastro não é apagado: inativo continua nas contas antigas e deixa de aparecer no lançamento manual. A ficha é o que liga as notas e as contas de um mesmo fornecedor.",
      "O centro de custo padrão entra na próxima conta quando quem lança não escolhe um centro.",
      "Centro de custo e projeto inativos somem dos seletores e continuam no que já foi lançado; nenhum dos dois é apagado. Na importação por CSV, a coluna centro_de_custo casa pelo nome ou pelo código, e a coluna projeto, pelo nome.",
      "No plano de contas, nada é apagado: o que já foi lançado continua na DRE.",
      "A conciliação com o extrato não usa a regra de juros e multa: lá a diferença é a do banco.",
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
      "Enquanto a pendência está aberta e com prazo, a ficha dela mostra os lembretes automáticos já enviados ao cliente.",
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
          "Para anexar, clique em “Escolher arquivo” ou arraste os arquivos: dá para escolher vários de uma vez, e “Tirar” remove um da lista.",
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
      "“Sem extrato” conta os dias desde a última importação de extrato nas contas bancárias ativas; “Saldo não bate” é a conferência da conciliação, o saldo calculado contra o saldo do banco.",
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
      "Na fila, os vencidos se dividem em grupos — “Ligar hoje”, “Sem contato”, “Em cobrança, sem próxima ação”, “Aguardando o sacado” e “Contestados, em acordo e perdas”. Passe o mouse no “?” ao lado do nome do grupo para ver o que entra nele.",
      "Os e-mails da régua saem pelo servidor de e-mail do escritório, em nome da empresa credora. Na aba “Régua”, clique num passo para ver a prévia do e-mail, com um título de exemplo: o texto é o mesmo em todos os passos, só muda o tempo de atraso.",
      "A empresa tirada da régua continua na fila: só os e-mails param.",
    ],
  },

  // ─── Repositório de senhas ────────────────────────────────────────────────
  {
    chave: "bpo_senhas",
    titulo: "Repositório de senhas",
    caminhos: ["/senhas"],
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
          "Em “Quem pode ver a senha”, escolha “Todos do setor”, “Todos do setor, menos…” ou “Só eu (pessoal)”.",
          "Clique em “Criar”.",
        ],
      },
      {
        titulo: "Guardar uma senha só sua",
        passos: [
          "Clique em “Nova credencial” e preencha os dados.",
          "Em “Quem pode ver a senha”, escolha “Só eu (pessoal)”.",
          "Clique em “Criar”. A credencial aparece na lista com o selo “Pessoal”.",
          "Só você vê os dados, revela, copia e edita. O Administrador vê só que ela existe (o título e o seu nome) e nunca a senha.",
        ],
      },
      {
        titulo: "Esconder uma senha do setor de algumas pessoas",
        passos: [
          "Ao cadastrar ou editar a credencial, em “Quem pode ver a senha”, escolha “Todos do setor, menos…”.",
          "Em “Quem não vê a senha”, digite o nome e escolha a pessoa. Repita para cada uma.",
          "Clique em “Criar” ou “Salvar”.",
          "As pessoas marcadas não veem a credencial na lista e não conseguem revelar a senha. Na lista, a coordenação vê o selo “Restrita” com quantas pessoas não veem; pare o mouse em cima para ver os nomes.",
          "Para liberar de novo, edite e escolha “Todos do setor”, ou tire a pessoa da lista.",
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
      "Cada vez que alguém revela uma senha, o acesso fica registrado, também na Auditoria.",
      "Credencial do setor: cadastrar, editar e marcar quem não vê é da coordenação do setor. Excluir é só do Administrador ou do Super Admin, e não pode ser desfeito.",
      "Credencial pessoal: qualquer pessoa do setor cadastra a sua. Só quem cadastrou edita e exclui; o Administrador também pode excluí-la (quando alguém sai da equipe), sem nunca ver a senha.",
      "O Administrador e o Super Admin não podem ser marcados em “Todos do setor, menos…”: eles gerenciam todas as credenciais do setor.",
      "Para ver só as pessoais ou só as do setor, use o funil da coluna “Quem vê”.",
    ],
  },

  // ─── Repositório de manuais ───────────────────────────────────────────────
  {
    chave: "bpo_manual",
    titulo: "Repositório de manuais",
    caminhos: ["/manuais"],
    resumo:
      "Instruções internas escritas pela própria equipe, organizadas em documentos e páginas, para ninguém ficar sem saber o que fazer em ausências e férias.",
    secoes: [
      {
        titulo: "Criar uma pasta e suas páginas",
        passos: [
          "No pé da coluna de pastas, à esquerda, clique em “Nova pasta”.",
          "Digite o nome e clique em “Criar pasta”.",
          "Abaixo da pasta, clique em “Página”.",
          "Digite o título da página e tecle Enter.",
        ],
      },
      {
        titulo: "Escrever uma página",
        passos: [
          "Clique na página na lista à esquerda.",
          "Clique no título ou no texto e escreva direto na folha.",
          "Para mudar um bloco de lugar, arraste o puxador (⋮⋮) à esquerda dele: uma linha mostra onde ele vai cair, e Esc cancela. Ou clique no puxador e escolha “Mover para cima” ou “Mover para baixo”. No teclado: Alt+↑ ou Alt+↓.",
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

  // ─── Repositório de fluxos (10/11/2026) ───────────────────────────────────
  {
    chave: "bpo_fluxos",
    titulo: "Repositório de fluxos",
    caminhos: ["/fluxos"],
    resumo:
      "Os fluxogramas e as metodologias de cada setor. O setor escreve as etapas em lista — início, etapas, decisões com o Sim e o Não, voltas e fim — e o Connect desenha o fluxograma sozinho, com quem executa cada etapa.",
    secoes: [
      {
        titulo: "Criar uma pasta e um fluxo",
        passos: [
          "No pé da coluna de pastas, à esquerda, clique em “Nova pasta”, dê o nome do processo (por exemplo, “Admissão”) e clique em “Criar pasta”.",
          "Dentro da pasta, clique em “Fluxo” (ou em “Novo fluxo”, no topo), dê o nome e escolha a pasta.",
          "Clique em “Criar e escrever as etapas”: o fluxo abre na edição, já com o Início e o Fim.",
        ],
      },
      {
        titulo: "Escrever as etapas",
        passos: [
          "Use os botões “Etapa”, “Decisão”, “Volta” e “Fim”, abaixo da lista. A etapa nova entra antes do Fim.",
          "Clique numa etapa para abrir: escreva o nome, quem executa (pessoa e setor, robô, integração ou cliente), o prazo, o que entra, o que sai, o que fazer se der erro e a tela do Connect onde ela se faz.",
          "Sem destino escolhido, cada etapa segue para a seguinte da lista. Para mudar, use “Depois vai para”.",
          "Numa decisão, escolha para onde vai o “Sim” e para onde vai o “Não”.",
          "Para uma volta (refazer depois de uma pendência, por exemplo), use “Volta”, ou escolha em “Depois vai para” uma etapa de cima. O desenho mostra a volta tracejada.",
          "Mude a ordem com as setas de subir e descer, ou arrastando o puxador (⋮⋮) com o mouse. O desenho, à direita, se monta sozinho a cada mudança.",
        ],
      },
      {
        titulo: "Salvar uma versão",
        passos: [
          "Escreva a “Metodologia”: como o setor toca o processo e por quê.",
          "Escolha o “Dono” do fluxo. O “Revisado em” já vem com a data de hoje.",
          "Clique em “Salvar versão”. Se faltar algo (uma decisão sem o “Não”, uma etapa sem nome), a etapa abre com o campo marcado.",
          "Para desistir, clique em “Cancelar”. Sair da tela com mudança não salva pede confirmação.",
        ],
      },
      {
        titulo: "Ler um fluxo",
        passos: [
          "Clique no fluxo, na coluna à esquerda.",
          "Clique numa etapa do desenho (ou chegue a ela com o Tab e aperte Enter): ao lado aparecem o prazo, o que entra, o que sai, o que fazer se der erro e o link para abrir a tela no Connect.",
          "Use “Anterior” e “Próxima” para andar pelas etapas. O Esc devolve o foco para a etapa no desenho.",
          "No celular, a lista das etapas vem primeiro e o desenho embaixo, numa caixa que rola de lado.",
          "Para ver uma versão antiga, abra “Versões” e clique em “Ver esta versão”.",
        ],
      },
      {
        titulo: "Anexar arquivos",
        passos: [
          "Em “Arquivos”, clique em “Anexar arquivo” e escolha um PDF, uma imagem (PNG, JPG, WEBP) ou um .drawio, de até 10 MB.",
          "Clique no nome do PDF ou da imagem para abrir numa aba; use o botão de baixar para guardar o arquivo.",
        ],
      },
    ],
    dicas: [
      "Cada setor vê só os seus fluxos. Em “Todos os setores”, quem alcança mais de um escolhe o setor pelas abas do topo.",
      "Etapa que nenhum caminho alcança a partir do Início aparece tracejada, no pé do desenho, com um aviso.",
      "Excluir pasta, fluxo ou arquivo é só do Administrador ou do Super Admin e não pode ser desfeito. Excluir uma pasta remove os fluxos dela, com as versões e os arquivos.",
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
          "Em “Por mês”, ao lado dos filtros, o DRE abre no mês mais recente com movimento.",
          "Para ver outro mês, clique em “Filtros” e escolha o “Mês”.",
          "Confira, abaixo do relatório, quantos lançamentos entraram e se algum valor não fechou.",
        ],
      },
      {
        titulo: "Ver o ano inteiro",
        passos: [
          "Clique em “Ano inteiro”, ao lado dos filtros.",
          "Para trocar o ano, clique em “Filtros” e escolha o “Ano”.",
          "Compare os doze meses lado a lado. A coluna “Média” divide pelos meses com movimento, não por doze.",
        ],
      },
      {
        titulo: "Ver a DRE como o cliente vê",
        passos: [
          "Em “Visão”, na fileira dos filtros, clique em “Cliente”. A tela mostra a DRE da empresa como aparece no portal do cliente, só para leitura.",
          "Para o regime de competência do cliente, clique na aba “Competência”, no alto: a visão continua em “Cliente”.",
          "Para voltar, clique em “Equipe”. A empresa e o período continuam os mesmos.",
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
          "Escolher o grupo já grava, e o relatório acompanha na hora.",
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
      "O modelo do DRE vale para a empresa em todas as telas da DRE: o mês, o ano, a DRE econômica, as análises, o orçamento e a exportação.",
      "“Impostos no EBITDA” é a visão que o cliente vê no portal.",
      "Na importação do Omie, cada linha vai para o mês da data de crédito ou débito no extrato.",
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
          "Ao lado do mês, escolha o período: “Mês”, “Acumulado no ano” ou “Últimos 12 meses”.",
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
      "Para ver a competência como aparece no portal do cliente, clique em “Cliente”, em “Visão”, na fileira dos filtros. “Equipe” volta para esta tela.",
      "Título renegociado ou perdido continua como receita na competência dele; parcela de acordo não é receita, é recebimento. Acréscimo de acordo entra em outras receitas; desconto e perda, em outras despesas.",
      "No “Resultado por centro de custo”, a conta rateada entra em cada centro pela parte dela, e as linhas somam a DRE da empresa sem filtro. A perda segue o centro do título; a diferença de acordo, o centro comum dos títulos renegociados.",
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
          "Em “Análise”, ao lado do mês, escolha a análise. Ela abre na hora, com a mesma empresa e o mesmo mês.",
          "“Econômico × financeiro” põe o resultado por competência ao lado do caixa e mostra os atrasos médios.",
          "“Reconciliação lucro → caixa” explica, passo a passo, por que o lucro do mês é diferente do caixa.",
          "“Indicadores” traz rentabilidade, capital de giro, caixa e risco, com a fórmula de cada um.",
        ],
      },
      {
        titulo: "Comparar períodos ou empresas",
        passos: [
          "Em “Análise”, escolha “Comparativos”.",
          "Clique em “Filtros” e escolha a “Comparação”, como “Mês × mesmo mês do ano anterior” ou “Empresa × empresa”.",
          "Em “Regime”, escolha “Competência” ou “Caixa”.",
          "Na comparação entre empresas, escolha a outra em “Comparar com”.",
        ],
      },
      {
        titulo: "Projetar os próximos meses",
        passos: [
          "Em “Análise”, escolha “Forecast”, a projeção dos próximos meses.",
          "Clique em “Filtros” e escolha o “Método”: “Tendência linear”, “Média móvel (3 meses)” ou “Sazonalidade”.",
          "A última coluna mostra o que já está lançado vencendo em cada mês.",
        ],
      },
      {
        titulo: "Simular um cenário",
        passos: [
          "Em “Análise”, escolha “Cenários”.",
          "Em “Cenário”, escolha “Pessimista”, “Base”, “Otimista” ou “Personalizado”.",
          "Ajuste os percentuais de “Receita”, “Custo operacional além da receita”, “Custo administrativo” e “Financiamentos e empréstimos”.",
          "Compare a coluna “Simulado” com a DRE do mês.",
        ],
      },
    ],
    dicas: [
      "A análise “CFO” responde perguntas prontas, como “Por que minha margem mudou este mês?”, com diagnóstico, evidências e plano de ação.",
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
      "A situação também aparece na ficha da empresa, na “Visão geral”, no cartão “Receita Federal”, com o botão “Atualizar”.",
      "Use “Não se aplica” para o cliente que não precisa (por exemplo, o MEI que só emite a guia, que dispensa autorização).",
      "Marcar e atualizar é de quem atua no setor Fiscal; os demais só consultam.",
      "A autorização é o que o Serpro confere antes de cada consulta ou guia em nome do cliente.",
      "Em “Todos os serviços” entram também os serviços que a Receita criar depois. Desmarque só quando o cliente escolheu alguns.",
      "“Caixa Postal da Receita” traz as mensagens da Receita pelo Serpro; a lista se atualiza sozinha quando o Serpro avisa de mensagem nova. Abrir uma mensagem dá ciência da intimação, e o prazo começa a contar.",
      "“Consumo do Serpro” mostra as chamadas cobradas do mês e o custo estimado pela tabela da Loja do Serpro. A fatura que vale é a do Serpro.",
      "“Guias do mês” lista as guias emitidas pelo Connect que vencem no mês, e onde cada uma está: emitida, enviada, aberta pelo cliente, paga ou vencida.",
    ],
  },

  // ─── Calculadora da reforma ───────────────────────────────────────────────
  {
    chave: "fiscal_calculadora",
    titulo: "Calculadora da reforma",
    caminhos: ["/calculadora-tributaria"],
    resumo:
      "CBS, IBS e Imposto Seletivo de uma operação, item a item, pela calculadora oficial da Receita Federal, com a memória de cálculo. Serve para conferir uma nota e orientar o cliente; o cliente tem a versão de simulação no portal.",
    secoes: [
      {
        titulo: "Calcular uma operação",
        passos: [
          "Abra “Calculadora da reforma” na barra lateral do setor Fiscal.",
          "Em “Operação”, confira a “Data do fato gerador” (começa em hoje) e escolha a “UF” e o “Município”. Digite parte do nome para achar o município.",
          "Em cada item, digite o NCM (8 dígitos) ou a NBS (9 dígitos). Ao sair do campo, a descrição da tabela da Receita aparece embaixo.",
          "Escolha a “Classificação tributária (cClassTrib)”. A lista mostra só as que servem para NCM ou para NBS, agrupadas por CST, e o CST vem da classificação.",
          "Informe a “Base de cálculo”. “Quantidade” e “Unidade” são opcionais. Para mais itens, clique em “Adicionar item” (até 50).",
          "Clique em “Calcular”.",
        ],
      },
      {
        titulo: "A partir de 2027: as alíquotas",
        passos: [
          "Com a data em 2027 ou depois, aparecem os campos “CBS”, “IBS estadual” e “IBS municipal”: a Receita exige as alíquotas no pedido.",
          "Quando a Receita publicar as alíquotas de referência do ano, os campos vêm preenchidos com elas, e você pode mudar.",
          "Enquanto ela não publicar, informe as alíquotas do estudo. O resultado sai como “Simulado”.",
          "Até 31/12/2026 os campos não aparecem: a calculadora usa as alíquotas de teste que a Receita publicou (a nota embaixo da operação diz quais).",
        ],
      },
      {
        titulo: "Ler o resultado",
        passos: [
          "No topo do resultado ficam os totais: base de cálculo, CBS, IBS (estadual e municipal), Imposto Seletivo quando houver e o total de tributos.",
          "Cada item mostra o estado: “Calculado”, “Simulado”, “Corrigir a entrada”, “Sem cálculo da Receita” ou “Falha na calculadora”.",
          "Nos itens calculados, a tabela traz a alíquota, a redução e a alíquota efetiva de cada tributo, e o valor.",
          "Quando a Receita recusa o item, o aviso diz o que aconteceu, o que fazer e o texto da Receita com o código do erro.",
          "Clique em “Memória de cálculo” para ver como a Receita chegou ao valor, com o artigo da lei.",
        ],
      },
    ],
    dicas: [
      "Os totais somam só os itens calculados: item com erro fica de fora.",
      "Diferimento, suspensão e parte das reduções pedem o grupo de tributação regular, e produtos com Imposto Seletivo pedem os dados dele. Esta tela ainda não coleta esses grupos.",
      "O rodapé do resultado diz a versão da calculadora e a data da base da Receita usadas na conta.",
      "Contábil e BPO também podem usar a tela: o administrador compartilha o módulo com o setor em Configurações › Setores e módulos (“Compartilhar”).",
      "O cliente vê o “Simulador da reforma” no portal quando o módulo está ligado. Para deixar só a equipe usar, bloqueie a tela em Configurações › Portal do cliente › Telas liberadas antes de ligar o módulo.",
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
      "O acervo espelha o que já foi emitido: nada é emitido nesta tela. O CT-e não entra no acervo — são milhões por mês e vêm sem valor apurado, então não geram lançamento: use “Consultar CT-e” para a consulta ao vivo.",
      "Em “Consultar CT-e”, o período é pela data de rota, não pela competência — as duas não coincidem. O valor não vem na listagem, só dentro do XML de cada documento.",
      "Na entrada de XML, cada arquivo tem o seu resultado: nada é aceito ou recusado em bloco. NFS-e de município com layout próprio pode ser recusada, e o resultado diz qual campo faltou.",
      "O arquivo que o leitor não consegue ler, pela entrada de XML ou pela importação do SPED, fica guardado em “XML recusados”, com o motivo e o município — é o que mostra quais municípios fogem do ABRASF e do padrão nacional.",
      "O destino é a única decisão do escritório sobre o documento: a origem e a situação vêm de fora.",
      "O XML é a fonte. Corrigir em “Corrigir documento” faz o acervo divergir dele, e a mudança fica registrada na auditoria. Documento que já virou lançamento só se corrige depois do estorno.",
      "Nota cancelada depois de lançada aparece com aviso na ficha, e o estorno no financeiro é manual.",
    ],
  },

  // ─── Emitir NFS-e (17/11/2026, melhoria-707) ──────────────────────────────
  {
    chave: "bpo_emitir_nfse",
    titulo: "Emitir NFS-e",
    caminhos: ["/emitir-nfse"],
    resumo:
      "Pede a nota fiscal de serviço ao Omie da empresa e acompanha a resposta da prefeitura. A nota sai pelo Omie: serviço, tributação e certificado continuam no cadastro do Omie.",
    secoes: [
      {
        titulo: "Emitir uma nota",
        passos: [
          "Em “Empresa”, no topo, escolha a empresa. Só aparecem as empresas com a conta do Omie ligada em Integrações.",
          "Clique em “Nova NFS-e”. A janela lê os tomadores e os serviços do Omie da empresa.",
          "Escolha o “Tomador” e o “Serviço” e preencha o “Valor” e a “Categoria no Omie”. Se o serviço estiver sem código municipal e sem código da LC 116 no Omie, informe-os nos campos que aparecem.",
          "Se quiser, escreva a “Descrição do serviço na nota”; em branco, vale a do cadastro do serviço no Omie.",
          "Clique em “Revisar e emitir”, confira o resumo e clique em “Emitir nota”. Nada é enviado antes dessa confirmação.",
        ],
      },
      {
        titulo: "Acompanhar e cancelar",
        passos: [
          "A nota entra na lista da tela, e a resposta da prefeitura aparece em alguns minutos.",
          "Se o Omie não confirmar o envio, o Connect confere sozinho em alguns minutos: não peça de novo antes disso.",
          "Para cancelar, clique no botão “⋯” da linha, escolha “Cancelar a nota” (ou “Cancelar a OS”, quando o Omie recusou o faturamento) e confirme. A prefeitura tem prazo e regras para aceitar o cancelamento.",
        ],
      },
    ],
    dicas: [
      "A nota sai com a data do faturamento, no mês corrente: o Omie não recebe competência pela API. Para outra competência, emita pela tela do Omie.",
      "Cliente com faturamento bloqueado no Omie fica fora da lista de tomadores. A lista traz os primeiros 1.000 clientes; se não achar, use a busca no Omie que aparece embaixo do campo.",
      "Só o administrador do setor emite e cancela NFS-e; os demais acompanham o que foi pedido.",
      "A conta do Omie de cada empresa (App Key e App Secret) é cadastrada em Integrações, por quem administra o escritório.",
    ],
  },

  // ─── SPED (17/11/2026, melhoria-707) ──────────────────────────────────────
  {
    chave: "fiscal_fechamento",
    titulo: "SPED",
    caminhos: ["/sped-fiscal", "/sped-fiscal/fechamento"],
    resumo:
      "A EFD do mês em quatro etapas — Classificação, Apuração, Fechamento e Gerar SPED. As três primeiras são feitas no Connect, sobre os documentos e o arquivo do motor SPED; o arquivo é gerado pelo agente do motor do escritório.",
    secoes: [
      {
        titulo: "Classificar os produtos de entrada",
        passos: [
          "Em “Empresa”, no topo, escolha a empresa e a competência.",
          "Na etapa “Classificação”, a lista vem do maior valor para o menor. Use “Por CFOP” para ver a destinação que o de-para deu a cada CFOP e filtrar por um deles.",
          "Clique num produto para decidir a destinação, a definição do CFOP de entrada, o crédito de PIS/COFINS e o crédito de ICMS. O “?” ao lado de cada campo diz até onde vale a decisão.",
          "Para trazer documentos que já estão no acervo do Connect, use “Trazer do acervo”: os que já estão na escrituração ficam de fora, e os que estão na fila sem ser lidos ou com erro na leitura são lidos de novo.",
        ],
      },
      {
        titulo: "Gerar o arquivo",
        passos: [
          "Na etapa “Gerar SPED”, escolha o tipo do arquivo: original ou substituto (retificação).",
          "Clique em “Gerar SPED”. O pedido congela uma revisão dos dados e entra na fila; o agente do motor gera o arquivo e devolve para a tela.",
          "No EFD ICMS/IPI, vale o estabelecimento escolhido; no EFD Contribuições, a matriz e as filiais da raiz.",
          "Acompanhe o andamento na própria tela. Enquanto houver uma geração na fila ou executando, não dá para pedir outra da mesma obrigação.",
        ],
      },
    ],
    dicas: [
      "A classificação e a apuração são lidas do arquivo que o motor gera: depois de decidir, gere de novo para o arquivo levar as decisões.",
      "Os dados da empresa no perfil vêm do cadastro da empresa. Sem contabilista no cadastro, vale o padrão do escritório.",
    ],
  },

  // ─── Motor SPED (17/11/2026, melhoria-707) ────────────────────────────────
  {
    chave: "fiscal_painel",
    titulo: "Motor SPED",
    caminhos: ["/sped-fiscal/motor"],
    resumo:
      "As telas que falam direto com o motor SPED: painel, documentos e importações, classificação, apuração, conferência, execuções e SPED gerados. As gerações e validações rodam nos agentes do motor; o Connect só envia pedidos e consulta.",
    secoes: [
      {
        titulo: "Pedir uma execução ao motor",
        passos: [
          "Abra “Executar” e escolha a raiz, o estabelecimento e a competência no topo.",
          "Em “Gerar SPED”, escolha a escrituração e o tipo do arquivo e clique em “Solicitar geração”. É sempre um mês inteiro: o ICMS/IPI gera o estabelecimento escolhido, e Contribuições gera a raiz inteira pela matriz.",
          "O pedido vai para a fila do motor, e um agente executa quando estiver livre. Nada roda dentro do Connect.",
          "Acompanhe na “Fila do motor”: a lista se atualiza ao recarregar a tela, e o log de cada pedido, sozinho. O que já terminou fica em “Ver histórico”.",
        ],
      },
      {
        titulo: "Enviar documentos e cuidar da quarentena",
        passos: [
          "Em “Documentos e importações”, envie XML de NF-e, CT-e e NFS-e, PDF e imagem de documento de apoio, CSV do relatório de NFS-e ou .zip com qualquer desses.",
          "Até 25 MB vai num envio só; acima disso, até 500 MB, o Connect manda em partes de 8 MB e retoma de onde parou se a conexão cair. Duplicatas são descartadas pelo motor.",
          "Na “Quarentena”, “Resolver” marca o rejeitado como resolvido sem apagar: o XML continua guardado no motor.",
          "“Reprocessar quarentena” relê os rejeitados com os leitores de hoje e baixa os que passaram a ser legíveis. Vira um pedido na fila, e as competências com documento recuperado precisam ser geradas de novo.",
        ],
      },
      {
        titulo: "Conferir PIS e COFINS",
        passos: [
          "Em “Apuração”, aba “Fechamento”, os documentos fiscais vêm do índice de documentos e, no CT-e de saída, da contagem do último SPED gerado. No faturamento, o CT-e entra só com o valor já apurado no motor.",
          "Os PDF de apoio e a planilha de faturas do BPO importados nessa tela entram na conferência dos pagamentos.",
          "Na conferência dos pagamentos, “Aceitar” pede o que a coluna “Falta para aceitar” indica. Aceitar deixa o SPED de Contribuições do período defasado.",
          "Em “Corrigir”, só o campo que você mudar é gravado; esvaziar um campo volta ao valor lido do documento. Com “Aceitar junto”, a correção é gravada primeiro: se o motor recusar o aceite, a correção fica.",
        ],
      },
    ],
    dicas: [
      "Ao importar PDFs de apoio, escolha o tipo antes: o motor grava cada arquivo com ele, e arquivo já gravado com outro tipo é recusado. Ler por OCR é mais lento e só funciona onde o motor tem OCR.",
      "Os comprovantes em PDF das faturas do BPO ligam à fatura pelo número da nota no nome do arquivo; o conteúdo não é lido. Marcar “Substituir as faturas…” apaga as faturas da mesma planilha e grava as novas.",
      "“Apurar CT-e” lê cada SPED gerado inteiro, alguns segundos por arquivo; “Apurar combustível” lê os XML das NF-e de entrada, segundos por filial.",
      "Na “Conferência fiscal”, a correção de regime de um prestador vale só para este cliente e vence o cadastro global, que continua no painel do motor. “Desfazer correção” volta ao cadastro ou ao palpite pelo nome.",
      "Ao “Simular uma linha”, o valor digitado entra na prévia como simulado. Apagar a simulação volta a linha a “não levantado”, que não é zero.",
      "Em “Empresas no motor”, os estabelecimentos se ligam às empresas do escritório pelo CNPJ. Editar o cadastro vai para os registros 0000, 0005 e 0100 dos próximos SPEDs e deixa os já gerados defasados; CNPJ, UF e situação só mudam no painel do motor.",
      "Para tentar de novo os CT-e com erro de extração, peça a execução “erros” em “Executar”. A lista de NFS-e está no acervo; em “Documentos e importações” aparece só o que chegou sem XML.",
    ],
  },

  // ─── Estoque (17/11/2026, melhoria-707) ───────────────────────────────────
  {
    chave: "financeiro_estoque",
    titulo: "Estoque",
    caminhos: ["/estoque"],
    resumo:
      "As máquinas e os materiais do escritório: com quem está cada um, onde fica, o que repor e o que conferir. Patrimônio é uma coisa só, com número de patrimônio (notebook, monitor, cadeira); material é por quantidade (papel, toner, cabos).",
    secoes: [
      {
        titulo: "Cadastrar um item",
        passos: [
          "Clique em “Novo item”, no topo da tela.",
          "Em “O que é”, escolha “Patrimônio” ou “Material”. O tipo não muda depois de cadastrado.",
          "Preencha “Nome”, “Categoria” e, se quiser, “Onde fica”.",
          "No patrimônio, informe o “Nº de patrimônio” (a etiqueta do item, que não se repete) e o “Nº de série”. No material, a “Quantidade” de hoje, a “Unidade” e o “Mínimo”: abaixo dele, o item entra em “A repor”.",
          "Clique em salvar.",
        ],
      },
      {
        titulo: "Movimentar um item",
        passos: [
          "Clique no nome do item para abrir a ficha.",
          "Clique em “Movimentar” e escolha em “O que aconteceu”: no material, “Entrada”, “Saída”, “Dar baixa” ou “Conferir”; no patrimônio, “Entregar para uso”, “Emprestar”, “Mandar para manutenção”, “Devolver”, “Dar baixa” ou “Conferir”.",
          "Ao entregar ou emprestar, escolha em “Com quem vai ficar” uma pessoa do Connect, ou escreva o nome em “Ou o nome”.",
          "Confira “Onde fica agora”, escreva uma “Observação” se precisar e salve. O movimento entra no histórico da ficha.",
        ],
      },
      {
        titulo: "Achar o que pede atenção",
        passos: [
          "Use os cartões do topo: “Itens”, “Com alguém”, “A repor” e “A conferir”. Clique num deles para ver só aqueles.",
          "Busque por nome, patrimônio, pessoa ou local no campo de busca.",
        ],
      },
    ],
    dicas: [
      "Um item entra em “A conferir” quando passa 6 meses sem conferência. “Conferir” acerta a quantidade contada no material e, no patrimônio, só registra a data.",
      "Item baixado não se movimenta mais. Para tirar de uso sem perder o histórico, use “Dar baixa”; “Excluir” apaga o item e o histórico, e é só do Administrador ou do Super Admin.",
      "Cadastrar e editar são da coordenação do setor; movimentar, de quem atua nele.",
    ],
  },

  // ─── Contratos e assinaturas (17/11/2026, melhoria-707) ───────────────────
  {
    chave: "financeiro_contratos",
    titulo: "Contratos e assinaturas",
    caminhos: ["/contratos"],
    resumo:
      "O que o escritório paga — softwares, serviços, aluguéis: quanto cada contrato pesa por mês, quando renova e quem responde por ele.",
    secoes: [
      {
        titulo: "Cadastrar um contrato",
        passos: [
          "Clique em “Novo contrato”, no topo da tela.",
          "Preencha “Nome”, “Fornecedor”, “Categoria”, “Valor de cada cobrança” e “Cobrança” (mensal, trimestral, semestral ou anual).",
          "Se tiver, informe “Início”, “Renovação” e “Fim”, e marque “Renova sozinho” quando a renovação é automática.",
          "Em “Quem responde”, escolha quem aprova a renovação. Salve.",
        ],
      },
      {
        titulo: "Acompanhar custo e renovações",
        passos: [
          "O cartão “Custo por mês” soma os contratos ativos, cada um dividido pelos meses do seu ciclo.",
          "Com data de renovação, o contrato entra em “A renovar” 30 dias antes, com o selo “Renova em breve”; passada a data, fica “Vencido”.",
          "Use os cartões ou o “Recorte” para ver “Ativos”, “A renovar” ou “Cancelados”, e busque por nome, fornecedor ou responsável.",
        ],
      },
    ],
    dicas: [
      "“Cancelar” tira o contrato do custo por mês e dos avisos de renovação, e ele continua na lista de cancelados. “Excluir” apaga do Connect e é só do Administrador ou do Super Admin.",
    ],
  },

  // ─── Contratos e honorários (17/11/2026, melhoria-707) ────────────────────
  {
    chave: "controladoria_honorarios",
    titulo: "Contratos e honorários",
    caminhos: ["/honorarios"],
    resumo:
      "O honorário de cada empresa, lido pelo robô no documento mais recente da pasta de rede — contrato ou termo aditivo — e comparado com o Acessórias; a situação do contrato e do aditivo anual de cada empresa ativa; e o termo aditivo gerado em Word com o cadastro.",
    secoes: [
      {
        titulo: "Conferir o honorário",
        passos: [
          "Na aba “Honorários”, cada linha traz o valor lido do documento mais recente e o do Acessórias.",
          "Contrato digitalizado (foto ou PDF escaneado) não tem texto, e o robô não lê o valor: clique em “Informar valor” e digite à mão. Use “Conferir valor” ou “Alterar valor” para revisar o que já está lá.",
          "Para pedir uma leitura nova das pastas, clique em “Varrer as pastas”, no topo.",
        ],
      },
      {
        titulo: "Ver contratos e aditivos",
        passos: [
          "Na aba “Contratos”, veja o contrato de prestação de serviços de cada empresa ativa. Pela regra do Societário, “assinado” no nome do arquivo conta como assinado, separado da assinatura digital.",
          "Na aba “Aditivos”, veja se o termo aditivo anual está na pasta e em que estado. Conta como em dia o aditivo com assinatura digital ou com “assinado” no nome. O termo de 13º só existe para algumas empresas e, sozinho, não substitui o anual.",
        ],
      },
      {
        titulo: "Gerar o termo aditivo",
        passos: [
          "Na aba “Termo aditivo”, escolha a empresa.",
          "Confira o “Endereço da empresa” (é o do cadastro: mudar aqui muda a ficha), o “Sócio que assina” (o sócio administrador, em Sócios da empresa; os dados pessoais saem no texto como escritos aqui) e os “Contatos do contrato” (entram no fim do parágrafo, só com nome, telefone e e-mail).",
          "Clique em “Salvar no cadastro”. O “Parágrafo do contratante” mostra como o texto sai, com o cadastro salvo.",
          "Clique em “Gerar termo (.docx)”. O termo vai para os Arquivos da empresa e é baixado na hora.",
        ],
      },
      {
        titulo: "Enviar o modelo do termo",
        passos: [
          "Na aba “Termo aditivo”, clique em “Modelo do termo”.",
          "Escolha o arquivo do Word com o texto do termo. Onde vão os dados da empresa, use os campos entre chaves, listados em “Campos do modelo”.",
          "Informe a “Cidade da data” e clique em “Salvar modelo”.",
        ],
      },
      {
        titulo: "Ligar as pastas às empresas",
        passos: [
          "Na aba “Pastas”, confira as pastas de cliente na rede que ainda não estão ligadas a uma empresa. Quando o nome bate (ou a filial bate com o CNPJ), o vínculo é automático.",
          "Se a pasta existe com outro nome, clique em “Vincular” pela sugestão.",
          "Se a empresa não tem pasta na rede de propósito, marque como sem pasta: ela sai da auditoria de contratos e aditivos.",
        ],
      },
    ],
  },
];

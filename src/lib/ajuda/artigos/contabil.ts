import type { ArtigoDeAjuda } from "../tipos";

// Os artigos do Contábil (05/11/2026), escritos a partir do código de cada
// tela. Os rótulos entre aspas curvas são os da tela: quando um botão mudar de
// nome, o texto muda junto.
export const ARTIGOS_CONTABEIS: ArtigoDeAjuda[] = [
  {
    chave: "contabil_revisao",
    titulo: "Revisão do fechamento",
    caminhos: ["/revisao-contabil"],
    resumo:
      "Confere os documentos do fechamento de uma empresa (balancete, balanço, DRE, razão, faturamento, serviços, entradas e guias do e-CAC) e aponta as inconsistências por item do manual de conferência do balanço.",
    secoes: [
      {
        titulo: "Como abrir um fechamento",
        passos: [
          "Abra “Revisão do fechamento” no menu do Contábil e clique em “Novo fechamento”.",
          "Escolha a empresa. Só aparecem as que têm CNPJ no cadastro, porque a revisão confere o CNPJ de cada documento.",
          "Informe o início e o fim do período. Se o regime mudou no meio do ano, abra um fechamento para cada parte.",
          "Confira o regime tributário declarado: ele vem do cadastro da empresa quando o cadastro diz qual é. Deixado como “Não informado”, a análise aponta “Regime tributário a confirmar”.",
          "Clique em “Abrir fechamento”.",
        ],
      },
      {
        titulo: "Como enviar e conferir os documentos",
        passos: [
          "Na aba “Documentos”, arraste os arquivos para a área de envio ou clique nela para escolher. Vale PDF com texto, Excel (.xlsx), CSV, TXT ou ZIP, até 10 MB por arquivo.",
          "Clique em “Enviar”. Cada arquivo é lido na chegada; o que não deu para ler fica na fila com o motivo.",
          "Confira na lista como cada arquivo foi reconhecido. “Só arquivado” quer dizer que o arquivo ficou guardado, mas não entra nas conferências.",
          "Clique em “Conferir leitura” para ver o que foi lido. No balancete, clique em “Corrigir” na linha lida errado e informe só o valor que mudou.",
          "Desligue “Na análise” no documento que não deve entrar, como uma versão antiga do balancete.",
        ],
      },
      {
        titulo: "Como executar a análise",
        passos: [
          "Abra a aba “Análise”.",
          "Se precisar, mude a “Tolerância das conferências”, em reais, e clique em “Salvar”.",
          "Clique em “Executar análise”. A tela mostra a posição identificada e cada teste, com estado, diferença, fórmula e fonte.",
          "Quando o fechamento, os documentos, uma correção ou a tolerância mudam, o aviso no topo pede uma nova execução: clique em “Executar de novo”.",
        ],
      },
      {
        titulo: "Como acompanhar as inconsistências",
        passos: [
          "Abra a aba “Inconsistências”. Use a busca, a gravidade e a natureza e clique em “Filtrar”.",
          "Clique em “Acompanhar” no achado.",
          "Informe o responsável, escolha o estado e escreva a anotação.",
          "Clique em “Salvar acompanhamento”. A anotação entra no relatório.",
        ],
      },
      {
        titulo: "Como baixar o relatório",
        passos: [
          "Abra a aba “Relatório” e confira a prévia.",
          "Clique em “Relatório (.md)” para o relatório completo, em “Pendências (.csv)” para a lista que abre no Excel, ou em “Execução (.json)” para guardar a execução inteira.",
          "Os relatórios das execuções anteriores ficam na aba “Análise”, em “Execuções”.",
        ],
      },
    ],
    dicas: [
      "A revisão não faz lançamentos, não ajusta saldos e não substitui o revisor. “Confere no escopo” não é aprovação, e teste não executado também não.",
      "Valor sob revisão não é perda confirmada.",
      "A aba “Manual” segue a ordem do Manual de Conferência do Balanço do time. Item em “Conferência manual” depende de sistema externo e também não é aprovação.",
      "PDF escaneado precisa passar por OCR antes. Planilha .xls precisa ser salva como .xlsx ou CSV.",
      "Uma execução nova começa sem acompanhamento, porque os achados são renumerados. O acompanhamento das anteriores fica no relatório delas.",
      "O mapeamento pelo manual, as gravidades e os critérios internos (saldo antigo acima de 90 dias, janela de 5 dias entre a guia e a baixa, pró-labore até o fim do mês seguinte) ainda estão em validação pelo time contábil.",
      "Excluir o fechamento é de quem coordena o setor e apaga os documentos, as análises e o acompanhamento juntos.",
    ],
  },
  {
    chave: "contabil_core",
    titulo: "Contábil Core",
    caminhos: ["/contabil-core"],
    resumo:
      "Importa o extrato bancário em OFX, PDF ou planilha, classifica as transações em lançamentos pelas regras e pelas contrapartes (o NEO) e gera o arquivo de importação de lançamentos do Domínio.",
    secoes: [
      {
        titulo: "Como importar um extrato",
        passos: [
          "Na aba “Configurações”, confira se a conta bancária está cadastrada e ligada à conta contábil do banco.",
          "Na aba “Importações”, escolha a conta bancária e o arquivo (OFX, PDF ou planilha) e clique em “Importar”.",
          "Se o arquivo for de outra conta, ele é recusado. Se não disser todos os dados da conta, confira e clique em “É desta conta: importar”.",
          "Confira o resultado: importadas, já existentes e recusadas por valor suspeito. O aviso de saldo aparece quando o fechamento não bate com o extrato anterior da conta.",
        ],
      },
      {
        titulo: "Como classificar",
        passos: [
          "Na aba “NEO”, escolha a competência e clique em “Rodar o NEO”. As regras classificam primeiro; o que sobra é classificado pela contraparte (CPF/CNPJ ou nome no histórico).",
          "O que ficou pendente aparece com o motivo. Marque as transações, escolha a conta, escreva o histórico e clique em “Classificar”.",
          "Para não repetir o trabalho no mês seguinte, cadastre uma regra na aba “Regras” com o trecho do histórico que se repete.",
          "Para desfazer uma classificação, abra a aba “Extrato” e clique em “Desfazer” na transação. Ela volta para a fila e espera decisão de uma pessoa.",
        ],
      },
      {
        titulo: "Como gerar o arquivo do Domínio",
        passos: [
          "Abra a aba “Registros”, escolha a competência e, se quiser, a conta bancária.",
          "Escolha TXT para importar no Domínio ou CSV para conferir, e clique em “Baixar arquivo”.",
          "Leia os avisos: conta sem código reduzido não é importada pelo Domínio.",
        ],
      },
      {
        titulo: "Como conciliar o Razão com o extrato",
        passos: [
          "Na aba “Conciliação”, em “Razão × extrato”, escolha a conta bancária e envie o “Razão da conta” (Excel ou PDF, de uma conta só).",
          "Se a conta é do Itaú, anexe também a “Consulta de pagamentos do SISPAG”: com ela, os lotes (TED e crédito em conta) são separados pagamento a pagamento.",
          "Clique em “Conciliar”. O Razão é cruzado com o extrato já importado desta conta no mesmo período, e a tela aponta as pendências. Nada é gravado até aqui.",
          "Para registrar quais lançamentos compõem o valor do banco, clique em “Revisar composição manualmente”. A revisão guarda o Razão, o relatório e as referências do Razão e do extrato; nenhum lançamento, saldo ou classificação do NEO muda.",
          "Na revisão, ponha um “Razão de apoio” (FGTS a recolher, impostos ou outras contas, inclusive de períodos anteriores) para buscar a composição das provisões.",
        ],
      },
    ],
    dicas: [
      "O módulo está sendo trazido do Contábil Core por partes. Até a virada, o trabalho do dia continua no Contábil Core.",
      "Antes da virada, quem coordena o setor pode clicar em “Pôr empresa” para testar com uma empresa do cadastro. As empresas, os planos de contas, as regras e os lançamentos de verdade chegam com a carga dos dados.",
      "A “Conciliação do financeiro” compara os documentos do financeiro com o extrato, o SISPAG ou o Razão — ou o Razão com o extrato detalhado e o SISPAG — sem alterar lançamentos, saldos ou o NEO.",
      "O PDF é lido pelo leitor do banco cadastrado na conta (BB, Bradesco, Itaú, Caixa, Sicredi, Sicoob, Santander, Inter, Stone e outros) e só entra se os saldos do extrato fecharem com os lançamentos.",
      "Na planilha (.xlsx, .xls ou .csv), o Connect acha as colunas pelo cabeçalho (Data, Histórico, Crédito, Débito, Valor, Saldo), e o saldo de cada linha confere os lançamentos.",
      "PDF que é imagem (sem texto selecionável) ainda não é lido: importe o OFX ou a planilha da conta.",
      "Desfazer uma importação inteira é de quem coordena o setor: os lançamentos das transações do arquivo são cancelados antes.",
    ],
  },
  // O SPED do Contábil (17/11/2026, melhoria-707): as frases que explicavam a
  // tela embaixo do título e de cada bloco vieram para cá.
  {
    chave: "contabil_sped",
    titulo: "SPED",
    caminhos: ["/sped-contabil"],
    resumo:
      "Das notas de entrada à planilha da Domínio: o que fica sem de-para vira regra, e os lançamentos saem completos. Os pagamentos sem nota, as saídas e o lote do ano saem pela mesma tela, e “Gerar SPED Contribuições” manda gerar a EFD Contribuições no motor do SPED.",
    secoes: [
      {
        titulo: "Preparar a empresa uma vez",
        passos: [
          "Escolha a empresa e o mês no alto da tela e abra a etapa “De-para”, seção “Plano e contas”.",
          "Exporte o plano de contas na Domínio, abra no Excel e salve como .xlsx ou .csv. Clique em “Enviar plano de contas”. Enviar de novo substitui o plano inteiro.",
          "Em “Contas fixas”, preencha o débito que não depende do fornecedor (CT-e, NFS-e, imobilizado) e o código da filial. Em branco, essas notas seguem a regra do fornecedor, como a NF-e.",
          "Em “Contas dos pagamentos sem nota”, confira os lançamentos-modelo de cada categoria. Eles vencem a regra da categoria; em branco, os pagamentos dela ficam pendentes.",
        ],
      },
      {
        titulo: "Fechar o de-para e baixar os lançamentos",
        passos: [
          "Em “Notas de entrada”, veja o que entrou no mês e o que vira lançamento.",
          "Em “Pendências”, clique em “Notas e regra” no fornecedor que ficou fora, escolha as contas e clique em “Salvar regra”. Para muitos de uma vez, use “Baixar pendências” e “Importar preenchidas”.",
          "Em “Lançamentos”, aplique os filtros e baixe a “Planilha” de cada tipo de documento. Cada arquivo leva todos os lançamentos do tipo e dos filtros aplicados, em todas as páginas.",
        ],
      },
      {
        titulo: "Lançar os pagamentos sem nota",
        passos: [
          "Abra a etapa “Pagamentos sem nota” e, em “Enviar documentos”, escolha o “Tipo do documento”. Envie os PDFs de um tipo de cada vez.",
          "Se o documento não traz data, preencha a “Pasta” (ex.: 05.2025 - RPA): ela dá a competência.",
          "O Connect lê o texto de cada página. O que não fechar, ou for imagem, aparece em “Documentos lidos” para “Corrigir” ou “Preencher à mão”. Na correção, o campo em branco vale o que a leitura achou, e a leitura original não se perde.",
          "Em “Lançados e pendências”, a tabela “Cadastros faltando” vem do maior valor para o menor. Cada cadastro resolve todos os pagamentos da linha.",
          "Em “Regras”, defina o débito de cada categoria e, se houver, o crédito padrão. Motorista, aluguel de veículo, aluguel de imóvel e RPA seguem os lançamentos-modelo de “Plano e contas”, que vencem esta regra.",
        ],
      },
      {
        titulo: "Saídas e lote do ano",
        passos: [
          "Na etapa “Saídas”, confira as contas de cada tipo: sai um lançamento por dia e por tipo, com o total emitido, e as contas valem para a matriz e as filiais.",
          "Na etapa “Lote do ano”, escolha o ano e o formato e clique em “Baixar o ZIP”. Entra cada mês de janeiro a dezembro (NF-e, CT-e, NFS-e, pagamentos sem nota e saídas); mês sem lançamento não gera arquivo, mas aparece no resumo.",
        ],
      },
      {
        titulo: "Gerar o SPED Contribuições",
        passos: [
          "No menu, abra “Gerar SPED Contribuições”, dentro de SPED.",
          "Confira as seções de fechamento, apuração e parâmetros. A escrituração reúne a matriz e as filiais da mesma raiz de CNPJ.",
          "Em “Gerar e acompanhar”, escolha a escrituração (original ou retificadora, com o recibo anterior) e clique em “Gerar no motor”. A geração usa os parâmetros e as decisões desta raiz, e o pedido fica acompanhado na mesma tela.",
        ],
      },
    ],
    dicas: [
      "Na filial, plano, contas e regras são os da matriz e valem para as filiais. Os pagamentos sem nota também são lançados na matriz.",
      "A conta escolhida para um fornecedor sem CPF/CNPJ vale para todo pagamento com esse nome (sem acento, pontuação e LTDA/S.A. no fim).",
      "O crédito padrão de uma categoria só vale quando o fornecedor não tem conta pelo CPF/CNPJ, pelo nome ou no plano.",
      "No SPED Contribuições, as decisões e os parâmetros são os mesmos usados pelo Fiscal, e as alterações ficam registradas na auditoria.",
    ],
  },
];

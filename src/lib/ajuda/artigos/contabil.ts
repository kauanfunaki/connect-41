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
    ],
    dicas: [
      "O módulo está sendo trazido do Contábil Core por partes. Até a virada, o trabalho do dia continua no Contábil Core.",
      "O PDF é lido pelo leitor do banco cadastrado na conta (BB, Bradesco, Itaú, Caixa, Sicredi, Sicoob, Santander, Inter, Stone e outros) e só entra se os saldos do extrato fecharem com os lançamentos.",
      "Na planilha (.xlsx, .xls ou .csv), o Connect acha as colunas pelo cabeçalho (Data, Histórico, Crédito, Débito, Valor, Saldo), e o saldo de cada linha confere os lançamentos.",
      "PDF que é imagem (sem texto selecionável) ainda não é lido: importe o OFX ou a planilha da conta.",
      "Desfazer uma importação inteira é de quem coordena o setor: os lançamentos das transações do arquivo são cancelados antes.",
    ],
  },
];

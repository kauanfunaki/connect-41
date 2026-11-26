// Artigos da base de conhecimento: telas de DP, Recrutamento e Societário.
//
// Escritos a partir do código das telas em 02/10/2026. Os nomes entre “ ” são
// os rótulos como aparecem na tela — se um botão mudar de nome, mude aqui.

import type { ArtigoDeAjuda } from "../tipos";

export const ARTIGOS_PESSOAS_E_PROCESSOS: ArtigoDeAjuda[] = [
  // ─── DP: Colaboradores (admissões, férias, rescisões) ────────────────────
  {
    chave: "dp_colaboradores",
    titulo: "Colaboradores",
    caminhos: ["/colaboradores", "/admissoes", "/ferias", "/desligamentos"],
    resumo:
      "Reúne o ciclo de vida do colaborador: admissões em andamento, rescisões em processo e férias em aberto. Cada cartão leva à lista correspondente; o lançamento em si é feito na ficha de cada pessoa.",
    secoes: [
      {
        titulo: "Acompanhar e concluir uma admissão",
        passos: [
          "Em “Colaboradores”, clique no cartão “Admissões” para ver quem está com a admissão em andamento.",
          "Confira as colunas “Exames” e “Documentos de admissão”. No filtro da coluna “Exames”, escolha “Exames pendentes” para ver só quem ainda depende da clínica.",
          "Clique em “Abrir” na linha do colaborador para ir à ficha dele.",
          "Na aba “Visão geral”, no quadro “Admissão digital”, clique em “Gerar link de admissão” e use “Copiar” para mandar o link ao colaborador preencher os próprios dados.",
          "Quando os dados chegarem, confira as informações e os documentos e clique em “Concluir admissão”. A situação do colaborador passa para Ativo.",
        ],
      },
      {
        titulo: "Programar e atualizar férias",
        passos: [
          "Clique no cartão “Férias”. A lista mostra primeiro as férias vencidas e depois as que estão a vencer ou programadas.",
          "Clique em “Abrir” na linha do colaborador para ir à tela de férias da ficha.",
          "Para lançar um novo período, preencha “Início do aquisitivo” e “Fim do aquisitivo” e, se já souber, o concessivo, os “Dias”, “Abono pecuniário” e “Parcelamento”.",
          "Clique em “Programar férias”.",
          "Para andar com um período já lançado, escolha a nova situação, informe as datas de início e de retorno e clique em “Atualizar”.",
        ],
      },
      {
        titulo: "Registrar e acompanhar um desligamento",
        passos: [
          "Abra a ficha do colaborador, vá à aba “Dados trabalhistas” e clique em “Desligamento”.",
          "Escolha o “Tipo”, preencha o “Motivo” e as “Observações”, se quiser, e clique em “Registrar desligamento”.",
          "A cada mudança no andamento, escolha a nova situação (de “Solicitado” até “Finalizado”) e clique em “Atualizar”.",
          "Clique em “Conferência do TRCT” para conferir a rescisão item a item.",
          "Para ver todos os desligamentos em andamento, clique no cartão “Desligamentos” em “Colaboradores”.",
        ],
      },
    ],
    dicas: [
      "O candidato movido para “Contratado” numa vaga do Recrutamento entra direto em “Admissões”.",
      "Marcar o desligamento como “Finalizado” muda a situação da pessoa para desligada.",
      "Só o gestor do setor e os administradores lançam e alteram registros na ficha; os demais membros do setor apenas consultam.",
    ],
  },

  // ─── DP: Afastamentos ─────────────────────────────────────────────────────
  {
    chave: "dp_afastamentos",
    titulo: "Afastamentos",
    caminhos: ["/afastamentos"],
    resumo:
      "Lista os afastamentos e atestados ativos de todos os colaboradores, com o tipo, a situação e a data prevista de retorno.",
    secoes: [
      {
        titulo: "Registrar um afastamento ou atestado",
        passos: [
          "Abra a ficha do colaborador, vá à aba “Dados trabalhistas” e clique em “Afastamentos”.",
          "Escolha o “Tipo”: “Falta”, “Atestado parcial”, “Atestado integral”, “Licença”, “Afastamento” ou “Retorno”.",
          "Informe a “Data de início” e, se souber, o “Retorno previsto” e os “Dias perdidos”.",
          "Clique em “Registrar ausência”.",
        ],
      },
      {
        titulo: "Acompanhar e encerrar um afastamento",
        passos: [
          "Em “Afastamentos”, use os filtros das colunas “Tipo”, “Situação” e “Retorno previsto” para achar o registro.",
          "Clique em “Abrir” na linha para ir à tela de afastamentos da ficha.",
          "Escolha a nova situação, ajuste a data de retorno se ela mudou e clique em “Atualizar”.",
          "Quando o colaborador voltar, escolha a situação “Concluído”: ele volta a constar como ativo e o registro sai da lista.",
        ],
      },
    ],
    dicas: [
      "A lista mostra só os registros em “Em análise”, “Afastado” e “Retorno previsto”. Um registro novo entra como “Lançado” e só aparece aqui depois que a situação muda.",
      "Registrar uma “Licença” ou um “Afastamento” muda a situação do colaborador para afastado.",
      "“Motivo”, “Local de atendimento” e “Profissional/Conselho” são dados médicos: só aparecem para quem tem permissão de ver esse tipo de dado.",
    ],
  },

  // ─── DP: Horas extras ─────────────────────────────────────────────────────
  {
    chave: "dp_horas_extras",
    titulo: "Horas extras",
    caminhos: ["/horas-extras"],
    resumo: "Reúne os lançamentos de horas extras de todos os colaboradores que estão aguardando aprovação.",
    secoes: [
      {
        titulo: "Lançar horas extras",
        passos: [
          "Abra a ficha do colaborador, vá à aba “Dados trabalhistas” e clique em “Horas extras”.",
          "Informe a “Data” e o “Tipo de dia”.",
          "Preencha “Horas devidas”, “Horas trabalhadas”, “Horas extras” e “Adicional”, conforme o caso, e a “Justificativa”.",
          "Clique em “Lançar horas”. O lançamento entra pendente de aprovação e aparece em “Horas extras”.",
        ],
      },
      {
        titulo: "Aprovar ou reprovar um lançamento",
        passos: [
          "Em “Horas extras”, use os filtros das colunas “Colaborador”, “Data” e “Tipo do dia”, se precisar.",
          "Clique em “Abrir” na linha do lançamento.",
          "Escolha a situação “Aprovado” ou “Reprovado” e clique em “Atualizar”.",
          "Depois de mandar o lançamento para a folha, escolha “Enviado para folha” e clique em “Atualizar”.",
        ],
      },
    ],
    dicas: [
      "A lista mostra só o que está “Pendente de aprovação”: o que foi aprovado, reprovado ou enviado para folha sai dela.",
      "Só o gestor do setor e os administradores lançam e aprovam horas extras.",
    ],
  },

  // ─── DP: Escalas ──────────────────────────────────────────────────────────
  {
    chave: "dp_escalas",
    titulo: "Escalas",
    caminhos: ["/escalas"],
    resumo:
      "Mostra a escala de trabalho de todos os colaboradores nos próximos 30 dias: o turno, a folga e o feriado de cada dia.",
    secoes: [
      {
        titulo: "Montar a escala de um colaborador",
        passos: [
          "Abra a ficha do colaborador, vá à aba “Vínculo” e clique em “Escala de trabalho”.",
          "Informe a “Data” e escolha o “Turno”.",
          "Marque “Folga” ou “Feriado”, se for o caso, e escreva “Observações” se precisar.",
          "Clique em “Adicionar à escala”. Se a data estiver nos próximos 30 dias, ela aparece em “Escalas”.",
        ],
      },
      {
        titulo: "Consultar e ajustar a escala",
        passos: [
          "Em “Escalas”, use o filtro da coluna “Data” para ver um dia ou um período.",
          "Use os filtros de “Colaborador”, “Turno” e “Situação” para recortar a lista.",
          "Clique em “Abrir” na linha para ir à escala da ficha.",
          "Escolha a nova situação (“Planejada”, “Confirmada”, “Alterada”, “Cancelada” ou “Realizada”) e clique em “Atualizar”.",
        ],
      },
    ],
    dicas: [
      "O campo “Turno” lista os turnos cadastrados para a empresa do colaborador. Sem empresa vinculada, só há a opção “Nenhum”.",
      "Dias com situação “Cancelada” não aparecem na lista.",
    ],
  },

  // ─── DP: Treinamentos ─────────────────────────────────────────────────────
  {
    chave: "dp_treinamentos",
    titulo: "Treinamentos",
    caminhos: ["/treinamentos"],
    resumo: "Catálogo de treinamentos do escritório, com as turmas de cada um e os colaboradores que participaram.",
    secoes: [
      {
        titulo: "Cadastrar um treinamento",
        passos: [
          "Clique em “Novo treinamento”.",
          "Preencha o “Nome do treinamento” e, se quiser, a “Descrição”, a “Carga horária” e a “Validade” em meses.",
          "Clique em “Salvar”.",
        ],
      },
      {
        titulo: "Criar uma turma",
        passos: [
          "Depois de salvar, a tela do treinamento já abre. Para voltar a ela depois, clique em “Abrir” no treinamento, na lista.",
          "No quadro “Turmas”, em “Nova turma”, informe a “Data” e, se quiser, o “Turno” e o “Instrutor”.",
          "Clique em “Criar turma”.",
        ],
      },
      {
        titulo: "Incluir participantes e registrar o resultado",
        passos: [
          "Depois de “Criar turma”, a turma já abre. Para voltar a ela depois, clique em “Abrir” na tabela de turmas.",
          "Em “Novo participante”, escolha o “Colaborador” e clique em “Adicionar participante”.",
          "Todo participante começa como “Planejado”. Para registrar presença ou resultado, escolha a situação dele, como “Convocado”, “Realizado”, “Ausente” ou “Concluído”.",
          "Clique em “Atualizar”.",
        ],
      },
    ],
    dicas: [
      "Excluir uma turma, pelo botão “⋯” da linha, leva junto os participantes dela. Excluir treinamento, turma ou participante é só do Administrador ou do Super Admin.",
      "Treinamento sem validade aparece como “Sem validade”; preencha a validade nos que precisam de reciclagem.",
      "Só o gestor do setor e os administradores cadastram treinamentos, turmas e participantes.",
    ],
  },

  // ─── DP: Avaliações de desempenho ─────────────────────────────────────────
  {
    chave: "dp_avaliacoes",
    titulo: "Avaliações de desempenho",
    caminhos: ["/avaliacoes"],
    resumo:
      "Organiza as avaliações de desempenho em ciclos. Cada ciclo reúne as notas por competência dos colaboradores avaliados e o plano de desenvolvimento de cada um.",
    secoes: [
      {
        titulo: "Cadastrar as competências",
        passos: [
          "Clique na aba “Competências”.",
          "Clique em “Nova competência”, preencha o “Nome da competência” e, se quiser, a “Descrição”.",
          "Clique em “Cadastrar”. A coluna “Uso” mostra em quantas avaliações cada uma já recebeu nota.",
          "Para mudar o nome ou a descrição, clique em “Editar” na linha.",
        ],
      },
      {
        titulo: "Abrir um ciclo de avaliação",
        passos: [
          "Clique em “Novo ciclo”.",
          "Na janela, preencha o “Nome do ciclo”, o “Início” e, se já souber, o “Fim”.",
          "Clique em “Criar ciclo”.",
          "O ciclo já abre, com a situação “Aberto”. Para voltar a ele depois, clique em “Abrir” na lista.",
        ],
      },
      {
        titulo: "Avaliar um colaborador",
        passos: [
          "Dentro do ciclo, em “Nova avaliação”, busque o colaborador no campo “Colaborador”.",
          "Clique em “Avaliar colaborador”.",
          "Em “Notas por competência (0 a 10)”, dê uma nota para cada competência.",
          "Em “Desenvolvimento”, preencha “Observações”, “Plano de desenvolvimento” e “Prazo de melhoria”, se for o caso.",
          "Clique em “Salvar avaliação”. A média aparece na tabela do ciclo.",
        ],
      },
      {
        titulo: "Encerrar o ciclo",
        passos: [
          "Quando todas as avaliações estiverem feitas, abra o ciclo.",
          "Clique em “Encerrar ciclo”.",
          "O ciclo passa a aparecer como “Encerrado” na lista.",
        ],
      },
    ],
    dicas: [
      "As competências avaliadas ficam na aba “Competências”, nesta mesma tela. Quem gere as avaliações cadastra em “Nova competência”; sem nenhuma, não dá para avaliar.",
      "Depois de encerrado, o ciclo não aceita novas avaliações, e não há como reabri-lo pela tela.",
      "Para corrigir uma avaliação, clique em “Abrir” na linha do colaborador, dentro do ciclo.",
    ],
  },

  // ─── DP 2: a folha calculada ──────────────────────────────────────────────
  // Escrito em 17/11/2026 (melhoria-707) com o que os subtítulos e as linhas de
  // apoio das telas do DP 2 explicavam — eles saíram da tela e moram aqui.
  {
    chave: "dp2_painel",
    titulo: "DP 2",
    caminhos: ["/dp2"],
    resumo:
      "O DP que calcula a folha: o contrato de cada colaborador, os eventos do mês, o cálculo, a conferência e o fechamento, o 13º, as férias, a rescisão e os eventos do eSocial. As telas de empresa trabalham uma empresa por vez, a escolhida na faixa “Trabalhando em”.",
    secoes: [
      {
        titulo: "Acompanhar o mês no painel",
        passos: [
          "Abra “Painel do DP 2” e escolha o mês. A tela mostra as competências do mês de todas as empresas (ou do grupo em foco), com a etapa em que cada uma está.",
          "Abaixo, “Avisos do cálculo” junta o que o cálculo do mês apontou em cada pessoa, com link para o holerite, e “Avisos de vencimento” lista, do vencido ao mais distante: férias em dobro ou com o concessivo terminando em 60 dias, contrato por prazo determinado (experiência) e estágio terminando em 30 dias, salário-família de quem faz 14 anos e dependente de IRRF que faz 21 ou 24 anos.",
          "Clique no nome da empresa para abrir a competência dela.",
          "A coluna “Alertas” conta os avisos do cálculo, como salário abaixo do piso da convenção.",
        ],
      },
      {
        titulo: "Cadastrar os contratos dos colaboradores",
        passos: [
          "Em “Colaboradores”, cada pessoa da empresa aparece com “Com contrato” ou “Sem contrato”. Quem não tem contrato no DP 2 fica fora do cálculo da folha, do 13º, das férias e da rescisão.",
          "Clique em “Editar” para abrir o contrato: salário, jornada, dependentes, dados do eSocial, conta para o pagamento e adicionais. Em “Dados para o eSocial” vai o que a admissão (S-2200) pede e o cadastro da pessoa não tem; o bloco “Estágio” é só da categoria 901 (S-2300).",
          "Para uma pessoa nova, “Novo colaborador” cria o cadastro da pessoa e o contrato do DP 2 de uma vez.",
          "Para trazer a empresa inteira, clique em “Importar do eSocial”. Ela traz os colaboradores com os contratos, os dependentes e os dados do eSocial; só lê, nada é enviado ao eSocial, e nada é gravado antes de você conferir a prévia.",
          "Na importação, busque por CPF e admissão (um por linha, em “Montar a lista” e “Buscar no eSocial”), com o certificado ligado no CertDigital deste computador, ou envie os XML dos eventos, soltos ou em .zip, baixados no “eSocial Download” do portal (menu Downloads › Solicitação) ou de outro sistema.",
        ],
      },
      {
        titulo: "Configurar a empresa",
        passos: [
          "Em “Configuração da empresa”, escolha a convenção coletiva e informe RAT, FAP, terceiros, os códigos do eSocial e a conta pagadora de onde sai o salário no arquivo do banco.",
          "Em “Saúde e segurança (eSocial)”, informe o médico responsável pelo PCMSO e quem assina o LTCAT: eles vão nos eventos de ASO (S-2220) e de condições ambientais (S-2240).",
          "As convenções ficam em “Convenções coletivas”: os percentuais de hora extra e de adicional noturno que o cálculo usa e o piso, que dispara o alerta de salário abaixo dele. Sem convenção, a empresa é calculada pela CLT: hora extra de 50% e 100% e adicional noturno de 20%.",
        ],
      },
      {
        titulo: "Calcular e fechar a folha do mês",
        passos: [
          "Em “Competência do mês”, escolha o mês e o tipo e clique em “Abrir competência”. Se ela já existe, abre a que existe.",
          "No passo “Lançar eventos”, lance horas extras, adicional noturno, faltas e atrasos em horas ou dias, e comissões, adiantamentos e outros em valor. O resto (salário, DSR, INSS, IRRF e FGTS) o cálculo faz. Sem eventos, a folha sai só com o salário e os adicionais fixos.",
          "Para a mesma rubrica em várias pessoas, use “Lançar por rubrica ou em grupo”: escolha a rubrica e preencha o valor (ou as horas) de cada um; para o mesmo valor, marque as pessoas, digite em “Em grupo” e clique em “Aplicar”. Quem fica em branco não entra. “Consulta por rubrica” soma o mês por rubrica, com as fixas do contrato.",
          "Para receber os eventos da empresa, use “Pedir os eventos ao cliente”: o link, sem login, deixa a empresa informar horas extras, faltas, atrasos e comissões de cada colaborador, ou que não houve nada. O que ela mandar entra como lançamento de origem Cliente.",
          "Para importar, copie do Excel ou do relatório de totais do Pontomais e cole com o cabeçalho: uma coluna CPF ou Nome e uma por evento (HE 50%, HE 100%, Noturno, Faltas, Atrasos, ou o código ou o nome da rubrica). Horas valem em 10:30 ou 10,5.",
          "Rescisão: em DP 2 › Rescisões, calcule e clique em “Gravar rescisão”. Ela se liga ao desligamento em andamento da pessoa e tira a pessoa da folha mensal do mês do desligamento (as verbas do mês estão na rescisão). Em “Rescisões gravadas”, “Gerar o S-2299” monta o evento a partir da rescisão; “Excluir” só vale com a folha do mês aberta e o S-2299 ainda não enviado.",
          "Férias: em DP 2 › Férias, escolha a pessoa e veja os períodos aquisitivos (saldo, 1/3 pago e situação). Calcule o recibo e clique em “Gravar férias”, escolhendo o período e a data do pagamento. A folha dos meses do gozo paga o salário só dos dias fora das férias, soma férias e 1/3 ao INSS e ao FGTS do mês e desconta o líquido já pago no recibo. Período que passou do concessivo (em dobro) ainda não grava.",
          "Se o empregado também trabalha em outra empresa no mês, informe em “Outras bases de INSS” o CNPJ dela e a remuneração de lá (“Copiar do mês anterior” traz o que se repete). O INSS daqui passa a respeitar o teto somando as bases, e o S-1200 leva a informação ao eSocial.",
          "Advertência e suspensão: em DP 2 › Colaboradores, “Advertências e suspensões” registra a ocorrência (colaborador, data, dias de suspensão e motivo) e gera o documento em PDF para assinatura do colaborador e de duas testemunhas. Os dias da suspensão (até 30 seguidos) saem do salário ao calcular a folha do mês.",
          "Horários de trabalho: em DP 2 › Configuração da empresa, crie os horários (dias da semana, entrada, saída e intervalo). No contrato, escolha o horário: as horas por mês do cálculo (horas semanais × 5) e a jornada do eSocial (tipo e texto) passam a sair dele.",
          "Centro de custo: no contrato (DP 2 › Colaboradores), escolha o centro de custo do BPO da empresa e, se quiser, o departamento. O passo “Conferir” mostra a folha por centro (proventos, líquido, FGTS, encargos e provisões) e o CSV dos lançamentos contábeis ganha a coluna “Centro de custo”.",
          "Vale-transporte: no contrato, marque “Vale-transporte” e informe o custo diário (as tarifas de ida e volta somadas). A folha desconta 6% do salário, limitado ao custo do benefício nos dias úteis trabalhados, e o passo “Conferir” mostra o pedido do mês de cada pessoa, o desconto e o custo da empresa.",
          "Afastamentos entram no cálculo pelo S-2230 gerado em DP 2 › eSocial: na doença ou no acidente, os 15 primeiros dias são pagos pela empresa e os dias seguintes (pagos pelo INSS) saem do salário do mês. Na licença-maternidade o salário continua e o holerite avisa para deduzir o salário-maternidade na DCTFWeb. Informe o fim do afastamento num novo S-2230 com o mesmo início quando a pessoa voltar.",
          "Empregado doméstico: use a categoria 104 no contrato. O cálculo usa os encargos da LC 150/2015 (INSS patronal 8%, GILRAT 0,8%, FGTS 8% e indenização compensatória 3,2%), e o passo “Conferir” mostra o total do DAE do Simples Doméstico para conferir com a guia emitida no eSocial Doméstico.",
          "Clique em “Calcular a folha”. No passo “Conferir”, clique no nome de cada pessoa para ver o holerite com a memória de cálculo.",
          "Para corrigir um valor que o cálculo deu (uma linha do holerite, o INSS, o IRRF, o FGTS ou uma provisão de férias ou 13º), use “Ajustes manuais” no holerite da pessoa: escolha o valor, informe o novo e o motivo. A folha é recalculada na hora, a linha fica marcada como “ajustado” e o ajuste vai para a Auditoria. Calcular de novo mantém o ajuste; “Retirar” volta ao valor do cálculo.",
          "Enquanto o DP 2 roda em paralelo com a Domínio, em “Comparar com a Domínio” cole uma pessoa por linha: CPF; proventos; descontos; líquido; INSS; IRRF; FGTS. Campo vazio não é comparado.",
          "Ainda em “Conferir”, “Apuração da competência” mostra o INSS (DCTFWeb), o IRRF e, para entidade sem fins lucrativos (opção na Configuração), o PIS de 1% sobre a folha a recolher. Inclua ali as retenções de 11% sofridas (CNPJ do tomador e nota) e as compensações de INSS, IRRF e PIS (mês de origem): elas abatem o devido, e o que sobrar aparece como saldo.",
          "No passo “Fechar”, clique em “Fechar competência”. A competência fechada é a que vale para as médias de férias, 13º e rescisão.",
          "Para quem já trabalhava antes do DP 2, traga o histórico das médias em DP 2 › Colaboradores › “Saldo inicial das médias”: copie da Domínio (Utilitários › Lançamentos › Lançamento de Rubricas para Médias) uma linha por rubrica e mês, CPF; competência; código da rubrica; valor, e clique em “Importar saldo inicial”. Confira o total de cada pessoa e clique em “Conferir”: só então os meses entram na média de férias, 13º e rescisão, nos meses sem competência fechada no DP 2.",
        ],
      },
      {
        titulo: "Pagar e entregar a folha",
        passos: [
          "RPA: para o autônomo (categoria 701), “Saídas da folha” tem o botão “RPA de …” com o recibo de pagamento a autônomo em PDF: o serviço, o INSS de 11%, o IRRF, o campo do ISS (quando o município cobrar), o líquido e a contribuição de 20% da empresa.",
          "Transparência salarial (Lei 14.611/2023): em DP 2 › Colaboradores, a seção compara por cargo quantas mulheres e homens (empregados CLT ativos) e a média do salário do contrato de cada grupo, mais a quebra por raça/cor. O relatório é obrigatório para empresas com 100 ou mais empregados; o sexo e a raça vêm dos dados do eSocial do contrato.",
          "Documentos do contrato: em DP 2 › Colaboradores, escolha o colaborador e baixe a ficha de registro de empregado ou o contrato de experiência (para contrato por prazo determinado, com o termo de prorrogação). Os dados vêm do cadastro da pessoa e do contrato do DP 2; o que faltar sai com um traço.",
          "Termo de quitação anual (art. 507-B da CLT): em DP 2 › Colaboradores, escolha o colaborador e o ano e baixe o termo em PDF. Ele soma por rubrica o que as competências fechadas do ano pagaram (folha e 13º), o líquido e o FGTS, com as assinaturas do empregador, do empregado e do sindicato da categoria.",
          "Com a competência fechada, “Lançar no Contas a pagar” (em Saídas da folha) cria no Contas a pagar da empresa os líquidos dos colaboradores (vencem no 5º dia útil do mês seguinte), o DARF da DCTFWeb com INSS e IRRF e o FGTS Digital (dia 20) e o PIS sobre a folha, quando houver (dia 25). A categoria vem do plano de contas pelo nome (salários, INSS, FGTS, PIS); sem ela, a conta fica provisória para o BPO classificar. Lançar de novo atualiza as que seguem em aberto e não mexe nas pagas.",
          "Em “Saídas da folha”, “Relatórios da folha (Excel)” baixa uma planilha com quatro abas: o resumo por rubrica com os totais e os encargos patronais, a folha analítica (cada pessoa, rubrica a rubrica), a relação de encargos (INSS da empresa, RAT/FAP, terceiros e FGTS) e as provisões de férias e 13º do mês.",
          "Em “Saídas da folha”, “Baixar holerites (PDF)” gera um PDF com uma página por colaborador. Com a competência fechada, “Guardar nos Arquivos” guarda em Arquivos › Departamento Pessoal, de onde seguem ao cliente pelo “Enviar ao cliente” do arquivo.",
          "Em “Guias da folha” (passo “Fechar”), o DARF da DCTFWeb baixado pela rotina do Serpro é conferido com o INSS e o IRRF a recolher da apuração. O FGTS Digital não tem API: baixe a GFD no portal e use “Anexar a GFD” com o valor e o vencimento; o PDF vai para Arquivos › Guias e o valor é conferido com o FGTS do mês.",
          "“Gerar remessa” monta o arquivo do banco (CNAB 240) com o líquido de cada um, pela conta pagadora da empresa, em crédito em conta corrente, crédito em poupança ou TED para outro banco. Quem está sem banco, agência, conta ou CPF fica de fora e aparece listado ali.",
          "O primeiro arquivo de cada banco vai para teste no banco antes de valer.",
          "“Baixar lançamentos (CSV)” traz os lançamentos contábeis da folha, pelas contas das rubricas e das contas da folha.",
        ],
      },
      {
        titulo: "Calcular 13º, férias e rescisão",
        passos: [
          "Em “13º salário”, abra as parcelas: a 1ª vai até 30 de novembro (metade, sem INSS e IRRF) e a 2ª até 20 de dezembro (o ano inteiro, com INSS e IRRF próprios, descontando a 1ª). O 13º sai do salário do contrato e das médias: confira os salários antes de calcular.",
          "Em “Férias”, escolha o colaborador, o início do gozo, os dias, o abono e as faltas e clique em “Calcular”. O resultado traz o abono, as médias e a conta de cada verba.",
          "Em “Rescisões”, informe o último dia trabalhado, o motivo, o aviso, as férias vencidas, o saldo do FGTS e o 13º já adiantado e clique em “Calcular”. Saldo de salário, aviso, 13º e férias saem do cálculo de rescisão do Connect; INSS, IRRF e FGTS, das tabelas do DP 2.",
          "Férias e rescisões só listam quem tem contrato no DP 2.",
        ],
      },
      {
        titulo: "Gerar os eventos do eSocial",
        passos: [
          "Em “eSocial”, comece por “Gerar tabelas”: empregador (S-1000), estabelecimento (S-1005), lotação (S-1020) e as rubricas ativas (S-1010). Depois de corrigir o cadastro, gere de novo: o evento não enviado é trocado.",
          "Em “Periódicos”, gere a remuneração (S-1200), o pagamento (S-1210) e o fechamento (S-1299) da folha mensal fechada. O 13º sai da 2ª parcela fechada, na apuração anual, com a 1ª parcela dentro.",
          "Depois do envio, confira o que o eSocial calculou: na competência, passo “Conferir”, em “Totalizadores do eSocial”, importe os XML de retorno (S-5001, S-5002, S-5003, S-5011 e S-5013, soltos ou em .zip do “eSocial Download”). A tabela mostra, por pessoa, o INSS, o IRRF e o FGTS do cálculo ao lado do eSocial, e o total da empresa; diferença acima de 1 centavo fica marcada.",
          "Em “Trabalhadores”, gere a admissão (S-2200), a alteração contratual (S-2206) e o afastamento (S-2230) a partir do contrato e do cadastro. Para a alteração, atualize antes o contrato em Colaboradores e informe a data em que vale. O desligamento (S-2299) sai da tela de Rescisões, com as verbas calculadas, e a reintegração de quem foi desligado (S-2298: decisão judicial com o número do processo, anistia ou outro) sai em “Reintegração”, depois do que é preciso tirar a data de desligamento do cadastro; sócio, autônomo e estagiário têm início (S-2300), alteração (S-2306, pelo mesmo botão da alteração contratual) e término (S-2399).",
          "Em “Saúde e segurança”, gere um ASO (S-2220) por exame, as condições ambientais (S-2240) na admissão e quando a condição mudar, e o acidente de trabalho (S-2210).",
          "Em “O que falta no cadastro”, corrija o que está como “falta” e gere os eventos de novo. O que está em “conferir” não impede o envio: é um código que o Connect sugeriu.",
          "Enviou um evento por fora do Connect? Na fila, use “Registrar recibo” com o nº que o eSocial devolveu: o evento fica aceito. Um evento aceito de trabalhador ou da folha pode ser excluído com “Excluir no eSocial (S-3000)”; quando o recibo do S-3000 é registrado, o original fica como excluído.",
          "Para corrigir uma folha já fechada no eSocial (S-1299 aceito), reabra a competência no DP 2: o S-1298 (reabertura) sai junto na fila. Com o recibo do S-1298 registrado, feche a competência de novo e gere os periódicos: quem já tinha S-1200 ou S-1210 aceito recebe a retificação, com o recibo do original, e sai um novo S-1299.",
        ],
      },
      {
        titulo: "Manter rubricas e tabelas",
        passos: [
          "Em “Rubricas” ficam os proventos e descontos do escritório, com as incidências de INSS, FGTS e IRRF. Valem para todas as empresas.",
          "A rubrica “do motor” o Connect calcula, e o tipo e as incidências dela seguem a lei. Na rubrica livre, o DP informa o valor no mês.",
          "Em “Contas da folha”, informe para onde vão o líquido, os encargos da empresa e as provisões nos lançamentos contábeis. As contas de cada provento e desconto ficam na própria rubrica (débito e crédito).",
          "Em “Conferência das rubricas”, cada rubrica é comparada com o que vai no eSocial. Para comparar com a tabela que já está no governo, solte em “Comparar com o eSocial” os XML do S-1010 da empresa (do portal do eSocial ou da Domínio); eles são lidos no navegador. Rubrica que só existe no eSocial e ainda é usada: crie como rubrica livre com o mesmo código.",
          "Em “Tabelas oficiais”, cada tabela (INSS, IRRF, salário mínimo e salário-família) tem a competência em que passa a valer, e o cálculo usa a mais nova até o mês da competência. Quando sair uma portaria antes de o Connect ser atualizado, use “Gravar uma tabela do escritório”; gravar na mesma vigência substitui a versão anterior do escritório.",
        ],
      },
    ],
    dicas: [
      "Para mudar quem entra numa folha, ajuste os contratos em Colaboradores e calcule de novo.",
      "Depois de fechada, a competência só muda se for reaberta com um motivo, e só o gestor do setor reabre.",
      "A busca no eSocial por CPF tem limite: 10 acessos por dia por empresa (cerca de 9 pessoas) e nenhum do dia 1 ao 7. O que faltar continua no dia seguinte.",
    ],
  },

  // ─── Recrutamento: Vagas ──────────────────────────────────────────────────
  {
    chave: "recrutamento_vagas",
    titulo: "Vagas",
    caminhos: ["/vagas"],
    resumo:
      "Lista as vagas do escritório e, dentro de cada uma, o funil de recrutamento com os candidatos, a triagem de currículos e os pareceres de entrevista.",
    secoes: [
      {
        titulo: "Criar uma vaga",
        passos: [
          "Clique em “Nova vaga”.",
          "Em “Dados da vaga”, preencha o “Título da vaga”, o “Setor” e a “Empresa”; complete “Cargo”, “Quantidade”, “Responsável” e “Prioridade”, se quiser.",
          "Para divulgar a vaga no portal público, marque “Publicar no portal de vagas” e preencha a “Descrição pública da vaga”, a “Modalidade”, o “Tipo de contrato” e o “Inscrições até”.",
          "Clique em “Salvar”.",
        ],
      },
      {
        titulo: "Divulgar o link da vaga",
        passos: [
          "Abra a vaga. Publicada no portal, ela mostra embaixo do título a faixa azul “Publicada no portal de vagas”.",
          "Clique em “Abrir página da vaga” para ver o que o candidato vê.",
          "Clique em “Copiar link” para colar o endereço onde quiser, ou em “WhatsApp” para mandar a vaga com a mensagem pronta.",
          "Se a vaga não está no portal, a linha “Não publicada no portal de vagas” diz o motivo e o que fazer.",
        ],
      },
      {
        titulo: "Vincular candidatos e movê-los pelo funil",
        passos: [
          "Abra a vaga e vá até “Funil de recrutamento”.",
          "Clique em “Adicionar candidato”. No painel, busque pelo nome, CPF ou e-mail, escolha a “Origem” (Indicação, Portal, WhatsApp, LinkedIn ou Outra…) e clique em “Vincular”.",
          "Se a pessoa ainda não está no banco, clique em “Não achou? Cadastrar novo candidato”, preencha o nome, o e-mail e o telefone (o currículo em PDF é opcional) e clique em “Cadastrar e vincular”. O resto do cadastro (CPF, endereço, documentos) fica na ficha do candidato.",
          "No topo de cada coluna aparecem quantos estão na etapa agora, quantos chegaram até ela e quantos passaram da etapa anterior.",
          "Arraste o cartão do candidato entre as etapas “Triagem”, “Entrevista”, “Teste”, “Proposta” e “Contratado”, ou escolha a etapa na lista do próprio cartão. Soltar em “Contratado” inicia a admissão.",
          "Para tirar alguém do funil, clique no botão “⋯” do cartão e escolha “Reprovar” ou “Desistiu”.",
          "Informe o “Motivo”, se quiser, e confirme. O candidato vai para a faixa de encerrados.",
        ],
      },
      {
        titulo: "Pontuar os currículos com a IA",
        passos: [
          "Na seção “Triagem de currículos”, escreva cada requisito no campo “Adicionar obrigatório” ou “Adicionar desejável” e tecle Enter. Obrigatório pesa o dobro. A IA confere o currículo contra cada requisito e aponta a evidência.",
          "Marque o peso nos três pontos ao lado de cada requisito: um é baixo, três é alto (clique para trocar). O “×” tira o requisito.",
          "Ajuste “Parcial a partir de” e “Compatível a partir de”, se quiser. A régua de 0 a 100 mostra onde começa cada faixa.",
          "Clique em “Salvar requisitos”.",
          "Clique em “Pontuar pendentes” para a IA dar nota aos currículos ainda sem nota, ou em “Reprocessar todas” para refazer todas.",
          "Acompanhe o andamento do lote. No funil, os candidatos de cada etapa ficam ordenados pela nota.",
        ],
      },
      {
        titulo: "Registrar um parecer de entrevista",
        passos: [
          "No cartão do candidato, clique em “Avaliar”.",
          "Em “Adicionar meu parecer”, dê as notas de “Comunicação”, “Conhecimento técnico”, “Fit cultural” e “Experiência”.",
          "Escolha a “Recomendação”: “Avançar”, “Talvez” ou “Reprovar”.",
          "Escreva “Observações”, se quiser, e clique em “Salvar parecer”.",
          "Os pareceres de todos aparecem em “Pareceres”, e a média em “Consolidado”.",
        ],
      },
    ],
    dicas: [
      "Mover para “Contratado” transforma o candidato em colaborador com a admissão em andamento, que aparece para o DP em “Admissões”. Depois disso, o cartão não muda mais de etapa.",
      "A nota da triagem só ordena os candidatos — nunca reprova ninguém: quem avança ou reprova é o recrutador. Nome, idade, cidade e foto não chegam à IA.",
      "Localidade não entra nos requisitos da triagem: a IA não avalia a cidade, quem confere é o recrutador.",
      "A vaga aparece no portal enquanto estiver Aberta e até o dia de “Inscrições até”; depois, sai do portal sozinha. Sem “Cidade de trabalho”, vale a cidade da empresa.",
      "O botão “Perguntar à Ceci sobre esta vaga” abre a Ceci já com a vaga como assunto. Ela responde sobre os candidatos e sugere movimentos, mas não altera nada: cada sugestão só vale depois que você clica em “Aplicar”.",
    ],
  },

  // ─── Recrutamento: Candidatos ─────────────────────────────────────────────
  {
    chave: "recrutamento_candidatos",
    titulo: "Candidatos",
    caminhos: ["/candidatos"],
    resumo:
      "O banco de talentos do escritório: todos os candidatos, com ou sem vaga, com as candidaturas, os testes e os documentos de cada um.",
    secoes: [
      {
        titulo: "Cadastrar um candidato",
        passos: [
          "Clique em “Novo candidato”.",
          "Preencha o “Nome” e os demais dados em “Identificação”, “Contato” e “Endereço”.",
          "Clique em “Salvar”.",
        ],
      },
      {
        titulo: "Encontrar candidatos no banco",
        passos: [
          "Digite no campo de busca o nome, o e-mail ou o CPF.",
          "Use o filtro da coluna “Tags” para achar quem tem uma habilidade.",
          "Por padrão, a lista mostra só os ativos. Para ver os inativos, clique em “Filtros” e troque a “Situação”.",
          "Clique no nome do candidato para abrir a ficha.",
        ],
      },
      {
        titulo: "Ler o currículo e marcar habilidades",
        passos: [
          "Na ficha do candidato, em “Tags”, clique em “+ tag” e escolha as que descrevem a pessoa.",
          "No bloco “Currículo”, clique em “Ler com IA”. A IA lê o PDF, preenche os campos vazios da ficha e escreve um resumo profissional, que fica guardado no bloco.",
          "Em “Teste”, escolha o “Tipo de teste” e clique em “Enviar teste”.",
          "Em “Candidaturas”, cada vaga mostra a etapa em que a pessoa está. Clique em “Abrir candidatura” para ver os pareceres e as entrevistas.",
        ],
      },
      {
        titulo: "Corrigir os dados do candidato",
        passos: [
          "Em “Dados pessoais”, clique no lápis da parte que quer mudar: Identificação, Contato ou Endereço.",
          "Corrija os campos e clique em “Salvar”. Só aquela parte muda.",
        ],
      },
      {
        titulo: "Anexar documentos",
        passos: [
          "O bloco “Documentos” começa fechado e a linha já diz quantos arquivos há. Clique nele para ver a lista.",
          "Para anexar, clique em “Anexar”, escolha o arquivo, a categoria e, se for o caso, o vencimento e “Documento sensível”.",
          "Clique em “Anexar” na janela para enviar.",
        ],
      },
      {
        titulo: "Inativar candidatos em massa",
        passos: [
          "Na lista, marque a caixa de seleção de cada candidato, ou “Selecionar todos”.",
          "Clique em “Inativar”.",
          "Confirme.",
        ],
      },
    ],
    dicas: [
      "A leitura do currículo precisa de um PDF: o enviado pela candidatura no portal ou um documento da categoria Currículo na ficha. Vale o mais recente. O currículo anexado pelo bloco “Currículo” entra nos documentos da ficha, nessa categoria.",
      "Marcar tags deixa o candidato fácil de achar no banco de talentos, mesmo que ele não avance na vaga atual.",
      "As tags do Recrutamento são cadastradas em Configurações › Setores e módulos › Tags.",
    ],
  },

  // ─── Recrutamento: Colaboradores de clientes ──────────────────────────────
  {
    chave: "recrutamento_colaboradores_clientes",
    titulo: "Colaboradores de clientes",
    caminhos: ["/colaboradores-clientes"],
    resumo:
      "Cadastro das pessoas que trabalham nas empresas clientes. É este cadastro que alimenta a admissão, as férias e a rescisão no DP.",
    secoes: [
      {
        titulo: "Cadastrar um colaborador de cliente",
        passos: [
          "Clique em “Novo colaborador”.",
          "Preencha os dados de contato e o endereço, clicando em “Avançar →” para passar de um passo ao outro.",
          "Em “Empresa vinculada”, escolha a “Empresa” e, se quiser, o “Cargo” e o “Departamento”.",
          "Complete as informações adicionais e anexe documentos, se tiver.",
          "Na revisão, confira tudo e clique em “Confirmar e salvar”.",
        ],
      },
      {
        titulo: "Encontrar um colaborador",
        passos: [
          "No campo “Empresa”, escolha a empresa. A tela mostra uma empresa por vez e abre na última empresa que você abriu.",
          "Para achar alguém sem saber a empresa, digite o nome ou o CPF em “Buscar em todas as empresas”. O resultado mostra a empresa de cada pessoa.",
          "Clique em “Filtros” para ver também os cadastros inativos.",
          "Clique no nome para abrir a ficha, onde ficam as abas de férias, afastamentos, desligamento e os demais registros do DP.",
        ],
      },
      {
        titulo: "Ler o resumo da empresa",
        passos: [
          "Escolha a empresa no campo “Empresa”.",
          "Em cima da tabela ficam os números dela: ativos, admissões e desligamentos do mês (com as admissões em andamento), em férias e afastados.",
          "Os números saem da situação e das datas de admissão e de desligamento da ficha de cada pessoa. Com a ficha em dia, o resumo fica certo.",
        ],
      },
    ],
    dicas: [
      "Por padrão, a lista esconde os inativos. Quando houver algum, o aviso acima da tabela mostra quantos ficaram de fora, com o botão “Mostrar todos”.",
      "A busca em todas as empresas mostra até 50 pessoas. Se não achar quem procura, digite mais do nome ou o CPF.",
      "Os funcionários do próprio escritório não ficam aqui, e sim em “Pessoas”.",
    ],
  },

  // ─── Recrutamento: WhatsApp ───────────────────────────────────────────────
  {
    chave: "recrutamento_whatsapp",
    titulo: "WhatsApp",
    caminhos: ["/whatsapp"],
    resumo:
      "As conversas com candidatos no número de WhatsApp do Recrutamento. O assistente responde o que sabe e passa para uma pessoa o que sai do combinado.",
    secoes: [
      {
        titulo: "Encontrar a conversa que precisa de você",
        passos: [
          "Confira no topo o estado do número: um aviso em amarelo ou vermelho indica problema na conexão.",
          "Clique em “Sem responsável”, acima da lista, para ver as conversas que o assistente passou adiante e ninguém assumiu, ou em “Minhas” para ver as suas. O número ao lado é quantas há.",
          "Use a busca da lista para achar pelo nome, pelo telefone ou pela vaga. O balão azul com número à direita do cartão são as mensagens sem resposta.",
          "Clique no cartão para abrir a conversa no painel ao lado. Se o assistente passou para uma pessoa, o motivo aparece no topo do painel.",
          "No painel, use as setas ↑ e ↓ (ou as do teclado) para passar para a conversa anterior ou a próxima, e o X (ou Esc) para fechar.",
        ],
      },
      {
        titulo: "Assumir, responder e devolver uma conversa",
        passos: [
          "Clique em “Assumir”, abaixo do nome, para ficar com a conversa.",
          "Na aba “Conversa”, escreva no campo de resposta e clique em “Enviar” (ou Ctrl+Enter). Responder também assume a conversa, e o assistente para de responder nela.",
          "Para deixar a conversa sem responsável, clique no “…” do topo do painel e em “Soltar a conversa”.",
          "Para o assistente voltar a atender, clique no “…” e em “Devolver ao assistente”.",
        ],
      },
      {
        titulo: "Transferir ou encerrar várias conversas de uma vez",
        passos: [
          "Clique em “Selecionar”, ao lado da busca da lista.",
          "Marque as conversas, ou “Selecionar todas”, no fim da lista.",
          "Escolha para quem transferir ou como encerrar e clique no botão ao lado. Nada é enviado aos candidatos, e cada conversa passa pela mesma regra de quando é feita uma por vez: a que não puder, fica de fora com o motivo.",
        ],
      },
      {
        titulo: "Encerrar um atendimento",
        passos: [
          "Clique em “Encerrar atendimento”.",
          "Em “Como terminou este atendimento?”, escolha o desfecho, como “Resolvido” ou “Candidato parou de responder”.",
          "Clique em “Encerrar”. Nada é enviado ao candidato: a conversa volta ao assistente, sem responsável, e a próxima mensagem dele abre um novo atendimento.",
        ],
      },
      {
        titulo: "Ligar a conversa a uma candidatura",
        passos: [
          "Se a conversa ainda não está ligada, abra a aba “Ligar à candidatura”, embaixo do painel.",
          "Em “Quem é esta pessoa?”, escolha a candidatura. Só aparecem as candidaturas em andamento.",
          "Clique em “Ligar”. Só depois disso o assistente consulta o processo do candidato, e a nota da triagem aparece nos dados do painel.",
          "Se ligou à pessoa errada, clique no “…” do topo do painel e em “Desfazer o vínculo com a candidatura”.",
        ],
      },
    ],
    dicas: [
      "Se o candidato pediu para parar (situação “Não quer mensagens”), ninguém pode responder, assumir nem devolver a conversa ao assistente. Ela só volta quando o próprio candidato escrever de novo.",
      "Na situação “Fora da janela”, o WhatsApp não deixa retomar a conversa pela tela: ligue para o candidato ou aguarde ele escrever.",
      "Só quem assumiu a conversa pode soltá-la.",
      "Transferir uma conversa não manda nada ao candidato: ela passa a ser de quem recebe, e essa pessoa é avisada no sino.",
    ],
  },

  // ─── Recrutamento: Testes ─────────────────────────────────────────────────
  {
    chave: "recrutamento_testes",
    titulo: "Testes",
    caminhos: ["/testes"],
    resumo:
      "Envia testes de perfil comportamental (DISC) e de múltipla escolha para candidatos e reúne as respostas e os resultados. Os de múltipla escolha saem de modelos (Português, Matemática…) que se reaproveitam em vários candidatos.",
    secoes: [
      {
        titulo: "Enviar um teste a um candidato",
        passos: [
          "Clique em “Enviar teste”, à direita do título, e escolha o “Candidato” na janela.",
          "Em “Tipo de teste”, escolha “DISC (perfil comportamental)” ou um modelo de múltipla escolha.",
          "Clique em “Enviar teste”, no fim da janela. Se o candidato tiver e-mail cadastrado, o link vai por e-mail.",
          "Para ver o link, clique em “Abrir” na linha do teste. Ele vale por 7 dias.",
        ],
      },
      {
        titulo: "Acompanhar os resultados",
        passos: [
          "Clique no cartão “Aguardando resposta” ou “Respondidos” para recortar a lista.",
          "Use o filtro da coluna “Teste” para ver um tipo de teste só.",
          "Na coluna “Resultado”, veja o perfil DISC ou o percentual de acertos.",
          "Clique em “Abrir” para ver o resultado completo: no DISC, as barras, o gráfico de teia e o perfil explicado em palavras simples; no questionário, cada pergunta com a resposta dada e a certa, e o filtro “Erradas”.",
        ],
      },
      {
        titulo: "Mandar o link de novo ou pelo WhatsApp",
        passos: [
          "Clique em “Abrir” na linha do teste que está aguardando resposta.",
          "Use “Copiar” para colar o link onde quiser, ou “Mandar no WhatsApp”: a mensagem já vai com a vaga, o link e até quando ele vale.",
          "Embaixo, o prazo mostra quantos dias faltam. Se o link vencer, clique em “Gerar novo link”: o anterior deixa de funcionar e o novo vale por mais 7 dias.",
        ],
      },
      {
        titulo: "Criar um modelo de múltipla escolha",
        passos: [
          "Clique em “Modelos de teste” e depois em “Novo modelo”.",
          "Preencha o “Nome do modelo” e, se quiser, a “Descrição”.",
          "Escreva cada pergunta, preencha as alternativas e marque a correta.",
          "Use “Adicionar alternativa” e “Adicionar pergunta” para incluir mais.",
          "Clique em “Criar modelo”.",
        ],
      },
    ],
    dicas: [
      "Um modelo que já foi usado não pode ser excluído, só arquivado: botão “⋯” da linha e “Arquivar”.",
      "Você também pode enviar teste pela ficha do candidato ou pela candidatura dentro da vaga, no quadro “Teste”.",
      "O DISC mostra o jeito de trabalhar de cada pessoa. Não serve para aprovar ou reprovar.",
    ],
  },

  // ─── Societário: Processos ────────────────────────────────────────────────
  {
    chave: "societario_processos",
    titulo: "Processos",
    caminhos: ["/processos"],
    resumo:
      "A fila de processos societários — constituição, alteração contratual, baixa e alvarás — com o roteiro de etapas, os protocolos, as exigências e o prazo de cada um.",
    secoes: [
      {
        titulo: "Abrir um processo",
        passos: [
          "Clique em “Abrir processo”. A abertura tem três passos: “Empresa e tipo”, “O que o processo pede” e “Pedido ao cliente”.",
          "Busque a “Empresa” e escolha o “Tipo de processo”. O prazo previsto e as etapas do tipo aparecem no “Resumo”, ao lado. Tipo sem roteiro publicado não deixa continuar.",
          "Se quiser, preencha “Título” (o que diferencia este processo de outro do mesmo tipo na mesma empresa), “Responsável”, “Prioridade” e “Prazo combinado” (a data prometida ao cliente), e clique em “Continuar →”.",
          "Em “O que o processo pede”, a lista vem do checklist do roteiro do tipo. Marque o que já está com o escritório: o resto vai no pedido ao cliente.",
          "Em “Pedido ao cliente”, confira a “Mensagem”. Ela vai na conversa do processo: o cliente vê no portal e é avisado por e-mail.",
          "Clique em “Abrir processo”. Para abrir sem mandar nada ao cliente, use “Abrir sem pedir nada” ou desmarque “Mandar o pedido ao cliente ao abrir o processo”.",
        ],
      },
      {
        titulo: "Andar com as etapas e o checklist",
        passos: [
          "Abra o processo pela fila e vá até “Roteiro”.",
          "Marque os itens do checklist da etapa à medida que forem feitos.",
          "Nas etapas que não vão a um órgão, clique em “Concluir”.",
          "Se uma etapa opcional não se aplicar a este processo, clique em “Não se aplica”.",
          "Quando todas as etapas estão encerradas, o processo é concluído sozinho.",
        ],
      },
      {
        titulo: "Protocolar e registrar a resposta do órgão",
        passos: [
          "Na etapa que vai a um órgão, informe o número em “Nº do protocolo (opcional)” e clique em “Protocolar”.",
          "Quando o órgão aprovar, clique em “Deferido”.",
          "Se o órgão devolver, clique em “Exigência”, descreva “O que o órgão exigiu”, informe o “Prazo do órgão” e clique em “Registrar exigência”.",
          "Depois de cumprir a exigência, clique em “Marcar como cumprida”.",
          "Para apresentar de novo ao órgão, clique em “Reapresentar”. Cada reapresentação conta como uma volta de exigência.",
        ],
      },
      {
        titulo: "Pausar, retomar ou encerrar um processo",
        passos: [
          "No topo do processo, clique em “Esperar o cliente” ou em “Suspender” para pausá-lo; escreva o “Motivo” e clique em “Confirmar”.",
          "Para encerrar sem conclusão, abra o menu ⋯ e escolha “Indeferir” ou “Cancelar”.",
          "Escreva o “Motivo” e clique em “Indeferir” ou em “Cancelar o processo”.",
          "Para voltar a tocar o processo, clique em “Retomar”.",
        ],
      },
      {
        titulo: "Conferir os avisos da Junta",
        passos: [
          "Quando há aviso para conferir, o botão “avisos da Junta” aparece no alto de “Processos”, com a quantidade. Clique nele.",
          "Cada aviso é um e-mail do Empresa Fácil que chegou no endereço do Societário. O Connect lê o e-mail e sugere o desfecho.",
          "Confira o texto do órgão e clique em “Aplicar no protocolo”, ou em “Descartar” se não houver nada novo. Quem aplica é você.",
          "Os avisos de um processo também aparecem dentro dele, em “Avisos da Junta por e-mail”.",
        ],
      },
      {
        titulo: "Revisar as propostas da Ceci",
        passos: [
          "Clique em “Ceci · Societário”, no alto de “Processos”. O botão aparece para a coordenação.",
          "Clique em “Rodar varredura” para a Ceci procurar as pendências do setor. A leitura de contrato social fica na tela de sócios de cada empresa.",
          "Em “Esperando revisão”, clique em “Revisar →” na proposta.",
          "Na varredura, desmarque o que não quer encaminhar e clique em “Encaminhar”. Encaminhar sobe a prioridade de cada processo para alta e avisa o responsável com o próximo passo.",
          "No contrato social, confira cada sócio com o contrato ao lado, corrija o que a IA leu errado e desmarque quem não deve entrar.",
          "Em “Qualidade da IA, últimos 6 meses”, veja quanto do que a IA propõe é aprovado como veio, quanto precisa de ajuste, quanto é rejeitado e quanto custou.",
        ],
      },
      {
        titulo: "Montar o roteiro de um tipo de processo",
        passos: [
          "No botão “⋯” do alto de “Processos”, escolha “Roteiros dos processos” e abra o tipo.",
          "As etapas ficam na ordem em que o processo anda. Marque “Corre junto com a etapa de cima” para as duas ficarem na mesma posição e serem liberadas ao mesmo tempo.",
          "Com “Órgão”, concluir a etapa abre um protocolo nele. Com “Opcional”, o processo ganha o botão “Não se aplica” nesta etapa.",
          "No “Checklist”, liste o que a etapa pede. Item obrigatório trava a conclusão da etapa até ser marcado.",
          "Clique em “Publicar versão”. A versão nova vale para os processos abertos daqui em diante; os que estão em andamento continuam na versão em que começaram.",
        ],
      },
    ],
    dicas: [
      "Uma etapa com item obrigatório do checklist em aberto não pode ser concluída.",
      "O cliente vê no portal o motivo de pausa ou encerramento e tudo o que for escrito em “Mensagens”, e é avisado por e-mail. Para anotação interna, use as observações do processo.",
      "O roteiro do processo é congelado na abertura, para o processo não mudar embaixo de quem está tocando ele. A versão aparece no pé da tela do processo.",
      "Em “Taxas”, lance a guia da Junta, o DAM ou a taxa do Bombeiros quando sair. Ligada da 2ª apresentação em diante, a taxa conta como custo das voltas do processo.",
      "As horas lançadas em “Horas trabalhadas” entram nas horas de operação da Gestão.",
      "Em “Pergunte à Ceci”, no fim de “Processos”, pergunte sobre a fila — o que está parado, o que está em exigência, o que dá para destravar — ou peça para abrir um processo. A Ceci lê os mesmos processos que você vê e não altera nada: toda mudança passa pelo seu clique na sugestão.",
      "“Ver no kanban” mostra a mesma fila em colunas por situação. A coluna é a situação que os protocolos dizem: o cartão muda de coluna quando o desfecho é registrado no processo, e não arrastando.",
    ],
  },

  // ─── Societário: Licenças ─────────────────────────────────────────────────
  {
    chave: "societario_licencas",
    titulo: "Licenças",
    caminhos: ["/licencas"],
    resumo:
      "Guarda as licenças das empresas — alvará, sanitária, ambiental, bombeiros — e monta a fila do que precisa ser renovado.",
    secoes: [
      {
        titulo: "Cadastrar uma licença",
        passos: [
          "Clique em “Nova licença”.",
          "Busque a “Empresa” e, em “Licença”, escolha uma sugestão ou escreva o nome que o órgão usa.",
          "Preencha “Órgão”, “Número”, “Emissão” e “Validade”. Deixe a validade em branco se a licença não vence (a inscrição municipal, por exemplo).",
          "Para não digitar, use “Ler do PDF”: a IA lê o alvará ou a licença e preenche número, emissão e validade. Nada é gravado antes de você conferir e salvar, e o PDF vai para Arquivos › Societário junto com a licença.",
          "Clique em “Cadastrar”.",
        ],
      },
      {
        titulo: "Importar licenças de uma planilha",
        passos: [
          "Clique em “Importar planilha” e em “Baixar o modelo (.xlsx)”.",
          "Preencha o modelo do Connect: uma licença por linha, com o CNPJ da empresa.",
          "Suba a planilha e clique em “Conferir”. Antes de gravar, a tela mostra o que entra, o que já está cadastrado e o que tem erro.",
          "Clique em “Importar”. Só as novas são gravadas; as linhas com erro ficam de fora para corrigir e importar de novo.",
        ],
      },
      {
        titulo: "Receber os vencimentos por e-mail",
        passos: [
          "Clique em “Avisos por e-mail”.",
          "Ligue “Enviar o e-mail diário” e escreva em “Quem recebe” um e-mail por linha, ou separados por vírgula.",
          "Clique em “Salvar” e, se quiser, em “Enviar teste” para mandar agora à lista salva o que está na janela hoje.",
          "O e-mail sai uma vez por dia, a partir das 7h, com uma tabela do que pede atenção. Cada documento entra uma vez por marco: o que já foi avisado não se repete no dia seguinte.",
        ],
      },
      {
        titulo: "Acompanhar o que precisa ser renovado",
        passos: [
          "A tela abre em “Precisa de ação”: as licenças vencidas e as que vencem nos próximos 60 dias.",
          "Clique nos cartões “Vencidas”, “A renovar” ou “Vigentes” para recortar a lista, ou use “Filtros” para ver “Todas”.",
          "Use os filtros das colunas “Empresa”, “Licença”, “Órgão” e “Validade” para achar uma licença.",
        ],
      },
      {
        titulo: "Atualizar ou revogar uma licença",
        passos: [
          "Clique em “Editar” na linha, ajuste os dados — por exemplo, a nova validade depois da renovação — e clique em “Salvar”.",
          "Para tirar a licença da fila, clique no botão “⋯” da linha, escolha “Revogar” e confirme.",
          "Se revogou por engano, use o botão “⋯” e escolha “Reativar”.",
        ],
      },
    ],
    dicas: [
      "As licenças entram na fila de renovação 60 dias antes de vencer.",
      "No e-mail diário, as licenças entram a 90, 60 e 30 dias do vencimento e quando vencem (até 30 dias depois); as certidões, quando o módulo de Certidões está ligado.",
      "Revogar não apaga a licença: o histórico continua na empresa.",
    ],
  },

  // ─── Societário: Minha área ───────────────────────────────────────────────
  {
    chave: "societario_minha_area",
    titulo: "Minha área",
    caminhos: ["/societario/minha-area"],
    resumo:
      "O que está na sua mão, por prazo: os processos de que você é responsável, as exigências e taxas deles e as licenças vencendo nessas empresas.",
    secoes: [
      {
        titulo: "Ver o que vence primeiro",
        passos: [
          "Confira no topo os números de “Vencidos”, “Hoje” e “Próximos 7 dias”.",
          "Percorra a lista, agrupada em “Vencido”, “Hoje”, “Próximos 7 dias”, “Depois” e “Sem data”.",
          "Cada item diz se é exigência, taxa, licença ou prazo combinado com o cliente.",
          "Clique no item para abrir o processo — ou a visão societária da empresa, no caso de licença.",
        ],
      },
      {
        titulo: "Ver os seus processos",
        passos: [
          "Clique no cartão “Processos abertos” para ver, na fila de processos, só os que estão com você.",
          "Ou clique em “Meus processos no kanban” para vê-los em colunas por situação.",
          "Clique em um processo para abri-lo e continuar o roteiro.",
        ],
      },
    ],
    dicas: [
      "Só entra aqui o que é de processo em que você é o responsável. Para mudar o responsável, use “Editar dados” na tela do processo.",
    ],
  },

  // ─── Societário: Exigências e prazos ──────────────────────────────────────
  {
    chave: "societario_prazos",
    titulo: "Exigências e prazos",
    caminhos: ["/exigencias"],
    resumo:
      "Reúne as exigências de todos os processos e os protocolos parados no órgão. Os prazos (de órgão, taxa, licença e combinados com o cliente) ficam na Agenda geral.",
    secoes: [
      {
        titulo: "Acompanhar as exigências",
        passos: [
          "Na aba “Exigências”, a lista mostra as exigências abertas, com o prazo que o órgão deu.",
          "Clique em “Filtros” para ver as “Cumpridas” ou “Todas”, ou para escolher um “Responsável”.",
          "Clique no processo para abri-lo, ou no nome da empresa para ver a visão societária dela.",
          "Quando a exigência for cumprida, clique em “Marcar como cumprida”.",
        ],
      },
      {
        titulo: "Cobrar os protocolos parados",
        passos: [
          "Clique na aba “Protocolos parados”: estão ali os protocolos que esperam o órgão há mais tempo que o prazo do aviso.",
          "A coluna “Parado há” fica vermelha quando o protocolo já passou do dobro do prazo.",
          "Cobrou o órgão por telefone, e-mail ou no balcão? Clique em “Registrar cobrança”: a data e o seu nome vão para “Última cobrança”.",
          "Quem administra o setor escolhe, no alto da aba, depois de quantos dias o responsável é avisado.",
        ],
      },
      {
        titulo: "Ver os prazos na Agenda",
        passos: [
          "Clique em “Ver prazos na Agenda”, no alto da tela.",
          "A Agenda abre só com os prazos do Societário. Para ver os de todos os setores, clique em “Ver todos os setores”.",
        ],
      },
    ],
    dicas: [
      "A exigência nasce no roteiro do processo, quando um protocolo volta do órgão.",
      "Na coluna “Órgão”, o aviso de tentativa (por exemplo, “2ª tentativa”) indica que o processo já voltou antes.",
      "“Marcar como cumprida” só aparece enquanto o processo está aberto e para quem atua no setor.",
    ],
  },

  // ─── Societário: Relatórios ───────────────────────────────────────────────
  {
    chave: "societario_relatorios",
    titulo: "Relatórios",
    caminhos: ["/processos/relatorios"],
    resumo:
      "Indicadores do Societário: prazo cumprido por tipo de processo, voltas de exigência, produtividade por responsável e custo em taxas.",
    secoes: [
      {
        titulo: "Escolher o período",
        passos: [
          "Clique em “Filtros” e escolha o “Período”: “Últimos 30 dias”, “Últimos 90 dias” ou “Últimos 12 meses”.",
          "Os quadros consideram os processos abertos agora e os concluídos no período escolhido.",
          "Confira os cartões do topo: “Abertos agora”, “Abertos com prazo estourado”, os concluídos no período e “Processos com volta”.",
        ],
      },
      {
        titulo: "Ler os quadros",
        passos: [
          "Em “SLA por tipo”, compare os dias úteis consumidos com o previsto de cada tipo de processo. As voltas ficam na mesma linha porque são a causa do estouro.",
          "Em “Processos que mais voltaram”, veja os processos com reapresentação, do que mais voltou para o que menos voltou, e clique para abri-los.",
          "Em “Produtividade por responsável”, veja os concluídos no período ao lado da carteira aberta de cada pessoa.",
          "Em “Tempo por etapa”, veja quanto cada etapa do roteiro leva, por tipo de processo, nas etapas concluídas no período — em dias úteis, do início ao fim da etapa.",
          "Em “Custo em taxas por processo”, veja quanto cada processo custou em taxas e quanto disso veio de reapresentação.",
          "Embaixo de cada relatório, a frase de leitura diz o que o número quer dizer.",
        ],
      },
    ],
    dicas: [
      "Os prazos são contados em dias úteis, descontando os feriados do escritório.",
      "A produtividade conta para o responsável atual do processo: se o processo mudou de mãos, o crédito fica todo com quem está com ele agora.",
    ],
  },

  // ─── Societário: Painel ───────────────────────────────────────────────────
  // Os artigos abaixo vieram do texto que saiu das telas (17/11/2026, melhoria-707).
  {
    chave: "societario_painel",
    titulo: "Painel do Societário",
    caminhos: ["/processos/painel"],
    resumo:
      "O dia do setor numa tela: o que está parado, o que vence e o que pede alguém, em números no alto e numa fila do que fazer hoje.",
    secoes: [
      {
        titulo: "Ler os números do dia",
        passos: [
          "Confira os cartões do alto: “Protocolos parados”, “Exigências em 7 dias”, “Processos estourados” e “Licenças a renovar” — e “Certidões positivas” e “Robô”, quando esses módulos estão ligados.",
          "Clique num cartão para abrir a tela com a lista completa daquele número.",
        ],
      },
      {
        titulo: "Andar com a fila do dia",
        passos: [
          "Em “O que fazer hoje”, a fila vem da mais urgente para a menos: protocolo parado e exigência vencendo primeiro; depois processo estourado, exigência da semana, licença vencida, certidão positiva e licença a renovar.",
          "Clique no item, ou em “Abrir”, para ir ao processo, à licença ou à certidão.",
          "No protocolo parado, clique em “Registrar cobrança” depois de cobrar o órgão.",
        ],
      },
    ],
    dicas: [
      "A fila mostra até 40 itens; os números do alto contam todos.",
    ],
  },

  // ─── Societário: Órgãos ───────────────────────────────────────────────────
  {
    chave: "societario_orgaos",
    titulo: "Órgãos",
    caminhos: ["/processos/orgaos"],
    resumo:
      "Onde os processos esperam: os protocolos em cada órgão, há quanto tempo e quanto o órgão costuma levar para responder.",
    secoes: [
      {
        titulo: "Ver onde os processos esperam",
        passos: [
          "Confira os cartões do alto: “Protocolos esperando”, os parados, a “Resposta média” e os “Órgãos com protocolo”.",
          "Na tabela, cada órgão mostra quantos protocolos esperam, quantos estão parados, a resposta média, as voltas por protocolo e a última resposta.",
          "Clique em “Ver protocolos” para ver os protocolos que esperam naquele órgão, com a empresa, o número e há quantos dias.",
          "No protocolo parado, clique em “Registrar cobrança” depois de cobrar o órgão.",
        ],
      },
    ],
    dicas: [
      "Resposta média e voltas por protocolo contam os últimos 90 dias.",
      "Os protocolos parados também estão em “Exigências e prazos”, na aba “Protocolos parados”.",
    ],
  },

  // ─── Societário: Certidões ────────────────────────────────────────────────
  {
    chave: "societario_certidoes",
    titulo: "Certidões",
    caminhos: ["/certidoes"],
    resumo:
      "As certidões federal, FGTS, trabalhista, estadual e municipal de cada empresa da carteira, renovadas sozinhas a cada trimestre pela InfoSimples.",
    secoes: [
      {
        titulo: "Encontrar as certidões de uma empresa",
        passos: [
          "Busque a empresa pelo nome ou pelo CNPJ.",
          "Use os atalhos “Todas”, “Positivas a ver”, “Sem certidão” e “Vencendo em 15 dias” para recortar a lista. O número ao lado é quantas empresas há em cada um.",
          "Clique no nome da empresa (no celular, em “Ver certidões”) para abrir o painel com cada certidão, a situação e o PDF.",
        ],
      },
      {
        titulo: "Emitir uma certidão fora da rotina",
        passos: [
          "Na linha da empresa, clique em “Emitir” e escolha a certidão, ou “Emitir todas”. No painel da empresa, cada certidão tem o seu “Emitir”.",
          "Confirme. Cada emissão é uma consulta cobrada pela InfoSimples, e pode levar alguns minutos.",
          "Quando a certidão sai, o PDF aparece no painel da empresa, em “PDF”.",
        ],
      },
      {
        titulo: "Tratar uma certidão positiva",
        passos: [
          "Clique em “Positivas a ver” para ver as empresas com certidão positiva que ninguém do setor viu.",
          "Abra a empresa, confira o PDF e trate com o setor da certidão.",
          "Clique em “Marcar como vista”. A empresa sai do atalho “Positivas a ver”.",
        ],
      },
    ],
    dicas: [
      "Federal, FGTS e trabalhista valem para a raiz do CNPJ e saem pela matriz; a estadual do PR, uma por raiz entre os estabelecimentos do estado; a municipal, por estabelecimento em Curitiba.",
      "A rotina consulta um terço da carteira em cada mês do trimestre, para o custo ficar no mínimo da InfoSimples, e tenta de novo, até três vezes, a que não saiu.",
      "A certidão regular vai para Arquivos › Certidões, que o cliente vê no portal. A positiva fica em Arquivos › Societário até o setor decidir, e avisa o Societário e o setor da certidão.",
      "A certidão simplificada da Junta não entra: é paga a cada pedido.",
      "O cartão “Gasto no mês” soma só as consultas que a InfoSimples cobra, contra o teto configurado.",
    ],
  },

  // ─── Societário: Hub de robôs ─────────────────────────────────────────────
  {
    chave: "societario_robo",
    titulo: "Hub de robôs",
    caminhos: ["/robo"],
    resumo:
      "O que a máquina do TI faz nos sites dos órgãos: a fila, o que já foi e o que parou para alguém olhar. Hoje o robô do Societário imprime o alvará de Curitiba, lê a situação da inscrição estadual no PR e acompanha os protocolos do SIMA.",
    secoes: [
      {
        titulo: "Pedir a impressão do alvará",
        passos: [
          "Em “Licenças”, clique no botão “⋯” de uma licença de alvará e escolha “Imprimir pelo robô”.",
          "A tarefa entra na fila do Hub de robôs como “Na fila”. A máquina do TI busca a tarefa na próxima volta.",
          "Quando termina, clique em “Abrir o PDF” na linha. O PDF fica em Arquivos › Societário.",
        ],
      },
      {
        titulo: "Resolver o captcha do robô",
        passos: [
          "Quando o robô para no “Não sou um robô”, o aviso chega no sino e no celular, e a linha da tarefa mostra “Resolver o captcha”.",
          "Clique em “Resolver o captcha” e, na tela ao vivo, clique na caixa “Não sou um robô”. Se aparecer um desafio de imagens, clique nas imagens pedidas e depois em Verificar.",
          "O robô continua sozinho assim que o site liberar. Se o prazo acabar, a tarefa segue pelo caminho do PDF.",
        ],
      },
    ],
    dicas: [
      "Para tirar da fila uma tarefa que ainda não começou, clique em “Cancelar” na linha. Dá para pedir de novo pela licença.",
      "Se a máquina do robô não responde, nada é lido: ligue a máquina ou rode a tarefa robo-societario no Agendador de Tarefas.",
    ],
  },
];

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
    titulo: "Horas Extras",
    caminhos: ["/horas-extras"],
    resumo: "Reúne os lançamentos de horas extras de todos os colaboradores que estão aguardando aprovação.",
    secoes: [
      {
        titulo: "Lançar horas extras",
        passos: [
          "Abra a ficha do colaborador, vá à aba “Dados trabalhistas” e clique em “Horas extras”.",
          "Informe a “Data” e o “Tipo de dia”.",
          "Preencha “Horas devidas”, “Horas trabalhadas”, “Horas extras” e “Adicional”, conforme o caso, e a “Justificativa”.",
          "Clique em “Lançar horas”. O lançamento entra pendente de aprovação e aparece em “Horas Extras”.",
        ],
      },
      {
        titulo: "Aprovar ou reprovar um lançamento",
        passos: [
          "Em “Horas Extras”, use os filtros das colunas “Colaborador”, “Data” e “Tipo do dia”, se precisar.",
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
      "Excluir uma turma, pelo botão “⋯” da linha, leva junto os participantes dela.",
      "Treinamento sem validade aparece como “Sem validade”; preencha a validade nos que precisam de reciclagem.",
      "Só o gestor do setor e os administradores cadastram treinamentos, turmas e participantes.",
    ],
  },

  // ─── DP: Avaliações de desempenho ─────────────────────────────────────────
  {
    chave: "dp_avaliacoes",
    titulo: "Avaliações de Desempenho",
    caminhos: ["/avaliacoes"],
    resumo:
      "Organiza as avaliações de desempenho em ciclos. Cada ciclo reúne as notas por competência dos colaboradores avaliados e o plano de desenvolvimento de cada um.",
    secoes: [
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
          "Em “Notas por Competência (0-10)”, dê uma nota para cada competência.",
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
      "As competências avaliadas vêm do cadastro em “Admin → Competências”. Sem nenhuma cadastrada, não dá para avaliar.",
      "Depois de encerrado, o ciclo não aceita novas avaliações, e não há como reabri-lo pela tela.",
      "Para corrigir uma avaliação, clique em “Abrir” na linha do colaborador, dentro do ciclo.",
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
        titulo: "Vincular candidatos e movê-los pelo funil",
        passos: [
          "Abra a vaga e vá até “Funil de recrutamento”.",
          "Logo abaixo do funil, em “Nova candidatura”, escolha o “Candidato”, informe a “Origem” (por exemplo, LinkedIn) e clique em “Vincular candidato”. Se a pessoa ainda não está no banco, clique em “Novo candidato”, ao lado do nome do bloco.",
          "Arraste o cartão do candidato entre as etapas “Triagem”, “Entrevista”, “Teste”, “Proposta” e “Contratado”, ou escolha a etapa na lista do próprio cartão.",
          "Para tirar alguém do funil, clique no botão “⋯” do cartão e escolha “Reprovar” ou “Desistiu”.",
          "Informe o “Motivo”, se quiser, e confirme. O candidato vai para a faixa de encerrados.",
        ],
      },
      {
        titulo: "Pontuar os currículos com a IA",
        passos: [
          "Na seção “Triagem de currículos”, escreva cada requisito e escolha “Obrigatório” ou “Desejável” e o peso.",
          "Clique em “Adicionar requisito” para incluir outros e ajuste “Compatível a partir de” e “Parcial a partir de”, se quiser.",
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
      "A nota da triagem só ordena os candidatos — nunca reprova ninguém. Nome, idade, cidade e foto não chegam à IA.",
      "O “Assistente da vaga” responde perguntas sobre os candidatos e sugere movimentos, mas não altera nada: cada sugestão só vale depois que você clica em “Aplicar”.",
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
        titulo: "Analisar o currículo e marcar habilidades",
        passos: [
          "Na ficha do candidato, em “Tags / Habilidades”, marque as tags que descrevem a pessoa.",
          "Em “Triagem de currículo (IA)”, clique em “Analisar currículo”. A IA lê o PDF, preenche os campos vazios da ficha e mostra um resumo profissional.",
          "Em “Teste”, escolha o “Tipo de teste” e clique em “Enviar teste”.",
          "Em “Candidaturas”, clique no nome da vaga para abrir o funil dela.",
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
      "A análise do currículo precisa de um PDF: o enviado pela candidatura no portal ou um documento da categoria Currículo na ficha.",
      "Marcar tags deixa o candidato fácil de achar no banco de talentos, mesmo que ele não avance na vaga atual.",
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
          "Digite o nome no campo de busca.",
          "Clique em “Filtros” para escolher a “Empresa” e a “Situação”.",
          "Clique no nome para abrir a ficha, onde ficam as abas de férias, afastamentos, desligamento e os demais registros do DP.",
        ],
      },
    ],
    dicas: [
      "Por padrão, a lista esconde os inativos. Quando houver algum, o aviso acima da tabela mostra quantos ficaram de fora, com o link “Mostrar todos”.",
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
          "Clique no cartão “Sem responsável” para ver as conversas que o assistente passou adiante e ninguém assumiu, ou em “Minhas” para ver as suas.",
          "Clique na conversa para abri-la. Se o assistente passou para uma pessoa, o motivo aparece logo abaixo do nome do candidato.",
        ],
      },
      {
        titulo: "Assumir, responder e devolver uma conversa",
        passos: [
          "Clique em “Assumir” para ficar com a conversa.",
          "Escreva no campo de resposta e clique em “Enviar”. Responder também assume a conversa, e o assistente para de responder nela.",
          "Para deixar a conversa sem responsável, clique em “Soltar”.",
          "Para o assistente voltar a atender, clique em “Devolver ao assistente”.",
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
          "Se a conversa ainda não está ligada, vá ao campo “Quem é esta pessoa?”.",
          "Escolha a candidatura. Só aparecem as candidaturas em andamento.",
          "Clique em “Ligar”. Só depois disso o assistente consulta o processo do candidato.",
          "Se ligou à pessoa errada, clique em “desfazer”.",
        ],
      },
    ],
    dicas: [
      "Se o candidato pediu para parar (situação “Não quer mensagens”), ninguém pode responder, assumir nem devolver a conversa ao assistente. Ela só volta quando o próprio candidato escrever de novo.",
      "Na situação “Fora da janela”, o WhatsApp não deixa retomar a conversa pela tela: ligue para o candidato ou aguarde ele escrever.",
      "Só quem assumiu a conversa pode soltá-la.",
    ],
  },

  // ─── Recrutamento: Testes ─────────────────────────────────────────────────
  {
    chave: "recrutamento_testes",
    titulo: "Testes",
    caminhos: ["/testes"],
    resumo:
      "Envia testes de perfil comportamental (DISC) e de múltipla escolha para candidatos e reúne as respostas e os resultados.",
    secoes: [
      {
        titulo: "Enviar um teste a um candidato",
        passos: [
          "No topo da tela, escolha o “Candidato”.",
          "Em “Tipo de teste”, escolha “DISC (perfil comportamental)” ou um modelo de múltipla escolha.",
          "Clique em “Enviar teste”. Se o candidato tiver e-mail cadastrado, o link vai por e-mail.",
          "Para ver o link, clique em “Abrir” na linha do teste. Ele vale por 7 dias.",
        ],
      },
      {
        titulo: "Acompanhar os resultados",
        passos: [
          "Clique no cartão “Aguardando resposta” ou “Respondidos” para recortar a lista.",
          "Use o filtro da coluna “Teste” para ver um tipo de teste só.",
          "Na coluna “Resultado”, veja o perfil DISC ou o percentual de acertos.",
          "Clique em “Abrir” para ver o resultado completo.",
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
          "Clique em “Abrir processo”.",
          "Busque a “Empresa” e escolha o “Tipo de processo”. O prazo previsto aparece ao lado de cada tipo.",
          "Se quiser, preencha “Título”, “Responsável”, “Prioridade” e “Prazo combinado”.",
          "Clique em “Abrir”.",
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
    ],
    dicas: [
      "Uma etapa com item obrigatório do checklist em aberto não pode ser concluída.",
      "O cliente vê no portal o motivo de pausa ou encerramento e tudo o que for escrito em “Conversa com o cliente”.",
      "“Ver no kanban” mostra a mesma fila em colunas por situação. O cartão muda de coluna quando o desfecho é registrado no processo, e não arrastando.",
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
          "Preencha “Órgão”, “Número”, “Emissão” e “Validade”. Deixe a validade em branco se a licença não vence.",
          "Clique em “Cadastrar”.",
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
    caminhos: ["/societario/exigencias", "/societario/agenda"],
    resumo:
      "Reúne as exigências de todos os processos e uma agenda única com prazos de órgão, vencimentos de taxa, validades de licença e prazos combinados com o cliente.",
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
        titulo: "Ver a agenda de prazos",
        passos: [
          "Clique na aba “Agenda de prazos”.",
          "Os prazos aparecem agrupados por semana, com os já vencidos em destaque no topo.",
          "Clique em “Filtros” e use “Agrupar” para ver por mês, ou “Responsável” para ver os prazos de uma pessoa.",
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
    caminhos: ["/societario/relatorios"],
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
          "Em “SLA por tipo”, compare os dias úteis consumidos com o previsto de cada tipo de processo.",
          "Em “Processos que mais voltaram”, veja os processos com mais reapresentações e clique para abri-los.",
          "Em “Produtividade por responsável”, veja os concluídos e a carteira aberta de cada pessoa.",
          "Em “Custo em taxas por processo”, veja o total gasto em taxas e quanto foi de reapresentação.",
        ],
      },
    ],
    dicas: [
      "Os prazos são contados em dias úteis, descontando os feriados do escritório.",
      "A produtividade conta para o responsável atual do processo: se o processo mudou de mãos, o crédito fica todo com quem está com ele agora.",
    ],
  },
];

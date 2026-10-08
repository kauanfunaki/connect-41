import type { ArtigoDeAjuda } from "../tipos";

// Os artigos das telas gerais e de alguns módulos (02/10/2026), escritos a
// partir do código de cada tela. Os rótulos entre aspas curvas são os da tela:
// quando um botão mudar de nome, o texto muda junto.
export const ARTIGOS_GERAIS: ArtigoDeAjuda[] = [
  // ─── Início ────────────────────────────────────────────────────────────────
  {
    chave: "geral:inicio",
    titulo: "Início",
    caminhos: ["/home"],
    resumo:
      "O resumo do seu trabalho e do escritório: indicadores, painéis dos setores, o seu dia, as transferências que esperam o seu setor e as próximas reuniões.",
    secoes: [
      {
        titulo: "Como ler o Início",
        passos: [
          "Clique em “Início”, no topo da barra lateral. O logo do Connect, acima do menu, também leva ao Início.",
          "No alto ficam os indicadores “Empresas ativas”, “Atrasadas / hoje”, “Transferências” e “Pessoas cadastradas”. Clique em um deles para abrir a lista correspondente.",
          "Logo abaixo, a faixa “Destaques” mostra os três números que mais pedem a sua atenção — em vermelho, o que está vencido ou atrasado. Clique num cartão para abrir a tela de onde ele vem.",
          "Depois vêm os painéis com gráficos, como “Tarefas por prazo”, e os painéis dos setores que você enxerga.",
          "No bloco “Meu dia”, clique em um item para abrir a tarefa.",
          "Em “Transferências a revisar”, clique em “Revisar” para abrir a transferência que espera o seu setor.",
        ],
      },
      {
        titulo: "Como criar uma empresa, pessoa ou transferência pelo Início",
        passos: [
          "Clique em “Criar”, no canto superior direito.",
          "Escolha “Nova empresa”, “Nova pessoa” ou “Nova transferência”.",
          "Preencha o formulário que abrir e salve.",
        ],
      },
      {
        titulo: "Como personalizar o Início",
        passos: [
          "Clique em “Personalizar”, ao lado da data.",
          "Marque os blocos que você quer ver e desmarque os que não usa.",
          "Use as setas para cima e para baixo para mudar a ordem dentro de cada faixa: “Topo”, “Painéis”, “Coluna principal” e “Coluna lateral”.",
          "Clique em “Salvar”. Para voltar ao modelo original, clique em “Restaurar padrão”.",
        ],
      },
    ],
    dicas: [
      "A personalização vale só para você: os colegas continuam vendo o Início do jeito deles.",
      "O botão “Criar” aparece para administradores e gestores de setor, só com as opções que o perfil permite.",
      "O bloco “Visão do workspace” aparece só para quem coordena setor ou administra o escritório.",
    ],
  },

  // ─── Meu dia ───────────────────────────────────────────────────────────────
  {
    chave: "geral:meu-dia",
    titulo: "Meu dia",
    caminhos: ["/tarefas"],
    resumo:
      "Tudo o que é seu, de todos os setores, numa tela só: processos, tarefas, pendências, transferências e solicitações, na ordem do que é mais urgente.",
    secoes: [
      {
        titulo: "Como começar o dia pelo Meu dia",
        passos: [
          "Clique em “Meu dia”, logo abaixo de “Início” na barra lateral.",
          "Confira os números do topo: “Atrasados”, “Vencem em breve”, “Parados”, “Em andamento” e “Feitos na semana”.",
          "Comece pela lista “Pede você agora”: ela traz o que está atrasado, vencendo ou parado, do mais urgente para o menos urgente.",
          "Clique no título de um item para abri-lo. O ícone e o rótulo dizem de onde ele vem (processo, tarefa, pendência, transferência ou solicitação) e a bolinha colorida mostra o setor.",
          "Depois, siga pelas listas “Em andamento” e “Para começar”.",
        ],
      },
      {
        titulo: "Como ver as reuniões e os prazos da semana",
        passos: [
          "Na coluna da direita, veja “Próximas reuniões” e clique em “Entrar” para abrir a chamada.",
          "Em “Prazos da semana”, confira os vencimentos dos seus setores nos próximos 7 dias, dia a dia.",
          "Clique em “Abrir agenda” para ver a semana inteira na Agenda.",
          "Para ver as tarefas em quadro, clique em “Quadros”, no topo da tela.",
        ],
      },
      {
        titulo: "Como acompanhar o time",
        passos: [
          "No topo da tela, troque de “Meu dia” para “Meu time”.",
          "As listas passam a mostrar o trabalho dos setores que você coordena, com o nome de quem responde por cada item.",
          "Em “Carga do time”, veja quantos itens cada pessoa tem em aberto, quantos estão atrasados e quantos estão parados.",
          "Fique de olho no aviso “sem responsável”: são itens que ninguém assumiu.",
        ],
      },
    ],
    dicas: [
      "A opção “Meu time” só aparece para quem coordena setor ou administra o escritório.",
      "Com um setor escolhido no menu, as duas visões mostram só aquele setor.",
    ],
  },

  // ─── Empresas ──────────────────────────────────────────────────────────────
  {
    chave: "geral:empresas",
    titulo: "Empresas",
    caminhos: ["/empresas"],
    resumo:
      "O cadastro das empresas atendidas pelo escritório: a lista com busca e filtros e a ficha de cada empresa, com filiais, pessoas, documentos, conversas e histórico.",
    secoes: [
      {
        titulo: "Como encontrar uma empresa",
        passos: [
          "Abra “Cadastros” na barra lateral. A tela tem as abas “Empresas”, “Clientes” e “Pessoas”; fique em “Empresas”.",
          "Digite parte do nome ou do ID no campo “Buscar por nome ou ID…”.",
          "Para trocar o status mostrado, clique em “Filtros” e escolha “Ativo”, “Prospecto”, “Inativo”, “Cancelado” ou “Todos, incluindo inativos”.",
          "Para filtrar por regime ou cidade, clique no funil ao lado do título das colunas “Regime” e “Localização” e marque os valores.",
          "Se a empresa tiver filiais, clique na seta ao lado do nome para mostrá-las.",
        ],
      },
      {
        titulo: "Como consultar a ficha de uma empresa",
        passos: [
          "Clique no nome da empresa na lista.",
          "Em “Visão geral”, veja os dados cadastrais e os “Serviços contratados”. Clique em “Gerar resumo” para um resumo dos últimos 90 dias.",
          "Use as abas “Filiais”, “Pessoas”, “Documentos”, “Conversas” e “Histórico” para o restante das informações.",
          "Na aba “RH & operação”, entre em “Sócios”, “Cargos”, “Departamentos”, “Benefícios”, “Turnos”, “Folha de pagamento” e “Documentos para cliente”.",
          "Para passar um assunto da empresa a outro setor, clique em “Solicitar transferência”.",
        ],
      },
      {
        titulo: "Como cadastrar uma empresa",
        passos: [
          "Na lista, clique em “Nova empresa”.",
          "Escolha o “Tipo de cadastro”. Com CNPJ, os dados se preenchem sozinhos ao completar os dígitos.",
          "Confira e complete os campos de cada etapa, clicando em “Avançar →”.",
          "Na última etapa, revise o resumo e clique em “Confirmar e salvar”.",
        ],
      },
      {
        titulo: "Como inativar ou reativar uma empresa",
        passos: [
          "Na linha da empresa, clique nos três pontinhos ao lado de “Editar” e escolha “Inativar”.",
          "Confirme na janela que abrir.",
          "Para trazer de volta, clique em “Filtros”, escolha “Inativo” e, no mesmo menu da linha, clique em “Reativar”.",
          "Para mudar várias de uma vez, marque as caixas à esquerda e use “Inativar”, ou escolha o novo status e clique em “Alterar status”.",
        ],
      },
    ],
    dicas: [
      "Por padrão a lista mostra só as empresas em operação. Inativas e canceladas ficam de fora, e um aviso com “Mostrar todas” diz quantas são.",
      "Inativar não apaga nada: a empresa só sai da lista padrão e pode ser reativada depois.",
      "Cadastrar, editar e inativar empresas é para administradores e gestores de setor.",
    ],
  },

  // ─── Pessoas ───────────────────────────────────────────────────────────────
  {
    chave: "geral:pessoas",
    titulo: "Pessoas",
    caminhos: ["/pessoas"],
    resumo:
      "O cadastro dos funcionários internos do escritório, com a ficha de cada um: dados pessoais, vínculo, dados trabalhistas, documentos e histórico.",
    secoes: [
      {
        titulo: "Como encontrar uma pessoa",
        passos: [
          "Abra “Cadastros” na barra lateral e clique na aba “Pessoas”.",
          "Digite parte do nome no campo “Buscar por nome…”.",
          "Para ver quem está inativo, clique em “Filtros” e, em “Situação”, escolha “Inativos” ou “Todos”.",
          "Clique no nome para abrir a ficha.",
        ],
      },
      {
        titulo: "Como consultar a ficha de uma pessoa",
        passos: [
          "Em “Visão geral”, veja identificação, contato, endereço e a “Conta de acesso” ao Connect.",
          "Em “Vínculo”, veja a empresa, o cargo e o departamento.",
          "Em “Dados trabalhistas”, veja admissão, jornada, carga horária e dependentes.",
          "Use “Documentos”, “Conversas” e “Histórico” para os arquivos, os atendimentos e as movimentações nos quadros.",
          "Para passar um assunto da pessoa a outro setor, clique em “Solicitar transferência”.",
        ],
      },
      {
        titulo: "Como cadastrar um funcionário interno",
        passos: [
          "Na lista, clique em “Nova pessoa”.",
          "Preencha os dados de cada etapa e clique em “Avançar →”.",
          "Na última etapa, clique em “Confirmar e salvar”.",
          "Para mudar algo depois, abra a ficha e clique em “Editar”.",
        ],
      },
      {
        titulo: "Como inativar ou reativar uma pessoa",
        passos: [
          "Na linha da pessoa, clique nos três pontinhos ao lado de “Editar” e escolha “Inativar”.",
          "Para inativar várias de uma vez, marque as caixas à esquerda e clique em “Inativar”.",
          "Para reativar, filtre por “Inativos” e escolha “Reativar” no mesmo menu da linha.",
        ],
      },
    ],
    dicas: [
      "Esta lista é só da equipe do escritório. Os funcionários das empresas clientes ficam em “Colaboradores de clientes”.",
      "O vínculo da pessoa com a conta de acesso ao Connect é feito pelo administrador, nas configurações.",
      "Cadastrar, editar e inativar pessoas é para administradores e gestores de setor.",
    ],
  },

  // ─── Transferências ────────────────────────────────────────────────────────
  {
    chave: "geral:transferencias",
    titulo: "Transferências",
    caminhos: ["/transferencias"],
    resumo:
      "O jeito de passar o assunto de uma empresa ou pessoa de um setor para outro, com prioridade, instrução e responsável por setor, e acompanhar até a finalização.",
    secoes: [
      {
        titulo: "Como abrir uma transferência",
        passos: [
          "Clique em “+ Nova Transferência” na tela de Transferências, ou em “Solicitar Transferência” na ficha da empresa ou da pessoa.",
          "Se quiser, escolha um “Modelo de solicitação”: ele preenche a descrição e, quando indica, os setores de destino.",
          "Escolha o “Tipo” (empresa ou pessoa) e qual é, o “Setor de origem” e a “Prioridade”.",
          "Marque os “Setores de destino” e escreva a “Descrição”. Digite @ para mencionar um colega, que recebe uma notificação.",
          "Em “Instrução por setor”, escreva o que cada setor precisa fazer e, se quiser, clique em “Definir responsáveis”.",
          "Clique em “Solicitar Transferência”.",
        ],
      },
      {
        titulo: "Como acompanhar as transferências",
        passos: [
          "Abra “Transferências” na barra lateral.",
          "Os cartões “Novas”, “Resolvendo” e “Finalizadas” mostram quantas há em cada situação. Clique em um para ver a lista.",
          "Para filtrar por prioridade, clique em “Filtros” e escolha em “Prioridade”.",
          "Clique em uma transferência para ver a descrição, a instrução de cada setor, os responsáveis e quem já visualizou.",
        ],
      },
      {
        titulo: "Como atender uma transferência que chegou ao seu setor",
        passos: [
          "Abra a transferência pela lista ou pelo botão “Revisar”, no Início.",
          "No cartão do seu setor, leia a instrução.",
          "Se você coordena o setor, escolha o “Responsável”.",
          "Mude a situação do setor para “Resolvendo” ao começar e para “Finalizada” ao terminar.",
        ],
      },
    ],
    dicas: [
      "A transferência fica “Nova” enquanto nenhum setor começou, “Finalizada” quando todos terminaram e “Resolvendo” no meio do caminho.",
      "Abrir transferência é para administradores e gestores de setor. A situação de cada setor é mudada pelo gestor daquele setor ou por quem é responsável.",
      "A instrução escrita para um setor só aparece para esse setor, para quem abriu a transferência e para os administradores.",
    ],
  },

  // ─── Agenda ────────────────────────────────────────────────────────────────
  {
    chave: "geral:agenda",
    titulo: "Agenda",
    caminhos: ["/agenda"],
    resumo:
      "O calendário com os prazos dos seus setores (vencimentos, prazos combinados, férias e exames) e as suas reuniões, em visão de dia, semana ou mês.",
    secoes: [
      {
        titulo: "Como navegar pela agenda",
        passos: [
          "Abra “Agenda” na barra lateral.",
          "Escolha a visão em “Dia”, “Semana” ou “Mês”.",
          "Use as setas para ir ao período anterior ou ao próximo, e “Hoje” para voltar à data atual. O ícone de calendário ao lado (“Escolher data”) leva direto a uma data.",
          "As cores dos prazos seguem a legenda dos setores, acima do calendário. Clique em um prazo para abrir o item.",
        ],
      },
      {
        titulo: "Como agendar uma reunião",
        passos: [
          "Clique em “Nova reunião”, ou clique em um horário vazio do calendário.",
          "Preencha “Título”, “Início” e “Fim” e escolha o “Provedor”: Google Meet ou Microsoft Teams.",
          "Se quiser, informe a “Empresa”, os “Cliente(s)” e os “Responsáveis” que participam.",
          "Clique em “Agendar”.",
        ],
      },
      {
        titulo: "Como entrar, editar ou excluir uma reunião",
        passos: [
          "Clique na reunião no calendário.",
          "Clique em “Entrar” para abrir a chamada, ou em “Copiar link” para mandar a alguém.",
          "Se foi você quem criou a reunião, clique em “Editar” para mudar título, horário, empresa ou participantes.",
          "Para cancelar, clique em “Excluir” e confirme.",
        ],
      },
      {
        titulo: "Como mudar o horário da grade",
        passos: [
          "Clique na sua foto, no alto da tela, e em “Configurações do Perfil”.",
          "Em “Agenda”, escolha “Usar o do escritório” ou “Definir o meu”.",
          "Para definir o seu, escolha o “Início” e o “Fim” e clique em “Salvar”. Um fim antes do início termina no dia seguinte — 22:00 às 6:00, por exemplo.",
        ],
      },
    ],
    dicas: [
      "O horário padrão do escritório é definido por um administrador, em Administração → Empresa (Tenant).",
      "Quando o horário passa da meia-noite, a madrugada aparece na coluna do dia anterior: uma reunião à 1:00 de terça fica na coluna de segunda. Os prazos continuam no dia do calendário.",
      "Reunião fora do horário exibido não some: a grade avisa quantas ficaram de fora, e elas aparecem na visão de mês.",
      "Para agendar, conecte antes a sua conta Google ou Microsoft: a janela de nova reunião traz o link “Configurações → Integrações”.",
      "Se aparecer o aviso de conta expirada, clique em “Reconectar agora”. Sem isso, as reuniões novas ficam sem link.",
      "Só gestores de setor e administradores criam reuniões. Cada pessoa vê as reuniões que criou ou para as quais foi chamada.",
    ],
  },

  // ─── Espaços ───────────────────────────────────────────────────────────────
  {
    chave: "geral:espacos",
    titulo: "Espaços",
    caminhos: ["/kanban", "/setor"],
    resumo:
      "As listas e quadros de tarefas de cada setor, organizados em espaços e pastas. Cada tarefa tem situação, responsáveis, prazo e comentários.",
    secoes: [
      {
        titulo: "Como encontrar uma lista de tarefas",
        passos: [
          "Entre no setor e clique em “Espaços”, na barra lateral.",
          "Cada cartão é um espaço, com as listas logo abaixo do nome. Clique em uma lista para abri-la.",
          "Clique no nome do espaço para ver as “Pastas” e as “Listas” que estão nele.",
          "Dentro da lista, troque entre “Lista” e “Quadro” para ver as tarefas em linhas ou em colunas por status.",
          "Use a busca e o botão “Filtros” para filtrar por “Responsável”, “Criador”, “Etiqueta”, “Prioridade” e “Prazo”.",
        ],
      },
      {
        titulo: "Como criar espaços, pastas, listas e tarefas",
        passos: [
          "Na tela de Espaços, clique em “Novo espaço”, dê um “Nome” e clique em “Criar”.",
          "Dentro do espaço, clique em “Nova pasta” ou “Nova lista”, dê um nome e clique em “Criar”.",
          "Na lista, clique em “Editar lista” para ajustar os estágios das colunas.",
          "Para criar uma tarefa, na visão “Lista”, clique em “Adicionar tarefa” no grupo do status, digite o nome e aperte Enter.",
          "Para criar a tarefa de uma empresa ou pessoa, clique em “Nova tarefa”, escolha quem é e clique em “Criar tarefa”.",
        ],
      },
      {
        titulo: "Como trabalhar em uma tarefa",
        passos: [
          "Clique no nome da tarefa para abri-la. No “Quadro”, você também pode arrastar a tarefa para outra coluna.",
          "Em “Situação”, escolha a etapa em que a tarefa está.",
          "Em “Responsáveis”, marque quem faz a tarefa; em “Participantes”, quem acompanha.",
          "Preencha “Datas”, “Prioridade” e “Etiquetas”, e use “Subtarefas”, “Checklist” e “Anexos” quando precisar.",
          "Em “Comentários e atividade”, escreva no campo de comentário, use @ para mencionar alguém e clique em “Comentar”.",
          "Quando terminar, clique em “Concluir tarefa”.",
        ],
      },
    ],
    dicas: [
      "Criar espaços, pastas, listas e tarefas é para o gestor do setor e os administradores. Quem é do setor comenta e atualiza as tarefas.",
      "Excluir um espaço, uma pasta ou uma lista não pode ser desfeito.",
      "A tela “Kanban” reúne num lugar só os quadros de todos os seus setores.",
    ],
  },

  // ─── Solicitações dos clientes ────────────────────────────────────────────
  {
    chave: "portal_solicitacoes",
    titulo: "Solicitações",
    caminhos: ["/solicitacoes"],
    resumo:
      "A fila do que os clientes pedem pelo portal — documento, alteração ou qualquer outro assunto —, com o setor que atende, o responsável e o prazo de resposta prometido ao cliente.",
    secoes: [
      {
        titulo: "Como acompanhar a fila",
        passos: [
          "Abra “Solicitações” na barra lateral. A aba “Solicitações dos clientes” mostra as que estão em aberto.",
          "Use os cartões “Novas”, “Minhas”, “Resposta atrasada” e “Aguardando cliente” para abrir cada recorte.",
          "Clique em “Filtros” para escolher a “Situação”, o “Setor”, a “Empresa” ou só as com resposta atrasada.",
          "Em cada linha, confira a data em “Resposta até” e o selo do prazo: “No prazo”, “Responder hoje” ou “Resposta atrasada”.",
          "Clique no número e no assunto da solicitação para abri-la.",
        ],
      },
      {
        titulo: "Como assumir ou encaminhar uma solicitação",
        passos: [
          "Abra a solicitação e leia o pedido e os anexos do cliente.",
          "Clique em “Assumir” para ficar como responsável.",
          "Se o assunto for de outro setor, clique em “Encaminhar”, escolha o “Setor”, explique o “Motivo” e clique em “Encaminhar”.",
        ],
      },
      {
        titulo: "Como responder ao cliente",
        passos: [
          "No fim da solicitação, escreva a “Mensagem” e, se precisar, inclua “Anexos”.",
          "Em “Depois de enviar”, escolha “Continua com a equipe”, “Aguardando o cliente” ou “Concluída”.",
          "Para falar só com a equipe, marque “Nota interna — o cliente não vê”.",
          "Clique em “Enviar”. O cliente recebe um e-mail avisando que há resposta, e o texto fica no portal.",
        ],
      },
      {
        titulo: "Como concluir, cancelar ou reabrir",
        passos: [
          "Clique em “Concluir” quando o pedido estiver resolvido e confirme. O cliente é avisado por e-mail.",
          "Use “Cancelar” só para pedido repetido ou aberto por engano, e explique o motivo numa resposta antes.",
          "Para retomar uma solicitação encerrada, clique em “Reabrir”: ela volta para a fila, em andamento.",
        ],
      },
    ],
    dicas: [
      "Cada pessoa vê as solicitações dos seus setores e as que estão com ela. Administradores veem todas.",
      "Os assuntos que o cliente escolhe, com o setor que atende e o prazo de resposta em dias úteis, são cadastrados pelo administrador em “Configurações” → “Assuntos das solicitações”.",
      "O motivo do encaminhamento e as notas internas nunca aparecem para o cliente.",
    ],
  },

  // ─── Conversas ─────────────────────────────────────────────────────────────
  {
    chave: "controladoria_conversas",
    titulo: "Conversas",
    caminhos: ["/conversas"],
    resumo:
      "O histórico dos atendimentos do escritório no Chatwoot, ligados às empresas e pessoas do Connect, e a avaliação de cada atendente feita pela IA.",
    secoes: [
      {
        titulo: "Como consultar um atendimento",
        passos: [
          "Entre no setor e abra “Conversas” na barra lateral. A aba “Atendimentos” vem aberta.",
          "Busque pelo contato, pela empresa ou por um trecho da mensagem no campo de busca.",
          "Clique em “Filtros” para escolher “Período”, “Atendente”, “Status” e “Canal”.",
          "Cada cartão é um contato. Clique em um atendimento para ver as mensagens.",
          "Clique no nome do contato para abrir a ficha da pessoa ou da empresa ligada a ele.",
        ],
      },
      {
        titulo: "Como ligar um contato a uma pessoa ou empresa",
        passos: [
          "No cartão do contato sem vínculo, clique em “Vincular”.",
          "Digite pelo menos duas letras do nome e escolha a pessoa ou a empresa.",
          "Para desfazer, clique em “Desvincular”, o ícone ao lado do nome vinculado.",
        ],
      },
      {
        titulo: "Como ver a avaliação dos atendentes",
        passos: [
          "Clique na aba “Avaliação”.",
          "Confira os números de “Tratativa” (o trabalho do setor) e de “Triagem” (o trabalho da recepção): atendimentos avaliados, nota média, escrita média e SLA médio.",
          "Clique no cartão de um atendente e escolha um atendimento da lista para ler a “Justificativa da IA”.",
          "Clique em “Abrir conversa em Conversas” para ler o atendimento inteiro.",
          "Em “Resumo geral”, clique em “Gerar resumo” para juntar os pontos que se repetem nas avaliações daquele atendente.",
        ],
      },
    ],
    dicas: [
      "A tela é só de consulta: as mensagens não são respondidas por aqui.",
      "A nota vai de 0 a 100 (escrita até 50 e SLA até 50) e é dada automaticamente quando o atendimento é resolvido.",
      "Vincular contatos e gerar o resumo do atendente é para quem administra o escritório.",
    ],
  },

  // ─── Certificados digitais ─────────────────────────────────────────────────
  {
    chave: "tech_certificados",
    titulo: "Certificados digitais",
    caminhos: ["/certificados"],
    resumo:
      "Quando vence cada certificado digital A1 dos clientes e em qual entrada do cofre está a senha. O arquivo e a senha não ficam no Connect.",
    secoes: [
      {
        titulo: "Como ver o que precisa ser renovado",
        passos: [
          "Entre no setor e abra “Certificados digitais” na barra lateral.",
          "Confira os cartões “Vencidos”, “Vencem em 30 dias”, “Vencem em 60 dias” e “Sem empresa no Connect”. Clique em um para abrir a lista.",
          "A lista abre em “A renovar”, com os vencidos e os que vencem nos próximos 60 dias.",
          "Para ver os outros, clique em “Filtros” e escolha em “Situação”: “Todos em uso”, “Sem empresa no Connect” ou “Substituídos”.",
          "Use a coluna “Entrada do cofre” para achar a senha do certificado no cofre do escritório.",
        ],
      },
      {
        titulo: "Como buscar um certificado",
        passos: [
          "Digite no campo “Buscar por titular, documento ou entrada do cofre…” e aperte Enter.",
          "Para buscar pelo documento, digite pelo menos três números do CNPJ ou do CPF.",
          "Clique no nome do titular para abrir a ficha da empresa, quando ela estiver cadastrada.",
        ],
      },
      {
        titulo: "Como atualizar a lista",
        passos: [
          "Clique em “Importar relatório”.",
          "Escolha o arquivo .csv da conferência dos certificados.",
          "Confira a mensagem com quantos certificados entraram ou foram atualizados. A data da última importação fica no rodapé da lista.",
        ],
      },
    ],
    dicas: [
      "O vencimento é lido de dentro do certificado. Quando o mesmo CNPJ ou CPF ganha um certificado mais novo, o antigo vira “Substituído” e para de avisar.",
      "O setor recebe avisos 60, 30, 15 e 7 dias antes do vencimento e no próprio dia.",
      "O botão “Importar relatório” aparece para quem é do setor e para os administradores.",
    ],
  },

  // ─── Leads (Comercial, 05/10/2026) ─────────────────────────────────────────
  {
    chave: "comercial_leads",
    titulo: "Leads",
    caminhos: ["/leads"],
    resumo:
      "Quem quer ser cliente do escritório. Hoje os leads chegam pela ficha “Quero ser cliente” do login do portal, e o setor é avisado no sino.",
    secoes: [
      {
        titulo: "Como ver os leads que chegaram",
        passos: [
          "Entre no setor e abra “Leads” na barra lateral — ou clique no aviso “Novo lead” do sino, que abre o lead direto.",
          "A lista abre nos leads em aberto: os novos e os que estão em contato.",
          "Para ver os outros, clique em “Filtros” e escolha em “Situação”: “Viraram cliente”, “Descartados” ou “Todos”. Em “Responsável”, “Comigo” mostra só os seus.",
          "Clique na linha para abrir o lead.",
        ],
      },
      {
        titulo: "Como acompanhar um lead",
        passos: [
          "No lead, confira o contato: o e-mail abre o programa de e-mail, e “abrir no WhatsApp” abre a conversa com o número informado.",
          "Em “Acompanhamento”, escolha o responsável e mude a situação para “Em contato” quando falar com a pessoa.",
          "Escreva em “Observações” o que foi conversado e o que ficou combinado. Só a equipe vê.",
          "Clique em “Salvar”. Quando a pessoa fechar, mude para “Virou cliente”; quando não houver negócio, para “Descartado”.",
        ],
      },
      {
        titulo: "Como apagar os dados de um lead",
        passos: [
          "Use só quando a pessoa pedir para apagar os dados dela. Para tirar da fila, basta mudar a situação para “Descartado”.",
          "No lead, clique em “Excluir” e confirme em “Excluir de vez”. O lead e os avisos do sino sobre ele somem e não voltam.",
        ],
      },
    ],
    dicas: [
      "Quando chega um lead, todo mundo do setor é avisado no sino. Se o setor não tem ninguém, os administradores do escritório é que são avisados.",
      "Mudar a situação, o responsável e as observações fica na auditoria do escritório.",
      "“Excluir” aparece para o coordenador do setor e para os administradores.",
    ],
  },

  // ─── Painel de Gestão ──────────────────────────────────────────────────────
  {
    chave: "gestao_painel",
    titulo: "Painel de Gestão",
    caminhos: ["/gestao"],
    resumo:
      "Todos os setores num lugar: o que começou, o que anda, o que parou e o que terminou, a carga de cada pessoa, os alertas de item parado e de prazo e as horas apontadas.",
    secoes: [
      {
        titulo: "Como ler o painel",
        passos: [
          "Entre no setor e abra “Painel de Gestão” na barra lateral. A aba “Painel” vem aberta.",
          "Para olhar um setor só, clique em “Filtros” e escolha o “Setor”.",
          "Confira os totais: “Iniciados”, “Em andamento”, “Paralisados”, “Concluídos (30 dias)” e “Sem responsável”.",
          "Em “Precisam de atenção”, veja os itens parados ou com prazo vencendo. Clique em “Ver todos” para a lista completa.",
          "Em “O ciclo do trabalho”, clique em qualquer item para abri-lo.",
        ],
      },
      {
        titulo: "Como trocar o responsável de um item",
        passos: [
          "Em “Precisam de atenção” ou na aba “Alertas”, ache o processo ou o card.",
          "No seletor de responsável, à direita do item, escolha a pessoa do setor.",
          "Para achar o que está sem dono, use a lista “Sem responsável” da aba “Coordenadores”.",
        ],
      },
      {
        titulo: "Como ajustar os alertas de cada setor",
        passos: [
          "Clique na aba “Alertas”.",
          "Em “Limites por setor”, preencha “Dias para parado” e “Aviso de prazo (dias)” na linha do setor.",
          "Clique em “Salvar” na mesma linha. Campo vazio usa o padrão.",
        ],
      },
      {
        titulo: "Como ver a carga das pessoas e as horas",
        passos: [
          "Na aba “Coordenadores”, veja quantos itens cada pessoa tem em aberto, por tipo, parados e com prazo vencido.",
          "Clique no nome da pessoa para ver os itens dela.",
          "Na aba “Horas de operação”, clique em “Filtros” para escolher “Setor”, “Período” e “Pessoa”.",
          "Veja as horas “Por setor” e “Por pessoa”, e clique em “Exportar CSV” para baixar os apontamentos.",
        ],
      },
    ],
    dicas: [
      "Administradores e quem é do setor Gestão veem todos os setores. O gestor de um setor vê só os setores que coordena.",
      "Só o gestor do setor ou o administrador muda os limites de alerta daquele setor.",
      "As horas entram pelo cronômetro ou pelo lançamento manual, no card e no processo.",
    ],
  },

  // ─── Cargos e Salários ─────────────────────────────────────────────────────
  {
    chave: "gestao_cargos_salarios",
    titulo: "Cargos e Salários",
    caminhos: ["/cargos-salarios"],
    resumo:
      "A matriz de cargos de todas as empresas, agrupada por família e nível de senioridade, com as faixas salariais e os pontos da estrutura que precisam de correção.",
    secoes: [
      {
        titulo: "Como ler a matriz",
        passos: [
          "Entre no setor e abra “Cargos e Salários” na barra lateral.",
          "Cada bloco é uma família de cargos, com a quantidade de cargos e de colaboradores.",
          "Em cada linha, veja o “Nível”, o “Cargo”, a “Empresa”, a “Área”, as “Pessoas” no cargo e a “Faixa salarial”.",
          "Use o funil das colunas “Nível”, “Empresa” e “Área” para filtrar a família.",
        ],
      },
      {
        titulo: "Como corrigir os pontos de atenção",
        passos: [
          "Leia o cartão “Pontos de atenção da estrutura”, no topo: degraus invertidos, nomes escritos de formas diferentes e cargos sem família ou nível.",
          "Clique no nome do cargo para abrir a ficha dele.",
          "Preencha “Família de cargos” e “Nível de senioridade” e ajuste a “Faixa salarial”: “Inicial”, “Intermediária” e “Final”.",
          "Clique em “Salvar”.",
        ],
      },
      {
        titulo: "Como cadastrar um cargo novo",
        passos: [
          "Abra a ficha da empresa em “Cadastros” → “Empresas”.",
          "Na aba “RH & operação”, clique em “Cargos”.",
          "Clique em “Novo cargo”, preencha os campos e clique em “Salvar”.",
        ],
      },
    ],
    dicas: [
      "A faixa salarial e o aviso de degrau invertido só aparecem para quem tem permissão de ver salários.",
      "Degrau invertido é quando um nível mais alto começa com uma faixa menor que a do nível anterior, na mesma família.",
      "A matriz mostra só os cargos ativos.",
    ],
  },

  // ─── Indicadores de RH ─────────────────────────────────────────────────────
  {
    chave: "gestao_indicadores_rh",
    titulo: "Indicadores de RH",
    caminhos: ["/indicadores-rh"],
    resumo:
      "O painel consolidado de RH — headcount, turnover, absenteísmo, férias, vagas, treinamentos, custo de folha e mais —, calculado a partir do que é lançado no DP e no Recrutamento.",
    secoes: [
      {
        titulo: "Como ler os indicadores",
        passos: [
          "Entre no setor e abra “Indicadores de RH” na barra lateral.",
          "Cada cartão é um número, como “Headcount”, “Turnover (30 dias)”, “Absenteísmo (30 dias)”, “Férias Vencidas”, “Vagas Abertas” e “Custo de Folha (mês atual)”.",
          "Leia a linha abaixo do número: ela diz o que ele conta.",
        ],
      },
      {
        titulo: "Como abrir os relatórios",
        passos: [
          "Role a tela até “Relatórios”.",
          "Clique em “Férias”, “Treinamentos”, “Pendências” ou “Distorções salariais”.",
          "Cada relatório traz a lista de quem precisa de ação: férias vencidas e a vencer, treinamentos vencidos, pendências em aberto ou salários fora da faixa do cargo.",
        ],
      },
      {
        titulo: "Como exportar os indicadores",
        passos: [
          "Clique em “Exportar PDF” para um arquivo de leitura ou impressão.",
          "Clique em “Exportar Excel” para trabalhar os números numa planilha.",
          "Abra o arquivo baixado no seu computador.",
        ],
      },
    ],
    dicas: [
      "Os números vêm do que é lançado no DP e no Recrutamento: se um dado parece errado, corrija na origem.",
      "O relatório “Distorções salariais” só aparece para quem tem permissão de ver salários.",
      "O cartão “Férias Vencidas” fica destacado quando há alguma, porque é o número que pede ação.",
    ],
  },

  // ─── Valora ────────────────────────────────────────────────────────────────
  {
    chave: "gestao_valora",
    titulo: "Valora",
    caminhos: ["/valora"],
    resumo:
      "A precificação de honorários pelo custo real de atender: você simula com o cliente, vê o piso, o alvo e a tabela, salva a proposta e registra se ela foi ganha ou perdida.",
    secoes: [
      {
        titulo: "Como fazer uma simulação",
        passos: [
          "Entre no setor, abra “Valora” na barra lateral e clique em “Nova simulação”.",
          "Em “Cliente”, preencha o “Nome” e o “Regime”, marque os “Setores” que vão atender e, se for o caso, “Empresa sem movimento”.",
          "Preencha “Volumes”, “Operação” e “Situações que dão mais trabalho” com as respostas do cliente.",
          "Acompanhe o “Honorário mensal” ao lado: o alvo, o “Piso”, a “Tabela”, o “Custo”, as “Horas/mês” e a “Implantação (uma vez)”.",
          "Se já tiver um valor combinado, informe o “Preço oferecido (opcional)” e clique em “Salvar proposta”.",
        ],
      },
      {
        titulo: "Como registrar o retorno de uma proposta",
        passos: [
          "Na lista de propostas, clique em “Registrar retorno” na linha do cliente.",
          "Escolha a “Situação”: “Em aberto”, “Ganha” ou “Perdida”.",
          "Informe o “Preço oferecido”, o “Preço do concorrente” e o “Motivo”.",
          "Clique em “Salvar”. Os cartões “Ganhas”, “Taxa de fechamento” e “Oferecido ÷ alvo” se atualizam.",
        ],
      },
      {
        titulo: "Como ajustar os parâmetros",
        passos: [
          "Clique em “Parâmetros”, no topo da tela.",
          "Em “Custo de cada setor”, informe o “Custo mensal da equipe”, a “Capacidade (h/mês)” e o “Fator” de cada setor.",
          "Em “Preço”, ajuste “Despesas fixas do escritório”, “Custos variáveis”, “Margem alvo”, “Margem mínima” e “Desconto máximo”.",
          "Clique em “Salvar parâmetros”.",
        ],
      },
    ],
    dicas: [
      "“Parâmetros” e “Diagnóstico da carteira” são só para o gestor do setor e os administradores, porque mostram custo de equipe e margem.",
      "O alvo de cada proposta é a foto do dia em que ela foi salva: mudar os parâmetros não reescreve propostas antigas.",
      "Enquanto os custos dos setores não forem informados em “Parâmetros”, o preço da simulação não serve para proposta.",
    ],
  },
];

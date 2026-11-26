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
      "O resumo do seu trabalho e do escritório: quatro números do seu setor no topo, painéis dos setores, o seu dia, as transferências que esperam o seu setor e as próximas reuniões.",
    secoes: [
      {
        titulo: "Como ler o Início",
        passos: [
          "Clique em “Início”, no topo da barra lateral. O logo do Connect, acima do menu, também leva ao Início.",
          "No alto ficam quatro cartões com os números do seu setor — no BPO, por exemplo, contas vencidas e aprovações; em “Todos os setores”, tarefas atrasadas, transferências, solicitações atrasadas e empresas ativas.",
          "Cada cartão mostra o número de agora, quanto ele mudou desde ontem (a seta para cima ou para baixo, em verde quando melhorou e em vermelho quando piorou) e uma linha com os últimos dias. Cartão novo mostra “sem histórico ainda” até juntar alguns dias.",
          "O cartão fica vermelho quando há algo atrasado ou vencido e âmbar quando há algo esperando você. Clique no cartão para abrir a tela de onde o número vem.",
          "Depois vêm os painéis com gráficos, como “Atividades por prazo”, e os painéis dos setores que você enxerga.",
          "No bloco “Meu dia”, clique em um item para abri-lo.",
          "Em “Transferências para o seu setor”, clique em “Abrir” para ver a transferência que espera o seu setor.",
        ],
      },
      {
        titulo: "Como trocar um cartão do topo",
        passos: [
          "Passe o mouse sobre o cartão e clique no lápis, no canto de cima. No celular e no modo “Personalizar”, o lápis já aparece.",
          "Em “Trocar este cartão”, busque pelo nome ou escolha na lista. Os números estão agrupados por setor, com o valor de agora ao lado; o atual tem um visto.",
          "Clique no número que você quer ver no lugar. Se ele já estava em outro cartão, os dois trocam de lugar.",
          "Para desfazer, abra o lápis do cartão e clique em “Voltar ao do setor”.",
        ],
      },
      {
        titulo: "Como definir os cartões do seu setor (coordenação)",
        passos: [
          "Entre no setor pelo seletor do topo.",
          "Clique no lápis do cartão e, em “Para quem”, escolha o padrão do setor (por exemplo, “Padrão do BPO”).",
          "Escolha o número. Todo mundo do setor passa a ver esse cartão, menos quem já trocou aquele cartão só para si.",
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
          "Clique em “Personalizar”, ao lado da data. O Início entra em edição, com uma faixa no topo.",
          "Arraste cada bloco pela alça para mudar a ordem dentro da faixa dele (ou selecione a alça e use as setas do teclado).",
          "Clique no olho de um bloco para escondê-lo. Os escondidos ficam listados embaixo: clique no nome para trazer de volta.",
          "Clique em “Concluir”. Para voltar ao modelo original, clique em “Restaurar padrão”; para desistir, em “Cancelar”.",
        ],
      },
    ],
    dicas: [
      "A personalização vale só para você: os colegas continuam vendo o Início do jeito deles.",
      "Os cartões do topo valem por setor: quem trabalha em dois setores tem quatro cartões em cada um.",
      "A lista do lápis só mostra os números das telas que você pode abrir.",
      "Só quem coordena o setor, o administrador e o Super Admin mudam o padrão do setor. A troca fica registrada na Auditoria.",
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
      "Tudo o que é seu, de todos os setores, numa tela só: processos, atividades do Quadro de tarefas, pendências, transferências e solicitações, na ordem do que é mais urgente.",
    secoes: [
      {
        titulo: "Como começar o dia pelo Meu dia",
        passos: [
          "Clique em “Meu dia”, logo abaixo de “Início” na barra lateral.",
          "Confira os números do topo: “Atrasados”, “Vencem em breve”, “Parados”, “Em andamento” e “Feitos na semana”.",
          "Comece pela lista “Pede você agora”: ela traz o que está atrasado, vencendo ou parado, do mais urgente para o menos urgente.",
          "Clique no título de um item para abri-lo. O ícone e o rótulo dizem de onde ele vem (processo, atividade, pendência, transferência ou solicitação) e a bolinha colorida mostra o setor.",
          "Depois, siga pelas listas “Em andamento” e “Para começar”.",
        ],
      },
      {
        titulo: "Como ver as reuniões e os prazos da semana",
        passos: [
          "Na coluna da direita, veja “Próximas reuniões” e clique em “Entrar” para abrir a chamada.",
          "Em “Prazos da semana”, confira os vencimentos dos seus setores nos próximos 7 dias, dia a dia. Entram só as fontes que estão ligadas na sua Agenda.",
          "Clique em “Abrir agenda” para ver tudo na Agenda.",
          "Para ver as tarefas de todos os seus setores, clique em “Todas as tarefas”, no topo da tela.",
        ],
      },
      {
        titulo: "Como escolher o que o Meu dia mostra",
        passos: [
          "Clique em “Configurar”, no topo da tela. Um painel abre no próprio botão.",
          "Em “Nas listas”, ligue ou desligue o que entra nas listas: atividades do Quadro de tarefas, processos, pendências com o cliente, solicitações e transferências.",
          "Em “Ao lado”, ligue ou desligue os blocos da direita: “Próximas reuniões”, “No Societário, com você” e “Prazos da semana”.",
          "Cada troca vale na hora, e a tela atrás do painel já mostra o resultado. Para fechar, clique fora do painel.",
          "Para voltar ao que o seu setor usa, clique em “Voltar ao padrão do setor”.",
          "Quem coordena um setor escolhe também, em “Para quem”, o padrão do setor ou o de alguém da equipe.",
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
      "O que você escolhe vale mais que o padrão do setor. Quem está em mais de um setor vê a soma do que os setores mostram.",
      "No setor que não faz reuniões, “Próximas reuniões” começa desligado. Se você tem reuniões mesmo assim, ligue o bloco em “Configurar”.",
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
          "Na barra lateral, clique em “Cadastros” e escolha “Empresas”.",
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
          "Em “Visão geral”, veja os dados cadastrais e os “Serviços contratados”. Clique em “Gerar resumo” para ver, dos últimos 90 dias, “O que aconteceu” e o que pede “Atenção”; “Abrir” leva ao registro.",
          "Use as abas “Filiais”, “Pessoas”, “Documentos”, “Conversas” e “Histórico” para o restante das informações.",
          "Administradores veem também a aba “Acesso ao portal”: quem entra no portal do cliente e vê esta empresa.",
          "Na aba “RH & operação”, entre em “Sócios”, “Cargos”, “Departamentos”, “Benefícios”, “Turnos” e “Folha de pagamento”. “Envios ao cliente” abre a aba “Envios” de Solicitações, já filtrada nesta empresa.",
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
        titulo: "Como dar acesso ao portal a uma empresa",
        passos: [
          "Na ficha da empresa, abra a aba “Acesso ao portal”.",
          "Para uma pessoa nova, clique em “Novo acesso”, preencha nome e e-mail e clique em “Criar acesso”. Ela recebe por e-mail o link para definir a senha.",
          "Se a pessoa já entra no portal por outra empresa, clique em “Ligar acesso existente”, busque pelo nome ou e-mail e clique em “Ligar”.",
          "Quando a empresa tem filiais, “Incluir as filiais” vem marcado: a pessoa vê também as filiais, inclusive as cadastradas depois.",
          "No “⋯” de cada linha: incluir ou tirar as filiais, desligar o acesso desta empresa (a conta continua), desativar ou excluir.",
        ],
      },
      {
        titulo: "Como inativar ou reativar uma empresa",
        passos: [
          "Na linha da empresa, clique em “Inativar” ao lado de “Editar”.",
          "Confirme na janela que abrir.",
          "Para trazer de volta, clique em “Filtros”, escolha “Inativo” e, no mesmo menu da linha, clique em “Reativar”.",
          "Para mudar várias de uma vez, marque as caixas à esquerda e use “Inativar”, ou escolha o novo status e clique em “Alterar status”.",
        ],
      },
      {
        titulo: "Como excluir uma empresa de vez",
        passos: [
          "Use para cadastro de teste ou feito por engano. Para tirar uma empresa de verdade da lista, inative.",
          "Na ficha da empresa, clique em “Excluir”. A janela mostra o que está ligado a ela: o que sai junto, o que fica sem o vínculo.",
          "Sem nada ligado, clique em “Excluir”. Com histórico (notas, lançamentos, vagas, documentos…), digite o nome da empresa e clique em “Excluir com tudo o que está ligado”.",
          "Para levar os funcionários junto, marque “Excluir também os funcionários desta empresa” antes de confirmar.",
          "Na lista, marque várias e clique em “Excluir”: saem só as sem histórico, e no fim aparece qual ficou e por quê.",
        ],
      },
    ],
    dicas: [
      "Por padrão a lista mostra só as empresas em operação. Inativas e canceladas ficam de fora, e um aviso com “Mostrar todas” diz quantas são.",
      "Inativar não apaga nada: a empresa só sai da lista padrão e pode ser reativada depois.",
      "Cadastrar, editar e inativar empresas é para administradores e gestores de setor. Excluir de vez é só para administradores.",
      "Empresa com mais de 2.000 notas fiscais não pode ser excluída por aqui: é histórico de verdade. Inative.",
      "Quem vê cada empresa no portal se define em “Acesso ao portal”, na ficha dela, ou em Configurações › Portal do cliente.",
      "No cadastro, a etapa “SPED fiscal” é opcional: são os dados que vão no SPED da empresa, e o “?” de cada campo diz onde achar a informação.",
      "Os responsáveis de cada setor ficam no cartão “Serviços contratados” da ficha, e não no formulário: numa empresa nova, salve e adicione ali os setores contratados.",
      "Cada empresa tem um código curto, EMP e o número (EMP-301), ao lado do nome na ficha. Digite o código na busca (Ctrl+K) para abrir a empresa; um link antigo, como o de “empresa-301”, continua abrindo.",
      "O endereço do sócio é o que responde “Reside no local?” na viabilidade do Empresa Fácil. Sem CEP e número, a pergunta volta a ser respondida à mão.",
      "A “Folha de pagamento” da ficha é controle e conferência dos lançamentos, não motor de cálculo. A “Conferência assistida” aponta o que foge do histórico da empresa para revisão — não é cálculo trabalhista.",
      "Em “Cálculo de rescisão”, na ficha, cada campo mostra de onde vem o valor atual. O que você muda ali vale só para esta empresa e só nos campos alterados; o resto segue o padrão do escritório.",
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
          "Na barra lateral, clique em “Cadastros” e escolha “Pessoas”.",
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
          "Use “Documentos”, “Conversas” e “Histórico” para os arquivos, os atendimentos e as movimentações no Quadro de tarefas.",
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
          "Na linha da pessoa, clique em “Inativar” ao lado de “Editar”.",
          "Para inativar várias de uma vez, marque as caixas à esquerda e clique em “Inativar”.",
          "Para reativar, filtre por “Inativos” e escolha “Reativar” no mesmo menu da linha.",
        ],
      },
      {
        titulo: "Como excluir uma pessoa de vez",
        passos: [
          "Use para cadastro de teste, feito por engano, ou quando a pessoa pede a exclusão dos dados. Para afastar alguém de verdade, inative.",
          "Na ficha da pessoa, clique em “Excluir”. A janela mostra o que está ligado a ela: férias, folha, exames, documentos, candidaturas.",
          "Sem nada ligado, clique em “Excluir”. Com histórico, digite o nome da pessoa e clique em “Excluir com tudo o que está ligado”.",
          "A conta de acesso ao Connect, se houver, continua: para tirar o acesso, exclua ou inative o usuário em Configurações › Usuários.",
        ],
      },
    ],
    dicas: [
      "Esta lista é só da equipe do escritório. Os funcionários das empresas clientes ficam em “Colaboradores de clientes”.",
      "Cada pessoa tem um código curto, PES e o número (PES-12), ao lado do nome na ficha. Digite o código na busca (Ctrl+K) para abrir a ficha.",
      "O vínculo da pessoa com a conta de acesso ao Connect é feito pelo administrador, nas configurações.",
      "Cadastrar, editar e inativar pessoas é para administradores e gestores de setor. Excluir de vez é só para administradores.",
      "O contato de empresa cliente guarda só a empresa, o cargo e o departamento: jornada, admissão e folha existem só para o colaborador interno, que é da equipe do escritório e não pede empresa, cargo nem departamento.",
      "Os benefícios entram na ficha depois que a pessoa é criada. Os documentos escolhidos no cadastro esperam e sobem quando você clica em “Confirmar e salvar”.",
      "A conta de acesso criada pela ficha nasce ligada a ela e aparece também em Configurações › Usuários. “Ou ligar a uma conta que já existe” é para quem já entrava no Connect antes de ganhar a ficha: a lista traz só as contas sem pessoa.",
      "Na conferência da rescisão, o Connect não calcula verbas: registre o que a contabilidade informou e o resultado da sua conferência. O prazo de pagamento é o do art. 477, § 6º, da CLT — 10 dias corridos do término do contrato. O “Cálculo de referência” é para comparar com o que a contabilidade enviou; registre a divergência quando houver.",
      "O eSocial S-2200 (cadastramento inicial do vínculo e admissão) da ficha é um rascunho para conferência: mostra o que já está preenchido e o que falta. Os campos pendentes se preenchem na ficha antes da geração oficial do evento.",
    ],
  },

  // ─── Transferências ────────────────────────────────────────────────────────
  {
    chave: "geral:transferencias",
    titulo: "Transferências",
    caminhos: ["/transferencias"],
    resumo:
      "O jeito de passar o assunto de uma empresa ou pessoa de um setor para outro, com assunto, prioridade, tarefas e responsável por setor, e acompanhar até a finalização.",
    secoes: [
      {
        titulo: "Como abrir uma transferência",
        passos: [
          "Clique em “+ Nova transferência” na tela de Transferências, ou em “Solicitar transferência” na ficha da empresa ou da pessoa.",
          "No passo 1, escolha a empresa ou a pessoa (vindo da ficha, ela já vem escolhida), o assunto e a prioridade. Cada bloco de assunto é um modelo e mostra os setores que ele envolve. Use a busca para achar entre os 16, “Ver os outros” para ver todos, ou “Outro assunto” para escrever o seu.",
          "Clique em “Continuar”. No passo 2, confira os setores que recebem e responda o que o modelo pergunta (a situação da empresa, o valor, as datas). Deixando o regime ou o contato em branco, vai o do cadastro da empresa.",
          "Abra cada setor para conferir as tarefas que o modelo trouxe: tire o que não vale e acrescente o que faltar. Em “Responsável”, escolha quem cuida ou deixe “A coordenação do setor decide”, para a coordenação escolher.",
          "Escreva a “Descrição”, se quiser. Digite @ para mencionar um colega, que recebe uma notificação.",
          "Clique em “Continuar”. No passo 3, confira o que cada setor vai receber: o aviso âmbar marca o setor sem tarefas.",
          "Clique em “Enviar transferência”. A transferência criada abre em seguida.",
        ],
      },
      {
        titulo: "Como acompanhar as transferências",
        passos: [
          "Abra “Transferências” na barra lateral.",
          "As abas separam o que chegou para o seu setor (“Para o meu setor”), o que está com você (“Comigo”), o que você ou o seu setor pediu (“Enviadas”) e as finalizadas. Quem coordena um setor vê também “A distribuir”: as partes do setor que ainda estão sem responsável. O número na aba é quantas há em cada uma.",
          "Use a busca para achar pelo assunto, pela empresa ou pelo CNPJ, e o “Filtros” para escolher a prioridade, o setor que recebe ou o responsável.",
          "Na coluna “Setores”, cada setor tem o seu sinal: nova, resolvendo, finalizada ou devolvida. O ponto azul antes do assunto marca a transferência que você ainda não abriu, e o relógio âmbar, a que tem setor sem finalizar há 3 dias ou mais. O selo vermelho “Devolvida” marca a que um setor devolveu para quem pediu responder.",
          "Clique em uma transferência para abri-la. No alto, a faixa mostra cada setor: com quem está e desde quando, quem finalizou, ou o motivo da devolução. O seu setor aparece destacado.",
        ],
      },
      {
        titulo: "Como atender uma transferência que chegou ao seu setor",
        passos: [
          "Abra a transferência pela aba “Para o meu setor”, pelo aviso no sino ou pelo botão “Abrir”, no Início.",
          "No cartão “Parte do” seu setor, à direita (no celular, logo abaixo da faixa), veja as tarefas do setor. Marque cada uma quando estiver feita: a faixa do alto mostra quantas já foram (“2 de 3 tarefas”).",
          "Se você coordena o setor, use “Responsáveis” para pôr ou tirar pessoas. Quem entra recebe um aviso; quem já estava não é avisado de novo. A transferência que chega sem responsável avisa só a coordenação, e fica na aba “A distribuir” até alguém ser escolhido.",
          "Clique em “Começar” quando o setor começar a trabalhar e em “Finalizar a parte” quando terminar.",
          "Se falta algo de quem pediu (um documento, uma informação), clique em “Devolver”, escreva o motivo e confirme. A parte volta para quem pediu, que é avisado, e sai da sua caixa até ser reenviada.",
          "Se a parte foi finalizada por engano, clique em “Reabrir a parte”.",
        ],
      },
      {
        titulo: "Como responder uma transferência devolvida",
        passos: [
          "Abra a transferência pelo aviso no sino ou pela aba “Enviadas”, onde ela aparece com o selo “Devolvida”.",
          "No cartão “Devolvida pelo” setor, leia o motivo.",
          "Escreva a sua resposta e clique em “Responder e reenviar”. A parte volta a ser nova para o setor, e quem responde por ela é avisado.",
        ],
      },
      {
        titulo: "Como comentar numa transferência",
        passos: [
          "Abra a transferência e vá até “Atividade”.",
          "Escreva o comentário. Digite @ e escolha o nome para chamar um colega, que recebe um aviso.",
          "Clique em “Comentar” ou aperte Ctrl+Enter. Quem pediu e os responsáveis dos setores recebem um aviso.",
          "Abaixo da caixa fica o histórico, do mais novo para o mais antigo: quem pediu, começou, finalizou, devolveu, reenviou e comentou. Passe o mouse na hora para ver a data exata.",
        ],
      },
    ],
    dicas: [
      "A transferência fica “Nova” enquanto nenhum setor começou, “Finalizada” quando todos terminaram e “Resolvendo” no meio do caminho. Se algum setor devolveu a parte dele, ela fica “Devolvida” até quem pediu responder.",
      "Abrir transferência é para administradores e gestores de setor. Os botões de cada setor são do gestor daquele setor ou de quem é responsável. Responder uma devolução e editar o assunto, a descrição e a prioridade é de quem pediu, do gestor do setor que pediu e dos administradores.",
      "As tarefas e a instrução de um setor só aparecem para esse setor, para quem abriu a transferência e para os administradores. Marca as tarefas quem cuida da parte: a coordenação do setor e os responsáveis.",
      "Os setores e as tarefas de cada modelo são uma proposta de 17/11/2026, a validar com as coordenações. As transferências abertas antes disso não têm tarefas: mostram a instrução escrita.",
      "As transferências abertas antes de 10/11/2026 não têm histórico completo: a Atividade mostra o pedido e as finalizações pelas datas guardadas, com a marca “antes do histórico”.",
    ],
  },

  // ─── Agenda ────────────────────────────────────────────────────────────────
  {
    chave: "geral:agenda",
    titulo: "Agenda",
    caminhos: ["/agenda"],
    resumo:
      "Os prazos dos seus setores (obrigações, guias, atividades, contas, processos, férias e outros) e as suas reuniões: a lista do que vence, o mês inteiro e as grades de dia e de semana.",
    secoes: [
      {
        titulo: "Como navegar pela agenda",
        passos: [
          "Abra o Meu dia e clique em “Agenda”, no alto da tela. (Se o seu setor trouxe a Agenda de volta ao menu, ela também fica na barra lateral.)",
          "Escolha a visão em “Prazos”, “Dia”, “Semana” ou “Mês”. Da próxima vez, a Agenda abre na última visão que você escolheu.",
          "Use as setas para ir ao período anterior ou ao próximo, e “Hoje” para voltar à data atual. O ícone de calendário ao lado (“Escolher data”) leva direto a uma data.",
          "Clique em um prazo para abrir o item na tela de onde ele vem.",
        ],
      },
      {
        titulo: "Como ver o que vence",
        passos: [
          "Clique em “Prazos”. A lista mostra o que vence de hoje a 30 dias, separado por dia.",
          "No alto aparecem os “Atrasados”: o que venceu nos últimos 30 dias e continua em aberto.",
          "Cada linha mostra de onde o prazo vem (a etiqueta colorida), o que é, a empresa e quem cuida. O selo “atrasada” avisa o que já passou do prazo, e “risco de multa”, a obrigação perto da data legal.",
          "Quando várias iguais vencem no mesmo dia, elas aparecem juntas, como “DCTFWeb · 6 empresas”. Clique em “Ver as 6” para abrir a lista.",
        ],
      },
      {
        titulo: "Como ver o mês",
        passos: [
          "Clique em “Mês”. Cada dia mostra até dois prazos ou reuniões; o “+” diz quantos ainda há.",          "Clique em um dia para ver tudo dele ao lado do calendário. O dia de hoje tem um contorno.",
          "Pelo teclado, as setas andam pelos dias e o dia escolhido abre ao lado.",
        ],
      },
      {
        titulo: "Como escolher de onde vêm os prazos",
        passos: [
          "Acima da agenda ficam os botões das fontes: “Obrigações”, “Guias”, “Tarefas” e as outras que você pode ver.",
          "Clique em um botão para tirar ou trazer de volta os prazos daquela fonte. A escolha fica salva para você.",
          "Para voltar ao padrão do seu setor, clique em “Restaurar padrão”, ao lado dos botões.",
        ],
      },
      {
        titulo: "Como dizer se o setor faz reuniões (coordenador)",
        passos: [
          "Clique na sua foto, no alto da tela, e em “Sua conta”.",
          "Em “Agenda do setor”, escolha o setor, se ele usa reuniões e quais fontes a Agenda mostra para quem é dele.",
          "Clique em “Salvar”. Para voltar ao padrão (usa reuniões e mostra todas as fontes), clique em “Restaurar padrão”.",
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
          "Para cancelar uma reunião criada na Agenda, clique em “Excluir” e confirme. Excluir é só do Administrador ou do Super Admin.",
        ],
      },
      {
        titulo: "Como mudar o horário da grade",
        passos: [
          "Nas visões “Dia” e “Semana”, o horário da grade aparece num chip com relógio, ao lado das visões — “7h às 22h”, por exemplo. Clique nele para ir direto à configuração.",
          "Ou clique na sua foto, no alto da tela, e em “Sua conta”.",
          "Em “Agenda”, escolha “Usar o do escritório” ou “Definir o meu”.",
          "Para definir o seu, escolha o “Início” e o “Fim” e clique em “Salvar”. Um fim antes do início termina no dia seguinte — 22:00 às 6:00, por exemplo.",
        ],
      },
    ],
    dicas: [
      "No setor que não faz reuniões, a Agenda abre em “Prazos” e o Meu dia começa sem “Próximas reuniões”. As visões de dia e de semana continuam a um clique.",
      "Cada fonte só aparece para quem abre a tela de onde ela vem: as guias, para quem vê Guias do mês; as obrigações, para quem vê o quadro da atividade.",
      "Os botões que você liga e desliga valem também para “Prazos da semana”, no Meu dia.",
      "O horário padrão do escritório é definido por um administrador, em Configurações › Horário da Agenda.",
      "Quando o horário passa da meia-noite, a madrugada aparece na coluna do dia anterior: uma reunião à 1:00 de terça fica na coluna de segunda. Os prazos continuam no dia do calendário.",
      "Reunião fora do horário exibido não some: a grade avisa quantas ficaram de fora, e elas aparecem na visão de mês.",
      "O administrador também muda a Agenda de cada setor em Configurações › Setores e módulos.",
      "Para agendar, conecte antes a sua conta Google ou Microsoft: a janela de nova reunião traz o link “Configurações → Integrações”.",
      "Se aparecer o aviso de conta expirada, clique em “Reconectar agora”. Sem isso, as reuniões novas ficam sem link.",
      "Só gestores de setor e administradores criam reuniões. Cada pessoa vê as reuniões que criou ou para as quais foi chamada.",
    ],
  },

  // ─── Quadro de tarefas ─────────────────────────────────────────────────────
  // Chamava-se "Espaços" até 14/10/2026 e "Quadros" até 25/11/2026
  // (melhoria-842). A chave fica `geral:espacos`: é o endereço do artigo
  // (`/ajuda/geral:espacos`) e a chave do vídeo 27.
  {
    chave: "geral:espacos",
    titulo: "Quadro de tarefas",
    caminhos: ["/kanban", "/setor"],
    resumo:
      "As tarefas de cada setor, organizadas em espaços e pastas. Dentro de cada tarefa ficam as atividades, para ver em lista ou em kanban, cada uma com situação, responsáveis, prazo e comentários.",
    secoes: [
      {
        titulo: "Como encontrar uma tarefa",
        passos: [
          "Entre no setor e clique em “Quadro de tarefas”, no Geral da barra lateral, logo abaixo de “Cadastros”.",
          "Cada cartão é um espaço, com as tarefas logo abaixo do nome. Clique em uma tarefa para abri-la.",
          "Clique no nome do espaço para ver as “Pastas” e as “Tarefas” que estão nele — as das pastas também, com a pasta de cada uma.",
          "Dentro da tarefa, troque entre “Lista” e “Kanban” para ver as atividades em linhas ou em colunas por status.",
          "Use a busca e o botão “Filtros” para filtrar por “Responsável”, “Criador”, “Etiqueta”, “Prioridade” e “Prazo”.",
        ],
      },
      {
        titulo: "Como criar espaços, pastas, tarefas e atividades",
        passos: [
          "No Quadro de tarefas, clique em “Novo espaço”. Clique no quadrado com a inicial para escolher a cor e o ícone, dê um “Nome”, escolha a “Permissão padrão” e, se quiser, um modelo em “Usar modelo”. Clique em “Criar espaço”.",
          "Para criar uma lista ou uma pasta sem entrar no espaço, clique em “Criar”, ao lado de “Novo espaço”, escolha “Lista” ou “Pasta”, dê o nome, escolha onde fica e clique em “Criar lista” ou “Criar pasta”.",
          "Dentro do espaço, clique em “Nova pasta” ou “Nova lista”, dê um nome e clique em “Criar”.",
          "Para mudar o nome, a cor, o ícone ou a permissão do espaço, abra o espaço e clique em “Editar espaço”.",
          "Na tarefa, clique em “Editar estágios” para ajustar os estágios das colunas.",
          "Para criar uma atividade, na visão “Lista”, clique em “Adicionar atividade” no grupo do status, digite o nome e aperte Enter.",
          "Para criar a atividade de uma empresa ou pessoa, abra o campo de “Adicionar atividade” e clique em “criar para uma empresa ou pessoa”, embaixo dele; escolha quem é e clique em “Criar atividade”.",
          "Para criar uma subatividade, na visão “Lista”, passe o mouse na atividade e clique no “+” ao lado do nome; digite o nome e aperte Enter. A subatividade também pode ter subatividades, até 5 níveis abaixo da atividade.",
          "A seta à esquerda abre e fecha as subatividades de cada nível, e o número ao lado do nome (como “0/1”) mostra quantas das de baixo já estão concluídas. Com o nível aberto, “Adicionar subatividade” cria mais uma ali.",
        ],
      },
      {
        titulo: "Como trabalhar em uma atividade",
        passos: [
          "Clique no nome da atividade para abri-la. No “Kanban”, você também pode arrastar a atividade para outra coluna.",
          "Em “Situação”, escolha a etapa em que a atividade está.",
          "Em “Responsáveis”, marque quem faz a atividade; em “Participantes”, quem acompanha.",
          "A atividade nova começa com os campos “Vazio”. Preencha “Datas”, “Prioridade” e “Etiquetas”; os outros campos entram por “Adicionar campo”. Embaixo da descrição, “Subatividade”, “Vínculo”, “Checklist” e “Anexo” abrem a seção de cada um.",
          "Para pôr uma capa colorida no cartão do “Kanban”, como no Trello, clique em “Capa”, ao lado do código da atividade, e escolha a cor. “Sem capa” tira a cor. A troca fica no histórico da atividade.",
          "Em “Comentários e atividade”, escreva no campo de comentário, use @ para mencionar alguém e clique em “Comentar”.",
          "Quando terminar, clique em “Marcar como concluída”, ao lado da “Situação”. Se ainda houver subatividades abertas, marque “Concluir também as subatividades abertas” para fechar todas juntas, ou desmarque para concluir só esta.",
        ],
      },
      {
        titulo: "Espaços automáticos e criados pela equipe",
        passos: [
          "No Quadro de tarefas, o que o sistema criou sozinho fica em “Automáticos”, no topo, com o selo “Automático”. Embaixo, em “Criados pela equipe”, ficam os espaços que vocês criaram.",
          "O espaço automático pode ser renomeado e mexido à mão, como qualquer outro: colunas, etiquetas, cartões. Ele não se exclui; para parar de receber cartões, desligue a abertura automática.",
          "Os processos societários são o primeiro automático: o espaço “Processos”, com a lista “Processos societários” e uma coluna por situação do processo.",
          "No cartão de processo, o selo “Automático · Processo nº” diz de onde ele veio. A coluna, o responsável, a prioridade e o prazo seguem o processo: arrastar o cartão para outra coluna não vale, e o aviso pede para registrar no processo. Clique em “Abrir processo” para ir até ele.",
        ],
      },
      {
        titulo: "Abertura automática: de onde as tarefas nascem sozinhas",
        passos: [
          "No Quadro de tarefas do setor, clique em “Abertura automática”. O botão aparece para quem coordena o setor.",
          "A tela mostra todas as origens que criam tarefas sozinhas no setor: processos societários, solicitações do cliente, obrigações recorrentes e obrigações por regime.",
          "Nos “Processos societários”, ligue ou desligue a abertura e escolha a “Lista onde o processo vira cartão”. Clique em “Salvar”.",
          "Trocar a lista vale para os processos novos; os cartões que já existem ficam onde estão. Desligar não apaga cartão: os que já existem seguem acompanhando os processos.",
          "As outras origens se configuram na tela de cada uma. Use “Configurar os assuntos”, “Ver as obrigações” ou “Ver os modelos” para chegar até ela.",
        ],
      },
    ],
    dicas: [
      "Criar e editar espaços é para o gestor do setor e os administradores. O que os colaboradores fazem em cada espaço é a “Permissão padrão” dele: “Edição total” (criam e editam, e criam pastas), “Editar” (criam e editam, sem pastas), “Comentário” (só comentam) ou “Apenas exibição” (só veem).",
      "Excluir atividade, subatividade, comentário, item do checklist, coluna, espaço, pasta ou tarefa é só do Administrador ou do Super Admin, e não pode ser desfeito. Excluir uma atividade leva junto as subatividades de todos os níveis abaixo dela; a confirmação diz quantas são. Quem escreveu um comentário corrige pelo “Editar”.",
      "Hora apontada errada se corrige na atividade, em “Horas apontadas”: clique no lápis do lançamento.",
      "Cada tarefa tem um código curto, TAR e o número (TAR-77), no alto da tarefa aberta. Digite o código na busca (Ctrl+K) para abrir a tarefa no quadro dela.",
      "A tela “Todas as tarefas” reúne num lugar só as tarefas de todos os seus setores. Para chegar nela, clique em “Todas as tarefas”, no topo do Meu dia.",
    ],
  },

  // ─── Arquivos ──────────────────────────────────────────────────────────────
  {
    chave: "arquivos",
    titulo: "Arquivos",
    caminhos: ["/arquivos"],
    resumo:
      "As pastas de cada empresa e as do escritório. Cada empresa já nasce com as pastas do modelo e com “Enviados pelo cliente”, onde cai o que o cliente manda pelo portal. Pasta compartilhada aparece no portal do cliente, com tudo que está dentro.",
    secoes: [
      {
        titulo: "Como achar as pastas de uma empresa",
        passos: [
          "Na barra lateral, clique em “Atendimento ao cliente” e escolha “Arquivos”. Digite na busca o nome ou o CNPJ da empresa. O resultado vem em dois grupos: “Empresas”, com as que batem com o texto, e “Arquivos”. Clique na empresa para abrir as pastas dela. Pela ficha da empresa, a aba “Arquivos” mostra as mesmas pastas.",
          "Na lista de empresas, o número à direita é quantos documentos a empresa tem (pastas e “Do Connect”). Âmbar com “!” é envio do cliente que ninguém da equipe abriu ainda: a empresa vem no topo, e o clique abre direto em “Enviados pelo cliente”.",
          "A lista mostra 12 empresas por página — primeiro as com envio novo, depois as com movimento mais recente. Use “Próxima” ou a busca para achar as outras.",
          "Clique numa pasta para abrir. A trilha no topo leva de volta a qualquer nível.",
          "Para achar um arquivo sem saber a empresa, use a mesma busca: digite o nome do arquivo e veja o grupo “Arquivos”. Em “Filtros”, o “Tipo” vale só para os arquivos.",
          "Dentro de uma empresa, a busca no topo olha o nome dos arquivos em todas as pastas dela.",
          "Em “Chegou do cliente”, no início dos Arquivos, estão os arquivos que os clientes mandaram pelo portal nos últimos 30 dias.",
        ],
      },
      {
        titulo: "Como enviar arquivos e organizar",
        passos: [
          "Abra a pasta e clique em “Enviar arquivos”. Arraste os arquivos ou clique para escolher, e depois em “Enviar”. Cada arquivo pode ter até 10 MB.",
          "Para criar uma pasta, clique em “Nova pasta”. Em “Quem vê”, escolha “Só” um setor quando a pasta for só dele — vale para tudo que estiver dentro.",
          "No “…” de cada pasta ou arquivo, use “Renomear”, “Mover” ou “Mandar para a lixeira”. As pastas do modelo não mudam de nome nem de lugar.",
          "O que vai para a lixeira fica 30 dias em “Lixeira”, no início dos Arquivos, e dá para restaurar: volta ao lugar de onde saiu. Depois disso some de vez.",
        ],
      },
      {
        titulo: "Como compartilhar uma pasta com o cliente",
        passos: [
          "Abra a pasta e clique em “Compartilhar”. Ligue “Mostrar no portal do cliente” e clique em “Salvar”.",
          "O cliente vê a pasta e tudo que está dentro dela, e baixa os arquivos. Ele não muda nem apaga nada.",
          "Para avisar, marque “Avisar o cliente agora”: vai um e-mail para quem tem acesso ao portal da empresa e um aviso no celular de quem ativou.",
          "Na linha de cada arquivo de uma pasta compartilhada aparece se o cliente abriu, quantas vezes e quando foi a última.",
        ],
      },
      {
        titulo: "O que acontece quando o cliente envia",
        passos: [
          "O cliente manda pelo portal, em “Arquivos” → “Enviar arquivos”. Tudo vai para “Enviados pelo cliente” da empresa.",
          "Os responsáveis da empresa em cada setor são avisados no sino. Sem responsável, o aviso vai para o setor que cuida dos Arquivos.",
          "Clique no aviso para abrir “Enviados pelo cliente” e mova cada arquivo para a pasta certa.",
        ],
      },
      {
        titulo: "Como ver os anexos que já estão no Connect",
        passos: [
          "Nas pastas de uma empresa, abra “Do Connect”. Ali estão os anexos das solicitações, pendências, processos do Societário, envios ao cliente e os documentos da ficha, por origem.",
          "Cada grupo começa fechado; clique para abrir. O nome baixa o arquivo, e a linha de baixo leva à solicitação, à pendência ou ao processo de onde ele veio.",
          "Para organizar, use “Guardar numa pasta” no “…”: uma cópia vai para a pasta escolhida, e o anexo continua onde estava.",
        ],
      },
      {
        titulo: "Como guardar um anexo nos Arquivos ao mesmo tempo",
        passos: [
          "Ao responder uma solicitação ou uma pendência, abrir uma pendência, mandar documento num processo ou criar um envio ao cliente, escolha a pasta em “Guardar também em Arquivos”.",
          "O anexo segue no módulo como sempre, e uma cópia vai para a pasta da empresa.",
        ],
      },
      {
        titulo: "Como pôr vencimento num documento",
        passos: [
          "No “…” do arquivo, clique em “Vencimento”, escolha a data e salve.",
          "A linha do arquivo mostra quando vence; a 30 dias, o selo fica amarelo, e vencido, vermelho.",
          "Quem cuida da empresa é avisado 30 e 7 dias antes, no dia e quando vence. Em pasta de um setor, o aviso vai para o setor.",
        ],
      },
    ],
    dicas: [
      "Com os Arquivos ligados, a aba “Documentos” da ficha da empresa dá lugar à aba “Arquivos”. Os documentos que estavam lá aparecem em “Do Connect”, e os vencimentos deles continuam avisando.",
      "As “Pastas do escritório” são os arquivos da casa, fora das empresas: não aparecem no portal do cliente.",
    ],
  },

  // ─── Solicitações dos clientes ────────────────────────────────────────────
  {
    chave: "portal_solicitacoes",
    titulo: "Solicitações",
    caminhos: ["/solicitacoes"],
    resumo:
      "A fila do que os clientes pedem pelo portal — documento, alteração ou qualquer outro assunto —, com o setor que atende, o responsável e o prazo de resposta prometido ao cliente. Na aba “Envios”, os documentos que o escritório manda a uma empresa, com a prova de leitura e o aceite.",
    secoes: [
      {
        titulo: "Como acompanhar a fila",
        passos: [
          "Na barra lateral, clique em “Atendimento ao cliente” e escolha “Solicitações”. A aba “Recebidas” mostra as que estão em aberto.",
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
      {
        titulo: "Como mandar um documento ao cliente",
        passos: [
          "Abra a aba “Envios” e clique em “Novo envio”. Pela ficha da empresa, “RH & operação” → “Envios ao cliente” abre a aba já filtrada nela.",
          "Escolha a “Empresa”, escreva o “Título” e o “Conteúdo” e, se precisar, anexe o arquivo. Marque “Pedir o aceite eletrônico do cliente” quando ele precisar concordar.",
          "Clique em “Salvar”. O envio fica como rascunho, e só você e a equipe o veem.",
          "Clique em “Publicar” e confirme. O documento aparece no portal do cliente, em “Documentos do escritório”, e quem pede aceite entra no “O que precisa de você” do Início dele.",
          "Para quem não tem portal, use “Enviar por e-mail”: cada endereço recebe um link próprio para o documento, com a mesma prova de leitura e aceite do portal.",
          "Na ficha do envio, “Prova de recebimento” mostra cada abertura e download do anexo, pelo portal ou pelo link do e-mail, com data, hora e IP, e o aceite com o nome de quem aceitou.",
        ],
      },
      {
        titulo: "Como mandar um comunicado a vários clientes",
        passos: [
          "Abra a aba “Comunicados” e clique em “Novo comunicado”.",
          "Escolha o “Setor que comunica” (o cliente vê de qual setor veio), escreva o “Título”, que vai no assunto do e-mail, e o “Texto”, que fica inteiro no portal.",
          "Em “Para quem”, escolha “Empresas do setor”, “Empresas escolhidas” ou “Todas as empresas”. Na lista das escolhidas, marcar uma matriz marca as filiais dela junto; desmarque a filial que não deve receber.",
          "Clique em “Enviar comunicado” e confirme. Ele sai na hora para o portal das empresas, com um e-mail para cada pessoa com acesso a elas.",
          "Na ficha do comunicado, acompanhe em quantas empresas ele já foi lido.",
        ],
      },
    ],
    dicas: [
      "Na aba “Pedidos” fica o que o escritório pede aos clientes — documento, informação ou confirmação —, de todos os seus setores. O cliente responde pelo portal e é lembrado se o prazo passar.",
      "Cada pessoa vê as solicitações dos seus setores e as que estão com ela. Administradores veem todas.",
      "Envio publicado não se edita mais: o cliente precisa ver sempre o mesmo conteúdo. Para corrigir, crie outro envio.",
      "Os cartões da aba “Envios” abrem o que está parado: rascunhos, enviados que ninguém abriu e os que esperam o aceite.",
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
          "Cada cartão da lista é um contato, com a situação e a hora do último atendimento. Clique nele para abrir o contato no painel ao lado.",
          "No painel, em “Atendimentos”, clique num atendimento para ver as mensagens. Use ↑ e ↓ para passar para o contato anterior ou o próximo.",
          "Para abrir a ficha da pessoa ou da empresa ligada ao contato, clique em “Abrir pessoa” ou “Abrir empresa”, abaixo do nome.",
        ],
      },
      {
        titulo: "Como ligar um contato a uma pessoa ou empresa",
        passos: [
          "Abra o contato sem vínculo e clique em “Vincular”, abaixo do nome.",
          "Digite pelo menos duas letras do nome e escolha a pessoa ou a empresa.",
          "Para desfazer, clique em “Desvincular”, o ícone ao lado do nome vinculado.",
        ],
      },
      {
        titulo: "Como ver a avaliação dos atendentes",
        passos: [
          "Clique na aba “Avaliação”.",
          "Confira os números de “Tratativa” (da transferência até a resolução — o trabalho do setor) e de “Triagem” (da abertura até o setor assumir — o trabalho da recepção): atendimentos avaliados, nota média, escrita média e SLA médio.",
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
      "Quando vence cada certificado digital A1 dos clientes, onde ele é usado, o que para se ele vencer e em qual entrada do cofre está a senha. O arquivo e a senha não ficam no Connect: ficam na pasta de rede e no cofre.",
    secoes: [
      {
        titulo: "Como ver o que precisa ser renovado",
        passos: [
          "Entre no setor e abra “Certificados digitais” na barra lateral.",
          "Confira os cartões “Vencidos”, “Vencem em 30 dias”, “Vencem em 60 dias” e “Sem empresa no Connect”. Clique em um para abrir a lista.",
          "A lista abre em “Todos em uso”, 50 por página. Para ver só o que precisa de atenção, clique no cartão “A renovar”: os vencidos e os que vencem nos próximos 60 dias.",
          "Para os outros recortes, clique em “Filtros” e escolha em “Situação”: “A renovar”, “Sem empresa no Connect” ou “Substituídos”.",
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
      "O setor recebe avisos 60, 30, 15 e 7 dias antes do vencimento e no próprio dia, dizendo o que para.",
      "Onde o certificado é usado: o ícone de atividade é uso registrado pelo Connect (robô do Societário e Integra Contador), que aparece sozinho e sai da lista depois de 90 dias parado; o lápis é uso marcado à mão por quem coordena, em “Editar”, para o que o Connect não vê sozinho.",
      "O uso é do CNPJ ou CPF: o certificado que vier na renovação herda os usos do anterior.",
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
      "“Excluir” aparece só para o Administrador e o Super Admin.",
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
      "As horas entram pelo cronômetro ou pelo lançamento manual, no card e no processo. Para corrigir um lançamento, clique no lápis ao lado dele.",
      "Em “Limites por setor”, o campo vazio mostra o padrão. Processo esperando o órgão só conta como parado depois de 30 dias, e tarefa que ainda não começou só avisa pelo prazo.",
      "“Sem responsável”, na aba “Coordenadores”, lista o que está em aberto sem ninguém designado: os alertas desses itens vão para a coordenação do setor.",
      "Na aba “Produtividade”, entregue é o item concluído no período em que a pessoa responde (com dois responsáveis, conta para os dois), e no prazo é o que terminou até o dia do prazo, entre os que tinham prazo. As horas pelo cronômetro são as do relógio do Connect; o resto foi lançado à mão. Setores não se comparam: cada um entrega coisas diferentes.",
    ],
  },

  // ─── Cargos e Salários ─────────────────────────────────────────────────────
  {
    chave: "gestao_cargos_salarios",
    titulo: "Cargos e salários",
    caminhos: ["/cargos-salarios"],
    resumo:
      "A matriz de cargos de todas as empresas, agrupada por família e nível de senioridade, com as faixas salariais e os pontos da estrutura que precisam de correção.",
    secoes: [
      {
        titulo: "Como ler a matriz",
        passos: [
          "Entre no setor e abra “Cargos e salários” na barra lateral.",
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
      "O painel de RH: quatro números no topo (headcount, turnover, absenteísmo e vagas abertas) e um gráfico mês a mês por tema — quadro, férias, horas extras e o funil do recrutamento —, calculados a partir do que é lançado no DP e no Recrutamento.",
    secoes: [
      {
        titulo: "Como ler os indicadores",
        passos: [
          "Entre no setor e abra “Indicadores de RH” na barra lateral.",
          "No topo ficam “Headcount”, “Turnover (12 meses)”, “Absenteísmo (30 dias)” e “Vagas abertas”. Leia a linha abaixo do número: ela diz o que ele conta.",
          "Embaixo, quatro gráficos: “Headcount, admissões e desligamentos”, as férias vencidas e a vencer no fim de cada mês, as “Horas extras por mês” e o “Funil do trimestre”.",
          "Escolha “6 meses” ou “12 meses” acima dos gráficos para mudar o período. O funil é sempre do mês atual e dos dois anteriores.",
          "Passe o mouse sobre um mês para ver os números dele. Clique em “Abrir” no gráfico para ir à tela de onde os números saem.",
        ],
      },
      {
        titulo: "Como abrir os relatórios",
        passos: [
          "Role a tela até “Relatórios”.",
          "Clique em “Férias”, “Treinamentos”, “Pendências” ou “Distorções salariais”.",
          "Cada relatório traz a lista de quem precisa de ação: férias vencidas e a vencer, treinamentos vencidos, pendências em aberto ou salários fora da faixa do cargo.",
          "Férias: os períodos aquisitivos em aberto, por urgência — vencida é passivo consumado; a vencer ainda dá para programar. Treinamentos: a validade sai da data da turma e da validade do treinamento, e a reciclagem vencida vem no topo. Pendências: documento com vencimento, admissão em aberto e exame sem ASO conferido, numa lista só. Distorções salariais: o salário atual contra a faixa do cargo, só de quem está fora dela.",
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
      "O relatório “Distorções salariais” e os “Custos” (folha e benefícios) só aparecem para quem tem permissão de ver salários.",
      "O número de férias vencidas fica em vermelho quando há alguma, porque é o que pede ação.",
      "O histórico sai das datas do cadastro (admissão, desligamento, volta das férias): uma data faltando ou errada muda os meses de antes.",
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
      "Na simulação, cada resposta do cliente liga uma atividade dos setores, e o honorário sai do tempo que ela custa. O percentual de cada situação que dá mais trabalho é o que o setor disse que ela acrescenta ao tempo dele; os minutos por atividade já vêm ajustados pela capacidade da equipe, e a complexidade entra depois, no total do setor. O “?” de “Piso” e “Tabela” diz o que cada um significa com os parâmetros atuais.",
      "Em “Parâmetros”, o custo mensal da equipe é salários, encargos e benefícios de quem atende cliente. A capacidade, o fator e o tempo de cada atividade vêm dos questionários dos setores e mudam quando eles são refeitos, não por ali; o fator encolhe os tempos declarados até a carteira caber nas horas da equipe.",
      "O “Diagnóstico da carteira” compara o que cada cliente paga com o que custou de verdade, pelas horas apontadas no período. Precisa de proposta ganha ligada a uma empresa e de horas apontadas nos cards e processos dela.",
    ],
  },

  // ─── Planejamento tributário ─────────────────────────────────────────────
  {
    chave: "contabil_planejamento",
    titulo: "Planejamento tributário",
    caminhos: ["/planejamento-tributario"],
    resumo:
      "Avaliações que comparam Simples Nacional, Simples híbrido, Lucro Presumido e Lucro Real de 2027 a 2033, com os dados da empresa e as premissas da reforma, e geram um relatório para o cliente.",
    secoes: [
      {
        titulo: "Como começar uma avaliação",
        passos: [
          "No setor Contábil, abra “Planejamento tributário” na barra lateral e clique em “Nova avaliação”.",
          "Escolha “Avaliação rápida”, para começar pelos totais, ou “Avaliação analítica”, para seguir as oito etapas.",
          "Em “Empresa do cadastro”, busque a empresa: nome, CNPJ, regime e UF vêm do cadastro. Para quem ainda não é cliente, use “Prospecto sem cadastro” e digite o nome.",
          "Escolha o “Ano dos dados” e clique em “Criar avaliação”.",
        ],
      },
      {
        titulo: "Como preencher os dados e as premissas",
        passos: [
          "Na aba “Dados”, informe os totais do período. Deixe em branco o que ainda não souber e use “Sem movimento: R$ 0” quando não houver valor.",
          "Para detalhar, clique em “Aprofundar esta avaliação” e siga as etapas: Empresa, Receitas, Operação, Pessoal, Contabilidade, Tributos e Caixa.",
          "Na aba “Premissas”, confira as hipóteses de CBS e IBS, as presunções, os créditos, a folha e as receitas por atividade.",
          "Ainda em “Premissas”, marque a elegibilidade de cada regime e “Utilizar estas premissas na comparação”.",
          "Clique em “Salvar” no topo. Mudar dados ou premissas depois pede para revisar as premissas de novo.",
        ],
      },
      {
        titulo: "Como ler o resultado e entregar o relatório",
        passos: [
          "Na aba “Resultado”, escolha o ano em “Projeção” e compare os quatro cartões; o selo “Menor carga neste cenário” aparece quando os quatro têm dados e as premissas foram revisadas.",
          "Use o gráfico da transição para ver os anos de 2027 a 2033 e baixe a tabela em CSV.",
          "Na aba “Relatório”, preencha o “Responsável” e a “Conclusão e observações”.",
          "Clique em “Imprimir / salvar PDF” para o cliente, ou em “Baixar relatório e memória” para o arquivo com a memória de cálculo.",
        ],
      },
    ],
    dicas: [
      "As alíquotas de CBS e IBS são hipóteses editáveis do estudo, não alíquotas oficiais confirmadas.",
      "Cada vez que você salva, uma versão fica guardada na aba “Histórico”, com uma foto dos dados e das premissas. “Abrir esta versão” carrega os valores antigos como rascunho, e ela só vira a atual quando você salva.",
      "Na avaliação rápida, informe cada valor uma vez: pessoal e impostos têm campos próprios. Na analítica, o Connect organiza os dados em etapas e pede só o que ainda falta.",
      "Marque “Atividade sujeita ao Fator R (III / V)” só nas atividades abrangidas por ele; a FS12 deve incluir os componentes legais da folha e dos encargos.",
      "“Revisei os dados e as premissas deste cenário” é um registro declaratório do responsável, não certificação fiscal. Alterar as premissas tira a marcação.",
      "Avaliações movidas para a lixeira guardam dados e histórico e podem ser restauradas na aba “Lixeira” da lista.",
      "O cálculo é anual: não faz apuração trimestral nem compensação automática de prejuízos, e diferença de carga não é economia garantida.",
    ],
  },

  // ─── Tokens de acesso e IA (05/11/2026) ────────────────────────────────────
  // Sem caminho: a seção fica dentro de “Sua conta”, e o “?” de lá não pode
  // virar este artigo. Chega-se pelo link da própria seção e pela central.
  {
    chave: "geral:tokens-de-acesso",
    titulo: "Tokens de acesso e IA",
    caminhos: [],
    resumo:
      "Conecte a sua IA (Claude Code, Codex, Cursor) ou um script ao Controle interno: com um token pessoal, ela consulta, registra e atualiza bugs, melhorias e novas funcionalidades em seu nome.",
    secoes: [
      {
        titulo: "Como criar um token",
        passos: [
          "Abra “Configurações” e, em “Sua conta”, vá até “Tokens de acesso”.",
          "Dê um “Nome do token” que diga onde ele vai ser usado, como “Claude Code no notebook”.",
          "Em “O que o token pode fazer”, escolha “Consultar e registrar” ou “Só consultar”.",
          "Escolha a “Validade” e clique em “Criar token”.",
          "Copie o token na hora: depois que você sair da tela, ele não aparece de novo.",
        ],
      },
      {
        titulo: "Como conectar o Claude Code",
        passos: [
          "Logo depois de criar o token, copie o comando de “Para o Claude Code, rode no terminal”.",
          "Cole e rode o comando no terminal do seu computador.",
          "Abra o Claude Code e peça, por exemplo: “registre um bug no Controle interno: a busca de empresas não acha pelo CNPJ”.",
        ],
      },
      {
        titulo: "Como conectar o Codex ou o Cursor",
        passos: [
          "No Codex, acrescente ao arquivo de configuração dele um servidor MCP chamado “connect”, com o endereço do Connect terminado em “/api/mcp” e o cabeçalho “Authorization: Bearer” seguido do token.",
          "No Cursor, acrescente o mesmo servidor no arquivo “mcp.json”, com o endereço e o cabeçalho.",
          "O passo a passo com os arquivos prontos para copiar fica no guia técnico do Connect, para quem cuida da integração.",
        ],
      },
      {
        titulo: "Como revogar um token",
        passos: [
          "Em “Tokens de acesso”, encontre o token em “Seus tokens”.",
          "Clique em “Revogar” e confirme. A IA ou o script que usava o token para de funcionar na hora.",
        ],
      },
    ],
    dicas: [
      "O token age com o seu acesso de hoje: se o seu papel ou os seus setores mudarem, o que ele pode fazer muda junto.",
      "Tudo o que a IA faz fica no histórico do item com o seu nome, e a Auditoria marca que veio pelo token.",
      "Todo token vence. Perto de vencer, ele aparece como “Vence em breve”; crie outro e revogue o antigo.",
      "O administrador vê os tokens ativos do escritório e pode revogar qualquer um.",
      "Trate o token como uma senha: não cole em chat, e-mail ou repositório.",
    ],
  },

  // ─── Academia (10/11/2026) ─────────────────────────────────────────────────
  {
    chave: "academia",
    titulo: "Academia",
    caminhos: ["/academia"],
    resumo:
      "Testes de digitação, de digitação de números, de lógica e de atalhos para treinar e disputar com os colegas, com desafio do dia, meta pessoal, ranking do mês e de evolução, Hall dos campeões e certificado para o pódio. Nada daqui entra em avaliação de desempenho.",
    secoes: [
      {
        titulo: "Como fazer um teste",
        passos: [
          "Clique no chapéu de formatura, no alto da tela, e em “Treinar” — ou abra “Testes” dentro da Academia.",
          "No cartão do teste, escolha “Valendo” (conta para o ranking) ou “Treino livre” (sem limite, fora do ranking).",
          "Escolha o nível — Fácil, Médio ou Difícil — e clique em “Começar”.",
          "Na digitação e nos números, o relógio de 60 segundos começa na primeira tecla. Colar não vale, e o que ficar sem digitar desconta da precisão.",
          "Na lógica, são 10 questões em 3 minutos. Use os números no alto para pular entre as questões e “Enviar respostas” no fim; quando o tempo acaba, o que estiver marcado é enviado.",
        ],
      },
      {
        titulo: "A tentativa valendo do dia",
        passos: [
          "Valendo, cada nível de cada teste tem uma tentativa por dia. O cartão do teste mostra quais já foram usadas hoje.",
          "A tentativa conta assim que o texto ou as questões aparecem, mesmo se você sair no meio.",
          "Quer treinar mais? Use o “Treino livre”: os mesmos testes, sem limite.",
        ],
      },
      {
        titulo: "Como funciona o ranking",
        passos: [
          "Abra “Ranking” e escolha o teste nas abas; filtre por mês, nível e setor.",
          "A lista mostra os 10 primeiros e a sua linha, se você estiver abaixo deles.",
          "Na digitação, a ordem é pelas palavras por minuto descontada a precisão; na lógica, pela precisão, e o empate vai para quem fez menos tentativas e em menos tempo.",
          "Para sair do ranking, desligue “Aparecer no ranking”. Você some da lista dos colegas e do post do ranking, e passa a ver só os seus números.",
          "Quem fica entre os 3 primeiros de um mês encerrado baixa o certificado de destaque em PDF, no aviso que aparece no ranking daquele mês.",
        ],
      },
      {
        titulo: "Como administrar (Administrador e coordenação da Tech)",
        passos: [
          "Abra a aba “Administração” da Academia.",
          "Em “Textos de digitação”, cadastre e edite os textos de cada nível. Para não sortear mais um texto, desligue em vez de excluir.",
          "Em “Questões de lógica”, escreva o enunciado, ponha uma imagem se precisar e cadastre de 2 a 6 alternativas — cada uma com texto, imagem ou os dois — marcando a certa.",
          "Em “Prêmio do mês”, escreva o prêmio do pódio (por exemplo, “Top 3 ganham chocolate”) e, se quiser, o da maior evolução. Eles aparecem no painel do topo, no Início e no ranking, e ficam gravados no Hall dos campeões quando o mês fecha. Deixe vazio para o mês não ter prêmio.",
        ],
      },
      {
        titulo: "Desafio do dia e sequência",
        passos: [
          "No Início da Academia (ou no painel do chapéu), clique em “Fazer o desafio”: é 1 minuto de digitação, com o mesmo texto para toda a equipe no dia.",
          "Uma vez por dia. Fazer o desafio conta a sua sequência de dias; o resultado não entra no ranking do mês.",
          "Sábado e domingo não quebram a sequência, e um dia útil perdido por semana é perdoado.",
          "A partir de 2 dias seguidos, a chama com o número aparece embaixo do chapéu de formatura, no topo da tela.",
        ],
      },
      {
        titulo: "Atalhos do Excel e do Connect",
        passos: [
          "Em “Testes”, abra “Atalhos do Excel e do Connect” e escolha o nível: o Médio inclui os do Fácil, e o Difícil, todos.",
          "A tela pede uma ação (“Copiar”, “Buscar no Connect”…) e você aperta o atalho. Cada atalho apertado passa para a próxima ação.",
          "Vale quantos acertos você faz em 60 segundos. No fim, aparece o atalho certo de cada erro.",
        ],
      },
      {
        titulo: "Meta pessoal",
        passos: [
          "No Início da Academia, em “Sua meta”, clique em “Definir uma meta”.",
          "Escolha o teste, o nível (ou qualquer um), o alvo — PPM na digitação, acertos na lógica e nos atalhos — e o prazo.",
          "O progresso é o seu melhor resultado valendo desde que a meta foi definida, e aparece também no painel do chapéu. Só você vê a sua meta.",
        ],
      },
      {
        titulo: "Evolução, placar por setor e Hall dos campeões",
        passos: [
          "No “Ranking”, troque a visão para “Evolução”: quem mais melhorou no mês contra a própria média dos 3 meses anteriores (os meses em que a pessoa fez o teste), com pelo menos 3 tentativas valendo no mês.",
          "Em “Por setor”, a média do melhor de cada pessoa do setor, o mesmo número do ranking geral. Só entram setores com pelo menos 3 pessoas no mês.",
          "O “Hall dos campeões” guarda, dos últimos 12 meses encerrados, o pódio de cada teste (o do ranking geral do mês) e a maior evolução da equipe, com o prêmio. Um mês entra no Hall quando fecha.",
          "No ranking geral do mês, na evolução e no Hall, o botão “Parabéns” manda um aviso para o colega, que chega no sino — um por pessoa, mês e tipo.",
        ],
      },
    ],
    dicas: [
      "Nada da Academia entra em avaliação de desempenho: é para treinar, aprender e disputar com os colegas.",
      "O Somente leitura vê a Academia e o ranking, mas não faz os testes.",
      "Com “Aparecer no ranking” desligado, você também some da evolução, do placar por setor e do Hall, e não manda nem recebe parabéns.",
      "As imagens das questões aceitam JPG, PNG e WEBP de até 4 MB.",
      "Descreva no enunciado o que a imagem mostra: é o que o leitor de tela lê.",
    ],
  },

  // ─── Chamados (17/11/2026, melhoria-707) ───────────────────────────────────
  // Criado quando as explicações saíram das telas de Chamados: o subtítulo da
  // lista, o da abertura e os parágrafos da configuração vieram para cá.
  {
    chave: "helpdesk",
    titulo: "Chamados",
    caminhos: ["/chamados"],
    resumo:
      "Os pedidos de suporte da equipe ao setor que atende os chamados: você descreve o que precisa, a IA sugere o título e a categoria, e a equipe acompanha cada chamado até resolver, com prazo de atendimento por prioridade.",
    secoes: [
      {
        titulo: "Como abrir um chamado",
        passos: [
          "Abra “Chamados” e clique em “Novo chamado”.",
          "Escreva na “Descrição” o que você precisa, o sistema ou recurso envolvido e o que aconteceu. Escolha a prioridade e, se quiser, anexe arquivos em “Anexos”.",
          "Clique em “Continuar”. A IA lê o pedido e sugere o título e a categoria; isso costuma levar alguns segundos, e “Abrir sem esperar” abre o chamado sem a sugestão.",
          "Em “Confira antes de abrir”, ajuste o título e a categoria se precisar. Quando mais de um setor atende chamados, escolha também o “Setor que vai atender” — a IA sugere um.",
          "Se a IA fizer perguntas, responda o que souber: ajuda a equipe a começar sem precisar perguntar. Sem resposta, o chamado abre com o que você escreveu.",
          "Clique em “Abrir chamado”. Depois, a IA confere se já existe no Orquestrador algo que faça o pedido, e você é avisado no sino.",
        ],
      },
      {
        titulo: "Como acompanhar os chamados",
        passos: [
          "A lista mostra os chamados que você pode ver, com o total no alto.",
          "Use a busca para achar um chamado. Quando aparece a escolha “Buscar em”, dá para procurar pelo chamado, por quem abriu, pelo setor solicitante ou pelo responsável.",
          "Quem atende pode clicar em “Atribuídos a mim” para ver só os seus.",
          "Clique no chamado para abrir o atendimento, com a conversa, o prazo e as informações do pedido.",
        ],
      },
      // O período de teste (26/11/2026, funcionalidade-853).
      {
        titulo: "Como funciona o teste da entrega",
        passos: [
          "Ao entregar, quem atende clica em “Entregar para teste” (na situação ou no menu “…”), escolhe o prazo — 3, 5 ou 10 dias úteis, ou outra data — e, se quiser, conta o que testar. O chamado fica “Em teste” e o prazo de atendimento para.",
          "Quem abriu o chamado vê no alto dele o bloco “Teste da entrega” e responde: “Deu tudo certo” conclui o chamado, “Encontrei um problema” volta para o atendimento, e “Não consegui testar” ou “Outro” deixam a decisão com quem atende, que prorroga o prazo ou conclui.",
          "Se o prazo vence sem retorno, o chamado não conclui sozinho: fica marcado “Teste vencido” e o sino avisa. Quem atende pode prorrogar ou concluir sem retorno, e isso fica registrado.",
        ],
      },
      {
        titulo: "Como configurar quem atende e os prazos (gestão)",
        passos: [
          "Na lista, clique na engrenagem “Configurar chamados”.",
          "Em “Setores que administram os chamados”, marque os setores que atendem e clique em “Salvar setores”. Com mais de um, escolha o “Setor padrão”, que recebe o chamado de quem não escolhe.",
          "Em “Políticas de SLA”, informe para cada prioridade a “Primeira resposta” e a “Resolução”, em minutos úteis, e clique em “Salvar política”.",
        ],
      },
    ],
    dicas: [
      "Quem é da equipe que atende vê e gerencia os chamados do setor. O gestor de outro setor vê os chamados que ele e o seu setor abriram; os demais, os que abriram.",
      "Cada setor marcado atende os chamados enviados a ele. Com mais de um, a IA propõe o setor na revisão e quem abre confirma; a equipe pode encaminhar o chamado depois.",
      "Os prazos contam em minutos úteis: de segunda a quinta, das 8h às 18h, e na sexta, das 8h às 17h, no horário de Brasília. O ciclo começa em “Em andamento” e pausa nas situações de espera.",
      "Quem entrou num setor que passou a atender precisa sair e entrar de novo no Connect para ver a fila.",
      "Cada chamado tem um código curto, CHA e o número (CHA-45), no cartão e no protocolo. Na busca, o código, “#45” ou só “45” acham o chamado; um link antigo, como o de “chamado-45”, continua abrindo.",
    ],
  },

  // ─── Controle interno (17/11/2026, melhoria-707) ───────────────────────────
  {
    chave: "tech_controle_interno",
    titulo: "Controle interno",
    caminhos: ["/controle-interno"],
    resumo:
      "As melhorias, correções e próximos passos da equipe Tech: cada item com tipo, prioridade, sistema, situação, responsável, prazo e o critério de aceite para conferir antes de aprovar.",
    secoes: [
      {
        titulo: "Como registrar um item",
        passos: [
          "Clique em “Novo item”.",
          "Escreva o “Título” em uma frase e, na “Descrição”, onde acontece, o que se esperava e os passos para ver de novo.",
          "Se quiser, preencha o “Critério de aceite”: um rótulo por linha (Mudança, Antes de testar, Onde testar, Passos e Aprovado quando). Cada linha de “Aprovado quando” vira um ponto para conferir no item.",
          "Escolha o “Tipo”, a “Prioridade”, o “Sistema” (do cadastro do Orquestrador), a “Situação”, o “Responsável” e, se houver, o “Prazo”. Em “Evidências”, anexe prints de tela, PDFs ou planilhas.",
          "Clique em “Criar item”. O item entra na lista e no kanban.",
        ],
      },
      {
        titulo: "Como acompanhar",
        passos: [
          "Troque a visão entre “Lista”, “Kanban”, “Histórico” e “Entregas”.",
          "Use a busca e os filtros para achar um item por título, situação, tipo, prioridade, sistema, responsável ou prazo.",
          "Para concluir, mude a situação e informe, se houver, o PR e o commit da mudança.",
          "Clique em “Resumo” para ver o que a equipe concluiu, tem em andamento e planejou no período, e copiar o texto.",
        ],
      },
    ],
    dicas: [
      "No Resumo, concluídos e cancelados contam pela data da mudança de situação; “em andamento” é a situação de agora.",
      "O “Tamanho” (P, M ou G) trava quando o item começa, e quem define é a coordenação da Tech. Nas Entregas, só a entrega que passou por “Em validação” e tem tamanho conta pontos.",
      "“Veio de” liga o item à entrega que o gerou: é o retrabalho daquela entrega.",
      "Cada item tem um código curto: a sigla do tipo em três letras e o número, como FUN-816. As siglas são BUG (bug), MEL (melhoria), FUN (nova funcionalidade), TES (teste) e MIG (migração). Digite o código na busca para achar o item; o link do item também usa ele, e um link antigo, como o de “funcionalidade-816”, continua abrindo.",
    ],
  },

  // ─── Ceci (17/11/2026, melhoria-707) ───────────────────────────────────────
  {
    chave: "tech_ceci",
    titulo: "Ceci",
    caminhos: ["/ceci"],
    resumo:
      "Como a assistente do Connect está indo: as avaliações das respostas, o processamento de cada Ceci e o que pede atenção. Os números contam os últimos 30 dias; a evolução, as últimas 8 semanas.",
    secoes: [
      {
        titulo: "Como ler o painel",
        passos: [
          "No alto ficam os totais dos últimos 30 dias: perguntas, respostas boas, chamadas com erro, tempo médio e custo.",
          "Em “Pontos importantes” está o que pede atenção primeiro.",
          "Em “Melhora”, a porcentagem de respostas boas entre as avaliadas, semana a semana, e a tabela das últimas 8 semanas. Passe o mouse numa coluna para ver os números da semana.",
          "Em “Processamento”, as chamadas de cada Ceci nos últimos 30 dias, com erros, tempo médio, P90 e custo.",
        ],
      },
    ],
    dicas: [
      "P90 é o tempo em que 9 de cada 10 respostas saíram.",
      "O Super Admin abre as respostas com 👎, uma a uma, pelo botão “Respostas com 👎”, no alto da tela.",
    ],
  },

  // ─── Notificações (17/11/2026, melhoria-707) ───────────────────────────────
  {
    chave: "geral:notificacoes",
    titulo: "Notificações",
    caminhos: ["/notificacoes"],
    resumo:
      "Tudo o que chegou para você no sino, separado em abas: “Para mim” (o que alguém da equipe fez para você), “Clientes” (o que veio do portal, de candidatos e do WhatsApp) e “Alertas” (a rotina automática de prazos, vencimentos e varreduras).",
    secoes: [
      {
        titulo: "Como ler e organizar",
        passos: [
          "Clique no sino, no alto da tela, ou abra “Notificações”.",
          "Escolha a aba e, se quiser, mostre só as não lidas.",
          "Clique numa notificação para abrir o que ela avisa.",
          "Selecione várias para marcar como lidas, como não lidas ou arquivar. “Arquivar as lidas” limpa a aba de uma vez.",
          "O que você arquiva sai do sino e das abas sem ser apagado: fica em “Arquivadas”, e “Desarquivar” traz de volta.",
        ],
      },
      {
        titulo: "Como escolher o que cada aba mostra",
        passos: [
          "Em “Preferências”, clique em “O que cada aba mostra”.",
          "Desligue os tipos que você não quer ver, um a um ou o grupo inteiro.",
          "Clique em “Salvar”. O tipo desligado sai do sino e das abas e não manda aviso no celular, mas continua guardado: ligue de novo e ele volta, com o que chegou nesse meio-tempo.",
        ],
      },
      {
        titulo: "Como ligar o som e o aviso no aparelho",
        passos: [
          "Em “Preferências”, ligue “Som ao chegar notificação”, escolha o som e ajuste o volume.",
          "Ligue “Aviso neste aparelho” para a notificação aparecer no canto da tela do computador (ou nas notificações do celular), como um programa instalado.",
          "Clique em “Testar” para conferir.",
        ],
      },
    ],
    dicas: [
      "O som e o aviso valem só para o navegador em que você ligou.",
      "Se o navegador bloqueou as notificações, libere no cadeado ao lado do endereço e recarregue a página.",
    ],
  },
];

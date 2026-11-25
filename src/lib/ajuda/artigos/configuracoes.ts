import type { ArtigoDeAjuda } from "../tipos";

// Os artigos de Configurações, Sua conta e Atendimento (17/11/2026,
// melhoria-707): as telas não tinham artigo, e as frases que explicavam cada
// uma (subtítulos, parágrafos fixos, textos embaixo dos campos) saíram da tela
// e vieram para cá. Os rótulos entre aspas curvas são os da tela: quando um
// botão mudar de nome, o texto muda junto.
export const ARTIGOS_DE_CONFIGURACOES: ArtigoDeAjuda[] = [
  // ─── Configurações do escritório ───────────────────────────────────────────
  {
    chave: "geral:configuracoes",
    titulo: "Configurações",
    caminhos: ["/admin"],
    resumo:
      "O que vale para todo o escritório, separado por assunto: dados do escritório, usuários e acessos, setores e módulos, portal do cliente, rotinas e cálculos, integrações e IA.",
    secoes: [
      {
        titulo: "Como achar uma configuração",
        passos: [
          "Clique na engrenagem do topo para abrir “Configurações”.",
          "Escolha o assunto: “Escritório e assinatura”, “Pessoas e acessos”, “Setores e módulos”, “Portal do cliente”, “Rotinas e cálculos”, “Integrações e IA”.",
          "Clique no item para abrir a tela. A sua própria conta fica em “Sua conta”, no alto.",
        ],
      },
      {
        titulo: "Como organizar um setor",
        passos: [
          "Em “Setores e módulos”, escolha o setor na lista.",
          "Em “Módulos”, ligue ou desligue as telas que o setor opera; “Mover” e “Compartilhar” levam um módulo de um setor a outro.",
          "Em “Agenda e Meu dia”, diga se o setor usa reuniões e quais fontes de prazo a Agenda mostra para quem é dele. O coordenador do setor também muda isso, em Sua conta.",
          "Em “Telas do menu Geral” e “Ordem no menu”, escolha o que aparece no menu de quem trabalha no setor e em que ordem.",
          "As pessoas do setor se escolhem em “Usuários”, na edição de cada uma.",
        ],
      },
      {
        titulo: "Como configurar o portal do cliente",
        passos: [
          "Em “Acessos ao portal”, veja as contas de clientes que entram no portal. Cada conta enxerga as empresas ligadas a ela e, com “incluir filiais”, as filiais delas, inclusive as cadastradas depois. Dá para criar e ligar acessos também na ficha de cada empresa, em “Acesso ao portal”.",
          "Uma conta nova nasce sem senha — nem quem cria sabe qual é. O cliente recebe por e-mail o link para definir a dele.",
          "Em “Telas liberadas”, libere cada tela do portal depois de testar. Uma tela bloqueada some do menu, do Início, da ajuda e do tutorial do portal; quem abrir pelo endereço vê “Esta tela ainda não está disponível”. Vale na hora e para todos os clientes; telas novas chegam liberadas, e Início, Minha conta e Ajuda ficam sempre liberadas.",
          "Na aba da Ceci, ligue as empresas em que ela responde ao cliente sobre pendências, contas, processos, notas e solicitações.",
          "Em “Envios ao cliente”, escolha o lembrete de não lido padrão: o prazo que um envio novo já traz escolhido. Quem envia ainda troca, envio a envio, e os envios que já existem não mudam.",
          "Em “Assuntos das solicitações”, cadastre o que o cliente escolhe ao pedir algo pelo portal: o setor que atende, em quantos dias úteis a equipe responde e se aceita pedido por link público, de quem ainda não é cliente.",
        ],
      },
      {
        titulo: "Como cadastrar uma obrigação recorrente",
        passos: [
          "Em “Obrigações recorrentes”, cadastre DAS, DCTF, folha, título bancário diário, contas a receber semanais e afins: o Connect gera o item do kanban na frequência escolhida (diária, semanal, quinzenal ou mensal), com o vencimento prorrogado para o próximo dia útil.",
          "Em “Obrigações por regime”, cadastre a obrigação uma vez por setor e diga a que empresas ela se aplica — regime, sem movimento, funcionários, estado, cidade.",
          "O Connect gera as atividades das próximas competências no kanban do setor, com o responsável da empresa, e ajusta sozinho quando a empresa muda de regime.",
          "Com “Só empresas com o setor contratado”, o responsável do setor na empresa vira o responsável da atividade.",
        ],
      },
      {
        titulo: "Como ligar uma integração",
        passos: [
          "Em “Integrações”, ficam os sistemas que o Connect opera e as contas ligadas a ele. Abra o bloco do sistema e preencha as credenciais.",
          "Marque “Conexão ligada” e salve. Desligada, nada é enviado nem buscado: a integração nunca nasce ligada, e ligar é um ato deliberado.",
          "Num segredo já guardado, deixe o campo em branco para manter o que está lá.",
          "Em “Inteligência artificial”, veja quanto a IA fez e gastou no mês e ajuste até onde cada agente pode ir.",
        ],
      },
    ],
    dicas: [
      "Modelo de pastas: são as pastas que toda empresa ganha nos Arquivos. Mudar nome ou setor vale na hora para todas; pasta nova chega a cada empresa na próxima vez que alguém abrir os Arquivos dela. Além delas, toda empresa tem “Enviados pelo cliente”, e desligar uma pasta do modelo não tira a pasta de quem já tem.",
      "“Nasce compartilhada com o cliente”, no modelo de pastas, vale para as empresas que ganharem a pasta daqui em diante; em cada empresa a equipe pode mudar.",
      "Pasta de rede: o robô do escritório traz para os Arquivos o que a equipe põe na pasta da empresa na rede, nas pastas do modelo (no formato “CNPJ - Nome/Fiscal/2026/arquivo.pdf”). Só entra o que é das empresas ligadas ali.",
      "Feriados: os nacionais entram sozinhos todo ano. Cadastre os estaduais, municipais, pontes e recessos do escritório.",
      "Campos sensíveis: sem concessão explícita, ninguém vê salário, dados bancários, dados médicos e documentos pessoais — nem o administrador. Toda mudança fica na auditoria. O Super Admin (o suporte do Connect) sempre tem acesso e não aparece na matriz.",
      "Plano de contas: é o plano padrão que toda empresa herda, e é o que classifica o lançamento gerado a partir de um documento fiscal. Cada empresa ajusta o dela — categoria própria, o que não usa escondido, outra linha da DRE — em Fornecedores e sacados › Plano de contas.",
      "Cálculo de rescisão: o padrão do escritório vale para todas as empresas-cliente, e cada empresa sobrescreve o que for diferente na própria ficha. O cálculo é referência para conferência, não apuração oficial: serve para comparar com o TRCT que a contabilidade enviou. As constantes legais (1/3 constitucional, FGTS 8%, multa 40/20/0%, aviso de 30 + 3 dias por ano) vêm da lei e não se configuram.",
      "No cálculo de rescisão, desmarque “A contabilidade apresenta o 1/3 constitucional como item separado” quando ela envia o 1/3 embutido nas férias: o item deixa de acusar divergência.",
      "Telas em manutenção, em “Setores e módulos”, ficam bloqueadas para todos. A Tech e os administradores abrem só para si, pelo próprio aviso, para testar.",
      "“Trabalhar numa empresa por vez”, no setor: quem é do setor escolhe a empresa na faixa “Trabalhando em”, acima das telas (ou na ficha dela), e as telas passam a mostrar e gravar só ela, com a matriz e as filiais. Desligada, a faixa some para o setor.",
      "Agenda do setor: sem reuniões, a Agenda de quem é do setor abre em Prazos, sem convite para marcar reunião, e o Meu dia começa sem “Próximas reuniões” — cada pessoa ainda pode abrir a Semana e ligar o bloco no Meu dia dela. As fontes padrão valem para quem nunca escolheu as próprias; quem está em mais de um setor vê a soma, e cada fonte só aparece para quem abre a tela de onde ela vem.",
      "Ordem no menu: só o Super Admin muda, e vale para todos do setor. Uma tela fica sempre no grupo dela, a que veio de outra fica embaixo da tela de origem, e as que se ligarem depois entram no fim do grupo.",
      "Telas do menu Geral: esconder tira a tela do menu, da busca (Ctrl+K) e das telas fixadas, mas não bloqueia — quem tiver o endereço ainda abre. Quem está em mais de um setor vê, em “Todos os setores”, as telas de todos os seus setores juntas; administradores veem ali o padrão do menu.",
      "Usuários: marque só os setores de que a pessoa precisa — todos marcados por padrão deixam a listagem poluída. O bloco “Atendimento” da pessoa diz quem ela é na equipe (e no Chatwoot), o que põe o nome e a foto reais na avaliação das conversas.",
      "Papéis dos atendentes: “Recepção” é quem recebe o atendimento antes de passar para o setor — a primeira resposta de alguém que não está marcado assim separa a nota de triagem da de tratativa. “Automação” é a conta que a integração usa para saudação, fora de horário e agradecimento final; sem a marcação, ela vira “quem atendeu”. Vale para as próximas avaliações; o histórico só muda quando a repontuação roda.",
      "Portal do cliente, Ceci: ela só consulta o que o portal já mostra ao cliente, e só das empresas ligadas que estão no acesso dele. Não faz nada sozinha: quando o cliente precisa da equipe, prepara uma solicitação, que ele mesmo revisa e envia. Ligada na matriz, vale também para as filiais; cada cliente faz até 20 perguntas por dia.",
      "Envio com lembrete: se ninguém do cliente abrir o documento no prazo, sai um aviso só — o mesmo e-mail do envio, com o texto de lembrete, e o aviso no portal.",
      "Aparência do portal: a cor principal vai nos botões, no item aberto do menu, nos links e no cabeçalho das tabelas do portal. O logo, quando ligado, fica no lugar do logo do Connect, também na entrada do portal e no topo dos e-mails ao cliente.",
      "Cores das áreas de uso: como no Omie, a cor diz o uso da tela (Finanças, Pessoas, Recrutamento…), não o setor. Aparece no ícone de cada item do menu, no traço do título e no cartão do número; no Connect da equipe, também na linha e na etiqueta do cabeçalho, no título, no botão principal e no cabeçalho das tabelas. Desligado, tudo fica na cor principal. Pessoas, Recrutamento e Escritório só aparecem no Connect da equipe.",
      "“Usar a cor principal também no Connect da equipe”: desligado, a equipe segue no azul do Connect onde a tela não tem área de uso. As cores das áreas valem para a equipe de qualquer jeito.",
      "Integrações › IA: a chave serve a todos os agentes de IA do Connect (triagem de currículo, atendimento do WhatsApp, resumos). Cada escritório usa a própria conta; sem a chave, a IA fica desligada. Os agentes, os tetos e o gasto ficam em “Inteligência artificial”.",
      "Integrações › Chatwoot: o histórico de conversas fica ligado às empresas e pessoas cadastradas, só para leitura por enquanto. As conversas ficam em Conversas, no menu lateral.",
      "Integrações › reuniões: a conta pessoal do Google Meet ou do Microsoft Teams serve para agendar reuniões direto das atividades do Quadro de tarefas, e vale só para quem conectou.",
      "Integrações › Omie: uma conta para cada empresa cliente do BPO. A App Key e o App Secret ficam no Omie da empresa, em Configurações › Aplicativos — login e senha não servem para a API. “Testar” lê a empresa no Omie e confere o CNPJ. As notas de saída entram no acervo fiscal a cada 30 minutos (ou em “Importar notas”), inclusive as das filiais cadastradas com ela como matriz: cadastre a conta na matriz. As contas a pagar e a receber entram em “Importar contas”, depois da prévia, e daí se atualizam sozinhas a cada 6 horas. Só leitura: nada muda no Omie.",
      "Integrações › GitHub: a autorização pede o escopo “repo”, mas o Connect só faz leituras. Ao trocar a conta, ela precisa ser autorizada de novo; o histórico é preservado.",
      "Integrações › Orquestrador: cadastre uma ou mais chaves para as automações do escritório; cada bot informa seu identificador (slug), e a chave completa só aparece ao gerar ou trocar.",
      "Integrações › Motor SPED: o “Gerar SPED” não usa os tokens — o pedido vai pela fila do Connect, e o agente do motor busca com uma chave do Orquestrador. O token de escrita só libera as ações das telas antigas do motor, como executar e gravar decisões; sem ele, essas telas só consultam.",
      "Inteligência artificial: em “Últimas chamadas”, cada chamada diz quem pediu, sobre o quê e como terminou — é a resposta para “por que esse texto apareceu nesta ficha”.",
      "Chat de IA no canto da tela: aparece para quem tem acesso a alguma IA ligada — a do setor ou a Ajuda do Connect. Cada pessoa faz até 30 perguntas por dia, e as conversas são apagadas 90 dias depois da última mensagem.",
      "Avaliação das respostas do chat: mostra o que as pessoas acharam (útil ou não ajudou). As que não ajudaram aparecem com a pergunta, sem o nome de quem perguntou e sem o resto da conversa; quem marca é avisado disso na hora.",
      "Orquestrador do chat: a Ceci de cada setor reconhece pergunta de outro setor e a passa adiante — para a Ceci daquele setor, se a pessoa tiver acesso, ou como sugestão de transferência. O painel mostra só contagens.",
      "Campos customizados: são campos a mais nas fichas de empresa e de pessoa, por setor, na ordem em que aparecem. Arraste pela alça para mudar a ordem, ou use as setas com ela selecionada. Tags são reutilizáveis em todos os kanbans do mesmo setor.",
    ],
  },

  // ─── Sua conta ─────────────────────────────────────────────────────────────
  {
    chave: "geral:sua-conta",
    titulo: "Sua conta",
    caminhos: ["/configuracoes"],
    resumo: "Sua conta e suas preferências neste workspace: perfil, senha, cor de destaque, avisos e os tokens de acesso para a sua IA.",
    secoes: [
      {
        titulo: "Como mudar o seu perfil",
        passos: [
          "Clique no seu nome, no canto da tela, e escolha “Sua conta”.",
          "Em “Perfil”, troque o nome ou a foto e clique em “Salvar”.",
          "O e-mail de acesso só um administrador muda.",
        ],
      },
      {
        titulo: "Como trocar a senha",
        passos: [
          "Em “Sua conta”, vá até “Segurança”.",
          "Digite a senha atual e a nova duas vezes, com pelo menos 8 caracteres, e clique em “Alterar senha”.",
          "Todas as sessões abertas são encerradas — inclusive esta — e você entra de novo com a senha nova.",
        ],
      },
    ],
    dicas: [
      "A cor de destaque muda a cor dos botões, da aba aberta e do item do menu, e o tom da lateral, só para você. As cores das áreas de uso não mudam.",
      "Os tokens de acesso para conectar a sua IA ao Controle interno têm um artigo próprio, “Tokens de acesso e IA”, aberto pelo link da seção.",
    ],
  },

  // ─── Atendimento (WhatsApp do escritório) ──────────────────────────────────
  {
    chave: "atendimento",
    titulo: "Atendimento",
    caminhos: ["/atendimento"],
    resumo:
      "O WhatsApp do escritório no Connect: toda conversa nova chega na triagem, que encaminha ao setor; quem não é da triagem vê as conversas do seu setor e as que estão com você.",
    secoes: [
      {
        titulo: "Como passar uma conversa a outro setor",
        passos: [
          "Abra a conversa e clique em “Encaminhar”.",
          "Escolha o setor e, se quiser, a pessoa. Sem pessoa, a conversa fica em “Sem responsável” até alguém do setor assumir.",
          "Quando é a triagem que encaminha, a conversa vai direto para o setor. Quando um setor pede para passar a outro, o pedido vai para a triagem aprovar; “A definir” deixa a triagem escolher.",
        ],
      },
      {
        titulo: "Como começar uma conversa",
        passos: [
          "Clique em “Nova conversa”.",
          "Busque o contato pelo nome ou pelo telefone. Só aparecem os contatos que já falaram pelo número do escritório ou foram ligados a uma empresa.",
          "Se alguém já estiver atendendo, a conversa continua com essa pessoa até ser passada ou encerrada.",
        ],
      },
      {
        titulo: "Como encerrar um atendimento",
        passos: [
          "Na conversa, clique em “Encerrar” e escolha o desfecho.",
          "Para pedir nota, marque “Pedir uma nota de 1 a 5 ao cliente”: a pergunta sai junto com a despedida, e a resposta com o número vira a nota do atendimento, sem reabrir a conversa.",
        ],
      },
    ],
    dicas: [
      "“Métricas” mostra os atendimentos abertos no período. Os tempos são a mediana: o do meio, que um atendimento esquecido não distorce.",
      "As configurações do Atendimento valem para o WhatsApp do escritório; o WhatsApp do Recrutamento tem as configurações dele.",
      "Com as respostas automáticas desligadas, o Connect não manda nada sozinho: nem boas-vindas, nem fora do horário, nem a confirmação de quem pede para parar. As conversas chegam na triagem do mesmo jeito. Os textos só saem com elas ligadas, e texto vazio não manda nada.",
      "A sugestão de setor da Ceci na triagem não aparece na conversa: fica guardada ao lado do setor que a triagem escolheu, para medir se ela está aprendendo.",
      "O aviso de conversa nova vem desligado para cada pessoa: ligue só para quem precisa saber de cada conversa nova, e salve as configurações para valer.",
    ],
  },
];

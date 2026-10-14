// O que a seção da Lígia mostra em cada setor (13/10/2026, versão 3 do site).
//
// Pedido do Kauan: a Lígia é o ponto alto do site — "a nossa inteligência
// artificial, separada por setores e para os clientes". Regra desta lista: só
// o que existe. Cada setor foi escrito a partir do agente dele:
//
// - o que ela consulta = as ferramentas de leitura do agente, em
//   `src/lib/ia/catalogo.ts` (lista `ferramentas`) e `src/lib/ia/ferramentas-*`;
// - o jeito = o texto de instrução do agente, em `src/lib/ia/chat/agentes.ts`
//   e `src/lib/societario/assistente.ts`: no BPO, no Fiscal e no DP ela só lê;
//   no Societário e no Recrutamento ela sugere, e a sugestão vira um cartão
//   que uma pessoa aprova ou recusa (`propor_*`, `rotulosDaDecisao` e
//   `descreverProposta`, em `src/lib/ia/chat/regras.ts`);
// - a pergunta é uma das sugestões do próprio chat (`CONFIGS`, em agentes.ts),
//   às vezes com a empresa junto; a resposta segue o jeito de falar de
//   `src/lib/ia/ligia.ts` — cada exemplo é a primeira resposta de uma
//   conversa, então ela cumprimenta pelo primeiro nome ("Oi, Camila!").
//
// Empresas, pessoas, valores e datas são inventados — as mesmas empresas das
// telas de exemplo do login e do portal, para uma cena não desmentir a outra.
//
// No Portal do Cliente a Lígia ainda NÃO existe (ligia.ts: "no futuro, no
// portal do cliente"): o item entra marcado "Em breve", sem conversa. Mudou um
// agente, muda aqui.

export type ChaveDaConversa = "bpo" | "fiscal" | "dp" | "societario" | "recrutamento" | "portal";

export type ConversaDaLigia = {
  chave: ChaveDaConversa;
  /** O setor como embaixo do nome dela no chat (`especialidadeDoAgente`) — "BPO", "Departamento Pessoal". */
  setor: string;
  /** A cor do setor, a mesma do menu do Connect (`--c41-sector-*`). */
  cor: string;
  /** Uma linha, embaixo do nome do setor na lista. */
  resumo: string;
  /** Ainda não existe: sem conversa, com o aviso no lugar. */
  emBreve?: true;
  /** O que ela consulta neste setor — as ferramentas do agente, em português. */
  consulta: string[];
  /** Como ela age aqui: só lê, ou sugere e uma pessoa confirma. */
  jeito: string;
  pergunta?: string;
  resposta?: { texto: string; itens?: string[]; fecho?: string };
  /** O cartão de sugestão do chat, com os botões do agente. */
  proposta?: { texto: string; nao: string; sim: string };
  /** O link da tela com que ela termina a resposta, para a pessoa conferir. */
  link?: string;
};

export const CONVERSAS_DA_LIGIA: ConversaDaLigia[] = [
  {
    chave: "bpo",
    setor: "BPO",
    cor: "var(--c41-sector-bpo)",
    resumo: "Contas, DRE, pendências e aprovações dos clientes",
    consulta: [
      "Contas a pagar e a receber",
      "DRE do mês",
      "Pendências com o cliente",
      "Conciliação bancária",
      "Aprovações do cliente",
    ],
    jeito: "Só consulta. Baixar, conciliar, aprovar e cobrar continuam nas telas, com a equipe.",
    pergunta: "O que está vencido nas contas a pagar da Padaria Bom Grão?",
    resposta: {
      texto: "Oi, Camila! Consultei as contas a pagar da Padaria Bom Grão: são 2 vencidas, somando R$ 1.734,90.",
      itens: ["Gás Rápido Distribuidora — R$ 640,00, venceu em 16/10", "Distribuidora Trigo Fino — R$ 1.094,90, venceu em 14/10"],
      fecho: "Tem também 1 conta esperando a aprovação do cliente: a baixa fica travada até ele decidir.",
    },
    link: "Abrir as contas vencidas",
  },
  {
    chave: "fiscal",
    setor: "Fiscal",
    cor: "var(--c41-sector-fiscal)",
    resumo: "As notas fiscais de cada empresa, mês a mês",
    consulta: [
      "NF-e, NFC-e, CT-e e NFS-e da empresa",
      "Emitidas e recebidas no mês",
      "Pendentes de lançamento",
      "Canceladas e com XML incompleto",
    ],
    jeito: "Só consulta. Lançar ou ignorar um documento é na tela de documentos fiscais.",
    pergunta: "Resumo fiscal de setembro da Transportes Modelo",
    resposta: {
      texto: "Oi, Bruno! Em setembro de 2026, a Transportes Modelo:",
      itens: [
        "emitiu 112 CT-e e 38 NF-e, 2 delas canceladas",
        "recebeu 54 NF-e e 9 NFS-e",
        "tem 6 notas ainda pendentes de lançamento no financeiro",
        "tem 1 NF-e com o XML incompleto",
      ],
    },
    link: "Abrir os documentos de setembro",
  },
  {
    chave: "dp",
    setor: "Departamento Pessoal",
    cor: "var(--c41-sector-dprh)",
    resumo: "Férias, afastamentos, rescisões e horas extras",
    consulta: [
      "Colaboradores por situação",
      "Férias perto de vencer",
      "Rescisões e o prazo de pagamento",
      "Afastamentos em aberto",
      "Horas extras fora da folha",
    ],
    jeito: "Só consulta. Salário e dado médico só entram na resposta para quem tem essa permissão.",
    pergunta: "Quais férias estão perto de vencer?",
    resposta: {
      texto: "Oi, Marina! Encontrei 2 férias que vencem nos próximos 30 dias:",
      itens: ["Juliana Prado, da Padaria Bom Grão — vence em 12 dias", "Rafael Lima, da Transportes Modelo — vence em 26 dias"],
      fecho: "Férias vencidas são pagas em dobro, então vale programar a da Juliana primeiro.",
    },
    link: "Abrir as férias",
  },
  {
    chave: "societario",
    setor: "Societário",
    cor: "var(--c41-sector-societario)",
    resumo: "A fila de processos e o que dá para destravar",
    consulta: ["Processos abertos e a situação de cada um", "Etapas, checklist e protocolos", "Exigências em aberto"],
    jeito:
      "Sugere concluir ou dispensar uma etapa, e só vale depois do “Sim, aplicar” do coordenador. Etapa de órgão, não: essa se encerra pelo protocolo.",
    pergunta: "O que dá para destravar hoje?",
    resposta: {
      texto:
        "Oi, Paulo! Olhei a fila: a alteração contratual da Padaria Bom Grão está parada há 9 dias na etapa “Assinatura dos sócios”, e o checklist dela já está completo.",
    },
    proposta: { texto: "Concluir a etapa “Assinatura dos sócios” — checklist completo", nao: "Não, cancelar", sim: "Sim, aplicar" },
  },
  {
    chave: "recrutamento",
    setor: "Recrutamento",
    cor: "var(--c41-sector-recrutamento)",
    resumo: "Vagas, candidatos e o funil de cada vaga",
    consulta: ["Vagas abertas e há quanto tempo", "Candidatos de cada etapa", "Nota e resumo da triagem", "Fichas de entrevista"],
    jeito:
      "Sugere mover ou encerrar uma candidatura, e o recrutador aprova. A nota da triagem é indício, nunca motivo para reprovar alguém.",
    pergunta: "Quem chegou esta semana e ainda não foi triado?",
    resposta: {
      texto:
        "Oi, Letícia! Na vaga de Assistente Fiscal chegaram 7 candidatos esta semana, e 3 ainda estão sem a nota da triagem. Dos já triados, a Ana Ribeiro teve 86 de 100 — vale como indício, não como veredito.",
    },
    proposta: { texto: "Mover Ana Ribeiro para Entrevista", nao: "Recusar", sim: "Aprovar" },
  },
  {
    chave: "portal",
    setor: "Portal do Cliente",
    cor: "var(--c41-brand)",
    resumo: "Para o cliente do escritório",
    emBreve: true,
    consulta: [],
    jeito:
      "A Lígia ainda não atende no Portal do Cliente. Hoje ela trabalha com a equipe do escritório, dentro do Connect. A ideia é que ela também atenda o cliente no portal — quando estiver pronta, ela aparece por lá.",
  },
];

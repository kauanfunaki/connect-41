// O conteúdo da ajuda do portal (01/10): como o cliente faz cada coisa.
//
// Escrito a partir das telas como estão hoje — os nomes dos botões são os que
// o cliente vê. Quando uma tela mudar, o passo muda junto.
//
// Cada passo (e cada linha dele) pode depender de módulos: o cliente só lê
// sobre o que existe no menu dele. O portal é de todos os setores, então o
// texto fala de "a equipe da 41", nunca de um setor.

export type IconeDoPasso =
  | "celular"
  | "solicitacao"
  | "comunicado"
  | "sino"
  | "empresas"
  | "pendencia"
  | "aprovar"
  | "conversa"
  | "processo"
  | "financeiro"
  | "documentos"
  | "senha";

type Linha = string | { texto: string; modulos: readonly string[] };

type PassoDoCatalogo = {
  chave: string;
  titulo: string;
  resumo: string;
  icone: IconeDoPasso;
  /** Aparece se ao menos um destes módulos estiver ligado; sem a lista, sempre. */
  modulos?: readonly string[];
  /** Some se algum destes estiver ligado — a tela do passo foi substituída. */
  semModulos?: readonly string[];
  /** Só para quem tem mais de uma empresa no acesso. */
  soComVariasEmpresas?: boolean;
  passos: readonly Linha[];
};

export type PassoDoPortal = { chave: string; titulo: string; resumo: string; icone: IconeDoPasso; passos: string[] };

const FINANCEIRO = ["bpo_contas_pagar", "bpo_contas_receber", "bpo_fluxo_caixa", "bpo_dre", "bpo_cobranca"] as const;

const CATALOGO: readonly PassoDoCatalogo[] = [
  {
    chave: "instalar",
    titulo: "Instalar o portal no celular",
    resumo: "Um ícone na tela inicial, que abre o portal em tela cheia.",
    icone: "celular",
    passos: [
      "No Android, abra o portal no Chrome, toque no menu ⋮ e escolha \"Instalar app\" ou \"Adicionar à tela inicial\".",
      "No iPhone, abra o portal no Safari, toque em Compartilhar e escolha \"Adicionar à Tela de Início\".",
      "Depois, abra o portal pelo ícone novo, como qualquer aplicativo.",
    ],
  },
  {
    chave: "avisos",
    titulo: "Receber avisos no celular",
    resumo: "Para saber na hora quando a equipe precisar de você.",
    icone: "sino",
    passos: [
      "Na tela Documentos fiscais, no quadro \"Notificações no navegador\", clique em Ativar.",
      "Quando o navegador perguntar, permita as notificações.",
      "No iPhone, os avisos só chegam com o portal instalado na tela de início.",
      "O aviso diz só que há algo novo, nunca o valor ou o conteúdo. O detalhe fica aqui dentro do portal.",
    ],
  },
  {
    chave: "solicitacao",
    titulo: "Pedir algo ao escritório",
    resumo: "Documento, alteração ou qualquer outra coisa, com número e prazo de resposta.",
    icone: "solicitacao",
    modulos: ["portal_solicitacoes"],
    passos: [
      "Abra Solicitações e clique em Nova solicitação.",
      "Escolha a empresa, se tiver mais de uma, e o assunto. Cada assunto mostra em quantos dias úteis a equipe responde.",
      "Conte o que você precisa, anexe os arquivos e clique em Enviar solicitação.",
      "A solicitação ganha um número, e você é avisado por e-mail quando a equipe responder. A conversa continua ali mesmo.",
      "Quando a equipe precisar de algo seu, a solicitação fica como \"Aguardando você\". Se não precisar mais, use Cancelar solicitação.",
    ],
  },
  {
    chave: "comunicado",
    titulo: "Ler os comunicados do escritório",
    resumo: "Recesso, mudança de prazo, orientação: os avisos que o escritório manda para todos.",
    icone: "comunicado",
    modulos: ["portal_solicitacoes"],
    passos: [
      "Quando o escritório manda um comunicado, você recebe um e-mail e o aviso aparece no topo do portal.",
      "Abra Comunicados. Os que você ainda não leu aparecem destacados, com a etiqueta Novo.",
      "Clique para ler o texto inteiro e baixar os anexos.",
      "Dúvida sobre um comunicado? Abra uma solicitação.",
    ],
  },
  {
    chave: "pendencia",
    titulo: "Responder um pedido da equipe",
    resumo: "Quando a equipe precisa de um documento ou de uma informação sua.",
    icone: "pendencia",
    // Com o canal do portal ligado, qualquer setor pede (01/10).
    modulos: ["bpo_pendencias", "portal_solicitacoes"],
    passos: [
      "Abra Pendências. Os pedidos que esperam você aparecem como \"Aguardando cliente\", com o prazo.",
      "Clique no pedido para ver o que a equipe precisa.",
      "Escreva em Mensagem, anexe os arquivos em Anexos e clique em Enviar resposta.",
      "A equipe é avisada na hora. O pedido fica como Respondida até a equipe dar como resolvido.",
      "Se o prazo passar sem resposta, você recebe um lembrete.",
    ],
  },
  {
    chave: "aprovar",
    titulo: "Aprovar ou reprovar um pagamento",
    resumo: "A conta que espera o seu \"pode pagar\" só é paga depois da sua aprovação.",
    icone: "aprovar",
    modulos: ["bpo_aprovacoes"],
    passos: [
      "Abra Aprovações para ver as contas que esperam você.",
      "Clique em Aprovar na conta, ou marque várias e clique em Aprovar selecionadas.",
      "\"Marcar todas dentro do meu teto\" seleciona de uma vez as contas que você pode aprovar.",
      "Uma conta \"Fora do teto\" passa do valor que você pode aprovar e precisa de alguém da sua empresa com teto maior.",
      "Para reprovar, clique em Reprovar e escreva o motivo. Ele vai para quem lançou a conta.",
    ],
  },
  {
    chave: "conversa",
    titulo: "Mandar uma mensagem ou um arquivo para a equipe",
    resumo: "Sem esperar um pedido: o extrato do mês, uma dúvida, um aviso.",
    icone: "conversa",
    modulos: ["bpo_comunicacao"],
    semModulos: ["portal_solicitacoes"],
    passos: [
      "Abra Conversa e escolha a empresa, se tiver mais de uma.",
      "Escreva em Mensagem e, se quiser, anexe arquivos em Anexos.",
      "Clique em Enviar mensagem. A equipe é avisada na hora e responde aqui mesmo.",
    ],
  },
  {
    chave: "processo",
    titulo: "Acompanhar um processo da sua empresa",
    resumo: "Abertura, alteração, baixa e licenças, etapa por etapa.",
    icone: "processo",
    modulos: ["societario_processos"],
    passos: [
      "Abra Processos e clique no processo.",
      "Em Etapas, veja o que já foi feito, o que falta e a previsão.",
      "Em Documentos, descreva e anexe o que a equipe pediu e clique em Guardar documentos.",
      "Em Conversa com a equipe, escreva e clique em Enviar mensagem.",
      "Em Exigências ficam os ajustes que os órgãos pediram nos processos das suas empresas.",
    ],
  },
  {
    chave: "financeiro",
    titulo: "Acompanhar o financeiro das suas empresas",
    resumo: "Contas, fluxo de caixa e DRE, lançados pela equipe do escritório.",
    icone: "financeiro",
    modulos: FINANCEIRO,
    passos: [
      { texto: "Contas a pagar e Contas a receber mostram o que vence e a situação de cada conta.", modulos: ["bpo_contas_pagar", "bpo_contas_receber"] },
      { texto: "Fluxo de caixa mostra o que entrou e saiu nos últimos seis meses e o que vence daqui para frente.", modulos: ["bpo_fluxo_caixa"] },
      { texto: "Relatório mostra o mês consolidado por empresa.", modulos: ["bpo_fluxo_caixa"] },
      { texto: "A DRE mostra o resultado de cada empresa, mês a mês.", modulos: ["bpo_dre"] },
      { texto: "Cobrança mostra quem está devendo às suas empresas, o andamento da cobrança e os acordos.", modulos: ["bpo_cobranca"] },
      "Essas telas são para consulta. Se algum número parecer errado, fale com a equipe.",
    ],
  },
  {
    chave: "documentos",
    titulo: "Consultar os documentos fiscais",
    resumo: "As notas emitidas e recebidas pelas suas empresas.",
    icone: "documentos",
    passos: [
      "Abra Documentos fiscais, a primeira tela do portal.",
      "Escolha o mês em Competência para ver só as notas dele.",
      "Se faltar alguma nota que você esperava ver, fale com a equipe.",
    ],
  },
  {
    chave: "empresa",
    titulo: "Trocar de empresa",
    resumo: "Quem tem mais de uma empresa escolhe qual quer ver.",
    icone: "empresas",
    soComVariasEmpresas: true,
    passos: [
      "Nas telas que mostram uma empresa por vez, use o campo de empresa no topo.",
      "Digite parte do nome para achar a empresa mais rápido.",
    ],
  },
  {
    chave: "senha",
    titulo: "Esqueci minha senha",
    resumo: "Uma senha nova pelo e-mail, sem precisar falar com ninguém.",
    icone: "senha",
    passos: [
      "Na tela de entrada do portal, clique em Esqueci minha senha.",
      "Digite o seu e-mail e abra o link que chega na sua caixa de entrada.",
      "Escolha a senha nova e entre de novo.",
    ],
  },
];

function algumLigado(modulos: ReadonlySet<string>, exigidos: readonly string[] | undefined): boolean {
  return !exigidos || exigidos.some((m) => modulos.has(m));
}

/** Os passos que valem para este cliente: só o que está no menu dele. */
export function passosDoPortal(modulos: ReadonlySet<string>, opcoes: { variasEmpresas: boolean }): PassoDoPortal[] {
  return CATALOGO.filter(
    (p) =>
      algumLigado(modulos, p.modulos) &&
      !(p.semModulos ?? []).some((m) => modulos.has(m)) &&
      (!p.soComVariasEmpresas || opcoes.variasEmpresas)
  ).map((p) => ({
    chave: p.chave,
    titulo: p.titulo,
    resumo: p.resumo,
    icone: p.icone,
    passos: p.passos.flatMap((l) => (typeof l === "string" ? [l] : algumLigado(modulos, l.modulos) ? [l.texto] : [])),
  }));
}

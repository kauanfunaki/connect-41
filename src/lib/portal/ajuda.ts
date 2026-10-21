// O conteúdo da ajuda do portal (01/10): como o cliente faz cada coisa.
//
// Escrito a partir das telas como estão hoje — os nomes dos botões são os que
// o cliente vê. Quando uma tela mudar, o passo muda junto.
//
// Cada passo (e cada linha dele) pode depender de módulos: o cliente só lê
// sobre o que existe no menu dele. O portal é de todos os setores, então o
// texto fala de "a equipe da 41", nunca de um setor.
//
// E das telas (14/10/2026): o escritório pode bloquear uma tela que ainda não
// liberou, e o passo que ensina a usar só ela some junto (`telas`).

import { videoDoPassoDoPortal } from "@/lib/ajuda/videos";

export type IconeDoPasso =
  | "entrar"
  | "inicio"
  | "celular"
  | "solicitacao"
  | "comunicado"
  | "envio"
  | "arquivos"
  | "sino"
  | "empresas"
  | "pendencia"
  | "aprovar"
  | "conversa"
  | "processo"
  | "financeiro"
  | "documentos"
  | "conta"
  | "senha"
  | "ceci";

/**
 * `telas`: as telas de que a linha (ou o passo) fala. Some quando **todas**
 * estão bloqueadas pelo escritório — sem a lista, nunca some por bloqueio.
 */
type Linha = string | { texto: string; modulos?: readonly string[]; telas?: readonly string[] };

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
  /** Só para quem tem a Ceci no portal (21/10/2026) — o escritório liga por empresa. */
  soComCeci?: boolean;
  /** As telas que o passo ensina a usar: com todas bloqueadas, ele some (14/10/2026). */
  telas?: readonly string[];
  passos: readonly Linha[];
};

export type PassoDoPortal = { chave: string; titulo: string; resumo: string; icone: IconeDoPasso; passos: string[]; video?: string };

const FINANCEIRO = ["bpo_contas_pagar", "bpo_contas_receber", "bpo_fluxo_caixa", "bpo_dre", "bpo_cobranca"] as const;
const TELAS_DO_FINANCEIRO = [
  "/portal/pagar",
  "/portal/receber",
  "/portal/fluxo-de-caixa",
  "/portal/relatorios",
  "/portal/dre",
  "/portal/cobranca",
] as const;

const CATALOGO: readonly PassoDoCatalogo[] = [
  // Passo de 05/10/2026: o primeiro vídeo da série é o primeiro acesso, e a
  // ajuda não tinha o texto dele. O acesso nasce sem senha (`criarAcessoDoPortal`):
  // o cliente escolhe a dele pelo link do e-mail.
  {
    chave: "entrar",
    titulo: "Entrar no portal",
    resumo: "O primeiro acesso, com uma senha que só você sabe.",
    icone: "entrar",
    passos: [
      "Quando o escritório libera o seu acesso, chega um e-mail com o botão Redefinir senha. Clique nele.",
      "Escolha a sua senha, com ao menos 8 caracteres, repita em Confirme a senha e clique em Salvar senha.",
      "Clique em Entrar no portal, digite o seu e-mail e a senha e clique em Entrar. Marque Lembrar de mim para não precisar entrar de novo por 30 dias neste aparelho.",
      "Se o seu e-mail tem acesso a mais de um cliente, escolha em qual você quer entrar.",
      "O link do e-mail vale por uma hora. Se ele vencer, use Esqueci minha senha na tela de entrada.",
    ],
  },
  {
    // O Início é a primeira tela desde 05/10 (antes era Documentos fiscais).
    chave: "inicio",
    titulo: "Ver o que espera por você",
    resumo: "O Início mostra o que a equipe precisa de você e o resumo das suas empresas.",
    icone: "inicio",
    passos: [
      "Ao entrar no portal, você chega ao Início. Para voltar a ele, clique em Início no menu ou no logo.",
      "Em \"O que precisa de você\" aparece o que espera a sua resposta ou aprovação, com o número e um botão que leva direto à tela.",
      "Quando não há nada esperando, aparece \"Nada esperando por você\".",
      {
        texto: "Em Financeiro, veja as contas a pagar vencidas, as que vencem nesta semana e o que está em atraso para receber.",
        modulos: ["bpo_contas_pagar", "bpo_contas_receber", "bpo_cobranca"],
        telas: ["/portal/pagar", "/portal/receber", "/portal/cobranca"],
      },
      {
        texto: "Em Processos em andamento, veja em que pé estão os processos mais recentes das suas empresas.",
        modulos: ["societario_processos"],
        telas: ["/portal/processos"],
      },
      { texto: "Nos Atalhos ficam os caminhos mais usados, como os documentos fiscais e esta ajuda.", telas: ["/portal/documentos"] },
    ],
  },
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
      "No Início, no quadro \"Notificações no navegador\", no fim da tela, clique em Ativar.",
      "Quando o navegador perguntar, permita as notificações.",
      "No iPhone, os avisos só chegam com o portal instalado na tela de início.",
      "O aviso diz só que há algo novo, nunca o valor ou o conteúdo. O detalhe fica aqui dentro do portal.",
    ],
  },
  // A Ceci no portal (21/10/2026): só para quem a tem — o escritório liga por
  // empresa, no piloto. Os nomes são os da tela (`CeciDoPortal`): "Revisar e
  // enviar", o "+" de nova conversa. O limite do dia vem de quem chama, para
  // o texto dizer o número que vale (`{perguntas}`).
  {
    chave: "ceci",
    titulo: "Perguntar à Ceci",
    resumo: "A assistente do escritório responde sobre as suas empresas e prepara as suas solicitações.",
    icone: "ceci",
    soComCeci: true,
    passos: [
      "Clique na Ceci, no canto de baixo da tela, para abrir o chat. Ela aparece em todas as telas do portal.",
      "Escreva a sua pergunta e aperte Enter, ou toque numa das sugestões. Por exemplo: \"O que vence esta semana?\", \"Tenho alguma pendência?\" ou \"Em que pé está a alteração do contrato?\".",
      "A Ceci consulta o que o portal já mostra das suas empresas: pendências, contas a pagar e a receber, processos, notas fiscais e solicitações. Quando a resposta tem uma tela, aparece um botão para abri-la.",
      {
        texto: "Quando você precisa de algo da equipe, a Ceci prepara uma solicitação. Clique em Revisar e enviar: a tela de Nova solicitação abre preenchida. Confira, ajuste o que quiser e clique em Enviar solicitação.",
        modulos: ["portal_solicitacoes"],
        telas: ["/portal/solicitacoes"],
      },
      "A Ceci só consulta. Ela não envia nada sozinha, não paga, não aprova, não responde pendência e não muda cadastro.",
      "Ela é uma inteligência artificial e pode errar. Antes de decidir algo importante, confira na tela ou fale com a equipe.",
      "Cada acesso faz até {perguntas} perguntas por dia. Para começar outra conversa, clique em + no topo do chat.",
    ],
  },
  {
    chave: "solicitacao",
    titulo: "Pedir algo ao escritório",
    resumo: "Documento, alteração ou qualquer outra coisa, com número e prazo de resposta.",
    icone: "solicitacao",
    modulos: ["portal_solicitacoes"],
    telas: ["/portal/solicitacoes"],
    passos: [
      "Abra Solicitações e clique em Nova solicitação.",
      "Escolha a empresa, se tiver mais de uma, e o assunto. Cada assunto mostra em quantos dias úteis a equipe responde.",
      "Conte o que você precisa, anexe os arquivos e clique em Enviar solicitação.",
      "A solicitação ganha um número, e você é avisado por e-mail quando a equipe responder. A conversa continua ali mesmo.",
      "Quando a equipe precisar de algo seu, a solicitação fica como \"Aguardando você\". Se não precisar mais, use Cancelar solicitação.",
    ],
  },
  {
    chave: "sugestao",
    titulo: "Mandar uma sugestão ou avisar de um problema no portal",
    resumo: "Uma ideia, ou algo que não funcionou: vai direto para a equipe que cuida do portal.",
    icone: "solicitacao",
    modulos: ["portal_solicitacoes"],
    telas: ["/portal/solicitacoes"],
    passos: [
      "No rodapé do menu, clique em Sugestão ou problema.",
      "Dê uma nota de 1 a 5 para o portal e conte o que aconteceu ou o que você sugere. A equipe recebe junto a tela em que você estava.",
      "Clique em Enviar. A mensagem vira uma solicitação, com número, e a resposta chega por ela, em Solicitações.",
    ],
  },
  {
    chave: "comunicado",
    titulo: "Ler os comunicados do escritório",
    resumo: "Recesso, mudança de prazo, orientação: os avisos que o escritório manda para todos.",
    icone: "comunicado",
    modulos: ["portal_solicitacoes"],
    telas: ["/portal/comunicados"],
    passos: [
      "Quando o escritório manda um comunicado, você recebe um e-mail e o aviso aparece no Início, em \"O que precisa de você\".",
      "Abra Comunicados. Os que você ainda não leu aparecem destacados, com a etiqueta Novo.",
      "Clique para ler o texto inteiro e baixar os anexos.",
      { texto: "Dúvida sobre um comunicado? Abra uma solicitação.", telas: ["/portal/solicitacoes"] },
    ],
  },
  // Os envios ao cliente no portal (08/10/2026): até então só chegavam pelo
  // link do e-mail, que segue valendo para quem não tem portal.
  {
    chave: "envio",
    titulo: "Ler e aceitar um documento do escritório",
    resumo: "Guia, contrato, orientação: o documento que o escritório manda para as suas empresas, com o aceite quando pedido.",
    icone: "envio",
    modulos: ["portal_solicitacoes"],
    telas: ["/portal/envios"],
    passos: [
      "Abra Documentos do escritório. Os que você ainda não abriu aparecem destacados, com a etiqueta Novo.",
      "Clique no documento para ler o texto. Se houver anexo, clique em Baixar anexo.",
      "Quando o documento pede o seu aceite, ele aparece no Início, em \"O que precisa de você\". Confira o Nome completo, marque \"Li e concordo\" e clique em Assinar documento.",
      "Ficam registrados o seu nome, a data e a hora. Basta um aceite por documento: depois dele, a tela mostra quem aceitou e quando.",
      "Se o documento também chegou por e-mail, o link do e-mail abre o mesmo documento.",
    ],
  },
  {
    chave: "arquivos",
    titulo: "Ver as pastas do escritório e mandar arquivos",
    resumo: "As pastas que o escritório compartilhou com você, e onde você manda os seus arquivos para a equipe.",
    icone: "arquivos",
    modulos: ["arquivos"],
    telas: ["/portal/arquivos"],
    passos: [
      "Abra Arquivos. Se você tem mais de uma empresa, escolha a empresa no topo.",
      "Clique numa pasta para ver o que tem dentro. PDF e imagem abrem no navegador; os outros arquivos são baixados.",
      "Para mandar arquivos ao escritório, clique em Enviar arquivos, arraste os arquivos ou clique para escolher, e depois em Enviar. Eles vão para a pasta Enviados pelo cliente, e a equipe é avisada.",
      "Cada arquivo pode ter até 10 MB. Vale PDF, imagem, XML, Word, Excel, ZIP e texto (TXT, CSV, OFX).",
    ],
  },
  {
    chave: "pendencia",
    titulo: "Responder um pedido da equipe",
    resumo: "Quando a equipe precisa de um documento ou de uma informação sua.",
    icone: "pendencia",
    // Com o canal do portal ligado, qualquer setor pede (01/10).
    modulos: ["bpo_pendencias", "portal_solicitacoes"],
    telas: ["/portal/pendencias"],
    passos: [
      "Abra Pendências, ou clique em Responder no Início. Os pedidos que esperam você aparecem como \"Aguardando você\", com o prazo.",
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
    telas: ["/portal/aprovacoes"],
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
    telas: ["/portal/comunicacao"],
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
    telas: ["/portal/processos"],
    passos: [
      "Abra Processos e clique no processo.",
      "Em Etapas, veja o que já foi feito, o que falta e a previsão.",
      "Em Documentos, descreva e anexe o que a equipe pediu e clique em Guardar documentos.",
      "Em Conversa com a equipe, escreva e clique em Enviar mensagem.",
      { texto: "Em Exigências ficam os ajustes que os órgãos pediram nos processos das suas empresas.", telas: ["/portal/exigencias"] },
    ],
  },
  {
    chave: "financeiro",
    titulo: "Acompanhar o financeiro das suas empresas",
    resumo: "Contas, fluxo de caixa e DRE, lançados pela equipe do escritório.",
    icone: "financeiro",
    modulos: FINANCEIRO,
    telas: TELAS_DO_FINANCEIRO,
    passos: [
      {
        texto: "Contas a pagar e Contas a receber mostram o que vence e a situação de cada conta.",
        modulos: ["bpo_contas_pagar", "bpo_contas_receber"],
        telas: ["/portal/pagar", "/portal/receber"],
      },
      {
        texto: "Fluxo de caixa mostra o que entrou e saiu nos últimos seis meses e o que vence daqui para frente.",
        modulos: ["bpo_fluxo_caixa"],
        telas: ["/portal/fluxo-de-caixa"],
      },
      { texto: "Relatório mostra o mês consolidado por empresa.", modulos: ["bpo_fluxo_caixa"], telas: ["/portal/relatorios"] },
      {
        texto: "A DRE mostra o resultado de cada empresa, mês a mês. Para ver os doze meses lado a lado, abra o campo do mês e escolha “Ano inteiro”.",
        modulos: ["bpo_dre"],
        telas: ["/portal/dre"],
      },
      {
        texto: "Cobrança mostra quem está devendo às suas empresas, o andamento da cobrança e os acordos.",
        modulos: ["bpo_cobranca"],
        telas: ["/portal/cobranca"],
      },
      "Essas telas são para consulta. Se algum número parecer errado, fale com a equipe.",
    ],
  },
  {
    chave: "documentos",
    titulo: "Consultar os documentos fiscais",
    resumo: "As notas emitidas e recebidas pelas suas empresas.",
    icone: "documentos",
    telas: ["/portal/documentos"],
    passos: [
      "Abra Documentos fiscais no menu, ou clique em \"Ver documentos fiscais\" nos Atalhos do Início.",
      "Em Filtros, escolha o mês em Competência para ver só as notas dele. Quem tem mais de uma empresa também escolhe a Empresa.",
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
  // Minha conta (08/10/2026, 12A da página de decisões): a troca de senha
  // logado, as empresas do acesso e o tema.
  {
    chave: "conta",
    titulo: "Trocar a senha e o tema",
    resumo: "Em Minha conta: a sua senha, as empresas do seu acesso e o tema claro ou escuro.",
    icone: "conta",
    passos: [
      "No menu, clique em Minha conta, logo acima de Ajuda e Sair.",
      "Em Senha, digite a senha atual e a nova, com ao menos 8 caracteres. Repita a nova em Confirme a nova senha e clique em Salvar senha.",
      "Entra com o Google e nunca criou uma senha, ou esqueceu a atual? Clique em Enviar link para criar senha e abra o link que chega no seu e-mail.",
      "Em Empresas, veja as empresas que o seu acesso enxerga. Para incluir ou tirar uma, fale com o escritório.",
      "Em Tema, escolha Do aparelho, Claro ou Escuro. Do aparelho segue o tema do seu celular ou computador.",
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

/** Todas as chaves de passo, ligadas ou não — para conferir os vídeos (`ajuda/videos.ts`). */
export const CHAVES_DOS_PASSOS: readonly string[] = CATALOGO.map((p) => p.chave);

function algumLigado(modulos: ReadonlySet<string>, exigidos: readonly string[] | undefined): boolean {
  return !exigidos || exigidos.some((m) => modulos.has(m));
}

/** Alguma das telas segue liberada — sem lista, sim. */
function algumaLiberada(bloqueadas: ReadonlySet<string>, telas: readonly string[] | undefined): boolean {
  return !telas || telas.some((t) => !bloqueadas.has(t));
}

/**
 * Os passos que valem para este cliente: só o que está no menu dele — os
 * módulos ligados, menos as telas que o escritório bloqueou (14/10/2026).
 */
export function passosDoPortal(
  modulos: ReadonlySet<string>,
  opcoes: {
    variasEmpresas: boolean;
    bloqueadas?: ReadonlySet<string>;
    /** A Ceci aparece para este acesso, e quantas perguntas por dia (21/10/2026). Sem isto, o passo dela some. */
    ceci?: { perguntasPorDia: number } | null;
  }
): PassoDoPortal[] {
  const bloqueadas = opcoes.bloqueadas ?? new Set<string>();
  const ceci = opcoes.ceci ?? null;
  return CATALOGO.filter(
    (p) =>
      algumLigado(modulos, p.modulos) &&
      !(p.semModulos ?? []).some((m) => modulos.has(m)) &&
      (!p.soComVariasEmpresas || opcoes.variasEmpresas) &&
      (!p.soComCeci || ceci !== null) &&
      algumaLiberada(bloqueadas, p.telas)
  ).map((p) => ({
    chave: p.chave,
    titulo: p.titulo,
    resumo: p.resumo,
    icone: p.icone,
    passos: p.passos
      .flatMap((l) => (typeof l === "string" ? [l] : algumLigado(modulos, l.modulos) && algumaLiberada(bloqueadas, l.telas) ? [l.texto] : []))
      .map((l) => (ceci ? l.replace("{perguntas}", String(ceci.perguntasPorDia)) : l)),
    // O vídeo vem do arquivo dos links (05/10), e só quando já foi colado.
    video: videoDoPassoDoPortal(p.chave) ?? undefined,
  }));
}

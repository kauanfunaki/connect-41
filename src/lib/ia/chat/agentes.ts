// Quais agentes atendem no chat do canto da tela, e para quem.
//
// Cada agente do chat é um agente do catálogo (`src/lib/ia/catalogo.ts`) — com
// o mesmo teto, a mesma chave e a mesma trilha — mais o que só o chat precisa:
// o prompt, as sugestões de pergunta e **quem pode abrir**.
//
// A regra de acesso é a da tela do setor, conferida no servidor: a IA só
// enxerga o que a pessoa enxerga. Um agente de chat é uma segunda porta para
// os dados, e porta sem essa checagem vaza.

import { getPrisma } from "@/lib/prisma";
import { canActOnSector, canViewSector, isFullWrite, type AuthContext } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { agenteDoCatalogo } from "@/lib/ia/catalogo";
import { estadoDosAgentes } from "@/lib/ia/data";
import { SISTEMA_DO_SOCIETARIO } from "@/lib/societario/assistente";
import { nomeExibicao } from "@/lib/companyName";
import { publicoPermite, type ContextoDaTela, type PropostaGravada, type SetorDoEncaminhamento } from "./regras";
import { MODULOS_DO_BPO } from "@/lib/ia/ferramentas-bpo";
import { MODULOS_DO_DP } from "@/lib/ia/ferramentas-dp";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { acessoDoRecrutador, podeAgirNaVaga } from "@/lib/recrutamento/acessoVagas";
import { recorteDaGestao } from "@/lib/gestao/regras";
import { MODULO_GESTAO } from "@/lib/gestao/acesso";
import { setoresDaEquipe } from "./citacoes";
import { nomeDaTela, rotuloDaTela } from "./telas";
import {
  apresentacaoDaCeci,
  cumprimentoDaCeci,
  especialidadeDoAgente,
  NOME_DA_ASSISTENTE,
  primeiroNomeParaOPrompt,
} from "@/lib/ia/ceci";

export type AgenteDoChat = {
  code: string;
  /**
   * O que a Ceci atende neste agente, escrito embaixo do nome dela no chat
   * ("BPO", "Departamento Pessoal"). Até 13/10/2026 era o `titulo` "IA do BPO" — cada
   * setor com o seu nome; agora o nome é um só (`src/lib/ia/ceci.ts`).
   */
  especialidade: string;
  sugestoes: string[];
  /** O setor que a pessoa precisa operar — `null` na Ajuda, que serve a todos. */
  setor: string | null;
  /**
   * É a Ceci do setor que a pessoa está usando agora? Só ela dá as boas-vindas
   * depois do login (13/10/2026 — `boasVindas.ts`).
   */
  doSetorAtivo: boolean;
};

type Config = {
  code: string;
  sugestoes: string[];
  /** Módulo cujo setor decide o acesso (segue a transferência de módulo). */
  modulo: string | null;
  sistema: string;
};

// Endurecida pela bateria de testes de 25/09 (Projects/Connect-41/
// Plano-de-Testes-Chat-IA-2026-09-25): a IA do Fiscal respondeu "não há
// vencidos nas contas a pagar" a partir de dados de nota fiscal (falso), a
// Ajuda encaminhou pergunta para ela mesma, e respostas vazaram nome de campo
// ("liberadaAgora") e id de etapa.
//
// Reescrita em 13/10/2026 (pedido do Kauan: respostas longas sem destaque nem
// estrutura, "SEM_PRAZO" e "Link: /pendencias…" na tela). O chat agora
// desenha Markdown (`src/lib/ia/chat/markdown.ts`): a resposta começa por um
// resumo de uma linha, os itens vêm em lista com o principal em negrito, e o
// link da ferramenta — que já chega como [rótulo](/caminho) — vira botão.
const GUARDA_DO_CHAT =
  "\n\nVocê está no chat do canto da tela do Connect, conversando com uma pessoa da equipe do escritório — gente " +
  "de contabilidade, não de tecnologia. A tela mostra Markdown simples. Como escrever:\n" +
  "- Comece com UMA linha de resumo, com os números que importam em negrito. Ex.: \"**3 pendências** esperando o " +
  "cliente, **2 vencidas**.\" Nada de introdução (\"Segue…\", \"Aqui estão…\") nem de repetir a pergunta.\n" +
  "- Depois, os itens em lista, uma linha curta por item começando com \"- \": o nome do item em negrito e, em " +
  "seguida, só o que importa (empresa, valor, prazo), separado por \" — \". Ex.: \"- **Confirmar o pagamento do " +
  "aluguel** — Transportes Modelo — venceu em 12/09/2026\". O mais urgente primeiro (vencido, vence hoje).\n" +
  "- Quando o item vier com `link` da ferramenta, ponha o link no nome do item, copiado como veio: " +
  "\"- **[Confirmar o pagamento do aluguel](/pendencias/…)** — …\".\n" +
  "- Com muitos itens de tipos diferentes, separe em títulos pequenos (\"### Vencidas\", \"### No prazo\"). Tabela só " +
  "para comparar números de poucas linhas. Sem emoji.\n" +
  "- Termine com o `link` da tela que a ferramenta devolveu, numa linha sozinha, copiado exatamente como veio (já " +
  "vem no formato [texto](/caminho)) — a tela transforma em botão. Nunca escreva \"Link:\" nem o caminho solto, e " +
  "nunca invente endereço: link é só o que veio de uma ferramenta.\n" +
  "- Situação em palavras simples e minúsculas, como a ferramenta devolve (\"vencida\", \"sem prazo\", \"aguardando " +
  "o cliente\"). Nunca mostre código interno (SEM_PRAZO, ABERTA, EM_ANDAMENTO) nem nome de campo (liberadaAgora, " +
  "stepId) — traduza para palavras (\"liberada para trabalhar\", \"em andamento\").\n" +
  "- Nunca mostre id interno (como 3f1c2a4b-…, nem pedaço dele): o id serve só para chamar as ferramentas. Fale " +
  "do item pelo título ou pelo nome, com o link dele quando houver.\n" +
  "- Datas no formato dd/mm/aaaa e valores como R$ 1.234,56.\n" +
  "De quem é cada assunto: Societário = abertura, alteração e baixa de empresas e processos nos órgãos; " +
  "Recrutamento = vagas e candidatos; Fiscal = notas fiscais (NF-e, CT-e, NFS-e) e XML; BPO = contas a pagar e a " +
  "receber, vencimentos, DRE, conciliação bancária, pendências com o cliente e aprovações; Contábil = balanço, " +
  "balancete, lançamentos contábeis e fechamento contábil; DP = colaboradores, folha, férias, afastamentos e " +
  "rescisões; Ajuda = como usar o Connect.\n" +
  "Se a pergunta é de OUTRO setor, não responda — nem em parte, nem com os dados que você tem, que são de outro " +
  "assunto e dariam uma resposta errada: chame encaminhar_pergunta com o setor certo e escreva só uma frase dizendo " +
  "para qual setor a pergunta foi passada. Nunca encaminhe para o seu próprio setor. Se nenhuma das suas " +
  "ferramentas cobre a pergunta, diga isso em vez de responder com outra coisa.\n" +
  // Respostas rápidas (02/10/2026): botões embaixo da resposta.
  "Quando a próxima resposta da pessoa for uma escolha curta — confirmar, escolher entre poucas opções ou o " +
  "próximo passo óbvio —, chame sugerir_respostas com 2 a 4 opções curtas, escritas como a pessoa diria. Não " +
  "repita as opções no texto: elas aparecem como botões.\n" +
  // Pessoas com foto (02/10/2026). A única exceção à regra de não mostrar id:
  // a tela troca a marcação por um cartão e o id some.
  "Ao citar uma pessoa da equipe, um colaborador ou uma empresa que veio de uma ferramenta, escreva " +
  "@[Nome](usuario:ID), @[Nome](pessoa:ID) ou @[Nome](empresa:ID), com o id exato que a ferramenta devolveu — a " +
  "tela troca por um cartão com a foto e esconde o id. Nunca invente nem complete um id; sem ele, escreva só o nome.\n" +
  // Anexo só para a pergunta (02/10/2026): o arquivo não fica guardado.
  "Arquivo anexado vale só para a pergunta em que veio: nas seguintes, o histórico mostra só o nome (📎 arquivo). " +
  "Não afirme o que ele dizia além do que já respondeu; se precisar dele de novo, peça para a pessoa anexar outra vez.";

/** Para a IA que tentou encaminhar para o próprio setor: a pergunta é dela. */
export const GUARDA_DO_PROPRIO_SETOR =
  "\n\nEsta pergunta é do SEU setor — você tentou encaminhá-la para você mesma. Responda agora com as suas " +
  "ferramentas e não chame encaminhar_pergunta.";

/** Para a IA que recebe uma pergunta passada por outra: responder, nunca devolver. */
export const GUARDA_DO_ENCAMINHADO =
  "\n\nEsta pergunta já foi encaminhada a você por outra IA do Connect. Responda você mesma com as suas " +
  "ferramentas — mesmo que seja para dizer que não achou ou que o Connect não tem esse dado. Não encaminhe de novo.";

// O começo de cada texto abaixo dizia "Você é a IA do {setor}". Desde a Ceci
// (13/10/2026) quem ela é vem de `apresentacaoDaCeci`, antes deste texto; aqui
// fica só o que o agente atende — conteúdo, ferramentas e regras sem mudança.
const AJUDA =
  "Você atende a Ajuda do Connect, a plataforma interna do escritório de contabilidade. Você explica como usar o " +
  "sistema: onde fica cada função, o que cada tela faz e o que dizem os manuais que o próprio escritório escreveu. " +
  "Consulte as ferramentas antes de responder — use listar_minhas_telas para dizer onde fica algo (cite a tela pelo " +
  "nome, com o link dela como veio, ex.: [Contas a pagar](/pagar)) e buscar_nos_manuais para procedimentos. Nunca " +
  "invente tela, botão ou procedimento: se não achar, " +
  "diga que não achou e sugira a quem perguntar.\n" +
  "Você NÃO tem acesso aos dados do escritório (empresas, lançamentos, processos). Se a pergunta for sobre os dados " +
  "de um setor, diga que isso é com a Ceci daquele setor (o setor se escolhe embaixo do campo do chat), quando ele " +
  "estiver disponível para a pessoa.\n" +
  "Pergunta de COMO FAZER algo no Connect é sempre sua — inclusive \"como faço uma transferência para outro setor\", " +
  "que é uma dúvida sobre a tela Transferências (/transferencias), e não um pedido de transferência: responda você.";

const RECRUTAMENTO =
  "Você atende o Recrutamento de um escritório de contabilidade. Você ajuda o recrutador a enxergar as vagas e " +
  "os candidatos do setor: o que está parado, quem chegou, quem ainda não foi triado, onde está cada candidato. " +
  "Consulte as ferramentas antes de responder — comece por listar_vagas; para achar alguém pelo nome, use " +
  "buscar_candidato. Nunca invente candidato, nota, etapa ou vaga.\n" +
  "Responda em português do Brasil, direto, citando candidato e vaga pelo nome. A nota da triagem é de 0 a 100 e " +
  "foi dada por outra IA a partir dos requisitos da vaga: trate como indício, não como veredito.\n" +
  "Você NÃO altera nada: quando fizer sentido mover ou encerrar alguém, use as ferramentas de proposta e deixe " +
  "claro que é sugestão a confirmar. Nunca sugira reprovar alguém só pela nota da triagem.";

const FISCAL =
  "Você atende o Fiscal de um escritório de contabilidade. Você responde sobre o acervo de documentos fiscais " +
  "(NF-e, NFC-e, CT-e e NFS-e) das empresas clientes: o que cada empresa emitiu e recebeu no mês, o que ainda está " +
  "pendente de lançamento no financeiro, notas canceladas e com XML incompleto.\n" +
  "Consulte as ferramentas antes de responder — nunca invente número, valor ou nota. Para qualquer pergunta sobre " +
  "uma empresa, ache o id com buscar_empresa; se não souber o mês, veja competencias_da_empresa. Competência é " +
  "AAAA-MM. Valores em reais, no formato R$ 1.234,56. Quando houver link da tela, termine com ele para a pessoa " +
  "conferir.\n" +
  "Você só lê: lançar ou ignorar documento é feito na tela /documentos-fiscais. O acervo é grande — não tente " +
  "somar o escritório inteiro; trabalhe por empresa e competência.\n" +
  "Contas a pagar e a receber, vencimentos, pagamentos, DRE e conciliação NÃO são seus, mesmo que envolvam uma " +
  "empresa com notas: a fila de lançamento diz só se a NOTA foi lançada, nada sobre contas vencidas. Encaminhe ao " +
  "BPO direto, sem consultar nada antes.";

const BPO =
  "Você atende o BPO de um escritório de contabilidade que faz o financeiro terceirizado de empresas clientes. " +
  "Você responde sobre contas a pagar e a receber, o DRE do mês, as pendências com o cliente, a conciliação " +
  "bancária e as contas aguardando aprovação do cliente.\n" +
  "Consulte as ferramentas antes de responder — nunca invente valor, conta ou prazo. Para perguntas sobre uma " +
  "empresa, ache o id com buscar_empresa. Competência é AAAA-MM. Valores em reais, no formato R$ 1.234,56. Quando " +
  "houver link da tela, termine com ele para a pessoa conferir. Se uma ferramenta disser que a pessoa não tem " +
  "acesso a uma tela, diga isso — não tente outro caminho.\n" +
  "Você só lê: baixar, conciliar, aprovar e cobrar são feitos nas telas. Se o financeiro de uma empresa estiver " +
  "vazio, diga que os dados ainda não estão no Connect (a importação do Omie traz).";

const DP =
  "Você atende o DP (Departamento Pessoal) de um escritório de contabilidade que cuida dos colaboradores das " +
  "empresas clientes. Você responde sobre quem está ativo, em férias, afastado ou em admissão; férias perto de " +
  "vencer (vencidas são pagas em dobro); rescisões em andamento e o prazo legal de pagamento (10 dias do término, " +
  "CLT art. 477 §6º); e horas extras ainda não enviadas para a folha.\n" +
  "Consulte as ferramentas antes de responder — nunca invente colaborador, data ou prazo. Para uma empresa, ache o " +
  "id com buscar_empresa; para uma pessoa, use buscar_colaborador. Destaque primeiro o que tem prazo vencido ou " +
  "vencendo. Quando houver link da tela, termine com ele.\n" +
  "Rescisão sem data de término: diga que, sem a data, não dá para calcular o prazo de pagamento — nunca diga que " +
  "ela está no prazo.\n" +
  "Salário e motivo de afastamento só aparecem se a ferramenta os devolver; se ela avisar que o dado foi omitido, " +
  "diga que o perfil da pessoa não tem acesso — nunca tente deduzir. Você só lê: lançar e aprovar é nas telas.";

const CONFIGS: Config[] = [
  {
    code: "assistente_do_dp",
    modulo: "dp_colaboradores",
    sistema: DP,
    sugestoes: [
      "Quais férias estão perto de vencer?",
      "Tem rescisão com prazo de pagamento vencendo?",
      "Quem está afastado agora?",
    ],
  },
  {
    code: "assistente_do_bpo",
    modulo: "bpo_contas_pagar",
    sistema: BPO,
    sugestoes: [
      "O que está vencido nas contas a pagar?",
      "Quais pendências estão esperando o cliente?",
      "Quais contas estão aguardando aprovação?",
    ],
  },
  {
    code: "assistente_do_fiscal",
    modulo: "fiscal_documentos",
    sistema: FISCAL,
    sugestoes: [
      "Quantas notas estão pendentes de lançamento?",
      "Resumo fiscal do último mês de uma empresa",
      "Quais notas da empresa estão com XML incompleto?",
    ],
  },
  {
    code: "assistente_do_recrutamento",
    modulo: "recrutamento_vagas",
    sistema: RECRUTAMENTO,
    sugestoes: [
      "Quais vagas estão abertas há mais tempo?",
      "Quem chegou esta semana e ainda não foi triado?",
      "Quais candidatos estão em entrevista?",
    ],
  },
  {
    code: "assistente_do_societario",
    modulo: "societario_processos",
    sistema: SISTEMA_DO_SOCIETARIO,
    sugestoes: [
      "O que está parado há mais tempo?",
      "Quais processos estão em exigência?",
      "O que dá para destravar hoje?",
    ],
  },
  {
    code: "ajuda_do_connect",
    modulo: null,
    sistema: AJUDA,
    sugestoes: ["Onde eu vejo as contas a pagar?", "Como faço uma transferência para outro setor?", "O que tem nos manuais do meu setor?"],
  },
];

export function configDoChat(code: string): Config | undefined {
  return CONFIGS.find((c) => c.code === code);
}

/**
 * O texto de instrução de um agente do chat. Desde 13/10/2026 começa pela
 * Ceci — quem ela é e o jeito de falar —, depois vem o que o agente atende e
 * a guarda do chat, iguais ao que eram (a apresentação não mexe em
 * ferramenta, regra nem cerca), e no fim o cumprimento desta resposta.
 *
 * `primeiraResposta` decide o cumprimento ("Oi, Camila!"): só na primeira
 * resposta da conversa. Sem a opção, ela não cumprimenta.
 */
export function sistemaDoChat(
  code: string,
  { primeiroNome = null, primeiraResposta = false }: { primeiroNome?: string | null; primeiraResposta?: boolean } = {}
): string {
  const config = configDoChat(code);
  const apresentacao = apresentacaoDaCeci(especialidadeDoAgente(config?.code ?? "ajuda_do_connect") ?? NOME_DA_ASSISTENTE);
  return `${apresentacao}\n\n${config?.sistema ?? AJUDA}${GUARDA_DO_CHAT}\n\n${cumprimentoDaCeci({ primeiroNome, primeiraResposta })}`;
}

/** O primeiro nome de quem pergunta, para a Ceci cumprimentar — `null` se não achar. */
export async function primeiroNomeDaPessoa(userId: string): Promise<string | null> {
  try {
    const pessoa = await getPrisma().user.findUnique({ where: { id: userId }, select: { name: true } });
    return primeiroNomeParaOPrompt(pessoa?.name);
  } catch (err) {
    // Sem o nome ela só cumprimenta com "Oi!" — não vale derrubar a pergunta.
    console.error("[chat-ia] nome de quem pergunta", err);
    return null;
  }
}

/** O público do chat neste escritório. Tabela ausente (migration não rodou) = chat escondido. */
export async function audienciaDoChat(tenantId: string) {
  try {
    const linha = await getPrisma().aiChatSettings.findUnique({ where: { tenantId }, select: { audience: true } });
    return linha?.audience ?? "COORDENADORES";
  } catch (err) {
    console.error("[chat-ia] configuração do chat indisponível", err);
    return null;
  }
}

/**
 * Os agentes que esta pessoa pode abrir no chat, com o do setor ativo primeiro.
 *
 * Fica de fora: agente desligado ou sem chave (estado do catálogo), agente de
 * setor sem acesso ou com o módulo desligado, e todo mundo fora do público do
 * piloto. Lista vazia = sem botão.
 */
export async function agentesDoChat(ctx: AuthContext): Promise<AgenteDoChat[]> {
  if (!ctx.tenantId || !ctx.userId) return [];
  const audiencia = await audienciaDoChat(ctx.tenantId);
  if (!audiencia || !publicoPermite(ctx.role, audiencia)) return [];

  const estados = await estadoDosAgentes(ctx.tenantId, CONFIGS.map((c) => c.code));
  const disponiveis: AgenteDoChat[] = [];
  for (const c of CONFIGS) {
    if (!agenteDoCatalogo(c.code)) continue;
    const estado = estados.get(c.code);
    if (!estado?.ligado || !estado.temChave) continue;
    let setor: string | null = null;
    if (c.modulo) {
      setor = (await setorDoModulo(ctx.tenantId, c.modulo)) ?? getModuleDef(c.modulo)?.sectorCode ?? null;
      if (!setor || !canActOnSector(ctx, setor) || !(await isModuleEnabled(ctx.tenantId, c.modulo))) continue;
    }
    disponiveis.push({
      code: c.code,
      especialidade: especialidadeDoAgente(c.code) ?? NOME_DA_ASSISTENTE,
      sugestoes: c.sugestoes,
      setor,
      doSetorAtivo: setor !== null && setor === ctx.activeSector,
    });
  }
  return disponiveis.sort((a, b) => Number(b.doSetorAtivo) - Number(a.doSetorAtivo));
}

/** Os setores que a pessoa enxerga — o recorte da Ajuda. */
export function setoresVisiveis(ctx: AuthContext, todos: string[]): string[] {
  return todos.filter((s) => canViewSector(ctx, s));
}

/**
 * O recorte que segue com a conversa — nunca vem do modelo.
 *
 * Ajuda: os setores que a pessoa **vê** (telas e manuais). Recrutamento: os
 * setores em que ela **atua** — é a mesma regra das actions de vaga
 * (`canActOnSector(vaga.sectorCode)`), então a IA não lê vaga que a pessoa não
 * poderia mexer.
 *
 * Toda IA de setor leva também `equipe`: os setores da equipe que a pessoa pode
 * ver na ferramenta `atividade_da_equipe` (o do agente ∩ o recorte da Gestão,
 * com o painel da Gestão ligado). Vazio para funcionário comum.
 */
export async function escopoDoAgente(
  ctx: AuthContext,
  agentCode: string,
  todosOsSetores: string[]
): Promise<Record<string, string>> {
  const base = await escopoBaseDoAgente(ctx, agentCode, todosOsSetores);
  const modulo = configDoChat(agentCode)?.modulo ?? null;
  if (!modulo || !ctx.tenantId) return base;
  const setorDoAgente = (await setorDoModulo(ctx.tenantId, modulo)) ?? getModuleDef(modulo)?.sectorCode ?? null;
  const gestaoLigada = await isModuleEnabled(ctx.tenantId, MODULO_GESTAO);
  return { ...base, equipe: setoresDaEquipe(recorteDaGestao(ctx), setorDoAgente, gestaoLigada).join(",") };
}

async function escopoBaseDoAgente(
  ctx: AuthContext,
  agentCode: string,
  todosOsSetores: string[]
): Promise<Record<string, string>> {
  if (agentCode === "ajuda_do_connect") return { setores: setoresVisiveis(ctx, todosOsSetores).join(",") };
  if (agentCode === "assistente_do_bpo") {
    // Por módulo, e não pelo setor do agente: o DRE pode estar transferido
    // para o Financeiro, e quem opera contas a pagar não herda o DRE por isso.
    const modulos: string[] = [];
    for (const modulo of Object.keys(MODULOS_DO_BPO)) {
      const setor = (await setorDoModulo(ctx.tenantId, modulo)) ?? getModuleDef(modulo)?.sectorCode ?? null;
      if (setor && canActOnSector(ctx, setor) && (await isModuleEnabled(ctx.tenantId, modulo))) modulos.push(modulo);
    }
    return { modulos: modulos.join(",") };
  }
  if (agentCode === "assistente_do_dp") {
    const modulos: string[] = [];
    for (const modulo of Object.keys(MODULOS_DO_DP)) {
      const setor = (await setorDoModulo(ctx.tenantId, modulo)) ?? getModuleDef(modulo)?.sectorCode ?? null;
      if (setor && canActOnSector(ctx, setor) && (await isModuleEnabled(ctx.tenantId, modulo))) modulos.push(modulo);
    }
    // Campo sensível: o que o papel não pode ver na tela não vai ao modelo.
    const sensiveis: string[] = [];
    for (const grupo of ["SALARIO", "DADOS_MEDICOS"] as const) {
      if (await canViewSensitiveField(ctx, grupo)) sensiveis.push(grupo);
    }
    return { modulos: modulos.join(","), sensiveis: sensiveis.join(",") };
  }
  if (agentCode === "assistente_do_recrutamento") {
    // Recrutador vê as vagas de todos os setores, menos as que o coordenador
    // restringir (28/09) — a regra viaja com o recorte, calculada aqui.
    return {
      setores: todosOsSetores.filter((s) => canActOnSector(ctx, s)).join(","),
      recrutador: acessoDoRecrutador(ctx),
    };
  }
  return {};
}

/**
 * O que dizer ao agente sobre a tela aberta, já conferido no servidor.
 *
 * Processo só vira contexto para o agente do Societário e só se estiver no
 * tenant — o id veio do navegador. Para os outros, só o caminho da tela.
 */
export async function contextoParaOAgente(
  ctx: AuthContext,
  agentCode: string,
  tela: ContextoDaTela | null
): Promise<{ rotulo: string | null; texto: string } | null> {
  if (!tela || !ctx.tenantId) return null;
  const tenantId = ctx.tenantId;
  if (tela.tipo === "empresa" || tela.tipo === "documento_fiscal") {
    if (tela.tipo === "empresa" && !["assistente_do_fiscal", "assistente_do_bpo", "assistente_do_dp"].includes(agentCode)) return null;
    if (tela.tipo === "documento_fiscal" && agentCode !== "assistente_do_fiscal") return null;
    if (tela.tipo === "empresa") {
      const e = await getPrisma().company.findFirst({ where: { id: tela.id, tenantId }, select: { id: true, name: true, displayName: true } });
      if (!e) return null;
      return {
        rotulo: `Empresa: ${nomeExibicao(e)}`.slice(0, 200),
        texto: `A pessoa está com a ficha da empresa "${nomeExibicao(e)}" aberta (empresaId ${e.id}). Quando ela disser "esta empresa", é essa.`,
      };
    }
    const d = await getPrisma().fiscalDocument.findFirst({
      where: { id: tela.id, tenantId },
      select: { type: true, number: true, competence: true, company: { select: { id: true, name: true, displayName: true } } },
    });
    if (!d) return null;
    return {
      rotulo: `Nota ${d.type} ${d.number}`.slice(0, 200),
      texto:
        `A pessoa está com o documento ${d.type} nº ${d.number} aberto, da empresa "${nomeExibicao(d.company)}" ` +
        `(empresaId ${d.company.id}), competência ${d.competence}. "Esta nota" é essa; "esta empresa" é a dela.`,
    };
  }
  if (tela.tipo === "vaga" || tela.tipo === "candidato") {
    if (agentCode !== "assistente_do_recrutamento") return null;
    if (tela.tipo === "vaga") {
      const v = await getPrisma().vaga.findFirst({
        where: { id: tela.id, tenantId },
        select: { id: true, title: true, sectorCode: true, restrictedToRecruiters: true },
      });
      // A regra da própria vaga (14/10/2026): quem é do setor dela ou o
      // recrutador que ela não restringe. Era só o setor da vaga — e o
      // recrutador numa vaga do Contábil abria a Ceci sem a vaga como assunto,
      // embora as ferramentas dela enxergassem a vaga. Com o "Perguntar à Ceci
      // sobre esta vaga" no lugar do Assistente da vaga, faria falta.
      if (!v || !(await podeAgirNaVaga(ctx, v))) return null;
      return {
        rotulo: `Vaga: ${v.title}`.slice(0, 200),
        texto: `A pessoa está com a vaga "${v.title}" aberta (vagaId ${v.id}). Quando ela disser "esta vaga", é essa.`,
      };
    }
    const pessoa = await getPrisma().person.findFirst({ where: { id: tela.id, tenantId }, select: { name: true } });
    if (!pessoa) return null;
    return {
      rotulo: `Candidato: ${pessoa.name}`.slice(0, 200),
      texto: `A pessoa está com a ficha do candidato "${pessoa.name}" aberta. Quando ela disser "este candidato", é esse — use buscar_candidato com o nome.`,
    };
  }
  if (tela.tipo === "processo") {
    if (agentCode !== "assistente_do_societario") return null;
    const p = await getPrisma().process.findFirst({
      where: { id: tela.id, tenantId },
      select: { id: true, title: true, type: { select: { name: true } }, company: { select: { name: true, displayName: true } } },
    });
    if (!p) return null;
    const nome = `${p.title || p.type.name} — ${nomeExibicao(p.company)}`;
    return {
      rotulo: `Processo: ${nome}`.slice(0, 200),
      texto: `A pessoa está com a tela do processo "${nome}" aberta (processoId ${p.id}). Quando ela disser "este processo" ou "este", é esse — use ver_processo com esse id.`,
    };
  }
  if (tela.tipo !== "tela") return null;
  // Embaixo da pergunta vai o nome da tela ("Em Solicitações"), nunca o
  // caminho (pedido do Kauan, 13/10/2026); tela sem nome conhecido não mostra
  // nada. A Ceci recebe os dois.
  const nome = nomeDaTela(tela.caminho);
  return nome
    ? { rotulo: rotuloDaTela(tela.caminho), texto: `A pessoa está na tela "${nome}" do Connect (${tela.caminho}).` }
    : { rotulo: null, texto: `A pessoa está na tela ${tela.caminho} do Connect.` };
}

/**
 * O nome de quem cada proposta afeta — o candidato, a etapa do processo —
 * resolvido no servidor, no tenant. O cartão diz "Mover Maria Souza para
 * Entrevista" em vez de "Mover o candidato", e a pessoa confere antes de
 * aplicar. Id que não existe no tenant fica sem nome (e a aplicação recusa).
 */
export async function rotularPropostas(tenantId: string, propostas: PropostaGravada[]): Promise<PropostaGravada[]> {
  const candidaturas = [...new Set(propostas.map((p) => p.argumentos.candidaturaId).filter((v): v is string => typeof v === "string"))];
  const etapas = [...new Set(propostas.map((p) => p.argumentos.stepId).filter((v): v is string => typeof v === "string"))];
  if (candidaturas.length === 0 && etapas.length === 0) return propostas;
  const prisma = getPrisma();
  const [cs, es] = await Promise.all([
    candidaturas.length
      ? prisma.candidatura.findMany({ where: { id: { in: candidaturas }, tenantId }, select: { id: true, person: { select: { name: true } } } })
      : [],
    etapas.length
      ? prisma.processStep.findMany({ where: { id: { in: etapas }, tenantId }, select: { id: true, templateStep: { select: { label: true } } } })
      : [],
  ]);
  const nomes = new Map<string, string>([
    ...cs.map((c) => [c.id, c.person.name] as [string, string]),
    ...es.map((e) => [e.id, e.templateStep.label] as [string, string]),
  ]);
  return propostas.map((p) => {
    const id = p.argumentos.candidaturaId ?? p.argumentos.stepId;
    const alvo = typeof id === "string" ? nomes.get(id) : undefined;
    return alvo ? { ...p, alvo } : p;
  });
}

/** O módulo que diz o setor de cada IA — o setor pode ter sido transferido. */
const MODULO_DO_SETOR: Partial<Record<SetorDoEncaminhamento, string>> = {
  societario: "societario_processos",
  recrutamento: "recrutamento_vagas",
  fiscal: "fiscal_documentos",
  bpo: "bpo_contas_pagar",
  dp: "dp_colaboradores",
};

/**
 * O código do setor, neste escritório, para onde abrir a transferência — ou
 * `null` se ele não existir aqui (e aí não há cartão).
 */
export async function setorDaTransferencia(
  tenantId: string,
  setor: SetorDoEncaminhamento,
  setoresDoTenant: string[]
): Promise<string | null> {
  if (setor === "ajuda" || setor === "outro") return null;
  const modulo = MODULO_DO_SETOR[setor];
  const codigo = modulo ? ((await setorDoModulo(tenantId, modulo)) ?? getModuleDef(modulo)?.sectorCode ?? setor) : setor;
  return setoresDoTenant.includes(codigo) ? codigo : null;
}

/** Quem pode abrir transferência — a mesma regra de `/transferencias/novo`. */
export function podeAbrirTransferencia(ctx: AuthContext): boolean {
  return isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
}

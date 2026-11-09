// As regras do chat de IA do canto da tela — puras, testadas em `regras.test.ts`.
//
// Plano em Obsidian: Projects/Connect-41/Plano-Chat-IA-por-Setor-2026-09-25.
// O que mora aqui: quem vê o chat (piloto), quantas perguntas por dia, por
// quanto tempo a conversa fica, o que a tela aberta diz ao agente e o texto do
// passo que aparece enquanto ele consulta.

import type { AiChatAudience, UserRole } from "@/generated/prisma/enums";
import { ABRIR_PROCESSO, descreverAbertura, detalhesDaAbertura, type DetalheDoCartao } from "@/lib/societario/abertura";

/** Perguntas por pessoa por dia, somando todos os agentes do chat. */
export const LIMITE_DE_PERGUNTAS_POR_DIA = 30;

/** Dias sem mensagem depois dos quais a conversa é apagada. */
export const DIAS_DE_RETENCAO = 90;

/** Tamanho máximo da pergunta. */
export const MAX_CARACTERES_DA_PERGUNTA = 2_000;

/**
 * Quem conta como coordenador no piloto. `READONLY` (diretoria) fica fora: o
 * chat propõe mudanças, e quem só lê não aplica nenhuma.
 */
const COORDENADORES: ReadonlySet<UserRole> = new Set(["SUPER_ADMIN", "ADMIN", "SECTOR_ADMIN"]);

/** A pessoa vê o chat, dado o público configurado no escritório? */
export function publicoPermite(role: UserRole, audiencia: AiChatAudience): boolean {
  if (audiencia === "TODOS") return role !== "READONLY";
  return COORDENADORES.has(role);
}

/** O primeiro instante do dia corrente em São Paulo (UTC-3, sem horário de verão). */
export function inicioDoDiaEmSaoPaulo(agora: Date): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const n = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  return new Date(Date.UTC(n("year"), n("month") - 1, n("day"), 3, 0, 0, 0));
}

/** A data de corte da retenção: conversas paradas desde antes disto são apagadas. */
export function corteDaRetencao(agora: Date): Date {
  return new Date(agora.getTime() - DIAS_DE_RETENCAO * 24 * 60 * 60 * 1000);
}

/** O nome da conversa na lista: a primeira pergunta, numa linha, cortada. */
export function tituloDaConversa(pergunta: string): string {
  const linha = pergunta.replace(/\s+/g, " ").trim();
  return linha.length > 80 ? `${linha.slice(0, 79)}…` : linha || "Conversa";
}

export type ContextoDaTela =
  | { tipo: "processo" | "vaga" | "candidato" | "empresa" | "documento_fiscal"; id: string }
  | { tipo: "tela"; caminho: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O que a pessoa está vendo, a partir do caminho da página.
 *
 * Só o **tipo e o id** saem daqui. Nome, empresa e permissão são resolvidos no
 * servidor, com o tenant e o acesso de quem pergunta — o caminho vem do
 * navegador e não é prova de nada.
 */
export function contextoDaTela(caminho: string): ContextoDaTela | null {
  const limpo = caminho.split(/[?#]/)[0] ?? "";
  if (!limpo.startsWith("/")) return null;
  const processo = /^\/processos\/([^/]+)\/?$/.exec(limpo);
  if (processo && UUID.test(processo[1]!)) return { tipo: "processo", id: processo[1]! };
  const vaga = /^\/vagas\/([^/]+)(?:\/.*)?$/.exec(limpo);
  if (vaga && UUID.test(vaga[1]!)) return { tipo: "vaga", id: vaga[1]! };
  // A empresa vista pelo Societário (`/processos/empresas/{id}`) também é a
  // empresa da tela (09/11/2026) — é dali que se pede "abrir alteração para esta".
  const empresa = /^(?:\/processos)?\/empresas\/([^/]+)(?:\/.*)?$/.exec(limpo);
  if (empresa && UUID.test(empresa[1]!)) return { tipo: "empresa", id: empresa[1]! };
  const documento = /^\/documentos-fiscais\/([^/]+)\/?$/.exec(limpo);
  if (documento && UUID.test(documento[1]!)) return { tipo: "documento_fiscal", id: documento[1]! };
  const pessoa = /^\/candidatos\/([^/]+)\/?$/.exec(limpo);
  if (pessoa && UUID.test(pessoa[1]!)) return { tipo: "candidato", id: pessoa[1]! };
  return { tipo: "tela", caminho: limpo.slice(0, 120) };
}

/** O passo mostrado enquanto o agente consulta — por ferramenta. */
const PASSOS: Record<string, string> = {
  listar_fila: "Consultando a fila de processos…",
  ver_processo: "Lendo o processo…",
  propor_concluir_etapa: "Preparando uma sugestão…",
  propor_dispensar_etapa: "Preparando uma sugestão…",
  tipos_de_processo: "Vendo os tipos de processo…",
  roteiro_do_tipo: "Lendo o roteiro do processo…",
  responsaveis_do_societario: "Vendo quem pode responder…",
  propor_abrir_processo: "Preparando o processo…",
  sugerir_respostas: "Montando a resposta…",
  listar_minhas_telas: "Vendo as telas que você acessa…",
  listar_vagas: "Consultando as vagas…",
  ver_vaga_do_setor: "Lendo a vaga…",
  listar_candidatos_da_vaga: "Consultando os candidatos…",
  ver_candidatura: "Lendo a candidatura…",
  buscar_candidato: "Procurando o candidato…",
  buscar_empresa: "Procurando a empresa…",
  competencias_da_empresa: "Vendo os meses com documentos…",
  resumo_fiscal_do_mes: "Somando os documentos do mês…",
  listar_documentos_fiscais: "Listando os documentos…",
  fila_de_lancamento: "Contando a fila de lançamento…",
  contas_do_bpo: "Consultando as contas…",
  dre_do_mes: "Montando o DRE…",
  pendencias_de_clientes: "Consultando as pendências…",
  conciliacao_pendente: "Vendo a conciliação…",
  aprovacoes_aguardando: "Vendo as aprovações…",
  colaboradores_da_empresa: "Consultando os colaboradores…",
  buscar_colaborador: "Procurando o colaborador…",
  ferias_do_dp: "Vendo as férias…",
  rescisoes_em_andamento: "Vendo as rescisões…",
  afastamentos_ativos: "Vendo os afastamentos…",
  horas_extras_pendentes: "Somando as horas extras…",
  propor_mover_etapa: "Preparando uma sugestão…",
  propor_encerrar_candidatura: "Preparando uma sugestão…",
  buscar_nos_manuais: "Procurando nos manuais…",
  sistemas_do_ops_center: "Consultando o Ops Center…",
  categorias_de_chamado: "Vendo as categorias de chamado…",
  propor_abrir_chamado: "Preparando o chamado…",
};

export function textoDoPasso(ferramenta: string): string {
  return PASSOS[ferramenta] ?? "Consultando o Connect…";
}

/** Uma proposta gravada na mensagem, com o estado de aplicação. */
export type PropostaGravada = {
  ferramenta: string;
  descricao: string;
  argumentos: Record<string, unknown>;
  /** De quem é a proposta, resolvido no servidor ("Maria Souza", "Registro na Junta"). */
  alvo?: string;
  aplicada?: boolean;
  /** A pessoa disse "Não" no cartão (02/10/2026). Fica gravado, como o "aplicada". */
  recusada?: boolean;
  /** O que a aplicação criou, para o cartão apontar ("/chamados/{id}"). Gravado pelo servidor. */
  link?: string;
};

/** Lê as propostas do JSON gravado, descartando o que não tiver a forma certa. */
export function lerPropostas(bruto: unknown): PropostaGravada[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((p) => {
    if (!p || typeof p !== "object") return [];
    const o = p as Record<string, unknown>;
    if (typeof o.ferramenta !== "string") return [];
    return [
      {
        ferramenta: o.ferramenta,
        descricao: typeof o.descricao === "string" ? o.descricao : "",
        argumentos: o.argumentos && typeof o.argumentos === "object" ? (o.argumentos as Record<string, unknown>) : {},
        ...(typeof o.alvo === "string" ? { alvo: o.alvo } : {}),
        aplicada: o.aplicada === true,
        ...(o.recusada === true ? { recusada: true } : {}),
        ...(typeof o.link === "string" && o.link.startsWith("/") ? { link: o.link } : {}),
      },
    ];
  });
}

// ─── Respostas rápidas e cartões de decisão (02/10/2026) ─────────────────────

/** A pseudo-ferramenta com que a IA oferece botões de resposta ("Sim", "Não, só a de março"). */
export const SUGERIR_RESPOSTAS = "sugerir_respostas";

/** As opções de resposta rápida de uma proposta — 2 a 4, curtas, sem repetir. Vazio se não for uma. */
export function opcoesDeRespostaRapida(p: { ferramenta: string; argumentos?: Record<string, unknown> }): string[] {
  if (p.ferramenta !== SUGERIR_RESPOSTAS) return [];
  const brutas = Array.isArray(p.argumentos?.opcoes) ? p.argumentos.opcoes : [];
  const vistas = new Set<string>();
  const opcoes: string[] = [];
  for (const o of brutas) {
    if (typeof o !== "string") continue;
    const t = o.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!t || vistas.has(t.toLowerCase())) continue;
    vistas.add(t.toLowerCase());
    opcoes.push(t);
  }
  return opcoes.length >= 2 ? opcoes.slice(0, 4) : [];
}

/** Os botões do cartão de decisão: candidatura é Aprovar/Recusar; o resto, Sim/Não. */
export function rotulosDaDecisao(ferramenta: string): { sim: string; nao: string } {
  if (ferramenta === "propor_mover_etapa" || ferramenta === "propor_encerrar_candidatura") return { sim: "Aprovar", nao: "Recusar" };
  if (ferramenta === ABRIR_CHAMADO) return { sim: "Abrir chamado", nao: "Não abrir" };
  if (ferramenta === ABRIR_PROCESSO) return { sim: "Abrir processo", nao: "Não abrir" };
  return { sim: "Sim, aplicar", nao: "Não, cancelar" };
}

/**
 * O que o cartão diz depois do sim, quando a aplicação criou algo com
 * endereço — o chamado (03/11/2026), o processo (09/11/2026) — e o botão que
 * leva até ele.
 */
export function rotulosDoCriado(ferramenta: string): { feito: string; ver: string } {
  if (ferramenta === ABRIR_PROCESSO) return { feito: "Processo aberto", ver: "Ver processo" };
  if (ferramenta === ABRIR_CHAMADO) return { feito: "Chamado aberto", ver: "Ver chamado" };
  return { feito: "Aplicado", ver: "Abrir" };
}

// ─── Chamado aberto pela Ceci (03/11/2026) ──────────────────────────────────

/** A proposta de chamado — a ferramenta mora em `src/lib/ia/ferramentas-tech.ts`. */
export const ABRIR_CHAMADO = "propor_abrir_chamado";

const PRIORIDADE_EM_PALAVRAS: Record<string, string> = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", URGENTE: "Urgente" };
const textoDe = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Os campos da categoria como vieram na proposta (`[{chave, valor}]`), sem chave vazia nem repetida. */
export function camposDaProposta(argumentos: Record<string, unknown>): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const c of Array.isArray(argumentos.campos) ? argumentos.campos : []) {
    if (!c || typeof c !== "object") continue;
    const chave = textoDe((c as Record<string, unknown>).chave), valor = textoDe((c as Record<string, unknown>).valor);
    if (chave && valor && !(chave in campos)) campos[chave] = valor;
  }
  return campos;
}

/**
 * O que vai para `abrirPelaCeci` — os mesmos campos da tela Novo chamado. A
 * validação é a de lá (`dadosSchema`, categoria, formulário); aqui só se lê.
 */
export function chamadoDaProposta(argumentos: Record<string, unknown>) {
  const prioridade = textoDe(argumentos.prioridade);
  return {
    title: textoDe(argumentos.titulo),
    description: textoDe(argumentos.descricao),
    categoryId: textoDe(argumentos.categoriaId),
    requesterSectorCode: textoDe(argumentos.setor),
    priority: prioridade in PRIORIDADE_EM_PALAVRAS ? prioridade : "MEDIA",
    requestData: camposDaProposta(argumentos),
    tags: [],
  };
}

/**
 * As linhas que o cartão mostra embaixo da frase: no chamado, o que a pessoa
 * confirma — categoria, título, descrição. A categoria e o setor são os nomes
 * resolvidos no servidor (`alvo` e `setorNome`), não o texto do modelo.
 *
 * No processo (09/11/2026), empresa, tipo, responsável, prazo, checklist e o
 * pedido ao cliente — também com os nomes lidos do banco, ao preparar a
 * proposta (`detalhesDaAbertura`).
 */
export function detalhesDaProposta(p: { ferramenta: string; argumentos?: Record<string, unknown>; alvo?: string }): DetalheDoCartao[] {
  if (p.ferramenta === ABRIR_PROCESSO) return detalhesDaAbertura(p.argumentos);
  if (p.ferramenta !== ABRIR_CHAMADO) return [];
  const a = p.argumentos ?? {};
  const nomes = new Map(
    (Array.isArray(a.campos) ? a.campos : []).flatMap((c) =>
      c && typeof c === "object" && textoDe((c as Record<string, unknown>).nome) ? [[textoDe((c as Record<string, unknown>).chave), textoDe((c as Record<string, unknown>).nome)] as const] : []
    )
  );
  const campos = Object.entries(camposDaProposta(a)).map(([chave, valor]) => ({ rotulo: nomes.get(chave) ?? chave, texto: valor }));
  return [
    { rotulo: "Categoria", texto: p.alvo ?? "categoria não encontrada — peça à Ceci para escolher de novo" },
    { rotulo: "Título", texto: textoDe(a.titulo) },
    { rotulo: "Descrição", texto: textoDe(a.descricao), longo: true },
    { rotulo: "Setor", texto: textoDe(a.setorNome) || textoDe(a.setor) },
    { rotulo: "Prioridade", texto: PRIORIDADE_EM_PALAVRAS[textoDe(a.prioridade)] ?? "Média" },
    ...campos,
  ].filter((d) => d.texto);
}

/**
 * Editar uma pergunta ou refazer uma resposta não apaga a conversa: as trocas
 * a partir dali ficam marcadas assim — somem da tela e do histórico que vai à
 * IA, e as perguntas continuam contando no limite do dia (o desenho pede que
 * refazer conte como pergunta nova).
 */
export const MARCA_DE_SUBSTITUIDA = "__substituida__";

// ─── Avaliar a resposta (02/10/2026) ────────────────────────────────────────

export type Avaliacao = "boa" | "ruim";

/** Os motivos do 👎 — lista fixa, para o painel somar. Escolher um é opcional. */
export const MOTIVOS_DO_NAO = {
  errou_dado: "Errou o dado",
  nao_entendeu: "Não entendeu",
  incompleta: "Incompleta",
} as const;

export type MotivoDoNao = keyof typeof MOTIVOS_DO_NAO;

export function ehMotivoDoNao(x: unknown): x is MotivoDoNao {
  return typeof x === "string" && Object.hasOwn(MOTIVOS_DO_NAO, x);
}

/**
 * O que gravar a partir do clique. Motivo só acompanha o 👎; um motivo fora da
 * lista é recusado (vem do navegador). `null` tira a avaliação.
 */
export function avaliacaoParaGravar(
  avaliacao: unknown,
  motivo: unknown
): { rating: "BOA" | "RUIM" | null; ratingReason: MotivoDoNao | null } | null {
  if (avaliacao === null) return { rating: null, ratingReason: null };
  if (avaliacao === "boa") return { rating: "BOA", ratingReason: null };
  if (avaliacao !== "ruim") return null;
  if (motivo === null || motivo === undefined) return { rating: "RUIM", ratingReason: null };
  return ehMotivoDoNao(motivo) ? { rating: "RUIM", ratingReason: motivo } : null;
}

/** O que o cartão da proposta diz, em uma linha. */
const ETAPA_DO_FUNIL: Record<string, string> = {
  TRIAGEM: "Triagem",
  ENTREVISTA: "Entrevista",
  TESTE: "Teste",
  PROPOSTA: "Proposta",
  CONTRATADO: "Contratado",
};

export function descreverProposta(p: {
  ferramenta: string;
  descricao: string;
  argumentos?: Record<string, unknown>;
  alvo?: string;
}): string {
  const a = p.argumentos ?? {};
  const motivo = typeof a.motivo === "string" && a.motivo.trim() ? ` — ${a.motivo.trim()}` : "";
  const alvo = p.alvo ? ` ${p.alvo}` : "";
  if (p.ferramenta === "propor_concluir_etapa") return `Concluir a etapa${alvo ? ` "${p.alvo}"` : ""}${motivo}`;
  if (p.ferramenta === "propor_dispensar_etapa") return `Dispensar a etapa${alvo ? ` "${p.alvo}"` : ""}${motivo}`;
  if (p.ferramenta === "propor_mover_etapa") {
    const etapa = typeof a.etapa === "string" ? (ETAPA_DO_FUNIL[a.etapa] ?? a.etapa) : "outra etapa";
    return `Mover${alvo || " o candidato"} para ${etapa}${motivo}`;
  }
  if (p.ferramenta === "abrir_transferencia") return `Abrir uma transferência para ${p.alvo ?? "o setor"}`;
  if (p.ferramenta === ABRIR_CHAMADO) return "Abrir este chamado para o Tech";
  if (p.ferramenta === ABRIR_PROCESSO) return descreverAbertura(p.argumentos);
  // A Ceci do BPO corrigindo a DRE (30/10/2026).
  if (p.ferramenta === "propor_mover_categoria_na_dre") {
    const empresa = typeof a.empresaNome === "string" && a.empresaNome.trim() ? ` de ${a.empresaNome.trim()}` : "";
    return `Na DRE${empresa}, mover "${String(a.categoria ?? "a categoria")}" para ${String(a.linha ?? "outra linha")} (só neste cliente)${motivo}`;
  }
  if (p.ferramenta === "propor_recategorizar_lancamentos") {
    const n = Array.isArray(a.lancamentoIds) ? a.lancamentoIds.length : 0;
    const quantos = n === 1 ? "1 lançamento" : `${n} lançamentos`;
    return `Trocar a categoria de ${quantos} para "${String(a.categoriaNome ?? "outra categoria")}"${motivo}`;
  }
  if (p.ferramenta === "propor_encerrar_candidatura") {
    const desfecho = a.desfecho === "DESISTENTE" ? "desistente" : "reprovado";
    return `Encerrar${alvo || " a candidatura"} como ${desfecho}${motivo}`;
  }
  return p.descricao;
}

// ─── Orquestrador ────────────────────────────────────────────────────────────

/** Os setores para onde uma IA pode encaminhar a pergunta. */
export const SETORES_DO_ENCAMINHAMENTO = [
  "societario",
  "recrutamento",
  "fiscal",
  "bpo",
  "contabil",
  "dp",
  "ajuda",
  "outro",
] as const;

export type SetorDoEncaminhamento = (typeof SETORES_DO_ENCAMINHAMENTO)[number];

/** A IA do chat de cada setor — `null` onde ainda não há (Contábil: sem módulo no Connect). */
export const IA_DO_SETOR: Record<SetorDoEncaminhamento, string | null> = {
  societario: "assistente_do_societario",
  recrutamento: "assistente_do_recrutamento",
  fiscal: "assistente_do_fiscal",
  bpo: "assistente_do_bpo",
  contabil: null,
  dp: "assistente_do_dp",
  ajuda: "ajuda_do_connect",
  outro: null,
};

/** Os agentes que atendem no chat — o resto do catálogo são funções de IA dentro das telas. */
export const AGENTES_DO_CHAT: ReadonlySet<string> = new Set(
  Object.values(IA_DO_SETOR).filter((c): c is string => c !== null)
);

export type Encaminhamento = { setor: SetorDoEncaminhamento; motivo: string };

/** O pedido de encaminhamento que a IA fez, se fez — o primeiro, com setor válido. */
export function encaminhamentoPedido(propostas: { ferramenta: string; argumentos: Record<string, unknown> }[]): Encaminhamento | null {
  for (const p of propostas) {
    if (p.ferramenta !== "encaminhar_pergunta") continue;
    const setor = SETORES_DO_ENCAMINHAMENTO.find((s) => s === p.argumentos.setor);
    if (!setor) continue;
    const motivo = typeof p.argumentos.motivo === "string" ? p.argumentos.motivo.trim().slice(0, 300) : "";
    return { setor, motivo };
  }
  return null;
}

/** A descrição que a transferência aberta pelo chat leva — a pergunta como foi feita. */
export function descricaoDaTransferencia(pergunta: string, motivo: string): string {
  return [`Pergunta feita no chat de IA: "${pergunta.trim()}"`, motivo ? `Assunto: ${motivo}` : ""].filter(Boolean).join("\n\n");
}

// As regras do Atendimento que não tocam o banco — testadas em `regras.test.ts`.
//
// O Atendimento é a caixa do WhatsApp oficial do escritório (10/11/2026): todo
// contato novo cai na triagem da Controladoria, que responde ou encaminha ao
// setor; o setor assume e resolve. Quem está no setor e quer passar a conversa
// a outro faz um pedido, que a triagem aprova. Toda mensagem que sai leva o
// nome e o setor de quem escreveu.

export const MODULO = "atendimento";

/** Quem assina o que o Connect manda sozinho (boas-vindas, fora do horário, PARAR). */
export const ASSINATURA_AUTOMATICA = "Atendimento 41";

export type Situacao = "TRIAGEM" | "NO_SETOR" | "EM_ATENDIMENTO" | "AGUARDANDO_CLIENTE" | "ENCERRADO";

export const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  TRIAGEM: "Na triagem",
  NO_SETOR: "Sem responsável",
  EM_ATENDIMENTO: "Em atendimento",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  ENCERRADO: "Encerrado",
};

/** Os desfechos com que todo escritório começa. Editáveis nas configurações. */
export const DESFECHOS_PADRAO = [
  "Resolvido",
  "Dúvida respondida",
  "Documento enviado",
  "Virou solicitação no portal",
  "Cliente não respondeu",
  "Engano ou propaganda",
] as const;

/** O valor de "Outro" no seletor: a pessoa escreve o desfecho. Não mora na tabela. */
export const DESFECHO_OUTRO = "__outro__";

export const MAX_DESFECHO = 120;
export const MAX_RESUMO = 2_000;
export const MAX_NOTA = 2_000;
export const MAX_MOTIVO = 1_000;

// ─── Assinatura ──────────────────────────────────────────────────────────────

/** "Nome · Setor", o que sai em negrito na primeira linha. Sem setor, só o nome. */
export function assinaturaDe(nome: string, rotuloDoSetor: string | null): string {
  const n = nome.trim().replace(/\s+/g, " ") || "Equipe";
  const s = rotuloDoSetor?.trim();
  return (s ? `${n} · ${s}` : n).slice(0, 160);
}

/**
 * O texto exatamente como o cliente recebe: a assinatura em negrito (sintaxe
 * do WhatsApp) numa linha, e a mensagem embaixo. Asterisco no nome quebraria
 * o negrito, por isso sai.
 */
export function textoAssinado(assinatura: string, texto: string): string {
  const limpa = assinatura.replace(/\*/g, "").trim();
  return `*${limpa}*\n${texto.trim()}`;
}

// ─── Chegada de uma mensagem ─────────────────────────────────────────────────

export type CicloParaChegada = {
  id: string;
  situacao: Situacao;
  sectorCode: string | null;
  assignedToId: string | null;
  encerradoEm: Date | null;
};

export type DecisaoDaChegada =
  /** Segue no atendimento aberto; se estava aguardando o cliente, volta para "Em atendimento". */
  | { tipo: "continuar"; cicloId: string; voltaDeAguardando: boolean }
  /** Encerrado há pouco: abre um ciclo novo com o mesmo setor e a mesma pessoa. */
  | { tipo: "reabrir"; sectorCode: string; assignedToId: string | null }
  /** Primeiro contato, ou faz tempo: entra na triagem. */
  | { tipo: "novo" };

/**
 * O que fazer com uma mensagem que chegou, dado o último ciclo da conversa.
 *
 * Reabrir no mesmo setor só vale quando o ciclo encerrado tinha setor: o que
 * foi encerrado na própria triagem volta para a triagem, que é quem o conhecia.
 */
export function decidirChegada(ultimo: CicloParaChegada | null, agora: Date, diasParaReabrir: number): DecisaoDaChegada {
  if (!ultimo) return { tipo: "novo" };
  if (ultimo.situacao !== "ENCERRADO") {
    return { tipo: "continuar", cicloId: ultimo.id, voltaDeAguardando: ultimo.situacao === "AGUARDANDO_CLIENTE" };
  }
  if (!ultimo.sectorCode || !ultimo.encerradoEm || diasParaReabrir <= 0) return { tipo: "novo" };
  const limite = ultimo.encerradoEm.getTime() + diasParaReabrir * 24 * 60 * 60 * 1000;
  if (agora.getTime() > limite) return { tipo: "novo" };
  return { tipo: "reabrir", sectorCode: ultimo.sectorCode, assignedToId: ultimo.assignedToId };
}

/** A situação de um ciclo reaberto: com pessoa, segue com ela; sem, espera alguém do setor. */
export function situacaoAoReabrir(assignedToId: string | null): Situacao {
  return assignedToId ? "EM_ATENDIMENTO" : "NO_SETOR";
}

// ─── Horário ─────────────────────────────────────────────────────────────────

export type Horario = { diasDaSemana: string; abreAs: string; fechaAs: string };

const FUSO = "America/Sao_Paulo";

function minutosDe(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Os dias marcados, 0 = domingo. Lixo é ignorado. */
export function diasDoHorario(diasDaSemana: string): number[] {
  return [...new Set(diasDaSemana.split(",").map((d) => Number(d.trim())).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
}

/** O escritório está atendendo agora, no horário de Brasília? */
export function dentroDoHorario(h: Horario, agora: Date): boolean {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const pega = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(pega("weekday"));
  const agoraMin = Number(pega("hour")) * 60 + Number(pega("minute"));
  const abre = minutosDe(h.abreAs);
  const fecha = minutosDe(h.fechaAs);
  if (dia < 0 || abre === null || fecha === null) return true;
  if (!diasDoHorario(h.diasDaSemana).includes(dia)) return false;
  return agoraMin >= abre && agoraMin < fecha;
}

/** A mensagem automática de quem escreve pela primeira vez neste ciclo, ou nada. */
export function mensagemDeChegada(
  h: Horario & { boasVindas: string | null; foraDoHorario: string | null },
  agora: Date
): string | null {
  const texto = dentroDoHorario(h, agora) ? h.boasVindas : h.foraDoHorario;
  const limpo = texto?.trim();
  return limpo ? limpo : null;
}

// ─── Mensagens padrão ────────────────────────────────────────────────────────

export type CamposDaMensagem = { nomeDoContato: string | null; empresa: string | null; seuNome: string; seuSetor: string | null };

/**
 * Troca os campos de uma mensagem padrão. Campo sem valor vira vazio, sem
 * deixar "{empresa}" no texto que o cliente lê.
 */
export function preencherCampos(texto: string, c: CamposDaMensagem): string {
  const primeiroNome = (n: string | null) => (n ?? "").trim().split(/\s+/)[0] ?? "";
  return texto
    .replace(/\{nome do contato\}/gi, primeiroNome(c.nomeDoContato))
    .replace(/\{empresa\}/gi, c.empresa ?? "")
    .replace(/\{seu nome\}/gi, primeiroNome(c.seuNome))
    .replace(/\{seu setor\}/gi, c.seuSetor ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// ─── Recortes da lista ───────────────────────────────────────────────────────

export const RECORTES_DA_TRIAGEM = ["triagem", "pedidos", "minhas", "todas"] as const;
export const RECORTES_DO_SETOR = ["sem_responsavel", "minhas", "aguardando", "do_setor", "encerradas"] as const;
export type Recorte = (typeof RECORTES_DA_TRIAGEM)[number] | (typeof RECORTES_DO_SETOR)[number];

export const ROTULO_DO_RECORTE: Record<Recorte, string> = {
  triagem: "Triagem",
  pedidos: "Pedidos",
  minhas: "Minhas",
  todas: "Todas",
  sem_responsavel: "Sem responsável",
  aguardando: "Aguardando",
  do_setor: "Do setor",
  encerradas: "Encerradas",
};

/** Quantos dias as encerradas ficam na aba "Encerradas". */
export const DIAS_DAS_ENCERRADAS = 30;

/** Os recortes da lista para uma pessoa: os da triagem, os do setor, ou só "Minhas". */
export function recortesDe(e: { triagem: boolean; meus: readonly string[]; geridos: readonly string[] }): Recorte[] {
  const lista: Recorte[] = [];
  if (e.triagem) lista.push(...RECORTES_DA_TRIAGEM);
  if (e.meus.length > 0) {
    for (const r of RECORTES_DO_SETOR) {
      if (r === "do_setor" && e.geridos.length === 0) continue;
      if (!lista.includes(r)) lista.push(r);
    }
  } else if (e.triagem) {
    lista.push("aguardando", "encerradas");
  }
  if (lista.length === 0) lista.push("minhas", "aguardando", "encerradas");
  return lista;
}

export type CartaoParaRecorte = {
  situacao: Situacao;
  sectorCode: string | null;
  assignedToId: string | null;
  pedidoPendente: boolean;
};

/** O cartão entra neste recorte? É o mesmo corte do servidor, feito no navegador. */
export function noRecorte(
  c: CartaoParaRecorte,
  r: Recorte,
  quem: { userId: string; meus: readonly string[]; geridos: readonly string[]; triagem: boolean }
): boolean {
  const aberto = c.situacao !== "ENCERRADO";
  const meuSetor = !!c.sectorCode && quem.meus.includes(c.sectorCode);
  const minha = c.assignedToId === quem.userId;
  switch (r) {
    case "triagem":
      return c.situacao === "TRIAGEM";
    case "pedidos":
      return aberto && c.pedidoPendente;
    case "todas":
      return aberto;
    case "minhas":
      return aberto && minha;
    case "sem_responsavel":
      return c.situacao === "NO_SETOR" && meuSetor;
    case "aguardando":
      return c.situacao === "AGUARDANDO_CLIENTE" && (minha || meuSetor || quem.triagem);
    case "do_setor":
      return aberto && !!c.sectorCode && quem.geridos.includes(c.sectorCode);
    case "encerradas":
      return !aberto && (minha || meuSetor || quem.triagem);
  }
}

/** O recorte pedido na URL, se a pessoa pode vê-lo; senão, o primeiro dela. */
export function recorteValido(pedido: string | null | undefined, disponiveis: readonly Recorte[]): Recorte {
  return (disponiveis as readonly string[]).includes(pedido ?? "") ? (pedido as Recorte) : disponiveis[0]!;
}

/** Texto curto para a lista, numa linha. */
export function previa(texto: string, max = 90): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

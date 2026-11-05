// Acompanhar a Ceci, na Tech (lote C dos ajustes de 03/11/2026): se as
// respostas estão melhorando, como está o processamento e o que pede atenção.
//
// Só números e o texto do erro técnico — nunca o que foi perguntado. A conversa
// é da pessoa (decisão de 25/09); as respostas com 👎, que quem marcou aceitou
// mandar para revisão, continuam só em Configurações › IA › Respostas do chat.
//
// As contas são puras (testadas); `acompanhamentoDaCeci` só busca.

import { getPrisma } from "@/lib/prisma";
import { AGENTES_DO_CHAT, MOTIVOS_DO_NAO, ehMotivoDoNao, type MotivoDoNao } from "./chat/regras";
import { nomeDaAssistente, especialidadeDoAgente } from "./ceci";

export const SEMANAS = 8;
/** Chamada sem fim há mais que isto morreu no meio. */
export const TRAVADA_DEPOIS_DE_MS = 10 * 60 * 1000;
/** As falhas técnicas que a tela lista. */
const FALHAS_NA_TELA = 10;

const DIA_MS = 24 * 60 * 60 * 1000;

export type MensagemDaCeci = {
  role: "USUARIO" | "ASSISTENTE";
  failed: boolean;
  truncated: boolean;
  rating: "BOA" | "RUIM" | null;
  ratingReason: string | null;
  createdAt: Date;
  agentCode: string;
};

export type ChamadaDaCeci = {
  agentCode: string;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean | null;
  error: string | null;
  costCents: number | null;
};

export type SemanaDaCeci = {
  /** Segunda-feira da semana, "AAAA-MM-DD". */
  inicio: string;
  perguntas: number;
  boas: number;
  ruins: number;
  falhas: number;
  custoCents: number;
};

export type AgenteDaCeci = {
  agentCode: string;
  nome: string;
  chamadas: number;
  erros: number;
  travadas: number;
  mediaMs: number | null;
  p90Ms: number | null;
  custoCents: number;
  semCusto: number;
  boas: number;
  ruins: number;
  cortadas: number;
};

export type PontoDaCeci = { tom: "perigo" | "atencao" | "sucesso" | "neutro"; texto: string };

export const nomeDoAgente = (code: string) => nomeDaAssistente(especialidadeDoAgente(code) ?? code);

/** A segunda-feira (UTC) da semana do instante, como chave de dia. */
export function segundaDaSemana(d: Date): string {
  const dia = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const recuo = (dia.getUTCDay() + 6) % 7;
  return new Date(dia.getTime() - recuo * DIA_MS).toISOString().slice(0, 10);
}

/** As últimas `SEMANAS` semanas, da mais antiga para a atual, mesmo as vazias. */
export function semanasDaCeci(mensagens: MensagemDaCeci[], chamadas: ChamadaDaCeci[], agora: Date): SemanaDaCeci[] {
  const atual = segundaDaSemana(agora);
  const chaves = Array.from({ length: SEMANAS }, (_, i) => new Date(new Date(`${atual}T00:00:00Z`).getTime() - (SEMANAS - 1 - i) * 7 * DIA_MS).toISOString().slice(0, 10));
  const por = new Map(chaves.map((k) => [k, { inicio: k, perguntas: 0, boas: 0, ruins: 0, falhas: 0, custoCents: 0 }]));
  for (const m of mensagens) {
    const s = por.get(segundaDaSemana(m.createdAt));
    if (!s) continue;
    if (m.role === "USUARIO") s.perguntas++;
    if (m.failed) s.falhas++;
    if (m.rating === "BOA") s.boas++;
    if (m.rating === "RUIM") s.ruins++;
  }
  for (const c of chamadas) {
    const s = por.get(segundaDaSemana(c.startedAt));
    if (s && c.costCents) s.custoCents += c.costCents;
  }
  return chaves.map((k) => por.get(k)!);
}

function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)];
}

/** Processamento e avaliações por agente, no período. O de mais chamadas primeiro. */
export function agentesDaCeci(mensagens: MensagemDaCeci[], chamadas: ChamadaDaCeci[], agora: Date): AgenteDaCeci[] {
  const por = new Map<string, AgenteDaCeci & { tempos: number[] }>();
  const linha = (code: string) => {
    let l = por.get(code);
    if (!l) {
      l = { agentCode: code, nome: nomeDoAgente(code), chamadas: 0, erros: 0, travadas: 0, mediaMs: null, p90Ms: null, custoCents: 0, semCusto: 0, boas: 0, ruins: 0, cortadas: 0, tempos: [] };
      por.set(code, l);
    }
    return l;
  };
  for (const c of chamadas) {
    const l = linha(c.agentCode);
    l.chamadas++;
    if (c.ok === false) l.erros++;
    if (c.ok === null && c.finishedAt === null && agora.getTime() - c.startedAt.getTime() > TRAVADA_DEPOIS_DE_MS) l.travadas++;
    if (c.finishedAt && c.ok) l.tempos.push(c.finishedAt.getTime() - c.startedAt.getTime());
    if (c.costCents === null) l.semCusto++;
    else l.custoCents += c.costCents;
  }
  for (const m of mensagens) {
    if (m.role !== "ASSISTENTE") continue;
    const l = linha(m.agentCode);
    if (m.rating === "BOA") l.boas++;
    if (m.rating === "RUIM") l.ruins++;
    if (m.truncated) l.cortadas++;
  }
  return [...por.values()]
    .map(({ tempos, ...l }) => ({
      ...l,
      mediaMs: tempos.length ? Math.round(tempos.reduce((s, t) => s + t, 0) / tempos.length) : null,
      p90Ms: percentil(tempos, 90),
    }))
    .sort((a, b) => b.chamadas - a.chamadas || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Os motivos do 👎 no período, do mais comum ao menos. */
export function motivosDoNao(mensagens: MensagemDaCeci[]): { motivo: MotivoDoNao; rotulo: string; vezes: number }[] {
  const contagem = new Map<MotivoDoNao, number>();
  for (const m of mensagens) if (m.rating === "RUIM" && ehMotivoDoNao(m.ratingReason)) contagem.set(m.ratingReason, (contagem.get(m.ratingReason) ?? 0) + 1);
  return [...contagem.entries()].map(([motivo, vezes]) => ({ motivo, rotulo: MOTIVOS_DO_NAO[motivo], vezes })).sort((a, b) => b.vezes - a.vezes);
}

const pct = (parte: number, todo: number) => (todo ? Math.round((parte / todo) * 100) : 0);

/**
 * O que pede atenção, numa frase cada: piora das avaliações, agente que erra
 * muito, chamadas travadas, pergunta para setor sem Ceci, o motivo de 👎 que
 * mais aparece. Sem nada disso, uma linha dizendo que está tudo bem.
 */
export function pontosDaCeci({
  semanas,
  agentes,
  motivos,
  semIa,
  nomeDoSetor,
}: {
  semanas: SemanaDaCeci[];
  agentes: AgenteDaCeci[];
  motivos: { rotulo: string; vezes: number }[];
  semIa: Record<string, number>;
  nomeDoSetor: (codigo: string) => string;
}): PontoDaCeci[] {
  const pontos: PontoDaCeci[] = [];

  // Avaliação: as 4 últimas semanas contra as 4 anteriores.
  const metade = Math.floor(semanas.length / 2);
  const soma = (ss: SemanaDaCeci[]) => ss.reduce((a, s) => ({ boas: a.boas + s.boas, ruins: a.ruins + s.ruins }), { boas: 0, ruins: 0 });
  const antes = soma(semanas.slice(0, metade));
  const depois = soma(semanas.slice(metade));
  if (antes.boas + antes.ruins >= 5 && depois.boas + depois.ruins >= 5) {
    const a = pct(antes.boas, antes.boas + antes.ruins);
    const d = pct(depois.boas, depois.boas + depois.ruins);
    if (d <= a - 10) pontos.push({ tom: "perigo", texto: `As respostas boas caíram de ${a}% para ${d}% nas últimas 4 semanas.` });
    else if (d >= a + 10) pontos.push({ tom: "sucesso", texto: `As respostas boas subiram de ${a}% para ${d}% nas últimas 4 semanas.` });
  }

  for (const ag of agentes) {
    const avaliadas = ag.boas + ag.ruins;
    if (avaliadas >= 5 && pct(ag.ruins, avaliadas) >= 30) {
      pontos.push({ tom: "atencao", texto: `${ag.nome}: ${pct(ag.ruins, avaliadas)}% das respostas avaliadas levaram 👎 (${ag.ruins} de ${avaliadas}).` });
    }
    if (ag.chamadas >= 10 && pct(ag.erros, ag.chamadas) >= 5) {
      pontos.push({ tom: "perigo", texto: `${ag.nome}: ${ag.erros} de ${ag.chamadas} chamadas deram erro (${pct(ag.erros, ag.chamadas)}%).` });
    }
    if (ag.travadas > 0) {
      pontos.push({ tom: "atencao", texto: `${ag.nome}: ${ag.travadas} ${ag.travadas === 1 ? "chamada ficou" : "chamadas ficaram"} sem terminar.` });
    }
    if (ag.semCusto > 0) {
      pontos.push({ tom: "neutro", texto: `${ag.nome}: ${ag.semCusto} ${ag.semCusto === 1 ? "chamada" : "chamadas"} sem custo conhecido — o preço do modelo não está na tabela, e o teto não segura.` });
    }
  }

  const semCeci = Object.entries(semIa).sort((a, b) => b[1] - a[1])[0];
  if (semCeci && semCeci[1] >= 3) {
    pontos.push({ tom: "neutro", texto: `${semCeci[1]} perguntas foram para ${nomeDoSetor(semCeci[0])}, que ainda não tem Ceci — candidato ao próximo agente.` });
  }
  if (motivos[0] && motivos[0].vezes >= 3) {
    pontos.push({ tom: "neutro", texto: `O motivo de 👎 mais comum é “${motivos[0].rotulo}” (${motivos[0].vezes} vezes).` });
  }

  if (pontos.length === 0) pontos.push({ tom: "sucesso", texto: "Nada fora do normal no período." });
  return pontos;
}

/** Busca o período (as 8 semanas) e monta a tela. */
export async function acompanhamentoDaCeci(tenantId: string, agora = new Date()) {
  const desde = new Date(new Date(`${segundaDaSemana(agora)}T00:00:00Z`).getTime() - (SEMANAS - 1) * 7 * DIA_MS);
  const agentes = [...AGENTES_DO_CHAT];
  const prisma = getPrisma();
  const [mensagensBrutas, chamadas] = await Promise.all([
    prisma.agentMessage.findMany({
      where: { createdAt: { gte: desde }, conversation: { tenantId } },
      select: { role: true, failed: true, truncated: true, rating: true, ratingReason: true, createdAt: true, conversation: { select: { agentCode: true } } },
      take: 50_000,
    }),
    prisma.agentRun.findMany({
      where: { tenantId, agentCode: { in: agentes }, startedAt: { gte: desde } },
      select: { agentCode: true, startedAt: true, finishedAt: true, ok: true, error: true, costCents: true },
      orderBy: { startedAt: "desc" },
      take: 50_000,
    }),
  ]);
  const mensagens: MensagemDaCeci[] = mensagensBrutas.map((m) => ({ ...m, agentCode: m.conversation.agentCode }));
  // O processamento por agente olha os últimos 30 dias; a evolução, as 8 semanas.
  const trintaDias = new Date(agora.getTime() - 30 * DIA_MS);
  const falhas = chamadas
    .filter((c) => c.ok === false)
    .slice(0, FALHAS_NA_TELA)
    .map((c) => ({ agentCode: c.agentCode, nome: nomeDoAgente(c.agentCode), quando: c.startedAt, erro: (c.error ?? "sem mensagem").slice(0, 300) }));
  return {
    desde,
    semanas: semanasDaCeci(mensagens, chamadas, agora),
    agentes: agentesDaCeci(
      mensagens.filter((m) => m.createdAt >= trintaDias),
      chamadas.filter((c) => c.startedAt >= trintaDias),
      agora
    ),
    motivos: motivosDoNao(mensagens.filter((m) => m.createdAt >= trintaDias)),
    falhas,
  };
}

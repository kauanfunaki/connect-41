import type { HandoffEventType, HandoffSectorStatus } from "@/generated/prisma/enums";
import { formatInstantDate } from "@/lib/format";
import { abertaHa, setorParado } from "@/lib/handoffs";
import { aoSetor, doSetor, juntarNomes, resumir } from "@/lib/handoffTransicoes";

// A "Atividade" e a faixa de andamento da transferência aberta (10/11/2026,
// pedido do Kauan — escolha "B · Andamento no topo e a conversa ao lado").
// Sem Prisma: a página lê do banco e passa os dados crus; o texto de cada
// linha, os eventos deduzidos das transferências antigas e o resumo de cada
// setor saem daqui, e o teste confere.

export type EventoGuardado = {
  id: string;
  type: HandoffEventType;
  userId: string;
  handoffSectorId: string | null;
  body: string | null;
  createdAt: Date;
};

export type ParteDaAtividade = {
  id: string;
  sectorCode: string;
  status: HandoffSectorStatus;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ItemDaAtividade = {
  chave: string;
  tipo: HandoffEventType;
  quando: Date;
  /** Quem agiu; null no evento deduzido sem autor conhecido ("finalizada", das antigas). */
  autorId: string | null;
  /** O setor da parte (código), nos eventos de uma parte. */
  setorDaParte: string | null;
  /** O comentário, o motivo, a resposta ou o resumo da mudança. */
  texto: string | null;
  /**
   * Deduzido das datas guardadas, e não gravado na hora: as transferências de
   * antes de 10/11/2026 não têm histórico, e a tela diz isso na linha.
   */
  deduzido: boolean;
};

/**
 * Os itens da Atividade, do mais novo para o mais antigo. As transferências de
 * antes do histórico ganham, sem preenchimento retroativo no banco:
 * - "pediu a transferência", na data de criação, quando não há o evento;
 * - "parte finalizada", na data de finalização, para cada parte finalizada
 *   sem o evento (quem finalizou não ficou guardado).
 */
export function itensDaAtividade(
  transferencia: { createdAt: Date; requestedBy: string },
  partes: readonly ParteDaAtividade[],
  eventos: readonly EventoGuardado[]
): ItemDaAtividade[] {
  const setorDe = new Map(partes.map((p) => [p.id, p.sectorCode]));
  const itens: ItemDaAtividade[] = eventos.map((e) => ({
    chave: e.id,
    tipo: e.type,
    quando: e.createdAt,
    autorId: e.userId,
    setorDaParte: e.handoffSectorId ? (setorDe.get(e.handoffSectorId) ?? null) : null,
    texto: e.body,
    deduzido: false,
  }));

  if (!eventos.some((e) => e.type === "CREATED")) {
    itens.push({
      chave: "deduzido:pedido",
      tipo: "CREATED",
      quando: transferencia.createdAt,
      autorId: transferencia.requestedBy,
      setorDaParte: null,
      texto: null,
      deduzido: true,
    });
  }
  for (const p of partes) {
    if (p.status !== "DONE" || !p.resolvedAt) continue;
    if (eventos.some((e) => e.type === "DONE" && e.handoffSectorId === p.id)) continue;
    itens.push({
      chave: `deduzido:finalizada:${p.id}`,
      tipo: "DONE",
      quando: p.resolvedAt,
      autorId: null,
      setorDaParte: p.sectorCode,
      texto: null,
      deduzido: true,
    });
  }

  // Mais novo primeiro. No empate, o pedido fica por último (é o começo de tudo).
  return itens.sort((a, b) => b.quando.getTime() - a.quando.getTime() || Number(a.tipo === "CREATED") - Number(b.tipo === "CREATED"));
}

/**
 * O que a linha diz depois do nome de quem agiu: "começou a parte do Fiscal".
 * Sem autor (a finalização deduzida), a frase é a linha inteira.
 */
export function fraseDoItem(item: Pick<ItemDaAtividade, "tipo" | "setorDaParte" | "autorId">, rotulo: (codigo: string) => string): string {
  const setor = item.setorDaParte ? rotulo(item.setorDaParte) : null;
  const daParte = setor ? `a parte ${doSetor(setor)}` : "uma parte";
  switch (item.tipo) {
    case "CREATED":
      return "pediu a transferência";
    case "STARTED":
      return `começou ${daParte}`;
    case "DONE":
      return item.autorId ? `finalizou ${daParte}` : `${daParte.charAt(0).toUpperCase()}${daParte.slice(1)} foi finalizada`;
    case "RETURNED":
      return `devolveu ${daParte}`;
    case "RESENT":
      return setor ? `respondeu e reenviou ${aoSetor(setor)}` : "respondeu e reenviou";
    case "COMMENT":
      return "comentou";
    case "ASSIGNEES_CHANGED":
      return setor ? `mudou os responsáveis ${doSetor(setor)}` : "mudou os responsáveis";
    case "EDITED":
      return "editou a transferência";
    case "REOPENED":
      return `reabriu ${daParte}`;
  }
}

/** O rótulo do texto que vem com o evento, quando há ("Motivo", "Resposta"). */
export function rotuloDoTexto(tipo: HandoffEventType): string | null {
  if (tipo === "RETURNED") return "Motivo";
  if (tipo === "RESENT") return "Resposta";
  return null;
}

/**
 * O setor de quem agiu, para a linha "Paulo Lima · Contábil": a parte do
 * evento, quando a pessoa é dela; quem pediu, o setor de origem; o
 * responsável, a parte dele; senão o setor da pessoa que está na
 * transferência. Administrador sem setor fica sem.
 */
export function setorDeQuemAgiu(
  autorId: string,
  setorDaParte: string | null,
  contexto: {
    requestedBy: string;
    fromSector: string;
    partes: readonly { sectorCode: string; responsaveis: readonly string[] }[];
    setoresDaPessoa: readonly string[];
  }
): string | null {
  const { requestedBy, fromSector, partes, setoresDaPessoa } = contexto;
  const parte = setorDaParte ? partes.find((p) => p.sectorCode === setorDaParte) : undefined;
  if (parte && (setoresDaPessoa.includes(parte.sectorCode) || parte.responsaveis.includes(autorId))) return parte.sectorCode;
  if (autorId === requestedBy) return fromSector;
  const responde = partes.find((p) => p.responsaveis.includes(autorId));
  if (responde) return responde.sectorCode;
  const destino = partes.find((p) => setoresDaPessoa.includes(p.sectorCode));
  if (destino) return destino.sectorCode;
  if (setoresDaPessoa.includes(fromSector)) return fromSector;
  return setoresDaPessoa[0] ?? null;
}

// ─── A faixa de andamento ───────────────────────────────────────────────────

export type ResumoDaParte = {
  /** A frase da coluna: "Resolvendo com Paulo Lima · desde 9 de nov.". */
  texto: string;
  /** Âmbar quando parada; vermelho quando devolvida. */
  tom: "normal" | "atencao" | "perigo";
  parada: boolean;
};

const dataCurta = (d: Date) => formatInstantDate(d, { day: "numeric", month: "short" });

/** O último evento de um tipo numa parte. */
function ultimo(eventos: readonly EventoGuardado[], parteId: string, tipos: HandoffEventType[]): EventoGuardado | undefined {
  return [...eventos]
    .filter((e) => e.handoffSectorId === parteId && tipos.includes(e.type))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

/**
 * O que a coluna de um setor diz na faixa do topo: com quem está e desde
 * quando; quem finalizou e quando; ou o motivo resumido da devolução. "Parada"
 * (nova ou resolvendo há HANDOFF_PARADA_DIAS dias ou mais) vem em âmbar.
 */
export function resumoDaParte(
  parte: ParteDaAtividade & { responsaveis: readonly string[] },
  eventos: readonly EventoGuardado[],
  nome: (userId: string) => string,
  agora: Date
): ResumoDaParte {
  const parada = setorParado(parte, agora);
  const tomDaParada = parada ? "atencao" : "normal";
  const comQuem = parte.responsaveis.length > 0 ? `com ${juntarNomes(parte.responsaveis.map(nome))}` : "sem responsável";
  switch (parte.status) {
    case "NEW":
      return { texto: `Nova há ${abertaHa(parte.createdAt, agora)} · ${comQuem}`, tom: tomDaParada, parada };
    case "IN_PROGRESS": {
      // Desde o último "começou"/"reabriu"; nas antigas, a última mudança da parte.
      const desde = ultimo(eventos, parte.id, ["STARTED", "REOPENED"])?.createdAt ?? parte.updatedAt;
      return { texto: `Resolvendo ${comQuem} · desde ${dataCurta(desde)}`, tom: tomDaParada, parada };
    }
    case "DONE": {
      const fim = ultimo(eventos, parte.id, ["DONE"]);
      const quando = fim?.createdAt ?? parte.resolvedAt;
      const quem = fim ? ` por ${nome(fim.userId)}` : "";
      return { texto: `Finalizada${quem}${quando ? ` · ${dataCurta(quando)}` : ""}`, tom: "normal", parada: false };
    }
    case "RETURNED": {
      const motivo = ultimo(eventos, parte.id, ["RETURNED"])?.body;
      return { texto: motivo ? `Devolvida: ${resumir(motivo, 80)}` : "Devolvida", tom: "perigo", parada: false };
    }
  }
}

export type TrechoDoTexto = { texto: string; mencao: boolean };

/**
 * O comentário em trechos, com "@Nome Completo" marcado para a tela pintar de
 * azul. Só os nomes da lista (os do escritório), do mais longo para o mais
 * curto — "@Ana Paula" não vira "@Ana" + " Paula", a mesma regra de
 * `findMentionedUserIds`.
 */
export function trechosComMencao(texto: string, nomes: readonly string[]): TrechoDoTexto[] {
  if (!texto.includes("@") || nomes.length === 0) return [{ texto, mencao: false }];
  const ordenados = [...new Set(nomes)].filter(Boolean).sort((a, b) => b.length - a.length);
  const trechos: TrechoDoTexto[] = [];
  let inicio = 0;
  let i = 0;
  while (i < texto.length) {
    const nome = texto[i] === "@" ? ordenados.find((n) => texto.startsWith(n, i + 1)) : undefined;
    if (!nome) {
      i++;
      continue;
    }
    if (i > inicio) trechos.push({ texto: texto.slice(inicio, i), mencao: false });
    trechos.push({ texto: `@${nome}`, mencao: true });
    i += nome.length + 1;
    inicio = i;
  }
  if (inicio < texto.length) trechos.push({ texto: texto.slice(inicio), mencao: false });
  return trechos;
}

/** O motivo da última devolução de uma parte, inteiro — para o cartão de quem pediu. */
export function ultimaDevolucao(eventos: readonly EventoGuardado[], parteId: string): EventoGuardado | null {
  return ultimo(eventos, parteId, ["RETURNED"]) ?? null;
}

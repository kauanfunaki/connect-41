// Respostas estruturadas do candidato (R2): o que o atendente do WhatsApp
// pergunta e grava sozinho na candidatura — pretensão salarial, disponibilidade
// para começar e tempo de deslocamento até o local de trabalho.
//
// Decisões do Kauan em 23/09:
// - o bot pergunta a pretensão, mas nunca comenta, compara ou negocia;
// - grava sozinho, e só nestes três campos (exceção declarada em
//   `REGISTROS_AUTOMATICOS`, src/lib/ia/ferramentas.ts);
// - deslocamento é em minutos até o local — nunca endereço, bairro ou cidade,
//   pelo mesmo motivo que a triagem não usa cidade (proxy de classe).
//
// Nada disto entra na nota da triagem: é informação para o recrutador.
//
// Desde 23/09 o portal de vagas faz as mesmas três perguntas na inscrição
// (origem PORTAL). O WhatsApp consulta `faltaPerguntar` e não repete o que o
// candidato já respondeu no portal.

export const CAMPOS_DE_RESPOSTA = ["pretensaoSalarial", "disponibilidade", "deslocamentoMinutos"] as const;
export type CampoDeResposta = (typeof CAMPOS_DE_RESPOSTA)[number];

export const ROTULO_DA_RESPOSTA: Record<CampoDeResposta, string> = {
  pretensaoSalarial: "Pretensão salarial (mensal)",
  disponibilidade: "Disponibilidade para começar",
  deslocamentoMinutos: "Tempo até o local de trabalho",
};

export type OrigemDaResposta = "WHATSAPP" | "PORTAL" | "RECRUTADOR";
export type FonteDasRespostas = Partial<Record<CampoDeResposta, { origem: OrigemDaResposta; em: string }>>;

export type Respostas = {
  pretensaoSalarial: number | null;
  disponibilidade: string | null;
  deslocamentoMinutos: number | null;
};

const TETO_DE_PRETENSAO = 1_000_000;
const TETO_DE_DESLOCAMENTO = 600;

/**
 * O que é aproveitável num pedido de gravação. Campo ausente, nulo ou fora da
 * faixa fica de fora — e o fora da faixa é devolvido em `descartados`, para o
 * modelo saber que não gravou e perguntar de novo em vez de achar que sim.
 */
export function validarRespostas(v: unknown): { valores: Partial<Respostas>; descartados: CampoDeResposta[] } {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const valores: Partial<Respostas> = {};
  const descartados: CampoDeResposta[] = [];

  if (o.pretensaoSalarial !== undefined && o.pretensaoSalarial !== null && o.pretensaoSalarial !== "") {
    const n = Number(o.pretensaoSalarial);
    if (Number.isFinite(n) && n > 0 && n < TETO_DE_PRETENSAO) valores.pretensaoSalarial = Math.round(n * 100) / 100;
    else descartados.push("pretensaoSalarial");
  }
  if (typeof o.disponibilidade === "string" && o.disponibilidade.trim()) {
    valores.disponibilidade = o.disponibilidade.trim().replace(/\s+/g, " ").slice(0, 120);
  }
  if (o.deslocamentoMinutos !== undefined && o.deslocamentoMinutos !== null && o.deslocamentoMinutos !== "") {
    const n = Number(o.deslocamentoMinutos);
    if (Number.isFinite(n) && n >= 0 && n <= TETO_DE_DESLOCAMENTO) valores.deslocamentoMinutos = Math.round(n);
    else descartados.push("deslocamentoMinutos");
  }
  return { valores, descartados };
}

/**
 * O que o bot pode gravar agora. **O que o recrutador corrigiu à mão não é
 * sobrescrito pelo bot** — senão a correção sumiria na próxima mensagem do
 * candidato. O recrutador, ao contrário, sobrescreve qualquer coisa.
 */
export function aplicarRespostas(
  fonte: FonteDasRespostas,
  novos: Partial<Respostas>,
  origem: OrigemDaResposta,
  agora: Date
): { dados: Partial<Respostas>; fonte: FonteDasRespostas; gravados: CampoDeResposta[]; preservados: CampoDeResposta[] } {
  const dados: Partial<Respostas> = {};
  const nova: FonteDasRespostas = { ...fonte };
  const gravados: CampoDeResposta[] = [];
  const preservados: CampoDeResposta[] = [];
  for (const campo of CAMPOS_DE_RESPOSTA) {
    if (!(campo in novos)) continue;
    if (origem === "WHATSAPP" && fonte[campo]?.origem === "RECRUTADOR") {
      preservados.push(campo);
      continue;
    }
    (dados as Record<string, unknown>)[campo] = novos[campo];
    nova[campo] = { origem, em: agora.toISOString() };
    gravados.push(campo);
  }
  return { dados, fonte: nova, gravados, preservados };
}

/** O que ainda falta perguntar — o bot consulta antes de perguntar de novo o que já sabe. */
export function faltaPerguntar(r: Respostas): CampoDeResposta[] {
  return CAMPOS_DE_RESPOSTA.filter((c) => r[c] === null || r[c] === undefined);
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** "R$ 2.500 · 30 min · imediata" — para caber num card; nulo quando não há nada. */
export function resumoDasRespostas(r: Respostas): string | null {
  const partes = [
    r.pretensaoSalarial !== null ? REAIS.format(r.pretensaoSalarial) : null,
    r.deslocamentoMinutos !== null ? `${r.deslocamentoMinutos} min até o local` : null,
    r.disponibilidade,
  ].filter((x): x is string => !!x);
  return partes.length ? partes.join(" · ") : null;
}

export function lerFonte(v: unknown): FonteDasRespostas {
  if (!v || typeof v !== "object") return {};
  const out: FonteDasRespostas = {};
  for (const c of CAMPOS_DE_RESPOSTA) {
    const x = (v as Record<string, unknown>)[c] as { origem?: unknown; em?: unknown } | undefined;
    if (x && (x.origem === "WHATSAPP" || x.origem === "PORTAL" || x.origem === "RECRUTADOR") && typeof x.em === "string") {
      out[c] = { origem: x.origem, em: x.em };
    }
  }
  return out;
}

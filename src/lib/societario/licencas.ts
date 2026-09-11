// Licenças e taxas — o par do motor de processos.
//
// O processo é o **ato**; a licença é o **resultado que fica valendo**, e a
// validade dela é o que gera o próximo ato. Por isso a peça central aqui é a
// fila de renovação: o que vence primeiro, com antecedência suficiente para dar
// tempo de renovar.

/** Dias de antecedência com que uma licença entra na fila de renovação. */
export const AVISO_EM_DIAS = 60;

export type LicencaParaSituacao = {
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type SituacaoDaLicenca =
  | "revogada"
  /** Sem validade — inscrição municipal e afins. Não renova. */
  | "sem_validade"
  | "vigente"
  | "a_renovar"
  | "vencida";

/**
 * Em que estado a licença está.
 *
 * **`sem_validade` é estado próprio, e não "vigente para sempre".** Misturar os
 * dois encheria a fila de renovação de coisa que não renova — e a fila que
 * mostra o que não precisa ser feito é a fila que ninguém olha.
 *
 * Revogada vem antes de tudo: uma licença cassada pode ter data futura no
 * papel, e continuar aparecendo como vigente seria dizer ao setor que está
 * tudo bem com o que não está.
 */
export function situacaoDaLicenca(
  l: LicencaParaSituacao,
  hoje: Date,
  avisoEmDias = AVISO_EM_DIAS
): SituacaoDaLicenca {
  if (l.revokedAt) return "revogada";
  if (!l.expiresAt) return "sem_validade";

  const dias = diasAte(l.expiresAt, hoje);
  if (dias < 0) return "vencida";
  if (dias <= avisoEmDias) return "a_renovar";
  return "vigente";
}

/**
 * Dias inteiros entre hoje e a data, no fuso de São Paulo.
 *
 * Conta por **dia de calendário**, não por 24h corridas: uma licença que vence
 * hoje às 8h não está "vencida há 4 horas" para quem olha a tela às 12h — ela
 * vence hoje, e ainda dá para agir. Comparar instantes daria −1 e mandaria o
 * setor tratar como perdido o que ainda dá para resolver.
 */
export function diasAte(data: Date, hoje: Date): number {
  const a = chaveDoDia(hoje);
  const b = chaveDoDia(data);
  return Math.round((b - a) / 86_400_000);
}

function chaveDoDia(d: Date): number {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const n = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"));
}

export const SITUACAO_LABEL: Record<SituacaoDaLicenca, string> = {
  revogada: "Revogada",
  sem_validade: "Sem validade",
  vigente: "Vigente",
  a_renovar: "Renovar",
  vencida: "Vencida",
};

export const SITUACAO_VARIANTE: Record<SituacaoDaLicenca, "success" | "warning" | "danger" | "info"> = {
  revogada: "info",
  sem_validade: "info",
  vigente: "success",
  a_renovar: "warning",
  vencida: "danger",
};

export type LinhaDeLicenca = LicencaParaSituacao & { id: string };

/**
 * A ordem da fila de renovação.
 *
 * Vencida primeiro, depois o que está prestes a vencer — e dentro de cada grupo
 * a data mais próxima no topo. O que não renova (sem validade, revogada) vai
 * para o fim: está na lista para poder ser consultado, não para ser trabalhado.
 */
export function ordenarLicencas<T extends LinhaDeLicenca>(
  linhas: T[],
  hoje: Date,
  avisoEmDias = AVISO_EM_DIAS
): T[] {
  const peso: Record<SituacaoDaLicenca, number> = {
    vencida: 0,
    a_renovar: 1,
    vigente: 2,
    sem_validade: 3,
    revogada: 4,
  };
  return [...linhas].sort((a, b) => {
    const pa = peso[situacaoDaLicenca(a, hoje, avisoEmDias)];
    const pb = peso[situacaoDaLicenca(b, hoje, avisoEmDias)];
    if (pa !== pb) return pa - pb;
    // Sem validade não tem data a comparar: fica no fim do próprio grupo.
    const ta = a.expiresAt?.getTime() ?? Infinity;
    const tb = b.expiresAt?.getTime() ?? Infinity;
    return ta - tb;
  });
}

/** Quantas licenças pedem ação agora. É o número do cabeçalho da tela. */
export function contarPendentes(
  linhas: LinhaDeLicenca[],
  hoje: Date,
  avisoEmDias = AVISO_EM_DIAS
): { vencidas: number; aRenovar: number } {
  let vencidas = 0;
  let aRenovar = 0;
  for (const l of linhas) {
    const s = situacaoDaLicenca(l, hoje, avisoEmDias);
    if (s === "vencida") vencidas++;
    else if (s === "a_renovar") aRenovar++;
  }
  return { vencidas, aRenovar };
}

// ─── Taxas ───────────────────────────────────────────────────────────────────

export type TaxaParaTotal = {
  amountCents: number;
  paidAt: Date | null;
  /** A tentativa que gerou a guia. 1 é a primeira via; 2 em diante são voltas. */
  attempt: number | null;
};

export type CustoDoProcesso = {
  totalCentavos: number;
  pagoCentavos: number;
  /**
   * Quanto custaram as reapresentações.
   *
   * É o número que dá causa ao prazo: um processo que levou trinta dias e
   * custou duas guias a mais conta uma história que "trinta dias" sozinho não
   * conta. Só taxa de `attempt >= 2` entra — a primeira via é o caminho normal.
   */
  custoDasVoltasCentavos: number;
};

export function custoEmTaxas(taxas: TaxaParaTotal[]): CustoDoProcesso {
  let total = 0;
  let pago = 0;
  let voltas = 0;
  for (const t of taxas) {
    total += t.amountCents;
    if (t.paidAt) pago += t.amountCents;
    if (t.attempt !== null && t.attempt >= 2) voltas += t.amountCents;
  }
  return { totalCentavos: total, pagoCentavos: pago, custoDasVoltasCentavos: voltas };
}

// Juros e multa pelo atraso (22/10/2026, pedido do BPO). A empresa tem uma
// regra — multa em %, uma vez, quando paga depois do vencimento; juros em % ao
// mês, simples, pro rata por dia corrido; e, opcional, desconto em % para quem
// paga até o vencimento —, e o fornecedor ou cliente pode ter a dele, que passa
// por cima. A janela da baixa vem com juros, multa e desconto calculados por
// aqui; quem baixa ainda pode mudar. Sem regra, nada muda: os campos ficam em
// zero, como antes.
//
// A diferença da linha do extrato na conciliação (juros, desconto, parcial)
// não passa por aqui: lá quem diz o valor é o banco.
//
// Puro, sem banco. Percentuais em inteiros na escala de 10.000 (2,5% = 25.000)
// — as quatro casas da coluna `Decimal(7, 4)` —, para a conta ser exata.

/** 1% = 10.000: as quatro casas decimais da coluna. */
export const ESCALA_DO_PERCENTUAL = 10_000;
/** O mês dos juros pro rata: 30 dias corridos, como o boleto calcula a mora. */
export const DIAS_DO_MES = 30;
/** Maior percentual aceito em qualquer campo (juros de 100% ao mês já é absurdo). */
const MAXIMO = 100 * ESCALA_DO_PERCENTUAL;

export type RegraDeEncargos = {
  /** Multa, uma vez, na escala de 10.000. */
  multa: number;
  /** Juros ao mês, simples, na escala de 10.000. */
  jurosAoMes: number;
  /** Desconto até o vencimento, na escala de 10.000. */
  desconto: number;
};

export type RegraComOrigem = RegraDeEncargos & { origem: "contraparte" | "empresa" };

/** As colunas como o Prisma devolve (Decimal ou texto), na empresa e na contraparte. */
export type ColunasDaRegra = {
  lateFinePercent: { toString(): string } | null;
  lateInterestPercent: { toString(): string } | null;
  earlyDiscountPercent: { toString(): string } | null;
};

/** "2.5000" (como o banco guarda) → 25.000. Texto torto vira zero. */
function escalaDeDecimal(v: { toString(): string }): number {
  const [inteira, decimal = ""] = v.toString().trim().split(".");
  const n = Number(inteira) * ESCALA_DO_PERCENTUAL + Number(decimal.padEnd(4, "0").slice(0, 4));
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/** A regra gravada, ou `null` quando as três colunas estão vazias. Vazia com outra preenchida vale zero. */
export function regraDasColunas(c: ColunasDaRegra | null | undefined): RegraDeEncargos | null {
  if (!c || (c.lateFinePercent === null && c.lateInterestPercent === null && c.earlyDiscountPercent === null)) return null;
  const ler = (v: { toString(): string } | null) => (v === null ? 0 : escalaDeDecimal(v));
  return { multa: ler(c.lateFinePercent), jurosAoMes: ler(c.lateInterestPercent), desconto: ler(c.earlyDiscountPercent) };
}

/** A regra que vale para a conta: a do fornecedor ou cliente, se tem; senão a da empresa; senão nenhuma. */
export function regraQueVale(empresa: ColunasDaRegra | null | undefined, contraparte: ColunasDaRegra | null | undefined): RegraComOrigem | null {
  const propria = regraDasColunas(contraparte);
  if (propria) return { ...propria, origem: "contraparte" };
  const daEmpresa = regraDasColunas(empresa);
  return daEmpresa ? { ...daEmpresa, origem: "empresa" } : null;
}

/** Dias corridos de `deKey` até `ateKey` ("AAAA-MM-DD"); negativo quando `ateKey` vem antes. */
export function diasCorridos(deKey: string, ateKey: string): number {
  const utc = (k: string) => {
    const [a, m, d] = k.split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((utc(ateKey) - utc(deKey)) / 86_400_000);
}

/** `numerador / denominador`, arredondado ao centavo (meio para cima), sem perder precisão. */
function dividirArredondando(numerador: bigint, denominador: bigint): number {
  const dois = BigInt(2);
  return Number((numerador * dois + denominador) / (denominador * dois));
}

export type EncargosCalculados = {
  /** Dias depois do vencimento; zero quando paga no dia ou antes. */
  diasDeAtraso: number;
  jurosCentavos: number;
  multaCentavos: number;
  descontoCentavos: number;
};

const SEM_ENCARGOS: EncargosCalculados = { diasDeAtraso: 0, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0 };

/**
 * Juros, multa e desconto de uma baixa, sobre o valor baixado (o principal —
 * na parcial, sobre a parte que se paga). Pago no vencimento não tem juros nem
 * multa; o desconto vale até o vencimento, inclusive.
 */
export function encargosDaBaixa(
  b: { principalCentavos: number; vencimentoKey: string; pagamentoKey: string },
  regra: RegraDeEncargos | null
): EncargosCalculados {
  if (!regra || !Number.isSafeInteger(b.principalCentavos) || b.principalCentavos <= 0) return SEM_ENCARGOS;
  const dias = diasCorridos(b.vencimentoKey, b.pagamentoKey);
  if (!Number.isFinite(dias)) return SEM_ENCARGOS;
  const principal = BigInt(b.principalCentavos);
  const cem = BigInt(100 * ESCALA_DO_PERCENTUAL);
  if (dias <= 0) {
    return { ...SEM_ENCARGOS, descontoCentavos: regra.desconto > 0 ? dividirArredondando(principal * BigInt(regra.desconto), cem) : 0 };
  }
  return {
    diasDeAtraso: dias,
    multaCentavos: dividirArredondando(principal * BigInt(regra.multa), cem),
    jurosCentavos: dividirArredondando(principal * BigInt(regra.jurosAoMes) * BigInt(dias), cem * BigInt(DIAS_DO_MES)),
    descontoCentavos: 0,
  };
}

/**
 * O percentual digitado ("2", "2,5", "0,033", "1.5%") na escala de 10.000.
 * Vazio é `null` (sem valor); texto que não é percentual, com mais de quatro
 * casas ou acima de 100% é `undefined`.
 */
export function percentualDeTexto(texto: string | null | undefined): number | null | undefined {
  const t = (texto ?? "").replace(/%/g, "").replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(t)) return undefined;
  const n = escalaDeDecimal(t);
  return n <= MAXIMO ? n : undefined;
}

/** 25.000 → "2,5" — como o campo mostra. */
export function textoDoPercentual(escala: number): string {
  const inteira = Math.floor(escala / ESCALA_DO_PERCENTUAL);
  const decimal = String(escala % ESCALA_DO_PERCENTUAL).padStart(4, "0").replace(/0+$/, "");
  return decimal ? `${inteira},${decimal}` : String(inteira);
}

/** A coluna como o banco a recebe: "2.5000", ou `null`. */
function decimalDaEscala(escala: number | null): string | null {
  if (escala === null) return null;
  return `${Math.floor(escala / ESCALA_DO_PERCENTUAL)}.${String(escala % ESCALA_DO_PERCENTUAL).padStart(4, "0")}`;
}

export type RegraNoFormulario = { ok: true; dados: { lateFinePercent: string | null; lateInterestPercent: string | null; earlyDiscountPercent: string | null } } | { ok: false; erro: string };

/** Os três campos do formulário (`multa`, `juros`, `desconto`), conferidos, no formato das colunas. */
export function lerRegraDoFormulario(campo: (nome: "multa" | "juros" | "desconto") => string): RegraNoFormulario {
  const multa = percentualDeTexto(campo("multa"));
  const juros = percentualDeTexto(campo("juros"));
  const desconto = percentualDeTexto(campo("desconto"));
  if (multa === undefined) return { ok: false, erro: "Multa inválida: use um percentual de 0 a 100, com até 4 casas (ex.: 2 ou 2,5)." };
  if (juros === undefined) return { ok: false, erro: "Juros inválidos: use um percentual ao mês de 0 a 100, com até 4 casas (ex.: 1 ou 0,5)." };
  if (desconto === undefined) return { ok: false, erro: "Desconto inválido: use um percentual de 0 a 100, com até 4 casas (ex.: 5)." };
  return { ok: true, dados: { lateFinePercent: decimalDaEscala(multa), lateInterestPercent: decimalDaEscala(juros), earlyDiscountPercent: decimalDaEscala(desconto) } };
}

/** As colunas no formulário: "" para vazio, "2,5" para 2.5000. */
export function regraNoCampo(c: ColunasDaRegra | null | undefined): { multa: string; juros: string; desconto: string } {
  const t = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? "" : textoDoPercentual(escalaDeDecimal(v)));
  return { multa: t(c?.lateFinePercent), juros: t(c?.lateInterestPercent), desconto: t(c?.earlyDiscountPercent) };
}

/** "Multa de 2% · juros de 1% ao mês · desconto de 5% até o vencimento" — o que a tela diz da regra. */
export function descricaoDaRegra(r: RegraDeEncargos): string {
  const partes = [
    r.multa > 0 && `multa de ${textoDoPercentual(r.multa)}%`,
    r.jurosAoMes > 0 && `juros de ${textoDoPercentual(r.jurosAoMes)}% ao mês`,
    r.desconto > 0 && `desconto de ${textoDoPercentual(r.desconto)}% até o vencimento`,
  ].filter((p): p is string => typeof p === "string");
  if (partes.length === 0) return "Sem juros, multa nem desconto";
  const texto = partes.join(" · ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Licença-prêmio e aposentadoria do colaborador (27/11/2026, funcionalidade-763).
//
// Licença-prêmio: a convenção coletiva (ou o regulamento da empresa) dá, a cada
// tantos anos de casa, um número de dias de licença remunerada. O DP registra o
// gozo (a pessoa fica fora com o salário normal; no eSocial é o S-2230 motivo
// 16, licença remunerada) ou o pagamento em dinheiro dos dias não gozados, que
// entra na folha do mês como verba indenizatória (sem INSS, FGTS e IRRF:
// Súmula 136 do STJ e Lei 8.212/1991, art. 28, § 9º).
//
// Aposentadoria: o registro da aposentadoria do colaborador que continua
// trabalhando. Ele segue contribuindo para o INSS e com FGTS (Lei 8.212/1991,
// art. 12, § 4º). Na aposentadoria por incapacidade permanente o contrato fica
// suspenso (CLT art. 475; S-2230 motivo 06). A aposentadoria especial liga ao
// grau de exposição do contrato (o mesmo do S-2240): quem é exposto a agente
// nocivo gera o adicional do GILRAT (12%, 9% ou 6%) e o grauExp do S-1200, e
// quem se aposenta pela especial não pode continuar exposto (Lei 8.213/1991,
// art. 57, § 8º; STF, Tema 709).
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { mesesDeCasa } from "./niveis";

const ehData = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

// ─── Licença-prêmio ─────────────────────────────────────────────────────────

export type RegraDaLicencaPremio = { anos: number; dias: number };
export type TipoDeUsoDaLicenca = "LICENCA_PREMIO_GOZO" | "LICENCA_PREMIO_PAGA";
export type UsoDaLicencaPremio = { tipo: TipoDeUsoDaLicenca; data: string; dias: number };

export const NOME_DO_USO: Record<TipoDeUsoDaLicenca, string> = { LICENCA_PREMIO_GOZO: "Gozo", LICENCA_PREMIO_PAGA: "Paga em dinheiro" };

/** A regra da convenção: os dois campos juntos, ou nenhum (a convenção não tem licença-prêmio). */
export function lerRegraDaLicencaPremio(anos: number | null, dias: number | null): { ok: true; regra: RegraDaLicencaPremio | null } | { ok: false; erro: string } {
  if (anos === null && dias === null) return { ok: true, regra: null };
  if (anos === null || dias === null) return { ok: false, erro: "Licença-prêmio: informe os anos de casa e os dias de licença, ou deixe os dois em branco." };
  if (!Number.isInteger(anos) || anos < 1 || anos > 10) return { ok: false, erro: "Licença-prêmio: os anos de casa vão de 1 a 10." };
  if (!Number.isInteger(dias) || dias < 1 || dias > 180) return { ok: false, erro: "Licença-prêmio: os dias de licença vão de 1 a 180." };
  return { ok: true, regra: { anos, dias } };
}

/** Soma `anos` anos a uma data (29/02 vira 28/02 no ano comum). */
function somarAnos(iso: string, anos: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a + anos, m, 0)).getUTCDate();
  return `${a + anos}-${String(m).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

export type SaldoDaLicencaPremio = {
  /** Períodos completos de `regra.anos` anos de casa. */
  periodos: number;
  direito: number;
  gozados: number;
  pagos: number;
  saldo: number;
  /** A data em que completa o próximo período. */
  proximoPeriodo: string;
};

/** O saldo da licença-prêmio na data: os períodos adquiridos × os dias, menos os gozados e os pagos. */
export function saldoDaLicencaPremio(admissao: string, hoje: string, regra: RegraDaLicencaPremio, usos: readonly UsoDaLicencaPremio[]): SaldoDaLicencaPremio {
  const periodos = Math.floor(mesesDeCasa(admissao, hoje) / (regra.anos * 12));
  const direito = periodos * regra.dias;
  const gozados = usos.filter((u) => u.tipo === "LICENCA_PREMIO_GOZO").reduce((s, u) => s + u.dias, 0);
  const pagos = usos.filter((u) => u.tipo === "LICENCA_PREMIO_PAGA").reduce((s, u) => s + u.dias, 0);
  return { periodos, direito, gozados, pagos, saldo: direito - gozados - pagos, proximoPeriodo: somarAnos(admissao, (periodos + 1) * regra.anos) };
}

/** Lê o gozo ou o pagamento: os dias cabem no saldo. */
export function lerUsoDaLicencaPremio(e: { tipo: string; data: string; dias: string }, saldo: number): { ok: true; uso: UsoDaLicencaPremio } | { ok: false; erro: string } {
  const tipo = e.tipo === "LICENCA_PREMIO_GOZO" || e.tipo === "LICENCA_PREMIO_PAGA" ? e.tipo : null;
  if (!tipo) return { ok: false, erro: "Escolha gozo ou pagamento em dinheiro." };
  if (!ehData(e.data)) return { ok: false, erro: tipo === "LICENCA_PREMIO_GOZO" ? "Informe o primeiro dia do gozo." : "Informe a data do pagamento (o mês da folha em que entra)." };
  const dias = Number(e.dias);
  if (!Number.isInteger(dias) || dias < 1) return { ok: false, erro: "Informe os dias da licença." };
  if (dias > saldo) return { ok: false, erro: saldo > 0 ? `O saldo de licença-prêmio é de ${saldo} dia(s).` : "Sem saldo de licença-prêmio: a pessoa ainda não completou um período." };
  return { ok: true, uso: { tipo, data: e.data, dias } };
}

/** O último dia do gozo. */
export function fimDoGozo(u: Pick<UsoDaLicencaPremio, "data" | "dias">): string {
  const d = new Date(`${u.data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(1, u.dias) - 1);
  return d.toISOString().slice(0, 10);
}

/** Os dias de licença-prêmio pagos em dinheiro na folha do mês (a data do pagamento cai no mês). */
export function diasDeLicencaPagosNoMes(usos: readonly UsoDaLicencaPremio[], ano: number, mes: number): number {
  const prefixo = `${ano}-${String(mes).padStart(2, "0")}-`;
  return usos.filter((u) => u.tipo === "LICENCA_PREMIO_PAGA" && u.data.startsWith(prefixo)).reduce((s, u) => s + u.dias, 0);
}

// ─── Aposentadoria ──────────────────────────────────────────────────────────

export const TIPOS_DE_APOSENTADORIA: Record<string, string> = {
  IDADE: "Por idade",
  TEMPO: "Por tempo de contribuição",
  PROGRAMADA: "Programada (EC 103/2019)",
  ESPECIAL: "Especial",
  INCAPACIDADE: "Por incapacidade permanente (invalidez)",
};

export type Aposentadoria = { tipo: string; data: string; beneficio: string | null };

export function lerAposentadoria(e: { tipo: string; data: string; beneficio: string }): { ok: true; aposentadoria: Aposentadoria } | { ok: false; erro: string } {
  if (!TIPOS_DE_APOSENTADORIA[e.tipo]) return { ok: false, erro: "Escolha o tipo da aposentadoria." };
  if (!ehData(e.data)) return { ok: false, erro: "Informe a data de início do benefício (DIB)." };
  const beneficio = e.beneficio.replace(/\D/g, "");
  if (beneficio && beneficio.length !== 10) return { ok: false, erro: "O número do benefício (NB) tem 10 algarismos." };
  return { ok: true, aposentadoria: { tipo: e.tipo, data: e.data, beneficio: beneficio || null } };
}

/**
 * O grau de exposição a agente nocivo (grauExp do S-1200), conforme o LTCAT:
 * 1 = não exposto; 2, 3 e 4 = aposentadoria especial aos 15, 20 ou 25 anos.
 */
export const GRAUS_DE_EXPOSICAO: Record<string, string> = {
  "1": "Não exposto (sem aposentadoria especial)",
  "2": "Aposentadoria especial aos 15 anos (adicional de 12%)",
  "3": "Aposentadoria especial aos 20 anos (adicional de 9%)",
  "4": "Aposentadoria especial aos 25 anos (adicional de 6%)",
};

/** Lei 8.212/1991, art. 22, II, e Lei 8.213/1991, art. 57, § 6º. */
export const ADICIONAL_DA_ESPECIAL: Readonly<Record<string, number>> = { "2": 12, "3": 9, "4": 6 };

export const expostoANocivo = (grau: string | null | undefined) => !!grau && ADICIONAL_DA_ESPECIAL[grau] !== undefined;

/** O adicional do GILRAT para a aposentadoria especial, sobre a base do INSS da pessoa. */
export function adicionalDaAposentadoriaEspecial(base: number, grau: string | null | undefined): { valor: number; aliquota: number } {
  const aliquota = grau ? (ADICIONAL_DA_ESPECIAL[grau] ?? 0) : 0;
  return { valor: r2((base * aliquota) / 100), aliquota };
}

/** Os avisos do cálculo para quem é aposentado. */
export function alertasDaAposentadoria(a: { tipo: string; desde: string } | null | undefined, grau: string | null | undefined): string[] {
  if (!a) return [];
  const nome = (TIPOS_DE_APOSENTADORIA[a.tipo] ?? a.tipo).toLowerCase();
  const alertas: string[] = [];
  if (a.tipo === "INCAPACIDADE") {
    alertas.push(`Aposentado(a) por incapacidade permanente desde ${br(a.desde)}: o contrato fica suspenso (CLT art. 475). O salário sai pelo afastamento do S-2230 motivo 06.`);
  } else {
    alertas.push(`Aposentado(a) ${nome} desde ${br(a.desde)}: continua com o INSS e o FGTS normais (Lei 8.212/1991, art. 12, § 4º).`);
  }
  if (a.tipo === "ESPECIAL" && expostoANocivo(grau)) {
    alertas.push("Aposentadoria especial com exposição a agente nocivo no contrato: quem se aposenta pela especial não pode continuar exposto (Lei 8.213/1991, art. 57, § 8º; STF, Tema 709). Mude a função ou o grau de exposição.");
  }
  return alertas;
}

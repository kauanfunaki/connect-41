// Os dados do trabalhador que o eSocial pede e o cadastro da pessoa não tem
// (12/11/2026, DP 2 fase 3b). Ficam no contrato do DP 2 (`dadosEsocial`, JSON),
// com as listas das tabelas do eSocial para a tela.
//
// Puro, sem banco.

export type DadosEsocialDoVinculo = {
  /** "M" ou "F". */
  sexo: string | null;
  /** Raça/cor: 1 branca, 2 preta, 3 parda, 4 amarela, 5 indígena, 6 não informado. */
  racaCor: string | null;
  /** Estado civil: 1 solteiro, 2 casado, 3 divorciado, 4 separado, 5 viúvo. */
  estadoCivil: string | null;
  /** Grau de instrução (01 a 12). */
  grauInstrucao: string | null;
  /** Município do endereço, código IBGE de 7 dígitos. */
  codigoMunicipio: string | null;
  /** CBO do cargo (6 dígitos). */
  cbo: string | null;
  /** Tipo de contrato: 1 prazo indeterminado, 2 prazo determinado (por dias), 3 determinado por fato. */
  tipoContrato: string | null;
  /** "AAAA-MM-DD", no contrato por prazo determinado. */
  dataTermino: string | null;
  /** Tipo de jornada (Tabela do eSocial): 2 12x36, 3 fixa com folga fixa no domingo, 9 demais. */
  tipoJornada: string | null;
  /** A jornada por extenso ("Segunda a sexta, 08:00 às 17:48, 1h de intervalo"). */
  descricaoJornada: string | null;
};

export const DADOS_VAZIOS: DadosEsocialDoVinculo = {
  sexo: null,
  racaCor: null,
  estadoCivil: null,
  grauInstrucao: null,
  codigoMunicipio: null,
  cbo: null,
  tipoContrato: "1",
  dataTermino: null,
  tipoJornada: null,
  descricaoJornada: null,
};

export const SEXOS: [string, string][] = [
  ["M", "Masculino"],
  ["F", "Feminino"],
];

export const RACAS: [string, string][] = [
  ["1", "Branca"],
  ["2", "Preta"],
  ["3", "Parda"],
  ["4", "Amarela"],
  ["5", "Indígena"],
  ["6", "Não informada"],
];

export const ESTADOS_CIVIS: [string, string][] = [
  ["1", "Solteiro(a)"],
  ["2", "Casado(a)"],
  ["3", "Divorciado(a)"],
  ["4", "Separado(a)"],
  ["5", "Viúvo(a)"],
];

export const GRAUS_DE_INSTRUCAO: [string, string][] = [
  ["01", "Analfabeto"],
  ["02", "Até o 5º ano incompleto do fundamental"],
  ["03", "5º ano completo do fundamental"],
  ["04", "Do 6º ao 9º ano do fundamental incompleto"],
  ["05", "Fundamental completo"],
  ["06", "Médio incompleto"],
  ["07", "Médio completo"],
  ["08", "Superior incompleto"],
  ["09", "Superior completo"],
  ["10", "Pós-graduação"],
  ["11", "Mestrado"],
  ["12", "Doutorado"],
];

export const TIPOS_DE_CONTRATO: [string, string][] = [
  ["1", "Prazo indeterminado"],
  ["2", "Prazo determinado (por dias)"],
  ["3", "Prazo determinado (vinculado a fato)"],
];

export const TIPOS_DE_JORNADA: [string, string][] = [
  ["2", "12x36"],
  ["3", "Horário fixo, folga fixa no domingo"],
  ["4", "Horário fixo, folga fixa fora do domingo"],
  ["7", "Turno ininterrupto de revezamento"],
  ["9", "Demais tipos de jornada"],
];

const de = (lista: [string, string][], v: unknown) => (typeof v === "string" && lista.some(([k]) => k === v) ? v : null);

export function lerDadosEsocial(bruto: unknown): DadosEsocialDoVinculo {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const digitos = (v: unknown, n: number) => {
    const d = typeof v === "string" ? v.replace(/\D/g, "") : "";
    return d.length === n ? d : null;
  };
  return {
    sexo: de(SEXOS, o.sexo),
    racaCor: de(RACAS, o.racaCor),
    estadoCivil: de(ESTADOS_CIVIS, o.estadoCivil),
    grauInstrucao: de(GRAUS_DE_INSTRUCAO, o.grauInstrucao),
    codigoMunicipio: digitos(o.codigoMunicipio, 7),
    cbo: digitos(o.cbo, 6),
    tipoContrato: de(TIPOS_DE_CONTRATO, o.tipoContrato) ?? "1",
    dataTermino: typeof o.dataTermino === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.dataTermino) ? o.dataTermino : null,
    tipoJornada: de(TIPOS_DE_JORNADA, o.tipoJornada),
    descricaoJornada: texto(o.descricaoJornada, 999),
  };
}

/** O grau de instrução sugerido pela escolaridade escrita no cadastro ("Superior completo em…"). */
export function sugerirGrauDeInstrucao(escolaridade: string | null | undefined): string | null {
  const t = (escolaridade ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (!t.trim()) return null;
  if (/doutorado/.test(t)) return "12";
  if (/mestrado/.test(t)) return "11";
  if (/pos|mba|especializa/.test(t)) return "10";
  const incompleto = /incompleto|cursando/.test(t);
  if (/superior|graduac|faculdade|tecnologo|bacharel|licenciatura/.test(t)) return incompleto ? "08" : "09";
  if (/medio|tecnico|2o grau|segundo grau/.test(t)) return incompleto ? "06" : "07";
  if (/fundamental|1o grau|primeiro grau/.test(t)) return incompleto ? "04" : "05";
  if (/analfabet/.test(t)) return "01";
  return null;
}

/** Horas semanais a partir das mensais (220 → 44). */
export function horasSemanais(horasMensais: number): number {
  return Math.round((horasMensais / 5) * 100) / 100;
}

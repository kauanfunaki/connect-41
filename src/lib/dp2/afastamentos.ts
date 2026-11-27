// Afastamentos no cálculo da folha (25/11/2026, funcionalidade-749, entrega 1).
//
// O afastamento é o S-2230 que o DP gera em DP 2 › eSocial (início, motivo da
// Tabela 18 e, quando já se sabe, o fim). No mês, cada afastamento conta:
// - doença ou acidente (motivos 01 e 03): os primeiros 15 dias são da empresa
//   (salário normal); do 16º em diante o INSS paga o benefício e o salário
//   desses dias sai da folha;
// - licença-maternidade (17): a empresa paga o salário-maternidade na folha e
//   deduz na DCTFWeb; o salário continua e o cálculo avisa da dedução;
// - outros motivos: o cálculo avisa para o DP conferir o efeito.
//
// No acidente do trabalho (01) o FGTS continua sobre o salário que a pessoa
// receberia: o cálculo avisa para lançar a base (entrega seguinte).
//
// Puro, sem banco.

export type AfastamentoDaPessoa = { motivo: string; inicio: string; fim: string | null };

export type AfastamentoNoMes = {
  motivo: string;
  inicio: string;
  fim: string | null;
  /** Dias do afastamento no mês que a empresa paga (os 15 primeiros, na doença). */
  diasEmpresa: number;
  /** Dias do afastamento no mês pagos pelo INSS: saem do salário. */
  diasInss: number;
  /** Dias de licença-maternidade no mês (salário-maternidade pago pela empresa). */
  diasMaternidade: number;
  /** O mês inteiro está dentro do afastamento. */
  mesInteiro: boolean;
  alerta: string | null;
};

const DIA = 86_400_000;
const data = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
export const NOME_DO_MOTIVO: Record<string, string> = {
  "01": "acidente ou doença do trabalho",
  "03": "doença",
  "06": "aposentadoria por incapacidade permanente",
  "16": "licença remunerada",
  "17": "licença-maternidade",
};

/** Lê os afastamentos dos XML de S-2230 da pessoa; o mesmo início com fim informado depois vale o mais recente. */
export function afastamentosDosXml(xmls: readonly string[]): AfastamentoDaPessoa[] {
  const porInicio = new Map<string, AfastamentoDaPessoa>();
  for (const xml of xmls) {
    const inicio = /<dtIniAfast>(\d{4}-\d{2}-\d{2})<\/dtIniAfast>/.exec(xml)?.[1];
    const motivo = /<codMotAfast>(\d{2})<\/codMotAfast>/.exec(xml)?.[1];
    if (!inicio || !motivo) continue;
    const fim = /<dtTermAfast>(\d{4}-\d{2}-\d{2})<\/dtTermAfast>/.exec(xml)?.[1] ?? null;
    const ja = porInicio.get(inicio);
    porInicio.set(inicio, { motivo, inicio, fim: fim ?? ja?.fim ?? null });
  }
  return [...porInicio.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** O que cada afastamento faz no mês. `fim` nulo = segue afastado. */
export function afastamentosNoMes(afastamentos: readonly AfastamentoDaPessoa[], ano: number, mes: number): AfastamentoNoMes[] {
  const inicioDoMes = Date.UTC(ano, mes - 1, 1);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const fimDoMes = Date.UTC(ano, mes - 1, ultimo);
  const saida: AfastamentoNoMes[] = [];
  for (const a of afastamentos) {
    const ini = data(a.inicio);
    // O fim do afastamento é o último dia afastado (o retorno é o dia seguinte).
    const fim = a.fim ? data(a.fim) : Infinity;
    if (ini > fimDoMes || fim < inicioDoMes) continue;
    const de = Math.max(ini, inicioDoMes);
    const ate = Math.min(fim, fimDoMes);
    const dias = Math.round((ate - de) / DIA) + 1;
    const mesInteiro = de === inicioDoMes && ate === fimDoMes;
    let diasEmpresa = 0;
    let diasInss = 0;
    let diasMaternidade = 0;
    let alerta: string | null = null;
    if (a.motivo === "01" || a.motivo === "03") {
      // Dias 1 a 15 do afastamento são da empresa.
      const fimDaEmpresa = ini + 14 * DIA;
      diasEmpresa = Math.max(0, Math.round((Math.min(ate, fimDaEmpresa) - de) / DIA) + 1);
      diasInss = dias - diasEmpresa;
      if (a.motivo === "01" && diasInss > 0) alerta = `Afastamento por acidente do trabalho desde ${br(a.inicio)}: o FGTS continua sobre o salário dos ${diasInss} dia(s) pagos pelo INSS. Lance a base do FGTS até o Connect calcular sozinho.`;
    } else if (a.motivo === "06") {
      // Aposentadoria por incapacidade permanente (funcionalidade-763): o contrato fica suspenso (CLT art. 475).
      diasInss = dias;
      alerta = `Aposentadoria por incapacidade permanente desde ${br(a.inicio)}: o contrato fica suspenso e o salário de ${dias} dia(s) deste mês sai da folha.`;
    } else if (a.motivo === "16") {
      // Licença remunerada (licença-prêmio, funcionalidade-763): o salário segue normal.
      diasEmpresa = dias;
      alerta = `Licença remunerada desde ${br(a.inicio)} (${dias} dia(s) no mês): o salário segue normal.`;
    } else if (a.motivo === "17") {
      diasMaternidade = dias;
      alerta = `Licença-maternidade desde ${br(a.inicio)}: o salário de ${dias} dia(s) deste mês é salário-maternidade, deduzido do INSS na DCTFWeb.`;
    } else {
      alerta = `Afastamento (motivo ${a.motivo}) desde ${br(a.inicio)} com ${dias} dia(s) no mês: o cálculo pagou o salário normal. Confira se o motivo tira dias do salário.`;
    }
    saida.push({ motivo: a.motivo, inicio: a.inicio, fim: a.fim, diasEmpresa, diasInss, diasMaternidade, mesInteiro, alerta });
  }
  return saida;
}

/**
 * Os dias (no mês comercial de 30) que saem do salário: o mês inteiro pelo
 * INSS vira 30, mesmo nos meses de 31 dias ou em fevereiro.
 */
export function diasPeloInss(afastamentos: readonly AfastamentoNoMes[]): number {
  if (afastamentos.some((a) => a.mesInteiro && a.diasInss > 0 && a.diasEmpresa === 0)) return 30;
  return Math.min(30, afastamentos.reduce((s, a) => s + a.diasInss, 0));
}

// As fórmulas do DP 2 (18/11/2026, funcionalidade-778): a aba Cálculos do
// Apoio, que só o DP 2 vê, mostra cada conta que o motor faz.
//
// Uma fonte só: o texto de cada fórmula mora aqui, e o exemplo dela não é
// escrito à mão — sai da memória de cálculo do próprio motor (`calcularMes`,
// `calcularFerias`, `calcularDecimo`, `calcularRescisaoDoDp2`…) rodando um
// cenário fixo com as tabelas da competência escolhida. Se a conta mudar no
// motor, o exemplo muda junto. O teste (`formulas.test.ts`) exige fórmula
// para todo papel de rubrica: rubrica nova sem fórmula quebra o build.
//
// Regra: quem muda ou cria um cálculo no DP 2 atualiza este catálogo no mesmo PR.
//
// Puro, sem banco.

import { diasDoMes } from "./calendario";
import { INSS_CONTRIBUINTE_INDIVIDUAL } from "./categorias";
import { calcularDecimo, type CalculoDoDecimo } from "./decimo";
import { calcularFerias, type CalculoDeFerias } from "./ferias";
import { NOME_DA_SITUACAO_DO_PERIODO, feriasNoMes, periodosAquisitivos } from "./periodosDeFerias";
import { reais, pct } from "./formato";
import { calcularInss, calcularIrrf, type ResultadoIrrf } from "./impostos";
import { mediaDeVariaveis } from "./medias";
import {
  calcularEncargos,
  CONVENCAO_DA_CLT,
  FGTS_ALIQUOTA,
  FGTS_ALIQUOTA_APRENDIZ,
  INSS_EMPRESA_ALIQUOTA,
  VALE_TRANSPORTE_PCT,
  type CalculoDaPessoa,
  type EmpresaDoMotor,
  type Encargos,
  type EventoDoMotor,
  type ItemDoHolerite,
  type VinculoDoMotor,
} from "./mensal";
import { calcularRescisaoDoDp2, type CalculoDaRescisao } from "./rescisao";
import { RUBRICAS_PADRAO, type PapelDaRubrica, type RubricaDoMotor } from "./rubricas";
import { calcularMesDaCategoria } from "./semVinculo";
import type { TabelasDaCompetencia } from "./tabelas";

// ─── Os temas ───────────────────────────────────────────────────────────────

export type TemaDaFormula = "MENSAL" | "IMPOSTOS" | "ENCARGOS" | "MEDIAS" | "FERIAS" | "DECIMO" | "RESCISAO" | "SEM_VINCULO";

/** `aba`: o rótulo curto da aba; `titulo`: o da seção aberta. */
export const TEMAS: readonly { tema: TemaDaFormula; aba: string; titulo: string; apoio: string }[] = [
  { tema: "MENSAL", aba: "Mensal", titulo: "Folha mensal", apoio: "Proventos e descontos do mês, na ordem em que o motor calcula." },
  { tema: "IMPOSTOS", aba: "Impostos", titulo: "INSS, IRRF e FGTS", apoio: "Os descontos legais e o depósito do FGTS, pelas tabelas da competência." },
  { tema: "ENCARGOS", aba: "Encargos", titulo: "Encargos da empresa e provisões", apoio: "O que a empresa paga além do holerite e o que reserva para férias e 13º." },
  { tema: "MEDIAS", aba: "Médias", titulo: "Média de variáveis", apoio: "O que entra em férias, 13º e rescisão a partir das competências fechadas." },
  { tema: "FERIAS", aba: "Férias", titulo: "Férias", apoio: "O recibo de férias: gozo, 1/3, abono e os descontos em separado do mês." },
  { tema: "DECIMO", aba: "13º", titulo: "13º salário", apoio: "As duas parcelas, por avos do ano." },
  { tema: "RESCISAO", aba: "Rescisão", titulo: "Rescisão", apoio: "As verbas do desligamento e o que incide em cada uma." },
  { tema: "SEM_VINCULO", aba: "Sem vínculo", titulo: "Sem vínculo de emprego", apoio: "Sócio com pró-labore, autônomo por RPA e estagiário." },
];

// ─── Os cenários dos exemplos ───────────────────────────────────────────────

/** Os resultados do motor nos cenários fixos, de onde sai o exemplo de cada fórmula. */
export type ExemplosDoMotor = {
  competencia: string;
  diasUteis: number;
  diasDeDescanso: number;
  /** Mensalista com variáveis, insalubridade e vale-transporte. */
  clt: CalculoDaPessoa;
  /** Admitido no dia 11 do mês, com 2 filhos: salário proporcional e salário-família. */
  proporcional: CalculoDaPessoa;
  /** Horista com periculosidade. */
  horista: CalculoDaPessoa;
  /** Os encargos do mensalista se a empresa fosse do Simples (patronal no DAS). */
  encargosSimples: Encargos;
  /** O IRRF de um salário alto, para o exemplo mostrar imposto descontado. */
  irrfAlto: ResultadoIrrf;
  media: ReturnType<typeof mediaDeVariaveis>;
  /** O mensalista que contribui para a previdência complementar (funcionalidade-762). */
  previdencia: CalculoDaPessoa;
  /** O mensalista que recebe diferenças de convenção de meses anteriores e salário-família retroativo (funcionalidade-760). */
  diferencas: CalculoDaPessoa;
  /** O mensalista que autorizou a contribuição sindical, no mês da convenção (funcionalidade-774). */
  sindical: CalculoDaPessoa;
  /** O mensalista no plano de saúde com 2 dependentes, no odontológico e com coparticipação no mês (funcionalidade-762). */
  planoDeSaude: CalculoDaPessoa;
  /** O mensalista que recebe 30 dias de licença-prêmio em dinheiro e é exposto a agente nocivo, aposentadoria aos 25 anos (funcionalidade-763). */
  licencaPremio: CalculoDaPessoa;
  ferias: CalculoDeFerias;
  /** A folha do mês das férias do exemplo (gozo de 20 dias a partir do dia 3). */
  feriasNaFolha: CalculoDaPessoa | null;
  decimo1: CalculoDoDecimo;
  decimo2: CalculoDoDecimo;
  /** Dispensa sem justa causa, aviso indenizado, 1 período vencido. */
  rescisao: CalculoDaRescisao;
  /** Pedido de demissão sem cumprir o aviso. */
  pedido: CalculoDaRescisao;
  proLabore: CalculoDaPessoa;
  autonomo: CalculoDaPessoa;
  estagiario: CalculoDaPessoa;
};

/** O cenário de cada exemplo, em palavras, para o DP montar o mesmo na Domínio. */
export const CENARIOS: readonly { nome: string; descricao: string }[] = [
  {
    nome: "Mensalista",
    descricao:
      "Salário R$ 3.000,00, 220 h, insalubridade grau médio, vale-transporte, 1 dependente de IRRF. No mês: 10 h extras 50%, 4 h extras 100%, 20 h noturnas, 1 falta com o DSR, 2 h de atraso, comissão de R$ 500,00, pensão de R$ 300,00 e adiantamento de R$ 1.200,00. No contrato, uma gratificação fixa de R$ 200,00. Convenção da CLT (50%, 100% e 20%). Empresa do lucro presumido: RAT 2%, FAP 1, terceiros 5,8%.",
  },
  { nome: "Admitido no mês", descricao: "Salário de R$ 1.700,00, admitido no dia 11, 2 filhos com direito ao salário-família." },
  { nome: "Horista", descricao: "R$ 12,00 a hora, 220 h no mês, com periculosidade." },
  { nome: "IRRF alto", descricao: "Salário de R$ 8.000,00 sem dependentes, só para o exemplo do IRRF mostrar imposto descontado." },
  { nome: "Média", descricao: "Três competências fechadas com R$ 450,00, R$ 600,00 e R$ 300,00 de variáveis que entram na média." },
  { nome: "Férias", descricao: "Salário R$ 3.000,00, a média acima, 20 dias de gozo e 10 de abono, sem faltas, começando no dia 3 do mês." },
  { nome: "13º", descricao: "Salário R$ 3.000,00, a média acima, admitido em 10/03 do ano; 1ª parcela paga em novembro." },
  {
    nome: "Rescisão",
    descricao: "Salário R$ 3.000,00, admitido em 10/03 três anos antes, desligado no dia 15 do mês. Dispensa sem justa causa com aviso indenizado, 1 período de férias vencido, saldo do FGTS de R$ 12.000,00. Pedido de demissão: o mesmo contrato, sem cumprir o aviso.",
  },
  { nome: "Sem vínculo", descricao: "Pró-labore de R$ 5.000,00 (723), serviço por RPA de R$ 2.000,00 (701) e bolsa de estágio de R$ 1.500,00 (901)." },
];

const RUBRICAS_DO_MOTOR: ReadonlyMap<PapelDaRubrica, RubricaDoMotor> = new Map(
  RUBRICAS_PADRAO.filter((r): r is RubricaDoMotor & { papel: PapelDaRubrica } => r.papel !== null).map((r) => [r.papel, r])
);
const COMISSAO = RUBRICAS_PADRAO.find((r) => r.codigo === "009")!;
const GRATIFICACAO = RUBRICAS_PADRAO.find((r) => r.codigo === "010")!;

const SALARIO_ALTO = 8000;

const EMPRESA_NORMAL: EmpresaDoMotor = { patronalNoDas: false, ratAliquota: 2, fap: 1, terceirosAliquota: 5.8 };
const EMPRESA_SIMPLES: EmpresaDoMotor = { ...EMPRESA_NORMAL, patronalNoDas: true };

const VINCULO: VinculoDoMotor = {
  salarioBase: 3000,
  tipoSalario: "MENSAL",
  horasMensais: 220,
  dependentesIrrf: 1,
  filhosSalarioFamilia: 0,
  insalubridade: "NENHUM",
  periculosidade: false,
  valeTransporte: false,
  aprendiz: false,
  categoria: "101",
};

function evento(papel: PapelDaRubrica, quantidade: number | null, valor: number | null): EventoDoMotor {
  return { rubrica: RUBRICAS_DO_MOTOR.get(papel)!, quantidade, valor };
}

/** Roda o motor nos cenários fixos com as tabelas da competência ("AAAA-MM"). */
export function calcularExemplos(competencia: string, tabelas: TabelasDaCompetencia): ExemplosDoMotor {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  const { diasUteis, diasDeDescanso } = diasDoMes(ano, mes);
  const base = {
    ano,
    mes,
    admissao: new Date(Date.UTC(ano - 3, 2, 10)),
    desligamento: null,
    rubricas: RUBRICAS_DO_MOTOR,
    tabelas,
    convencao: CONVENCAO_DA_CLT,
    empresa: EMPRESA_NORMAL,
    diasUteis,
    diasDeDescanso,
  };

  const clt = calcularMesDaCategoria({
    ...base,
    vinculo: { ...VINCULO, insalubridade: "MEDIO", valeTransporte: true },
    eventos: [
      evento("HE50", 10, null),
      evento("HE100", 4, null),
      evento("NOTURNO", 20, null),
      evento("FALTA", 1, null),
      evento("DSR_FALTA", 1, null),
      evento("ATRASO", 2, null),
      { rubrica: COMISSAO, quantidade: null, valor: 500 },
      // Rubrica fixa do contrato (funcionalidade-767): entra sozinha todo mês.
      { rubrica: GRATIFICACAO, quantidade: null, valor: 200, origem: "FIXA" },
      evento("PENSAO", null, 300),
      evento("ADIANTAMENTO", null, 1200),
    ],
  });
  const proporcional = calcularMesDaCategoria({
    ...base,
    admissao: new Date(Date.UTC(ano, mes - 1, 11)),
    vinculo: { ...VINCULO, salarioBase: 1700, dependentesIrrf: 0, filhosSalarioFamilia: 2 },
    eventos: [],
  });
  const horista = calcularMesDaCategoria({
    ...base,
    vinculo: { ...VINCULO, salarioBase: 12, tipoSalario: "HORISTA", periculosidade: true, dependentesIrrf: 0 },
    eventos: [],
  });
  const encargosSimples = calcularEncargos(clt.baseInss, clt.fgts, EMPRESA_SIMPLES);
  const inssAlto = calcularInss(SALARIO_ALTO, tabelas.inss.dados);
  const irrfAlto = calcularIrrf({ rendimentos: SALARIO_ALTO, inss: inssAlto.valor, dependentes: 0, pensao: 0 }, tabelas.irrf.dados);

  const media = mediaDeVariaveis(
    [450, 600, 300].map((valor, i) => ({
      competencia: `mês ${i + 1}`,
      itens: [{ valor, mediaFerias: true, tipo: "PROVENTO" }],
    })),
    "FERIAS"
  );

  const ferias = calcularFerias({
    inicio: new Date(Date.UTC(ano, mes - 1, 3)),
    diasDeGozo: 20,
    diasDeAbono: 10,
    faltas: 0,
    vinculo: VINCULO,
    mediaVariaveis: media.media,
    tabelas,
  });

  const valorDoRecibo = (nome: string) => (ferias.ok ? (ferias.linhas.find((l) => l.nome === nome)?.valor ?? 0) : 0);
  const parteDoMes = ferias.ok
    ? feriasNoMes(
        {
          inicioGozo: new Date(Date.UTC(ano, mes - 1, 3)),
          diasGozo: 20,
          ferias: valorDoRecibo("Férias"),
          terco: valorDoRecibo("1/3 constitucional"),
          abono: valorDoRecibo("Abono pecuniário"),
          tercoAbono: valorDoRecibo("1/3 do abono"),
          inss: ferias.inss.valor,
          irrf: ferias.irrf.valor,
        },
        ano,
        mes
      )
    : null;
  const feriasNaFolha = parteDoMes ? calcularMesDaCategoria({ ...base, vinculo: VINCULO, eventos: [], ferias: [parteDoMes] }) : null;

  const decimoBase = {
    ano,
    admissao: new Date(Date.UTC(ano, 2, 10)),
    desligamento: null,
    vinculo: VINCULO,
    mediaVariaveis: media.media,
    rubricas: RUBRICAS_DO_MOTOR,
    tabelas,
  };
  const decimo1 = calcularDecimo({ ...decimoBase, parcela: 1, mesDoPagamento: 11, primeiraParcelaPaga: 0 });
  const decimo2 = calcularDecimo({ ...decimoBase, parcela: 2, mesDoPagamento: 12, primeiraParcelaPaga: decimo1.proventos });

  const rescisaoBase = {
    admissao: new Date(Date.UTC(ano - 3, 2, 10)),
    desligamento: new Date(Date.UTC(ano, mes - 1, 15)),
    vinculo: VINCULO,
    mediaVariaveis: 0,
    faltas: 0,
    saldoFgts: 12000,
    decimoAdiantado: 0,
    tabelas,
  };
  const rescisao = calcularRescisaoDoDp2({ ...rescisaoBase, motivo: "DISPENSA_SEM_JUSTA_CAUSA", avisoIndenizado: true, avisoDispensado: false, periodosVencidos: 1 });
  const pedido = calcularRescisaoDoDp2({ ...rescisaoBase, motivo: "PEDIDO_DEMISSAO", avisoIndenizado: false, avisoDispensado: false, periodosVencidos: 0 });

  const semVinculo = (categoria: string, valor: number) =>
    calcularMesDaCategoria({ ...base, vinculo: { ...VINCULO, categoria, salarioBase: valor, dependentesIrrf: 0 }, eventos: [] });

  return {
    competencia,
    diasUteis,
    diasDeDescanso,
    clt,
    proporcional,
    horista,
    encargosSimples,
    irrfAlto,
    media,
    ferias,
    feriasNaFolha,
    decimo1,
    decimo2,
    rescisao,
    pedido,
    proLabore: semVinculo("723", 5000),
    autonomo: semVinculo("701", 2000),
    estagiario: semVinculo("901", 1500),
    previdencia: calcularMesDaCategoria({ ...base, vinculo: { ...VINCULO, salarioBase: SALARIO_ALTO, previdenciaComplementar: 400 }, eventos: [] }),
    diferencas: calcularMesDaCategoria({
      ...base,
      vinculo: { ...VINCULO, filhosSalarioFamilia: 0 },
      eventos: [
        { ...evento("DIFERENCA_RETROATIVA", null, 300), memoria: "Convenção 2027 (5%): 03/2027 R$ 150,00; 04/2027 R$ 150,00" },
        { ...evento("INSS_DIFERENCA", null, 27), memoria: "03/2027: INSS de R$ 3.150,00 − INSS de R$ 3.000,00 = R$ 13,50; 04/2027: R$ 13,50" },
        { ...evento("SALARIO_FAMILIA_RETROATIVO", null, 65), memoria: "Salário-família de 03/2027 não pago: 1 filho × R$ 65,00" },
      ],
    }),
    sindical: calcularMesDaCategoria({ ...base, convencao: { ...CONVENCAO_DA_CLT, contribuicaoMes: mes }, vinculo: { ...VINCULO, contribuicaoSindical: true }, eventos: [] }),
    planoDeSaude: calcularMesDaCategoria({
      ...base,
      vinculo: VINCULO,
      eventos: [evento("COPARTICIPACAO_PLANO", null, 45.5)],
      planos: [
        { tipo: "SAUDE", nome: "Plano de saúde empresarial", titular: { valor: 180, faixa: "34 a 38" }, dependentes: [{ valor: 100, faixa: "0 a 18" }, { valor: 100, faixa: "0 a 18" }] },
        { tipo: "ODONTO", nome: "Plano odontológico", titular: { valor: 30, faixa: null }, dependentes: [] },
      ],
    }),
    licencaPremio: calcularMesDaCategoria({ ...base, vinculo: { ...VINCULO, grauExposicao: "4" }, eventos: [evento("LICENCA_PREMIO_INDENIZADA", 30, null)] }),
  };
}

// ─── Leitura dos resultados ─────────────────────────────────────────────────

/** A linha do holerite de um papel, como "valor — conta". */
function linha(calculo: { itens: readonly ItemDoHolerite[] }, papel: PapelDaRubrica): string[] {
  const i = calculo.itens.find((x) => x.papel === papel);
  return i ? [`${i.nome}: ${reais(i.valor)} = ${i.memoria}`] : [];
}

function linhaDaRescisao(r: CalculoDaRescisao, chave: string): string[] {
  const l = r.linhas.find((x) => x.chave === chave);
  if (!l) return [];
  return l.motivo ? [`${l.nome}: não entra — ${l.motivo}`] : [`${l.nome}: ${reais(l.valor)} = ${l.memoria}`];
}

function linhaDoRecibo(f: CalculoDeFerias, nome: string): string[] {
  if (!f.ok) return [f.erro];
  const l = f.linhas.find((x) => x.nome === nome);
  return l ? [`${l.nome}: ${reais(l.valor)} = ${l.memoria}`] : [];
}

// ─── O catálogo ─────────────────────────────────────────────────────────────

export type Formula = {
  id: string;
  tema: TemaDaFormula;
  nome: string;
  /** A conta, em linguagem de DP. */
  conta: string;
  /** O que mais o DP precisa saber para conferir. */
  detalhe?: string;
  baseLegal: string;
  /** Os papéis de rubrica que esta fórmula calcula. */
  papeis: readonly PapelDaRubrica[];
  /** A função do motor onde a conta mora (para quem for mexer no código). */
  funcao: string;
  /** As linhas do exemplo, tiradas da memória do motor. */
  exemplo: (x: ExemplosDoMotor) => string[];
};

export const FORMULAS: readonly Formula[] = [
  // ── Folha mensal ──
  {
    id: "salario",
    tema: "MENSAL",
    nome: "Salário do mês",
    conta: "Mensalista: salário ÷ 30 × dias no mês. Horista: valor da hora × horas do mês ÷ 30 × dias no mês.",
    detalhe: "Mês comercial de 30 dias: mês inteiro vale 30, mesmo em fevereiro ou com 31 dias. Admissão ou desligamento no mês contam os dias corridos de contrato.",
    baseLegal: "CLT art. 64 (mês de 30 dias)",
    papeis: ["SALARIO"],
    funcao: "calcularMes · diasNoMes (mensal.ts)",
    exemplo: (x) => [...linha(x.clt, "SALARIO"), ...linha(x.proporcional, "SALARIO"), ...linha(x.horista, "SALARIO")],
  },
  {
    id: "insalubridade",
    tema: "MENSAL",
    nome: "Adicional de insalubridade",
    conta: "Salário mínimo × 10% (mínimo), 20% (médio) ou 40% (máximo), proporcional aos dias do mês.",
    baseLegal: "CLT art. 192",
    papeis: ["INSALUBRIDADE"],
    funcao: "adicionaisFixos (mensal.ts)",
    exemplo: (x) => linha(x.clt, "INSALUBRIDADE"),
  },
  {
    id: "periculosidade",
    tema: "MENSAL",
    nome: "Adicional de periculosidade",
    conta: "Salário do mês cheio × 30%, proporcional aos dias do mês.",
    baseLegal: "CLT art. 193, § 1º",
    papeis: ["PERICULOSIDADE"],
    funcao: "adicionaisFixos (mensal.ts)",
    exemplo: (x) => linha(x.horista, "PERICULOSIDADE"),
  },
  {
    id: "hora",
    tema: "MENSAL",
    nome: "Valor da hora",
    conta: "Hora normal = salário ÷ horas mensais (no horista, o valor da hora). Hora com adicionais = hora normal + (insalubridade + periculosidade) ÷ horas mensais.",
    detalhe: "A hora com adicionais é a base da hora extra e do adicional noturno. Falta e atraso usam o salário contratual, sem os adicionais.",
    baseLegal: "Súmula 132 e OJ 47 da SDI-1 do TST",
    papeis: [],
    funcao: "calcularMes (mensal.ts)",
    exemplo: (x) => {
      const he = x.clt.itens.find((i) => i.papel === "HE50");
      return he ? [`Na hora extra do exemplo: ${he.memoria} (o segundo número é a hora com adicionais)`] : [];
    },
  },
  {
    id: "hora-extra",
    tema: "MENSAL",
    nome: "Horas extras",
    conta: "Horas × hora com adicionais × (1 + percentual da convenção). Sem convenção: 50% e 100%.",
    baseLegal: "CF art. 7º, XVI; CLT art. 59",
    papeis: ["HE50", "HE100"],
    funcao: "calcularMes (mensal.ts)",
    exemplo: (x) => [...linha(x.clt, "HE50"), ...linha(x.clt, "HE100")],
  },
  {
    id: "noturno",
    tema: "MENSAL",
    nome: "Adicional noturno",
    conta: "Horas noturnas × hora com adicionais × percentual da convenção (20% na CLT).",
    detalhe: "As horas são lançadas já convertidas em hora noturna reduzida (52 min 30 s).",
    baseLegal: "CLT art. 73",
    papeis: ["NOTURNO"],
    funcao: "calcularMes (mensal.ts)",
    exemplo: (x) => linha(x.clt, "NOTURNO"),
  },
  {
    id: "dsr",
    tema: "MENSAL",
    nome: "DSR sobre variáveis",
    conta: "(Horas extras + adicional noturno) ÷ dias úteis do mês × domingos e feriados do mês.",
    detalhe: "Dias úteis e de descanso vêm do calendário do mês, com os feriados nacionais. Comissões e outras rubricas livres não geram DSR automático.",
    baseLegal: "Lei 605/1949; Súmula 172 do TST",
    papeis: ["DSR"],
    funcao: "calcularMes · diasDoMes (mensal.ts, calendario.ts)",
    exemplo: (x) => [`Neste mês: ${x.diasUteis} dias úteis e ${x.diasDeDescanso} domingos e feriados`, ...linha(x.clt, "DSR")],
  },
  {
    id: "falta",
    tema: "MENSAL",
    nome: "Faltas e DSR das faltas",
    conta: "Dias × salário ÷ 30.",
    detalhe: "O DSR da falta é lançado em dias, como a falta: o DP informa quantos descansos a pessoa perdeu.",
    baseLegal: "CLT art. 473 (faltas justificadas não descontam); Lei 605/1949, art. 6º",
    papeis: ["FALTA", "DSR_FALTA"],
    funcao: "calcularMes (mensal.ts)",
    exemplo: (x) => [...linha(x.clt, "FALTA"), ...linha(x.clt, "DSR_FALTA")],
  },
  {
    id: "atraso",
    tema: "MENSAL",
    nome: "Atrasos",
    conta: "Horas × hora normal (sem adicionais).",
    baseLegal: "CLT art. 58, § 1º (tolerância de 10 minutos por dia)",
    papeis: ["ATRASO"],
    funcao: "calcularMes (mensal.ts)",
    exemplo: (x) => linha(x.clt, "ATRASO"),
  },
  {
    id: "salario-familia",
    tema: "MENSAL",
    nome: "Salário-família",
    conta: "Filhos × cota da tabela, proporcional aos dias do mês, quando a remuneração (base do INSS) não passa do limite da tabela.",
    baseLegal: "Lei 8.213/1991, arts. 65 a 70",
    papeis: ["SALARIO_FAMILIA"],
    funcao: "calcularMes (mensal.ts)",
    exemplo: (x) => linha(x.proporcional, "SALARIO_FAMILIA"),
  },
  {
    id: "contribuicao-sindical",
    tema: "MENSAL",
    nome: "Contribuição sindical do empregado",
    conta: "Um dia de trabalho (salário ÷ 30) ou o percentual da convenção, uma vez por ano, no mês da convenção (março, sem ela).",
    detalhe: "Só desconta quem autorizou por escrito (marcação no contrato). O mês e o percentual vêm da convenção coletiva da empresa.",
    baseLegal: "CLT arts. 545, 578 e 582 (Lei 13.467/2017)",
    papeis: ["CONTRIBUICAO_SINDICAL"],
    funcao: "calcularMes (mensal.ts)",
    exemplo: (x) => linha(x.sindical, "CONTRIBUICAO_SINDICAL"),
  },
  {
    id: "plano-de-saude",
    tema: "MENSAL",
    nome: "Plano de saúde e odontológico",
    conta: "A parte do empregado no plano do mês: o valor do titular + o de cada dependente incluído. No plano por faixa etária, cada um paga o valor da faixa da ANS da idade no 1º dia do mês; nos outros, o valor fixo do titular e do dependente. A coparticipação do mês é lançada pelo DP na rubrica própria.",
    detalhe: "Desconta na folha sem efeito no INSS, no FGTS e no IRRF do mês: a despesa médica só deduz no ajuste anual. O S-1210 informa, por operadora (CNPJ e registro na ANS), o que o titular pagou (com a coparticipação) e o que cada dependente com CPF pagou.",
    baseLegal: "Lei 9.250/1995, art. 8º, II, a; leiaute do eSocial S-1.3, S-1210 infoIRComplem/planSaude",
    papeis: ["PLANO_SAUDE", "PLANO_ODONTO", "COPARTICIPACAO_PLANO"],
    funcao: "descontoDoPlano · planosParaS1210 (planoDeSaude.ts) · calcularMes (mensal.ts)",
    exemplo: (x) => [...linha(x.planoDeSaude, "PLANO_SAUDE"), ...linha(x.planoDeSaude, "PLANO_ODONTO"), ...linha(x.planoDeSaude, "COPARTICIPACAO_PLANO")],
  },
  {
    id: "licenca-premio",
    tema: "MENSAL",
    nome: "Licença-prêmio paga em dinheiro",
    conta: "Os dias de licença-prêmio não gozada × salário ÷ 30, na folha do mês do pagamento.",
    detalhe: "O direito vem da convenção (a cada tantos anos de casa, tantos dias). O gozo não muda a folha: a pessoa fica fora com o salário normal (S-2230 motivo 16). O pagamento em dinheiro é indenizatório: sem INSS, FGTS e IRRF.",
    baseLegal: "Súmula 136 do STJ; Lei 8.212/1991, art. 28, § 9º",
    papeis: ["LICENCA_PREMIO_INDENIZADA"],
    funcao: "saldoDaLicencaPremio (licencaPremio.ts) · calcularMes (mensal.ts)",
    exemplo: (x) => linha(x.licencaPremio, "LICENCA_PREMIO_INDENIZADA"),
  },
  {
    id: "aposentadoria-especial",
    tema: "MENSAL",
    nome: "Adicional da aposentadoria especial",
    conta: "Base do INSS da pessoa × 12%, 9% ou 6%, conforme o grau de exposição do contrato (aposentadoria aos 15, 20 ou 25 anos). Entra nos encargos e vai com o GILRAT na DCTFWeb.",
    detalhe: "O grau vem do LTCAT e vai no grauExp do S-1200. No Simples (patronal no DAS) não é calculado. Quem se aposenta pela especial não pode continuar exposto: o cálculo avisa.",
    baseLegal: "Lei 8.212/1991, art. 22, II; Lei 8.213/1991, art. 57, §§ 6º e 8º",
    papeis: [],
    funcao: "adicionalDaAposentadoriaEspecial (licencaPremio.ts) · calcularEncargos (mensal.ts)",
    exemplo: (x) => x.licencaPremio.encargos.memoria.filter((m) => m.startsWith("Adicional")),
  },
  {
    id: "previdencia-complementar",
    tema: "MENSAL",
    nome: "Previdência complementar do empregado",
    conta: "A contribuição mensal do contrato sai como desconto e entra nas deduções legais da base do IRRF (com o INSS, os dependentes e a pensão).",
    detalhe: "Quando as deduções legais passam do desconto simplificado, o IRRF usa as legais. O limite de 12% da renda tributável é do ajuste anual, não da folha.",
    baseLegal: "Lei 9.250/1995, art. 4º, V; Lei 9.532/1997, art. 11",
    papeis: ["PREVIDENCIA_COMPLEMENTAR"],
    funcao: "calcularMes (mensal.ts) · calcularIrrf (impostos.ts)",
    exemplo: (x) => [...linha(x.previdencia, "PREVIDENCIA_COMPLEMENTAR"), ...x.previdencia.irrf.memoria.slice(0, 2)],
  },
  {
    id: "diferencas-retroativas",
    tema: "MENSAL",
    nome: "Diferenças salariais retroativas",
    conta: "Para cada mês fechado do período, a diferença é o que foi pago nas rubricas ligadas ao salário (salário, horas extras, adicional noturno, DSR, periculosidade, férias e 1/3, menos faltas e atrasos) × (salário novo ÷ salário pago − 1). Na alteração de rubrica, é o valor pago da rubrica × o percentual. A soma sai no mês, com FGTS e IRRF no mês do pagamento.",
    detalhe: "O INSS não entra na base do mês: é apurado mês a mês (INSS de base do mês + diferença, menos o INSS já descontado, pela tabela daquele mês) e sai na rubrica própria, que também deduz da base do IRRF. No eSocial, as diferenças vão no S-1200 do mês do pagamento, no grupo infoPerAnt, com o perRef de cada mês e o instrumento (convenção, acordo, dissídio ou parcela complementar).",
    baseLegal: "Lei 8.212/1991, art. 20; leiaute do eSocial S-1.3, S-1200 infoPerAnt (tpAcConv)",
    papeis: ["DIFERENCA_RETROATIVA", "INSS_DIFERENCA"],
    funcao: "diferencasDoPeriodo (diferencasRetroativas.ts) · calcularMes (mensal.ts)",
    exemplo: (x) => [...linha(x.diferencas, "DIFERENCA_RETROATIVA"), ...linha(x.diferencas, "INSS_DIFERENCA")],
  },
  {
    id: "salario-familia-retroativo",
    tema: "MENSAL",
    nome: "Salário-família retroativo",
    conta: "Para cada mês fechado do período em que a remuneração ficou até o limite da tabela daquele mês: filhos × cota do mês, menos o salário-família que já foi pago no mês.",
    detalhe: "Paga no mês corrente, sem incidência de INSS, FGTS ou IRRF, e compensado com as contribuições do mês na DCTFWeb.",
    baseLegal: "Lei 8.213/1991, arts. 65 a 70",
    papeis: ["SALARIO_FAMILIA_RETROATIVO"],
    funcao: "salarioFamiliaRetroativo (diferencasRetroativas.ts)",
    exemplo: (x) => linha(x.diferencas, "SALARIO_FAMILIA_RETROATIVO"),
  },
  {
    id: "vale-transporte",
    tema: "MENSAL",
    nome: "Desconto do vale-transporte",
    conta: `${pct(VALE_TRANSPORTE_PCT)} do salário do mês (sem adicionais e sem variáveis), limitado ao custo do benefício: custo diário do contrato × dias úteis trabalhados.`,
    detalhe: "Os dias úteis trabalhados são os dias úteis do mês na proporção dos dias de salário (admissão, férias e afastamento). Sem o custo diário no contrato, o desconto fica nos 6%.",
    baseLegal: "Lei 7.418/1985, art. 4º; Decreto 10.854/2021",
    papeis: ["VALE_TRANSPORTE"],
    funcao: "descontoDoValeTransporte · calcularMes (mensal.ts)",
    exemplo: (x) => linha(x.clt, "VALE_TRANSPORTE"),
  },
  {
    id: "pensao",
    tema: "MENSAL",
    nome: "Pensão alimentícia",
    conta: "Valor informado pelo DP. Desconta do líquido e deduz da base do IRRF.",
    baseLegal: "Lei 9.250/1995, art. 4º, II",
    papeis: ["PENSAO"],
    funcao: "calcularMes (mensal.ts)",
    exemplo: (x) => linha(x.clt, "PENSAO"),
  },
  {
    id: "valor-informado",
    tema: "MENSAL",
    nome: "Adiantamento e rubricas livres",
    conta: "O valor que o DP lançou, somado ou descontado; as incidências marcadas na rubrica decidem se entra nas bases de INSS, IRRF e FGTS.",
    detalhe: "Comissões, gratificações e prêmios são rubricas livres. O adiantamento salarial desconta e não muda nenhuma base.",
    baseLegal: "Incidências de cada rubrica em DP 2 › Rubricas",
    papeis: ["ADIANTAMENTO"],
    funcao: "calcularMes (mensal.ts)",
    exemplo: (x) => {
      const comissao = x.clt.itens.find((i) => i.codigo === COMISSAO.codigo);
      return [...(comissao ? [`${comissao.nome}: ${reais(comissao.valor)} = ${comissao.memoria}`] : []), ...linha(x.clt, "ADIANTAMENTO")];
    },
  },
  {
    id: "rubrica-fixa",
    tema: "MENSAL",
    nome: "Rubricas fixas do contrato",
    conta: "A rubrica fixa entra sozinha em cada folha mensal, do mês inicial ao final (sem final, até sair do contrato), com o valor ou as horas do contrato, como se o DP tivesse lançado no mês.",
    detalhe:
      "Cadastra-se no contrato do colaborador (DP 2 › Colaboradores). O valor entra cheio, sem proporcionalizar pela admissão ou pelo desligamento. Se o DP lançar a mesma rubrica no mês para a pessoa, vale o lançamento e a fixa fica de fora naquele mês. O 13º não usa fixas. A linha do holerite termina com \"rubrica fixa do contrato\".",
    baseLegal: "Processos › Lançamentos › Automáticos, na Domínio",
    papeis: [],
    funcao: "separarFixasDoMes (rubricasFixas.ts) · calcularCompetencia (servidor.ts)",
    exemplo: (x) => {
      const fixa = x.clt.itens.find((i) => i.codigo === GRATIFICACAO.codigo);
      return fixa ? [`${fixa.nome}: ${reais(fixa.valor)} = ${fixa.memoria}`] : [];
    },
  },
  {
    id: "liquido",
    tema: "MENSAL",
    nome: "Bases e líquido",
    conta: "Base de cada imposto = proventos que incidem − descontos que incidem. Líquido = proventos − descontos.",
    detalhe: "A ordem do motor: proventos e descontos do mês → base e INSS → salário-família → FGTS → IRRF → líquido.",
    baseLegal: "—",
    papeis: [],
    funcao: "baseDe · calcularMes (mensal.ts)",
    exemplo: (x) => [
      `Base do INSS ${reais(x.clt.baseInss)} · base do FGTS ${reais(x.clt.baseFgts)} · rendimentos do IRRF ${reais(x.clt.irrf.rendimentos)}`,
      `Proventos ${reais(x.clt.proventos)} − descontos ${reais(x.clt.descontos)} = líquido ${reais(x.clt.liquido)}`,
    ],
  },

  // ── INSS, IRRF e FGTS ──
  {
    id: "inss",
    tema: "IMPOSTOS",
    nome: "INSS do empregado",
    conta: "Progressivo por faixa: cada pedaço da base paga a alíquota da sua faixa; a base para no teto. A soma arredonda uma vez, no fim.",
    detalhe: "No 13º, o INSS é calculado em separado, sobre o 13º inteiro. Nas férias, sobre férias + 1/3 (a competência do mês ajusta a soma com o salário).",
    baseLegal: "EC 103/2019, art. 28; portaria anual MPS/MF",
    papeis: ["INSS", "INSS_DECIMO"],
    funcao: "calcularInss (impostos.ts)",
    exemplo: (x) => x.clt.inss.memoria,
  },
  {
    id: "irrf",
    tema: "IMPOSTOS",
    nome: "IRRF",
    conta:
      "Base = rendimentos tributáveis − a maior dedução entre (INSS + dependentes × dedução por dependente + pensão) e o desconto simplificado. Imposto = base × alíquota da faixa − parcela a deduzir − redução da Lei 15.270 (a partir de 2026).",
    detalhe: "Abaixo do mínimo de retenção (R$ 10,00) o imposto não é descontado. No 13º, tributação exclusiva: sem a redução da Lei 15.270, salvo se a tabela do escritório disser que vale.",
    baseLegal: "Lei 9.250/1995; Lei 15.270/2025; IN RFB 1.500/2014, art. 67",
    papeis: ["IRRF", "IRRF_DECIMO"],
    funcao: "calcularIrrf (impostos.ts)",
    exemplo: (x) => ["Mensalista:", ...x.clt.irrf.memoria, `Salário de ${reais(SALARIO_ALTO)}, sem dependentes:`, ...x.irrfAlto.memoria],
  },
  {
    id: "fgts",
    tema: "IMPOSTOS",
    nome: "FGTS do mês",
    conta: `Base do FGTS × ${pct(FGTS_ALIQUOTA)} (aprendiz: ${pct(FGTS_ALIQUOTA_APRENDIZ)}). Não desconta do empregado.`,
    baseLegal: "Lei 8.036/1990, art. 15",
    papeis: ["FGTS"],
    funcao: "calcularMes (mensal.ts)",
    exemplo: (x) => linha(x.clt, "FGTS"),
  },

  // ── Encargos e provisões ──
  {
    id: "encargos",
    tema: "ENCARGOS",
    nome: "Encargos da empresa",
    conta: `Sobre a base do INSS, sem teto: INSS da empresa ${pct(INSS_EMPRESA_ALIQUOTA)} + RAT × FAP + terceiros, mais o FGTS. No Simples (anexos I a III e V), a contribuição patronal vai no DAS e só sobra o FGTS.`,
    detalhe: "RAT, FAP e terceiros vêm da Configuração da empresa.",
    baseLegal: "Lei 8.212/1991, art. 22; LC 123/2006, art. 13, § 3º",
    papeis: [],
    funcao: "calcularEncargos (mensal.ts)",
    exemplo: (x) => [...x.clt.encargos.memoria, "Se fosse do Simples:", ...x.encargosSimples.memoria],
  },
  {
    id: "provisoes",
    tema: "ENCARGOS",
    nome: "Provisões de férias e 13º",
    conta: "Férias = base do INSS ÷ 12, mais 1/3. 13º = base do INSS ÷ 12. Encargos sobre as provisões = (alíquota patronal + FGTS) sobre elas.",
    baseLegal: "Regime de competência (NBC TG 00)",
    papeis: [],
    funcao: "calcularProvisoes (mensal.ts)",
    exemplo: (x) => x.clt.provisoes.memoria,
  },

  // ── Médias ──
  {
    id: "media",
    tema: "MEDIAS",
    nome: "Média de variáveis",
    conta: "Soma das rubricas que entram na média em cada competência fechada da janela ÷ número de competências que existem (até 12).",
    detalhe: "Quem tem 4 meses de casa tem média de 4 meses. Cada rubrica marca em quais médias entra — férias, 13º e rescisão — (horas extras, adicional noturno, DSR, comissões, gratificação). O exemplo é a média de férias.",
    baseLegal: "CLT art. 142, §§ 5º e 6º; Lei 4.090/1962",
    papeis: [],
    funcao: "mediaDeVariaveis · mediaDaPessoa (medias.ts, servidor.ts)",
    exemplo: (x) => [x.media.memoria],
  },

  // ── Férias ──
  {
    id: "ferias-direito",
    tema: "FERIAS",
    nome: "Dias de direito",
    conta: "Até 5 faltas injustificadas no período aquisitivo: 30 dias; 6 a 14: 24; 15 a 23: 18; 24 a 32: 12; mais de 32: perde o direito.",
    detalhe: "O gozo tem ao menos 5 dias e o abono vai até 1/3 do direito.",
    baseLegal: "CLT arts. 130, 134 e 143",
    papeis: [],
    funcao: "calcularFerias (ferias.ts)",
    exemplo: (x) => (x.ferias.ok ? [x.ferias.memoria[0]] : [x.ferias.erro]),
  },
  {
    id: "ferias",
    tema: "FERIAS",
    nome: "Férias e 1/3",
    conta: "Remuneração = salário + insalubridade + periculosidade + média de variáveis. Férias = remuneração ÷ 30 × dias de gozo. 1/3 = férias ÷ 3.",
    baseLegal: "CF art. 7º, XVII; CLT art. 142",
    papeis: [],
    funcao: "calcularFerias (ferias.ts)",
    exemplo: (x) => (x.ferias.ok ? [x.ferias.memoria[1], ...linhaDoRecibo(x.ferias, "Férias"), ...linhaDoRecibo(x.ferias, "1/3 constitucional")] : [x.ferias.erro]),
  },
  {
    id: "abono",
    tema: "FERIAS",
    nome: "Abono pecuniário",
    conta: "Remuneração ÷ 30 × dias vendidos, mais 1/3. Sem INSS, IRRF e FGTS.",
    baseLegal: "CLT arts. 143 e 144",
    papeis: [],
    funcao: "calcularFerias (ferias.ts)",
    exemplo: (x) => [...linhaDoRecibo(x.ferias, "Abono pecuniário"), ...linhaDoRecibo(x.ferias, "1/3 do abono")],
  },
  {
    id: "ferias-na-folha",
    tema: "FERIAS",
    nome: "Férias na folha do mês",
    conta:
      "Salário = salário ÷ 30 × (30 − dias de férias no mês). Férias e 1/3 da parte do mês entram no INSS e no FGTS do mês (o INSS da linha é o do mês inteiro); abono e 1/3 do abono, no mês do início. Saem como desconto o líquido do recibo e o IRRF das férias (tributação separada).",
    detalhe:
      "Gozo que passa para o mês seguinte divide férias, 1/3 e INSS do recibo pelos dias corridos de cada mês. O IRRF do salário não soma as férias e deduz só o INSS que não é das férias. As provisões do mês não contam as férias gozadas.",
    baseLegal: "CLT arts. 142 e 145; Lei 8.212/1991, art. 28; RIR/2018, art. 682",
    papeis: ["FERIAS_GOZADAS", "TERCO_FERIAS", "ABONO_FERIAS", "TERCO_ABONO_FERIAS", "FERIAS_LIQUIDO_PAGO", "IRRF_FERIAS"],
    funcao: "feriasNoMes (periodosDeFerias.ts) · calcularMes (mensal.ts)",
    exemplo: (x) =>
      x.feriasNaFolha
        ? (["SALARIO", "FERIAS_GOZADAS", "TERCO_FERIAS", "INSS", "FERIAS_LIQUIDO_PAGO"] as const).flatMap((p) => {
            const i = x.feriasNaFolha!.itens.find((l) => l.papel === p);
            return i ? [`${i.nome}: ${reais(i.valor)} = ${i.memoria}`] : [];
          })
        : [],
  },
  {
    id: "periodos-aquisitivos",
    tema: "FERIAS",
    nome: "Períodos aquisitivos",
    conta: "Cada 12 meses da admissão dão um período aquisitivo; as férias dele são concedidas nos 12 meses seguintes (concessivo). Passado o concessivo com saldo, são devidas em dobro.",
    detalhe: "O saldo do período é o direito (pelas faltas) menos os dias de gozo e de abono já gravados. O 1/3 pago no período fica somado no controle.",
    baseLegal: "CLT arts. 130, 134 e 137",
    papeis: [],
    funcao: "periodosAquisitivos (periodosDeFerias.ts)",
    exemplo: (x) => {
      // O mensalista dos exemplos, admitido em 10/03 três anos antes, com as férias do exemplo no período mais antigo.
      const ano = Number(x.competencia.slice(0, 4));
      const mes = Number(x.competencia.slice(5, 7));
      const admissao = new Date(Date.UTC(ano - 3, 2, 10));
      const gozo = { aquisitivoInicio: admissao.toISOString().slice(0, 10), diasGozo: 20, diasAbono: 10, faltas: 0, terco: 0, tercoAbono: 0 };
      return periodosAquisitivos(admissao, new Date(Date.UTC(ano, mes - 1, 15)), [gozo]).map(
        (p) => `${p.inicio} a ${p.fim} (concessivo até ${p.concessivoFim}): direito ${p.direito}, usados ${p.usados}, saldo ${p.saldo} — ${NOME_DA_SITUACAO_DO_PERIODO[p.situacao]}`
      );
    },
  },
  {
    id: "ferias-descontos",
    tema: "FERIAS",
    nome: "INSS, IRRF e FGTS das férias",
    conta: "INSS e IRRF sobre férias + 1/3, em separado do salário do mês. FGTS sobre férias + 1/3. Pagamento até 2 dias antes do início.",
    detalhe: "O INSS do mês soma salário e férias: a competência do mês ajusta a diferença.",
    baseLegal: "CLT art. 145; RIR/2018, art. 682",
    papeis: [],
    funcao: "calcularFerias (ferias.ts)",
    exemplo: (x) =>
      x.ferias.ok
        ? [...linhaDoRecibo(x.ferias, "INSS sobre férias"), `IRRF sobre férias: ${x.ferias.irrf.memoria.slice(1).join("; ")}`, `FGTS: ${reais(x.ferias.baseFgts)} × ${pct(FGTS_ALIQUOTA)} = ${reais(x.ferias.fgts)}`]
        : [x.ferias.erro],
  },

  // ── 13º ──
  {
    id: "avos",
    tema: "DECIMO",
    nome: "Avos do 13º",
    conta: "Um avo por mês do ano com 15 dias ou mais de contrato.",
    baseLegal: "Lei 4.090/1962, art. 1º, § 2º",
    papeis: [],
    funcao: "avosNoAno (decimo.ts)",
    exemplo: (x) => [`1ª parcela (até novembro): ${x.decimo1.avos}/12 · 2ª parcela (ano todo): ${x.decimo2.avos}/12`],
  },
  {
    id: "decimo-1",
    tema: "DECIMO",
    nome: "1ª parcela",
    conta: "Remuneração × avos até o mês do pagamento ÷ 12 ÷ 2. Sem INSS e IRRF; com FGTS. Paga até 30/11.",
    baseLegal: "Lei 4.749/1965, art. 2º",
    papeis: ["DECIMO_PRIMEIRA"],
    funcao: "calcularDecimo (decimo.ts)",
    exemplo: (x) => [...x.decimo1.memoria, ...linha(x.decimo1, "FGTS")],
  },
  {
    id: "decimo-2",
    tema: "DECIMO",
    nome: "2ª parcela",
    conta: "13º do ano = remuneração × avos ÷ 12; desconta a 1ª parcela, o INSS e o IRRF próprios do 13º. FGTS sobre o 13º menos a 1ª. Paga até 20/12.",
    baseLegal: "Lei 4.749/1965, art. 1º",
    papeis: ["DECIMO_SEGUNDA", "DECIMO_ADIANTADO"],
    funcao: "calcularDecimo (decimo.ts)",
    exemplo: (x) => [
      ...x.decimo2.memoria,
      ...linha(x.decimo2, "DECIMO_ADIANTADO"),
      ...linha(x.decimo2, "INSS_DECIMO"),
      ...(x.decimo2.irrf ? [`IRRF sobre o 13º: ${x.decimo2.irrf.memoria.slice(1).join("; ")}`] : []),
      ...linha(x.decimo2, "FGTS"),
      `Líquido ${reais(x.decimo2.liquido)}`,
    ],
  },

  // ── Rescisão ──
  {
    id: "saldo",
    tema: "RESCISAO",
    nome: "Saldo de salário",
    conta: "Salário ÷ 30 × dias trabalhados no mês do desligamento. INSS, IRRF e FGTS como num mês comum.",
    baseLegal: "CLT art. 477",
    papeis: [],
    funcao: "calcularRescisao (rescisao/calculo.ts) · calcularRescisaoDoDp2 (rescisao.ts)",
    exemplo: (x) => [...linhaDaRescisao(x.rescisao, "saldo_salario"), ...linhaDaRescisao(x.rescisao, "inss_mes"), ...linhaDaRescisao(x.rescisao, "irrf_mes")],
  },
  {
    id: "aviso",
    tema: "RESCISAO",
    nome: "Aviso prévio",
    conta: "Dias de aviso = 30 + 3 por ano completo de casa, até 90. Indenizado = salário ÷ 30 × dias (no acordo, metade). Pedido de demissão sem cumprir: desconta 30 dias.",
    detalhe:
      "O aviso indenizado projeta o tempo de serviço para os avos de férias e 13º. Só tem FGTS: sem INSS e sem IRRF.",
    baseLegal: "CLT arts. 487 e 484-A; Lei 12.506/2011",
    papeis: ["AVISO_INDENIZADO", "AVISO_DESCONTO"],
    funcao: "calcularRescisao (rescisao/calculo.ts)",
    exemplo: (x) => [...linhaDaRescisao(x.rescisao, "aviso_previo"), ...linhaDaRescisao(x.pedido, "aviso_previo")],
  },
  {
    id: "decimo-rescisao",
    tema: "RESCISAO",
    nome: "13º proporcional",
    conta: "Salário ÷ 12 × avos até o desligamento (ou até a data projetada pelo aviso). INSS e IRRF próprios do 13º; FGTS.",
    baseLegal: "Lei 4.090/1962, art. 3º",
    papeis: [],
    funcao: "calcularRescisao (rescisao/calculo.ts)",
    exemplo: (x) => [...linhaDaRescisao(x.rescisao, "decimo_terceiro"), ...linhaDaRescisao(x.rescisao, "inss_decimo"), ...linhaDaRescisao(x.rescisao, "irrf_decimo")],
  },
  {
    id: "ferias-rescisao",
    tema: "RESCISAO",
    nome: "Férias vencidas e proporcionais indenizadas",
    conta: "Vencidas = salário ÷ 30 × dias de direito de cada período. Proporcionais = salário ÷ 12 × avos do período em curso. 1/3 sobre as duas. Sem INSS, IRRF e FGTS.",
    detalhe: "Na justa causa, as proporcionais não são devidas.",
    baseLegal: "CLT arts. 146 e 147; Súmula 386 do STJ",
    papeis: ["FERIAS_VENCIDAS_INDENIZADAS", "FERIAS_PROPORC_INDENIZADAS", "TERCO_FERIAS_INDENIZADAS"],
    funcao: "calcularRescisao (rescisao/calculo.ts)",
    exemplo: (x) => [...linhaDaRescisao(x.rescisao, "ferias_vencidas"), ...linhaDaRescisao(x.rescisao, "ferias_proporcionais"), ...linhaDaRescisao(x.rescisao, "terco_constitucional")],
  },
  {
    id: "fgts-rescisao",
    tema: "RESCISAO",
    nome: "FGTS e multa da rescisão",
    conta: `FGTS da guia = (saldo de salário + 13º + aviso indenizado) × ${pct(FGTS_ALIQUOTA)}. Multa = saldo do FGTS informado × 40% (dispensa sem justa causa) ou 20% (acordo).`,
    baseLegal: "Lei 8.036/1990, art. 18; CLT art. 484-A",
    papeis: [],
    funcao: "calcularRescisaoDoDp2 (rescisao.ts)",
    exemplo: (x) => [...linhaDaRescisao(x.rescisao, "fgts"), ...linhaDaRescisao(x.rescisao, "fgts_multa")],
  },

  // ── Sem vínculo ──
  {
    id: "pro-labore",
    tema: "SEM_VINCULO",
    nome: "Pró-labore e RPA (contribuinte individual)",
    conta: `Valor do mês (proporcional aos dias). INSS de ${pct(INSS_CONTRIBUINTE_INDIVIDUAL)} sobre o total, até o teto. IRRF pela tabela. Empresa: ${pct(INSS_EMPRESA_ALIQUOTA)} sobre o total, sem RAT e terceiros (zero no Simples). Sem FGTS, férias e 13º.`,
    detalhe: "Se a pessoa já contribui pelo teto em outro lugar, o desconto é ajustado fora do motor. O ISS do RPA, quando houver, não é calculado.",
    baseLegal: "Lei 8.212/1991, arts. 21 e 22, III; Lei 10.666/2003, art. 4º",
    papeis: ["PRO_LABORE", "SERVICO_AUTONOMO"],
    funcao: "calcularMesDaCategoria (semVinculo.ts)",
    exemplo: (x) => [...linha(x.proLabore, "PRO_LABORE"), ...linha(x.proLabore, "INSS"), ...x.proLabore.encargos.memoria, ...linha(x.autonomo, "SERVICO_AUTONOMO"), ...linha(x.autonomo, "INSS")],
  },
  {
    id: "estagio",
    tema: "SEM_VINCULO",
    nome: "Bolsa de estágio",
    conta: "Valor do mês (proporcional aos dias). Sem INSS e sem FGTS; só IRRF pela tabela. Sem encargos da empresa.",
    baseLegal: "Lei 11.788/2008, art. 12",
    papeis: ["BOLSA_ESTAGIO"],
    funcao: "calcularMesDaCategoria (semVinculo.ts)",
    exemplo: (x) => [...linha(x.estagiario, "BOLSA_ESTAGIO"), ...x.estagiario.inss.memoria, `IRRF: ${reais(x.estagiario.irrf.valor)}`],
  },
];

/** As fórmulas de um tema, na ordem do catálogo. */
export function formulasDoTema(tema: TemaDaFormula): Formula[] {
  return FORMULAS.filter((f) => f.tema === tema);
}

/** O exemplo de uma fórmula; um erro do motor vira uma linha, em vez de derrubar a tela. */
export function exemploDaFormula(f: Formula, x: ExemplosDoMotor): string[] {
  try {
    return f.exemplo(x).filter((l) => l.trim() !== "");
  } catch (e) {
    return [`Exemplo indisponível: ${e instanceof Error ? e.message : String(e)}`];
  }
}

/** As rubricas padrão que uma fórmula calcula, como "001 Salário". */
export function rubricasDaFormula(f: Formula): string[] {
  return f.papeis.map((p) => {
    const r = RUBRICAS_DO_MOTOR.get(p);
    return r ? `${r.codigo} ${r.nome}` : p;
  });
}

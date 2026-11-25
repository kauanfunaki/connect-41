// O fluxo de caixa previsto, por período e por linha (25/11/2026, funcionalidade-837).
//
// Cada conta em aberto cai numa **data de caixa**: a previsão (senão o
// vencimento), mais os dias que a empresa leva para ver o dinheiro (a receber
// e a pagar, da configuração dela), passada para o próximo dia útil — sem
// sábado, domingo, feriado nacional e a segunda de Carnaval, em que banco não
// abre. Depois soma por dia, semana ou mês, nas linhas do fluxo direto e,
// dentro delas, nas categorias do cliente (ou do Omie, sem de-para).
//
// O que já venceu e não foi pago fica fora, à parte: somá-lo na primeira
// semana diria que o dinheiro atrasado entra agora, e o fluxo não pode ter
// esse otimismo. O que a linha "fora do fluxo" pega (transferência entre as
// contas da empresa) também fica à parte.
//
// Puro.

import { diaPrevisto, type TituloEmAberto } from "@/lib/financeiro/fluxo";
import { feriadosNacionais, domingoDePascoa } from "@/lib/datas/feriadosNacionais";
import { GRUPOS_DO_FLUXO, LINHAS_DO_FLUXO, linhaDoCodigo, type GrupoDoFluxo } from "./estrutura";

export type Granularidade = "dias" | "semanas" | "meses";

/** Quantos períodos cada visão mostra a partir de hoje. */
export const HORIZONTE: Record<Granularidade, number> = { dias: 31, semanas: 13, meses: 12 };

export function granularidadeValida(texto: string | null | undefined): Granularidade {
  return texto === "dias" || texto === "meses" ? texto : "semanas";
}

export type TituloDoPrevisto = TituloEmAberto & {
  id: string;
  categoryId: string | null;
  contraparte: string;
  descricao: string | null;
};

/** Onde a conta entra: a linha do fluxo e o nome que aparece dentro dela. */
export type Classificacao = { linha: string; item: string };

export type RegrasDaData = {
  diasReceber: number;
  diasPagar: number;
  /** Dias sem banco além de sábado e domingo, "AAAA-MM-DD". */
  semBanco: ReadonlySet<string>;
};

// ─── Datas ──────────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000;
const p2 = (n: number) => String(n).padStart(2, "0");

function utc(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

function keyDe(d: Date): string {
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

export function somarDias(key: string, n: number): string {
  return keyDe(new Date(utc(key).getTime() + n * DIA_MS));
}

function diaDaSemana(key: string): number {
  return utc(key).getUTCDay();
}

/** Feriados nacionais e a segunda de Carnaval, dos anos que o horizonte alcança. */
export function diasSemBanco(hojeKey: string): Set<string> {
  const ano = Number(hojeKey.slice(0, 4));
  const dias = new Set<string>();
  for (const a of [ano - 1, ano, ano + 1, ano + 2]) {
    for (const f of feriadosNacionais(a)) dias.add(f.data);
    // O banco fecha também na segunda de Carnaval (a lista nacional traz a terça).
    dias.add(somarDias(domingoDePascoa(a), -48));
  }
  return dias;
}

export function proximoDiaUtil(key: string, semBanco: ReadonlySet<string>): string {
  let d = key;
  for (let i = 0; i < 15; i++) {
    const s = diaDaSemana(d);
    if (s !== 0 && s !== 6 && !semBanco.has(d)) return d;
    d = somarDias(d, 1);
  }
  return d;
}

/** O dia em que o dinheiro da conta anda na conta bancária. */
export function dataDeCaixa(t: TituloEmAberto, regras: RegrasDaData): string {
  const dias = t.kind === "RECEBER" ? regras.diasReceber : regras.diasPagar;
  return proximoDiaUtil(somarDias(diaPrevisto(t), dias), regras.semBanco);
}

// ─── Períodos ───────────────────────────────────────────────────────────────

export type Periodo = { chave: string; rotulo: string; inicioKey: string; fimKey: string };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const dm = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

function fimDoMes(key: string): string {
  const d = utc(`${key.slice(0, 7)}-01`);
  return keyDe(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/**
 * Os períodos a partir de hoje. Semanas de sete dias corridos contando de
 * hoje, como a planilha de 13 semanas do cliente; meses do calendário, o
 * primeiro só do dia de hoje ao fim do mês.
 */
export function periodosDoPrevisto(hojeKey: string, g: Granularidade): Periodo[] {
  const n = HORIZONTE[g];
  const saida: Periodo[] = [];
  if (g === "dias") {
    for (let i = 0; i < n; i++) {
      const k = somarDias(hojeKey, i);
      saida.push({ chave: k, rotulo: `${SEMANA[diaDaSemana(k)]} ${dm(k)}`, inicioKey: k, fimKey: k });
    }
  } else if (g === "semanas") {
    for (let i = 0; i < n; i++) {
      const ini = somarDias(hojeKey, i * 7);
      const fim = somarDias(ini, 6);
      saida.push({ chave: ini, rotulo: `${dm(ini)} a ${dm(fim)}`, inicioKey: ini, fimKey: fim });
    }
  } else {
    let ini = hojeKey;
    for (let i = 0; i < n; i++) {
      const fim = fimDoMes(ini);
      const mes = `${MESES[Number(ini.slice(5, 7)) - 1]}/${ini.slice(2, 4)}`;
      saida.push({ chave: ini, rotulo: i === 0 && ini.slice(8, 10) !== "01" ? `${mes} (de ${ini.slice(8, 10)})` : mes, inicioKey: ini, fimKey: fim });
      ini = somarDias(fim, 1);
    }
  }
  return saida;
}

// ─── A soma ─────────────────────────────────────────────────────────────────

export type ItemDoPrevisto = { nome: string; valores: number[] };
export type LinhaDoPrevisto = { code: string; label: string; valores: number[]; itens: ItemDoPrevisto[] };
export type GrupoDoPrevisto = { code: GrupoDoFluxo; label: string; valores: number[]; linhas: LinhaDoPrevisto[] };

export type Previsto = {
  granularidade: Granularidade;
  hojeKey: string;
  periodos: Periodo[];
  /** Operacional, investimento e financiamento, sempre nessa ordem; "fora" não entra. */
  grupos: GrupoDoPrevisto[];
  /** Entradas menos saídas de cada período. */
  variacao: number[];
  /** O saldo no começo e no fim de cada período; sem saldo das contas, parte de zero. */
  saldoInicial: number[];
  saldoFinal: number[];
  comSaldo: boolean;
  indicadores: {
    saldoHoje: number | null;
    /** O menor saldo ao fim de um dia, no horizonte inteiro. */
    menor: { centavos: number; dataKey: string } | null;
    periodosNegativos: number;
    primeiroNegativo: Periodo | null;
    /** O saldo ao fim de cada dia do horizonte, para o gráfico. */
    serieDiaria: { dataKey: string; centavos: number }[];
  };
  atrasados: { entradas: number; saidas: number; n: number };
  foraDoFluxo: { centavos: number; n: number };
  /** Contas com data de caixa depois do último período. */
  depoisDoHorizonte: number;
};

const sinal = (t: TituloEmAberto) => (t.kind === "RECEBER" ? t.centavos : -t.centavos);

/** Onde a conta cai, ou por que fica fora. */
export type PosicaoDaConta =
  | { tipo: "atrasada" }
  | { tipo: "depois" }
  | { tipo: "fora-do-fluxo"; dataKey: string }
  | { tipo: "no-periodo"; indice: number; dataKey: string; classificacao: Classificacao };

export function posicaoDaConta(
  t: TituloDoPrevisto,
  classificar: (t: TituloDoPrevisto) => Classificacao,
  regras: RegrasDaData,
  hojeKey: string,
  periodos: Periodo[]
): PosicaoDaConta {
  if (diaPrevisto(t) < hojeKey) return { tipo: "atrasada" };
  const dataKey = dataDeCaixa(t, regras);
  const classificacao = classificar(t);
  if (linhaDoCodigo(classificacao.linha)?.grupo === "fora") return { tipo: "fora-do-fluxo", dataKey };
  const indice = periodos.findIndex((p) => dataKey >= p.inicioKey && dataKey <= p.fimKey);
  if (indice === -1) return { tipo: "depois" };
  return { tipo: "no-periodo", indice, dataKey, classificacao };
}

export function montarPrevisto(p: {
  titulos: TituloDoPrevisto[];
  classificar: (t: TituloDoPrevisto) => Classificacao;
  regras: RegrasDaData;
  hojeKey: string;
  granularidade: Granularidade;
  saldoInicial: number | null;
}): Previsto {
  const periodos = periodosDoPrevisto(p.hojeKey, p.granularidade);
  const n = periodos.length;
  const zeros = () => new Array<number>(n).fill(0);
  const fimDoHorizonte = periodos[n - 1]!.fimKey;

  const porLinha = new Map<string, Map<string, number[]>>();
  const porDia = new Map<string, number>();
  const atrasados = { entradas: 0, saidas: 0, n: 0 };
  const foraDoFluxo = { centavos: 0, n: 0 };
  let depoisDoHorizonte = 0;

  for (const t of p.titulos) {
    if (t.centavos === 0) continue;
    const pos = posicaoDaConta(t, p.classificar, p.regras, p.hojeKey, periodos);
    if (pos.tipo === "atrasada") {
      atrasados.n++;
      if (t.kind === "RECEBER") atrasados.entradas += t.centavos;
      else atrasados.saidas += t.centavos;
      continue;
    }
    if (pos.tipo === "fora-do-fluxo") {
      foraDoFluxo.n++;
      foraDoFluxo.centavos += sinal(t);
      continue;
    }
    if (pos.tipo === "depois") {
      depoisDoHorizonte++;
      continue;
    }
    const { linha, item } = pos.classificacao;
    const itens = porLinha.get(linha) ?? new Map<string, number[]>();
    porLinha.set(linha, itens);
    const valores = itens.get(item) ?? zeros();
    itens.set(item, valores);
    valores[pos.indice]! += sinal(t);
    porDia.set(pos.dataKey, (porDia.get(pos.dataKey) ?? 0) + sinal(t));
  }

  const somar = (listas: number[][]) => listas.reduce((acc, v) => acc.map((x, i) => x + v[i]!), zeros());

  const grupos: GrupoDoPrevisto[] = GRUPOS_DO_FLUXO.filter((g) => g.code !== "fora").map((g) => {
    const linhas: LinhaDoPrevisto[] = LINHAS_DO_FLUXO.filter((l) => l.grupo === g.code && porLinha.has(l.code)).map((l) => {
      const itens = [...porLinha.get(l.code)!.entries()]
        .map(([nome, valores]) => ({ nome, valores }))
        .sort((a, b) => Math.abs(b.valores.reduce((s, v) => s + v, 0)) - Math.abs(a.valores.reduce((s, v) => s + v, 0)) || a.nome.localeCompare(b.nome, "pt-BR"));
      return { code: l.code, label: l.label, valores: somar(itens.map((i) => i.valores)), itens };
    });
    return { code: g.code, label: g.label, valores: somar(linhas.map((l) => l.valores)), linhas };
  });

  const variacao = somar(grupos.map((g) => g.valores));
  const saldoInicial: number[] = [];
  const saldoFinal: number[] = [];
  let corrente = p.saldoInicial ?? 0;
  for (let i = 0; i < n; i++) {
    saldoInicial.push(corrente);
    corrente += variacao[i]!;
    saldoFinal.push(corrente);
  }

  // O menor saldo ao fim de cada dia: no mês, a semana do aperto some na soma.
  const serieDiaria: { dataKey: string; centavos: number }[] = [];
  let menor: { centavos: number; dataKey: string } | null = null;
  let saldoDoDia = p.saldoInicial ?? 0;
  for (let d = p.hojeKey; d <= fimDoHorizonte; d = somarDias(d, 1)) {
    saldoDoDia += porDia.get(d) ?? 0;
    serieDiaria.push({ dataKey: d, centavos: saldoDoDia });
    if (!menor || saldoDoDia < menor.centavos) menor = { centavos: saldoDoDia, dataKey: d };
  }

  // Período negativo: o saldo fica abaixo de zero em algum dia dele.
  const negativos = periodos.filter((per) => serieDiaria.some((s) => s.dataKey >= per.inicioKey && s.dataKey <= per.fimKey && s.centavos < 0));

  return {
    granularidade: p.granularidade,
    hojeKey: p.hojeKey,
    periodos,
    grupos,
    variacao,
    saldoInicial,
    saldoFinal,
    comSaldo: p.saldoInicial !== null,
    indicadores: {
      saldoHoje: p.saldoInicial,
      menor,
      periodosNegativos: negativos.length,
      primeiroNegativo: negativos[0] ?? null,
      serieDiaria,
    },
    atrasados,
    foraDoFluxo,
    depoisDoHorizonte,
  };
}

// ─── O detalhe da célula ────────────────────────────────────────────────────

/** Uma célula da grade: o grupo, a linha ou o item, num período. */
export type Celula = { nivel: "grupo" | "linha" | "item"; code: string; item?: string; periodo: string };

/** "l:pessoal|2026-11-25", "i:pessoal::Folha|2026-11-25" — o parâmetro do endereço. */
export function celulaParaTexto(c: Celula): string {
  const alvo = c.nivel === "item" ? `i:${c.code}::${c.item}` : `${c.nivel === "grupo" ? "g" : "l"}:${c.code}`;
  return `${alvo}|${c.periodo}`;
}

export function celulaDeTexto(texto: string | null | undefined): Celula | null {
  if (!texto) return null;
  const barra = texto.lastIndexOf("|");
  if (barra === -1) return null;
  const alvo = texto.slice(0, barra);
  const periodo = texto.slice(barra + 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodo)) return null;
  if (alvo.startsWith("g:")) return { nivel: "grupo", code: alvo.slice(2), periodo };
  if (alvo.startsWith("l:")) return { nivel: "linha", code: alvo.slice(2), periodo };
  if (alvo.startsWith("i:")) {
    const [code, ...resto] = alvo.slice(2).split("::");
    if (!code || resto.length === 0) return null;
    return { nivel: "item", code, item: resto.join("::"), periodo };
  }
  return null;
}

export type ContaDaCelula = { id: string; dataKey: string; contraparte: string; descricao: string | null; item: string; centavos: number };

/** As contas que formam uma célula, pela data de caixa. A soma bate com a célula. */
export function contasDaCelula(
  celula: Celula,
  titulos: TituloDoPrevisto[],
  classificar: (t: TituloDoPrevisto) => Classificacao,
  regras: RegrasDaData,
  hojeKey: string,
  granularidade: Granularidade
): ContaDaCelula[] {
  const periodos = periodosDoPrevisto(hojeKey, granularidade);
  const indice = periodos.findIndex((p) => p.chave === celula.periodo);
  if (indice === -1) return [];
  const saida: ContaDaCelula[] = [];
  for (const t of titulos) {
    if (t.centavos === 0) continue;
    const pos = posicaoDaConta(t, classificar, regras, hojeKey, periodos);
    if (pos.tipo !== "no-periodo" || pos.indice !== indice) continue;
    const { linha, item } = pos.classificacao;
    const casa =
      celula.nivel === "grupo"
        ? linhaDoCodigo(linha)?.grupo === celula.code
        : celula.nivel === "linha"
          ? linha === celula.code
          : linha === celula.code && item === celula.item;
    if (casa) saida.push({ id: t.id, dataKey: pos.dataKey, contraparte: t.contraparte, descricao: t.descricao, item, centavos: sinal(t) });
  }
  return saida.sort((a, b) => a.dataKey.localeCompare(b.dataKey) || Math.abs(b.centavos) - Math.abs(a.centavos));
}

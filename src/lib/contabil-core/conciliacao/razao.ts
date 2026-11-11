// Porte de `conciliacao_bancaria/razao.py` (Bloco B, 11/11/2026): o razão contábil de UMA conta
// banco, em planilha ou PDF.
//
// É o mesmo relatório "RAZÃO" do Mister Contador que o ConcilPro lê para fornecedores: blocos
// "Conta:", colunas Data/Lote/Histórico/Cta.C.Part./Débito/Crédito/Saldo e "Total da conta" no
// rodapé. O razão de uma conta banco é esse arquivo com um bloco só.
//
// - PLANILHA: o leitor do ConcilPro (`razaoPlanilha.ts`), sem mudança.
// - PDF: leitura pelo TEXTO das páginas (o `extract_text` do pdfplumber). O razão de uma conta banco
//   é regular, e o texto dá os mesmos lançamentos da planilha, sem IA. Este arquivo não abre PDF:
//   quem chama passa a função que extrai o texto (`razaoPdf.ts`, no servidor).
//
// A conferência que não deixa ler pela metade: a soma dos débitos e dos créditos lidos tem de bater
// com o "Total da conta" impresso. Se não bate, algum lançamento ficou para trás, e conciliar em
// cima disso apontaria pendências que não existem.

import { re, splitlines, strip } from "../extrato/py";
import { compara, dec, decimal, ehZero, fixo, modulo, oposto, somaTodos, subtrai, type Dec } from "../motor/decimal";
import { parsearPlanilhaRazao, parsearXlsRazao, quantizarOuErro, strptimeDMY } from "./razaoPlanilha";
import { RazaoInvalido, type LancamentoRazao, type RazaoConta, type RazaoPlanilha } from "./razaoTipos";

export const TOLERANCIA = dec("0.01");

/**
 * Extrai o texto de cada página do PDF, como `page.extract_text()` do pdfplumber. Pode lançar: o
 * erro vira `RazaoInvalido("Não foi possível abrir o PDF: ...")`.
 */
export type TextoDoPdf = (conteudo: Uint8Array) => Promise<string[]>;

const semLeitorDePdf: TextoDoPdf = async () => {
  throw new Error("leitor de PDF não informado");
};

const comeca = (b: Uint8Array, prefixo: readonly number[]) => prefixo.every((x, i) => b[i] === x);
export const ASSINATURA_PDF = [0x25, 0x50, 0x44, 0x46]; // %PDF
export const ASSINATURA_ZIP = [0x50, 0x4b]; // PK
export const ASSINATURA_OLE = [0xd0, 0xcf, 0x11, 0xe0];
export const ehPdf = (b: Uint8Array) => comeca(b, ASSINATURA_PDF);
export const ehZip = (b: Uint8Array) => comeca(b, ASSINATURA_ZIP);
export const ehOle = (b: Uint8Array) => comeca(b, ASSINATURA_OLE);

const soDigitos = (texto: string | null) => re("\\D").sub("", texto ?? "");

/**
 * `ler_razao`: lê e confere o razão de uma conta. Lança `RazaoInvalido` com a frase para o contador.
 * O `nomeArquivo` não muda a leitura (o formato vem dos bytes), como no original.
 */
export async function lerRazao(conteudo: Uint8Array, nomeArquivo = "", textoDoPdf: TextoDoPdf = semLeitorDePdf): Promise<RazaoConta> {
  void nomeArquivo;
  let razao: RazaoConta;
  if (ehPdf(conteudo)) razao = await lerPdf(conteudo, textoDoPdf);
  else if (ehZip(conteudo) || ehOle(conteudo)) razao = lerPlanilha(conteudo);
  else throw new RazaoInvalido("Formato não reconhecido. Envie o razão em PDF, XLSX ou XLS.");
  if (!razao.lancamentos.length) throw new RazaoInvalido("O razão foi lido, mas não tem nenhum lançamento no período.");
  conferirTotal(razao);
  return razao;
}

/** `f"{d:,.2f}"` */
export function milhar(d: Dec): string {
  const t = fixo(d, 2);
  const negativo = t.startsWith("-");
  const [inteira, fracao] = (negativo ? t.slice(1) : t).split(".");
  return (negativo ? "-" : "") + inteira.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fracao;
}

const passa = (a: Dec, b: Dec) => compara(modulo(subtrai(a, b)), TOLERANCIA) > 0;

/** `_conferir_total`: a soma do que foi lido tem de bater com o "Total da conta" impresso. */
export function conferirTotal(razao: RazaoConta): void {
  const debito = somaTodos(razao.lancamentos.filter((l) => compara(l.valor, ZERO) > 0).map((l) => l.valor));
  const credito = oposto(somaTodos(razao.lancamentos.filter((l) => compara(l.valor, ZERO) < 0).map((l) => l.valor)));
  if (passa(debito, razao.totalDebito) || passa(credito, razao.totalCredito)) {
    throw new RazaoInvalido(
      'A leitura do razão não fecha com o "Total da conta" impresso ' +
        `(débitos lidos ${milhar(debito)} × ${milhar(razao.totalDebito)}; créditos lidos ` +
        `${milhar(credito)} × ${milhar(razao.totalCredito)}). Algum lançamento não foi lido — ` +
        "conciliar assim apontaria pendências que não existem. Se possível, envie o " +
        "razão em planilha.",
    );
  }
}

const ZERO = dec("0");

// ─── planilha ───────────────────────────────────────────────────────────────

/** Os `ValueError` do Python (e as subclasses que a leitura pode levantar). */
const ehValueError = (e: unknown): e is Error => e instanceof Error && (e.name === "ValueError" || e.name === "UnicodeDecodeError" || e.name.startsWith("XLDate"));

function lerPlanilha(conteudo: Uint8Array): RazaoConta {
  let dados: RazaoPlanilha;
  try {
    dados = ehZip(conteudo) ? parsearPlanilhaRazao(conteudo) : parsearXlsRazao(conteudo);
  } catch (e) {
    if (ehValueError(e)) throw new RazaoInvalido(e.message);
    throw e;
  }
  const blocos = dados.fornecedores;
  exigirUmaConta(blocos.length);
  const bloco = blocos[0];
  const data = (v: string | null) => (v === null ? null : v.slice(0, 10));
  return {
    empresa: dados.empresa || "",
    cnpj: soDigitos(dados.cnpj),
    periodoInicio: data(dados.periodoInicio),
    periodoFim: data(dados.periodoFim),
    contaCodigo: bloco.codigoConta || "",
    contaClassificacao: bloco.contaContabil || "",
    contaDescricao: bloco.nomeFornecedor || "",
    lancamentos: bloco.lancamentos.map(
      (l): LancamentoRazao => ({
        data: l.dataLancamento.slice(0, 10),
        lote: l.lote || "",
        historico: l.historico || "",
        contrapartida: l.contaPartida || "",
        valor: quantizarOuErro(subtrai(l.valorDebito, l.valorCredito)),
      }),
    ),
    totalDebito: bloco.totalDebito,
    totalCredito: bloco.totalCredito,
  };
}

function exigirUmaConta(quantidade: number): void {
  if (quantidade === 0) throw new RazaoInvalido('Não encontrei nenhuma conta (linha "Conta:") no razão.');
  if (quantidade > 1) {
    throw new RazaoInvalido(
      `O razão tem ${quantidade} contas. A conciliação é de uma conta bancária por vez: ` + "extraia o razão só da conta deste banco.",
    );
  }
}

// ─── PDF ────────────────────────────────────────────────────────────────────

const NUM = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}";
// O saldo zerado sai sem D/C ("... 0,59 0,00"). Exigir o sufixo perdia a linha, e o valor dela ia
// parar no lançamento seguinte, que é calculado pela diferença de saldo.
const LANCAMENTO = re(`^(\\d{2}/\\d{2}/\\d{4})\\s+(\\d+)\\s+(.+?)\\s+(?:(\\d{1,6})\\s+)?(${NUM})\\s+(${NUM})([CD]?)$`);
const CONTA = re("^Conta:\\s*(\\d+)\\s*-\\s*([\\d.]+)\\s+(.+)$");
const PERIODO = re("Per[ií]odo:\\s*(\\d{2}/\\d{2}/\\d{4})\\s*-\\s*(\\d{2}/\\d{2}/\\d{4})");
const SALDO_ANTERIOR = re(`SALDO ANTERIOR\\s+(${NUM})([CD])?\\s*$`);
const TOTAL = re(`^Total da conta:\\s*(${NUM})\\s+(${NUM})`);
// O cabeçalho se repete em toda página, e o razão de vários meses fecha cada um com "Total do mês";
// nada disso pode virar continuação de histórico.
const CABECALHO = re(
  "^(Empresa:|C\\.N\\.P\\.J\\.:|Per[ií]odo:|CONSOLIDADO|RAZ[ÃA]O$|Data\\s*Lote|Conta:|SALDO ANTERIOR" + "|Total da conta|Total do m[êe]s|Sistema licenciado|_{5,})",
  "i",
);
const FOLHA = re("\\s+Folha:.*$");

/** `_dec`: "1.234,56" → Decimal("1234.56"). */
function decDoTexto(texto: string): Dec {
  return decimal(texto.replaceAll(".", "").replaceAll(",", ".")) as Dec;
}

async function lerPdf(conteudo: Uint8Array, textoDoPdf: TextoDoPdf): Promise<RazaoConta> {
  let linhas: string[];
  try {
    const paginas = await textoDoPdf(conteudo);
    linhas = paginas.flatMap((t) => splitlines(t ?? "").map((l) => strip(l)));
  } catch (e) {
    throw new RazaoInvalido(`Não foi possível abrir o PDF: ${e instanceof Error ? e.message : String(e)}`);
  }
  return razaoDasLinhas(linhas);
}

type Bruto = { data: string; lote: string; contra: string | null; saldo: string; dc: string };

/** `_razao_das_linhas`: o razão a partir das linhas de texto do PDF (já sem espaços nas pontas). */
export function razaoDasLinhas(linhas: readonly string[]): RazaoConta {
  const razao: RazaoConta = {
    empresa: "",
    cnpj: "",
    periodoInicio: null,
    periodoFim: null,
    contaCodigo: "",
    contaClassificacao: "",
    contaDescricao: "",
    lancamentos: [],
    totalDebito: ZERO,
    totalCredito: ZERO,
  };
  const contas = new Set<string>();
  let saldo: Dec | null = null;
  const historicos: string[][] = [];
  const brutos: Bruto[] = [];
  let total: [Dec, Dec] | null = null;

  for (const linha of linhas) {
    if (!linha) continue;
    if (linha.startsWith("Empresa:") && !razao.empresa) {
      razao.empresa = strip(FOLHA.sub("", linha.slice("Empresa:".length)));
      continue;
    }
    if (linha.startsWith("C.N.P.J.") && !razao.cnpj) {
      const i = linha.indexOf(":");
      razao.cnpj = soDigitos(i < 0 ? linha : linha.slice(i + 1));
      continue;
    }
    let m = PERIODO.search(linha);
    if (m && razao.periodoInicio === null) {
      razao.periodoInicio = strptimeDMY(m[1]!);
      razao.periodoFim = strptimeDMY(m[2]!);
      continue;
    }
    m = CONTA.match(linha);
    if (m) {
      contas.add(m[1]!);
      razao.contaCodigo = m[1]!;
      razao.contaClassificacao = m[2]!;
      razao.contaDescricao = strip(m[3]!);
      continue;
    }
    m = SALDO_ANTERIOR.search(linha);
    if (m && saldo === null) {
      const valor = decDoTexto(m[1]!);
      saldo = m[2] === "C" ? oposto(valor) : valor;
      continue;
    }
    m = TOTAL.match(linha);
    if (m) {
      total = [decDoTexto(m[1]!), decDoTexto(m[2]!)];
      continue;
    }
    // Depois do total só vêm os termos e as assinaturas do fechamento.
    if (total !== null) continue;
    m = LANCAMENTO.match(linha);
    if (m) {
      brutos.push({ data: m[1]!, lote: m[2]!, contra: m[4], saldo: m[6]!, dc: m[7]! });
      historicos.push([m[3]!]);
      continue;
    }
    // Histórico quebrado em mais de uma linha.
    if (historicos.length && !CABECALHO.match(linha)) historicos[historicos.length - 1].push(linha);
  }

  exigirUmaConta(contas.size);
  if (total === null) throw new RazaoInvalido('Não encontrei o "Total da conta" no PDF, e sem ele a leitura não pode ser conferida.');
  [razao.totalDebito, razao.totalCredito] = total;

  // O PDF não diz em que coluna o valor está: é o saldo que diz. Débito na conta banco aumenta o
  // saldo devedor (D); crédito diminui.
  let anterior: Dec = saldo === null || ehZero(saldo) ? ZERO : saldo;
  brutos.forEach((b, i) => {
    const novoSaldo = decDoTexto(b.saldo);
    const novo = b.dc === "D" ? novoSaldo : negar(novoSaldo);
    razao.lancamentos.push({
      data: strptimeDMY(b.data),
      lote: b.lote,
      historico: historicos[i].join(" "),
      contrapartida: b.contra || "",
      valor: quantizarOuErro(subtrai(novo, anterior)),
    });
    anterior = novo;
  });
  return razao;
}

/** `d * -1`: diferente do `-d`, a multiplicação guarda o sinal no zero (`0,00 * -1` = `-0.00`). */
function negar(d: Dec): Dec {
  return { ...d, negativo: !d.negativo };
}

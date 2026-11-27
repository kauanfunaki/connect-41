// Extrato bancário em planilha (.xls, .xlsx, .xlsm, .csv) na Conciliação bancária
// (funcionalidade-398, 27/11/2026). Era a única coisa que o Conciliador BPO fazia
// e a Conciliação do Connect não: ler o extrato dos bancos que não dão OFX.
//
// A leitura é a do Contábil Core (`contabil-core/extrato/planilha.ts`): cabeçalho
// reconhecido pelo nome das colunas, ordem decrescente, linhas de saldo e a cadeia
// de saldos conferida. Aqui entra só o que o Conciliador tinha a mais:
//
// - A coluna de natureza ("D/C", ou "Tipo"/"Natureza" que só trazem D e C): o
//   valor vem sem sinal e a natureza diz se é entrada ou saída. Sem isso, o
//   depósito da QI Tech entrava como saída (bug de 22/09 no Conciliador).
// - A coluna do tipo da transação ("Tipo" com "Depósito de PIX", "Tarifa"…): vai
//   para o começo do histórico, que é o que a pessoa lê na fila.
//
// O que sai é o mesmo `ExtratoOfx` do OFX, e a gravação é a mesma.
import { compara, decimal, modulo, oposto, centavosDoBanco, texto, type Dec } from "@/lib/contabil-core/motor/decimal";
import { ehVazia, strPy, type Celula } from "@/lib/contabil-core/planilha/celula";
import {
  chave,
  ErroDePlanilha,
  lerLinhas,
  lerPlanilhaDasLinhas,
  mapearColunas,
  paraDecimal,
} from "@/lib/contabil-core/extrato/planilha";
import { chaveDeTexto, idDeterministico, type ExtratoOfx, type LeituraOfx, type TransacaoOfx } from "./ofx";

export const EXTENSOES_DE_PLANILHA = [".xls", ".xlsx", ".xlsm", ".csv"];

/** O arquivo é uma planilha, pelo nome? (O OFX segue pelo leitor dele.) */
export function ehPlanilha(nomeDoArquivo: string): boolean {
  const nome = nomeDoArquivo.toLowerCase();
  return EXTENSOES_DE_PLANILHA.some((e) => nome.endsWith(e));
}

// Os rótulos de coluna como o `chave` deixa: sem acento, sem pontuação, minúsculos.
// "D/C" vira "d c". Os fortes são natureza pelo nome; os fracos só se o conteúdo
// for D/C ("Tipo" ora traz D/C, ora "Depósito de PIX").
const NATUREZA_PELO_NOME = new Set(["d c", "c d", "dc", "cd", "deb cred", "cred deb", "debito credito", "credito debito", "sinal"]);
const NATUREZA_PELO_CONTEUDO = new Set(["tipo", "natureza"]);
const TIPO_DA_TRANSACAO = /^(tipo( de)?( (transacao|lancamento|operacao|movimentacao|movimento))?|categoria|natureza da operacao)$/;

const DEBITO = new Set(["d", "db", "deb", "debito", "debit", "dr", "saida", "saidas", "-"]);
const CREDITO = new Set(["c", "cr", "cred", "credito", "credit", "entrada", "entradas", "+"]);

/** Quantas linhas abaixo do cabeçalho servem de amostra para decidir a coluna. */
const AMOSTRA = 200;

function token(valor: Celula): string {
  if (ehVazia(valor)) return "";
  return strPy(valor)
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[\s.]/g, "");
}

/**
 * A natureza do lançamento: −1 débito, +1 crédito, 0 quando o texto não é uma
 * natureza. Só o valor exato: "Depósito" começa com D e é crédito.
 */
export function natureza(valor: Celula): -1 | 0 | 1 {
  const t = token(valor);
  if (DEBITO.has(t)) return -1;
  if (CREDITO.has(t)) return 1;
  return 0;
}

function pareceNatureza(valores: Celula[]): boolean {
  const preenchidos = valores.map(token).filter(Boolean);
  if (!preenchidos.length) return false;
  const acertos = preenchidos.filter((t) => DEBITO.has(t) || CREDITO.has(t)).length;
  return acertos / preenchidos.length >= 0.9;
}

export type ColunasExtras = { cabecalho: number; natureza: number | null; tipo: number | null };

/** Acha o cabeçalho (como o leitor do Contábil Core) e, nele, as colunas de natureza e de tipo. */
export function colunasExtras(linhas: readonly Celula[][]): ColunasExtras | null {
  const cabecalho = linhas.findIndex((l) => mapearColunas(l) !== null);
  if (cabecalho < 0) return null;
  const amostra = (col: number) => linhas.slice(cabecalho + 1, cabecalho + 1 + AMOSTRA).map((l) => l[col] ?? null);
  const rotulos = linhas[cabecalho].map((c) => chave(c));

  let colNatureza: number | null = null;
  for (const [i, r] of rotulos.entries()) {
    if (NATUREZA_PELO_NOME.has(r) && pareceNatureza(amostra(i))) {
      colNatureza = i;
      break;
    }
  }
  if (colNatureza === null) {
    for (const [i, r] of rotulos.entries()) {
      if ((NATUREZA_PELO_CONTEUDO.has(r) || TIPO_DA_TRANSACAO.test(r)) && pareceNatureza(amostra(i))) {
        colNatureza = i;
        break;
      }
    }
  }

  let colTipo: number | null = null;
  for (const [i, r] of rotulos.entries()) {
    if (i === colNatureza) continue;
    if (NATUREZA_PELO_CONTEUDO.has(r) || TIPO_DA_TRANSACAO.test(r)) {
      colTipo = i;
      break;
    }
  }
  return { cabecalho, natureza: colNatureza, tipo: colTipo };
}

/**
 * As linhas prontas para o leitor do Contábil Core: o valor ganha o sinal da
 * natureza, o tipo da transação entra no começo do histórico, e as duas colunas
 * saem do cabeçalho (senão "Débito/Crédito" seria lida como a coluna de débito).
 */
export function prepararLinhas(linhas: Celula[][]): Celula[][] {
  const extras = colunasExtras(linhas);
  if (!extras || (extras.natureza === null && extras.tipo === null)) return linhas;

  const cabecalho = [...linhas[extras.cabecalho]];
  for (const col of [extras.natureza, extras.tipo]) if (col !== null) cabecalho[col] = "";
  const mapa = mapearColunas(cabecalho);
  // Sem a coluna de valor (o cabeçalho só tinha natureza e tipo de "dinheiro"), não há o que ajustar.
  if (!mapa) return linhas;
  const colValor = mapa.has("credito") || mapa.has("debito") ? undefined : mapa.get("valor");
  const colHistorico = mapa.get("historico");

  const prontas = linhas.map((l) => [...l]);
  prontas[extras.cabecalho] = cabecalho;
  for (let i = extras.cabecalho + 1; i < prontas.length; i++) {
    const linha = prontas[i];
    if (extras.natureza !== null && colValor !== undefined) {
      const sinal = natureza(linha[extras.natureza] ?? null);
      const valor = sinal === 0 ? null : paraDecimal(linha[colValor] ?? null);
      if (valor !== null) linha[colValor] = texto(sinal < 0 ? oposto(modulo(valor)) : modulo(valor));
    }
    if (extras.tipo !== null) {
      const tipo = ehVazia(linha[extras.tipo] ?? null) ? "" : strPy(linha[extras.tipo]).trim();
      if (tipo && colHistorico !== undefined) {
        const historico = ehVazia(linha[colHistorico] ?? null) ? "" : strPy(linha[colHistorico]).trim();
        linha[colHistorico] = historico ? `${tipo} — ${historico}` : tipo;
      } else if (tipo && colHistorico === undefined) {
        // Sem coluna de histórico: o tipo é a descrição que existe.
        linha.push(tipo);
      }
    }
  }
  if (extras.tipo !== null && colHistorico === undefined) prontas[extras.cabecalho].push("Histórico");
  return prontas;
}

const ZERO = decimal("0") as Dec;

function centavos(d: Dec): number {
  return Number(centavosDoBanco(d));
}

/**
 * Lê o extrato em planilha e devolve o mesmo resultado do `lerOfx`. A planilha
 * não diz banco, agência nem conta: quem importa escolhe a conta, e a tela avisa.
 */
export function lerExtratoEmPlanilha(bytes: Uint8Array, nomeDoArquivo: string, agora = new Date()): LeituraOfx {
  if (bytes.length === 0) return { ok: false, erro: "O arquivo está vazio." };
  let lidas: ReturnType<typeof lerPlanilhaDasLinhas>;
  try {
    const linhas = prepararLinhas(lerLinhas(bytes, nomeDoArquivo));
    lidas = lerPlanilhaDasLinhas(linhas, agora.getFullYear());
  } catch (e) {
    if (e instanceof ErroDePlanilha) return { ok: false, erro: e.message };
    return { ok: false, erro: `Não foi possível abrir a planilha: ${e instanceof Error ? e.message : String(e)}` };
  }

  const transacoes: TransacaoOfx[] = [];
  const ordinais = new Map<string, number>();
  let saldo: ExtratoOfx["saldo"] = null;
  for (const t of lidas) {
    const base = { dataKey: t.data, centavos: centavos(t.valor), memo: t.historico.slice(0, 255), nome: null };
    if (base.centavos === 0) continue;
    // A planilha não tem FITID: o mesmo id gerado do OFX sem FITID (data, valor,
    // texto e a ordem entre as idênticas), para a reimportação não duplicar.
    const k = [base.dataKey, base.centavos, chaveDeTexto(base.memo), ""].join("|");
    const ordinal = (ordinais.get(k) ?? 0) + 1;
    ordinais.set(k, ordinal);
    transacoes.push({
      ...base,
      fitId: idDeterministico(base, ordinal),
      fitIdGerado: true,
      tipo: compara(t.valor, ZERO) > 0 ? "CREDIT" : "DEBIT",
      cheque: null,
    });
    if (t.saldoApos !== null) saldo = { centavos: centavos(t.saldoApos), dataKey: t.data };
  }
  if (!transacoes.length) {
    return { ok: false, erro: "A planilha foi lida, mas nenhuma linha tinha data e valor. Confira se o arquivo é um extrato de conta corrente." };
  }

  const datas = transacoes.map((t) => t.dataKey).sort();
  return {
    ok: true,
    extrato: {
      bancoId: null,
      agencia: null,
      contaId: "",
      tipoDaConta: null,
      inicioKey: datas[0]!,
      fimKey: datas[datas.length - 1]!,
      saldo,
      transacoes,
      zeradas: 0,
      charset: "utf-8",
    },
  };
}

// As visões de contas a pagar e a receber (títulos) do financeiro (Bloco B, Fase B4, 12/11/2026).
// Porte de `conciliacao_bancaria/financeiro_titulos.py`.
//
// Cada linha é um título: o que já foi pago ou recebido vira UM movimento, com o total realizado na
// data do último pagamento (não o detalhe de cada liquidação), e o saldo em aberto vira um título em
// aberto, que é só apoio. Título sem nada realizado nem em aberto não gera item nenhum.

import { ehZero, oposto, type Dec } from "../motor/decimal";
import { ehVazia, type Celula } from "../planilha/celula";
import { re } from "../extrato/py";
import type { LinhaFinanceiro } from "./financeiroTipos";
import { dataFinanceiro, FinanceiroInvalido, normalizarFinanceiro, textoFinanceiro, valorFinanceiro } from "./financeiroComum";

type Parte = "cliente" | "fornecedor";
type Cabecalho = { indice: number; parte: Parte; colunas: Map<string, number>; rotulos: string[] };

const PARTES: [Parte, string][] = [
  ["cliente", "recebido"],
  ["fornecedor", "pago"],
];

const exigidos = (parte: Parte, verbo: string) => [
  `nome do ${parte}`,
  `identificador do ${parte}`,
  "codigo referencia",
  "descricao",
  "data de vencimento",
  "data do ultimo pagamento",
  `valor total ${verbo} da parcela (r$)`,
  "valor total da parcela em aberto (r$)",
  "conta bancaria",
  "observacoes",
];

const conta = (xs: readonly string[], x: string) => xs.filter((y) => y === x).length;

/** `_cabecalho`: a linha de títulos nas 20 primeiras, com cada coluna exatamente uma vez. */
function cabecalho(linhas: readonly (readonly Celula[])[]): Cabecalho | null {
  for (const [indice, linha] of linhas.slice(0, 20).entries()) {
    const rotulos = linha.map(normalizarFinanceiro);
    for (const [parte, verbo] of PARTES) {
      const nomes = exigidos(parte, verbo);
      if (nomes.every((c) => conta(rotulos, c) === 1)) {
        return { indice, parte, colunas: new Map(nomes.map((c) => [c, rotulos.indexOf(c)])), rotulos };
      }
    }
  }
  return null;
}

/** `reconhece_titulos` */
export function reconheceTitulos(linhas: readonly (readonly Celula[])[]): boolean {
  return cabecalho(linhas) !== null;
}

const CATEGORIA = re("categoria \\d+");

/** `ler_folha_titulos`: (movimentos realizados, títulos em aberto) de uma folha reconhecida. */
export function lerFolhaTitulos(folha: string, linhas: readonly (readonly Celula[])[]): [LinhaFinanceiro[], LinhaFinanceiro[]] {
  const cab = cabecalho(linhas);
  // No original, desempacotar o `None` levanta TypeError; quem chama sempre conferiu antes.
  if (!cab) throw new TypeError("cannot unpack non-iterable NoneType object");
  const { indice, parte, colunas, rotulos } = cab;
  const movimentos: LinhaFinanceiro[] = [];
  const abertos: LinhaFinanceiro[] = [];
  const verbo = parte === "cliente" ? "recebido" : "pago";
  const categorias = rotulos.flatMap((nome, i) => (CATEGORIA.fullmatch(nome) ? [i] : []));
  const comSinal = (d: Dec) => (parte === "cliente" ? d : oposto(d));

  linhas.slice(indice + 1).forEach((linha, k) => {
    const numero = indice + 2 + k;
    if (linha.every(ehVazia)) return;
    const celula = (nome: string): Celula => {
      const i = colunas.get(nome)!;
      return i < linha.length ? linha[i] : null;
    };
    const contexto = `${folha}, linha ${numero}`;
    const realizado = valorFinanceiro(celula(`valor total ${verbo} da parcela (r$)`), contexto);
    const aberto = valorFinanceiro(celula("valor total da parcela em aberto (r$)"), contexto);
    const nome = textoFinanceiro(celula(`nome do ${parte}`));
    const descricao = textoFinanceiro(celula("descricao"));
    if (!nome && !descricao) throw new FinanceiroInvalido(`Título sem identificação em ${contexto}.`);
    const categoria =
      categorias
        .filter((i) => i < linha.length)
        .map((i) => textoFinanceiro(linha[i]))
        .filter((t): t is string => Boolean(t))
        .join(" · ") || null;
    const vencimento = dataFinanceiro(celula("data de vencimento"), contexto);
    const referencia = `Folha ${folha} · linha ${numero}`;
    const documento = textoFinanceiro(celula("codigo referencia"));
    const banco = textoFinanceiro(celula("conta bancaria"));
    const observacao = textoFinanceiro(celula("observacoes"));
    const documentoFavorecido = textoFinanceiro(celula(`identificador do ${parte}`));
    const base: LinhaFinanceiro = {
      data: vencimento,
      valor: comSinal(aberto),
      historico: (descricao || nome) as string,
      favorecido: nome,
      documento,
      categoria,
      parcela: null,
      banco,
      referencia,
      observacao,
      documentoFavorecido,
    };
    if (!ehZero(realizado)) {
      const data = dataFinanceiro(celula("data do ultimo pagamento"), contexto);
      movimentos.push({
        ...base,
        data,
        valor: comSinal(realizado),
        observacao: "Total realizado do título; data do último pagamento. " + (base.observacao || ""),
      });
    }
    if (!ehZero(aberto)) abertos.push({ ...base, referencia: referencia + " · em aberto" });
  });
  return [movimentos, abertos];
}

// Porte de `regras/relatorio.py` (Fase 3b, 10/11/2026): traduz o modelo XLS/XLSX de regras sem
// consultar banco nem executar fórmulas. O modelo tem seis colunas: DEBITO, CREDITO, HISTORICO
// CONTABIL (a grafia "HITORICO" do modelo recebido também vale), PADRAO DO EXTRATO, BANCO e COPIAR
// DO EXTRATO. Cada linha vira uma regra candidata, com o erro da linha quando houver; quem decide o
// que entra é a análise (`servidor/importacaoRegras.ts`).

import { normalizarParaMatch } from "../motor/texto";
import { strPy, type Celula } from "../planilha/celula";
import { strip } from "../extrato/py";
import { lerPlanilhasExcel } from "../planilha/excel";

export class ErroDoModeloDeRegras extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDoModeloDeRegras";
  }
}

const COLUNAS: Record<string, string> = {
  debito: "debito",
  credito: "credito",
  "hitorico contabil": "descricao", // grafia do modelo recebido
  "historico contabil": "descricao",
  "padrao do extrato": "historico",
  banco: "banco",
  "copiar do extrato": "manter_historico",
};
const CAMPOS = new Set(Object.values(COLUNAS));

export type LinhaRegra = {
  linha: number;
  contaNumero: number | null;
  dc: "D" | "C" | null;
  descricao: string;
  historico: string;
  banco: string;
  manterHistorico: boolean;
  erro: string | null;
};

/** Verdade do Python para `valor or ""`. */
function falso(c: Celula): boolean {
  if (c === null || c === "") return true;
  if (typeof c === "string") return false;
  if (c.tipo === "int") return c.valor === BigInt(0);
  if (c.tipo === "float") return c.valor === 0;
  if (c.tipo === "bool") return !c.valor;
  return false;
}

/** `_texto`: o float inteiro vira inteiro ("1507.0" → "1507"); o resto, `str().strip()`. */
function texto(c: Celula): string {
  if (c === null) return "";
  if (typeof c !== "string" && c.tipo === "float" && Number.isInteger(c.valor)) {
    return BigInt(c.valor).toString();
  }
  return strip(strPy(c));
}

/** `len()` do Python conta caractere (code point). */
const tamanho = (s: string) => [...s].length;

export function lerRelatorioRegras(bytes: Uint8Array, nomeArquivo: string): LinhaRegra[] {
  const planilhas = lerPlanilhasExcel(bytes, nomeArquivo);
  const candidatos: { linhas: Celula[][]; indice: number; campos: Map<string, number> }[] = [];
  for (const aba of planilhas) {
    aba.linhas.slice(0, 30).forEach((valores, indice) => {
      const campos = new Map<string, number>();
      let repetidos = false;
      valores.forEach((valor, coluna) => {
        const campo = COLUNAS[normalizarParaMatch(falso(valor) ? "" : strPy(valor))];
        if (campo) {
          repetidos ||= campos.has(campo);
          campos.set(campo, coluna);
        }
      });
      if (campos.size && [...CAMPOS].every((c) => campos.has(c))) {
        if (repetidos) throw new ErroDoModeloDeRegras("O modelo possui colunas repetidas.");
        candidatos.push({ linhas: aba.linhas, indice, campos });
      }
    });
  }
  if (candidatos.length !== 1) throw new ErroDoModeloDeRegras("Envie uma única tabela com as seis colunas do modelo de regras.");

  const { linhas, indice, campos } = candidatos[0];
  const resultado: LinhaRegra[] = [];
  linhas.slice(indice + 1).forEach((valores, i) => {
    const numero = indice + 2 + i;
    if (!valores.some((v) => v !== null && v !== "")) return;
    const dados: Record<string, string> = {};
    for (const [campo, coluna] of campos) dados[campo] = texto(coluna < valores.length ? valores[coluna] : null);

    let erro: string | null = null;
    const lados = (["debito", "credito"] as const).filter((l) => dados[l]);
    let conta: number | null = null;
    let dc: "D" | "C" | null = null;
    if (lados.length !== 1) erro = "Preencha somente DEBITO ou CREDITO com o número da conta contábil.";
    else {
      dc = lados[0] === "debito" ? "D" : "C";
      if (/^[0-9]{1,10}$/.test(dados[lados[0]])) conta = Number(dados[lados[0]]);
      if (!conta || conta > 2_147_483_647) erro = "Número de conta contábil inválido.";
    }
    const copiar = normalizarParaMatch(dados.manter_historico);
    if (!["", "sim", "nao"].includes(copiar)) erro = "COPIAR DO EXTRATO deve ser SIM, NÃO ou vazio.";
    const manter = copiar === "sim";
    const historico = dados.historico;
    const descricao = dados.descricao || (manter ? historico : "");
    if (!(tamanho(historico) >= 2 && tamanho(historico) <= 500) || !normalizarParaMatch(historico)) {
      erro = "PADRAO DO EXTRATO deve ter texto de 2 a 500 caracteres.";
    }
    if (!(tamanho(descricao) >= 2 && tamanho(descricao) <= 500)) erro = "Informe HISTORICO CONTABIL de 2 a 500 caracteres ou marque SIM para copiar.";
    if (Object.values(dados).some((v) => v.startsWith("="))) erro = "Use valores preenchidos, não fórmulas.";
    resultado.push({ linha: numero, contaNumero: conta, dc, descricao, historico, banco: dados.banco, manterHistorico: manter, erro });
  });
  return resultado;
}

// As leituras das etapas da aba SPED (29/10/2026).
//
// O arquivo da competência e as decisões vêm do motor; a classificação, a
// apuração e o livro são montados aqui, a partir do arquivo (`leitorDoMotor`).
// Nada lança: cada leitura volta como `Leitura`, o dado ou o erro em português.

import "server-only";
import type { ArquivoDoMotor, DecisaoDoMotor } from "@/lib/sped/motor";
import { doMotor, type Leitura } from "@/lib/fiscal/motor/leitura";
import type { TipoDeDecisao } from "@/lib/fiscal/motor/decisoes";
import { livroFiscal, type LeituraDaApuracao, type LeituraDaClassificacao, type LivroFiscal, type ProdutoDeEntrada } from "./arquivoIcms";
import { lerArquivoIcms } from "./leitorDoMotor";
import type { EstabelecimentoDoSped, TelaDoSped } from "./tela";

export type ArquivosDaCompetencia = { versoes: ArquivoDoMotor[]; vigente: ArquivoDoMotor | null };

/** As versões do arquivo de ICMS/IPI da empresa na competência; a vigente é a considerada, senão a mais nova. */
export async function arquivosDaCompetencia(tela: TelaDoSped, estab: EstabelecimentoDoSped): Promise<Leitura<ArquivosDaCompetencia>> {
  return doMotor(async () => {
    const lista = await tela.motor.cliente.listarArquivos(estab.raiz, { obrigacao: "icms_ipi", cnpj: estab.cnpj, competencia: tela.competencia, limite: 20 });
    // Um arquivo de outro estabelecimento ou competência nunca entra, mesmo que o motor mande.
    const versoes = lista.itens
      .filter((a) => a.cnpj === estab.cnpj && a.competencia === tela.competencia && a.obrigacao === "icms_ipi")
      .sort((a, b) => b.versao - a.versao);
    return { versoes, vigente: versoes.find((a) => a.considerado) ?? versoes[0] ?? null };
  });
}

/** "123.45" (string decimal do motor) → centavos; o que não for número é `null`. */
export function centavosDoMotor(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);
  if (typeof v !== "string" || !/^-?\d+(\.\d+)?$/.test(v.trim())) return null;
  const [inteiro, fracao = ""] = v.trim().replace(/^-/, "").split(".");
  const n = Number(inteiro) * 100 + Number((fracao + "00").slice(0, 2)) + (Number(fracao[2] ?? "0") >= 5 ? 1 : 0);
  return v.trim().startsWith("-") ? -n : n;
}

/** Centavos → a string decimal que o motor aceita ("1234.50"). */
export function decimalParaOMotor(centavos: number): string {
  const sinal = centavos < 0 ? "-" : "";
  const abs = Math.abs(Math.round(centavos));
  return `${sinal}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const LIMITE_DE_PAGINAS = 40;

/** Todas as páginas de um tipo de decisão (200 por página, o teto do motor). */
async function todasAsDecisoes(tela: TelaDoSped, raiz: string, tipo: TipoDeDecisao, filtros: { competencia?: string; cnpj?: string } = {}) {
  const itens: DecisaoDoMotor[] = [];
  let cursor: string | null = null;
  for (let pagina = 0; pagina < LIMITE_DE_PAGINAS; pagina++) {
    const r = await tela.motor.cliente.listarDecisoes(raiz, tipo, { ...filtros, limite: 200, cursor });
    itens.push(...r.itens);
    cursor = r.proximo_cursor;
    if (!cursor) return { itens, truncado: false };
  }
  return { itens, truncado: true };
}

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** A decisão gravada de um produto. Campo `null` é "não decidido" — vale o que o arquivo trouxe. */
export type DecisaoDoProduto = { tipoItem: string | null; definicao: string | null; creditoPisCofins: "S" | "N" | null; observacao: string | null; por: string | null; em: string | null };

export type ProdutoNaTela = ProdutoDeEntrada & {
  decisao: DecisaoDoProduto | null;
  /** Crédito de ICMS decidido nesta competência e estabelecimento, em centavos. */
  creditoIcms: number | null;
};

export type ClassificacaoDaTela = {
  leitura: Omit<LeituraDaClassificacao, "produtos">;
  produtos: ProdutoNaTela[];
  /** O motor tinha mais decisões do que o Connect leu. */
  decisoesTruncadas: boolean;
};

export async function carregarClassificacao(tela: TelaDoSped, estab: EstabelecimentoDoSped, arquivo: ArquivoDoMotor): Promise<Leitura<ClassificacaoDaTela>> {
  const lida = await lerArquivoIcms(tela.ctx.tenantId, tela.motor, estab.raiz, arquivo, "classificacao");
  if (lida.erro !== null) return lida;
  return doMotor(async () => {
    const [classificacoes, creditos] = await Promise.all([
      todasAsDecisoes(tela, estab.raiz, "classificacao_item"),
      todasAsDecisoes(tela, estab.raiz, "credito_icms_item", { competencia: tela.competencia, cnpj: estab.cnpj }),
    ]);
    const decididos = new Map<string, DecisaoDoProduto>();
    for (const d of classificacoes.itens) {
      const credito = texto(d.valor.credito_pis_cofins);
      decididos.set(`${d.chave.cnpj_emit}|${d.chave.cod_prod}`, {
        tipoItem: texto(d.valor.tipo_item), definicao: texto(d.valor.definicao),
        creditoPisCofins: credito === "S" || credito === "N" ? credito : null,
        observacao: texto(d.valor.observacao), por: d.decidido_por, em: d.atualizado_em,
      });
    }
    const creditoPorProduto = new Map<string, number>();
    for (const d of creditos.itens) {
      if (d.chave.cnpj_empresa !== estab.cnpj || d.chave.competencia !== tela.competencia) continue;
      const valor = centavosDoMotor(d.valor.valor);
      if (valor !== null) creditoPorProduto.set(`${d.chave.cnpj_emit}|${d.chave.cod_prod}`, valor);
    }
    const { produtos, ...leitura } = lida.dados;
    return {
      leitura,
      produtos: produtos.map((p) => {
        const chave = `${p.cnpjFornecedor}|${p.codProd}`;
        return { ...p, decisao: decididos.get(chave) ?? null, creditoIcms: creditoPorProduto.get(chave) ?? null };
      }),
      decisoesTruncadas: classificacoes.truncado || creditos.truncado,
    };
  });
}

export type ApuracaoDaTela = { apuracao: LeituraDaApuracao; livro: LivroFiscal };

export async function carregarApuracao(tela: TelaDoSped, estab: EstabelecimentoDoSped, arquivo: ArquivoDoMotor): Promise<Leitura<ApuracaoDaTela>> {
  const lida = await lerArquivoIcms(tela.ctx.tenantId, tela.motor, estab.raiz, arquivo, "apuracao");
  if (lida.erro !== null) return lida;
  return { dados: { apuracao: lida.dados, livro: livroFiscal(lida.dados) }, erro: null };
}

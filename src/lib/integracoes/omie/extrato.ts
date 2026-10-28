// O extrato da conta corrente pelo Omie (lote 4, 28/10/2026): `financas/
// extrato` › `ListarExtrato`, no mesmo formato do extrato OFX, para entrar na
// conciliação do Connect sem ninguém baixar arquivo do banco. Funções puras;
// a chamada é `extratoServidor.ts`.
//
// ─── O que é, e o que não é ──────────────────────────────────────────────────
//
// O Omie não devolve a linha que o banco mandou: devolve os lançamentos do
// Omie na conta, com a data de conciliação. Por isso é um ESPELHO, e só para
// quem já concilia no Omie: entra só o movimento conciliado lá
// (`dDataConciliacao` preenchida) — o que o BPO conferiu contra o banco. O
// resto é previsão ou lançamento que o banco ainda não confirmou, e não vira
// linha de extrato.
//
// Campos pela documentação do `ListarExtrato` (conferida em 28/10/2026). O
// sinal vem da natureza do lançamento (`cNatureza` P/R), como na leitura da
// conciliação (`conciliacao.ts`); sem natureza, a linha fica de fora, contada.
// A primeira leitura real confirma os formatos.

import type { ExtratoOfx, TransacaoOfx } from "@/lib/financeiro/conciliacao/ofx";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

/** O nome da importação no histórico da conta — é por ele que se sabe que a linha veio do Omie. */
export const PREFIXO_DO_EXTRATO_DO_OMIE = "Omie · extrato";
/** O FITID das linhas do espelho: o código do lançamento no Omie. Reimportar o mesmo mês não duplica. */
export const PREFIXO_DO_FITID = "omie:";

function centavos(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : null;
  const t = texto(v);
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** "DD/MM/AAAA" → "AAAA-MM-DD". */
export function dataDoExtrato(v: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto(v));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** "AAAA-MM" → o primeiro e o último dia, no formato do Omie. */
export function periodoDoMes(competencia: string): { inicial: string; final: string; inicioKey: string; fimKey: string } {
  const [ano, mes] = competencia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano!, mes!, 0)).getUTCDate();
  const mm = String(mes).padStart(2, "0");
  return {
    inicial: `01/${mm}/${ano}`,
    final: `${String(ultimo).padStart(2, "0")}/${mm}/${ano}`,
    inicioKey: `${ano}-${mm}-01`,
    fimKey: `${ano}-${mm}-${String(ultimo).padStart(2, "0")}`,
  };
}

export type ForaDoEspelho = { naoConciliados: number; semNatureza: number; semData: number; semCodigo: number };

export type LeituraDoExtratoDoOmie = { extrato: ExtratoOfx; fora: ForaDoEspelho };

export function lerExtratoDoOmie(corpo: unknown, periodo: { inicioKey: string; fimKey: string }): LeituraDoExtratoDoOmie {
  const o = obj(corpo);
  const lista = Array.isArray(o.listaMovimentos) ? o.listaMovimentos : [];
  const fora: ForaDoEspelho = { naoConciliados: 0, semNatureza: 0, semData: 0, semCodigo: 0 };
  const transacoes: TransacaoOfx[] = [];
  let zeradas = 0;

  for (const item of lista) {
    const m = obj(item);
    const codigo = texto(m.nCodLancamento);
    // Linha de saldo, ou movimento sem código: não é lançamento.
    if (!codigo || codigo === "0") {
      fora.semCodigo++;
      continue;
    }
    if (!dataDoExtrato(m.dDataConciliacao)) {
      fora.naoConciliados++;
      continue;
    }
    const dataKey = dataDoExtrato(m.dDataLancamento);
    if (!dataKey) {
      fora.semData++;
      continue;
    }
    const natureza = texto(m.cNatureza).toUpperCase();
    const sinal = natureza === "P" ? -1 : natureza === "R" ? 1 : 0;
    if (!sinal) {
      fora.semNatureza++;
      continue;
    }
    const valor = Math.abs(centavos(m.nValorDocumento) ?? 0);
    if (valor === 0) {
      zeradas++;
      continue;
    }
    const memo = [texto(m.cTipoDocumento), texto(m.cNumero), texto(m.cDesCategoria)].filter(Boolean).join(" · ");
    const nome = texto(m.cRazCliente) || texto(m.cDesCliente);
    transacoes.push({
      fitId: `${PREFIXO_DO_FITID}${codigo}`.slice(0, 255),
      fitIdGerado: false,
      tipo: natureza === "P" ? "DEBIT" : "CREDIT",
      dataKey,
      centavos: sinal * valor,
      memo: memo ? memo.slice(0, 255) : null,
      nome: nome ? nome.slice(0, 180) : null,
      cheque: null,
    });
  }

  transacoes.sort((a, b) => a.dataKey.localeCompare(b.dataKey) || a.fitId.localeCompare(b.fitId));
  return {
    extrato: {
      bancoId: texto(o.nCodBanco) || null,
      agencia: texto(o.nCodAgencia) || null,
      contaId: texto(o.nNumConta) || texto(o.nCodCC),
      tipoDaConta: null,
      inicioKey: periodo.inicioKey,
      fimKey: periodo.fimKey,
      // O saldo do Omie é o do Omie, não o do banco: o espelho não diz saldo de banco.
      saldo: null,
      transacoes,
      zeradas,
      charset: "utf-8",
    },
    fora,
  };
}

/** "3 não conciliados no Omie, 1 sem natureza" — o que ficou de fora, para o aviso. */
export function avisoDoQueFicouFora(f: ForaDoEspelho): string | null {
  const partes = [
    f.naoConciliados ? `${f.naoConciliados} ${f.naoConciliados === 1 ? "lançamento ainda não conciliado" : "lançamentos ainda não conciliados"} no Omie` : null,
    f.semNatureza ? `${f.semNatureza} sem natureza (pagar ou receber)` : null,
    f.semData ? `${f.semData} sem data` : null,
  ].filter(Boolean);
  return partes.length ? `Ficaram de fora do espelho: ${partes.join(", ")}.` : null;
}

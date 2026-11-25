// Pedidos de venda e etapas de faturamento do Omie (26/11/2026, funcionalidade-838).
//
// Os campos vêm da documentação pública (`produtos/pedido` › ListarPedidos e
// `produtos/etapafat` › ListarEtapasFaturamento) e ainda não foram vistos numa
// resposta real — como na primeira leitura do financeiro, a leitura é
// defensiva: campo que falta não derruba, só deixa o pedido de fora.
//
// Só interessa o pedido ainda aberto: faturado, cancelado, devolvido ou
// encerrado já virou (ou nunca vai virar) conta a receber, e o previsto o pega
// pelo título.
//
// Puro.

import { dataDoExtrato } from "./extrato";

export type EtapaDoOmie = { code: string; name: string; inactive: boolean };

export type ParcelaDoPedido = {
  /** O vencimento escrito no pedido, "AAAA-MM-DD". */
  vencimento: string | null;
  /** Dias depois da previsão de faturamento, quando o pedido diz assim. */
  dias: number | null;
  centavos: number;
};

export type PedidoDoOmie = {
  omieOrderId: string;
  number: string;
  stageCode: string;
  customerCode: string | null;
  /** A previsão de faturamento, "AAAA-MM-DD". */
  forecastKey: string | null;
  totalCentavos: number;
  installments: ParcelaDoPedido[];
  aberto: boolean;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []);
const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

function centavos(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : null;
  const t = texto(v);
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function inteiro(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(texto(v));
  return Number.isFinite(n) && texto(v) !== "" ? Math.round(n) : null;
}

/** As etapas de todas as operações, uma por código (a primeira descrição vale). */
export function lerEtapas(cadastros: unknown[]): EtapaDoOmie[] {
  const porCodigo = new Map<string, EtapaDoOmie>();
  for (const c of cadastros.map(obj)) {
    for (const e of lista(c.etapas).map(obj)) {
      const code = texto(e.cCodigo);
      if (!code || porCodigo.has(code)) continue;
      const name = (texto(e.cDescricao) || texto(e.cDescrPadrao) || `Etapa ${code}`).slice(0, 60);
      porCodigo.set(code, { code: code.slice(0, 4), name, inactive: texto(e.cInativo).toUpperCase() === "S" });
    }
  }
  return [...porCodigo.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Um item de `pedido_venda_produto`. As parcelas: as do pedido, pelo valor ou
 * pelo percentual do total; sem parcelas no pedido, uma só, na previsão.
 */
export function lerPedido(item: unknown): PedidoDoOmie | null {
  const p = obj(item);
  const cab = obj(p.cabecalho);
  const total = obj(p.total_pedido);
  const info = obj(p.infoCadastro);
  const id = texto(cab.codigo_pedido);
  if (!id) return null;
  const totalCentavos = centavos(total.valor_total_pedido) ?? centavos(total.valor_mercadorias) ?? 0;
  const sim = (v: unknown) => texto(v).toUpperCase() === "S";
  const aberto = !(sim(info.faturado) || sim(info.cancelado) || sim(info.devolvido) || sim(cab.encerrado));

  const parcelas: ParcelaDoPedido[] = [];
  for (const l of lista(obj(p.lista_parcelas).parcela).map(obj)) {
    const valor = centavos(l.valor) ?? (centavos(l.percentual) !== null ? Math.round((totalCentavos * (centavos(l.percentual)! / 100)) / 100) : null);
    if (valor === null || valor === 0) continue;
    parcelas.push({ vencimento: dataDoExtrato(l.data_vencimento), dias: inteiro(l.quantidade_dias), centavos: valor });
  }
  if (parcelas.length === 0 && totalCentavos !== 0) parcelas.push({ vencimento: null, dias: 0, centavos: totalCentavos });

  return {
    omieOrderId: id.slice(0, 30),
    number: (texto(cab.numero_pedido) || id).slice(0, 20),
    stageCode: texto(cab.etapa).slice(0, 4),
    customerCode: texto(cab.codigo_cliente) || null,
    forecastKey: dataDoExtrato(cab.data_previsao),
    totalCentavos,
    installments: parcelas,
    aberto,
  };
}

/** O vencimento de uma parcela: o escrito; senão a previsão mais os dias. */
export function vencimentoDaParcela(forecastKey: string | null, parcela: ParcelaDoPedido): string | null {
  if (parcela.vencimento) return parcela.vencimento;
  if (!forecastKey) return null;
  const d = new Date(`${forecastKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (parcela.dias ?? 0));
  return d.toISOString().slice(0, 10);
}

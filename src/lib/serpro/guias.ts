// As guias federais pelo Serpro, por clique na ficha (Fase 2 enxuta do
// Integra Contador, 27/10/2026): DAS do Simples, DAS do MEI, guia da DCTFWeb,
// DARF pelo Sicalc e a parcela dos parcelamentos do Simples e do MEI.
//
// Decisão do Kauan (27/10/2026): a Fase 2 sai sem o "Guias pelo Connect", que
// segue em standby — nada de guia como dado, envio ao cliente nem área no
// portal. Aqui só se emite (ou recalcula, com a data de pagamento) e o PDF vai
// para a pasta Guias da empresa, nos Arquivos. A guia como dado entra depois,
// por cima disto.
//
// Fontes, lidas em 27/10/2026 (páginas de 10/04/2026): "Gerar DAS" do PGDAS-D
// (`dataConsolidacao` AAAAMMDD, data futura) e do PGMEI (a mesma, opcional);
// "Gerar Documento de Arrecadação" da DCTFWeb (`DataAcolhimentoProposta`,
// inteiro AAAAMMDD, dia útil do mês corrente a partir de hoje); "Consolidar e
// emitir um Darf" do Sicalc (datas em ISO, `dataPA` MM/AAAA no tipo ME); e
// "Emitir documento de arrecadação" dos parcelamentos (`parcelaParaEmitir`
// AAAAMM, número; a resposta traz `docArrecadacaoPdfB64`).
//
// Este arquivo é só regra: o pedido de cada guia, a leitura da resposta e o
// nome do PDF. A emissão (chamada, pasta, arquivo) está em ./emissaoDeGuia.ts.

import {
  DARF_DO_SICALC,
  DAS_DO_MEI,
  DAS_DO_SIMPLES,
  dasDaParcela,
  GUIA_DA_DCTFWEB,
  lerDarfDoSicalc,
  lerDasDaParcela,
  lerDasDoMei,
  lerDasDoSimples,
  lerGuiaDaDctfweb,
  MODALIDADES_DE_PARCELAMENTO,
  pedidoDoServico,
  type Leitura,
  type ServicoDoSerpro,
} from "./servicos";
import { reais, type PedidoAoSerpro, type RespostaLida } from "./regras";

export const TIPOS_DE_GUIA = ["DAS", "DAS_MEI", "DCTFWEB", "DARF", "PARCELA"] as const;
export type TipoDeGuia = (typeof TIPOS_DE_GUIA)[number];

export const ROTULO_DA_GUIA: Record<TipoDeGuia, string> = {
  DAS: "DAS do Simples Nacional",
  DAS_MEI: "DAS do MEI",
  DCTFWEB: "Guia da DCTFWeb",
  DARF: "DARF (Sicalc)",
  PARCELA: "Parcela de parcelamento",
};

export type Modalidade = (typeof MODALIDADES_DE_PARCELAMENTO)[number];

/** A guia mais provável pelo regime (`Company.taxRegimeKind`): só a escolha inicial da janela. */
export function guiaDoRegime(regime: string | null | undefined): TipoDeGuia {
  if (regime === "MEI") return "DAS_MEI";
  if (regime === "SIMPLES_NACIONAL") return "DAS";
  return "DCTFWEB";
}

export type PedidoDeGuia =
  /** `pagamento`: a data em que vai pagar, para recalcular multa e juros. */
  | { tipo: "DAS" | "DAS_MEI"; periodo: string; pagamento: string | null }
  | { tipo: "DCTFWEB"; periodo: string; decimoTerceiro: boolean; pagamento: string | null }
  | { tipo: "DARF"; codigoReceita: string; extensao: string; periodo: string; vencimento: string; valorCentavos: number; pagamento: string }
  | { tipo: "PARCELA"; modalidade: Modalidade; parcela: string };

// ─── Leitura do formulário ───────────────────────────────────────────────────

const ehMes = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
function ehData(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const mesBr = (aaaaMm: string) => `${aaaaMm.slice(5, 7)}/${aaaaMm.slice(0, 4)}`;
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/** "1.234,56", "1234.56" ou "R$ 1.234" → centavos. null = não é um valor. */
export function lerValor(texto: string): number | null {
  const t = texto.replace(/R\$|\s/g, "");
  if (!t) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  const centavos = Math.round(Number(normal) * 100);
  return centavos > 0 ? centavos : null;
}

/**
 * O pedido que veio da tela, conferido antes de gastar uma emissão: o Serpro
 * cobra a chamada que ele recusa com 403, e a data errada só volta como erro
 * dele. `hoje` é "AAAA-MM-DD" de São Paulo.
 */
export function lerPedidoDeGuia(bruto: Record<string, unknown>, hoje: string): { ok: true; pedido: PedidoDeGuia } | { ok: false; erro: string } {
  const s = (k: string) => (typeof bruto[k] === "string" ? (bruto[k] as string).trim() : "");
  const tipo = s("tipo") as TipoDeGuia;
  if (!TIPOS_DE_GUIA.includes(tipo)) return { ok: false, erro: "Escolha o tipo de guia." };
  const mesAtual = hoje.slice(0, 7);

  if (tipo === "PARCELA") {
    const modalidade = s("modalidade") as Modalidade;
    if (!MODALIDADES_DE_PARCELAMENTO.includes(modalidade)) return { ok: false, erro: "Escolha a modalidade do parcelamento." };
    const parcela = s("parcela");
    if (!ehMes(parcela)) return { ok: false, erro: "Informe o mês da parcela." };
    return { ok: true, pedido: { tipo, modalidade, parcela } };
  }

  const periodo = s("periodo");
  if (!ehMes(periodo)) return { ok: false, erro: "Informe o período de apuração (mês e ano)." };
  if (periodo > mesAtual) return { ok: false, erro: "O período de apuração não pode ser de um mês que ainda não começou." };

  const pagamentoBruto = s("pagamento");
  if (pagamentoBruto && !ehData(pagamentoBruto)) return { ok: false, erro: "A data de pagamento não é uma data válida." };
  if (pagamentoBruto && pagamentoBruto < hoje) return { ok: false, erro: "A data de pagamento não pode ser anterior a hoje." };
  // Hoje é o padrão do Serpro: só vai a data quando é outra.
  const pagamento = pagamentoBruto && pagamentoBruto !== hoje ? pagamentoBruto : null;

  if (tipo === "DAS" || tipo === "DAS_MEI") return { ok: true, pedido: { tipo, periodo, pagamento } };

  if (tipo === "DCTFWEB") {
    // A DCTFWeb só recalcula para um dia do mês corrente (regra do "editar DARF").
    if (pagamento && pagamento.slice(0, 7) !== mesAtual) {
      return { ok: false, erro: "Na DCTFWeb, a data de pagamento tem de ser um dia útil deste mês, a partir de hoje." };
    }
    return { ok: true, pedido: { tipo, periodo, decimoTerceiro: bruto.decimoTerceiro === true || s("decimoTerceiro") === "on", pagamento } };
  }

  // DARF pelo Sicalc: receita, vencimento e valor do imposto; a data de
  // consolidação é obrigatória (sem data na tela, vale hoje).
  const codigoReceita = s("codigoReceita").replace(/\D/g, "");
  const extensao = s("extensao").replace(/\D/g, "").padStart(2, "0");
  if (!/^\d{4}$/.test(codigoReceita)) return { ok: false, erro: "O código da receita tem 4 dígitos (ex.: 2089, 2372)." };
  if (!/^\d{2}$/.test(extensao)) return { ok: false, erro: "A extensão da receita tem 2 dígitos (ex.: 01)." };
  const vencimento = s("vencimento");
  if (!ehData(vencimento)) return { ok: false, erro: "Informe o vencimento do imposto." };
  const valorCentavos = lerValor(s("valor"));
  if (valorCentavos === null) return { ok: false, erro: "Informe o valor do imposto (o principal, sem multa nem juros)." };
  return { ok: true, pedido: { tipo, codigoReceita, extensao, periodo, vencimento, valorCentavos, pagamento: pagamento ?? hoje } };
}

// ─── O pedido ao Serpro ──────────────────────────────────────────────────────

const aaaammdd = (iso: string) => iso.replace(/-/g, "");
const aaaamm = (mes: string) => mes.replace("-", "");
const isoComHora = (iso: string) => `${iso}T00:00:00`;

/** O serviço do catálogo de cada guia. */
export function servicoDaGuia(p: PedidoDeGuia): ServicoDoSerpro {
  switch (p.tipo) {
    case "DAS":
      return DAS_DO_SIMPLES;
    case "DAS_MEI":
      return DAS_DO_MEI;
    case "DCTFWEB":
      return GUIA_DA_DCTFWEB;
    case "DARF":
      return DARF_DO_SICALC;
    case "PARCELA":
      return dasDaParcela(p.modalidade);
  }
}

export function pedidoDaGuia(p: PedidoDeGuia, contribuinte: string): PedidoAoSerpro {
  const servico = servicoDaGuia(p);
  switch (p.tipo) {
    case "DAS":
    case "DAS_MEI":
      return pedidoDoServico(servico, contribuinte, {
        periodoApuracao: aaaamm(p.periodo),
        ...(p.pagamento ? { dataConsolidacao: aaaammdd(p.pagamento) } : {}),
      });
    case "DCTFWEB": {
      const pf = contribuinte.replace(/\D/g, "").length === 11;
      const categoria = p.decimoTerceiro ? (pf ? "PF_13o_SALARIO" : "GERAL_13o_SALARIO") : pf ? "PF_MENSAL" : "GERAL_MENSAL";
      return pedidoDoServico(servico, contribuinte, {
        categoria,
        anoPA: p.periodo.slice(0, 4),
        // O 13º não leva mês.
        ...(p.decimoTerceiro ? {} : { mesPA: p.periodo.slice(5, 7) }),
        // Inteiro, não texto (está assim na documentação).
        ...(p.pagamento ? { DataAcolhimentoProposta: Number(aaaammdd(p.pagamento)) } : {}),
      });
    }
    case "DARF":
      return pedidoDoServico(servico, contribuinte, {
        codigoReceita: p.codigoReceita,
        codigoReceitaExtensao: p.extensao,
        tipoPA: "ME",
        dataPA: mesBr(p.periodo),
        vencimento: isoComHora(p.vencimento),
        valorImposto: (p.valorCentavos / 100).toFixed(2),
        dataConsolidacao: isoComHora(p.pagamento),
      });
    case "PARCELA":
      // Número, não texto, como no exemplo da documentação.
      return pedidoDoServico(servico, contribuinte, { parcelaParaEmitir: Number(aaaamm(p.parcela)) });
  }
}

// ─── A resposta ──────────────────────────────────────────────────────────────

export type GuiaEmitida = {
  pdf: string;
  /** Centavos; nulo quando o serviço não manda o valor em campo (DCTFWeb, parcela). */
  total: number | null;
  vencimento: string | null;
  /** Até quando o banco aceita a guia com este cálculo. */
  validoAte: string | null;
  numeroDocumento: string | null;
};

export function lerGuiaEmitida(p: PedidoDeGuia, r: RespostaLida): Leitura<GuiaEmitida> {
  const vazio = { total: null, vencimento: null, validoAte: null, numeroDocumento: null };
  switch (p.tipo) {
    case "DAS":
    case "DAS_MEI": {
      const l = (p.tipo === "DAS" ? lerDasDoSimples : lerDasDoMei)(r);
      if (!l.ok) return l;
      const d = l.dados;
      return { ok: true, dados: { pdf: d.pdf, total: d.valores?.total ?? null, vencimento: d.vencimento, validoAte: d.dataLimite, numeroDocumento: d.numeroDocumento } };
    }
    case "DCTFWEB": {
      const l = lerGuiaDaDctfweb(r);
      return l.ok ? { ok: true, dados: { ...vazio, pdf: l.dados.pdf } } : l;
    }
    case "DARF": {
      const l = lerDarfDoSicalc(r);
      if (!l.ok) return l;
      const c = l.dados.consolidado;
      return { ok: true, dados: { pdf: l.dados.pdf, total: c?.total ?? null, vencimento: p.vencimento, validoAte: c?.validoAte ?? null, numeroDocumento: l.dados.numeroDocumento } };
    }
    case "PARCELA": {
      const l = lerDasDaParcela(r);
      return l.ok ? { ok: true, dados: { ...vazio, pdf: l.dados.pdf } } : l;
    }
  }
}

/** "DAS - Empresa - 09-2026.pdf"; recalculada, "… - pagar em 30-10-2026.pdf". Sem barra: vira pasta em alguns sistemas. */
export function nomeDaGuia(p: PedidoDeGuia, empresa: string): string {
  const limpo = empresa.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const mes = (m: string) => `${m.slice(5, 7)}-${m.slice(0, 4)}`;
  const quando = (d: string | null) => (d ? ` - pagar em ${d.split("-").reverse().join("-")}` : "");
  switch (p.tipo) {
    case "DAS":
      return `DAS - ${limpo} - ${mes(p.periodo)}${quando(p.pagamento)}.pdf`;
    case "DAS_MEI":
      return `DAS MEI - ${limpo} - ${mes(p.periodo)}${quando(p.pagamento)}.pdf`;
    case "DCTFWEB":
      return `DCTFWeb - ${limpo} - ${p.decimoTerceiro ? `13o ${p.periodo.slice(0, 4)}` : mes(p.periodo)}${quando(p.pagamento)}.pdf`;
    case "DARF":
      return `DARF ${p.codigoReceita}-${p.extensao} - ${limpo} - ${mes(p.periodo)}${quando(p.pagamento)}.pdf`;
    case "PARCELA":
      return `Parcela ${p.modalidade} - ${limpo} - ${mes(p.parcela)}.pdf`;
  }
}

/** A frase do resultado, para a tela. */
export function resumoDaGuia(p: PedidoDeGuia, g: GuiaEmitida): string {
  const partes = [ROTULO_DA_GUIA[p.tipo]];
  if (g.total !== null) partes.push(`total ${reais(g.total)}`);
  if (g.validoAte) partes.push(`pagável até ${dataBr(g.validoAte)}`);
  else if (g.vencimento) partes.push(`vencimento ${dataBr(g.vencimento)}`);
  return partes.join(" · ");
}

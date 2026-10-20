// O catálogo de serviços do Integra Contador que interessam ao escritório, e o
// leitor de cada resposta (20/10/2026).
//
// Fontes, lidas em 20/10/2026: o Catálogo de Serviços (15/10/2026) dá o
// caminho e o sequencial; "Serviços x Procuração" (01/06/2026), o código que o
// cliente marca na Autorização de Acesso; a página de cada serviço, a versão.
// O formato das respostas foi conferido na demonstração do Serpro, que devolve
// o envelope da produção com dados fictícios — e diverge da documentação em
// dois pontos: o DAS do Simples vem em `detalhamentoDas` (a página diz
// `detalhamento`), e o do MEI traz `detalhamento` como lista. Estudo em
// connect-41/estudos/2026-10-20/integra-contador.md (fora do git), §3 e §4.
//
// É daqui que o `chamarSerpro` tira o que precisa saber antes de chamar: o
// serviço fora desta lista não é chamado, porque o portão da autorização e o
// teto dependem do que está aqui.

import { ROTULO_DA_SITUACAO, situacaoDaAutorizacao, type RegistroDaAutorizacao } from "@/lib/autorizacoes/regras";
import { explicarErro, pessoa, temMensagemDeErro, type Caminho, type PedidoAoSerpro, type RespostaLida } from "./regras";

export type ServicoDoSerpro = {
  idSistema: string;
  idServico: string;
  caminho: Caminho;
  /** Sitfis "2.0" (a 1.0 foi descontinuada), Sicalc "2.9", Procurações "1", os demais "1.0". */
  versaoSistema: string;
  /** Sequencial no Catálogo de Serviços: vai no fim do X-Request-Tag. */
  sequencial: number;
  /**
   * Os códigos da Autorização de Acesso que liberam o serviço; basta um (os
   * parcelamentos aceitam dois). Vazio = não exige.
   */
  autorizacao: readonly string[];
  /** O resultado vem depois: protocolo e tempo de espera (Sitfis, Eventos). */
  assincrono: boolean;
  /**
   * Abrir dá ciência da intimação, e o prazo começa a contar (Decreto
   * 70.235/1972, art. 23, § 2º, III): só por clique de uma pessoa, nunca no agendador.
   */
  daCiencia: boolean;
  descricao: string;
};

const VERSAO: Record<string, string> = { SITFIS: "2.0", SICALC: "2.9", PROCURACOES: "1" };

function servico(
  sequencial: number,
  idSistema: string,
  idServico: string,
  caminho: Caminho,
  autorizacao: string[],
  descricao: string,
  extras: Partial<Pick<ServicoDoSerpro, "assincrono" | "daCiencia">> = {}
): ServicoDoSerpro {
  return { idSistema, idServico, caminho, versaoSistema: VERSAO[idSistema] ?? "1.0", sequencial, autorizacao, assincrono: false, daCiencia: false, descricao, ...extras };
}

// Os que já têm uso ou leitor, com nome.
export const CONFERIR_PROCURACAO = servico(45, "PROCURACOES", "OBTERPROCURACAO41", "Consultar", [], "Conferir a autorização (procuração)");
export const DAS_DO_SIMPLES = servico(2, "PGDASD", "GERARDAS12", "Emitir", ["00146"], "DAS do Simples (com data de consolidação futura, recalculado)");
export const DAS_DO_MEI = servico(18, "PGMEI", "GERARDASPDF21", "Emitir", [], "DAS do MEI em PDF");
export const GUIA_DA_DCTFWEB = servico(28, "DCTFWEB", "GERARGUIA31", "Emitir", ["00103"], "Guia da DCTFWeb");
// "Não listado" em Serviços x Procuração: presumido o código do sistema.
export const GUIA_DA_DCTFWEB_EM_ANDAMENTO = servico(40, "DCTFWEB", "GERARGUIAANDAMENTO313", "Emitir", ["00103"], "Guia de declaração da DCTFWeb em andamento");
export const DARF_DO_SICALC = servico(46, "SICALC", "CONSOLIDARGERARDARF51", "Emitir", [], "DARF consolidado (Sicalc), PDF e Pix");

/** Os parcelamentos: os cinco serviços de cada modalidade seguem o mesmo molde no Catálogo. */
const PARCELAMENTOS: [idSistema: string, grupo: number, autorizacao: string[], sequencial: number][] = [
  ["PARCSN", 16, ["00076", "00188"], 65],
  ["PARCSN-ESP", 17, ["00125"], 70],
  ["PERTSN", 18, ["00149", "10011"], 75],
  ["RELPSN", 19, ["00210", "10036"], 80],
  ["PARCMEI", 20, ["00134"], 85],
  ["PARCMEI-ESP", 21, ["00133"], 90],
  ["PERTMEI", 22, ["00152", "10012"], 95],
  ["RELPMEI", 23, ["00209", "10035"], 100],
];

export const SERVICOS_DO_SERPRO: readonly ServicoDoSerpro[] = [
  // Simples Nacional. Avulso, cobrança e processo não aparecem em Serviços x
  // Procuração: presumido o código do PGDAS-D.
  DAS_DO_SIMPLES,
  servico(3, "PGDASD", "CONSDECLARACAO13", "Consultar", ["00146"], "Declarações transmitidas"),
  servico(4, "PGDASD", "CONSULTIMADECREC14", "Consultar", ["00146"], "Última declaração e recibo"),
  servico(6, "PGDASD", "CONSEXTRATO16", "Consultar", ["00146"], "Extrato do DAS"),
  servico(7, "PGDASD", "GERARDASCOBRANCA17", "Emitir", ["00146"], "DAS de cobrança"),
  servico(8, "PGDASD", "GERARDASPROCESSO18", "Emitir", ["00146"], "DAS de processo"),
  servico(9, "PGDASD", "GERARDASAVULSO19", "Emitir", ["00146"], "DAS avulso"),
  // MEI: não exige autorização.
  DAS_DO_MEI,
  servico(19, "PGMEI", "GERARDASCODBARRA22", "Emitir", [], "DAS do MEI em código de barras"),
  servico(21, "PGMEI", "DIVIDAATIVA24", "Consultar", [], "Dívida ativa do MEI"),
  servico(22, "CCMEI", "EMITIRCCMEI121", "Emitir", [], "Certificado da condição de MEI"),
  servico(23, "CCMEI", "DADOSCCMEI122", "Consultar", [], "Dados do certificado de MEI"),
  servico(24, "CCMEI", "CCMEISITCADASTRAL123", "Consultar", [], "Situação cadastral dos MEI do CPF"),
  // DCTFWeb.
  GUIA_DA_DCTFWEB,
  GUIA_DA_DCTFWEB_EM_ANDAMENTO,
  servico(29, "DCTFWEB", "CONSRECIBO32", "Consultar", ["00103"], "Recibo da DCTFWeb"),
  servico(30, "DCTFWEB", "CONSDECCOMPLETA33", "Consultar", ["00103"], "Declaração completa da DCTFWeb"),
  servico(35, "DCTFWEB", "CONSXMLDECLARACAO38", "Consultar", ["00103"], "XML da declaração da DCTFWeb"),
  CONFERIR_PROCURACAO,
  // Sicalc: não exige autorização. O CONSOLIDAR54 está em produção desde 15/10/2026.
  DARF_DO_SICALC,
  servico(47, "SICALC", "CONSULTAAPOIORECEITAS52", "Apoiar", [], "Regras de uma receita no Sicalc"),
  servico(48, "SICALC", "GERARDARFCODBARRA53", "Emitir", [], "DARF em código de barras"),
  servico(49, "SICALC", "CONSOLIDAR54", "Consultar", [], "Consolidar o débito sem emitir o DARF"),
  // Caixa Postal: a lista e o indicador não dão ciência; o detalhe dá.
  servico(50, "CAIXAPOSTAL", "MSGCONTRIBUINTE61", "Consultar", ["00006"], "Caixa Postal: lista de mensagens"),
  servico(51, "CAIXAPOSTAL", "MSGDETALHAMENTO62", "Consultar", ["00006"], "Caixa Postal: abrir uma mensagem", { daCiencia: true }),
  servico(52, "CAIXAPOSTAL", "INNOVAMSG63", "Monitorar", ["00006"], "Caixa Postal: há mensagem nova?"),
  servico(53, "DTE", "CONSULTASITUACAODTE111", "Consultar", ["00050"], "Situação do DTE"),
  // Pagamentos.
  servico(54, "PAGTOWEB", "PAGAMENTOS71", "Consultar", ["00004"], "Pagamentos"),
  servico(55, "PAGTOWEB", "COMPARRECADACAO72", "Emitir", ["00004"], "Comprovante de arrecadação"),
  servico(56, "PAGTOWEB", "CONTACONSDOCARRPG73", "Consultar", ["00004"], "Contar pagamentos"),
  // O termo de autorização (modelo software house), grátis.
  servico(57, "AUTENTICAPROCURADOR", "ENVIOXMLASSINADO81", "Apoiar", [], "Enviar o termo de autorização assinado"),
  // Eventos de atualização: grátis; vale a autorização do sistema monitorado,
  // em D-1, e quem não a tem volta "x" na matriz.
  servico(59, "EVENTOSATUALIZACAO", "SOLICEVENTOSPF131", "Monitorar", [], "Eventos de pessoa física: pedir", { assincrono: true }),
  servico(60, "EVENTOSATUALIZACAO", "SOLICEVENTOSPJ132", "Monitorar", [], "Eventos de pessoa jurídica: pedir", { assincrono: true }),
  servico(61, "EVENTOSATUALIZACAO", "OBTEREVENTOSPF133", "Monitorar", [], "Eventos de pessoa física: obter", { assincrono: true }),
  servico(62, "EVENTOSATUALIZACAO", "OBTEREVENTOSPJ134", "Monitorar", [], "Eventos de pessoa jurídica: obter", { assincrono: true }),
  // Sitfis: pedir o protocolo é grátis; emitir antes do tempo de espera volta 202, cobrado.
  servico(63, "SITFIS", "SOLICITARPROTOCOLO91", "Apoiar", ["00002"], "Situação fiscal: pedir o protocolo", { assincrono: true }),
  servico(64, "SITFIS", "RELATORIOSITFIS92", "Emitir", ["00002"], "Situação fiscal: emitir o relatório", { assincrono: true }),
  ...PARCELAMENTOS.flatMap(([sistema, n, autorizacao, s]) => [
    servico(s, sistema, `GERARDAS${n}1`, "Emitir", autorizacao, `${sistema}: DAS da parcela`),
    servico(s + 1, sistema, `PARCELASPARAGERAR${n}2`, "Consultar", autorizacao, `${sistema}: parcelas para emitir`),
    servico(s + 2, sistema, `PEDIDOSPARC${n}3`, "Consultar", autorizacao, `${sistema}: pedidos de parcelamento`),
    servico(s + 3, sistema, `OBTERPARC${n}4`, "Consultar", autorizacao, `${sistema}: um parcelamento`),
    servico(s + 4, sistema, `DETPAGTOPARC${n}5`, "Consultar", autorizacao, `${sistema}: pagamento de uma parcela`),
  ]),
];

const PELO_ID = new Map(SERVICOS_DO_SERPRO.map((s) => [`${s.idSistema}/${s.idServico}`, s]));

export function servicoDoCatalogo(idSistema: string, idServico: string): ServicoDoSerpro | null {
  return PELO_ID.get(`${idSistema}/${idServico}`) ?? null;
}

/** O pedido de um serviço do catálogo, com o caminho e a versão dele. */
export function pedidoDoServico(s: ServicoDoSerpro, contribuinte: string, dados: Record<string, unknown>): PedidoAoSerpro {
  return { caminho: s.caminho, idSistema: s.idSistema, idServico: s.idServico, versaoSistema: s.versaoSistema, contribuinte, dados };
}

/**
 * A consulta de exemplo da demonstração: o cenário de procurações da
 * documentação, com contratante, autor e contribuinte fictícios. É o "testar
 * conexão" do modo demonstração, que não autentica.
 */
export const EXEMPLO_DA_DEMONSTRACAO: PedidoAoSerpro = {
  ...pedidoDoServico(CONFERIR_PROCURACAO, "99999999999", { outorgante: "99999999999999", tipoOutorgante: "2", outorgado: "99999999999", tipoOutorgado: "1" }),
  partesDaDemonstracao: { contratante: "99999999999999", autor: "99999999999999" },
};

// ─── O portão antes da chamada paga ──────────────────────────────────────────

export type RegistroParaOPortao = RegistroDaAutorizacao & { allServices: boolean; services: string | null };
export type Portao = { pode: true } | { pode: false; motivo: string };

const NEGADA = "Sem ela, o Serpro nega a chamada e cobra (403); a chamada não foi feita.";

/**
 * A Autorização de Acesso libera o serviço? Ativa ou a renovar, e com
 * "todos os serviços" ou o código do serviço marcado. Sem isso o Serpro
 * responde 403 — e o 403 é cobrado (20/10/2026).
 */
export function autorizacaoPermite(servico: ServicoDoSerpro, registro: RegistroParaOPortao | null, hoje: string): Portao {
  if (servico.autorizacao.length === 0) return { pode: true };
  const situacao = situacaoDaAutorizacao(registro, hoje);
  if (situacao === "falta_pedir") return { pode: false, motivo: `O cliente não deu Autorização de Acesso ao escritório. ${NEGADA}` };
  if (situacao !== "ativa" && situacao !== "a_renovar") {
    return { pode: false, motivo: `A Autorização de Acesso deste cliente está como “${ROTULO_DA_SITUACAO[situacao]}”. ${NEGADA}` };
  }
  if (registro!.allServices) return { pode: true };
  const marcados = new Set((registro!.services ?? "").match(/\d{5}/g) ?? []);
  if (servico.autorizacao.some((c) => marcados.has(c))) return { pode: true };
  return {
    pode: false,
    motivo: `A Autorização de Acesso deste cliente não inclui o serviço ${servico.autorizacao.join(" ou ")} (${servico.descricao}). ${NEGADA}`,
  };
}

/** A chave da autorização do contribuinte: raiz do CNPJ (a da matriz vale para as filiais) ou o CPF. */
export function chaveDoContribuinte(documento: string): string {
  const { numero } = pessoa(documento);
  return numero.length === 14 ? numero.slice(0, 8) : numero;
}

// ─── Leitores ────────────────────────────────────────────────────────────────

export type Leitura<T> = { ok: true; dados: T } | { ok: false; erro: string };

/** Em centavos. */
export type ValoresDaGuia = { principal: number; multa: number; juros: number; total: number };

export type DasLido = {
  /** O PDF em base64. */
  pdf: string;
  numeroDocumento: string | null;
  periodoApuracao: string | null;
  /** AAAA-MM-DD, como o resto das datas daqui. */
  vencimento: string | null;
  /** Até quando o banco aceita (com data de consolidação, o dia pedido). */
  dataLimite: string | null;
  valores: ValoresDaGuia | null;
  composicao: { periodoApuracao: string | null; codigo: string; denominacao: string; valores: ValoresDaGuia | null }[];
  observacoes: string[];
  cnpj: string | null;
  /** Só o do MEI traz. */
  razaoSocial: string | null;
};

export type GuiaDaDctfwebLida = { pdf: string };

export type DarfDoSicalcLido = {
  pdf: string;
  consolidado:
    | (ValoresDaGuia & {
        percentualMulta: number | null;
        percentualJuros: number | null;
        termoInicialJuros: string | null;
        dataConsolidacao: string | null;
        /** Último dia para pagar com este cálculo. */
        validoAte: string | null;
      })
    | null;
  numeroDocumento: string | null;
  /** O Pix. A demonstração não traz; a documentação (15/10/2026), sim. */
  qrCode: string | null;
};

type Objeto = Record<string, unknown>;
const objeto = (v: unknown): Objeto | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Objeto) : null);
/** A lista vira o primeiro item: o mesmo campo vem como objeto num serviço e como lista no outro. */
const primeiro = (v: unknown): Objeto | null => objeto(Array.isArray(v) ? v[0] : v);
const texto = (v: unknown): string | null => (typeof v === "string" ? v.trim() || null : typeof v === "number" ? String(v) : null);

function numero(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

const centavos = (v: unknown): number | null => {
  const n = numero(v);
  return n === null ? null : Math.round(n * 100);
};

/** "20180220" ou "2022-08-31T00:00:00" → "2018-02-20" / "2022-08-31". */
function dataIso(v: unknown): string | null {
  const t = texto(v);
  const m = t ? (/^(\d{4})(\d{2})(\d{2})$/.exec(t) ?? /^(\d{4})-(\d{2})-(\d{2})/.exec(t)) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function valoresDaGuia(v: unknown): ValoresDaGuia | null {
  const o = primeiro(v);
  const principal = centavos(o?.principal);
  const total = centavos(o?.total);
  if (principal === null || total === null) return null;
  return { principal, multa: centavos(o!.multa) ?? 0, juros: centavos(o!.juros) ?? 0, total };
}

/** Status de erro, ou o 200 com "ERRO" da demonstração: o leitor nem tenta. */
function recusada(r: RespostaLida): string | null {
  if (r.status < 200 || r.status >= 300 || temMensagemDeErro(r.mensagens)) return explicarErro(r.status, r.mensagens);
  return null;
}

/** DAS do Simples (PGDAS-D) e do MEI (PGMEI): o mesmo objeto, com as diferenças de cada um. */
function lerDas(r: RespostaLida): Leitura<DasLido> {
  const erro = recusada(r);
  if (erro) return { ok: false, erro };
  const das = primeiro(r.dados);
  const pdf = texto(das?.pdf);
  if (!das || !pdf) return { ok: false, erro: "O Serpro não devolveu o PDF do DAS." };
  const d = primeiro(das.detalhamentoDas ?? das.detalhamento);
  const composicao = (Array.isArray(d?.composicao) ? d.composicao : [])
    .map(objeto)
    .filter((c): c is Objeto => !!c)
    .map((c) => ({ periodoApuracao: texto(c.periodoApuracao), codigo: texto(c.codigo) ?? "", denominacao: texto(c.denominacao) ?? "", valores: valoresDaGuia(c.valores) }));
  return {
    ok: true,
    dados: {
      pdf,
      numeroDocumento: texto(d?.numeroDocumento),
      periodoApuracao: texto(d?.periodoApuracao),
      vencimento: dataIso(d?.dataVencimento),
      dataLimite: dataIso(d?.dataLimiteAcolhimento),
      valores: valoresDaGuia(d?.valores),
      composicao,
      observacoes: [d?.observacao1, d?.observacao2, d?.observacao3].map(texto).filter((o): o is string => !!o),
      cnpj: texto(das.cnpjCompleto),
      razaoSocial: texto(das.razaoSocial),
    },
  };
}

export const lerDasDoSimples = lerDas;
export const lerDasDoMei = lerDas;

/** A guia da DCTFWeb vem só em PDF: valor e vencimento não chegam em campo. */
export function lerGuiaDaDctfweb(r: RespostaLida): Leitura<GuiaDaDctfwebLida> {
  const erro = recusada(r);
  if (erro) return { ok: false, erro };
  const o = primeiro(r.dados);
  const pdf = texto(o?.PDFByteArrayBase64 ?? o?.pdf);
  return pdf ? { ok: true, dados: { pdf } } : { ok: false, erro: "O Serpro não devolveu o PDF da guia da DCTFWeb." };
}

export function lerDarfDoSicalc(r: RespostaLida): Leitura<DarfDoSicalcLido> {
  const erro = recusada(r);
  if (erro) return { ok: false, erro };
  const o = objeto(r.dados);
  const pdf = texto(o?.darf ?? o?.pdf);
  if (!o || !pdf) return { ok: false, erro: "O Serpro não devolveu o PDF do DARF." };
  const c = objeto(o.consolidado);
  const principal = centavos(c?.valorPrincipalMoedaCorrente);
  const total = centavos(c?.valorTotalConsolidado);
  return {
    ok: true,
    dados: {
      pdf,
      consolidado:
        c && principal !== null && total !== null
          ? {
              principal,
              multa: centavos(c.valorMultaMora) ?? 0,
              juros: centavos(c.valorJuros) ?? 0,
              total,
              percentualMulta: numero(c.percentualMultaMora),
              percentualJuros: numero(c.percentualJuros),
              termoInicialJuros: dataIso(c.termoInicialJuros),
              dataConsolidacao: dataIso(c.dataArrecadacaoConsolidacao),
              validoAte: dataIso(c.dataValidadeCalculo),
            }
          : null,
      numeroDocumento: texto(o.numeroDocumento),
      qrCode: texto(o.qrCode),
    },
  };
}

/** Quem lê o quê. A conferência de procurações tem o leitor dela em regras.ts (`resultadoDaConferencia`). */
export const LEITORES = {
  GERARDAS12: lerDasDoSimples,
  GERARDASPDF21: lerDasDoMei,
  GERARGUIA31: lerGuiaDaDctfweb,
  GERARGUIAANDAMENTO313: lerGuiaDaDctfweb,
  CONSOLIDARGERARDARF51: lerDarfDoSicalc,
} as const;

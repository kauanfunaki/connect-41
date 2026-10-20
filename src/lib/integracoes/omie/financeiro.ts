// Contas a pagar e a receber do Omie → financeiro do Connect (25/09).
//
// É o fluxo que o BPO já usa no Omie: a nota vira conta lá dentro, a conta tem
// situação (em aberto, paga, recebida) e categoria, e a DRE sai disso. Em vez
// de o Connect derivar a conta da nota de novo, ele **lê a conta pronta**.
//
// ─── De onde vem ─────────────────────────────────────────────────────────────
//
// `financas/mf` `ListarMovimentos` (movimentos financeiros), e não
// `ListarContasPagar`/`ListarContasReceber`: só os movimentos trazem a **data
// do pagamento** e o valor pago — sem isso a DRE financeira (caixa) não sai.
// Campos pela documentação do Omie, conferida em 25/09:
//   detalhes: nCodTitulo, cNumTitulo, dDtEmissao, dDtVenc, dDtPagamento,
//             nCodCliente, cCPFCNPJCliente, cNatureza (P|R), cStatus,
//             nValorTitulo, cCodCateg, cNumDocFiscal,
//             nCodCC e dDtPrevisao (20/10: conta corrente e previsão do título —
//             vistos numa resposta real da ER Dias, em todos os 100 títulos da
//             página; a previsão vem sempre, igual ao vencimento em 86 deles)
//   resumo:   cLiquidado (S|N), nValPago, nValAberto
//   categorias:    rateio [{ cCodCateg, nDistrPercentual, nDistrValor, nValorFixo }]
//   departamentos: rateio [{ cCodDepartamento, nDistrPercentual, nDistrValor, nValorFixo }]
//             (20/10, vistos numa resposta real de uma empresa cliente: as listas
//             só vêm com `cExibirDepartamentos: "S"` no pedido; `categorias`
//             só quando há duas ou mais, e `departamentos` desde uma. Batem
//             linha a linha com as do `ListarContasPagar`)
// E `geral/categorias` `ListarCategorias` para o nome e o grupo de cada código:
//   { codigo, descricao, conta_receita, conta_despesa, conta_inativa,
//     totalizadora, categoria_superior }
// E `geral/departamentos` `ListarDepartamentos` para o nome de cada
// departamento: { codigo, descricao, estrutura, inativo }.
//
// **Ainda não visto numa resposta real** — por isso a importação tem prévia
// (nada é gravado até alguém conferir) e tudo aqui lê com tolerância: campo com
// outro nome vira contador de "fora", não erro nem dado inventado.

import { chaveDaCategoria } from "@/lib/dre/calculo";
import { repartir } from "@/lib/financeiro/rateio";
import { instanteDoOmie } from "./notas";
import { MOTIVO_DA_LINHA, type MotivoDaLinhaFora } from "./conciliacao";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const digitos = (v: unknown): string => texto(v).replace(/\D/g, "");

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = texto(v);
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

/** A primeira lista da resposta — o nome do campo muda de método para método no Omie. */
function primeiraLista(corpo: unknown, preferidos: string[]): unknown[] {
  const o = obj(corpo);
  for (const k of preferidos) if (Array.isArray(o[k])) return o[k] as unknown[];
  for (const v of Object.values(o)) if (Array.isArray(v)) return v;
  return [];
}

function totalDePaginas(corpo: unknown, ...campos: string[]): number {
  const o = obj(corpo);
  for (const c of campos) {
    const n = Number(o[c]);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 1;
}

// ─── Categorias ─────────────────────────────────────────────────────────────

export type CategoriaDoOmie = {
  codigo: string;
  nome: string;
  /** Nome do grupo (a categoria totalizadora de cima), quando a lista o traz. */
  grupo: string | null;
  kind: "PAGAR" | "RECEBER" | null;
  inativa: boolean;
};

export function paginaDeCategorias(corpo: unknown): { itens: unknown[]; totalDePaginas: number } {
  return {
    itens: primeiraLista(corpo, ["categoria_cadastro", "categorias"]),
    totalDePaginas: totalDePaginas(corpo, "total_de_paginas"),
  };
}

/**
 * As categorias que recebem lançamento (não as totalizadoras), com o nome do
 * grupo de cima. O grupo sai da própria lista: a totalizadora é outra linha
 * dela, e `categoria_superior` aponta para o código dessa linha.
 */
export function lerCategorias(itens: unknown[]): CategoriaDoOmie[] {
  const linhas = itens.map(obj);
  const nomePorCodigo = new Map(linhas.map((l) => [texto(l.codigo), texto(l.descricao)]));
  const saida: CategoriaDoOmie[] = [];
  for (const l of linhas) {
    const codigo = texto(l.codigo);
    const nome = texto(l.descricao) || texto(l.descricao_padrao);
    if (!codigo || !nome || texto(l.totalizadora) === "S") continue;
    const receita = texto(l.conta_receita) === "S";
    const despesa = texto(l.conta_despesa) === "S";
    saida.push({
      codigo,
      nome: nome.slice(0, 120),
      grupo: nomePorCodigo.get(texto(l.categoria_superior)) || null,
      kind: receita && !despesa ? "RECEBER" : despesa && !receita ? "PAGAR" : null,
      inativa: texto(l.conta_inativa) === "S",
    });
  }
  return saida;
}

// ─── Movimentos (títulos) ───────────────────────────────────────────────────

export type TituloDoOmie = {
  omieTitleId: string;
  kind: "PAGAR" | "RECEBER";
  situacao: "ABERTO" | "PAGO" | "CANCELADO";
  /**
   * Pagamento parcial: em aberto, com o que já foi pago como baixa (fila do
   * BPO, 19/10 — antes ficava em aberto sem a parte paga).
   */
  parcial: boolean;
  /**
   * O principal pago lá, em centavos: o valor do título pago; na parcial, o
   * `nValPago` (sem juros, multa nem desconto — o `nValLiquido` é que os soma).
   */
  pagoCentavos: number;
  /** O dia do último pagamento: o do pago, e o da parcial. */
  ultimoPagamento: Date | null;
  emissao: Date | null;
  vencimento: Date;
  pagamento: Date | null;
  competencia: string;
  valor: number;
  categoriaCodigo: string | null;
  contraparteDocumento: string | null;
  contraparteCodigo: string | null;
  descricao: string | null;
  /** `cNumTitulo` — o "Número do documento" do título no Omie (19/10). */
  numeroDocumento: string | null;
  /**
   * `nCodCC` — a "Conta Corrente" do título no Omie (20/10): vira a conta
   * corrente prevista no Connect, pela conta bancária ligada a ela.
   */
  contaCorrenteId: string | null;
  /**
   * `dDtPrevisao` — a "Data de Previsão" do Omie (20/10). Nula quando é o
   * próprio vencimento (é o que a nula diz no Connect) e na conta que não está
   * em aberto: a previsão é só de conta em aberto, como no lançamento manual.
   */
  previsao: Date | null;
  /**
   * O rateio do título (20/10): as linhas de categoria e departamento, em
   * centavos que somam o valor. Vazio: o título numa categoria só
   * (`categoriaCodigo`). Com rateio, `categoriaCodigo` é o da linha maior.
   */
  rateio: LinhaDoRateioDoOmie[];
  /** A lista de rateio veio sem valor e sem percentual: o título fica numa categoria só. */
  rateioIlegivel: boolean;
  /**
   * O departamento do título sem rateio, quando ele tem um só (20/10): o
   * centro de custo da conta sai dele. Nulo sem departamento e no rateado —
   * aí o departamento vai nas linhas.
   */
  departamentoCodigo: string | null;
};

// ─── Rateio (20/10) ──────────────────────────────────────────────────────────
//
// O Omie rateia categorias por valor e departamentos por percentual, cada
// lista por conta própria, as duas no título inteiro. O Connect guarda linhas
// de categoria + centro (`finance_entry_allocations`), então o rateio do Omie
// vira o cruzamento das duas: cada categoria leva a sua parte do valor, e essa
// parte se divide entre os departamentos na proporção deles. A soma de cada
// categoria fica exata (é o que a DRE soma), e o centavo que sobra de cada
// divisão fecha pelo maior resto (`repartir`).

export type LinhaDoRateioDoOmie = {
  /** O código da categoria no Omie; nulo quando o título não diz nenhuma. */
  categoriaCodigo: string | null;
  /** `cCodDepartamento`; nulo quando o título não tem departamento. */
  departamentoCodigo: string | null;
  centavos: number;
};

/**
 * Uma lista de rateio do Omie em partes: o código e o peso de cada linha. O
 * peso é o valor (em centavos) e, se alguma linha não o diz, o percentual.
 * Código repetido soma numa parte; linha sem código ou sem peso sai. `null`
 * quando a lista existe mas não se lê (nem valor nem percentual).
 */
function partesDoRateio(lista: unknown, campos: { codigo: string[]; valor: string[]; percentual: string[] }): { codigo: string; peso: number }[] | null {
  if (!Array.isArray(lista)) return [];
  const linhas = lista.map(obj).map((l) => ({
    codigo: campos.codigo.map((k) => texto(l[k])).find((c) => c && c !== "0") ?? "",
    valor: campos.valor.map((k) => numero(l[k])).find((n) => n !== null) ?? null,
    percentual: campos.percentual.map((k) => numero(l[k])).find((n) => n !== null) ?? null,
  }));
  const comCodigo = linhas.filter((l) => l.codigo);
  if (comCodigo.length === 0) return [];
  const porValor = comCodigo.every((l) => l.valor !== null);
  if (!porValor && !comCodigo.every((l) => l.percentual !== null)) return null;
  const partes = new Map<string, number>();
  for (const l of comCodigo) {
    const peso = porValor ? Math.round(l.valor! * 100) : l.percentual!;
    if (peso > 0) partes.set(l.codigo, (partes.get(l.codigo) ?? 0) + peso);
  }
  return [...partes].map(([codigo, peso]) => ({ codigo, peso }));
}

/**
 * O rateio de um movimento em linhas que somam `valorCentavos`. Rateio é ter
 * duas ou mais categorias ou dois ou mais departamentos; com uma categoria e
 * um departamento só, não há o que ratear (`linhas` vazio), e `categoriaCodigo`
 * e `departamentoCodigo` dizem a categoria e o departamento. `ilegivel` quando
 * uma das listas veio sem valor e sem percentual — aí o título fica numa
 * categoria só, como antes.
 */
export function rateioDoMovimento(
  movimento: unknown,
  valorCentavos: number,
  categoriaDoTitulo: string | null
): { linhas: LinhaDoRateioDoOmie[]; categoriaCodigo: string | null; departamentoCodigo: string | null; ilegivel: boolean } {
  const m = obj(movimento);
  const categorias = partesDoRateio(m.categorias, {
    codigo: ["cCodCateg", "codigo_categoria"],
    valor: ["nDistrValor", "nValor", "valor"],
    percentual: ["nDistrPercentual", "nPerc", "percentual"],
  });
  const departamentos = partesDoRateio(m.departamentos, {
    codigo: ["cCodDepartamento", "cCodDep"],
    valor: ["nDistrValor", "nValDep"],
    percentual: ["nDistrPercentual", "nPerDep"],
  });
  if (categorias === null || departamentos === null) return { linhas: [], categoriaCodigo: categoriaDoTitulo, departamentoCodigo: null, ilegivel: true };
  // Uma categoria só na lista vale mais que a do título: no título rateado, o
  // `cCodCateg` vem com um código que não é nenhuma das linhas.
  const categoriaUnica = categorias.length === 1 ? categorias[0]!.codigo : categoriaDoTitulo;
  if (categorias.length < 2 && departamentos.length < 2) {
    return { linhas: [], categoriaCodigo: categoriaUnica, departamentoCodigo: departamentos[0]?.codigo ?? null, ilegivel: false };
  }

  const porCategoria: { codigo: string | null; centavos: number }[] =
    categorias.length >= 2
      ? repartir(valorCentavos, categorias.map((c) => c.peso)).map((centavos, i) => ({ codigo: categorias[i]!.codigo, centavos }))
      : [{ codigo: categoriaUnica, centavos: valorCentavos }];
  const linhas: LinhaDoRateioDoOmie[] = [];
  for (const c of porCategoria) {
    if (departamentos.length === 0) {
      linhas.push({ categoriaCodigo: c.codigo, departamentoCodigo: null, centavos: c.centavos });
      continue;
    }
    repartir(c.centavos, departamentos.map((d) => d.peso)).forEach((centavos, j) =>
      linhas.push({ categoriaCodigo: c.codigo, departamentoCodigo: departamentos[j]!.codigo, centavos })
    );
  }
  const comValor = linhas.filter((l) => l.centavos > 0);
  if (comValor.length < 2) {
    return {
      linhas: [],
      categoriaCodigo: comValor[0]?.categoriaCodigo ?? categoriaUnica,
      departamentoCodigo: comValor[0]?.departamentoCodigo ?? null,
      ilegivel: false,
    };
  }
  const maior = comValor.reduce((a, l) => (l.centavos > a.centavos ? l : a), comValor[0]!);
  return { linhas: comValor, categoriaCodigo: maior.categoriaCodigo, departamentoCodigo: null, ilegivel: false };
}

export type DepartamentoDoOmie = { codigo: string; nome: string; estrutura: string | null; inativo: boolean };

export function paginaDeDepartamentos(corpo: unknown): { itens: unknown[]; totalDePaginas: number } {
  return {
    itens: primeiraLista(corpo, ["departamentos"]),
    totalDePaginas: totalDePaginas(corpo, "total_de_paginas"),
  };
}

export function lerDepartamentos(itens: unknown[]): DepartamentoDoOmie[] {
  return itens
    .map(obj)
    .map((d) => ({ codigo: texto(d.codigo), nome: texto(d.descricao), estrutura: texto(d.estrutura) || null, inativo: texto(d.inativo) === "S" }))
    .filter((d) => d.codigo && d.nome);
}

/**
 * O de-para de departamento do Omie → centro de custo do Connect: o centro
 * cujo código é o código do departamento ou a estrutura dele ("001.002") e,
 * sem esse, o de mesmo nome (sem acento nem caixa). Departamento sem par fica
 * de fora — a linha do rateio vai sem centro.
 */
export function centrosDosDepartamentos(
  departamentos: DepartamentoDoOmie[],
  centros: { id: string; name: string; code: string | null }[]
): Map<string, string> {
  const porCodigo = new Map(centros.filter((c) => c.code).map((c) => [c.code!.trim(), c.id]));
  const porNome = new Map(centros.map((c) => [chaveDaCategoria(c.name), c.id]));
  const mapa = new Map<string, string>();
  for (const d of departamentos) {
    const id = porCodigo.get(d.codigo) ?? (d.estrutura ? porCodigo.get(d.estrutura) : undefined) ?? porNome.get(chaveDaCategoria(d.nome));
    if (id) mapa.set(d.codigo, id);
  }
  return mapa;
}

export type MotivoDoTituloFora =
  | "sem_titulo" // movimento sem nCodTitulo: não é conta (lançamento de conta corrente etc.)
  | "natureza" // nem P nem R
  | "sem_vencimento"
  | "sem_valor"
  | "pago_sem_data"; // pago mas sem data de pagamento: não dá para pôr no caixa

export const MOTIVO_DO_TITULO: Record<MotivoDoTituloFora, string> = {
  sem_titulo: "sem título (lançamentos de conta corrente)",
  natureza: "sem natureza a pagar/receber",
  sem_vencimento: "sem vencimento",
  sem_valor: "sem valor",
  pago_sem_data: "pagos sem data de pagamento",
};

export function paginaDeMovimentos(corpo: unknown): { itens: unknown[]; totalDePaginas: number } {
  return {
    itens: primeiraLista(corpo, ["movimentos"]),
    totalDePaginas: totalDePaginas(corpo, "nTotPaginas", "total_de_paginas"),
  };
}

const PAGO = new Set(["PAGO", "RECEBIDO", "LIQUIDADO"]);

export function mapearMovimento(item: unknown): TituloDoOmie | { fora: MotivoDoTituloFora } {
  const m = obj(item);
  const d = obj(m.detalhes);
  const r = obj(m.resumo);

  const id = texto(d.nCodTitulo);
  if (!id || id === "0") return { fora: "sem_titulo" };
  const natureza = texto(d.cNatureza).toUpperCase();
  const kind = natureza === "P" ? "PAGAR" : natureza === "R" ? "RECEBER" : null;
  if (!kind) return { fora: "natureza" };

  const vencimento = instanteDoOmie(d.dDtVenc, null);
  if (!vencimento) return { fora: "sem_vencimento" };
  const valor = numero(d.nValorTitulo);
  if (valor === null || valor <= 0) return { fora: "sem_valor" };

  const status = texto(d.cStatus).toUpperCase().replace(/\s|_/g, "");
  const liquidado = texto(r.cLiquidado).toUpperCase() === "S";
  const situacao = status === "CANCELADO" ? "CANCELADO" : PAGO.has(status) || liquidado ? "PAGO" : "ABERTO";
  const pagamento = situacao === "PAGO" ? instanteDoOmie(d.dDtPagamento, null) : null;
  if (situacao === "PAGO" && !pagamento) return { fora: "pago_sem_data" };
  const parcial = status === "PAGTOPARCIAL" || (situacao === "ABERTO" && (numero(r.nValPago) ?? 0) > 0);
  const valorCentavos = Math.round(valor * 100);
  const pagoCentavos =
    situacao === "PAGO" ? valorCentavos : parcial ? Math.min(valorCentavos, Math.max(0, Math.round((numero(r.nValPago) ?? 0) * 100))) : 0;

  const emissao = instanteDoOmie(d.dDtEmissao, null);
  // Competência = mês da emissão, como o Omie escreve (horário de Brasília);
  // sem emissão, o do vencimento.
  const [, mes, ano] = texto(emissao ? d.dDtEmissao : d.dDtVenc).split("/");

  // Categoria: a do título; com rateio, as linhas, e a categoria da linha
  // maior como o resumo da conta.
  const rateio = rateioDoMovimento(m, valorCentavos, texto(d.cCodCateg) || null);

  const documento = digitos(d.cCPFCNPJCliente);
  const numeroTitulo = texto(d.cNumTitulo);
  const notaFiscal = texto(d.cNumDocFiscal);
  const contaCorrente = texto(d.nCodCC);
  // Previsão fora do formato vira nula, como o resto: o título entra igual.
  const previsao = situacao === "ABERTO" ? instanteDoOmie(d.dDtPrevisao, null) : null;
  return {
    omieTitleId: id.slice(0, 20),
    kind,
    situacao,
    parcial,
    pagoCentavos,
    ultimoPagamento: situacao === "PAGO" ? pagamento : parcial ? instanteDoOmie(d.dDtPagamento, null) : null,
    emissao,
    vencimento,
    pagamento,
    competencia: `${ano}-${mes}`,
    valor: Math.round(valor * 100) / 100,
    categoriaCodigo: rateio.categoriaCodigo,
    contraparteDocumento: documento.length === 11 || documento.length === 14 ? documento : null,
    contraparteCodigo: texto(d.nCodCliente) || null,
    descricao: [numeroTitulo && `Título ${numeroTitulo}`, notaFiscal && `NF ${notaFiscal}`].filter(Boolean).join(" · ").slice(0, 255) || null,
    numeroDocumento: numeroTitulo.slice(0, 60) || null,
    contaCorrenteId: contaCorrente && contaCorrente !== "0" ? contaCorrente.slice(0, 20) : null,
    previsao: previsao && previsao.getTime() !== vencimento.getTime() ? previsao : null,
    rateio: rateio.linhas,
    rateioIlegivel: rateio.ilegivel,
    departamentoCodigo: rateio.departamentoCodigo,
  };
}

/**
 * As baixas de um título, uma a uma (`ListarMovimentos` com
 * `cTpLancamento: "BX"` e `nCodTitulo`) — para a parcial entrar no caixa no
 * dia de cada pagamento (fila do BPO, 19/10). O valor de cada uma é o do
 * movimento na conta (`nValorMovCC`); quem chama confere a soma contra o
 * `nValPago` do título, e baixa com juros (o movimento passa do principal)
 * não fecha — aí o pago vai numa baixa só.
 *
 * `null` quando alguma linha não diz código, dia ou valor.
 */
export function mapearBaixasDoTitulo(corpo: unknown, omieTitleId: string): { chave: string; principalCentavos: number; paidAt: Date }[] | null {
  const porChave = new Map<string, { chave: string; principalCentavos: number; paidAt: Date }>();
  for (const item of paginaDeMovimentos(corpo).itens) {
    const d = obj(obj(item).detalhes);
    const r = obj(obj(item).resumo);
    const titulo = texto(d.nCodTitulo);
    if (titulo && titulo !== "0" && titulo.slice(0, 20) !== omieTitleId) continue;
    const chave = texto(d.nCodBaixa).slice(0, 20);
    if (!chave || chave === "0") return null;
    const paidAt = instanteDoOmie(d.dDtPagamento, null) ?? instanteDoOmie(d.dDtCredito, null);
    const valor = numero(d.nValorMovCC) ?? numero(r.nValPago);
    if (!paidAt || valor === null || valor === 0) return null;
    porChave.set(chave, { chave, principalCentavos: Math.round(Math.abs(valor) * 100), paidAt });
  }
  return [...porChave.values()].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
}

/** O resumo de uma leitura, para gente — como o das notas. */
export function mensagemDoFinanceiro(c: Record<string, number>, gravou: boolean): string {
  const n = (k: string) => c[k] ?? 0;
  const partes = [
    gravou ? `${n("novos")} contas novas` : `${n("novos")} contas entrariam`,
    n("atualizados") ? `${n("atualizados")} ${gravou ? "atualizadas" : "seriam atualizadas"}` : null,
    n("iguais") ? `${n("iguais")} sem mudança` : null,
    n("parciais") ? `${n("parciais")} com pagamento parcial (em aberto, com o que já foi pago)` : null,
    n("parciais_sem_data") ? `${n("parciais_sem_data")} parciais sem data de pagamento no Omie (ficam em aberto sem a parte paga)` : null,
    n("parciais_numa_baixa") ? `${n("parciais_numa_baixa")} parciais com o pago numa baixa só (as baixas de lá não fecharam com o total)` : null,
    n("sem_categoria") ? `${n("sem_categoria")} sem categoria` : null,
    n("rateados") ? `${n("rateados")} rateadas no Omie (as linhas do rateio vêm junto)` : null,
    n("rateio_linhas_sem_categoria") ? `${n("rateio_linhas_sem_categoria")} linhas de rateio sem categoria` : null,
    n("rateio_departamento_sem_centro")
      ? `${n("rateio_departamento_sem_centro")} linhas de rateio com departamento do Omie sem centro de custo de mesmo nome ou código no Connect (ficam sem centro)`
      : null,
    n("rateio_ilegivel") ? `${n("rateio_ilegivel")} com rateio sem valor nem percentual no Omie (ficam numa categoria só)` : null,
    n("departamento_sem_centro")
      ? `${n("departamento_sem_centro")} com departamento do Omie sem centro de custo de mesmo nome ou código no Connect (ficam sem centro)`
      : null,
    n("conta_prevista_sem_par")
      ? `${n("conta_prevista_sem_par")} com conta corrente do Omie sem conta bancária ligada no Connect (ficam sem conta prevista)`
      : null,
    n("categorias_novas") ? `${n("categorias_novas")} categorias do Omie ${gravou ? "criadas" : "a criar"} no plano da empresa` : null,
    n("preservados") ? `${n("preservados")} não mexidas (em acordo ou baixadas por perda no Connect)` : null,
    ...(Object.keys(MOTIVO_DO_TITULO) as MotivoDoTituloFora[])
      .filter((m) => n(`fora_${m}`) > 0)
      .map((m) => `${n(`fora_${m}`)} ${MOTIVO_DO_TITULO[m]}`),
  ].filter(Boolean);

  // Conciliação: só aparece quando a leitura chegou às linhas de conta.
  const conciliacao = [
    n("contas_ligadas") ? `${n("contas_ligadas")} conta(s) bancária(s) ligada(s) ao Omie` : null,
    n("contas_sem_par_no_omie") ? `${n("contas_sem_par_no_omie")} sem conta correspondente no Omie` : null,
    n("baixas_conciliadas") || n("baixas_nao_conciliadas")
      ? `${n("baixas_conciliadas")} baixas conciliadas no Omie e ${n("baixas_nao_conciliadas")} ainda não`
      : null,
    n("baixas_sem_titulo_no_connect") ? `${n("baixas_sem_titulo_no_connect")} baixas de títulos que o Connect ainda não tem (não importados ou vencidos antes da janela)` : null,
    n("contas_criadas") ? `${n("contas_criadas")} conta(s) do Omie ${gravou ? "criadas" : "a criar"} no Connect` : null,
    n("transferencias_novas")
      ? `${n("transferencias_novas")} transferências entre contas ${gravou ? "lançadas" : "a lançar"}`
      : null,
    n("lancamentos_de_conta_novos")
      ? `${n("lancamentos_de_conta_novos")} lançamentos de conta sem título (tarifa, rendimento…) ${gravou ? "lançados" : "a lançar"}`
      : null,
    n("extrato_conciliado_pelo_omie") ? `${n("extrato_conciliado_pelo_omie")} linhas do extrato conciliadas pelo Omie` : null,
    ...(Object.keys(MOTIVO_DA_LINHA) as MotivoDaLinhaFora[])
      .filter((m) => n(`conta_fora_${m}`) > 0)
      .map((m) => `${n(`conta_fora_${m}`)} ${MOTIVO_DA_LINHA[m]}`),
  ].filter(Boolean);

  return (
    `${n("lidos")} movimentos lidos em ${n("paginas")} página(s): ${partes.join(", ")}.` +
    (conciliacao.length ? ` Conciliação: ${conciliacao.join(", ")}.` : "")
  );
}

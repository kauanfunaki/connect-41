// A leitura do arquivo da EFD ICMS/IPI no Connect (29/10/2026). Puro.
//
// O motor gera o arquivo; a revisão dele é feita aqui. É o porte de três
// módulos do SPED Generator, com a mesma regra e os mesmos nomes:
//
// - `analise_classificacao.py`: a fila de classificação dos itens de entrada
//   (0200 + C170), agrupada por CFOP e por produto;
// - `analise_apuracao.py`: o E110, os E111, os C190/D190 separados em entrada
//   e saída pelo IND_OPER do pai, e as conferências que o gerador promete;
// - `demonstrativo_icms.py`: o livro de entradas e saídas no formato da
//   Domínio (CFOP + alíquota, com isentas e outras derivadas pelo CST).
//
// A leitura é linha a linha (`lerLinha` devolve `false` quando não precisa de
// mais nada): a classificação para no `D001`, porque numa transportadora o
// bloco D (os CT-e) é quase todo o arquivo.
//
// Dinheiro anda em CENTAVOS inteiros, não em float: o painel somava float e
// arredondava no fim; aqui a soma de milhões de linhas fecha no centavo.
// Alíquota anda em centésimos de ponto percentual (18,00% = 1800).

/** "1234,56" → 123456 centavos. Vazio é zero, como no painel (`_valor`). */
export function centavos(texto: string | undefined): number {
  const t = (texto ?? "").trim();
  if (!t) return 0;
  const negativo = t.startsWith("-");
  const [inteiro = "0", fracao = ""] = t.replace(/^[-+]/, "").split(",");
  const dois = (fracao + "00").slice(0, 2);
  // A terceira casa arredonda: valor do SPED tem duas, mas campo de quantidade
  // e alíquota podem trazer mais.
  const arredonda = Number(fracao[2] ?? "0") >= 5 ? 1 : 0;
  const n = Number(inteiro || "0") * 100 + Number(dois) + arredonda;
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}

// ─── Classificação ───────────────────────────────────────────────────────────

/** Tabela 4.9.1 do Guia Prático — os códigos de TIPO_ITEM. */
export const TIPO_ITEM: Readonly<Record<string, string>> = {
  "00": "Mercadoria para revenda",
  "01": "Matéria-prima",
  "02": "Embalagem",
  "03": "Produto em processo",
  "04": "Produto acabado",
  "05": "Subproduto",
  "06": "Produto intermediário",
  "07": "Uso e consumo",
  "08": "Ativo imobilizado",
  "09": "Serviços",
  "10": "Outros insumos",
  "99": "Outras",
};

/**
 * As destinações oferecidas, as mesmas do painel (`TIPOS_OFERECIDOS`): numa
 * transportadora, "produto em processo" ou "subproduto" seria convite a erro.
 */
export const DESTINACOES_OFERECIDAS = ["10", "07", "08", "00", "99"] as const;

/**
 * As definições de CFOP de entrada que aparecem nos arquivos (o painel chama
 * de `DEFINICOES_COMUNS`). O gerador monta o CFOP com o prefixo da operação e
 * este sufixo (`cfop_depara.Reclassificador`).
 */
export const DEFINICOES_DE_CFOP: readonly { valor: string; rotulo: string }[] = [
  { valor: "126", rotulo: "Compra para utilização na prestação de serviço sujeita ao ICMS" },
  { valor: "556", rotulo: "Compra de material para uso ou consumo" },
  { valor: "407", rotulo: "Compra para uso ou consumo com substituição tributária" },
  { valor: "551", rotulo: "Compra de bem para o ativo imobilizado" },
  { valor: "653", rotulo: "Compra de combustível ou lubrificante por consumidor final" },
  { valor: "933", rotulo: "Aquisição de serviço tributado pelo ISSQN" },
  { valor: "949", rotulo: "Outra entrada de mercadoria ou prestação de serviço" },
];

/** A definição sugerida quando o fiscal escolhe a destinação (uso e consumo → x556). Só sugestão. */
export const DEFINICAO_SUGERIDA: Readonly<Record<string, string>> = { "07": "556", "08": "551" };

// CSOSN: o Simples Nacional usa tabela própria; o crédito não é automático.
const CSOSN = new Set(["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"]);

export type GrupoPorCfop = {
  cfop: string;
  tipoItem: string;
  itens: number;
  ocorrencias: number;
  valor: number;
  icms: number;
};

export type ProdutoDeEntrada = {
  /** COD_ITEM do arquivo: "<CNPJ do emitente>-<cProd>" (`itens_sped.cod_item_sped`). */
  codItem: string;
  cnpjFornecedor: string;
  codProd: string;
  descricao: string;
  ncm: string;
  tipoItem: string;
  /** O primeiro CST visto (pode variar entre notas); é ele que diz se é Simples. */
  cst: string;
  simples: boolean;
  cfops: string[];
  ocorrencias: number;
  valor: number;
  icms: number;
};

export type LeituraDaClassificacao = {
  competencia: string;
  cnpj: string;
  porCfop: GrupoPorCfop[];
  produtos: ProdutoDeEntrada[];
  /** Itens no catálogo (0200). */
  totalItens: number;
  /** Itens em TIPO_ITEM 99. */
  semTipo: number;
  icmsSimples: number;
};

function competenciaDoRegistro0000(c: string[]): string {
  const dtIni = c[4] ?? "";
  return dtIni.length === 8 ? `${dtIni.slice(4, 8)}-${dtIni.slice(2, 4)}` : "";
}

/** A leitura da classificação, linha a linha. `lerLinha` devolve `false` no `D001`. */
export function leitorDaClassificacao() {
  let competencia = "";
  let cnpj = "";
  const catalogo = new Map<string, { descricao: string; ncm: string; tipo: string }>();
  const porCfop = new Map<string, GrupoPorCfop & { codigos: Set<string> }>();
  const produtos = new Map<string, ProdutoDeEntrada & { cfopsVistos: Set<string> }>();

  function lerLinha(linha: string): boolean {
    if (!linha.startsWith("|")) return true;
    const c = linha.split("|");
    if (c.length < 3) return true;
    const reg = c[1];
    if (reg === "D001") return false;
    if (reg === "0000") {
      competencia = competenciaDoRegistro0000(c);
      cnpj = c[7] ?? "";
    } else if (reg === "0200" && c.length > 8) {
      // |0200|COD_ITEM|DESCR_ITEM|COD_BARRA|COD_ANT_ITEM|UNID_INV|TIPO_ITEM|COD_NCM|...
      catalogo.set(c[2], { descricao: c[3], ncm: c[8], tipo: c[7] });
    } else if (reg === "C170" && c.length > 15) {
      // |C170|NUM_ITEM|COD_ITEM|DESCR_COMPL|QTD|UNID|VL_ITEM|VL_DESC|IND_MOV|CST_ICMS|CFOP|COD_NAT|VL_BC_ICMS|ALIQ_ICMS|VL_ICMS|...
      const codItem = c[3];
      const cst = c[10].trim();
      const cfop = c[11];
      const valor = centavos(c[7]);
      const icms = centavos(c[15]);
      const item = catalogo.get(codItem) ?? { descricao: "", ncm: "", tipo: "" };

      const chaveDoGrupo = `${cfop}|${item.tipo}`;
      let grupo = porCfop.get(chaveDoGrupo);
      if (!grupo) porCfop.set(chaveDoGrupo, (grupo = { cfop, tipoItem: item.tipo, itens: 0, ocorrencias: 0, valor: 0, icms: 0, codigos: new Set() }));
      grupo.codigos.add(codItem);
      grupo.ocorrencias += 1;
      grupo.valor += valor;
      grupo.icms += icms;

      // Todo produto entra, não só os de fornecedor do Simples: até 13/08/2026
      // o painel listava só os CSOSN, e o CFOP 1126 de setembro/SP tinha
      // crédito de R$ 449,48 num item de CST comum que não aparecia em lugar
      // nenhum onde se pudesse decidir.
      let produto = produtos.get(codItem);
      if (!produto) {
        const [cnpjFornecedor, ...resto] = codItem.split("-");
        produtos.set(codItem, (produto = {
          codItem, cnpjFornecedor, codProd: resto.length ? resto.join("-") : codItem,
          descricao: item.descricao, ncm: item.ncm, tipoItem: item.tipo, cst: "", simples: false,
          cfops: [], cfopsVistos: new Set(), ocorrencias: 0, valor: 0, icms: 0,
        }));
      }
      if (!produto.cst) produto.cst = cst;
      produto.cfopsVistos.add(cfop);
      produto.ocorrencias += 1;
      produto.valor += valor;
      produto.icms += icms;
    }
    return true;
  }

  function resultado(): LeituraDaClassificacao {
    const grupos = [...porCfop.values()].map(({ codigos, ...g }) => ({ ...g, itens: codigos.size }));
    // Por ICMS em jogo: é onde a decisão do fiscal muda mais dinheiro.
    grupos.sort((a, b) => b.icms - a.icms);
    const lista = [...produtos.values()].map(({ cfopsVistos, ...p }) => ({ ...p, simples: CSOSN.has(p.cst), cfops: [...cfopsVistos].sort() }));
    lista.sort((a, b) => b.valor - a.valor);
    let semTipo = 0;
    for (const item of catalogo.values()) if (item.tipo === "99") semTipo += 1;
    return {
      competencia, cnpj, porCfop: grupos, produtos: lista,
      totalItens: catalogo.size, semTipo,
      icmsSimples: lista.reduce((s, p) => s + (p.simples ? p.icms : 0), 0),
    };
  }

  return { lerLinha, resultado };
}

// ─── Apuração ────────────────────────────────────────────────────────────────

/** E110, campos 02 a 15, na ordem do Guia Prático. */
export const CAMPOS_E110 = [
  ["VL_TOT_DEBITOS", "Débitos por saídas"],
  ["VL_AJ_DEBITOS", "Ajustes a débito por documento"],
  ["VL_TOT_AJ_DEBITOS", "Ajustes a débito"],
  ["VL_ESTORNOS_CRED", "Estornos de crédito"],
  ["VL_TOT_CREDITOS", "Créditos por entradas"],
  ["VL_AJ_CREDITOS", "Ajustes a crédito por documento"],
  ["VL_TOT_AJ_CREDITOS", "Ajustes a crédito"],
  ["VL_ESTORNOS_DEB", "Estornos de débito"],
  ["VL_SLD_CREDOR_ANT", "Saldo credor do período anterior"],
  ["VL_SLD_APURADO", "Saldo devedor apurado"],
  ["VL_TOT_DED", "Deduções"],
  ["VL_ICMS_RECOLHER", "ICMS a recolher"],
  ["VL_SLD_CREDOR_TRANSPORTAR", "Saldo credor a transportar"],
  ["DEB_ESP", "Débitos especiais"],
] as const;
export type CampoE110 = (typeof CAMPOS_E110)[number][0];

/** Diferença de arredondamento aceita nas conferências (R$ 0,05, como no painel). */
export const TOLERANCIA = 5;

/** Entrada de bem do ativo: o crédito vai em 48 parcelas no CIAP (bloco G). */
export const CFOP_ATIVO_IMOBILIZADO = new Set(["1551", "2551", "1406", "2406", "1553", "2553"]);

export const GRUPOS_DA_APURACAO = [
  { chave: "saidasCte", rotulo: "Saídas · CT-e" },
  { chave: "saidasNfe", rotulo: "Saídas · NF-e" },
  { chave: "entradas", rotulo: "Entradas · NF-e" },
  { chave: "entradasCte", rotulo: "Entradas · CT-e" },
] as const;
export type GrupoDaApuracao = (typeof GRUPOS_DA_APURACAO)[number]["chave"];

export type LinhaCfop = { cfop: string; cst: string; aliquota: number; qtd: number; valorOperacao: number; valorBc: number; valorIcms: number };

/** Em qual campo do E110 o ajuste entra: a 4ª posição do código (tabela 5.1.1). */
export type NaturezaDoAjuste = "debito" | "estorno_credito" | "credito" | "estorno_debito" | "deducao" | "debito_especial";
export const NATUREZAS: Readonly<Record<NaturezaDoAjuste, string>> = {
  debito: "Outros débitos", estorno_credito: "Estorno de créditos", credito: "Outros créditos",
  estorno_debito: "Estorno de débitos", deducao: "Deduções", debito_especial: "Débitos especiais",
};

/**
 * `apuracao.Ajuste.natureza`: o código desconhecido soma como débito — erra
 * para MAIS imposto, nunca para menos.
 */
export function naturezaDoAjuste(codigo: string): NaturezaDoAjuste {
  const mapa: Record<string, NaturezaDoAjuste> = { "0": "debito", "1": "estorno_credito", "2": "credito", "3": "estorno_debito", "4": "deducao", "5": "debito_especial" };
  return (codigo.length >= 4 && mapa[codigo[3]]) || "debito";
}

export type AjusteDoArquivo = { codigo: string; descricao: string; valor: number; natureza: NaturezaDoAjuste };
export type Conferencia = { regra: string; esperado: number; obtido: number; bate: boolean };

export type LeituraDaApuracao = {
  competencia: string;
  cnpj: string;
  nome: string;
  e110: Record<CampoE110, number> | null;
  ajustes: AjusteDoArquivo[];
  grupos: Record<GrupoDaApuracao, LinhaCfop[]>;
  conferencias: Conferencia[];
  temDivergencia: boolean;
};

type Acumulado = Map<string, LinhaCfop>;

function acumular(alvo: Acumulado, c: string[]) {
  const cst = c[2];
  const cfop = c[3];
  const aliquota = centavos(c[4]);
  const chave = `${cfop}|${cst}|${aliquota}`;
  let linha = alvo.get(chave);
  if (!linha) alvo.set(chave, (linha = { cfop, cst, aliquota, qtd: 0, valorOperacao: 0, valorBc: 0, valorIcms: 0 }));
  linha.qtd += 1;
  linha.valorOperacao += centavos(c[5]);
  linha.valorBc += centavos(c[6]);
  linha.valorIcms += centavos(c[7]);
}

/** A leitura da apuração: o arquivo inteiro, numa passada. */
export function leitorDaApuracao() {
  let competencia = "";
  let cnpj = "";
  let nome = "";
  let e110: Record<CampoE110, number> | null = null;
  const ajustes: AjusteDoArquivo[] = [];
  const grupos: Record<GrupoDaApuracao, Acumulado> = { saidasCte: new Map(), saidasNfe: new Map(), entradas: new Map(), entradasCte: new Map() };
  // O C190 e o D190 não dizem o lado; quem diz é o IND_OPER do C100/D100 pai.
  let indOper = "0";

  function lerLinha(linha: string): boolean {
    if (!linha.startsWith("|")) return true;
    const c = linha.split("|");
    if (c.length < 3) return true;
    switch (c[1]) {
      case "0000":
        competencia = competenciaDoRegistro0000(c);
        nome = c[6] ?? "";
        cnpj = c[7] ?? "";
        break;
      case "C100":
        indOper = c[2] ?? "0";
        break;
      case "D100":
        // Desde 16/09/2026 o frete TOMADO entra no D100 com IND_OPER=0, e o ICMS dele é crédito.
        indOper = c[2] ?? "1";
        break;
      case "C190":
        if (c.length > 7) acumular(indOper === "1" ? grupos.saidasNfe : grupos.entradas, c);
        break;
      case "D190":
        if (c.length > 7) acumular(indOper === "1" ? grupos.saidasCte : grupos.entradasCte, c);
        break;
      case "E110":
        e110 = Object.fromEntries(CAMPOS_E110.map(([campo], i) => [campo, centavos(c[i + 2])])) as Record<CampoE110, number>;
        break;
      case "E111":
        if (c.length > 4) ajustes.push({ codigo: c[2], descricao: c[3], valor: centavos(c[4]), natureza: naturezaDoAjuste(c[2]) });
        break;
    }
    return true;
  }

  function resultado(): LeituraDaApuracao {
    // Do maior valor de operação para o menor: é onde o dinheiro está.
    const ordenar = (m: Acumulado) => [...m.values()].sort((a, b) => b.valorOperacao - a.valorOperacao);
    const lidos = { saidasCte: ordenar(grupos.saidasCte), saidasNfe: ordenar(grupos.saidasNfe), entradas: ordenar(grupos.entradas), entradasCte: ordenar(grupos.entradasCte) };
    const conferencias = conferir(e110, ajustes, lidos);
    return { competencia, cnpj, nome, e110, ajustes, grupos: lidos, conferencias, temDivergencia: conferencias.some((x) => !x.bate) };
  }

  return { lerLinha, resultado };
}

const somaIcms = (linhas: LinhaCfop[]) => linhas.reduce((s, l) => s + l.valorIcms, 0);

/**
 * As igualdades que o gerador promete (`analise_apuracao._conferir`). Cada uma
 * que falha aponta para uma causa diferente, por isso ficam separadas.
 */
export function conferir(e110: Record<CampoE110, number> | null, ajustes: AjusteDoArquivo[], g: Record<GrupoDaApuracao, LinhaCfop[]>): Conferencia[] {
  const v = (campo: CampoE110) => e110?.[campo] ?? 0;
  const bate = (esperado: number, obtido: number) => Math.abs(esperado - obtido) <= TOLERANCIA;
  const regra = (texto: string, esperado: number, obtido: number): Conferencia => ({ regra: texto, esperado, obtido, bate: bate(esperado, obtido) });

  const debitosDosDocumentos = somaIcms(g.saidasCte) + somaIcms(g.saidasNfe);
  const creditosDosDocumentos = somaIcms(g.entradas) + somaIcms(g.entradasCte);
  const devedor = v("VL_TOT_DEBITOS") + v("VL_TOT_AJ_DEBITOS") + v("VL_ESTORNOS_CRED");
  const credor = v("VL_TOT_CREDITOS") + v("VL_TOT_AJ_CREDITOS") + v("VL_ESTORNOS_DEB") + v("VL_SLD_CREDOR_ANT");
  const saldo = devedor - credor;
  const lista = [
    regra("Débitos do E110 = ICMS dos CT-e prestados (D190) + ICMS das NF-e de saída (C190)", v("VL_TOT_DEBITOS"), debitosDosDocumentos),
    regra("Créditos do E110 = ICMS das NF-e de entrada (C190) + ICMS do frete tomado (D190)", v("VL_TOT_CREDITOS"), creditosDosDocumentos),
    regra("Saldo devedor apurado = débitos − créditos − saldo anterior", Math.max(0, saldo), v("VL_SLD_APURADO")),
    regra("Saldo credor a transportar = créditos − débitos, quando positivo", Math.max(0, -saldo), v("VL_SLD_CREDOR_TRANSPORTAR")),
    regra("Ajustes do E111 somam o total declarado no E110", v("VL_TOT_AJ_DEBITOS") + v("VL_ESTORNOS_CRED"), ajustes.reduce((s, a) => s + a.valor, 0)),
  ];
  // Crédito sobre ativo imobilizado exige CIAP (bloco G): 48 parcelas, não o
  // valor inteiro no mês da compra. O fiscal confirmou em 12/08/2026.
  const icmsAtivo = g.entradas.filter((l) => CFOP_ATIVO_IMOBILIZADO.has(l.cfop)).reduce((s, l) => s + l.valorIcms, 0);
  if (icmsAtivo > TOLERANCIA) {
    lista.push({ regra: `Crédito de ICMS sobre ativo imobilizado (CFOP ${[...CFOP_ATIVO_IMOBILIZADO].sort().join("/")}) exige CIAP no bloco G — apropriação em 48 parcelas, não integral`, esperado: 0, obtido: icmsAtivo, bate: false });
  }
  return lista;
}

// ─── Livro fiscal (demonstrativo no formato da Domínio) ──────────────────────

/** CSTs cuja parte fora da base é isenta ou não tributada (os dois dígitos finais). */
const CST_ISENTAS = new Set(["40", "41", "50"]);

export type LinhaDoLivro = { cfop: string; aliquota: number; valorContabil: number; baseCalculo: number; imposto: number; isentas: number; outras: number };
export type VerbaDoLivro = { descricao: string; valor: number; detalhe?: boolean; total?: boolean };
export type LivroFiscal = {
  saidas: LinhaDoLivro[];
  entradas: LinhaDoLivro[];
  totalSaidas: LinhaDoLivro;
  totalEntradas: LinhaDoLivro;
  debitos: VerbaDoLivro[];
  creditos: VerbaDoLivro[];
  apuracao: VerbaDoLivro[];
};

function quadroDoLivro(origens: LinhaCfop[]): [LinhaDoLivro[], LinhaDoLivro] {
  const porChave = new Map<string, LinhaDoLivro>();
  for (const o of origens) {
    const chave = `${o.cfop}|${o.aliquota}`;
    let l = porChave.get(chave);
    if (!l) porChave.set(chave, (l = { cfop: o.cfop, aliquota: o.aliquota, valorContabil: 0, baseCalculo: 0, imposto: 0, isentas: 0, outras: 0 }));
    // A parte fora da base nunca é negativa: base maior que a operação é sujeira de origem.
    const fora = Math.max(o.valorOperacao - o.valorBc, 0);
    l.valorContabil += o.valorOperacao;
    l.baseCalculo += o.valorBc;
    l.imposto += o.valorIcms;
    if (CST_ISENTAS.has(o.cst.slice(-2))) l.isentas += fora;
    else l.outras += fora;
  }
  // CFOP e alíquota crescentes — a ordem do relatório da Domínio, para conferir linha a linha.
  const linhas = [...porChave.values()].sort((a, b) => a.cfop.localeCompare(b.cfop) || a.aliquota - b.aliquota);
  const total: LinhaDoLivro = { cfop: "", aliquota: 0, valorContabil: 0, baseCalculo: 0, imposto: 0, isentas: 0, outras: 0 };
  for (const l of linhas) {
    total.valorContabil += l.valorContabil;
    total.baseCalculo += l.baseCalculo;
    total.imposto += l.imposto;
    total.isentas += l.isentas;
    total.outras += l.outras;
  }
  return [linhas, total];
}

/**
 * O livro a partir da apuração já lida (`demonstrativo_icms.montar`). Não
 * recalcula nada: o total de cada quadro vem do E110, e a abertura por código
 * vem dos E111 — se não baterem, a conferência da apuração já diz.
 */
export function livroFiscal(a: LeituraDaApuracao): LivroFiscal {
  const v = (campo: CampoE110) => a.e110?.[campo] ?? 0;
  const [saidas, totalSaidas] = quadroDoLivro([...a.grupos.saidasCte, ...a.grupos.saidasNfe]);
  const [entradas, totalEntradas] = quadroDoLivro([...a.grupos.entradas, ...a.grupos.entradasCte]);
  const abertura = (rotulo: string, natureza: NaturezaDoAjuste, campo: CampoE110): VerbaDoLivro[] => [
    { descricao: rotulo, valor: v(campo) },
    ...a.ajustes.filter((x) => x.natureza === natureza).map((x) => ({ descricao: x.descricao ? `${x.codigo} — ${x.descricao}` : x.codigo, valor: x.valor, detalhe: true })),
  ];
  const totalDebitos = v("VL_TOT_DEBITOS") + v("VL_TOT_AJ_DEBITOS") + v("VL_ESTORNOS_CRED");
  const totalCreditos = v("VL_TOT_CREDITOS") + v("VL_TOT_AJ_CREDITOS") + v("VL_ESTORNOS_DEB");
  return {
    saidas, entradas, totalSaidas, totalEntradas,
    debitos: [
      { descricao: "Débitos pelas saídas", valor: v("VL_TOT_DEBITOS") },
      ...abertura("Outros débitos", "debito", "VL_TOT_AJ_DEBITOS"),
      ...abertura("Estorno de créditos", "estorno_credito", "VL_ESTORNOS_CRED"),
      { descricao: "Total de débitos", valor: totalDebitos, total: true },
    ],
    creditos: [
      { descricao: "Créditos pelas entradas", valor: v("VL_TOT_CREDITOS") },
      ...abertura("Outros créditos", "credito", "VL_TOT_AJ_CREDITOS"),
      ...abertura("Estorno de débitos", "estorno_debito", "VL_ESTORNOS_DEB"),
      { descricao: "Total de créditos", valor: totalCreditos, total: true },
    ],
    // "Outros acréscimos" e "Outras deduções" saem zerados (multa e juros, que o
    // gerador não escritura), mas ficam: o fiscal confere linha a linha contra o papel.
    apuracao: [
      { descricao: "Saldo credor do período anterior", valor: v("VL_SLD_CREDOR_ANT") },
      { descricao: "Total de débitos", valor: totalDebitos },
      { descricao: "Total de créditos", valor: totalCreditos },
      { descricao: "Outros acréscimos", valor: 0 },
      { descricao: "Acréscimos", valor: 0 },
      { descricao: "Outras deduções", valor: 0 },
      { descricao: "Deduções", valor: v("VL_TOT_DED") },
      { descricao: "ICMS a recolher", valor: v("VL_ICMS_RECOLHER"), total: true },
      { descricao: "Saldo credor de ICMS para o mês seguinte", valor: v("VL_SLD_CREDOR_TRANSPORTAR"), total: true },
    ],
  };
}

/** Lê um texto inteiro com um leitor (testes e arquivos pequenos). */
export function lerTexto<R>(texto: string, leitor: { lerLinha: (l: string) => boolean; resultado: () => R }): R {
  for (const linha of texto.split(/\r?\n/)) if (!leitor.lerLinha(linha)) break;
  return leitor.resultado();
}

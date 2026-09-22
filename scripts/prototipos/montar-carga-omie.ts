// Lê os relatórios do Omie de uma empresa (Recebimentos, Pagamentos e o plano
// de Categorias) e monta o texto que se cola no Console do EasyPanel do 41 DRE,
// onde `carregar-omie-dre.cjs` grava tudo no `bpo.db` (que o BPO também lê).
// Não acessa banco nenhum: só lê as planilhas.
//
//   npx tsx scripts/prototipos/montar-carga-omie.ts \
//     --nome="Omie Irriga ago/26" \
//     --recebimentos="C:/.../Recebimentos.xlsx" \
//     --pagamentos="C:/.../Pagamentos.xlsx" \
//     --categorias="C:/.../categorias.xlsx"
//
// São os relatórios de movimento REALIZADO do Omie (o que caiu no extrato).
// Por isso cada linha vira lançamento já liquidado: PAGO/RECEBIDO na data do
// extrato. Como competência vai o VENCIMENTO — o protótipo não tem campo de
// competência no Receivable (usa o vencimento), e usar a emissão só no lado
// do Payable deixaria o mês com despesa de um critério e receita de outro.
// A DRE Financeira (caixa) é a que reproduz fielmente estas planilhas.
//
// O de-para Omie → linha da DRE (abaixo) é proposta nossa, para teste: quem
// valida é o BPO/DRE. Mexer aqui e remontar é o jeito de corrigir antes de
// carregar; depois de carregado, o de-para vive na tabela AccountMapping.

import ExcelJS from "exceljs";
import { join } from "node:path";
import { empacotar } from "./empacotar";

type GrupoDre =
  | "RECEITA_BRUTA"
  | "DEDUCOES"
  | "CMV"
  | "DESPESAS_COMERCIAIS"
  | "DESPESAS_ADMINISTRATIVAS"
  | "DESPESAS_PESSOAL"
  | "DESPESAS_OPERACIONAIS_OUTRAS"
  | "OUTRAS_RECEITAS_DESPESAS"
  | "DEPRECIACAO_AMORTIZACAO"
  | "RESULTADO_FINANCEIRO"
  | "IMPOSTOS_SOBRE_LUCRO"
  | "EMPRESTIMOS_AMORTIZACAO"
  | "EMPRESTIMOS_CAPTACAO"
  | "CAPEX"
  | "APORTES_DIVIDENDOS";

type Kind = "RECEITA" | "DESPESA";

// Grupo do Omie → tipo e linha da DRE padrão do grupo. `null` = não entra na
// DRE (transferência entre contas da própria empresa: sai de uma, entra na
// outra, e somar as duas pontas inflaria receita e despesa).
// "Devoluções" aparece duas vezes no plano do Omie: a primeira é de COMPRA
// (entrada de dinheiro), a segunda de VENDA (saída).
const GRUPOS_OMIE: Record<string, { kind: Kind; dre: GrupoDre | null }> = {
  "receitas diretas": { kind: "RECEITA", dre: "RECEITA_BRUTA" },
  "receitas indiretas": { kind: "RECEITA", dre: "OUTRAS_RECEITAS_DESPESAS" },
  "devolucoes#1": { kind: "RECEITA", dre: "CMV" },
  "outras entradas": { kind: "RECEITA", dre: "OUTRAS_RECEITAS_DESPESAS" },
  "despesas diretas": { kind: "DESPESA", dre: "CMV" },
  "despesas de vendas e marketing": { kind: "DESPESA", dre: "DESPESAS_COMERCIAIS" },
  "despesas com pessoal": { kind: "DESPESA", dre: "DESPESAS_PESSOAL" },
  "despesas administrativas": { kind: "DESPESA", dre: "DESPESAS_ADMINISTRATIVAS" },
  "despesas financeiras / bancos": { kind: "DESPESA", dre: "RESULTADO_FINANCEIRO" },
  "impostos e taxas": { kind: "DESPESA", dre: "DEDUCOES" },
  investimento: { kind: "DESPESA", dre: "CAPEX" },
  "outras despesas": { kind: "DESPESA", dre: "DESPESAS_OPERACIONAIS_OUTRAS" },
  "devolucoes#2": { kind: "DESPESA", dre: "DEDUCOES" },
  "despesas c/veiculos": { kind: "DESPESA", dre: "DESPESAS_ADMINISTRATIVAS" },
};

// Exceções à linha padrão do grupo, por nome normalizado da categoria.
const EXCECOES: Record<string, GrupoDre | null> = {
  // Receitas Indiretas
  "rendimentos de aplicacoes": "RESULTADO_FINANCEIRO",
  // Resgatar aplicação não é receita: é o dinheiro investido voltando. Vai
  // para a linha de investimentos, que só aparece na DRE Financeira.
  "resgate de aplicacoes financeiras": "CAPEX",
  // Devoluções (de compra)
  "devolucao de pagamento indevido": "OUTRAS_RECEITAS_DESPESAS",
  "devolucoes de compra de ativo": "CAPEX",
  "transferencia entre contas": null,
  // Outras Entradas
  "emprestimos bancarios": "EMPRESTIMOS_CAPTACAO",
  "emprestimo de terceiros": "EMPRESTIMOS_CAPTACAO",
  // Descontar duplicata é antecipar recebível com o banco: financiamento.
  "duplicata descontada - entrada": "EMPRESTIMOS_CAPTACAO",
  "aumento de capital": "APORTES_DIVIDENDOS",
  "venda de ativos": "CAPEX",
  // Despesas Diretas
  "compra de ativo imobilizado": "CAPEX",
  "devolucao de venda": "DEDUCOES",
  "devolucao de recebimento indevido": "OUTRAS_RECEITAS_DESPESAS",
  "comissoes por indicacao": "DESPESAS_COMERCIAIS",
  "juros fornecedores": "RESULTADO_FINANCEIRO",
  // Despesas Administrativas
  "pagamento indevido": "OUTRAS_RECEITAS_DESPESAS",
  "despesas comerciais": "DESPESAS_COMERCIAIS",
  // Despesas Financeiras
  "pagamento de emprestimos": "EMPRESTIMOS_AMORTIZACAO",
  "emprestimos coligada": "EMPRESTIMOS_AMORTIZACAO",
  "integracao de capital": "CAPEX",
  // Impostos e Taxas
  "impostos federais - irpj": "IMPOSTOS_SOBRE_LUCRO",
  "impostos federais - cssl": "IMPOSTOS_SOBRE_LUCRO",
  "impostos federais - irrf": "IMPOSTOS_SOBRE_LUCRO",
  "impostos parcelados": "DESPESAS_OPERACIONAIS_OUTRAS",
  "impostos retidos servicos tomados (pis/cofins/csll/irrf)": "DESPESAS_OPERACIONAIS_OUTRAS",
  // Outras Despesas
  "retirada de capital social": "APORTES_DIVIDENDOS",
  "distribuicao de lucros - socios": "APORTES_DIVIDENDOS",
  "pagamento de duplicata descontada": "EMPRESTIMOS_AMORTIZACAO",
  brindes: "DESPESAS_COMERCIAIS",
  // Nomes que aparecem no movimento mas não no plano de categorias.
  "entrada de transferencia": null,
  "saida de transferencia": null,
};

// Categoria no protótipo também carrega o agrupamento grosso do BPO (DRE_GROUPS do 41-bpo).
const GRUPO_BPO: Record<GrupoDre, string> = {
  RECEITA_BRUTA: "RECEITA_BRUTA",
  DEDUCOES: "DEDUCOES",
  CMV: "CMV",
  DESPESAS_COMERCIAIS: "DESPESAS_OPERACIONAIS",
  DESPESAS_ADMINISTRATIVAS: "DESPESAS_OPERACIONAIS",
  DESPESAS_PESSOAL: "DESPESAS_OPERACIONAIS",
  DESPESAS_OPERACIONAIS_OUTRAS: "DESPESAS_OPERACIONAIS",
  OUTRAS_RECEITAS_DESPESAS: "OUTRAS",
  DEPRECIACAO_AMORTIZACAO: "OUTRAS",
  RESULTADO_FINANCEIRO: "DESPESAS_FINANCEIRAS",
  IMPOSTOS_SOBRE_LUCRO: "OUTRAS",
  EMPRESTIMOS_AMORTIZACAO: "OUTRAS",
  EMPRESTIMOS_CAPTACAO: "OUTRAS",
  CAPEX: "OUTRAS",
  APORTES_DIVIDENDOS: "OUTRAS",
};

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const arg = (nome: string) => {
  const v = process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
  if (!v) throw new Error(`Falta --${nome}=`);
  return v;
};

type Categoria = { nome: string; kind: Kind; grupoOmie: string; grupoDre: GrupoDre | null; grupoBpo: string };

function texto(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("").trim();
  if (typeof v === "object" && "result" in v) return String(v.result ?? "").trim();
  return String(v).trim();
}

// exceljs devolve data do Excel como Date em UTC meia-noite.
function iso(v: ExcelJS.CellValue): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = texto(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  throw new Error(`Data inválida: ${texto(v)}`);
}

async function lerPlano(caminho: string): Promise<Categoria[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  const ws = wb.worksheets[0];
  const vistos = new Map<string, number>();
  let grupo: { chave: string; nome: string } | null = null;
  const categorias: Categoria[] = [];
  ws.eachRow((row) => {
    const situacao = texto(row.getCell(1).value);
    const nome = texto(row.getCell(2).value);
    if (!nome || situacao === "Situação") return;
    if (situacao === "Grupo") {
      const base = normalizar(nome);
      const n = (vistos.get(base) ?? 0) + 1;
      vistos.set(base, n);
      const chave = GRUPOS_OMIE[base] ? base : `${base}#${n}`;
      if (!GRUPOS_OMIE[chave]) throw new Error(`Grupo do Omie sem de-para: "${nome}" — acrescente em GRUPOS_OMIE.`);
      grupo = { chave, nome };
      return;
    }
    if (!grupo) return;
    const g = GRUPOS_OMIE[grupo.chave];
    const n = normalizar(nome);
    const dre = n in EXCECOES ? EXCECOES[n] : g.dre;
    categorias.push({ nome, kind: g.kind, grupoOmie: grupo.nome, grupoDre: dre, grupoBpo: dre ? GRUPO_BPO[dre] : "OUTRAS" });
  });
  return categorias;
}

type Lancamento = {
  linha: number;
  tipo: Kind;
  kind: Kind;
  categoria: string;
  contraparte: string;
  documento: string | null;
  contaCorrente: string | null;
  extrato: string;
  vencimento: string;
  valor: number;
  referencia: string | null;
};

async function lerMovimento(caminho: string, tipo: Kind, plano: Categoria[], avisos: string[]): Promise<Lancamento[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  const ws = wb.worksheets[0];

  // Cabeçalho na linha 2; a 3 é a de totais. Coluna achada pelo nome, não pela posição.
  const cab = new Map<string, number>();
  ws.getRow(2).eachCell((c, i) => cab.set(normalizar(texto(c.value)), i));
  const col = (...nomes: string[]) => {
    for (const n of nomes) if (cab.has(normalizar(n))) return cab.get(normalizar(n))!;
    throw new Error(`${caminho}: coluna não encontrada (${nomes.join(" / ")})`);
  };
  const c = {
    extrato: col("Data de Crédito ou Débito (No Extrato)"),
    doc: col("CNPJ/CPF"),
    fantasia: col(tipo === "RECEITA" ? "Cliente" : "Fornecedor"),
    razao: col("Razão Social"),
    vencimento: col("Vencimento"),
    categoria: col("Categoria"),
    conta: col("Conta Corrente"),
    nf: col("Nota Fiscal"),
    parcela: col("Parcela"),
    documento: col("Documento"),
    numero: col("Número"),
    valor: col("Recebido", "Pago ou Recebido"),
  };

  const nd = (s: string) => (s && s !== "N/D" ? s : "");
  const lancamentos: Lancamento[] = [];
  for (let i = 4; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const v = (k: keyof typeof c) => row.getCell(c[k]).value;
    if (!texto(v("extrato"))) continue;

    const valor = Math.round(Math.abs(Number(v("valor"))) * 100) / 100;
    const catOmie = texto(v("categoria"));
    if (!valor) {
      avisos.push(`${tipo} linha ${i}: valor zero (${catOmie}) — ignorada`);
      continue;
    }

    // Casa com o plano pelo nome normalizado; na dúvida entre receita e
    // despesa com o mesmo nome, fica a do tipo da planilha.
    const n = normalizar(catOmie);
    let cat = plano.find((p) => normalizar(p.nome) === n && p.kind === tipo) ?? plano.find((p) => normalizar(p.nome) === n);
    if (!cat) {
      const dre = n in EXCECOES ? EXCECOES[n] : null;
      cat = { nome: catOmie, kind: tipo, grupoOmie: "(fora do plano)", grupoDre: dre, grupoBpo: dre ? GRUPO_BPO[dre] : "OUTRAS" };
      plano.push(cat);
      if (!(n in EXCECOES)) avisos.push(`categoria fora do plano e sem de-para, não entra na DRE: "${catOmie}"`);
    }

    const referencia =
      [nd(texto(v("documento"))), nd(texto(v("nf"))) && `NF ${texto(v("nf"))}`, nd(texto(v("numero"))) && `nº ${texto(v("numero"))}`, nd(texto(v("parcela"))) && `parcela ${texto(v("parcela"))}`]
        .filter(Boolean)
        .join(" · ") || null;

    lancamentos.push({
      linha: i,
      tipo,
      kind: cat.kind,
      categoria: cat.nome,
      contraparte: nd(texto(v("razao"))) || nd(texto(v("fantasia"))) || "Não informado",
      documento: nd(texto(v("doc"))) || null,
      contaCorrente: nd(texto(v("conta"))) || null,
      extrato: iso(v("extrato")),
      vencimento: iso(v("vencimento")),
      valor,
      referencia,
    });
  }
  return lancamentos;
}

async function empresaDaPlanilha(caminho: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  const ws = wb.worksheets[0];
  const r = ws.getRow(4);
  return { razaoSocial: texto(r.getCell(2).value), cnpj: texto(r.getCell(3).value) };
}

async function main() {
  const nomeCarga = arg("nome");
  const avisos: string[] = [];
  const plano = await lerPlano(arg("categorias"));
  const empresa = await empresaDaPlanilha(arg("recebimentos"));
  const lancamentos = [
    ...(await lerMovimento(arg("recebimentos"), "RECEITA", plano, avisos)),
    ...(await lerMovimento(arg("pagamentos"), "DESPESA", plano, avisos)),
  ];

  const dados = { nomeCarga, geradoEm: new Date().toISOString(), empresa, categorias: plano, lancamentos };

  // Resumo por linha da DRE (caixa), para conferir antes de colar.
  const porLinha = new Map<string, number>();
  for (const l of lancamentos) {
    const cat = plano.find((p) => p.nome === l.categoria && p.kind === l.kind)!;
    const k = cat.grupoDre ?? "(fora da DRE)";
    porLinha.set(k, (porLinha.get(k) ?? 0) + (l.tipo === "RECEITA" ? l.valor : -l.valor));
  }

  const pacote = empacotar({
    script: join(__dirname, "carregar-omie-dre.cjs"),
    dados,
    pasta: `carga-omie-${normalizar(nomeCarga).replace(/[^a-z0-9]+/g, "-")}`,
    arquivos: {
      "carga.json": JSON.stringify(dados, null, 2),
      "de-para-categorias.csv":
        "\uFEFFgrupo_omie;categoria;tipo;linha_dre\n" +
        plano.map((p) => [p.grupoOmie, p.nome, p.kind, p.grupoDre ?? "(fora da DRE)"].join(";")).join("\n"),
    },
  });

  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  console.log(`empresa      : ${empresa.razaoSocial} (${empresa.cnpj})`);
  console.log(`categorias   : ${plano.length}`);
  console.log(`lançamentos  : ${lancamentos.filter((l) => l.tipo === "RECEITA").length} recebimentos, ${lancamentos.filter((l) => l.tipo === "DESPESA").length} pagamentos`);
  console.log(`\nresultado de caixa por linha da DRE:`);
  for (const [k, v] of [...porLinha].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(30)} ${brl(v).padStart(18)}`);
  if (avisos.length) console.log(`\navisos:\n  ${avisos.join("\n  ")}`);
  console.log(`\narquivos em  : ${pacote.pasta}`);
  console.log(`colar        : ${pacote.kb} KB, ${pacote.linhas} linhas`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Carrega no protótipo do DRE/BPO os recebimentos e pagamentos de uma empresa
// exportados do Omie, montados por `scripts/prototipos/montar-carga-omie.ts`.
//
// Roda DENTRO do container do 41 DRE (`app_41-dre`), pelo Console do
// EasyPanel. Tem de ser o DRE, e não o BPO: os dois dividem o `bpo.db`, mas
// só o Prisma Client do DRE conhece o Plano Gerencial (`ManagerialAccount`,
// `AccountMapping`) e o histórico de importação (`ImportJob`/`ImportRow`).
// Carregado uma vez, aparece nos dois apps.
//
//   node /tmp/carga.cjs            # dry-run: só conta o que faria
//   node /tmp/carga.cjs --aplicar  # grava, tudo numa transação só
//
// O que é gravado:
// - as contas do Plano Gerencial que faltarem (o bootstrap do DRE não roda
//   sozinho no deploy — sem elas a DRE sai vazia);
// - as categorias do Omie, com o de-para para a linha da DRE. Categoria é
//   GLOBAL no protótipo (não tem empresa), então elas aparecem para todas as
//   empresas. Categoria que já existe com o mesmo nome e tipo é reaproveitada,
//   e o de-para dela não é mexido;
// - contas bancárias, fornecedores e clientes da empresa que faltarem;
// - um Payable (PAGO) ou Receivable (RECEBIDO) por linha, com valor pago/
//   recebido, vencimento como competência e data do extrato como caixa;
// - um ImportJob com um ImportRow por lançamento, que é o que a tela
//   /dados/importacao do DRE mostra como histórico — e o que impede carregar
//   o mesmo arquivo duas vezes.

"use strict";

const { createRequire } = require("module");

const DADOS = /*__DADOS__*/ null;

const aplicar = process.argv.includes("--aplicar");

// Mesmos rótulos e ordem de src/lib/enums.ts do 41 DRE.
const GRUPOS = [
  ["RECEITA_BRUTA", "Receita Bruta", 1],
  ["DEDUCOES", "Deduções e Impostos sobre Vendas", -1],
  ["CMV", "CMV / CPV / CSV", -1],
  ["DESPESAS_COMERCIAIS", "Despesas Comerciais", -1],
  ["DESPESAS_ADMINISTRATIVAS", "Despesas Administrativas", -1],
  ["DESPESAS_PESSOAL", "Despesas com Pessoal", -1],
  ["DESPESAS_OPERACIONAIS_OUTRAS", "Despesas Operacionais", -1],
  ["OUTRAS_RECEITAS_DESPESAS", "Outras Receitas/Despesas Operacionais", 1],
  ["DEPRECIACAO_AMORTIZACAO", "Depreciação e Amortização", -1],
  ["RESULTADO_FINANCEIRO", "Resultado Financeiro", -1],
  ["IMPOSTOS_SOBRE_LUCRO", "IRPJ / CSLL / Tributos sobre o Lucro", -1],
  ["EMPRESTIMOS_AMORTIZACAO", "Pagamento de Empréstimos — Principal", -1],
  ["EMPRESTIMOS_CAPTACAO", "Captação de Empréstimos", 1],
  ["CAPEX", "CAPEX / Investimentos", -1],
  ["APORTES_DIVIDENDOS", "Aportes, Dividendos e Distribuições", 1],
];

function carregarDados() {
  if (DADOS) return DADOS;
  const caminho = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!caminho) throw new Error("Sem dados embutidos e sem caminho de JSON no argumento.");
  return JSON.parse(require("fs").readFileSync(caminho, "utf8"));
}

function prismaDoPrototipo() {
  const req = createRequire(process.cwd() + "/");
  const { PrismaClient } = req("@prisma/client");
  return new PrismaClient();
}

const digitos = (s) => (s || "").replace(/\D/g, "");
const normalizar = (s) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// O app grava data como meia-noite local (parseLocalDate); o mês da DRE é
// calculado com new Date(ano, mês, 1) no mesmo fuso. Recriar aqui do mesmo
// jeito mantém o lançamento no mês certo, qualquer que seja o fuso do container.
function dataLocal(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function carregar(tx, dados, r) {
  const empresa = (await tx.company.findMany({ select: { id: true, cnpj: true, corporateName: true } })).find(
    (c) => digitos(c.cnpj) === digitos(dados.empresa.cnpj)
  );
  if (!empresa) throw new Error(`Empresa ${dados.empresa.cnpj} não está no protótipo — rode antes a carga de empresas.`);
  r.empresa = empresa.corporateName;

  const jaCarregado = await tx.importJob.findFirst({ where: { companyId: empresa.id, fileName: dados.nomeCarga } });
  if (jaCarregado) throw new Error(`"${dados.nomeCarga}" já foi carregado nesta empresa em ${jaCarregado.createdAt.toISOString().slice(0, 10)}. Nada foi gravado.`);

  // 1) Plano Gerencial — uma conta por grupo; cria só os grupos que faltam.
  const contas = await tx.managerialAccount.findMany();
  const contaPorGrupo = new Map(contas.map((c) => [c.group, c]));
  const codigos = new Set(contas.map((c) => c.code));
  for (let i = 0; i < GRUPOS.length; i++) {
    const [grupo, nome, sinal] = GRUPOS[i];
    if (contaPorGrupo.has(grupo)) continue;
    let n = i + 1;
    while (codigos.has(`MG-${String(n).padStart(2, "0")}`)) n++;
    const code = `MG-${String(n).padStart(2, "0")}`;
    codigos.add(code);
    contaPorGrupo.set(grupo, await tx.managerialAccount.create({ data: { code, name: nome, group: grupo, sign: sinal, order: i + 1 } }));
    r.contasGerenciaisCriadas++;
  }

  // 2) Categorias + de-para.
  const existentes = await tx.category.findMany({ include: { accountMappings: true } });
  const categoriaPorChave = new Map(existentes.map((c) => [`${c.kind}|${normalizar(c.name)}`, c]));
  const idCategoria = new Map();
  for (const cat of dados.categorias) {
    const chave = `${cat.kind}|${normalizar(cat.nome)}`;
    let c = categoriaPorChave.get(chave);
    if (c) {
      r.categoriasReaproveitadas++;
      if (cat.grupoDre && c.accountMappings.length === 0) {
        await tx.accountMapping.create({ data: { categoryId: c.id, managerialAccountId: contaPorGrupo.get(cat.grupoDre).id } });
        r.deParaCriados++;
      }
    } else {
      c = await tx.category.create({ data: { name: cat.nome, kind: cat.kind, dreGroup: cat.grupoBpo } });
      categoriaPorChave.set(chave, c);
      r.categoriasCriadas++;
      if (cat.grupoDre) {
        await tx.accountMapping.create({ data: { categoryId: c.id, managerialAccountId: contaPorGrupo.get(cat.grupoDre).id } });
        r.deParaCriados++;
      }
    }
    idCategoria.set(chave, c.id);
  }

  // 3) Contas bancárias, fornecedores e clientes da empresa.
  const contasBanco = new Map(
    (await tx.bankAccount.findMany({ where: { companyId: empresa.id } })).map((b) => [normalizar(b.nickname), b.id])
  );
  async function contaBancaria(nome) {
    if (!nome) return null;
    const k = normalizar(nome);
    if (!contasBanco.has(k)) {
      const b = await tx.bankAccount.create({ data: { companyId: empresa.id, nickname: nome, bankName: nome } });
      contasBanco.set(k, b.id);
      r.contasBancariasCriadas++;
    }
    return contasBanco.get(k);
  }

  function indexar(lista) {
    const porDoc = new Map();
    const porNome = new Map();
    for (const x of lista) {
      const d = digitos(x.document);
      if (d && !/^0+$/.test(d)) porDoc.set(d, x.id);
      porNome.set(normalizar(x.name), x.id);
    }
    return { porDoc, porNome };
  }
  const fornecedores = indexar(await tx.vendor.findMany({ where: { companyId: empresa.id } }));
  const clientes = indexar(await tx.customer.findMany({ where: { companyId: empresa.id } }));

  async function contraparte(tipo, l) {
    const idx = tipo === "DESPESA" ? fornecedores : clientes;
    const d = digitos(l.documento);
    const docValido = d && !/^0+$/.test(d) ? d : null;
    const existente = (docValido && idx.porDoc.get(docValido)) || idx.porNome.get(normalizar(l.contraparte));
    if (existente) return existente;
    const data = { companyId: empresa.id, name: l.contraparte, document: docValido ? l.documento : null, notes: "Importado do Omie (carga de teste)." };
    const criado = tipo === "DESPESA" ? await tx.vendor.create({ data }) : await tx.customer.create({ data });
    if (docValido) idx.porDoc.set(docValido, criado.id);
    idx.porNome.set(normalizar(l.contraparte), criado.id);
    if (tipo === "DESPESA") r.fornecedoresCriados++;
    else r.clientesCriados++;
    return criado.id;
  }

  // 4) Lançamentos + histórico de importação.
  const job = await tx.importJob.create({
    data: { companyId: empresa.id, fileName: dados.nomeCarga, format: "OMIE-XLSX", status: "CONCLUIDO", totalRows: dados.lancamentos.length, errorRows: 0 },
  });

  for (const l of dados.lancamentos) {
    const categoryId = idCategoria.get(`${l.kind}|${normalizar(l.categoria)}`);
    if (!categoryId) throw new Error(`Categoria sem cadastro na carga: ${l.categoria} (${l.kind})`);
    const bankAccountId = await contaBancaria(l.contaCorrente);
    const contraparteId = await contraparte(l.tipo, l);
    let entrada;
    if (l.tipo === "DESPESA") {
      entrada = await tx.payable.create({
        data: {
          companyId: empresa.id,
          vendorId: contraparteId,
          categoryId,
          competenceDate: dataLocal(l.vencimento),
          dueDate: dataLocal(l.vencimento),
          paidAt: dataLocal(l.extrato),
          amount: l.valor,
          bankAccountId,
          documentRef: l.referencia,
          status: "PAGO",
        },
      });
      r.pagamentos++;
      r.totalPago += l.valor;
    } else {
      entrada = await tx.receivable.create({
        data: {
          companyId: empresa.id,
          customerId: contraparteId,
          categoryId,
          serviceDescription: l.referencia || "Recebimento importado do Omie",
          dueDate: dataLocal(l.vencimento),
          receivedAt: dataLocal(l.extrato),
          amount: l.valor,
          bankAccountId,
          status: "RECEBIDO",
        },
      });
      r.recebimentos++;
      r.totalRecebido += l.valor;
    }
    await tx.importRow.create({
      data: {
        importJobId: job.id,
        rowNumber: l.linha,
        tipo: l.tipo,
        contraparteRaw: l.contraparte,
        categoriaRaw: l.categoria,
        categoryId,
        valor: l.valor,
        data: dataLocal(l.extrato),
        vencimento: dataLocal(l.vencimento),
        documento: l.referencia,
        status: "IMPORTADO",
        createdEntryId: entrada.id,
      },
    });
  }
}

async function main() {
  const dados = carregarDados();
  const prisma = prismaDoPrototipo();
  const r = {
    empresa: "",
    contasGerenciaisCriadas: 0,
    categoriasCriadas: 0,
    categoriasReaproveitadas: 0,
    deParaCriados: 0,
    contasBancariasCriadas: 0,
    fornecedoresCriados: 0,
    clientesCriados: 0,
    pagamentos: 0,
    recebimentos: 0,
    totalPago: 0,
    totalRecebido: 0,
  };

  console.log(`banco        : ${process.env.DATABASE_URL}`);
  console.log(`carga        : ${dados.nomeCarga} (${dados.lancamentos.length} lançamentos, ${dados.categorias.length} categorias)`);
  console.log(aplicar ? "MODO: APLICAR\n" : "MODO: dry-run (nada é gravado; use --aplicar)\n");

  // O dry-run executa a carga de verdade dentro da transação e desfaz no fim:
  // os números que ele mostra são os que o --aplicar vai produzir.
  const DESFAZER = new Error("dry-run");
  try {
    await prisma.$transaction(
      async (tx) => {
        await carregar(tx, dados, r);
        if (!aplicar) throw DESFAZER;
      },
      { timeout: 300000, maxWait: 30000 }
    );
  } catch (err) {
    if (err !== DESFAZER) throw err;
  } finally {
    await prisma.$disconnect();
  }

  console.log(`empresa                    : ${r.empresa}`);
  console.log(`contas do plano gerencial  : ${r.contasGerenciaisCriadas} criadas`);
  console.log(`categorias                 : ${r.categoriasCriadas} criadas, ${r.categoriasReaproveitadas} já existiam`);
  console.log(`de-para categoria → DRE    : ${r.deParaCriados} criados`);
  console.log(`contas bancárias           : ${r.contasBancariasCriadas} criadas`);
  console.log(`fornecedores / clientes    : ${r.fornecedoresCriados} / ${r.clientesCriados} criados`);
  console.log(`pagamentos                 : ${r.pagamentos}  (${brl(r.totalPago)})`);
  console.log(`recebimentos               : ${r.recebimentos}  (${brl(r.totalRecebido)})`);
  console.log(aplicar ? "\nGravado." : "\nNada foi gravado (dry-run). Para gravar: cd /app && node /tmp/carga.cjs --aplicar");
}

main().catch((err) => {
  console.error("\nERRO:", err.message || err);
  process.exit(1);
});

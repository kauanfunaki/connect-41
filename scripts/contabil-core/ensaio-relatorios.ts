// Ensaio dos relatórios (Bloco D, Fase D2, 26/11/2026) num banco LOCAL: a DRE, o Balancete e o Livro Caixa.
//
// Cadastra duas empresas inventadas ("Ensaio D2"): um plano com sintéticas e analíticas (ativo, passivo, receita,
// custo e despesa), duas contas bancárias com extrato e uma inativa sem extrato, e regras do NEO. Importa um OFX
// inventado em cada conta (com lançamento antes, nas bordas e depois de março, um que fica sem regra, centavos e
// um valor grande), roda o NEO e então:
// - gera os três relatórios de março e confere cada número contra o esperado (o resultado, a identidade do
//   balancete, o saldo anterior e o acumulado do livro, a ordem das contas bancárias);
// - sem período, num período vazio e só com o fim;
// - desfaz uma classificação (sai da DRE e do Balancete; o Livro Caixa, que lê o extrato, não muda) e depois
//   desfaz a importação de uma conta bancária (sai dos três);
// - a planilha (Excel) com os mesmos números;
// - o isolamento: a outra empresa e outro escritório não veem nada desta.
// No fim, a exclusão das empresas apaga tudo. Nenhum dado real; o banco é compartilhado, então só se mexe no
// que o ensaio criou (as empresas "Ensaio D2").
//
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-relatorios.ts
import ExcelJS from "exceljs";
import { getPrisma } from "../../src/lib/prisma";
import { proximoNumero } from "../../src/lib/enderecoCurtoNumeracao";
import { agenciaSchema, contaSchema, regraSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, excluirConta, ligarEmpresa, mudarAtivaDaAgencia, salvarAgencia, salvarRegra } from "../../src/lib/contabil-core/servidor/cadastros";
import { desfazerImportacao, importarExtrato } from "../../src/lib/contabil-core/servidor/importacao";
import { cancelarClassificacao, processarNeo } from "../../src/lib/contabil-core/servidor/neo";
import { balanceteDaEmpresa, dreDaEmpresa, livroCaixaDaEmpresa, planilhaDoRelatorioDaEmpresa } from "../../src/lib/contabil-core/servidor/relatorios";
import { PLANO_DA_EMPRESA } from "../../src/lib/exclusao/empresa";
import { executarPlano } from "../../src/lib/exclusao/comum";

const prisma = getPrisma();
let falhas = 0;
function confere(nome: string, ok: boolean, detalhe?: unknown) {
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok || detalhe === undefined ? "" : ` → ${JSON.stringify(detalhe).slice(0, 2000)}`}`);
  if (!ok) falhas++;
}
function valor<T>(r: { ok: true; valor: T } | { ok: false; erro: string }): T {
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
}

/** CNPJ fictício (começa com 9) com os verificadores certos. */
function cnpj(base12: string): string {
  const dv = (d: string, pesos: number[]) => {
    const resto = [...d].reduce((s, c, i) => s + Number(c) * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  let d = base12 + dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  d += dv(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
const CNPJ = cnpj("957913240002");
const OUTRO_CNPJ = cnpj("968024350002");
const OUTRO_TENANT = "00000000-0000-4000-8000-00000000d2d2";

const ofx = (banco: string, agencia: string, conta: string, linhas: string) => `OFXHEADER:100
DATA:OFXSGML

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>${banco}<BRANCHID>${agencia}<ACCTID>${conta}</BANKACCTFROM>
<BANKTRANLIST>
${linhas}
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const lanc = (id: string, data: string, v: string, memo: string) =>
  `<STMTTRN><TRNTYPE>${v.startsWith("-") ? "DEBIT" : "CREDIT"}<DTPOSTED>${data}<TRNAMT>${v}<FITID>${id}<MEMO>${memo}</STMTTRN>`;

const OFX_ITAU = ofx("0341", "7531", "13579-2", [
  lanc("I1", "20260227", "10000.00", "SALDO INICIAL DEPOSITO"),
  lanc("I2", "20260301", "5000.00", "RECEBIMENTO SERVICOS MARCO"),
  lanc("I3", "20260301", "-77.00", "TARIFA PACOTE MENSAL"),
  lanc("I4", "20260315", "-2500.00", "ALUGUEL DA SALA"),
  lanc("I5", "20260315", "-1200.50", "CUSTO SERVICO TERCEIRO"),
  lanc("I6", "20260320", "-999.99", "PAGAMENTO SEM REGRA"),
  lanc("I7", "20260331", "0.01", "RECEBIMENTO SERVICOS CENTAVO"),
  lanc("I8", "20260401", "-300.00", "TARIFA PACOTE ABRIL"),
].join("\n"));
const OFX_BB = ofx("001", "0001", "24680", [
  lanc("B1", "20260310", "98765432.10", "RECEBIMENTO SERVICOS GRANDE"),
  lanc("B2", "20260331", "-0.99", "TARIFA PACOTE AVULSA"),
].join("\n"));
const OFX_DA_OUTRA = ofx("0341", "7531", "13579-2", lanc("O1", "20260315", "123.45", "RECEBIMENTO SERVICOS DA OUTRA"));

const MARCO = { de: "2026-03-01", ate: "2026-03-31" };

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } });
  const tenantId = tenant.id;
  const company = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Empresa Ensaio D2 LTDA", cnpj: CNPJ } as never,
    select: { id: true },
  });
  const outraCompany = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Outra Empresa Ensaio D2 LTDA", cnpj: OUTRO_CNPJ } as never,
    select: { id: true },
  });
  try {
    const empresaId = valor(await ligarEmpresa(tenantId, company.id, "simples_nacional")).id;
    const outraEmpresaId = valor(await ligarEmpresa(tenantId, outraCompany.id, "simples_nacional")).id;
    const conta = async (empresa: string, codigo: string, descricao: string, tipo: string, extra: Record<string, unknown> = {}) =>
      valor(await criarConta(tenantId, empresa, contaSchema.parse({ codigo, descricao, tipo, ...extra })));
    // O plano com hierarquia: as sintéticas não recebem lançamento e não somam as analíticas no relatório.
    const ativo = await conta(empresaId, "1.1", "ATIVO CIRCULANTE", "ativo", { tipoSa: "S" });
    const itau = await conta(empresaId, "1.1.1.07", "Banco Itaú", "ativo", { paiId: ativo.id, contaNumero: 17 });
    const bb = await conta(empresaId, "1.1.1.08", "Banco do Brasil", "ativo", { paiId: ativo.id, contaNumero: 18 });
    await conta(empresaId, "2.1.1", "Fornecedores", "passivo", { contaNumero: 211 });
    const receitas = await conta(empresaId, "3", "RECEITAS", "receita", { tipoSa: "S" });
    const servicos = await conta(empresaId, "3.1.1", "Receita de serviços", "receita", { paiId: receitas.id, contaNumero: 311 });
    const custo = await conta(empresaId, "3.2.1", "Custo dos serviços", "custo", { contaNumero: 321 });
    const despesas = await conta(empresaId, "4", "DESPESAS", "despesa", { tipoSa: "S" });
    const tarifas = await conta(empresaId, "4.1.1", "Tarifas bancárias", "despesa", { paiId: despesas.id, contaNumero: 411 });
    const aluguel = await conta(empresaId, "4.1.2", "Aluguel", "despesa", { paiId: despesas.id, contaNumero: 412 });
    const antiga = await conta(empresaId, "4.1.9", "Conta antiga sem movimento", "despesa", { paiId: despesas.id, contaNumero: 419 });
    valor(await excluirConta(tenantId, empresaId, antiga.id));

    const agItau = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "7531", numero: "13579", digito: "2", contaContabilId: itau.id })));
    const agBb = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "BB", agencia: "0001", numero: "24680", contaContabilId: bb.id })));
    const agCaixa = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "CAIXA", agencia: "0420", numero: "1001", digito: "7" })));
    valor(await mudarAtivaDaAgencia(tenantId, empresaId, agCaixa.id, false));

    const regra = async (contaId: string, historico: string, dc: string) =>
      valor(await salvarRegra(tenantId, empresaId, null, regraSchema.parse({ contaId, descricao: historico, historico, dc })));
    await regra(servicos.id, "SALDO INICIAL", "C");
    await regra(servicos.id, "RECEBIMENTO SERVICOS", "C");
    await regra(tarifas.id, "TARIFA PACOTE", "D");
    await regra(aluguel.id, "ALUGUEL", "D");
    await regra(custo.id, "CUSTO SERVICO", "D");

    const impItau = valor(await importarExtrato(tenantId, user.id, empresaId, agItau.id, "itau-d2.ofx", new TextEncoder().encode(OFX_ITAU), false));
    const impBb = valor(await importarExtrato(tenantId, user.id, empresaId, agBb.id, "bb-d2.ofx", new TextEncoder().encode(OFX_BB), false));
    confere("extratos inventados importados (8 e 2)", impItau.importadas === 8 && impBb.importadas === 2, { impItau, impBb });

    // A outra empresa, com o próprio plano, extrato e classificação.
    const outraBanco = await conta(outraEmpresaId, "1.1.1.07", "Banco da outra", "ativo", { contaNumero: 17 });
    const outraReceita = await conta(outraEmpresaId, "3.1.1", "Receita da outra", "receita", { contaNumero: 311 });
    const outraAg = valor(await salvarAgencia(tenantId, outraEmpresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "7531", numero: "13579", digito: "2", contaContabilId: outraBanco.id })));
    valor(await salvarRegra(tenantId, outraEmpresaId, null, regraSchema.parse({ contaId: outraReceita.id, descricao: "Recebimento", historico: "RECEBIMENTO SERVICOS", dc: "C" })));
    valor(await importarExtrato(tenantId, user.id, outraEmpresaId, outraAg.id, "outra-d2.ofx", new TextEncoder().encode(OFX_DA_OUTRA), false));
    valor(await processarNeo(tenantId, outraEmpresaId, { agenciaId: null, mes: null }));

    valor(await processarNeo(tenantId, empresaId, { agenciaId: null, mes: null }));
    const pendentes = await prisma.coreTransacao.findMany({ where: { empresaId, deletedAt: null, status: { not: "processada" } }, select: { historico: true } });
    confere("o NEO classifica 9 das 10 transações; só a sem regra fica", pendentes.length === 1 && pendentes[0].historico === "PAGAMENTO SEM REGRA", pendentes);

    // ─── DRE de março ─────────────────────────────────────────────────────
    const dre = valor(await dreDaEmpresa(tenantId, empresaId, MARCO));
    const linhasDre = dre.grupos.flatMap((g) => g.linhas.map((l) => [g.tipo, l.codigo, l.debitos, l.creditos, l.saldo]));
    confere(
      "DRE de março: receitas (com o centavo da borda e o valor grande), custos, despesas e o resultado",
      dre.totalReceitas === "98770432.11" && dre.totalCustos === "1200.50" && dre.totalDespesas === "2577.99" && dre.resultadoLiquido === "98766653.62",
      dre,
    );
    confere(
      "DRE: só as analíticas com movimento, no grupo do tipo e na ordem do código; a tarifa de abril fica de fora",
      JSON.stringify(linhasDre) ===
        JSON.stringify([
          ["receita", "3.1.1", "0.00", "98770432.11", "98770432.11"],
          ["custo", "3.2.1", "1200.50", "0.00", "1200.50"],
          ["despesa", "4.1.1", "77.99", "0.00", "77.99"],
          ["despesa", "4.1.2", "2500.00", "0.00", "2500.00"],
        ]) && dre.grupos.map((g) => g.label).join(",") === "Receitas,Custos,Despesas",
      linhasDre,
    );

    // ─── Balancete de março ───────────────────────────────────────────────
    const bal = valor(await balanceteDaEmpresa(tenantId, empresaId, MARCO));
    const linhasBal = bal.linhas.map((l) => [l.codigo, l.nivel, l.debitos, l.creditos, l.saldoDevedor, l.saldoCredor]);
    confere(
      "Balancete de março: débitos = créditos (partidas dobradas) e os totais de saldo",
      bal.totalDebitos === "98774210.60" && bal.totalCreditos === "98774210.60" && bal.totalSaldoDevedor === "98770432.11" && bal.totalSaldoCredor === "98770432.11",
      bal,
    );
    confere(
      "Balancete: toda conta viva (sintéticas zeradas, sem somar as filhas), na ordem do código; a conta excluída sem movimento não entra",
      JSON.stringify(linhasBal) ===
        JSON.stringify([
          ["1.1", 2, "0.00", "0.00", "0.00", "0.00"],
          ["1.1.1.07", 4, "5000.01", "3777.50", "1222.51", "0.00"],
          ["1.1.1.08", 4, "98765432.10", "0.99", "98765431.11", "0.00"],
          ["2.1.1", 3, "0.00", "0.00", "0.00", "0.00"],
          ["3", 1, "0.00", "0.00", "0.00", "0.00"],
          ["3.1.1", 3, "0.00", "98770432.11", "0.00", "98770432.11"],
          ["3.2.1", 3, "1200.50", "0.00", "1200.50", "0.00"],
          ["4", 1, "0.00", "0.00", "0.00", "0.00"],
          ["4.1.1", 3, "77.99", "0.00", "77.99", "0.00"],
          ["4.1.2", 3, "2500.00", "0.00", "2500.00", "0.00"],
        ]),
      linhasBal,
    );

    // ─── Livro Caixa de março ─────────────────────────────────────────────
    const livro = valor(await livroCaixaDaEmpresa(tenantId, empresaId, MARCO));
    const [lbb, lcaixa, litau] = livro.agencias;
    confere(
      "Livro Caixa: as três contas bancárias vivas (a inativa também), por banco",
      livro.agencias.map((a) => a.descricao).join(" | ") === "BB 0001 24680 | CAIXA 0420 1001 7 | ITAU 7531 13579 2",
      livro.agencias.map((a) => a.descricao),
    );
    confere(
      "Livro Caixa do Itaú: saldo anterior de fevereiro, os seis de março (o sem regra também; abril fora) e o acumulado",
      litau.saldoInicial === "10000.00" &&
        litau.lancamentos.length === 6 &&
        litau.lancamentos[0].data === "2026-03-01" &&
        litau.lancamentos[5].data === "2026-03-31" &&
        litau.lancamentos[5].saldoAcumulado === "10222.52" &&
        litau.saldoFinal === "10222.52" &&
        litau.totalCreditos === "5000.01" &&
        litau.totalDebitos === "4777.49",
      litau,
    );
    // No mesmo dia, a ordem é a do id (o original): o acumulado do dia 15 depende dela, o do fim do dia não.
    const dia15 = litau.lancamentos.filter((l) => l.data === "2026-03-15");
    confere("Livro Caixa: depois do dia 15 o acumulado é 11222.50, seja qual for a ordem do dia", dia15.length === 2 && dia15[1].saldoAcumulado === "11222.50", dia15);
    confere(
      "Livro Caixa do BB (o valor grande) e da conta inativa sem extrato",
      lbb.saldoInicial === "0.00" && lbb.lancamentos.length === 2 && lbb.saldoFinal === "98765431.11" && lcaixa.lancamentos.length === 0 && lcaixa.saldoFinal === "0.00",
      { lbb, lcaixa },
    );

    // ─── Outros períodos ──────────────────────────────────────────────────
    const tudo = valor(await livroCaixaDaEmpresa(tenantId, empresaId, { de: null, ate: null }));
    const itauTudo = tudo.agencias.find((a) => a.agenciaId === agItau.id)!;
    const dreTudo = valor(await dreDaEmpresa(tenantId, empresaId, { de: null, ate: null }));
    confere(
      "sem período: o livro começa do zero e vai até abril; a DRE soma fevereiro e abril",
      itauTudo.saldoInicial === "0.00" && itauTudo.lancamentos.length === 8 && itauTudo.saldoFinal === "9922.52" && dreTudo.totalReceitas === "98780432.11" && dreTudo.totalDespesas === "2877.99",
      { itauTudo: itauTudo.saldoFinal, dreTudo },
    );
    const vazioDre = valor(await dreDaEmpresa(tenantId, empresaId, { de: "2027-01-01", ate: "2027-01-31" }));
    const vazioBal = valor(await balanceteDaEmpresa(tenantId, empresaId, { de: "2027-01-01", ate: "2027-01-31" }));
    const vazioLivro = valor(await livroCaixaDaEmpresa(tenantId, empresaId, { de: "2027-01-01", ate: "2027-01-31" }));
    const itauVazio = vazioLivro.agencias.find((a) => a.agenciaId === agItau.id)!;
    confere(
      "período vazio: DRE sem grupos, Balancete com as contas zeradas, Livro só com o saldo anterior",
      vazioDre.grupos.length === 0 && vazioDre.resultadoLiquido === "0.00" && vazioBal.linhas.length === 10 && vazioBal.totalDebitos === "0.00" &&
        itauVazio.lancamentos.length === 0 && itauVazio.saldoInicial === "9922.52" && itauVazio.saldoFinal === "9922.52",
      { vazioDre, vazioBal: vazioBal.totalDebitos, itauVazio },
    );
    const ateFev = valor(await dreDaEmpresa(tenantId, empresaId, { de: null, ate: "2026-02-28" }));
    confere("só o fim do período: a DRE até fevereiro tem só o depósito inicial", ateFev.totalReceitas === "10000.00" && ateFev.totalDespesas === "0.00", ateFev);

    // ─── A planilha ───────────────────────────────────────────────────────
    const xlsx = valor(await planilhaDoRelatorioDaEmpresa("dre", tenantId, empresaId, MARCO));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(xlsx.conteudo).buffer as ArrayBuffer);
    const resultado = wb.getWorksheet("Resultado");
    confere(
      "planilha da DRE: o nome do arquivo, as abas e o resultado como número",
      xlsx.nome === `dre-${CNPJ.replace(/\D/g, "")}-2026-03-01-2026-03-31.xlsx` &&
        wb.worksheets.map((w) => w.name).join(",") === "DRE,Resultado,Filtros" &&
        resultado?.getCell("B5").value === 98766653.62 &&
        wb.getWorksheet("DRE")?.getCell("B2").value === "3.1.1",
      { nome: xlsx.nome, abas: wb.worksheets.map((w) => w.name), b5: resultado?.getCell("B5").value },
    );
    const xlsxLivro = valor(await planilhaDoRelatorioDaEmpresa("livro-caixa", tenantId, empresaId, MARCO));
    const wbl = new ExcelJS.Workbook();
    await wbl.xlsx.load(new Uint8Array(xlsxLivro.conteudo).buffer as ArrayBuffer);
    confere("planilha do Livro Caixa: os 8 lançamentos de março e os saldos das 3 contas", wbl.getWorksheet("Livro Caixa")!.rowCount === 9 && wbl.getWorksheet("Saldos")!.rowCount === 4, {
      linhas: wbl.getWorksheet("Livro Caixa")?.rowCount,
    });

    // ─── Desfazer a classificação ─────────────────────────────────────────
    const tAluguel = await prisma.coreTransacao.findFirstOrThrow({ where: { empresaId, historico: "ALUGUEL DA SALA" }, select: { id: true } });
    valor(await cancelarClassificacao(tenantId, user.id, empresaId, tAluguel.id, "Ensaio D2: classificação desfeita"));
    const dre2 = valor(await dreDaEmpresa(tenantId, empresaId, MARCO));
    const bal2 = valor(await balanceteDaEmpresa(tenantId, empresaId, MARCO));
    const livro2 = valor(await livroCaixaDaEmpresa(tenantId, empresaId, MARCO));
    const aluguel2 = bal2.linhas.find((l) => l.codigo === "4.1.2");
    const itau2 = bal2.linhas.find((l) => l.codigo === "1.1.1.07");
    confere(
      "classificação desfeita sai da DRE (despesas − 2500) e do Balancete (a conta fica, zerada; o banco perde o crédito)",
      dre2.totalDespesas === "77.99" &&
        dre2.resultadoLiquido === "98769153.62" &&
        !dre2.grupos.some((g) => g.linhas.some((l) => l.codigo === "4.1.2")) &&
        aluguel2?.debitos === "0.00" &&
        itau2?.creditos === "1277.50" &&
        bal2.totalDebitos === bal2.totalCreditos &&
        bal2.totalDebitos === "98771710.60",
      { dre2, aluguel2, itau2, total: bal2.totalDebitos },
    );
    confere("o Livro Caixa lê o extrato: a classificação desfeita não muda nada", JSON.stringify(livro2) === JSON.stringify(livro), livro2.agencias.map((a) => a.saldoFinal));

    // ─── Desfazer a importação do BB ──────────────────────────────────────
    valor(await desfazerImportacao(tenantId, user.id, empresaId, impBb.importacaoId, "Ensaio D2: importação desfeita"));
    const dre3 = valor(await dreDaEmpresa(tenantId, empresaId, MARCO));
    const livro3 = valor(await livroCaixaDaEmpresa(tenantId, empresaId, MARCO));
    const bal3 = valor(await balanceteDaEmpresa(tenantId, empresaId, MARCO));
    const contaBb3 = bal3.linhas.find((l) => l.codigo === "1.1.1.08");
    const bb3 = livro3.agencias.find((a) => a.agenciaId === agBb.id)!;
    confere(
      "importação desfeita sai dos três: a receita grande e a tarifa somem da DRE, do Balancete e do Livro Caixa",
      dre3.totalReceitas === "5000.01" && dre3.totalDespesas === "77.00" && contaBb3?.debitos === "0.00" && contaBb3?.creditos === "0.00" && bal3.totalDebitos === bal3.totalCreditos && bb3.lancamentos.length === 0 && bb3.saldoFinal === "0.00",
      { dre3, bb3, contaBb3 },
    );

    // ─── Isolamento ───────────────────────────────────────────────────────
    const dreOutra = valor(await dreDaEmpresa(tenantId, outraEmpresaId, MARCO));
    const livroOutra = valor(await livroCaixaDaEmpresa(tenantId, outraEmpresaId, MARCO));
    confere(
      "a outra empresa vê só o que é dela",
      dreOutra.totalReceitas === "123.45" && dreOutra.grupos.flatMap((g) => g.linhas).length === 1 && livroOutra.agencias.length === 1 && livroOutra.agencias[0].saldoFinal === "123.45",
      { dreOutra, livroOutra },
    );
    const deOutroEscritorio = await Promise.all([
      dreDaEmpresa(OUTRO_TENANT, empresaId, MARCO),
      balanceteDaEmpresa(OUTRO_TENANT, empresaId, MARCO),
      livroCaixaDaEmpresa(OUTRO_TENANT, empresaId, MARCO),
      planilhaDoRelatorioDaEmpresa("balancete", OUTRO_TENANT, empresaId, MARCO),
    ]);
    confere("outro escritório não abre os relatórios nem a planilha desta empresa", deOutroEscritorio.every((r) => !r.ok), deOutroEscritorio);
  } finally {
    await prisma.$transaction(
      async (tx) => {
        await executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: company.id });
        await executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: outraCompany.id });
      },
      { timeout: 60_000 },
    );
    const sobra = await prisma.coreEmpresa.count({ where: { companyId: { in: [company.id, outraCompany.id] } } });
    confere("a exclusão das empresas do ensaio apaga tudo", sobra === 0, { sobra });
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());

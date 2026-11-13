// Ensaio da conferência do financeiro (Bloco B, Fase B4, 12/11/2026) num banco LOCAL.
//
// Cadastra uma empresa inventada com a conta Itaú ligada à conta contábil, importa um OFX inventado,
// gera planilhas inventadas (financeiro, SISPAG, Razão e extrato detalhado) e percorre a conferência:
// criar, cada documento (e o reenvio recusado), o original baixado igual ao enviado e confinado à
// empresa, os vínculos e cada recusa, as sugestões e a confirmação em lote, a versão otimista,
// desfazer, renomear, o extrato desfeito (só as conferências com o Extrato param), o isolamento por
// tenant e por empresa e excluir. No fim apaga tudo pela exclusão da empresa e confere que as tabelas
// novas e os originais em disco saíram junto. Nenhum dado real.
//
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-financeiro.ts
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { getPrisma } from "../../src/lib/prisma";
import { proximoNumero } from "../../src/lib/enderecoCurtoNumeracao";
import { agenciaSchema, contaSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, ligarEmpresa, salvarAgencia } from "../../src/lib/contabil-core/servidor/cadastros";
import { desfazerImportacao, importarExtrato } from "../../src/lib/contabil-core/servidor/importacao";
import {
  adicionarDocumento,
  criarAnalise,
  desfazerVinculoFinanceiro,
  excluirAnalise,
  listarAnalises,
  obterAnalise,
  originalDoDocumento,
  renomearAnalise,
  sugestoesDaAnalise,
  vincular,
  vincularSugestoes,
} from "../../src/lib/contabil-core/servidor/financeiro";
import { AVISO_EXTRATO_ALTERADO } from "../../src/lib/contabil-core/conciliacao/financeiro";
import type { AnaliseFinanceiro, TipoDocumentoFinanceiro, TipoFonteFinanceiro } from "../../src/lib/contabil-core/conciliacao/financeiroTipos";
import { PLANO_DA_EMPRESA, arquivosDaEmpresa } from "../../src/lib/exclusao/empresa";
import { apagarArquivos } from "../../src/lib/exclusao/arquivos";
import { executarPlano } from "../../src/lib/exclusao/comum";

const prisma = getPrisma();
let falhas = 0;
function confere(nome: string, ok: boolean, detalhe?: unknown) {
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok || detalhe === undefined ? "" : ` → ${JSON.stringify(detalhe).slice(0, 1500)}`}`);
  if (!ok) falhas++;
}
function valor<T>(r: { ok: true; valor: T } | { ok: false; erro: string }): T {
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
}

const OFX = `OFXHEADER:100
DATA:OFXSGML

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0341<BRANCHID>7285<ACCTID>12287-0</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260105<TRNAMT>-15.90<FITID>F1<MEMO>TARIFA PACOTE SERVICOS</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260106<TRNAMT>-1200.00<FITID>F2<MEMO>SISPAG FORNECEDORES</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260107<TRNAMT>350,00<FITID>F3<MEMO>PIX RECEBIDO CLIENTE NOVO</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1000.00<DTASOF>20260131</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const CNPJ = "12.345.678/0004-38";
const dia = (d: number) => new Date(Date.UTC(2026, 0, d));

async function planilha(linhas: unknown[][], nome = "Planilha1"): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nome);
  for (const l of linhas) ws.addRow(l);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** O layout do relatório do financeiro do original (`_financeiro_xlsx`), com fornecedores inventados. */
const financeiroXlsx = (movimentos: [number, number, string][]) =>
  planilha([
    [null, null, movimentos.reduce((s, m) => s + m[1], 0)],
    ["Nota Fiscal", "Pagamento", "Valor Pago", "Categoria", "Fornecedor (Razão Social)", "Fornecedor (CNPJ/CPF)"],
    ...movimentos.map(([d, v, nome]) => [null, dia(d), v, "Fornecedores", nome, "98765432000110"]),
  ], "financas");

/** A consulta de pagamentos do SISPAG (`_sispag_xlsx`). */
const sispagXlsx = (pagamentos: [string, number][]) =>
  planilha([
    ["Agência/conta", "7285 / 12287-0", "Nome da empresa:", "EMPRESA ENSAIO FINANCEIRO LTDA"],
    ["CNPJ:", CNPJ],
    ["favorecido / beneficiário", "CPF/CNPJ", "tipo de pagamento", "referência da empresa", "data do pagamento", "valor (R$)", "status"],
    ...pagamentos.map(([nome, v]) => [nome, "***", "Conta Corrente", "-", "06/01/2026", v, "Efetuado"]),
  ]);

/** O Razão da conta banco (`_razao_xlsx`): (dia, lote, histórico, contrapartida, débito, crédito). */
function razaoXlsx(lancamentos: [number, number, string, number, number | null, number | null][]) {
  const linha = (cols: Record<number, unknown>) => Array.from({ length: 15 }, (_, i) => cols[i] ?? null);
  const linhas = [
    linha({ 0: "Empresa:", 2: "EMPRESA ENSAIO FINANCEIRO LTDA", 12: "Folha:", 14: 1 }),
    linha({ 0: "C.N.P.J.:", 2: CNPJ }),
    linha({ 0: "Período:", 2: "01/01/2026 - 31/01/2026" }),
    linha({ 0: "RAZÃO" }),
    linha({ 0: "Data", 1: "Lote", 2: "Histórico", 8: "Cta.C.Part.", 9: "Débito", 10: "Crédito", 13: "Saldo-Exercício" }),
    linha({ 0: "Conta:", 1: 7, 2: "1.1.1.02", 5: "BANCO ITAU C/C" }),
    linha({ 2: "SALDO ANTERIOR", 13: 0 }),
  ];
  let saldo = 0;
  let deb = 0;
  let cred = 0;
  for (const [d, lote, hist, contra, db, cr] of lancamentos) {
    saldo += (db ?? 0) - (cr ?? 0);
    deb += db ?? 0;
    cred += cr ?? 0;
    linhas.push(linha({ 0: dia(d), 1: lote, 2: hist, 8: contra, 9: db, 10: cr, 13: Math.round(saldo * 100) / 100 }));
  }
  linhas.push(linha({ 0: "Total da conta:", 9: Math.round(deb * 100) / 100, 10: Math.round(cred * 100) / 100 }));
  return planilha(linhas);
}

/** O extrato detalhado do Itaú (`extrato_xlsx`), com o saldo do dia conferindo. */
const detalhadoXlsx = (conta = "0012287-0") =>
  planilha([
    [],
    ["Atualização:", "12/11/2026 10:00:00"],
    ["Nome:", "EMPRESA ENSAIO FINANCEIRO"],
    ["Agência:", "7285"],
    ["Conta:", conta],
    [],
    ["Lançamentos"],
    ["Periodo:", "01/01/2026 até 31/01/2026"],
    [],
    ["Data", "Lançamento", "Razão Social", "CPF/CNPJ", "Valor (R$)", "Saldo (R$)"],
    ["31/12/2025", "SALDO ANTERIOR", "", "", null, 5000],
    ["06/01/2026", "PAGAMENTOS A FORNECEDORES", "FORNECEDOR ALFA LTDA", "11.111.111/0001-11", -1000, null],
    ["06/01/2026", "PAGAMENTOS A FORNECEDORES", "FORNECEDOR BETA LTDA", "22.222.222/0001-22", -200, null],
    ["06/01/2026", "SALDO TOTAL DISPONÍVEL DIA", "", "", null, 3800],
  ], "Lançamentos");

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const linhasDe = (a: AnaliseFinanceiro, tipo: TipoFonteFinanceiro, ...valores: string[]) =>
  a.linhas.filter((l) => l.tipoFonte === tipo && (valores.length === 0 || valores.includes(l.valor))).map((l) => l.id);

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true, name: true } });
  const tenantId = tenant.id;
  const company = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Empresa Ensaio Financeiro LTDA", cnpj: CNPJ } as never,
    select: { id: true },
  });
  const outraCompany = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Outra Empresa Ensaio Financeiro LTDA", cnpj: "98.765.432/0005-80" } as never,
    select: { id: true },
  });

  const empresasDoCore: string[] = [];
  const chaves: string[] = [];
  try {
    const empresaId = valor(await ligarEmpresa(tenantId, company.id, "simples_nacional")).id;
    const outraEmpresaId = valor(await ligarEmpresa(tenantId, outraCompany.id, "simples_nacional")).id;
    empresasDoCore.push(empresaId, outraEmpresaId);
    const banco = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "1.1.1.02", descricao: "Banco Itaú", tipo: "ativo", contaNumero: 7 })));
    const agencia = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "7285", numero: "12287", digito: "0", contaContabilId: banco.id })));
    const imp = valor(await importarExtrato(tenantId, user.id, empresaId, agencia.id, "jan.ofx", new TextEncoder().encode(OFX), false));
    confere("extrato inventado importado (3 de 3)", imp.importadas === 3, imp);

    // Criar
    const criada = valor(await criarAnalise(tenantId, user.id, empresaId, { agenciaId: agencia.id, periodoInicio: "2026-01-01", periodoFim: "2026-01-31", titulo: " Janeiro " }));
    let a = criada.analise!;
    confere("análise criada na versão 1, com o extrato como primeira fonte", a.versao === 1 && a.extratoValido && a.titulo === "Janeiro" && a.fontes.length === 1 && a.fontes[0].tipo === "EXTRATO" && !a.fontes[0].temOriginal, a.fontes);
    confere("as linhas do extrato têm o id da transação e o sinal", a.linhas.map((l) => `${l.data} ${l.valor} ${l.sentido}`).join() === "2026-01-05 -15.90 SAIDA,2026-01-06 -1200.00 SAIDA,2026-01-07 350.00 ENTRADA", a.linhas);
    confere("auditoria da criação", criada.auditoria?.acao === "contabil.core.financeiro.analise.criada" && criada.auditoria.dados.agencia_id === agencia.id, criada.auditoria);
    const noBanco = await prisma.coreFinanceiroAnalise.findUniqueOrThrow({ where: { id: a.id }, select: { snapshot: true, contaBancaria: true } });
    const snap = noBanco.snapshot as Record<string, unknown>;
    confere("snapshot no banco em snake_case, como o original", Array.isArray(snap.linhas) && !("titulos_abertos" in snap) && (snap.fontes as { tem_original: boolean }[])[0].tem_original === false, Object.keys(snap));
    confere("conta bancária com a descrição do original", noBanco.contaBancaria === "ITAU 7285 12287 0", noBanco.contaBancaria);
    const semConta = await criarAnalise(tenantId, user.id, empresaId, { agenciaId: randomUUID(), periodoInicio: "2026-01-01", periodoFim: "2026-01-31", titulo: "x" });
    confere("conta bancária de fora é recusada", !semConta.ok && semConta.codigo === "NAO_ENCONTRADA", semConta);
    const periodoInvertido = await criarAnalise(tenantId, user.id, empresaId, { agenciaId: agencia.id, periodoInicio: "2026-01-31", periodoFim: "2026-01-01", titulo: "x" });
    confere("período invertido é recusado", !periodoInvertido.ok && periodoInvertido.erro === "A data final deve ser igual ou posterior à inicial.", periodoInvertido);

    // Documentos
    const doc = (tipo: TipoDocumentoFinanceiro, conteudo: Uint8Array, nomeArquivo: string, confirmarEmpresa = false, versao = a.versao) =>
      adicionarDocumento(tenantId, user.id, empresaId, a.id, { tipo, conteudo, nomeArquivo, mediaType: "application/octet-stream", versao, confirmarEmpresa });
    const financeiro = await financeiroXlsx([[6, 1000, "FORNECEDOR ALFA"], [6, 200, "FORNECEDOR BETA"], [5, 15.9, "BANCO"]]);
    const semConfirmar = await doc("FINANCEIRO", financeiro, "Pagamentos.xlsx");
    confere("financeiro sem CNPJ do emissor exige a confirmação", !semConfirmar.ok && semConfirmar.codigo === "CONFIRMAR_EMPRESA" && semConfirmar.erro.includes("Empresa Ensaio Financeiro"), semConfirmar);
    const comFinanceiro = await doc("FINANCEIRO", financeiro, "C:\\pasta\\Pagamentos.xlsx", true);
    confere("financeiro aceito com a confirmação", comFinanceiro.ok, comFinanceiro);
    if (!comFinanceiro.ok) throw new Error("sem o financeiro, o resto do ensaio não anda");
    a = comFinanceiro.valor.analise!;
    const fonteFin = a.fontes.find((f) => f.tipo === "FINANCEIRO")!;
    confere("versão 2, três linhas do financeiro, nome sem a pasta", a.versao === 2 && linhasDe(a, "FINANCEIRO").length === 3 && fonteFin.nomeArquivo === "Pagamentos.xlsx", { versao: a.versao, fonte: fonteFin });
    confere("aviso de CNPJ ausente na fonte", fonteFin.avisos.includes("CNPJ do emissor ausente; empresa confirmada explicitamente pelo usuário."), fonteFin.avisos);
    confere("auditoria do documento", comFinanceiro.valor.auditoria?.acao === "contabil.core.financeiro.documento.adicionado" && comFinanceiro.valor.auditoria.dados.hash === sha(financeiro) && comFinanceiro.valor.auditoria.dados.linhas === 3, comFinanceiro.valor.auditoria);
    const reenvio = await doc("FINANCEIRO", financeiro, "Copia.xlsx", true);
    confere("o mesmo arquivo de novo é recusado", !reenvio.ok && reenvio.codigo === "CONFLITO" && reenvio.erro === "Este arquivo já foi adicionado à análise.", reenvio);
    const desatualizado = await doc("FINANCEIRO", await financeiroXlsx([[7, 350, "CLIENTE"]]), "Outro.xlsx", true, 1);
    confere("documento com a versão antiga é recusado", !desatualizado.ok && desatualizado.codigo === "VERSAO_DESATUALIZADA", desatualizado);
    const invalido = await doc("FINANCEIRO", new TextEncoder().encode("não é planilha"), "x.xlsx", true);
    confere("arquivo ilegível é recusado sem avançar", !invalido.ok && (await prisma.coreFinanceiroAnalise.findUniqueOrThrow({ where: { id: a.id } })).versao === 2, invalido);

    // O original em disco
    const doc1 = await prisma.coreFinanceiroDocumento.findUniqueOrThrow({ where: { id: fonteFin.id } });
    chaves.push(doc1.storageKey);
    confere("documento com hash, tipo de mídia, tamanho e chave no disco", doc1.hashArquivo === sha(financeiro) && doc1.tamanho === financeiro.length && doc1.mediaType.includes("spreadsheetml") && doc1.storageKey === `${tenantId}/${fonteFin.id}.xlsx`, doc1);
    const baixado = valor(await originalDoDocumento(tenantId, empresaId, a.id, fonteFin.id));
    confere("o original baixado é igual ao enviado (sha256)", sha(baixado.bytes) === sha(financeiro) && baixado.nome === "Pagamentos.xlsx", { nome: baixado.nome });
    const deOutraEmpresa = await originalDoDocumento(tenantId, outraEmpresaId, a.id, fonteFin.id);
    confere("outra empresa não baixa o original", !deOutraEmpresa.ok && deOutraEmpresa.codigo === "NAO_ENCONTRADA", deOutraEmpresa);
    const deOutroTenant = await originalDoDocumento(randomUUID(), empresaId, a.id, fonteFin.id);
    confere("outro tenant não baixa o original", !deOutroTenant.ok && deOutroTenant.codigo === "NAO_ENCONTRADA", deOutroTenant);
    const outraAnalise = valor(await criarAnalise(tenantId, user.id, empresaId, { agenciaId: agencia.id, periodoInicio: "2026-01-01", periodoFim: "2026-01-15", titulo: "Outra" })).analise!;
    const porOutraAnalise = await originalDoDocumento(tenantId, empresaId, outraAnalise.id, fonteFin.id);
    confere("outra análise da mesma empresa não baixa o original", !porOutraAnalise.ok && porOutraAnalise.erro === "Arquivo original não encontrado nesta análise.", porOutraAnalise);
    const fonteFalsa = await originalDoDocumento(tenantId, empresaId, a.id, a.fontes[0].id);
    confere("a fonte do extrato não tem original", !fonteFalsa.ok && fonteFalsa.codigo === "NAO_ENCONTRADA", fonteFalsa);

    // SISPAG, Razão e extrato detalhado
    const comSispag = await doc("SISPAG", await sispagXlsx([["FORNECEDOR ALFA LTDA", 1000], ["FORNECEDOR BETA LTDA", 200]]), "sispag.xlsx");
    confere("SISPAG aceito (Itaú, empresa e conta conferidas)", comSispag.ok && linhasDe(comSispag.valor.analise!, "SISPAG").length === 2, comSispag.ok ? comSispag.valor.analise!.fontes.at(-1) : comSispag);
    if (comSispag.ok) a = comSispag.valor.analise!;
    const sispagOutraConta = await doc("SISPAG", await planilha([
      ["Agência/conta", "9999 / 11111-1", "Nome da empresa:", "X"], ["CNPJ:", CNPJ],
      ["favorecido / beneficiário", "CPF/CNPJ", "tipo de pagamento", "referência da empresa", "data do pagamento", "valor (R$)", "status"],
      ["X", "***", "Conta Corrente", "-", "06/01/2026", 5, "Efetuado"],
    ]), "sispag2.xlsx");
    confere("SISPAG de outra conta é recusado", !sispagOutraConta.ok && sispagOutraConta.erro.startsWith("A consulta do SISPAG é da conta 9999 / 11111-1"), sispagOutraConta);
    const comRazao = await doc("RAZAO", await razaoXlsx([
      [5, 1, "TARIFA BANCARIA", 506, null, 15.9], [6, 2, "PAGTO FORNECEDOR ALFA LTDA", 525, null, 1000],
      [6, 3, "PAGTO FORNECEDOR BETA LTDA", 525, null, 200], [7, 4, "RECEBIMENTO CLIENTE", 504, 350, null],
    ]), "razao.xlsx");
    confere("Razão aceito (conta contábil vinculada conferida)", comRazao.ok && linhasDe(comRazao.valor.analise!, "RAZAO").length === 4, comRazao.ok ? comRazao.valor.analise!.fontes.at(-1) : comRazao);
    if (comRazao.ok) a = comRazao.valor.analise!;
    const comDetalhado = await doc("EXTRATO_DETALHADO", await detalhadoXlsx(), "detalhado.xlsx", true);
    confere("extrato detalhado aceito (agência e conta conferidas)", comDetalhado.ok && linhasDe(comDetalhado.valor.analise!, "EXTRATO_DETALHADO").length === 2, comDetalhado.ok ? comDetalhado.valor.analise!.fontes.at(-1) : comDetalhado);
    if (comDetalhado.ok) a = comDetalhado.valor.analise!;
    const detalhadoOutraConta = await doc("EXTRATO_DETALHADO", await detalhadoXlsx("0099999-9"), "detalhado2.xlsx", true);
    confere("extrato detalhado de outra conta é recusado", !detalhadoOutraConta.ok && detalhadoOutraConta.erro.startsWith("O extrato detalhado é da agência 7285 conta 0099999-9"), detalhadoOutraConta);
    for (const f of a.fontes.filter((x) => x.temOriginal)) {
      const k = (await prisma.coreFinanceiroDocumento.findUniqueOrThrow({ where: { id: f.id } })).storageKey;
      if (!chaves.includes(k)) chaves.push(k);
    }
    const raiz = path.join(process.cwd(), "storage", "contabil-core", "financeiro");
    confere("os originais estão no disco", chaves.every((k) => existsSync(path.join(raiz, k))), chaves);

    // Vínculos
    const v = (d: { financeiroIds: string[]; comparacaoIds: string[]; observacao?: string; sugestaoId?: string | null; versao?: number }) =>
      vincular(tenantId, user.id, empresaId, a.id, { versao: d.versao ?? a.versao, sugestaoId: d.sugestaoId ?? null, financeiroIds: d.financeiroIds, comparacaoIds: d.comparacaoIds, observacao: d.observacao ?? "" });
    const finAlfaBeta = linhasDe(a, "FINANCEIRO", "-1000.00", "-200.00");
    const aceito = await v({ financeiroIds: finAlfaBeta, comparacaoIds: linhasDe(a, "EXTRATO", "-1200.00") });
    confere("vínculo financeiro × extrato aceito (soma igual, mesma data)", aceito.ok && aceito.valor.analise!.vinculos.length === 1, aceito);
    if (aceito.ok) {
      a = aceito.valor.analise!;
      const v1 = a.vinculos[0];
      confere("totais, diferença e responsável", v1.tipoComparacao === "EXTRATO" && v1.totalFinanceiro === "1200.00" && v1.totalComparacao === "1200.00" && v1.diferenca === "0.00" && v1.responsavel === user.name, v1);
      confere("auditoria do vínculo", aceito.valor.auditoria?.acao === "contabil.core.financeiro.vinculo.confirmado" && aceito.valor.auditoria.dados.vinculo_id === v1.id && aceito.valor.auditoria.dados.tipo === "EXTRATO" && aceito.valor.auditoria.dados.criterio === null, aceito.valor.auditoria);
    }
    const reuso = await v({ financeiroIds: linhasDe(a, "FINANCEIRO", "-1000.00"), comparacaoIds: linhasDe(a, "EXTRATO", "-1200.00"), observacao: "x" });
    confere("reuso no mesmo tipo de comparação é recusado", !reuso.ok && reuso.codigo === "CONFLITO" && reuso.erro.startsWith("Um movimento já foi vinculado nesta comparação."), reuso);
    const outroTipo = await v({ financeiroIds: linhasDe(a, "FINANCEIRO", "-1000.00"), comparacaoIds: linhasDe(a, "SISPAG", "-1000.00") });
    confere("a mesma linha do financeiro com o SISPAG é aceita", outroTipo.ok && outroTipo.valor.analise!.vinculos.at(-1)!.tipoComparacao === "SISPAG", outroTipo);
    if (outroTipo.ok) a = outroTipo.valor.analise!;
    const misturado = await v({ financeiroIds: linhasDe(a, "FINANCEIRO", "-15.90"), comparacaoIds: linhasDe(a, "EXTRATO", "350.00"), observacao: "x" });
    confere("entrada com saída é recusada", !misturado.ok && misturado.erro === "Compare somente entradas com entradas ou saídas com saídas, sem misturar naturezas.", misturado);
    const semObs = await v({ financeiroIds: linhasDe(a, "FINANCEIRO", "-200.00"), comparacaoIds: linhasDe(a, "RAZAO", "-1000.00") });
    confere("diferença sem observação é recusada", !semObs.ok && semObs.erro === "Justifique a diferença antes de registrar a conferência.", semObs);
    const ladoErrado = await v({ financeiroIds: linhasDe(a, "SISPAG", "-200.00"), comparacaoIds: linhasDe(a, "EXTRATO", "-15.90") });
    confere("SISPAG no painel base é recusado", !ladoErrado.ok && ladoErrado.erro.startsWith("O painel base aceita linhas de um único documento"), ladoErrado);
    const velha = await v({ financeiroIds: linhasDe(a, "FINANCEIRO", "-15.90"), comparacaoIds: linhasDe(a, "EXTRATO", "-15.90"), versao: a.versao - 1 });
    confere("vínculo com a versão antiga é recusado", !velha.ok && velha.codigo === "VERSAO_DESATUALIZADA", velha);
    const idInvalido = await v({ financeiroIds: ["não é id"], comparacaoIds: linhasDe(a, "EXTRATO", "-15.90") });
    confere("id inválido é recusado na validação", !idInvalido.ok && idInvalido.erro === "Selecione um movimento válido.", idInvalido);

    // Sugestões e confirmação em lote
    const sugestoes = valor(await sugestoesDaAnalise(tenantId, empresaId, a.id, "RAZAO_DETALHADO"));
    confere("sugestões Razão × extrato detalhado na versão atual", sugestoes.versao === a.versao && sugestoes.tipoComparacao === "RAZAO_DETALHADO" && sugestoes.itens.length >= 1, sugestoes);
    const repetidas = await vincularSugestoes(tenantId, user.id, empresaId, a.id, {
      versao: a.versao, observacao: "",
      sugestoes: [sugestoes.itens[0], sugestoes.itens[0]].filter(Boolean).map((s) => ({ sugestaoId: s.id, financeiroIds: s.financeiroIds, comparacaoIds: s.comparacaoIds })),
    });
    confere("a mesma sugestão duas vezes no lote é recusada", !repetidas.ok && repetidas.erro === "A mesma sugestão foi enviada mais de uma vez.", repetidas);
    const emLote = await vincularSugestoes(tenantId, user.id, empresaId, a.id, {
      versao: a.versao, observacao: "Conferido pelo lote.",
      sugestoes: sugestoes.itens.map((s) => ({ sugestaoId: s.id, financeiroIds: s.financeiroIds, comparacaoIds: s.comparacaoIds })),
    });
    confere("o lote vira uma conferência por sugestão, com uma só mudança de versão", emLote.ok && emLote.valor.analise!.versao === a.versao + 1 && emLote.valor.analise!.vinculos.filter((x) => x.tipoComparacao === "RAZAO_DETALHADO").length === sugestoes.itens.length, emLote);
    if (emLote.ok) {
      confere("auditoria do lote com a lista", emLote.valor.auditoria?.acao === "contabil.core.financeiro.vinculos.confirmados" && (emLote.valor.auditoria.dados.vinculos as unknown[]).length === sugestoes.itens.length, emLote.valor.auditoria);
      a = emLote.valor.analise!;
    }
    const sugestaoVelha = await vincularSugestoes(tenantId, user.id, empresaId, a.id, {
      versao: a.versao, observacao: "", sugestoes: sugestoes.itens.slice(0, 1).map((s) => ({ sugestaoId: s.id, financeiroIds: s.financeiroIds, comparacaoIds: s.comparacaoIds })),
    });
    confere("sugestão de uma versão anterior é recusada", !sugestaoVelha.ok && (sugestaoVelha.erro === "A sugestão mudou. Atualize a análise." || sugestaoVelha.erro.startsWith("Um movimento já foi vinculado")), sugestaoVelha);

    // Desfazer
    const alvo = a.vinculos.find((x) => x.tipoComparacao === "SISPAG")!;
    const desfeito = await desfazerVinculoFinanceiro(tenantId, user.id, empresaId, a.id, alvo.id, { versao: a.versao, motivo: "  Pagamento trocado.  " });
    confere("desfeito, com quem, quando e por quê", desfeito.ok && (() => {
      const x = desfeito.valor.analise!.vinculos.find((y) => y.id === alvo.id)!;
      return x.estado === "DESFEITO" && x.desfeitoPor === user.name && !!x.desfeitoEm && x.motivoDesfazer === "Pagamento trocado.";
    })(), desfeito);
    if (desfeito.ok) {
      confere("auditoria do desfazer", desfeito.valor.auditoria?.acao === "contabil.core.financeiro.vinculo.desfeito" && desfeito.valor.auditoria.dados.motivo === "Pagamento trocado.", desfeito.valor.auditoria);
      a = desfeito.valor.analise!;
    }
    const deNovo = await desfazerVinculoFinanceiro(tenantId, user.id, empresaId, a.id, alvo.id, { versao: a.versao, motivo: "x" });
    confere("desfazer de novo é recusado", !deNovo.ok && deNovo.erro === "Esta conferência já foi desfeita.", deNovo);
    const semMotivo = await desfazerVinculoFinanceiro(tenantId, user.id, empresaId, a.id, alvo.id, { versao: a.versao, motivo: "   " });
    confere("desfazer sem motivo é recusado", !semMotivo.ok && semMotivo.erro === "Informe o motivo do desfazimento.", semMotivo);
    const liberado = await v({ financeiroIds: linhasDe(a, "FINANCEIRO", "-1000.00"), comparacaoIds: linhasDe(a, "SISPAG", "-1000.00") });
    confere("depois de desfeito, a linha volta a valer no SISPAG", liberado.ok, liberado);
    if (liberado.ok) a = liberado.valor.analise!;

    // Renomear
    const renomeada = await renomearAnalise(tenantId, user.id, empresaId, a.id, { versao: a.versao, titulo: " Janeiro conferido " });
    confere("renomeada", renomeada.ok && renomeada.valor.analise!.titulo === "Janeiro conferido" && renomeada.valor.auditoria?.dados.anterior === "Janeiro", renomeada);
    if (renomeada.ok) a = renomeada.valor.analise!;
    const renomeVelho = await renomearAnalise(tenantId, user.id, empresaId, a.id, { versao: a.versao - 1, titulo: "Outro" });
    confere("renomear com a versão antiga é recusado", !renomeVelho.ok && renomeVelho.codigo === "VERSAO_DESATUALIZADA", renomeVelho);
    const camposAMais = await renomearAnalise(tenantId, user.id, empresaId, a.id, { versao: a.versao, titulo: "x", agenciaId: "y" } as never);
    confere("renomear não troca a conta", !camposAMais.ok, camposAMais);

    // CHECK do MySQL
    let recusouCheck = false;
    try {
      await prisma.coreFinanceiroAnalise.update({ where: { id: a.id }, data: { versao: 0 } });
    } catch {
      recusouCheck = true;
    }
    confere("o banco recusa versão 0 (CHECK)", recusouCheck);
    let recusouTipo = false;
    try {
      await prisma.coreFinanceiroVinculo.update({ where: { id: a.vinculos[0].id }, data: { tipoComparacao: "OUTRO" } });
    } catch {
      recusouTipo = true;
    }
    confere("o banco recusa tipo de comparação desconhecido (CHECK)", recusouTipo);

    // Isolamento
    const obterOutroTenant = await obterAnalise(randomUUID(), empresaId, a.id);
    confere("outro tenant não lê a análise", !obterOutroTenant.ok && obterOutroTenant.codigo === "NAO_ENCONTRADA", obterOutroTenant);
    const obterOutraEmpresa = await obterAnalise(tenantId, outraEmpresaId, a.id);
    confere("outra empresa não lê a análise", !obterOutraEmpresa.ok && obterOutraEmpresa.codigo === "NAO_ENCONTRADA", obterOutraEmpresa);
    const listaOutra = valor(await listarAnalises(tenantId, outraEmpresaId, null, 1, 50));
    confere("a lista da outra empresa está vazia", listaOutra.total === 0, listaOutra);
    const vinculoOutra = await vincular(tenantId, user.id, outraEmpresaId, a.id, { versao: a.versao, sugestaoId: null, financeiroIds: linhasDe(a, "FINANCEIRO", "-15.90"), comparacaoIds: linhasDe(a, "EXTRATO", "-15.90"), observacao: "" });
    confere("outra empresa não grava na análise", !vinculoOutra.ok && vinculoOutra.codigo === "NAO_ENCONTRADA", vinculoOutra);
    const docOutra = await adicionarDocumento(tenantId, user.id, outraEmpresaId, a.id, { tipo: "FINANCEIRO", conteudo: financeiro, nomeArquivo: "x.xlsx", mediaType: "", versao: a.versao, confirmarEmpresa: true });
    confere("outra empresa não envia documento à análise", !docOutra.ok && docOutra.codigo === "NAO_ENCONTRADA", docOutra);
    const lista = valor(await listarAnalises(tenantId, empresaId, agencia.id, 1, 1));
    confere("lista por conta e paginada (2 análises, 1 por página, sem snapshot)", lista.total === 2 && lista.itens.length === 1 && !("linhas" in lista.itens[0]) && lista.itens[0].id === a.id, lista);

    // Extrato desfeito: só as conferências com o Extrato param
    valor(await desfazerImportacao(tenantId, user.id, empresaId, imp.importacaoId, "ensaio do financeiro"));
    a = valor(await obterAnalise(tenantId, empresaId, a.id));
    confere("extrato desfeito: aviso e extrato inválido, snapshot preservado", !a.extratoValido && a.avisos.includes(AVISO_EXTRATO_ALTERADO) && linhasDe(a, "EXTRATO").length === 3, a.avisos);
    const comExtrato = await v({ financeiroIds: linhasDe(a, "FINANCEIRO", "-15.90"), comparacaoIds: linhasDe(a, "EXTRATO", "-15.90") });
    confere("conferência com o Extrato é recusada (EXTRATO_ALTERADO)", !comExtrato.ok && comExtrato.codigo === "EXTRATO_ALTERADO", comExtrato);
    const sugestoesExtrato = await sugestoesDaAnalise(tenantId, empresaId, a.id, "EXTRATO");
    confere("sugestões com o Extrato são recusadas", !sugestoesExtrato.ok && sugestoesExtrato.codigo === "EXTRATO_ALTERADO", sugestoesExtrato);
    const comRazaoDepois = await v({ financeiroIds: linhasDe(a, "FINANCEIRO", "-15.90"), comparacaoIds: linhasDe(a, "RAZAO", "-15.90"), observacao: "Mesmo valor; a tarifa." });
    confere("conferência com o Razão continua permitida", comRazaoDepois.ok, comRazaoDepois);
    if (comRazaoDepois.ok) a = comRazaoDepois.valor.analise!;
    const desfazComExtratoMudado = await desfazerVinculoFinanceiro(tenantId, user.id, empresaId, a.id, a.vinculos[0].id, { versao: a.versao, motivo: "Extrato reimportado." });
    confere("desfazer o vínculo com o Extrato continua permitido", desfazComExtratoMudado.ok, desfazComExtratoMudado);
    if (desfazComExtratoMudado.ok) a = desfazComExtratoMudado.valor.analise!;

    // Excluir
    const excluirVelha = await excluirAnalise(tenantId, user.id, empresaId, a.id, a.versao - 1);
    confere("excluir com a versão antiga é recusado", !excluirVelha.ok && excluirVelha.codigo === "VERSAO_DESATUALIZADA", excluirVelha);
    const excluida = valor(await excluirAnalise(tenantId, user.id, empresaId, a.id, a.versao));
    confere("excluída, com auditoria", excluida.analise === null && excluida.auditoria.acao === "contabil.core.financeiro.analise.excluida" && excluida.auditoria.dados.exclusao_logica === true, excluida);
    const depois = await obterAnalise(tenantId, empresaId, a.id);
    confere("a excluída não é mais lida nem baixada", !depois.ok && !(await originalDoDocumento(tenantId, empresaId, a.id, fonteFin.id)).ok, depois);
    const linhaExcluida = await prisma.coreFinanceiroAnalise.findUniqueOrThrow({ where: { id: a.id }, select: { deletedAt: true, versao: true } });
    confere("exclusão lógica: a linha fica, com a versão avançada", !!linhaExcluida.deletedAt && linhaExcluida.versao === a.versao + 1, linhaExcluida);
  } finally {
    const contar = async () =>
      (await prisma.coreFinanceiroAnalise.count({ where: { empresaId: { in: empresasDoCore } } })) +
      (await prisma.coreFinanceiroDocumento.count({ where: { empresaId: { in: empresasDoCore } } })) +
      (await prisma.coreFinanceiroVinculo.count({ where: { empresaId: { in: empresasDoCore } } }));
    const antes = await contar();
    const { mexido, arquivos } = await prisma.$transaction(
      async (tx) => {
        const arquivos = await arquivosDaEmpresa(tx as never, { tenantId, id: company.id }, null);
        const mexido = await executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: company.id });
        await executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: outraCompany.id });
        return { mexido, arquivos };
      },
      { timeout: 60_000 },
    );
    const naoApagados = await apagarArquivos(arquivos);
    confere(
      "a exclusão da empresa apaga análises, documentos e vínculos sem esbarrar em chave",
      antes > 0 && (mexido.CoreFinanceiroAnalise ?? 0) >= 2 && (mexido.CoreFinanceiroDocumento ?? 0) >= 1 && (mexido.CoreFinanceiroVinculo ?? 0) >= 1 && (mexido.CoreEmpresa ?? 0) === 1,
      { mexido, antes },
    );
    confere("os originais da empresa estavam na lista do disco", (arquivos.storage["contabil-core/financeiro"] ?? []).length === chaves.length && chaves.length > 0, arquivos.storage);
    const raiz = path.join(process.cwd(), "storage", "contabil-core", "financeiro");
    confere("nenhum original ficou no disco", naoApagados === 0 && chaves.every((k) => !existsSync(path.join(raiz, k))), { naoApagados, chaves });
    confere("nada da conferência ficou para trás", (await contar()) === 0);
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());

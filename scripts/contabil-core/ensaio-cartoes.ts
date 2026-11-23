// Ensaio dos cartões de crédito (Bloco C, Fase C3, 23/11/2026) num banco LOCAL.
//
// Cadastra duas empresas inventadas, importa um OFX inventado e percorre:
// - o cartão (cadastro, recusas do esquema, edição, lista) e a fatura (competência repetida e inválida,
//   status, a fatura paga que não reabre);
// - os gastos: à mão (com conta desta empresa e recusada a de outra), o CSV (importados, reenvio sem
//   duplicar, linha com erro, compra removida e reimportada), o PDF com texto lido pelos rótulos e o PDF
//   escaneado recusado com a frase;
// - os documentos da fatura: o PDF com texto lido para revisão ("revisar"), o escaneado sem a leitura por
//   IA ("falhou", com a frase), o mesmo arquivo recusado, reler, confirmar complementar e principal (com a
//   substituição dos gastos) e o arquivo em disco igual ao enviado;
// - o pagamento: valor diferente, crédito, a transação que já quitou outra fatura, desassociar;
// - a distribuição: excesso, conta sintética, versão vista velha, aplicar no pagamento pendente (classifica
//   e compõe) e desfazer (cancela), aplicar no pagamento já classificado e desfazer (devolve a composição de
//   antes), a classificação mudada no NEO (desatualizada: só com "preservar");
// - as travas fora do módulo: excluir a conta contábil usada por um gasto de cartão, remover o cartão com
//   fatura aberta e com distribuição aplicada, desvincular o pagamento com a distribuição aplicada;
// - o isolamento entre escritórios e empresas e os CHECKs do MySQL.
// No fim, a exclusão da empresa apaga as tabelas e os PDFs em disco. Nenhum dado real.
//
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-cartoes.ts
import { existsSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getPrisma } from "../../src/lib/prisma";
import { proximoNumero } from "../../src/lib/enderecoCurtoNumeracao";
import { agenciaSchema, classificacaoManualSchema, contaSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, excluirConta, ligarEmpresa, salvarAgencia } from "../../src/lib/contabil-core/servidor/cadastros";
import { importarExtrato } from "../../src/lib/contabil-core/servidor/importacao";
import { cancelarClassificacao, classificarManual } from "../../src/lib/contabil-core/servidor/neo";
import { obterComposicao } from "../../src/lib/contabil-core/servidor/neoAvancado";
import {
  adicionarLancamento,
  associarPagamento,
  atualizarCartao,
  atualizarFatura,
  criarCartao,
  criarFatura,
  desassociarPagamento,
  importarCsv,
  importarPdf,
  listarCartoes,
  listarFaturas,
  listarLancamentos,
  obterFatura,
  pagamentosPossiveis,
  removerCartao,
  removerLancamento,
} from "../../src/lib/contabil-core/servidor/cartoes";
import {
  adicionarDocumento,
  aplicarDistribuicao,
  arquivoDoDocumento,
  confirmarDocumento,
  desfazerDistribuicao,
  obterDistribuicao,
  processarDocumento,
  relerDocumento,
  salvarDistribuicao,
} from "../../src/lib/contabil-core/servidor/faturas";
import { definirIaParaDocumentos, iaLiberadaParaDocumentos } from "../../src/lib/contabil-core/servidor/notas";
import { IMAGEM_DESLIGADA } from "../../src/lib/contabil-core/cartoes/documentos";
import { SEM_TEXTO } from "../../src/lib/contabil-core/cartoes/leitor";
import { PLANO_DA_EMPRESA, arquivosDaEmpresa } from "../../src/lib/exclusao/empresa";
import { apagarArquivos } from "../../src/lib/exclusao/arquivos";
import { executarPlano } from "../../src/lib/exclusao/comum";

const prisma = getPrisma();
let falhas = 0;
let conferencias = 0;
function confere(nome: string, ok: boolean, detalhe?: unknown) {
  conferencias++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok || detalhe === undefined ? "" : ` → ${JSON.stringify(detalhe).slice(0, 1500)}`}`);
  if (!ok) falhas++;
}
function valor<T>(r: { ok: true; valor: T } | { ok: false; erro: string }): T {
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
}
const recusou = (r: { ok: boolean; codigo?: string; erro?: string }, codigo: string, trecho?: string) =>
  !r.ok && r.codigo === codigo && (trecho === undefined || (r.erro ?? "").includes(trecho));

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
const CNPJ = cnpj("963852740001");
const OUTRO_CNPJ = cnpj("974185290001");

async function pdf(linhas: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const pagina = doc.addPage([595, 842]);
  linhas.forEach((l, k) => pagina.drawText(l, { x: 40, y: 790 - k * 18, size: 10, font: fonte }));
  return doc.save();
}
async function pdfEmBranco(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  return doc.save();
}

const OFX = `OFXHEADER:100
DATA:OFXSGML

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0341<BRANCHID>5432<ACCTID>77777-2</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260210<TRNAMT>-150.00<FITID>F1<MEMO>PAGAMENTO FATURA CARTAO 01</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260310<TRNAMT>-80.00<FITID>F2<MEMO>PAGAMENTO FATURA CARTAO 02</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260311<TRNAMT>80.00<FITID>F3<MEMO>ESTORNO DIVERSO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260312<TRNAMT>-99.00<FITID>F4<MEMO>PAGAMENTO OUTRO VALOR</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1000.00<DTASOF>20260331</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } });
  const tenantId = tenant.id;
  const iaAntes = await iaLiberadaParaDocumentos(tenantId);
  await definirIaParaDocumentos(tenantId, false);
  const company = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Empresa Ensaio Cartoes LTDA", cnpj: CNPJ } as never,
    select: { id: true },
  });
  const outraCompany = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Outra Empresa Ensaio Cartoes LTDA", cnpj: OUTRO_CNPJ } as never,
    select: { id: true },
  });
  const empresasDoCore: string[] = [];
  const documentosGravados: string[] = [];
  try {
    const empresaId = valor(await ligarEmpresa(tenantId, company.id, "simples_nacional")).id;
    const outraEmpresaId = valor(await ligarEmpresa(tenantId, outraCompany.id, "simples_nacional")).id;
    empresasDoCore.push(empresaId, outraEmpresaId);
    const conta = (codigo: string, descricao: string, tipo: string, tipoSa = "A", empresa = empresaId) =>
      criarConta(tenantId, empresa, contaSchema.parse({ codigo, descricao, tipo, tipoSa })).then(valor);
    const banco = await conta("1.1.1.05", "Banco Itaú", "ativo");
    const material = await conta("4.1.3.01", "Material de escritório", "despesa");
    const viagens = await conta("4.1.3.02", "Viagens", "despesa");
    const sintetica = await conta("4.1.3", "Despesas gerais", "despesa", "S");
    const contaDeFora = await conta("4.1.3.01", "Material (outra empresa)", "despesa", "A", outraEmpresaId);
    const agencia = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "5432", numero: "77777", digito: "2", contaContabilId: banco.id })));
    const imp = valor(await importarExtrato(tenantId, user.id, empresaId, agencia.id, "mar.ofx", new TextEncoder().encode(OFX), false));
    confere("extrato inventado importado (4 de 4)", imp.importadas === 4, imp);
    const ts = await prisma.coreTransacao.findMany({ where: { empresaId, deletedAt: null }, orderBy: { data: "asc" }, select: { id: true, historico: true } });
    const [pag150, pag80, credito80, pag99] = ts;

    // ─── Cartão ───────────────────────────────────────────────────────────
    const cartaoCorpo = { nome: "Cartão corporativo", bandeira: "Visa", ultimosDigitos: "1234", diaFechamento: 5, diaVencimento: 12, limite: "50000" };
    const cartao = valor(await criarCartao(tenantId, empresaId, cartaoCorpo));
    confere("cartão cadastrado (bandeira em minúsculas, limite com 2 casas)", cartao.valor.bandeira === "visa" && cartao.valor.limite === "50000.00" && cartao.auditoria[0].acao === "contabil.core.cartao.criado", cartao);
    confere("bandeira inválida é recusada", recusou(await criarCartao(tenantId, empresaId, { ...cartaoCorpo, bandeira: "diners" }), "INVALIDA", "Bandeira inválida"));
    confere("últimos dígitos com letra são recusados", recusou(await criarCartao(tenantId, empresaId, { ...cartaoCorpo, ultimosDigitos: "12a4" }), "INVALIDA", "4 dígitos"));
    confere("dia de fechamento 29 é recusado", recusou(await criarCartao(tenantId, empresaId, { ...cartaoCorpo, diaFechamento: 29 }), "INVALIDA"));
    const editado = valor(await atualizarCartao(tenantId, empresaId, cartao.valor.id, { limite: "-10", nome: "Cartão da diretoria" }));
    confere("edição só do que veio (o limite negativo passa, como no original)", editado.valor.nome === "Cartão da diretoria" && editado.valor.limite === "-10.00" && editado.valor.bandeira === "visa", editado);
    const cartaoB = valor(await criarCartao(tenantId, empresaId, { nome: "Agora outro", bandeira: "elo", diaFechamento: 1, diaVencimento: 10 })).valor;

    // ─── Fatura ───────────────────────────────────────────────────────────
    const fatura = valor(await criarFatura(tenantId, empresaId, cartao.valor.id, { competencia: "2026-02" })).valor;
    confere("fatura nasce aberta e zerada", fatura.status === "aberta" && fatura.valorTotal === "0.00" && fatura.totalLancamentos === 0, fatura);
    confere("a mesma competência é recusada", recusou(await criarFatura(tenantId, empresaId, cartao.valor.id, { competencia: "2026-02" }), "CONFLITO", "2026-02"));
    confere("competência com mês 13 é recusada", recusou(await criarFatura(tenantId, empresaId, cartao.valor.id, { competencia: "2026-13" }), "INVALIDA", "AAAA-MM"));
    confere("a fatura por outro cartão não é achada", recusou(await obterFatura(tenantId, empresaId, cartaoB.id, fatura.id), "NAO_ENCONTRADA"));
    const lista = valor(await listarCartoes(tenantId, empresaId));
    confere("lista por nome, com o total de faturas e o valor da fatura aberta", lista.map((c) => c.nome).join("|") === "Agora outro|Cartão da diretoria" && lista[1].totalFaturas === 1 && lista[1].faturaAbertaValor === "0.00", lista);

    // ─── Gastos à mão e por CSV ───────────────────────────────────────────
    const ctx = { tenantId, empresaId, cartaoId: cartao.valor.id, faturaId: fatura.id, userId: user.id };
    const manual = valor(await adicionarLancamento(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, { dataCompra: "2026-01-20", descricao: "PAPELARIA EXEMPLO", valor: "30.00", contaId: material.id }));
    confere("gasto à mão com a conta desta empresa", manual.valor.contaId === material.id && manual.valor.valor === "30.00", manual);
    confere("conta de outra empresa é recusada", recusou(await adicionarLancamento(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, { dataCompra: "2026-01-20", descricao: "X", valor: "1", contaId: contaDeFora.id }), "NAO_ENCONTRADA", "Conta contábil"));
    confere("valor zero é recusado", recusou(await adicionarLancamento(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, { dataCompra: "2026-01-20", descricao: "X", valor: "0" }), "INVALIDA"));
    const csvCorreto = "data_compra,descricao,valor\n21/01/2026,COMBUSTIVEL EXEMPLO,\"1.000,00\"\n22/01/2026,HOTEL EXEMPLO,70.00\n31/02/2026,DATA RUIM,10,00\n";
    const i1 = valor(await importarCsv(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, new TextEncoder().encode(csvCorreto)));
    confere("CSV: 2 importados e 1 linha com erro de data", i1.valor.importados === 2 && i1.valor.duplicados === 0 && i1.valor.erros.length === 1 && i1.valor.erros[0].startsWith("Linha 4: Data inválida"), i1.valor);
    const i2 = valor(await importarCsv(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, new TextEncoder().encode(csvCorreto)));
    confere("CSV reenviado não duplica", i2.valor.importados === 0 && i2.valor.duplicados === 2, i2.valor);
    confere("CSV com coluna a menos é recusado com a frase", recusou(await importarCsv(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, new TextEncoder().encode("data,descricao,valor\n01/01/2026,X\n")), "INVALIDA", "menos colunas"));
    const gastos = valor(await listarLancamentos(tenantId, empresaId, ctx.cartaoId, ctx.faturaId));
    const hotel = gastos.itens.find((g) => g.descricao === "HOTEL EXEMPLO")!;
    valor(await removerLancamento(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, hotel.id));
    const i3 = valor(await importarCsv(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, new TextEncoder().encode(csvCorreto)));
    confere("compra removida e reimportada vira erro da linha (no original, erro 500)", i3.valor.importados === 0 && i3.valor.erros.some((e) => e.includes("foi removida")), i3.valor);
    confere("o total da fatura é a soma dos gastos vivos", valor(await obterFatura(tenantId, empresaId, ctx.cartaoId, ctx.faturaId)).valorTotal === "1030.00");

    // ─── Gastos pelo PDF ──────────────────────────────────────────────────
    const faturaPdf = await pdf(["Fatura de Fevereiro", "Vencimento 12/02/2026", "05/01 MERCADO EXEMPLO 40,00", "07/01 UBER EXEMPLO 02/03 20,00", "TOTAL DESTA FATURA 60,00"]);
    const fPdf = valor(await criarFatura(tenantId, empresaId, cartaoB.id, { competencia: "2026-02" })).valor;
    const p1 = valor(await importarPdf(tenantId, user.id, empresaId, cartaoB.id, fPdf.id, faturaPdf));
    confere("PDF com texto lido pelos rótulos (2 gastos, parcela)", p1.valor.importados === 2 && p1.valor.erros.length === 0, p1.valor);
    const doPdf = valor(await listarLancamentos(tenantId, empresaId, cartaoB.id, fPdf.id));
    confere("o ano vem do vencimento e a parcela fica gravada", doPdf.itens[0].dataCompra.startsWith("2026-01-05") && doPdf.itens[1].parcelaAtual === 2 && doPdf.itens[1].parcelaTotal === 3 && doPdf.valorTotal === "60.00", doPdf);
    const escaneado = await importarPdf(tenantId, user.id, empresaId, cartaoB.id, fPdf.id, await pdfEmBranco());
    confere("PDF escaneado é recusado com a frase do original", recusou(escaneado, "INVALIDA", `Arquivo PDF inválido: ${SEM_TEXTO}`), escaneado);

    // ─── Documentos da fatura ─────────────────────────────────────────────
    const fDoc = valor(await criarFatura(tenantId, empresaId, cartaoB.id, { competencia: "2026-03" })).valor;
    const ctxDoc = { ...ctx, cartaoId: cartaoB.id, faturaId: fDoc.id };
    const composicao = await pdf(["CARTAO EXEMPLO 2026", "TOTAL FATURA 80,00", "24-fev Fisico LIVRARIA EXEMPLO 50,00", "2-mar Virtual ASSINATURA EXEMPLO 30,00"]);
    const d1 = valor(await adicionarDocumento(ctxDoc, composicao, "C:\\pasta\\composicao.pdf"));
    confere("documento entra processando, com o nome sem o caminho", d1.valor.status === "processando" && d1.auditoria[0].acao === "contabil.core.fatura.documento.adicionado", d1);
    documentosGravados.push(`${tenantId}/${d1.valor.id}.pdf`);
    confere("o mesmo PDF na mesma fatura é recusado", recusou(await adicionarDocumento(ctxDoc, composicao, "de-novo.pdf"), "CONFLITO", "já está anexado"));
    confere("arquivo que não é PDF é recusado", recusou(await adicionarDocumento(ctxDoc, new TextEncoder().encode("texto"), "x.pdf"), "INVALIDA", "25 MiB"));
    await processarDocumento(d1.valor.id, user.id);
    let v = valor(await obterDistribuicao(ctxDoc));
    const doc1 = v.documentos.find((d) => d.id === d1.valor.id)!;
    const resultado1 = doc1.resultado as { metodo: string; itens: { data: string; descricao: string; valor: string }[]; total: string };
    confere("a composição é lida para revisão (ano ancorado na competência)", doc1.status === "revisar" && resultado1.metodo === "COMPOSICAO" && resultado1.total === "80.00" && resultado1.itens[0].data === "2026-02-24", doc1);
    const d2 = valor(await adicionarDocumento(ctxDoc, await pdfEmBranco(), "escaneado.pdf"));
    documentosGravados.push(`${tenantId}/${d2.valor.id}.pdf`);
    await processarDocumento(d2.valor.id, user.id);
    v = valor(await obterDistribuicao(ctxDoc));
    const doc2 = v.documentos.find((d) => d.id === d2.valor.id)!;
    confere("o escaneado sem a leitura por IA falha com a frase", doc2.status === "falhou" && doc2.erro === IMAGEM_DESLIGADA, doc2);
    confere("ler de novo só o que falhou", (await relerDocumento(ctxDoc, d2.valor.id)).ok && recusou(await relerDocumento(ctxDoc, d1.valor.id), "CONFLITO", "falharam"));
    await processarDocumento(d2.valor.id, user.id);
    const baixado = valor(await arquivoDoDocumento(ctxDoc, d1.valor.id));
    confere("o PDF baixado é o enviado", Buffer.compare(baixado, Buffer.from(composicao)) === 0);
    const comp = valor(await confirmarDocumento(ctxDoc, d2.valor.id, { versao: v.versao, principal: false }));
    confere("o escaneado que falhou fica como complementar", comp.valor.documentos.find((d) => d.id === d2.valor.id)?.status === "complementar" && comp.valor.versao === v.versao + 1, comp.valor.documentos);
    const itens = resultado1.itens;
    confere("sem resolver as pendências, a fonte principal é recusada", recusou(await confirmarDocumento(ctxDoc, d1.valor.id, { versao: comp.valor.versao, principal: true, total: "80.00", itens }), "INVALIDA", "pendências"));
    confere("versão vista velha é recusada", recusou(await confirmarDocumento(ctxDoc, d1.valor.id, { versao: 0, principal: true, pendenciasResolvidas: true, total: "80.00", itens }), "CONFLITO", "mudou"));
    valor(await adicionarLancamento(tenantId, empresaId, cartaoB.id, fDoc.id, { dataCompra: "2026-03-01", descricao: "GASTO A SUBSTITUIR", valor: "5" }));
    confere("com gastos, a fonte principal pede substituir", recusou(await confirmarDocumento(ctxDoc, d1.valor.id, { versao: comp.valor.versao, principal: true, pendenciasResolvidas: true, total: "80.00", itens }), "CONFLITO", "substituir"));
    confere("itens que não fecham o total são recusados", recusou(await confirmarDocumento(ctxDoc, d1.valor.id, { versao: comp.valor.versao, principal: true, pendenciasResolvidas: true, substituir: true, total: "81.00", itens }), "INVALIDA", "soma"));
    const principal = valor(await confirmarDocumento(ctxDoc, d1.valor.id, { versao: comp.valor.versao, principal: true, pendenciasResolvidas: true, substituir: true, total: "80.00", itens }));
    confere("a fonte principal substitui os gastos", principal.valor.itens.length === 2 && principal.valor.total === "80.00" && principal.valor.documentos.find((d) => d.id === d1.valor.id)?.status === "principal", principal.valor);

    // ─── Pagamento ────────────────────────────────────────────────────────
    const possiveis = valor(await pagamentosPossiveis(tenantId, empresaId, cartaoB.id, fDoc.id, null));
    confere("pagamentos possíveis: só o débito com o valor exato", possiveis.length === 1 && possiveis[0].id === pag80.id, possiveis);
    confere("o valor diferente é recusado", recusou(await associarPagamento(tenantId, empresaId, cartaoB.id, fDoc.id, pag99.id), "INVALIDA", "(80.00)"));
    confere("o crédito é recusado", recusou(await associarPagamento(tenantId, empresaId, cartaoB.id, fDoc.id, credito80.id), "INVALIDA", "débito"));
    const paga = valor(await associarPagamento(tenantId, empresaId, cartaoB.id, fDoc.id, pag80.id));
    confere("o pagamento deixa a fatura paga", paga.valor.status === "paga" && paga.valor.transacao?.historico === pag80.historico && paga.auditoria[0].acao === "contabil.core.fatura.paga", paga);
    confere("a fatura paga não reabre nem recebe gasto", recusou(await atualizarFatura(tenantId, empresaId, cartaoB.id, fDoc.id, { status: "aberta" }), "INVALIDA", "reabertas") && recusou(await adicionarLancamento(tenantId, empresaId, cartaoB.id, fDoc.id, { dataCompra: "2026-03-01", descricao: "X", valor: "1" }), "INVALIDA", "paga"));
    valor(await atualizarFatura(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, { status: "fechada" }));
    confere("a transação que já quitou outra fatura é recusada", recusou(await associarPagamento(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, pag80.id), "CONFLITO", "outra fatura"));

    // ─── Distribuição: pagamento pendente ─────────────────────────────────
    v = valor(await obterDistribuicao(ctxDoc));
    const [livraria, assinatura] = v.itens;
    const parte = (contaId: string, historico: string, valorParte: string) => ({ conta_id: contaId, historico, valor: valorParte });
    confere("distribuir além do valor do gasto é recusado", recusou(await salvarDistribuicao(ctxDoc, { versao: v.versao, distribuicoes: { [livraria.id]: [parte(material.id, "Livros", "60.00")] } }), "INVALIDA", "excede"));
    confere("conta sintética é recusada", recusou(await salvarDistribuicao(ctxDoc, { versao: v.versao, distribuicoes: { [livraria.id]: [parte(sintetica.id, "Livros", "50.00")] } }), "INVALIDA", "analíticas"));
    const distribuicoes = { [livraria.id]: [parte(material.id, "Livros técnicos", "20.00"), parte(viagens.id, "Guias de viagem", "30.00")], [assinatura.id]: [parte(material.id, "Assinatura", "30.00")] };
    const salva = valor(await salvarDistribuicao(ctxDoc, { versao: v.versao, distribuicoes }));
    confere("distribuição salva, restante zero", salva.valor.restante === "0.00" && salva.valor.versao === v.versao + 1, salva.valor);
    confere("versão vista velha é recusada ao salvar", recusou(await salvarDistribuicao(ctxDoc, { versao: v.versao, distribuicoes }), "CONFLITO", "mudou"));
    confere("hash errado é recusado ao aplicar", recusou(await aplicarDistribuicao(ctxDoc, { versao: salva.valor.versao, classificacaoHash: "0".repeat(64), motivo: "Fatura de março" }), "CONFLITO", "mudou"));
    const aplicada = valor(await aplicarDistribuicao(ctxDoc, { versao: salva.valor.versao, classificacaoHash: salva.valor.classificacaoHash, motivo: "Fatura de março" }));
    const t80 = await prisma.coreTransacao.findUniqueOrThrow({ where: { id: pag80.id }, select: { status: true } });
    const partidas80 = await prisma.coreRegistro.findMany({ where: { transacaoId: pag80.id, deletedAt: null }, select: { contaId: true, dc: true, valor: true, historico: true } });
    confere(
      "aplicar no pagamento pendente: classifica e compõe (3 pares, histórico da fatura)",
      aplicada.valor.aplicacao === "APLICADA" && t80.status === "processada" && partidas80.length === 6 && partidas80.filter((p) => p.dc === "D").every((p) => p.historico.toUpperCase().includes("FATURA 2026-03") && /2026-0(2-24|3-02)/.test(p.historico)),
      { partidas80, t80 },
    );
    confere("as auditorias da aplicação (composição do NEO e distribuição)", aplicada.auditoria.map((a) => a.acao).join(",") === "contabil.core.composicao.alterada,contabil.core.fatura.distribuicao.aplicada", aplicada.auditoria);
    confere("com a distribuição aplicada: salvar, desvincular e remover o cartão são recusados", recusou(await salvarDistribuicao(ctxDoc, { versao: aplicada.valor.versao, distribuicoes }), "CONFLITO", "Desfaça") && recusou(await desassociarPagamento(tenantId, empresaId, cartaoB.id, fDoc.id), "CONFLITO", "Desfaça") && recusou(await removerCartao(tenantId, empresaId, cartaoB.id), "CONFLITO", "distribuições"));
    const desfeita = valor(await desfazerDistribuicao(ctxDoc, { versao: aplicada.valor.versao, motivo: "Conferência" }));
    const t80b = await prisma.coreTransacao.findUniqueOrThrow({ where: { id: pag80.id }, select: { status: true } });
    confere("desfazer sem classificação anterior cancela o lançamento", desfeita.valor.aplicacao === null && t80b.status === "pendente" && (await prisma.coreRegistro.count({ where: { transacaoId: pag80.id, deletedAt: null } })) === 0 && desfeita.auditoria[0].acao === "contabil.core.lancamento.cancelado", desfeita);

    // ─── Distribuição: a classificação mudou no NEO ───────────────────────
    const ap2 = valor(await aplicarDistribuicao(ctxDoc, { versao: desfeita.valor.versao, classificacaoHash: desfeita.valor.classificacaoHash, motivo: "De novo" }));
    valor(await cancelarClassificacao(tenantId, user.id, empresaId, pag80.id, "Mexido no NEO"));
    v = valor(await obterDistribuicao(ctxDoc));
    confere("a classificação mudada no NEO deixa a aplicação desatualizada", ap2.valor.aplicacao === "APLICADA" && v.aplicacao === "DESATUALIZADA", v.aplicacao);
    confere("desfazer a desatualizada sem preservar é recusado", recusou(await desfazerDistribuicao(ctxDoc, { versao: v.versao, motivo: "x" }), "CONFLITO", "preservar"));
    const preservada = valor(await desfazerDistribuicao(ctxDoc, { versao: v.versao, motivo: "Encerrar", preservarClassificacaoAtual: true }));
    confere("preservar a atual encerra o controle sem mexer no NEO", preservada.valor.aplicacao === null && (await prisma.coreTransacao.findUniqueOrThrow({ where: { id: pag80.id } })).status === "pendente", preservada.auditoria);

    // ─── Distribuição: pagamento já classificado ──────────────────────────
    valor(await desassociarPagamento(tenantId, empresaId, ctx.cartaoId, ctx.faturaId));
    // A primeira fatura (1030,00 → só os 150 do pagamento): fica com gastos que fecham 150.
    const gastos1 = valor(await listarLancamentos(tenantId, empresaId, ctx.cartaoId, ctx.faturaId));
    valor(await atualizarFatura(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, { status: "aberta" }));
    for (const g of gastos1.itens) if (g.descricao !== "PAPELARIA EXEMPLO") valor(await removerLancamento(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, g.id));
    valor(await adicionarLancamento(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, { dataCompra: "2026-01-25", descricao: "PASSAGEM EXEMPLO", valor: "120.00" }));
    valor(await atualizarFatura(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, { status: "fechada" }));
    valor(await classificarManual(tenantId, empresaId, classificacaoManualSchema.parse({ transacaoIds: [pag150.id], contaId: viagens.id, descricao: "Pagamento do cartão" })));
    const antesDaFatura = valor(await obterComposicao(tenantId, empresaId, pag150.id));
    valor(await associarPagamento(tenantId, empresaId, ctx.cartaoId, ctx.faturaId, pag150.id));
    v = valor(await obterDistribuicao(ctx));
    const [papelaria, passagem] = v.itens;
    const s2 = valor(await salvarDistribuicao(ctx, { versao: v.versao, distribuicoes: { [papelaria.id]: [parte(material.id, "Papel", "30.00")], [passagem.id]: [parte(viagens.id, "Passagem", "120.00")] } }));
    const ap3 = valor(await aplicarDistribuicao(ctx, { versao: s2.valor.versao, classificacaoHash: s2.valor.classificacaoHash, motivo: "Fatura de fevereiro" }));
    const guardada = await prisma.coreFaturaDistribuicao.findUniqueOrThrow({ where: { faturaId: ctx.faturaId }, select: { aplicacao: true } });
    const antesGuardado = (guardada.aplicacao as { antes: { componentes: { conta_id: string; valor: string }[]; transacao_valor: string } }).antes;
    confere("aplicar no pagamento classificado guarda a composição de antes (inteira, como o original)", ap3.valor.aplicacao === "APLICADA" && antesGuardado.componentes.length === 1 && antesGuardado.componentes[0].conta_id === viagens.id && antesGuardado.transacao_valor === "150.00", antesGuardado);
    const d3 = valor(await desfazerDistribuicao(ctx, { versao: ap3.valor.versao, motivo: "Volta" }));
    const depois = valor(await obterComposicao(tenantId, empresaId, pag150.id));
    confere(
      "desfazer devolve a composição de antes",
      d3.valor.aplicacao === null && depois.componentes.length === 1 && depois.componentes[0].contaId === antesDaFatura.componentes[0].contaId && depois.componentes[0].valor === antesDaFatura.componentes[0].valor,
      { depois, antesDaFatura },
    );

    // ─── Travas fora do módulo ────────────────────────────────────────────
    const exclusao = await excluirConta(tenantId, empresaId, material.id);
    confere("a conta usada por um gasto de cartão não sai do plano", !exclusao.ok && exclusao.erro.includes("gasto(s) de cartão"), exclusao);
    valor(await criarFatura(tenantId, empresaId, ctx.cartaoId, { competencia: "2026-04" }));
    confere("cartão com fatura aberta ou fechada não é removido", recusou(await removerCartao(tenantId, empresaId, ctx.cartaoId), "CONFLITO", "em aberto"));
    const vazio = valor(await criarCartao(tenantId, empresaId, { nome: "Sem faturas", bandeira: "outros", diaFechamento: 2, diaVencimento: 9 })).valor;
    confere("cartão sem fatura é removido", (await removerCartao(tenantId, empresaId, vazio.id)).ok && !valor(await listarCartoes(tenantId, empresaId)).some((c) => c.id === vazio.id));

    // ─── Isolamento ───────────────────────────────────────────────────────
    confere("o cartão não aparece pela outra empresa", recusou(await listarFaturas(tenantId, outraEmpresaId, ctx.cartaoId), "NAO_ENCONTRADA") && recusou(await obterDistribuicao({ ...ctx, empresaId: outraEmpresaId }), "NAO_ENCONTRADA"));
    confere("nem por outro escritório", recusou(await listarCartoes("tenant-que-nao-existe", empresaId), "NAO_ENCONTRADA") && recusou(await arquivoDoDocumento({ ...ctxDoc, tenantId: "tenant-que-nao-existe" }, d1.valor.id), "NAO_ENCONTRADA"));
    confere("o pagamento de outra empresa não quita a fatura", recusou(await associarPagamento(tenantId, outraEmpresaId, ctx.cartaoId, ctx.faturaId, pag99.id), "NAO_ENCONTRADA"));

    // ─── Checagens do MySQL ───────────────────────────────────────────────
    const erroDe = (p: Promise<unknown>) => p.then(() => "", (e: unknown) => String((e as Error).message));
    const baseCartao = { tenantId, empresaId, nome: "X", bandeira: "visa", diaFechamento: 1, diaVencimento: 1 };
    confere("o CHECK recusa bandeira fora da lista", (await erroDe(prisma.coreCartaoCredito.create({ data: { ...baseCartao, bandeira: "diners" } }))).includes("ck_core_cartao_bandeira"));
    confere("o CHECK recusa dia 29", (await erroDe(prisma.coreCartaoCredito.create({ data: { ...baseCartao, diaVencimento: 29 } }))).includes("ck_core_cartao_dias"));
    confere("o CHECK recusa status de fatura fora do enum", (await erroDe(prisma.coreFaturaCartao.create({ data: { tenantId, empresaId, cartaoId: cartaoB.id, competencia: "2027-01", status: "quitada" } }))).includes("ck_core_fatura_status"));
    confere("o CHECK recusa gasto negativo", (await erroDe(prisma.coreLancamentoCartao.create({ data: { tenantId, empresaId, faturaId: fDoc.id, dataCompra: new Date(), descricao: "X", valor: "-1" } }))).includes("ck_core_lancamento_cartao_valor"));
    confere("o CHECK recusa status de documento desconhecido", (await erroDe(prisma.coreFaturaDocumento.create({ data: { tenantId, empresaId, faturaId: fDoc.id, nome: "x", hashArquivo: "a".repeat(64), tamanho: 1, status: "lido", resultado: {} } }))).includes("ck_core_fatura_documento_status"));
    confere("a competência é única no cartão (unicidade total, como no original)", (await erroDe(prisma.coreFaturaCartao.create({ data: { tenantId, empresaId, cartaoId: cartaoB.id, competencia: "2026-02", deletedAt: new Date() } }))).includes("Unique constraint"));
    confere("uma transação quita uma fatura só (coluna única)", (await erroDe(prisma.coreFaturaCartao.create({ data: { tenantId, empresaId, cartaoId: cartaoB.id, competencia: "2027-02", transacaoId: pag80.id } }))).includes("Unique constraint"));
  } finally {
    const contar = () =>
      Promise.all([
        prisma.coreCartaoCredito.count({ where: { empresaId: { in: empresasDoCore } } }),
        prisma.coreFaturaCartao.count({ where: { empresaId: { in: empresasDoCore } } }),
        prisma.coreLancamentoCartao.count({ where: { empresaId: { in: empresasDoCore } } }),
        prisma.coreFaturaDocumento.count({ where: { empresaId: { in: empresasDoCore } } }),
        prisma.coreFaturaDistribuicao.count({ where: { empresaId: { in: empresasDoCore } } }),
      ]).then((ns) => ns.reduce((a, b) => a + b, 0));
    const antes = await contar();
    let arquivos;
    const mexido = await prisma.$transaction(
      async (tx) => {
        arquivos = await arquivosDaEmpresa(tx as never, { tenantId, id: company.id }, null);
        const m = await executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: company.id });
        await executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: outraCompany.id });
        return m;
      },
      { timeout: 60_000 },
    );
    const listados = arquivos!.storage["contabil-core/faturas"] ?? [];
    const naoApagados = await apagarArquivos(arquivos!);
    confere(
      "a exclusão da empresa apaga as tabelas dos cartões antes das transações e do plano, sem esbarrar em chave",
      antes > 0 && (mexido.CoreCartaoCredito ?? 0) >= 2 && (mexido.CoreFaturaCartao ?? 0) >= 3 && (mexido.CoreLancamentoCartao ?? 0) >= 5 && (mexido.CoreFaturaDocumento ?? 0) === 2 && (mexido.CoreFaturaDistribuicao ?? 0) === 2 && (mexido.CoreEmpresa ?? 0) === 1,
      { mexido, antes },
    );
    confere("nada dos cartões ficou para trás", (await contar()) === 0);
    confere(
      "os PDFs em disco saem depois do commit",
      naoApagados === 0 && documentosGravados.length === 2 && documentosGravados.every((k) => listados.includes(k)) && documentosGravados.every((k) => !existsSync(path.join(process.cwd(), "storage", "contabil-core", "faturas", k))),
      { listados, documentosGravados, naoApagados },
    );
    await definirIaParaDocumentos(tenantId, iaAntes);
  }
  console.log(falhas ? `\n${falhas} falha(s) em ${conferencias} conferências` : `\ntudo certo: ${conferencias} conferências`);
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());

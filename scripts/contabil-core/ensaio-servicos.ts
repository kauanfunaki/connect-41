// Ensaio ponta a ponta dos serviços do Contábil Core num banco LOCAL (Fase 2, 09/11/2026).
//
// Cadastra uma empresa inventada, conta bancária, plano, regra e contraparte; importa um OFX
// inventado; roda o NEO; classifica à mão; gera o TXT do Domínio; desfaz a importação e importa de
// novo. No fim apaga tudo pela exclusão da empresa. Nenhum dado real.
//
// Uso (o preload deixa importar os módulos com "server-only" fora do Next):
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-servicos.ts

import { readFileSync } from "node:fs";
import { getPrisma } from "../../src/lib/prisma";
import { agenciaSchema, contaSchema, contraparteSchema, exportacaoSchema, regraSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, ligarEmpresa, salvarAgencia, salvarContraparte, salvarRegra } from "../../src/lib/contabil-core/servidor/cadastros";
import { desfazerImportacao, importarExtrato } from "../../src/lib/contabil-core/servidor/importacao";
import { cancelarClassificacao, classificarManual, listarPendencias, processarNeo } from "../../src/lib/contabil-core/servidor/neo";
import { gerarArquivoDoDominio } from "../../src/lib/contabil-core/servidor/exportacao";
import { alterarComposicao, classificarComRegra, filaAgrupada, obterComposicao, reclassificar, simularRegra } from "../../src/lib/contabil-core/servidor/neoAvancado";
import { dec } from "../../src/lib/contabil-core/motor/decimal";
import { PLANO_DA_EMPRESA } from "../../src/lib/exclusao/empresa";
import { executarPlano } from "../../src/lib/exclusao/comum";

const prisma = getPrisma();
let falhas = 0;
function confere(nome: string, ok: boolean, detalhe?: unknown) {
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok || detalhe === undefined ? "" : ` → ${JSON.stringify(detalhe)}`}`);
  if (!ok) falhas++;
}
function valor<T>(r: { ok: true; valor: T } | { ok: false; erro: string }): T {
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
}

const OFX = (fitidExtra = "") => `OFXHEADER:100
DATA:OFXSGML

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0756<BRANCHID>1234<ACCTID>98765-4</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260105<TRNAMT>-15.90<FITID>F1${fitidExtra}<MEMO>TARIFA PACOTE SERVICOS</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260106<TRNAMT>-1200.00<FITID>F2${fitidExtra}<MEMO>PIX EMITIDO OUTRA IF<NAME>Pagamento Pix 11.222.333/0001-81</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260107<TRNAMT>350,00<FITID>F3${fitidExtra}<MEMO>CRED PIX CLIENTE NOVO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260108<TRNAMT>-54881.83<FITID>F4${fitidExtra}<MEMO>18/02/2026 TARIFA COB -1,19 -54.881,83</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1000.00<DTASOF>20260131</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } });
  const tenantId = tenant.id;
  const company = await prisma.company.create({
    data: { tenantId, name: "Empresa Ensaio Serviços LTDA", cnpj: "12.345.678/0001-95" } as never,
    select: { id: true },
  });

  try {
    const empresaId = valor(await ligarEmpresa(tenantId, company.id, "simples_nacional")).id;
    confere("empresa repetida é recusada", !(await ligarEmpresa(tenantId, company.id, "simples_nacional")).ok);

    const banco = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "1.1.1.01", descricao: "Banco Sicoob", tipo: "ativo", contaNumero: 5 })));
    const tarifa = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "3.4.2.05", descricao: "Tarifas bancárias", tipo: "despesa", contaNumero: 1026 })));
    const fornecedor = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "2.1.1.01", descricao: "Fornecedor Acme", tipo: "passivo", contaNumero: 2001 })));
    const receita = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "3.1.1.01", descricao: "Receita", tipo: "receita", contaNumero: 3001 })));
    confere("código de conta repetido é recusado", !(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "1.1.1.01", descricao: "x x", tipo: "ativo" }))).ok);

    const agencia = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "756", agencia: "1234", numero: "98765", digito: "4", contaContabilId: banco.id })));
    confere("conta bancária repetida é recusada", !(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "SICOOB", agencia: "1234", numero: "98765" }))).ok);

    valor(await salvarRegra(tenantId, empresaId, null, regraSchema.parse({ contaId: tarifa.id, descricao: "Tarifa bancária", historico: "TARIFA PACOTE", dc: "D" })));
    confere("regra global repetida é recusada", !(await salvarRegra(tenantId, empresaId, null, regraSchema.parse({ contaId: tarifa.id, descricao: "Outra", historico: " tarifa pacote ", dc: "D" }))).ok);
    valor(await salvarContraparte(tenantId, user.id, empresaId, null, contraparteSchema.parse({ tipo: "fornecedor", documento: "11.222.333/0001-81", razaoSocial: "Acme Fornecimentos Ltda", contaContabilId: fornecedor.id })));
    confere("fornecedor e cliente com o mesmo documento convivem", (await salvarContraparte(tenantId, user.id, empresaId, null, contraparteSchema.parse({ tipo: "cliente", documento: "11222333000181", razaoSocial: "Acme Fornecimentos Ltda", contaContabilId: receita.id }))).ok);
    confere("'ambos' não convive com fornecedor", !(await salvarContraparte(tenantId, user.id, empresaId, null, contraparteSchema.parse({ tipo: "ambos", documento: "11222333000181", razaoSocial: "Acme", contaContabilId: receita.id }))).ok);

    // Importação
    const bytes = new TextEncoder().encode(OFX());
    const outraConta = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "1", numero: "2" })));
    const divergente = await importarExtrato(tenantId, user.id, empresaId, outraConta.id, "jan.ofx", bytes, false);
    confere("extrato de outra conta é recusado", !divergente.ok && divergente.erro.startsWith("Extrato de outra conta"), divergente);

    const imp = await importarExtrato(tenantId, user.id, empresaId, agencia.id, "jan.ofx", bytes, false);
    const r1 = valor(imp.ok ? { ok: true as const, valor: imp.valor } : { ok: false as const, erro: imp.erro });
    confere("importou 3, recusou a de valor suspeito", r1.importadas === 3 && r1.rejeitadas === 1 && r1.totalNoArquivo === 4, r1);
    const de_novo = await importarExtrato(tenantId, user.id, empresaId, agencia.id, "jan-de-novo.ofx", bytes, false);
    confere("o mesmo arquivo de novo é recusado", !de_novo.ok && de_novo.erro.startsWith("Este arquivo já foi importado"), de_novo);
    const outroArquivo = await importarExtrato(tenantId, user.id, empresaId, agencia.id, "jan-v2.ofx", new TextEncoder().encode(OFX() + "\n"), false);
    confere("arquivo diferente com as mesmas transações: tudo duplicado", outroArquivo.ok && outroArquivo.valor.importadas === 0 && outroArquivo.valor.duplicadas === 3, outroArquivo);

    // Extrato em PDF (Fase 4): o PDF inventado do teste, lido pelo leitor genérico.
    const pdf = new Uint8Array(readFileSync("src/lib/contabil-core/pdf/gabarito/extrato-ficticio.pdf"));
    const contaPdf = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "999", agencia: "0001", numero: "12345", digito: "6" })));
    const pdfOutraConta = await importarExtrato(tenantId, user.id, empresaId, outraConta.id, "ficticio.pdf", pdf, false);
    confere("PDF de outra conta é recusado", !pdfOutraConta.ok && pdfOutraConta.erro.startsWith("Extrato de outra conta"), pdfOutraConta);
    const pdfSemConfirmar = await importarExtrato(tenantId, user.id, empresaId, contaPdf.id, "ficticio.pdf", pdf, false);
    confere("PDF sem o banco no cabeçalho pede confirmação", !pdfSemConfirmar.ok && pdfSemConfirmar.precisaConfirmar === true, pdfSemConfirmar);
    const pdfImportado = await importarExtrato(tenantId, user.id, empresaId, contaPdf.id, "ficticio.pdf", pdf, true);
    confere("PDF confirmado: 3 lançamentos", pdfImportado.ok && pdfImportado.valor.importadas === 3 && pdfImportado.valor.identidadeConfirmada, pdfImportado);
    const saldos = await prisma.coreTransacao.findMany({ where: { agenciaId: contaPdf.id }, orderBy: { ordem: "asc" }, select: { saldoApos: true, dc: true } });
    confere("PDF: saldo após cada lançamento gravado", saldos.map((s) => `${s.dc}${s.saldoApos}`).join(" ") === "C1500 D1460.1 D760.1", saldos);
    const naoExtrato = await importarExtrato(tenantId, user.id, empresaId, contaPdf.id, "x.txt", new TextEncoder().encode("nada"), false);
    confere("arquivo que não é OFX nem PDF é recusado", !naoExtrato.ok && naoExtrato.erro.includes("nem um PDF"), naoExtrato);
    // Sai antes do NEO, para não mudar as contas da fila abaixo.
    await prisma.coreTransacao.deleteMany({ where: { agenciaId: contaPdf.id } });
    await prisma.coreImportacao.deleteMany({ where: { agenciaId: contaPdf.id } });

    // NEO
    const neo = valor(await processarNeo(tenantId, empresaId, { agenciaId: null, mes: "2026-01" }));
    confere("NEO: 1 por regra, 1 por contraparte (CNPJ no NAME), 1 sem regra", neo.associadas === 2 && neo.classificadasPorContraparte === 1 && neo.semRegra === 1, neo);
    const pend = await listarPendencias(tenantId, empresaId, {});
    confere("fila: a pendência traz o motivo do NEO", pend.length === 1 && (pend[0].decisoes[0]?.motivo ?? "").startsWith("Nenhuma regra encontrada"), pend);
    const neo2 = valor(await processarNeo(tenantId, empresaId, { agenciaId: null, mes: null }));
    confere("NEO de novo não duplica nada", neo2.associadas === 0 && neo2.totalPendentes === 1, neo2);

    const manual = valor(await classificarManual(tenantId, empresaId, { transacaoIds: [pend[0].id], contaId: receita.id, descricao: "RECEBIMENTO CLIENTE NOVO", manterHistorico: false }));
    confere("classificação manual", manual.classificadas.length === 1, manual);
    const registros = await prisma.coreRegistro.count({ where: { empresaId, deletedAt: null } });
    confere("6 partidas vivas (3 lançamentos)", registros === 6, registros);

    // Exportação
    const txt = valor(await gerarArquivoDoDominio(tenantId, user.id, empresaId, exportacaoSchema.parse({ mes: "2026-01", formato: "txt" })));
    const linhas = txt.conteudo.replace(/^﻿/, "").trim().split("\r\n");
    confere("TXT do Domínio com 3 linhas", linhas.length === 3, linhas);
    confere("linha da tarifa no layout", linhas[0] === "05/01/2026;1026;5;15,9;;PGTO REF TARIFA BANCÁRIA;;;;", linhas[0]);
    // O histórico gerado pela contraparte já começa com "PGTO REF": o arquivo não repete o prefixo.
    confere("linha do fornecedor pelo CNPJ", linhas[1] === "06/01/2026;2001;5;1200;;PGTO REF ACME FORNECIMENTOS LTDA;;;;", linhas[1]);

    // Cancelar uma classificação e desfazer a importação
    const t1 = await prisma.coreTransacao.findFirstOrThrow({ where: { empresaId, historico: "TARIFA PACOTE SERVICOS", deletedAt: null }, select: { id: true } });
    const canc = valor(await cancelarClassificacao(tenantId, user.id, empresaId, t1.id, "teste"));
    confere("cancelar classificação desfaz as 2 partidas e tira do automático", canc.partidas === 2);
    const neo3 = valor(await processarNeo(tenantId, empresaId, { agenciaId: null, mes: null }));
    confere("o NEO não reclassifica o que um humano desfez", neo3.totalPendentes === 0, neo3);

    const desfeita = valor(await desfazerImportacao(tenantId, user.id, empresaId, r1.importacaoId, "arquivo errado"));
    confere("desfazer a importação apaga as 3 transações e cancela os lançamentos", desfeita.transacoes === 3 && desfeita.lancamentos === 2, desfeita);
    const vivas = await prisma.coreRegistro.count({ where: { empresaId, deletedAt: null } });
    confere("nenhuma partida viva depois de desfazer", vivas === 0, vivas);
    const reimport = await importarExtrato(tenantId, user.id, empresaId, agencia.id, "jan.ofx", bytes, false);
    confere("depois de desfeita, o mesmo arquivo entra de novo", reimport.ok && reimport.valor.importadas === 3, reimport);

    // ── Fase 3: reclassificar, compor, simular, agrupar e classificar criando a regra ──
    valor(await processarNeo(tenantId, empresaId, { agenciaId: null, mes: null }));
    const tTarifa = await prisma.coreTransacao.findFirstOrThrow({ where: { empresaId, historico: "TARIFA PACOTE SERVICOS", deletedAt: null }, select: { id: true } });
    valor(await reclassificar(tenantId, user.id, empresaId, { transacaoId: tTarifa.id, contaId: fornecedor.id, descricao: "TARIFA COBRADA PELO FORNECEDOR", motivo: "conta errada" }));
    const pernasTarifa = await prisma.coreRegistro.findMany({ where: { transacaoId: tTarifa.id, deletedAt: null }, select: { contaId: true, dc: true } });
    confere("reclassificar troca a conta e mantém um par só", pernasTarifa.length === 2 && pernasTarifa.some((p) => p.dc === "D" && p.contaId === fornecedor.id), pernasTarifa);

    const pix = await prisma.coreTransacao.findFirstOrThrow({ where: { empresaId, historico: { startsWith: "PIX EMITIDO" }, deletedAt: null }, select: { id: true } });
    const comp = valor(await obterComposicao(tenantId, empresaId, pix.id));
    const errada = await alterarComposicao(tenantId, user.id, empresaId, {
      transacaoId: pix.id, lancamentoVigenteId: comp.lancamentoVigenteId, motivo: "juros",
      componentes: [{ contaId: fornecedor.id, historico: "PRINCIPAL", valor: dec("1000.00") }, { contaId: tarifa.id, historico: "JUROS", valor: dec("199.99") }],
    });
    confere("composição que não fecha o valor é recusada", !errada.ok);
    valor(await alterarComposicao(tenantId, user.id, empresaId, {
      transacaoId: pix.id, lancamentoVigenteId: comp.lancamentoVigenteId, motivo: "juros",
      componentes: [{ contaId: fornecedor.id, historico: "PRINCIPAL", valor: dec("1000.00") }, { contaId: tarifa.id, historico: "JUROS", valor: dec("200.00") }],
    }));
    confere("composição: dois pares vivos na mesma transação", (await prisma.coreRegistro.count({ where: { transacaoId: pix.id, deletedAt: null } })) === 4);
    const velha = await alterarComposicao(tenantId, user.id, empresaId, { transacaoId: pix.id, lancamentoVigenteId: comp.lancamentoVigenteId, motivo: "x", componentes: [{ contaId: fornecedor.id, historico: "TUDO", valor: dec("1200.00") }] });
    confere("composição sobre uma versão velha é recusada", !velha.ok && velha.erro.startsWith("A classificação mudou"), velha);
    const txtComp = valor(await gerarArquivoDoDominio(tenantId, user.id, empresaId, exportacaoSchema.parse({ mes: "2026-01", formato: "txt" })));
    confere("no Domínio, cada componente sai com o próprio histórico", txtComp.conteudo.includes(";PRINCIPAL;") && txtComp.conteudo.includes(";JUROS;"), txtComp.conteudo);

    const sim = valor(await simularRegra(tenantId, empresaId, { historico: "tarifa pacote", dc: "D", agenciaId: null, contaId: tarifa.id }));
    confere("simulação: a tarifa reclassificada aparece como conflito", sim.contabilizadas === 1 && sim.conflitos === 1 && sim.pendencias === 0, sim);

    const fev = OFX("-FEV").replace(/2026010/g, "2026020").replace("TARIFA PACOTE SERVICOS", "PIX EMITIDO OUTRA IF JOSE").replace("CRED PIX CLIENTE NOVO", "PIX RECEBIDO MARIA");
    const impFev = await importarExtrato(tenantId, user.id, empresaId, agencia.id, "fev.ofx", new TextEncoder().encode(fev.replace("Pagamento Pix 11.222.333/0001-81", "PIX EMITIDO OUTRA IF ANA")), false);
    confere("segundo mês importado", impFev.ok, impFev);
    valor(await processarNeo(tenantId, empresaId, { agenciaId: null, mes: "2026-02" }));
    const fila = await filaAgrupada(tenantId, empresaId, { agenciaId: null, mes: "2026-02" });
    const grupoPix = fila.grupos.find((g) => g.padrao === "pix emitido outra" && g.dc === "D");
    confere("fila agrupada junta os PIX emitidos", grupoPix?.quantidade === 2, fila.grupos.map((g) => [g.padrao, g.dc, g.quantidade]));
    const comRegra = valor(await classificarComRegra(
      tenantId, empresaId,
      { transacaoIds: [grupoPix!.transacaoIds[0]], contaId: fornecedor.id, descricao: "PAGAMENTO VIA PIX", manterHistorico: false },
      { historico: "PIX EMITIDO OUTRA IF", agenciaId: null, manterHistorico: true, aplicarNosSemelhantes: true },
    ));
    confere("classificar criando a regra: 1 marcada + 1 semelhante pelo NEO", comRegra.classificadas.length === 1 && !!comRegra.regraCriada && comRegra.semelhantes === 1, comRegra);
  } finally {
    await prisma.$transaction((tx) => executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: company.id }), { timeout: 60_000 });
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());

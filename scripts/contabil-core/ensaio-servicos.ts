// Ensaio ponta a ponta dos serviços do Contábil Core num banco LOCAL (Fase 2, 09/11/2026).
//
// Cadastra uma empresa inventada, conta bancária, plano, regra e contraparte; importa um OFX
// inventado; roda o NEO; classifica à mão; gera o TXT do Domínio; desfaz a importação e importa de
// novo. No fim apaga tudo pela exclusão da empresa. Nenhum dado real.
//
// Uso (o preload deixa importar os módulos com "server-only" fora do Next):
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-servicos.ts

import { getPrisma } from "../../src/lib/prisma";
import { agenciaSchema, contaSchema, contraparteSchema, exportacaoSchema, regraSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, ligarEmpresa, salvarAgencia, salvarContraparte, salvarRegra } from "../../src/lib/contabil-core/servidor/cadastros";
import { desfazerImportacao, importarOfx } from "../../src/lib/contabil-core/servidor/importacao";
import { cancelarClassificacao, classificarManual, listarPendencias, processarNeo } from "../../src/lib/contabil-core/servidor/neo";
import { gerarArquivoDoDominio } from "../../src/lib/contabil-core/servidor/exportacao";
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
    const divergente = await importarOfx(tenantId, user.id, empresaId, outraConta.id, "jan.ofx", bytes, false);
    confere("extrato de outra conta é recusado", !divergente.ok && divergente.erro.startsWith("Extrato de outra conta"), divergente);

    const imp = await importarOfx(tenantId, user.id, empresaId, agencia.id, "jan.ofx", bytes, false);
    const r1 = valor(imp.ok ? { ok: true as const, valor: imp.valor } : { ok: false as const, erro: imp.erro });
    confere("importou 3, recusou a de valor suspeito", r1.importadas === 3 && r1.rejeitadas === 1 && r1.totalNoArquivo === 4, r1);
    const de_novo = await importarOfx(tenantId, user.id, empresaId, agencia.id, "jan-de-novo.ofx", bytes, false);
    confere("o mesmo arquivo de novo é recusado", !de_novo.ok && de_novo.erro.startsWith("Este arquivo já foi importado"), de_novo);
    const outroArquivo = await importarOfx(tenantId, user.id, empresaId, agencia.id, "jan-v2.ofx", new TextEncoder().encode(OFX() + "\n"), false);
    confere("arquivo diferente com as mesmas transações: tudo duplicado", outroArquivo.ok && outroArquivo.valor.importadas === 0 && outroArquivo.valor.duplicadas === 3, outroArquivo);

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
    const reimport = await importarOfx(tenantId, user.id, empresaId, agencia.id, "jan.ofx", bytes, false);
    confere("depois de desfeita, o mesmo arquivo entra de novo", reimport.ok && reimport.valor.importadas === 3, reimport);
  } finally {
    await prisma.$transaction((tx) => executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: company.id }), { timeout: 60_000 });
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());

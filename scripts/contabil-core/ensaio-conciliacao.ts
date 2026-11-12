// Ensaio da conciliação Razão × extrato (Bloco B, Fase B2, 12/11/2026) num banco LOCAL.
//
// Cadastra uma empresa inventada com a conta bancária ligada à conta contábil, importa um OFX
// inventado e concilia um Razão inventado contra ele: o caminho normal, as recusas das conferências,
// a planilha e o extrato desfeito. No fim apaga tudo pela exclusão da empresa. Nenhum dado real.
//
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-conciliacao.ts
import { randomUUID } from "node:crypto";
import { getPrisma } from "../../src/lib/prisma";
import { proximoNumero } from "../../src/lib/enderecoCurtoNumeracao";
import { agenciaSchema, contaSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, ligarEmpresa, salvarAgencia } from "../../src/lib/contabil-core/servidor/cadastros";
import { desfazerImportacao, importarExtrato } from "../../src/lib/contabil-core/servidor/importacao";
import { conciliarRazaoExtrato } from "../../src/lib/contabil-core/servidor/conciliacao";
import { planilhaDaConciliacao } from "../../src/lib/contabil-core/conciliacao/planilhaDoRelatorio";
import { relatorioParaJson } from "../../src/lib/contabil-core/conciliacao/relatorio";
import type { RazaoConta } from "../../src/lib/contabil-core/conciliacao/razaoTipos";
import { lerXlsx } from "../../src/lib/contabil-core/planilha/xlsx";
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

// Três lançamentos importáveis, em ordem trocada no arquivo, e um de valor suspeito (recusado).
const OFX = `OFXHEADER:100
DATA:OFXSGML

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0756<BRANCHID>1234<ACCTID>98765-4</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260107<TRNAMT>350,00<FITID>C1<MEMO>CRED PIX CLIENTE NOVO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260105<TRNAMT>-15.90<FITID>C2<MEMO>TARIFA PACOTE SERVICOS</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260106<TRNAMT>-1200.00<FITID>C3<MEMO>PIX EMITIDO OUTRA IF</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260108<TRNAMT>-54881.83<FITID>C4<MEMO>18/02/2026 TARIFA COB -1,19 -54.881,83</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1000.00<DTASOF>20260131</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const lanc = (data: string, valorTexto: string, historico: string) => ({ data, lote: "1", historico, contrapartida: "1026", valor: dec(valorTexto) });
const RAZAO: RazaoConta = {
  empresa: "EMPRESA ENSAIO CONCILIACAO LTDA",
  cnpj: "12345678000195",
  periodoInicio: "2026-01-01",
  periodoFim: "2026-01-08",
  contaCodigo: "5",
  contaClassificacao: "1.1.1.01",
  contaDescricao: "BANCO SICOOB",
  lancamentos: [
    lanc("2026-01-05", "-15.90", "TARIFA PACOTE"),
    lanc("2026-01-06", "-1200.00", "PIX FORNECEDOR"),
    lanc("2026-01-07", "350.00", "RECEBIMENTO CLIENTE"),
    lanc("2026-01-07", "-99.99", "PAGAMENTO SEM EXTRATO"),
  ],
  totalDebito: dec("350.00"),
  totalCredito: dec("1315.89"),
};

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } });
  const tenantId = tenant.id;
  const company = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Empresa Ensaio Conciliação LTDA", cnpj: "12.345.678/0001-95" } as never,
    select: { id: true },
  });

  try {
    const empresaId = valor(await ligarEmpresa(tenantId, company.id, "simples_nacional")).id;
    const banco = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "1.1.1.01", descricao: "Banco Sicoob", tipo: "ativo", contaNumero: 5 })));
    const agencia = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "756", agencia: "1234", numero: "98765", digito: "4", contaContabilId: banco.id })));
    const semVinculo = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "ITAU", agencia: "1", numero: "2" })));
    const imp = valor(await importarExtrato(tenantId, user.id, empresaId, agencia.id, "jan.ofx", new TextEncoder().encode(OFX), false));
    confere("extrato inventado importado (3 de 4)", imp.importadas === 3, imp);

    // Caminho normal
    const r = valor(await conciliarRazaoExtrato(tenantId, empresaId, agencia.id, RAZAO, null));
    const json = relatorioParaJson(r);
    confere(
      "3 conciliados, 1 pendência só no razão, diferença explicada",
      json.resumo.conciliados === 3 && json.resumo.pendencias === 1 && json.pendencias[0].tipo === "SO_RAZAO" && json.resumo.diferenca === "-99.99" && json.resumo.diferencaExplicada,
      json.resumo,
    );
    confere("sem avisos: extrato cobre o período e a conta é a vinculada", json.avisos.length === 0, json.avisos);
    confere("movimento do extrato com 2 casas, vindo do MySQL", json.resumo.movimentoExtrato === "-865.90", json.resumo.movimentoExtrato);
    confere("resumo por dia em ordem de data", json.porDia.map((d) => d.data).join() === "2026-01-05,2026-01-06,2026-01-07", json.porDia);
    confere("nome da conta bancária no relatório", json.resumo.contaBancaria === "SICOOB ag. 1234 c/c 98765", json.resumo.contaBancaria);

    const planilha = await planilhaDaConciliacao(r);
    const folhas = lerXlsx(planilha, { folhas: "todas" }).map((f) => f.nome);
    confere("planilha com Resumo, Pendências e Por dia", folhas.join("|") === "Resumo|Pendências|Por dia", folhas);

    // Período maior que o extrato: aviso de cobertura
    const longo = valor(await conciliarRazaoExtrato(tenantId, empresaId, agencia.id, { ...RAZAO, periodoFim: "2026-01-31" }, null));
    confere("período além do extrato gera o aviso de cobertura", longo.avisos.some((a) => a.startsWith("O extrato importado vai de 05/01/2026 a 07/01/2026")), longo.avisos);

    // As três conferências e as recusas
    const outraEmpresa = await conciliarRazaoExtrato(tenantId, empresaId, agencia.id, { ...RAZAO, cnpj: "99888777000166" }, null);
    confere("Razão de outra empresa é recusado", !outraEmpresa.ok && outraEmpresa.erro.startsWith("O razão é de outra empresa (CNPJ 99888777000166"), outraEmpresa);
    const outraConta = await conciliarRazaoExtrato(tenantId, empresaId, agencia.id, { ...RAZAO, contaCodigo: "77", contaClassificacao: "1.1.1.09" }, null);
    confere("Razão de outra conta contábil é recusado", !outraConta.ok && outraConta.erro.startsWith("O razão enviado é da conta 77 - 1.1.1.09"), outraConta);
    const pelaClassificacao = await conciliarRazaoExtrato(tenantId, empresaId, agencia.id, { ...RAZAO, contaCodigo: "77" }, null);
    confere("mesma classificação com outro código reduzido é aceito", pelaClassificacao.ok, pelaClassificacao);
    const naoVinculada = await conciliarRazaoExtrato(tenantId, empresaId, semVinculo.id, RAZAO, null);
    confere("conta sem extrato importado é recusada", !naoVinculada.ok && naoVinculada.erro.startsWith("Não há extrato importado para ITAU ag. 1 c/c 2"), naoVinculada);
    const semPeriodo = await conciliarRazaoExtrato(tenantId, empresaId, agencia.id, { ...RAZAO, periodoFim: null }, null);
    confere("Razão sem período é recusado", !semPeriodo.ok && semPeriodo.erro === "Não encontrei o período no cabeçalho do razão.", semPeriodo);
    const fevereiro = await conciliarRazaoExtrato(tenantId, empresaId, agencia.id, { ...RAZAO, periodoInicio: "2026-02-01", periodoFim: "2026-02-28" }, null);
    confere("mês sem extrato é recusado", !fevereiro.ok && fevereiro.erro.includes("entre 01/02/2026 e 28/02/2026"), fevereiro);
    const agenciaDeFora = await conciliarRazaoExtrato(tenantId, empresaId, randomUUID(), RAZAO, null);
    confere("conta bancária de fora é recusada", !agenciaDeFora.ok && agenciaDeFora.erro === "Conta bancária não encontrada nesta empresa.", agenciaDeFora);
    const empresaDeFora = await conciliarRazaoExtrato(tenantId, randomUUID(), agencia.id, RAZAO, null);
    confere("empresa de fora é recusada", !empresaDeFora.ok, empresaDeFora);
    const outroTenant = await conciliarRazaoExtrato(randomUUID(), empresaId, agencia.id, RAZAO, null);
    confere("empresa de outro tenant é recusada", !outroTenant.ok, outroTenant);

    // Extrato desfeito: as transações apagadas não entram
    valor(await desfazerImportacao(tenantId, user.id, empresaId, imp.importacaoId, "ensaio"));
    const desfeito = await conciliarRazaoExtrato(tenantId, empresaId, agencia.id, RAZAO, null);
    confere("depois de desfazer a importação, não há extrato para conciliar", !desfeito.ok && desfeito.erro.startsWith("Não há extrato importado"), desfeito);
  } finally {
    await prisma.$transaction((tx) => executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: company.id }), { timeout: 60_000 });
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());

// Prepara o Contábil Core no banco LOCAL para ver as telas (09/11/2026): liga o módulo no escritório
// do seed e cria uma empresa inventada ("Padaria Modelo Teste") com plano de contas, conta bancária,
// regras, contraparte e um extrato OFX de janeiro/2026. Pode rodar de novo: reaproveita o cadastro e
// volta as transações para pendentes, sem lançamentos.
// Só dado inventado. O lançador `com-banco-local.mjs` recusa banco que não seja local.
//
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/preparar-demo-local.ts

import { getPrisma } from "../../src/lib/prisma";
import { agenciaSchema, contaSchema, contraparteSchema, regraSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, ligarEmpresa, salvarAgencia, salvarContraparte, salvarRegra } from "../../src/lib/contabil-core/servidor/cadastros";
import { importarExtrato } from "../../src/lib/contabil-core/servidor/importacao";

const prisma = getPrisma();
const CNPJ = "45.723.174/0001-10";

const OFX = `OFXHEADER:100
DATA:OFXSGML

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>0756<BRANCHID>3001<ACCTID>45678-9</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260105<TRNAMT>-39.90<FITID>D1<MEMO>TARIFA PACOTE SERVICOS</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260106<TRNAMT>-2450.00<FITID>D2<MEMO>PIX EMITIDO OUTRA IF<NAME>Pagamento Pix 11.222.333/0001-81</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260107<TRNAMT>1280.50<FITID>D3<MEMO>CRED PIX RECEBIDO<NAME>MERCADO BOM PRECO LTDA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260110<TRNAMT>-890.00<FITID>D4<MEMO>PAGTO BOLETO ENERGIA ELETRICA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260112<TRNAMT>-150.00<FITID>D5<MEMO>PIX EMITIDO<NAME>JOAO DA SILVA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260115<TRNAMT>5320.00<FITID>D6<MEMO>CRED VENDAS CARTAO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260120<TRNAMT>-80.00<FITID>D7<MEMO>PIX EMITIDO OUTRA IF<NAME>MARIA SOUZA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260125<TRNAMT>-95.00<FITID>D8<MEMO>PIX EMITIDO OUTRA IF<NAME>CARLOS LIMA</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>2905.60<DTASOF>20260131</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

function valor<T>(r: { ok: true; valor: T } | { ok: false; erro: string }, aceitar = false): T | null {
  if (r.ok) return r.valor;
  if (aceitar) return null;
  throw new Error(r.erro);
}

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } });
  const tenantId = tenant.id;
  await prisma.tenantModule.upsert({
    where: { tenantId_moduleCode: { tenantId, moduleCode: "contabil_core" } },
    create: { tenantId, moduleCode: "contabil_core", enabled: true },
    update: { enabled: true },
  });

  let company = await prisma.company.findFirst({ where: { tenantId, cnpj: CNPJ }, select: { id: true } });
  company ??= await prisma.company.create({
    data: { tenantId, name: "Padaria Modelo Teste LTDA", cnpj: CNPJ, taxRegimeKind: "SIMPLES_NACIONAL" } as never,
    select: { id: true },
  });
  const ligada = await prisma.coreEmpresa.findFirst({ where: { companyId: company.id }, select: { id: true } });
  const empresaId = ligada?.id ?? valor(await ligarEmpresa(tenantId, company.id, "simples_nacional"))!.id;

  const conta = async (codigo: string, descricao: string, tipo: string, contaNumero: number | null, tipoSa = "A") => {
    const existe = await prisma.corePlanoConta.findFirst({ where: { empresaId, codigo, deletedAt: null }, select: { id: true } });
    return existe?.id ?? valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo, descricao, tipo, contaNumero, tipoSa })))!.id;
  };
  await conta("1", "Ativo", "ativo", null, "S");
  const banco = await conta("1.1.1.02", "Sicoob c/c 45678-9", "ativo", 12);
  const tarifas = await conta("3.4.2.05", "Despesas bancárias", "despesa", 1026);
  const energia = await conta("3.4.1.10", "Energia elétrica", "despesa", 1040);
  const fornecedores = await conta("2.1.1.01", "Fornecedores", "passivo", 2001);
  const clientes = await conta("1.1.2.01", "Clientes", "ativo", 101);
  const vendas = await conta("3.1.1.01", "Receita de vendas", "receita", 3001);

  const agencia =
    (await prisma.coreAgencia.findFirst({ where: { empresaId, agencia: "3001" }, select: { id: true } }))?.id ??
    valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "756", agencia: "3001", numero: "45678", digito: "9", contaContabilId: banco })))!.id;

  valor(await salvarRegra(tenantId, empresaId, null, regraSchema.parse({ contaId: tarifas, descricao: "Tarifa bancária", historico: "TARIFA PACOTE", dc: "D" })), true);
  valor(await salvarRegra(tenantId, empresaId, null, regraSchema.parse({ contaId: energia, descricao: "Pagamento de energia elétrica", historico: "ENERGIA ELETRICA", dc: "D" })), true);
  valor(await salvarRegra(tenantId, empresaId, null, regraSchema.parse({ contaId: vendas, descricao: "Vendas em cartão", historico: "VENDAS CARTAO", dc: "C" })), true);
  valor(await salvarContraparte(tenantId, user.id, empresaId, null, contraparteSchema.parse({ tipo: "fornecedor", documento: "11.222.333/0001-81", razaoSocial: "Moinho Trigo Bom Ltda", contaContabilId: fornecedores })), true);
  valor(await salvarContraparte(tenantId, user.id, empresaId, null, contraparteSchema.parse({ tipo: "cliente", documento: "22.333.444/0001-05", razaoSocial: "Mercado Bom Preço Ltda", contaContabilId: clientes })), true);

  // Recomeço: a demonstração volta com todas as transações pendentes, sem lançamentos nem decisões.
  await prisma.coreNeoDecisao.deleteMany({ where: { empresaId } });
  await prisma.coreRegistro.deleteMany({ where: { empresaId } });
  // Regras criadas pelos testes de tela saem; as três da demonstração ficam.
  await prisma.coreRegra.deleteMany({ where: { empresaId, historico: { notIn: ["TARIFA PACOTE", "ENERGIA ELETRICA", "VENDAS CARTAO"] } } });
  await prisma.coreTransacao.updateMany({ where: { empresaId, deletedAt: null }, data: { status: "pendente", autoRecusadoEm: null, autoRecusadoPorId: null } });

  const r = await importarExtrato(tenantId, user.id, empresaId, agencia, "sicoob-jan-2026.ofx", new TextEncoder().encode(OFX), false);
  console.log(r.ok ? `extrato: ${r.valor.importadas} importadas` : `extrato: ${r.erro}`);
  console.log(`pronto: /contabil-core?empresa=${empresaId}`);
}

main().finally(() => prisma.$disconnect());

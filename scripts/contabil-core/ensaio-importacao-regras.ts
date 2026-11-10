// Ensaio da importação de regras por planilha (Fase 3b, 10/11/2026), no banco local.
// Cria uma empresa de teste, analisa e confirma um modelo inventado e apaga tudo no fim.
//
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-importacao-regras.ts
import ExcelJS from "exceljs";
import { getPrisma } from "../../src/lib/prisma";
import { agenciaSchema, contaSchema, regraSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, ligarEmpresa, salvarAgencia, salvarRegra } from "../../src/lib/contabil-core/servidor/cadastros";
import { analisarRegras, confirmarRegras } from "../../src/lib/contabil-core/servidor/importacaoRegras";
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

async function planilha(linhas: (string | number | null)[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Regras");
  ws.addRow(["Modelo de regras do escritório"]);
  ws.addRow(["DEBITO", "CREDITO", "HITORICO CONTABIL", "PADRAO DO EXTRATO", "BANCO", "COPIAR DO EXTRATO"]);
  for (const l of linhas) ws.addRow(l);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } });
  const tenantId = tenant.id;
  const company = await prisma.company.create({ data: { tenantId, name: "Empresa Ensaio Regras LTDA", cnpj: "12.345.678/0001-95" } as never, select: { id: true } });
  try {
    const empresaId = valor(await ligarEmpresa(tenantId, company.id, "simples_nacional")).id;
    const tarifa = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "3.4.2.05", descricao: "Tarifas bancárias", tipo: "despesa", contaNumero: 1026 })));
    const receita = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "3.1.1.01", descricao: "Receita", tipo: "receita", contaNumero: 3001 })));
    const banco = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "1.1.1.01", descricao: "Banco", tipo: "ativo", contaNumero: 5 })));
    const agencia = valor(await salvarAgencia(tenantId, empresaId, null, agenciaSchema.parse({ bancoSigla: "756", agencia: "1234", numero: "98765", digito: "4", contaContabilId: banco.id })));
    valor(await salvarRegra(tenantId, empresaId, null, regraSchema.parse({ contaId: tarifa.id, descricao: "TARIFA BANCARIA", historico: "TARIFA PACOTE", dc: "D" })));
    valor(await salvarRegra(tenantId, empresaId, null, regraSchema.parse({ contaId: tarifa.id, descricao: "ALUGUEL", historico: "ALUGUEL LOJA", dc: "D" })));
    void receita;

    const arquivo = await planilha([
      [1026, null, "TARIFA BANCARIA", "TARIFA PACOTE", "", "NÃO"], // igual à existente → duplicada
      [3001, null, "ALUGUEL PAGO", "ALUGUEL LOJA", "", ""], // existente com outra conta → conflito
      [null, 3001, "RECEBIMENTO", "PIX RECEBIDO", "Todos os bancos", ""], // pronta
      [null, 3001, "RECEBIMENTO", "PIX RECEBIDO", "", ""], // repetida no arquivo → duplicada
      [9999, null, "SEM CONTA", "PADRAO X", "", ""], // conta inexistente → inválida
      [1026, null, "TARIFA ITAU", "TARIFA ITAU", "ITAU", ""], // banco no arquivo → inválida
      [1026, 3001, "DOIS LADOS", "PADRAO Y", "", ""], // inválida
    ]);
    const previa = valor(await analisarRegras(tenantId, user.id, empresaId, arquivo, "regras.xlsx", "arquivo"));
    confere("prévia: 1 pronta, 2 duplicadas, 1 conflito, 3 inválidas",
      previa.prontas === 1 && previa.duplicadas === 2 && previa.conflitos === 1 && previa.invalidas === 3, previa.itens.map((i) => [i.linha, i.status, i.motivo]));
    confere("prévia não grava nada", (await prisma.coreRegra.count({ where: { empresaId, deletedAt: null } })) === 2);

    const outro = await planilha([[null, 3001, "RECEBIMENTO", "PIX RECEBIDO", "", ""]]);
    const comOutroArquivo = await confirmarRegras(tenantId, user.id, empresaId, outro, "outro.xlsx", "arquivo", previa.comprovante);
    confere("comprovante de outro arquivo é recusado", !comOutroArquivo.ok && comOutroArquivo.erro.includes("não é o mesmo"), comOutroArquivo);
    const comOutroBanco = await confirmarRegras(tenantId, user.id, empresaId, arquivo, "regras.xlsx", "todos", previa.comprovante);
    confere("comprovante com outra escolha de banco é recusado", !comOutroBanco.ok, comOutroBanco);
    const falso = await confirmarRegras(tenantId, user.id, empresaId, arquivo, "regras.xlsx", "arquivo", previa.comprovante.replace(/.$/, "x"));
    confere("comprovante adulterado é recusado", !falso.ok && falso.erro.includes("inválida"), falso);

    const confirmado = valor(await confirmarRegras(tenantId, user.id, empresaId, arquivo, "regras.xlsx", "arquivo", previa.comprovante));
    confere("confirmação grava só a pronta", confirmado.importadas === 1, confirmado);
    const nova = await prisma.coreRegra.findFirst({ where: { empresaId, historico: "PIX RECEBIDO", deletedAt: null } });
    confere("regra global, automática, a crédito na conta 3001", !!nova && nova.agenciaId === null && nova.tipo === "automatica" && nova.dc === "C" && nova.contaId === receita.id, nova);

    const deNovo = await confirmarRegras(tenantId, user.id, empresaId, arquivo, "regras.xlsx", "arquivo", previa.comprovante);
    confere("a mesma prévia não serve de novo (o cadastro mudou)", !deNovo.ok && deNovo.erro.includes("mudaram"), deNovo);

    const porAgencia = valor(await analisarRegras(tenantId, user.id, empresaId, arquivo, "regras.xlsx", agencia.id));
    confere("com a conta bancária escolhida, a linha do ITAU deixa de ser inválida e tudo vai para a agência",
      porAgencia.itens.every((i) => i.agenciaId === agencia.id) && porAgencia.itens[5].status === "pronta", porAgencia.itens.map((i) => [i.linha, i.status]));
    const semAgencia = await analisarRegras(tenantId, user.id, empresaId, arquivo, "regras.xlsx", "00000000-0000-0000-0000-000000000000");
    confere("agência de fora é recusada", !semAgencia.ok && semAgencia.erro.includes("indisponível"), semAgencia);
    const naoPlanilha = await analisarRegras(tenantId, user.id, empresaId, new TextEncoder().encode("x"), "regras.csv", "arquivo");
    confere("arquivo que não é xlsx/xls é recusado", !naoPlanilha.ok && naoPlanilha.erro.includes("XLSX ou XLS"), naoPlanilha);
  } finally {
    await prisma.$transaction((tx) => executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: company.id }), { timeout: 60_000 });
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());

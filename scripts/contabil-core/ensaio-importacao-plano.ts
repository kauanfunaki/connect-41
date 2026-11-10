// Ensaio da importação do plano de contas por planilha num banco LOCAL (Fase 3b, 10/11/2026).
//
// Cadastra uma empresa inventada com três contas (uma com lançamento) e uma faixa de classificação,
// importa um CSV inventado com hierarquia fora de ordem, conta existente atualizada, tipo pela faixa,
// ancestral ausente, nível máximo e numeração automática, e confere o banco. No fim apaga tudo pela
// exclusão da empresa. Nenhum dado real.
//
// Uso (o preload deixa importar os módulos com "server-only" fora do Next):
//   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-importacao-plano.ts

import { randomUUID } from "node:crypto";
import { getPrisma } from "../../src/lib/prisma";
import { proximoNumero } from "../../src/lib/enderecoCurtoNumeracao";
import { contaSchema } from "../../src/lib/contabil-core/entradas";
import { criarConta, ligarEmpresa } from "../../src/lib/contabil-core/servidor/cadastros";
import { importarPlano } from "../../src/lib/contabil-core/servidor/importacaoPlano";
import { agenciaChave } from "../../src/lib/contabil-core/motor/chaves";
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

const CSV = [
  "Plano de contas - Empresa Ensaio",
  "",
  "codigo,descricao,tipo,tipo_sa,conta_numero",
  "1.1.1,Caixa,ativo,A,",
  "1,Ativo renomeado,ativo,A,",
  "1.1,Ativo Circulante,ativo,A,",
  "2,Passivo,receita,A,",
  "4.1,Despesa pela faixa,,A,",
  "4,Despesas,,A,",
  "5.1,Sem a conta 5,ativo,A,",
  "1.1.1.1.1.1,Nível seis,ativo,A,",
  "3.1,Filha de conta existente,receita,A,",
  "1.2,Número grande,ativo,A,99999999999",
  "1.1,Repetida no arquivo,ativo,A,",
  "",
].join("\r\n");

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const tenantId = tenant.id;
  const company = await prisma.company.create({
    data: { tenantId, number: await proximoNumero(prisma, "empresa", tenantId), name: "Empresa Ensaio Plano LTDA", cnpj: "12.345.678/0001-95" } as never,
    select: { id: true },
  });

  try {
    const empresaId = valor(await ligarEmpresa(tenantId, company.id, "simples_nacional")).id;
    valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "1", descricao: "Ativo", tipo: "ativo", contaNumero: 10 })));
    const passivo = valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "2", descricao: "Passivo", tipo: "passivo", contaNumero: 20 })));
    valor(await criarConta(tenantId, empresaId, contaSchema.parse({ codigo: "3", descricao: "Receita", tipo: "receita", contaNumero: 15 })));
    await prisma.corePlanoFaixa.create({ data: { tenantId, empresaId, tipo: "despesa", codigoDe: "4", codigoAte: "4.9" } });
    // Um lançamento na conta 2: a reimportação não pode mudar o tipo dela.
    const agencia = await prisma.coreAgencia.create({
      data: { tenantId, empresaId, bancoSigla: "999", agencia: "0001", numero: "1", chave: agenciaChave({ bancoSigla: "999", agencia: "0001", numero: "1" }) },
    });
    await prisma.coreRegistro.create({
      data: {
        tenantId, empresaId, lancamentoId: randomUUID(), contaId: passivo.id, agenciaId: agencia.id, descricao: "X", historico: "X",
        historicoExtrato: "X", dc: "D", tipoRegra: "manual", valor: "1.00", dataLancamento: new Date("2026-01-05T00:00:00Z"),
      },
    });

    const bytes = new TextEncoder().encode(CSV);
    const deOutro = await importarPlano("tenant-que-nao-existe", empresaId, bytes, "plano.csv");
    confere("empresa de outro escritório some", !deOutro.ok && deOutro.erro === "Empresa não encontrada no Contábil Core.", deOutro);
    const semCabecalho = await importarPlano(tenantId, empresaId, new TextEncoder().encode("a,b\n1,2\n"), "plano.csv");
    confere("planilha sem cabeçalho é recusada", !semCabecalho.ok && semCabecalho.erro.startsWith("Cabeçalho não encontrado"), semCabecalho);

    // Como no original: com uma linha de título antes, o Sniffer não decide e vale a vírgula; o mesmo
    // arquivo com ";" não acha o cabeçalho.
    const comPontoEVirgula = await importarPlano(tenantId, empresaId, new TextEncoder().encode(CSV.replaceAll(",", ";")), "plano.csv");
    confere("ponto e vírgula com linha de título: cabeçalho não encontrado, como no original", !comPontoEVirgula.ok && comPontoEVirgula.erro.startsWith("Cabeçalho não encontrado"), comPontoEVirgula);

    const r = valor(await importarPlano(tenantId, empresaId, bytes, "Plano.CSV"));
    confere("números da importação", r.importadas === 5 && r.atualizadas === 1 && r.duplicadas === 2, r);
    const erros = Object.fromEntries(r.erros.map((e) => [e.codigo, e]));
    confere("nível máximo", erros["1.1.1.1.1.1"]?.erro === "Nível máximo de hierarquia excedido (5).", r.erros);
    confere("ancestral ausente", erros["5.1"]?.erro === "Conta ancestral '5' não encontrada no plano ou no lote.", r.erros);
    confere("tipo de conta movimentada não muda, com aviso", !!erros["2"]?.erro.includes("já tem movimentação contábil"), r.erros);
    confere("número fora do limite do banco vira erro da linha", erros["1.2"]?.linha === 13 && erros["1.2"].erro.startsWith("Número da conta fora do limite"), r.erros);
    confere("erros na ordem do original", r.erros.map((e) => e.codigo).join(" ") === "2 5.1 1.1.1.1.1.1 1.2", r.erros.map((e) => e.codigo));
    confere("mudanças para a auditoria", r.mudancas.criadas.length === 5 && r.mudancas.atualizadas.length === 1 && r.mudancas.atualizadas[0].depois.descricao === "Ativo renomeado", r.mudancas);

    const contas = await prisma.corePlanoConta.findMany({
      where: { tenantId, empresaId, deletedAt: null },
      select: { id: true, codigo: true, descricao: true, tipo: true, tipoSa: true, contaNumero: true, paiId: true, codigoAtivo: true },
    });
    const porCodigo = Object.fromEntries(contas.map((c) => [c.codigo, c]));
    const porId = Object.fromEntries(contas.map((c) => [c.id, c]));
    const pai = (codigo: string) => (porCodigo[codigo]?.paiId ? porId[porCodigo[codigo].paiId!]?.codigo : null);
    confere("8 contas vivas", contas.length === 8, contas.map((c) => c.codigo));
    confere("hierarquia fora de ordem montada", pai("1.1.1") === "1.1" && pai("1.1") === "1" && pai("4.1") === "4" && pai("3.1") === "3" && pai("4") === null);
    confere("pais viram sintéticas (inclusive as existentes)", ["1", "1.1", "3", "4"].every((c) => porCodigo[c].tipoSa === "S") && porCodigo["1.1.1"].tipoSa === "A");
    confere("tipo pela faixa da empresa", porCodigo["4"].tipo === "despesa" && porCodigo["4.1"].tipo === "despesa");
    confere(
      "numeração automática depois do maior (20), em ordem de profundidade",
      [porCodigo["4"], porCodigo["1.1"], porCodigo["3.1"], porCodigo["4.1"], porCodigo["1.1.1"]].map((c) => c.contaNumero).join(" ") === "21 22 23 24 25",
      contas.map((c) => [c.codigo, c.contaNumero]),
    );
    confere("existente atualizada", porCodigo["1"].descricao === "Ativo renomeado" && porCodigo["1"].contaNumero === 10);
    confere("movimentada mantém o tipo", porCodigo["2"].tipo === "passivo");
    confere("coluna de unicidade preenchida", contas.every((c) => c.codigoAtivo && c.codigoAtivo.length === 64));

    const deNovo = valor(await importarPlano(tenantId, empresaId, bytes, "plano.csv"));
    confere("reimportar não cria nada", deNovo.importadas === 0, deNovo);

    const xls = await importarPlano(tenantId, empresaId, new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "plano.xls");
    confere(".xls de verdade é recusado como no original", !xls.ok && xls.erro === "XLSX inválido: File is not a zip file", xls);
  } finally {
    await prisma.$transaction((tx) => executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: company.id }), { timeout: 60_000 });
    const sobra = await prisma.company.count({ where: { id: company.id } });
    confere("limpeza: a empresa de ensaio sumiu", sobra === 0);
  }
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());

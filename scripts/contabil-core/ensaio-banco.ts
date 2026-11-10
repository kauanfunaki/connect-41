// Ensaio das tabelas do Contábil Core num banco LOCAL (09/11/2026).
//
// Confere no MySQL de verdade o que os testes sem banco não alcançam:
// - as colunas de unicidade de `motor/chaves.ts` recusam o duplicado vivo e
//   aceitam o mesmo valor depois que a linha sai (soft delete);
// - a exclusão da empresa (`PLANO_DA_EMPRESA`) apaga as tabelas core_* sem
//   esbarrar em chave estrangeira.
// Tudo é criado e apagado aqui, com dado inventado.
//
// Uso: node scripts/local/com-banco-local.mjs npx tsx scripts/contabil-core/ensaio-banco.ts

import { randomUUID } from "node:crypto";
import { getPrisma } from "../../src/lib/prisma";
import { proximoNumero } from "../../src/lib/enderecoCurtoNumeracao";
import { agenciaChave, codigoAtivo, hashAtivo, historicoNormalizado, regraChaveAtiva } from "../../src/lib/contabil-core/motor/chaves";
import { hashDedup } from "../../src/lib/contabil-core/motor/dedup";
import { PLANO_DA_EMPRESA } from "../../src/lib/exclusao/empresa";
import { executarPlano } from "../../src/lib/exclusao/comum";

const prisma = getPrisma();
let falhas = 0;

function confere(nome: string, ok: boolean) {
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}`);
  if (!ok) falhas++;
}

async function recusa(promessa: Promise<unknown>): Promise<boolean> {
  try {
    await promessa;
    return false;
  } catch (e) {
    return (e as { code?: string }).code === "P2002";
  }
}

async function main() {
  const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
  const company = await prisma.company.create({
    data: { tenantId: tenant.id, number: await proximoNumero(prisma, "empresa", tenant.id), name: "Empresa Ensaio Contábil Core LTDA", cnpj: "00.000.000/0001-91" } as never,
    select: { id: true },
  });
  const tenantId = tenant.id;

  const empresa = await prisma.coreEmpresa.create({
    data: { tenantId, companyId: company.id, cnpj: "00000000000191", razaoSocial: "Empresa Ensaio", regimeTributario: "simples_nacional" },
  });
  const empresaId = empresa.id;

  const pai = await prisma.corePlanoConta.create({
    data: { tenantId, empresaId, codigo: "1.1", descricao: "Ativo", tipo: "ativo", tipoSa: "S", codigoAtivo: codigoAtivo({ codigo: "1.1", deletedAt: null }) },
  });
  const conta = await prisma.corePlanoConta.create({
    data: { tenantId, empresaId, codigo: "1.1.1", descricao: "Banco", tipo: "ativo", paiId: pai.id, contaNumero: 5, codigoAtivo: codigoAtivo({ codigo: "1.1.1", deletedAt: null }) },
  });
  confere(
    "plano: código repetido entre contas vivas é recusado",
    await recusa(prisma.corePlanoConta.create({ data: { tenantId, empresaId, codigo: "1.1.1", descricao: "x", tipo: "ativo", codigoAtivo: codigoAtivo({ codigo: "1.1.1", deletedAt: null }) } })),
  );
  // Caixa diferente é outra conta (como no PostgreSQL), apesar da collation do MySQL.
  await prisma.corePlanoConta.create({ data: { tenantId, empresaId, codigo: "1.1.B.x", descricao: "x", tipo: "ativo", codigoAtivo: codigoAtivo({ codigo: "1.1.B.x", deletedAt: null }) } });
  const outraCaixa = await prisma.corePlanoConta.create({ data: { tenantId, empresaId, codigo: "1.1.b.X", descricao: "x", tipo: "ativo", codigoAtivo: codigoAtivo({ codigo: "1.1.b.X", deletedAt: null }) } });
  confere("plano: '1.1.B.x' e '1.1.b.X' convivem", !!outraCaixa.id);

  const agencia = await prisma.coreAgencia.create({
    data: { tenantId, empresaId, bancoSigla: "SICOOB", agencia: "1234", numero: "98765", digito: "4", contaContabilId: conta.id, chave: agenciaChave({ bancoSigla: "SICOOB", agencia: "1234", numero: "98765" }) },
  });

  const regra = { tenantId, empresaId, contaId: conta.id, descricao: "Tarifa", historico: "TARIFA", dc: "D", tipo: "automatica" };
  const hn = historicoNormalizado("TARIFA");
  await prisma.coreRegra.create({ data: { ...regra, agenciaId: null, historicoNormalizado: hn, chaveAtiva: regraChaveAtiva({ ativa: true, deletedAt: null, agenciaId: null, historicoNormalizado: hn }) } });
  confere(
    "regra: duas globais ativas com o mesmo histórico são recusadas",
    await recusa(prisma.coreRegra.create({ data: { ...regra, agenciaId: null, historicoNormalizado: hn, chaveAtiva: regraChaveAtiva({ ativa: true, deletedAt: null, agenciaId: null, historicoNormalizado: hn }) } })),
  );
  await prisma.coreRegra.create({ data: { ...regra, agenciaId: agencia.id, historicoNormalizado: hn, chaveAtiva: regraChaveAtiva({ ativa: true, deletedAt: null, agenciaId: agencia.id, historicoNormalizado: hn }) } });
  confere("regra: a da agência convive com a global", true);
  const hnAcento = historicoNormalizado("TARIFÁ");
  await prisma.coreRegra.create({ data: { ...regra, historico: "TARIFÁ", agenciaId: null, historicoNormalizado: hnAcento, chaveAtiva: regraChaveAtiva({ ativa: true, deletedAt: null, agenciaId: null, historicoNormalizado: hnAcento }) } });
  confere("regra: 'tarifa' e 'tarifá' convivem (acento conta, como no PostgreSQL)", true);

  const importacao = await prisma.coreImportacao.create({ data: { tenantId, empresaId, agenciaId: agencia.id, nomeArquivo: "ensaio.ofx", hashArquivo: "0".repeat(64) } });
  const hash = hashDedup(empresaId, agencia.id, "FITID-1");
  const transacao = { tenantId, empresaId, agenciaId: agencia.id, importacaoId: importacao.id, data: new Date("2026-01-05T00:00:00Z"), valor: "10.50", historico: "TARIFA", dc: "D", hashDedup: hash };
  const t1 = await prisma.coreTransacao.create({ data: { ...transacao, hashAtivo: hashAtivo({ hashDedup: hash, deletedAt: null }) } });
  confere(
    "transação: o mesmo FITID vivo é recusado",
    await recusa(prisma.coreTransacao.create({ data: { ...transacao, hashAtivo: hashAtivo({ hashDedup: hash, deletedAt: null }) } })),
  );
  const agora = new Date();
  await prisma.coreTransacao.update({ where: { id: t1.id }, data: { deletedAt: agora, hashAtivo: hashAtivo({ hashDedup: hash, deletedAt: agora }) } });
  const t2 = await prisma.coreTransacao.create({ data: { ...transacao, hashAtivo: hashAtivo({ hashDedup: hash, deletedAt: null }) } });
  confere("transação: depois de desfeita, o mesmo extrato entra de novo", !!t2.id);

  const lancamentoId = randomUUID();
  const perna = { tenantId, empresaId, transacaoId: t2.id, lancamentoId, contaId: conta.id, agenciaId: agencia.id, descricao: "TARIFA", historico: "TARIFA", historicoExtrato: "TARIFA", tipoRegra: "automatica", valor: "10.50", dataLancamento: new Date("2026-01-05T00:00:00Z") };
  await prisma.coreRegistro.create({ data: { ...perna, dc: "D", chaveAtiva: `${lancamentoId}:D`, chavePadraoAtiva: "D" } });
  await prisma.coreRegistro.create({ data: { ...perna, dc: "C", chaveAtiva: `${lancamentoId}:C`, chavePadraoAtiva: "C" } });
  confere(
    "registro: um segundo par automático na mesma transação é recusado",
    await recusa(prisma.coreRegistro.create({ data: { ...perna, lancamentoId: randomUUID(), dc: "D", chaveAtiva: "x:D", chavePadraoAtiva: "D" } })),
  );
  await prisma.coreNeoDecisao.create({ data: { tenantId, empresaId, transacaoId: t2.id, resultado: "sem_regra", transacaoSemRegra: t2.id } });
  confere(
    "decisão: uma segunda sem_regra aberta para a transação é recusada",
    await recusa(prisma.coreNeoDecisao.create({ data: { tenantId, empresaId, transacaoId: t2.id, resultado: "sem_regra", transacaoSemRegra: t2.id } })),
  );

  // A exclusão da empresa inteira, na ordem do plano, dentro de uma transação.
  const mexido = await prisma.$transaction((tx) => executarPlano(tx as never, PLANO_DA_EMPRESA, { tenantId, id: company.id }));
  confere("exclusão da empresa apaga as tabelas core_* sem esbarrar em chave", (mexido.CoreEmpresa ?? 0) === 1 && (mexido.CoreTransacao ?? 0) === 2);
  const sobra = await prisma.coreEmpresa.count({ where: { id: empresaId } });
  confere("nada da empresa ficou para trás", sobra === 0);

  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exitCode = falhas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());

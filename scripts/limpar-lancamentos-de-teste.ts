// Remove os lançamentos financeiros criados antes da regra do líquido.
//
//   npx tsx --env-file=.env scripts/limpar-lancamentos-de-teste.ts            # dry-run
//   npx tsx --env-file=.env scripts/limpar-lancamentos-de-teste.ts --aplicar
//
// Contexto (10/09/2026): o BPO confirmou que a conta a pagar de NFS-e com
// retenção sai pelo LÍQUIDO. Os lançamentos que já estavam gravados nasceram
// pelo bruto, e o usuário confirmou que são de teste — a regra nova vale só
// para os novos, e estes saem em vez de serem recalculados.
//
// ── Por que apagar em vez de recalcular ─────────────────────────────────────
//
// Recalcular exigiria reler o XML de cada documento para descobrir a retenção,
// e o resultado seria um lançamento com histórico mentiroso: criado numa data,
// com um valor de outra regra. Apagar e deixar a pessoa relançar produz um
// lançamento honesto — e como são de teste, não há trabalho de ninguém dentro.
//
// ── O que ele NÃO toca ──────────────────────────────────────────────────────
//
// Categorias (`FinanceCategory`) e contrapartes (`FinanceCounterparty`) ficam:
// o plano de contas é cadastro, foi montado à mão, e apagá-lo daria trabalho
// de volta a quem o preencheu. O documento fiscal também fica — ele é o acervo,
// não o lançamento. O que muda no documento é o `destination`, que volta de
// LANCADO para PENDENTE: deixá-lo em LANCADO sem lançamento do outro lado faria
// a tela recusar relançar com "já lançado", e o documento ficaria preso.

import { getPrisma } from "../src/lib/prisma";

const aplicar = process.argv.includes("--aplicar");

async function main() {
  const prisma = getPrisma();

  const entradas = await prisma.financeEntry.findMany({
    select: {
      id: true,
      kind: true,
      status: true,
      amount: true,
      competence: true,
      createdAt: true,
      fiscalDocumentId: true,
      company: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const docsLancados = await prisma.fiscalDocument.count({ where: { destination: "LANCADO" } });

  console.log(`lançamentos encontrados: ${entradas.length}`);
  console.log(`documentos com destino LANCADO: ${docsLancados}`);
  for (const e of entradas) {
    const doc = e.fiscalDocumentId ? `doc ${e.fiscalDocumentId.slice(0, 8)}` : "sem documento";
    console.log(
      `  ${e.createdAt.toISOString().slice(0, 10)}  ${e.kind.padEnd(7)} ${e.status.padEnd(11)} ` +
        `${String(e.amount).padStart(12)}  ${e.competence}  ${doc}  ${e.company.name}`
    );
  }

  if (entradas.length === 0 && docsLancados === 0) {
    console.log("\nnada a fazer.");
    return;
  }

  if (!aplicar) {
    console.log("\ndry-run — nada foi alterado. Rode com --aplicar para remover.");
    return;
  }

  // Transacional: um documento voltar para PENDENTE sem o lançamento sair (ou
  // o contrário) deixaria o acervo e o financeiro discordando, que é o estado
  // que ninguém consegue diagnosticar depois.
  const resultado = await prisma.$transaction(async (tx) => {
    const apagados = await tx.financeEntry.deleteMany({});
    const soltos = await tx.fiscalDocument.updateMany({
      where: { destination: "LANCADO" },
      data: { destination: "PENDENTE" },
    });
    return { apagados: apagados.count, soltos: soltos.count };
  });

  console.log(
    `\n${resultado.apagados} lançamento(s) removido(s); ` +
      `${resultado.soltos} documento(s) voltaram para PENDENTE.`
  );
  console.log("A partir daqui, todo lançamento novo de NFS-e com retenção sai pelo líquido.");
}

main();

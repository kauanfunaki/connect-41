// Passa o critério de aceite dos itens antigos do Controle interno da descrição
// para o campo próprio (10/11/2026).
//
//   npx prisma generate
//   npx tsx --env-file=.env scripts/criterio-de-aceite-para-o-campo.ts                            # simulação
//   npx tsx --env-file=.env scripts/criterio-de-aceite-para-o-campo.ts --ensaio --email=<e-mail>  # grava e desfaz
//   npx tsx --env-file=.env scripts/criterio-de-aceite-para-o-campo.ts --aplicar --email=<e-mail> # grava
//
// Antes: a migration 20261110120000_criterio_de_aceite_do_item_tech aplicada
// (`npx prisma migrate deploy`). `--email` é o de quem roda: é o nome que o
// histórico do item e a auditoria mostram.
//
// Pedido do Kauan, 10/11/2026: o critério ficava como texto bruto no começo da
// descrição, do "CRITÉRIO DE ACEITE (data)" até antes de "— Contexto anterior —".
// Para cada item que começa por esse bloco:
// - o bloco vai para o campo "Critério de aceite";
// - a descrição fica só com o que vinha depois de "— Contexto anterior —" (ou
//   da variante curta "— Contexto —"); sem o separador, fica vazia;
// - a version do item sobe e o histórico do item ganha a mudança dos dois
//   campos, com o nome de quem rodou, como numa edição pela tela.
// Item sem o bloco no começo não muda; item que já tem o campo preenchido
// também não — rodar de novo não muda nada. A regra está em
// `src/lib/tech-interno/criterioDeAceite.ts` (`planejarMigracao`).

import { getPrisma } from "../src/lib/prisma";
import { planejarMigracao } from "../src/lib/tech-interno/criterioDeAceite";
import { CAMPO_DO_CRITERIO } from "../src/lib/tech-interno/regras";

const ENSAIO = "ensaio: tudo seria gravado sem erro; a transação foi desfeita";
class Ensaio extends Error {}

const cortar = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

async function executar(): Promise<void> {
  const ensaio = process.argv.includes("--ensaio");
  const aplicar = process.argv.includes("--aplicar");
  const email = process.argv.find((a) => a.startsWith("--email="))?.slice("--email=".length).trim() || null;
  const prisma = getPrisma();

  // O banco compara sem caixa e sem acento: "ACEITE" acha "aceite" também. A
  // regra de verdade (o bloco no começo) é a do planejarMigracao.
  const itens = await prisma.techInternalItem.findMany({
    where: { description: { contains: "ACEITE" } },
    select: { id: true, tenantId: true, title: true, version: true, description: true, acceptanceCriteria: true },
    orderBy: { createdAt: "asc" },
  });
  const tenantDo = new Map(itens.map((i) => [i.id, i.tenantId]));
  const { mover, pular } = planejarMigracao(itens);

  console.log(`Itens com "aceite" na descrição: ${itens.length}.`);
  console.log(`A passar para o campo: ${mover.length} · ficam como estão: ${pular.length}.`);
  if (mover.length) {
    console.log("\nA passar (o critério vai para o campo; a descrição fica com o contexto):");
    for (const m of mover) {
      const nota = !m.comSeparador ? "  — sem “Contexto anterior”: a descrição fica vazia" : "";
      console.log(`  ${cortar(m.title)} · critério com ${m.criterio.length} caracteres · descrição ${m.descricaoDepois ? `com ${m.descricaoDepois.length}` : "vazia"}${nota}`);
    }
  }
  if (pular.length) {
    console.log("\nFicam como estão:");
    for (const p of pular) console.log(`  ${cortar(p.title)} — ${p.motivo}`);
  }

  if (!ensaio && !aplicar) {
    if (mover.length) {
      console.log("\nSimulação: nada foi gravado.");
      console.log("Para gravar e desfazer (prova que grava sem erro): --ensaio --email=<seu e-mail do Connect>");
      console.log("Para gravar de verdade:                           --aplicar --email=<seu e-mail do Connect>");
    }
    return;
  }
  if (!mover.length) { console.log("\nNada a gravar."); return; }
  if (!email) { console.log("\nFalta --email=<seu e-mail do Connect>: é o nome que o histórico do item e a auditoria mostram."); return; }
  const usuarios = await prisma.user.findMany({ where: { email }, select: { id: true, tenantId: true, name: true } });
  if (!usuarios.length) { console.log(`\nNenhum usuário do Connect com o e-mail ${email}. Nada foi gravado.`); return; }
  const atorDo = (tenantId: string) => usuarios.find((u) => u.tenantId === tenantId) ?? usuarios[0]!;
  console.log(`\nNo histórico e na auditoria, quem fez: ${usuarios[0]!.name}.`);

  try {
    await prisma.$transaction(async (tx) => {
      for (const m of mover) {
        const tenantId = tenantDo.get(m.id)!;
        const ator = atorDo(tenantId);
        // Grava só se o item ainda for o que a leitura viu (a version sobe a cada escrita).
        const item = await tx.techInternalItem.updateMany({
          where: { id: m.id, tenantId, version: m.version, acceptanceCriteria: null },
          data: { acceptanceCriteria: m.criterio, description: m.descricaoDepois, version: { increment: 1 } },
        });
        if (item.count !== 1) throw new Error(`"${m.title}" mudou desde a leitura. Nada foi gravado — rode a simulação de novo.`);
        // O mesmo registro de uma edição pela tela: os dois campos, antes e depois.
        await tx.techInternalChange.create({
          data: {
            tenantId, itemId: m.id, version: m.version + 1, authorId: ator.id, authorName: ator.name,
            changes: [
              { field: "Descrição", before: m.descricaoAntes, after: m.descricaoDepois },
              { field: CAMPO_DO_CRITERIO, before: null, after: m.criterio },
            ],
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId, userId: ator.id, actorName: ator.name,
            action: "tech_interno.item.update", entityType: "TechInternalItem", entityId: m.id,
            metadata: { title: m.title, campos: `Descrição, ${CAMPO_DO_CRITERIO}`, origem: "script: critério de aceite da descrição para o campo próprio" },
          },
        });
      }
      if (ensaio) throw new Ensaio(ENSAIO);
    }, { maxWait: 15_000, timeout: 120_000 });
  } catch (err) {
    if (err instanceof Ensaio || (err instanceof Error && err.message === ENSAIO)) {
      console.log(`\n${ENSAIO} (${mover.length} item(ns), cada um com o registro no histórico e a linha na auditoria).`);
      return;
    }
    throw err;
  }
  console.log(`\nGravado: ${mover.length} item(ns) com o critério no campo próprio, cada um com o registro no histórico e a linha na auditoria.`);
}

void (async () => {
  try {
    await executar();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    try { await getPrisma().$disconnect(); } catch { /* sem conexão para fechar */ }
  }
})();

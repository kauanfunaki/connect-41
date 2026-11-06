// Leva para o dia do Quadro do Obsidian a conclusão dos itens do Controle
// interno que vieram de lá já concluídos.
//
//   npx tsx --env-file=.env scripts/datar-itens-do-quadro.ts                            # simulação
//   npx tsx --env-file=.env scripts/datar-itens-do-quadro.ts --ensaio --email=<e-mail>  # grava e desfaz
//   npx tsx --env-file=.env scripts/datar-itens-do-quadro.ts --aplicar --email=<e-mail> # grava
//
// `--email` é o de quem roda: é o nome que a auditoria mostra em cada item.
//
// Pedido do Kauan, 05/11/2026: os concluídos do Quadro.md entram no Controle
// interno, mas a Produtividade não pode contar agosto a outubro como entregue
// no dia da importação. O item criado já Concluído tem a conclusão gravada na
// criação; este script leva essa criação (o item e a primeira mudança do
// histórico) para o meio-dia do dia que a descrição traz em "Concluído no
// Quadro em DD/MM/AAAA". A regra — o que muda e o que fica de fora — está em
// `src/lib/tech-interno/dataDoQuadro.ts`.
//
// Não mexe em item cuja situação mudou no Connect depois de criado, nem em item
// sem a marca do Quadro. Rodar de novo não muda nada.

import { getPrisma } from "../src/lib/prisma";
import { planejarDatas, MARCA_DO_QUADRO } from "../src/lib/tech-interno/dataDoQuadro";

const ENSAIO = "ensaio: tudo seria gravado sem erro; a transação foi desfeita";
class Ensaio extends Error {}

const DIA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const QUANDO = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const cortar = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

async function executar(): Promise<void> {
  const ensaio = process.argv.includes("--ensaio");
  const aplicar = process.argv.includes("--aplicar");
  const email = process.argv.find((a) => a.startsWith("--email="))?.slice("--email=".length).trim() || null;
  const prisma = getPrisma();

  const itens = await prisma.techInternalItem.findMany({
    where: { description: { contains: MARCA_DO_QUADRO } },
    select: {
      id: true, tenantId: true, title: true, status: true, version: true, description: true, createdAt: true, updatedAt: true,
      changes: { select: { id: true, version: true, createdAt: true, changes: true } },
    },
  });
  const tenants = await prisma.tenant.findMany({ where: { id: { in: [...new Set(itens.map((i) => i.tenantId))] } }, select: { id: true, name: true } });
  const escritorio = new Map(tenants.map((t) => [t.id, t.name]));
  const tenantDo = new Map(itens.map((i) => [i.id, i.tenantId]));

  const { datar, pular, jaDatados } = planejarDatas(itens);
  console.log(`Itens com "${MARCA_DO_QUADRO}" na descrição: ${itens.length}.`);
  console.log(`A datar: ${datar.length} · já datados: ${jaDatados} · fora: ${pular.length}.`);

  if (datar.length) {
    const porMes = new Map<string, number>();
    for (const d of datar) porMes.set(d.dia.slice(0, 7), (porMes.get(d.dia.slice(0, 7)) ?? 0) + 1);
    console.log("\nConclusões por mês, depois da correção:");
    for (const [mes, n] of [...porMes].sort()) console.log(`  ${mes.slice(5)}/${mes.slice(0, 4)}: ${n}`);
    console.log("\nA datar (criado em → concluído em):");
    for (const d of datar) console.log(`  ${QUANDO.format(d.criadoEm)} → ${DIA.format(d.para)}  ${cortar(d.title)}${tenants.length > 1 ? `  (${escritorio.get(tenantDo.get(d.id)!)})` : ""}`);
  }
  if (pular.length) {
    console.log("\nFicam como estão:");
    for (const p of pular) console.log(`  ${cortar(p.title)} — ${p.motivo}`);
  }

  if (!ensaio && !aplicar) {
    if (datar.length) {
      console.log("\nSimulação: nada foi gravado.");
      console.log("Para gravar e desfazer (prova que grava sem erro): --ensaio --email=<seu e-mail do Connect>");
      console.log("Para gravar de verdade:                           --aplicar --email=<seu e-mail do Connect>");
    }
    return;
  }
  if (!datar.length) { console.log("\nNada a gravar."); return; }
  if (!email) { console.log("\nFalta --email=<seu e-mail do Connect>: é o nome que a auditoria mostra em cada item."); return; }
  const usuarios = await prisma.user.findMany({ where: { email }, select: { id: true, tenantId: true, name: true } });
  if (!usuarios.length) { console.log(`\nNenhum usuário do Connect com o e-mail ${email}. Nada foi gravado.`); return; }
  const atorDo = (tenantId: string) => usuarios.find((u) => u.tenantId === tenantId) ?? usuarios[0]!;
  console.log(`\nNa auditoria, quem fez: ${usuarios[0]!.name}.`);

  try {
    await prisma.$transaction(async (tx) => {
      for (const d of datar) {
        const tenantId = tenantDo.get(d.id)!;
        // Grava só se o item e a mudança ainda forem o que a leitura viu.
        const item = await tx.techInternalItem.updateMany({
          where: { id: d.id, tenantId, createdAt: d.criadoEm, updatedAt: d.atualizadoEm },
          // O updatedAt vai explícito: sem ele o Prisma poria "agora".
          data: { createdAt: d.para, updatedAt: d.levaAtualizacao ? d.para : d.atualizadoEm },
        });
        const mudanca = await tx.techInternalChange.updateMany({ where: { id: d.mudancaId, tenantId, createdAt: d.mudancaEm }, data: { createdAt: d.para } });
        if (item.count !== 1 || mudanca.count !== 1) throw new Error(`"${d.title}" mudou desde a leitura. Nada foi gravado — rode a simulação de novo.`);
        const ator = atorDo(tenantId);
        await tx.auditLog.create({
          data: {
            tenantId, userId: ator.id, actorName: ator.name,
            action: "tech_interno.item.update", entityType: "TechInternalItem", entityId: d.id,
            metadata: { title: d.title, campos: "Data de conclusão (do Quadro do Obsidian)", de: d.criadoEm.toISOString(), para: d.para.toISOString() },
          },
        });
      }
      if (ensaio) throw new Ensaio(ENSAIO);
    }, { maxWait: 15_000, timeout: 120_000 });
  } catch (err) {
    if (err instanceof Ensaio || (err instanceof Error && err.message === ENSAIO)) {
      console.log(`\n${ENSAIO} (${datar.length} item(ns) e ${datar.length} linha(s) de auditoria).`);
      return;
    }
    throw err;
  }
  console.log(`\nGravado: ${datar.length} item(ns) com a data do Quadro, cada um com a sua linha na auditoria.`);
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

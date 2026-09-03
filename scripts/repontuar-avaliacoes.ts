// Repontua as avaliações de atendimento com a régua de dois segmentos.
//
//   npx tsx --env-file=.env scripts/repontuar-avaliacoes.ts                    # dry-run
//   npx tsx --env-file=.env scripts/repontuar-avaliacoes.ts --aplicar
//   npx tsx --env-file=.env scripts/repontuar-avaliacoes.ts --aplicar --limite 50
//
// **Dry-run é o padrão** e aqui isso importa mais do que de costume: cada
// segmento custa UMA chamada de IA (a nota de escrita), e a maioria dos
// atendimentos tem dois. O dry-run imprime a conta antes de você gastá-la.
//
// ─── Por que repontuar ───────────────────────────────────────────────────────
//
// As avaliações antigas medem a conversa inteira com uma régua só: a recepção
// carregava o SLA de um setor que demorou dois dias, e o setor herdava a
// saudação de quem nunca tratou nada. Decidido em 2026-09-03 repontuar todas em
// vez de conviver com duas réguas na mesma tela — média de coisas medidas
// diferente não quer dizer nada.
//
// ─── Retomável ───────────────────────────────────────────────────────────────
//
// Considera repontuada a conversa cujas avaliações têm todas `handlerLabel`
// preenchido — coisa que a régua antiga nunca gravava. Interrompeu no meio?
// Rode de novo: ele continua de onde parou, sem repetir chamada de IA já paga.
//
// ─── A trava ─────────────────────────────────────────────────────────────────
//
// Recusa rodar se nenhum agente estiver marcado como recepção. Sem isso, a
// barreira nunca aparece, tudo vira TRATATIVA, e o resultado seria a régua
// antiga com nome novo — pior que não rodar, porque pareceria feito.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const aplicar = process.argv.includes("--aplicar");
const iLimite = process.argv.indexOf("--limite");
const limite = iLimite !== -1 ? Number(process.argv[iLimite + 1]) : Infinity;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  // Import tardio: `evaluateConversation` puxa `@/lib/prisma`, que resolve o
  // seu próprio client a partir do mesmo DATABASE_URL. Carregar depois de
  // validar a env evita erro obscuro de inicialização.
  const { evaluateConversation, nomesDaRecepcao } = await import("../src/lib/chatwoot/evaluation");

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  for (const tenant of tenants) {
    const recepcao = await nomesDaRecepcao(tenant.id);

    const conversas = await prisma.chatwootConversation.findMany({
      where: { tenantId: tenant.id, resolvedAt: { not: null }, evaluations: { some: {} } },
      select: { id: true, evaluations: { select: { handlerLabel: true } } },
      orderBy: { resolvedAt: "desc" },
    });
    if (conversas.length === 0) continue;

    const pendentes = conversas.filter((c) => c.evaluations.some((e) => e.handlerLabel === null));

    console.log(`\n=== ${tenant.name} ===`);
    console.log(`  avaliadas: ${conversas.length} · a repontuar: ${pendentes.length}`);
    console.log(`  recepção marcada: ${recepcao.length ? recepcao.join(", ") : "NENHUMA"}`);

    if (pendentes.length === 0) {
      console.log("  nada a fazer.");
      continue;
    }

    if (recepcao.length === 0) {
      console.log("  ! PULADO — marque a recepção em /admin/atendentes antes.");
      console.log("    Sem isso todo atendimento viraria TRATATIVA e a separação não existiria.");
      continue;
    }

    const alvo = pendentes.slice(0, limite === Infinity ? undefined : limite);
    console.log(`  vai repontuar ${alvo.length} conversa(s) — estimativa de ~${alvo.length * 2} chamadas de IA`);

    if (!aplicar) continue;

    let ok = 0;
    let falhou = 0;
    for (const [i, c] of alvo.entries()) {
      try {
        // Apaga antes de recriar: a régua antiga deixou uma linha TRATATIVA por
        // conversa, e uma conversa que agora só tem TRIAGEM ficaria com a linha
        // velha viva, contando para a média de quem não atendeu. O
        // `evaluateConversation` já limpa segmento que sumiu, mas só entre os
        // que ele mesmo escreveu nesta rodada.
        await prisma.conversationEvaluation.deleteMany({ where: { conversationId: c.id } });
        await evaluateConversation(tenant.id, c.id, recepcao);
        ok += 1;
      } catch (err) {
        console.error(`  ! falhou em ${c.id}:`, err instanceof Error ? err.message : err);
        falhou += 1;
      }
      if ((i + 1) % 25 === 0) console.log(`  ... ${i + 1}/${alvo.length}`);
    }
    console.log(`  repontuadas: ${ok} · falhas: ${falhou}`);
  }

  if (!aplicar) {
    console.log("\n--- dry-run, nada foi escrito. Rode com --aplicar para repontuar. ---");
  }
  await prisma.$disconnect();
}

main();

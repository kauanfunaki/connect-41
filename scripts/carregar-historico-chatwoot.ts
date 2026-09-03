// Completa o histórico de mensagens das conversas do Chatwoot.
//
//   npx tsx --env-file=.env scripts/carregar-historico-chatwoot.ts            # dry-run
//   npx tsx --env-file=.env scripts/carregar-historico-chatwoot.ts --aplicar
//
// **Dry-run é o padrão.** Não gasta IA — são chamadas à API do Chatwoot.
//
// ─── Por que ─────────────────────────────────────────────────────────────────
//
// `ensureMessagesLoaded` busca UMA página de `/messages`, e sem o parâmetro
// `before` o Chatwoot devolve as **20 mais recentes**. Conversa mais longa que
// isso fica no banco só com a cauda.
//
// Isso não incomodava enquanto a avaliação media a conversa inteira com uma
// régua só. Passou a incomodar com a separação triagem × tratativa: a recepção
// abre o atendimento com a saudação, e é justamente a abertura que a cauda
// perde. Sem ela, `segmentarAtendimento` vê o setor respondendo primeiro e
// conclui que não houve triagem.
//
// Medido no 41 Tech em 2026-09-03: **304 das 771 conversas resolvidas (39%)
// estavam no teto de 20 mensagens**. Nas truncadas, a primeira mensagem
// guardada era do cliente em 34% dos casos, contra 7% nas completas — a
// assinatura de quem começa no meio.
//
// ─── Ordem ───────────────────────────────────────────────────────────────────
//
// Rodar ANTES de `repontuar-avaliacoes.ts`. Repontuar com o histórico
// truncado dá nota de escrita sobre metade do texto e some com a triagem de
// 39% dos atendimentos — e cada conversa repontuada custa IA, então refazer
// depois é pagar duas vezes.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const aplicar = process.argv.includes("--aplicar");
const iLimite = process.argv.indexOf("--limite");
const limite = iLimite !== -1 ? Number(process.argv[iLimite + 1]) : Infinity;

// Teto de páginas por conversa. 20 páginas = ~400 mensagens; acima disso é
// atendimento anômalo e não vale segurar o script nele.
const MAX_PAGINAS = 20;

// Uma página do Chatwoot vem com 20; conversa com esse tanto no banco é
// candidata a ter mais lá atrás.
const TETO_DA_PAGINA = 20;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  const { loadOlderMessages } = await import("../src/lib/chatwoot/conversations");

  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  for (const tenant of tenants) {
    const conversas = await prisma.chatwootConversation.findMany({
      where: { tenantId: tenant.id, resolvedAt: { not: null } },
      select: { id: true, _count: { select: { messages: true } } },
      orderBy: { resolvedAt: "desc" },
    });
    if (conversas.length === 0) continue;

    const truncadas = conversas.filter((c) => c._count.messages >= TETO_DA_PAGINA);
    console.log(`\n=== ${tenant.name} ===`);
    console.log(`  resolvidas: ${conversas.length} · possivelmente truncadas: ${truncadas.length}`);

    if (truncadas.length === 0) {
      console.log("  nada a fazer.");
      continue;
    }

    const alvo = truncadas.slice(0, limite === Infinity ? undefined : limite);
    console.log(`  vai completar ${alvo.length} conversa(s) — chamadas ao Chatwoot, sem custo de IA`);

    if (!aplicar) continue;

    let novas = 0;
    let completas = 0;
    let falhou = 0;
    let seguidas = 0;

    for (const [i, c] of alvo.entries()) {
      const prefixo = `  [${i + 1}/${alvo.length}] ${c.id.slice(0, 8)} (${c._count.messages} msgs)`;
      process.stdout.write(`${prefixo} ... `);
      let carregadas = 0;
      try {
        // Pagina para trás até a página vir vazia: é a única forma de saber que
        // acabou — o Chatwoot não expõe total de mensagens na conversa.
        for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
          const { loaded } = await loadOlderMessages(tenant.id, c.id);
          if (loaded === 0) break;
          carregadas += loaded;
        }
        novas += carregadas;
        completas += 1;
        seguidas = 0;
        console.log(carregadas > 0 ? `+${carregadas} mensagens` : "já estava completa");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log("FALHOU");
        console.error(`  ! ${c.id}: ${msg}`);
        falhou += 1;
        seguidas += 1;
        if (/unable to authenticate data|unsupported state|SECRETS_ENCRYPTION_KEY/i.test(msg)) {
          console.error("\n  PARADO: é a chave de criptografia, não a conversa.");
          console.error("  As credenciais do Chatwoot também estão cifradas no banco.");
          break;
        }
        if (seguidas >= 3) {
          console.error("\n  PARADO: 3 falhas seguidas — provavelmente a API do Chatwoot, não a conversa.");
          break;
        }
      }
    }

    console.log(`  conversas percorridas: ${completas} · mensagens novas: ${novas} · falhas: ${falhou}`);
  }

  if (!aplicar) {
    console.log("\n--- dry-run, nada foi escrito. Rode com --aplicar. ---");
  } else {
    console.log("\nAgora sim: scripts/repontuar-avaliacoes.ts --aplicar --tudo");
    console.log("(--tudo porque as conversas já repontuadas com o histórico truncado precisam ser refeitas)");
  }
  await prisma.$disconnect();
}

main();

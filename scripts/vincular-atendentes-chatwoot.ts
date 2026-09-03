// Liga cada agente do Chatwoot ao cadastro de usuário correspondente no Connect.
//
//   npx tsx --env-file=.env scripts/vincular-atendentes-chatwoot.ts            # dry-run
//   npx tsx --env-file=.env scripts/vincular-atendentes-chatwoot.ts --aplicar
//
// **Dry-run é o padrão.**
//
// Para que serve: a Avaliação de Atendimentos agrupa por `user:<id>` quando o
// agente tem vínculo, e por nome quando não tem. Com vínculo, a mesma pessoa
// aparecendo sob dois agentes do Chatwoot (renomeada, reconvidada, conta em
// outro canal) cai num card só — que é o que "cada usuário tem um card"
// significa na prática. Ver `chaveDoAtendente` em src/lib/chatwoot/evaluation.ts.
//
// ─── Só casamento exato ──────────────────────────────────────────────────────
//
// O nome é comparado normalizado (espaço colapsado, minúsculas), e **nada
// além disso**. Nada de aproximação por sobrenome ou primeiro nome: nesta base
// existem "Debora Souza" no Chatwoot e "Débora Leite" no cadastro, que podem
// muito bem ser duas pessoas. Vincular errado credita o atendimento de alguém
// à ficha de outro — e isso é avaliação de desempenho de gente real.
//
// O que não casar sai listado para ser resolvido à mão em /admin/atendentes,
// que é a tela feita exatamente para isso.
//
// Nunca sobrescreve vínculo existente: quem já foi ligado à mão fica como está.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { normalizarNomeAtendente } from "../src/lib/chatwoot/evaluation";

const aplicar = process.argv.includes("--aplicar");
const TENANT_41_TECH = "11a68cef-dbc0-4377-a54a-5071ffa59747";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  const [agentes, usuarios] = await Promise.all([
    prisma.chatwootAgentLink.findMany({
      where: { tenantId: TENANT_41_TECH },
      select: { id: true, chatwootAgentId: true, chatwootAgentName: true, linkedUserId: true },
      orderBy: { chatwootAgentName: "asc" },
    }),
    prisma.user.findMany({
      where: { tenantId: TENANT_41_TECH },
      select: { id: true, name: true, email: true },
    }),
  ]);

  // Nome ambíguo entre dois cadastros não vira vínculo automático: escolher um
  // dos dois é exatamente o palpite que este script não deve dar.
  const porNome = new Map<string, { id: string; name: string; email: string }[]>();
  for (const u of usuarios) {
    const chave = normalizarNomeAtendente(u.name);
    if (!chave) continue;
    porNome.set(chave, [...(porNome.get(chave) ?? []), u]);
  }

  const aVincular: { agenteId: string; nome: string; user: { id: string; email: string } }[] = [];
  const jaVinculados: string[] = [];
  const semCadastro: string[] = [];
  const ambiguos: string[] = [];

  for (const a of agentes) {
    if (a.linkedUserId) {
      jaVinculados.push(a.chatwootAgentName);
      continue;
    }
    const chave = normalizarNomeAtendente(a.chatwootAgentName);
    const candidatos = chave ? porNome.get(chave) ?? [] : [];
    if (candidatos.length === 1) {
      aVincular.push({ agenteId: a.id, nome: a.chatwootAgentName, user: candidatos[0]! });
    } else if (candidatos.length > 1) {
      ambiguos.push(`${a.chatwootAgentName} → ${candidatos.map((c) => c.email).join(" / ")}`);
    } else {
      semCadastro.push(a.chatwootAgentName);
    }
  }

  console.log(`${agentes.length} agentes do Chatwoot · ${usuarios.length} usuários no tenant\n`);
  console.log(`A VINCULAR (${aVincular.length}):`);
  for (const v of aVincular) console.log(`  ${v.nome.padEnd(24)} → ${v.user.email}`);

  if (jaVinculados.length) console.log(`\nJÁ VINCULADOS, não tocados (${jaVinculados.length}): ${jaVinculados.join(", ")}`);
  if (ambiguos.length) {
    console.log(`\nAMBÍGUOS — resolver à mão em /admin/atendentes (${ambiguos.length}):`);
    for (const a of ambiguos) console.log(`  ? ${a}`);
  }
  if (semCadastro.length) {
    console.log(`\nSEM CADASTRO COM O MESMO NOME (${semCadastro.length}):`);
    for (const s of semCadastro) console.log(`  - ${s}`);
    console.log("  Estes continuam agrupados pelo nome — funciona, mas não funde duas contas");
    console.log("  da mesma pessoa. Vincular à mão em /admin/atendentes se for o caso.");
  }

  if (!aplicar) {
    console.log("\n--- dry-run, nada foi escrito. Rode com --aplicar para vincular. ---");
    await prisma.$disconnect();
    return;
  }

  for (const v of aVincular) {
    await prisma.chatwootAgentLink.update({ where: { id: v.agenteId }, data: { linkedUserId: v.user.id } });
  }
  console.log(`\n${aVincular.length} vínculos criados.`);
  await prisma.$disconnect();
}

main();

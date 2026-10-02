// Perfis de UM setor só, no banco LOCAL, para conferir gate de setor (02/10/2026).
//
//   node scripts/local/com-banco-local.mjs npx tsx scripts/local/perfis-de-teste.ts
//
// A conta do administrador vê tudo, então não serve para conferir se uma tela
// fecha para quem não é do setor. Estes perfis servem. A senha é a mesma do
// cliente do portal local (LOCAL_PORTAL_PASSWORD, no `.env.localdev`).
// Idempotente. Cria também um colaborador fictício, para a ficha da pessoa.

import { getPrisma } from "../../src/lib/prisma";
import { hashPassword } from "../../src/lib/auth/password";

export const PERFIS = [
  { email: "bpo.teste@exemplo.invalido", nome: "Teste Só BPO", role: "SECTOR_ADMIN", setores: ["bpo"] },
  { email: "dp.teste@exemplo.invalido", nome: "Teste Só DP", role: "SECTOR_USER", setores: ["dp"] },
  { email: "dpcoord.teste@exemplo.invalido", nome: "Teste Coordenação DP", role: "SECTOR_ADMIN", setores: ["dp"] },
] as const;

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "mysql://x@invalido/x");
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("Recusado: só roda no banco local (use scripts/local/com-banco-local.mjs).");
  }
  const senha = process.env.LOCAL_PORTAL_PASSWORD;
  if (!senha) throw new Error("Falta LOCAL_PORTAL_PASSWORD no .env.localdev.");

  const p = getPrisma();
  const tenant = await p.tenant.findUnique({ where: { slug: "41tech" }, select: { id: true } });
  if (!tenant) throw new Error("Rode o seed antes.");
  const passwordHash = await hashPassword(senha);

  for (const perfil of PERFIS) {
    const user = await p.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: perfil.email } },
      update: { role: perfil.role, active: true, passwordHash },
      create: { tenantId: tenant.id, name: perfil.nome, email: perfil.email, passwordHash, role: perfil.role, active: true },
    });
    await p.userSector.deleteMany({ where: { userId: user.id, sectorCode: { notIn: [...perfil.setores] } } });
    for (const sectorCode of perfil.setores) {
      await p.userSector.upsert({
        where: { userId_sectorCode: { userId: user.id, sectorCode } },
        update: {},
        create: { userId: user.id, sectorCode },
      });
    }
    console.log(`perfil ${perfil.email}: ${perfil.role} em ${perfil.setores.join(", ")}`);
  }

  if (!(await p.person.findFirst({ where: { tenantId: tenant.id, name: "Joana Exemplo", type: "COLABORADOR" } }))) {
    await p.person.create({ data: { tenantId: tenant.id, name: "Joana Exemplo", type: "COLABORADOR" } });
    console.log("colaboradora fictícia criada");
  }
  await p.$disconnect();
}

main().catch((e) => {
  console.error(String(e).replace(/mysql:\/\/\S+/g, "[url]"));
  process.exit(1);
});

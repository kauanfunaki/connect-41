import "dotenv/config";
import { getPrisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth/password";

const SECTORS = [
  "tech",
  "dprh",
  "recrutamento",
  "societario",
  "financeiro",
  "fiscal",
  "contabil",
  "bpo",
  "comercial",
  "corretora",
  "gestao",
];

async function main() {
  const prisma = getPrisma();

  // ── Tenant ────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: "41tech" },
    update: {},
    create: {
      name: "41 Tech",
      slug: "41tech",
      cnpj: null,
      plan: "enterprise",
      active: true,
    },
  });
  console.log(`✓ Tenant: ${tenant.name} (${tenant.id})`);

  // ── Admin ─────────────────────────────────────────────────────────────────
  const TEMP_PASSWORD = "Connect41@2026";
  const passwordHash = await hashPassword(TEMP_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "adm6@41bpo.com.br" } },
    update: { passwordHash, role: "ADMIN", active: true },
    create: {
      tenantId: tenant.id,
      name: "Kauan Brasileiro",
      email: "adm6@41bpo.com.br",
      passwordHash,
      role: "ADMIN",
      active: true,
    },
  });
  console.log(`✓ Admin: ${admin.name} <${admin.email}>`);

  // ── Setores do admin ──────────────────────────────────────────────────────
  for (const sectorCode of SECTORS) {
    await prisma.userSector.upsert({
      where: { userId_sectorCode: { userId: admin.id, sectorCode } },
      update: {},
      create: { userId: admin.id, sectorCode },
    });
  }
  console.log(`✓ Setores: ${SECTORS.join(", ")}`);

  console.log("\n─────────────────────────────────────────");
  console.log("  Acesso inicial");
  console.log(`  E-mail : adm6@41bpo.com.br`);
  console.log(`  Senha  : ${TEMP_PASSWORD}`);
  console.log("  ⚠ Troque a senha após o primeiro login");
  console.log("─────────────────────────────────────────\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

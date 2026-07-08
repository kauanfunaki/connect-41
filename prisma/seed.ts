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
  // Senha nunca fica hardcoded no repo. Exigir SEED_ADMIN_PASSWORD no ambiente.
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedPassword || seedPassword.length < 12) {
    throw new Error(
      "Defina SEED_ADMIN_PASSWORD (>= 12 caracteres) no ambiente antes de rodar o seed."
    );
  }
  const passwordHash = await hashPassword(seedPassword);

  // IMPORTANTE: no update NÃO tocamos em passwordHash — rodar o seed de novo num
  // ambiente onde a senha já foi trocada NÃO reseta a senha do admin existente.
  // A senha do seed só é aplicada na criação inicial da conta.
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "adm6@41bpo.com.br" } },
    update: { role: "ADMIN", active: true },
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
  console.log(`  Senha  : (a definida em SEED_ADMIN_PASSWORD)`);
  console.log("  ⚠ Troque a senha após o primeiro login");
  console.log("─────────────────────────────────────────\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

import { bancoFiscalLocal } from "../../src/lib/fiscal/local/ambiente";
import { criarCenarioFiscalLocal } from "../../src/lib/fiscal/local/cenario";
import { getPrisma } from "../../src/lib/prisma";

async function main() {
  if (!bancoFiscalLocal()) throw new Error("Recusado: esperado banco connect41 em localhost:3307.");
  const prisma = getPrisma();
  const usuarios = await prisma.user.findMany({ where: { active: true }, select: { id: true, tenantId: true } });
  const cenario = criarCenarioFiscalLocal();
  for (const usuario of usuarios) await prisma.localFiscalScenario.upsert({
    where: { tenantId_userId: { tenantId: usuario.tenantId, userId: usuario.id } },
    create: { tenantId: usuario.tenantId, userId: usuario.id, data: cenario, favorites: [] },
    update: {},
  });
  console.log(`Cenário fiscal preparado para ${usuarios.length} usuários locais. Dados existentes preservados.`);
  await prisma.$disconnect();
}
main().catch((erro) => { console.error(erro instanceof Error ? erro.message : "Falha no preparo fiscal local."); process.exit(1); });

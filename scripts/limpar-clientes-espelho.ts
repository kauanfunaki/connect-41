// Remove os `ClientGroup` que são cópia do nome da própria empresa.
//
//   npx tsx --env-file=.env scripts/limpar-clientes-espelho.ts            # dry-run
//   npx tsx --env-file=.env scripts/limpar-clientes-espelho.ts --aplicar
//
// De onde vieram: entre 01/09 e 02/09 o campo Cliente foi obrigatório, e o
// agrupamento criava um cliente 1:1 para toda empresa que não dividisse a raiz
// do CNPJ com outra. A importação do Acessórias fez isso 315 vezes — clientes
// com o mesmo nome da única empresa que contêm, que não agrupam nada e enchem a
// listagem de faixas cinza sem informação.
//
// O Kauan reverteu a obrigatoriedade em 02/09: cliente passa a existir só
// quando de fato junta empresas de um mesmo dono. Este script limpa o resíduo.
//
// **Só apaga o que é espelho**: exatamente uma empresa E nome igual ao dela.
// Cliente com nome diferente foi alguém que escolheu o nome, mesmo com uma
// empresa só — fica.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const aplicar = process.argv.includes("--aplicar");
const TENANT_NOME = "41 Tech";

/** Compara ignorando caixa e espaço repetido, que é como os nomes chegam. */
function mesmoNome(a: string, b: string): boolean {
  const n = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return n(a) === n(b);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  const tenant = await prisma.tenant.findFirst({ where: { name: TENANT_NOME }, select: { id: true } });
  if (!tenant) throw new Error(`Tenant "${TENANT_NOME}" não encontrado.`);

  const grupos = await prisma.clientGroup.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true, companies: { select: { id: true, name: true } } },
  });

  const espelhos = grupos.filter(
    (g) => g.companies.length === 1 && mesmoNome(g.name, g.companies[0].name)
  );
  const mantidos = grupos.filter((g) => !espelhos.includes(g));

  console.log(`\n=== LIMPEZA ${aplicar ? "(APLICANDO)" : "(DRY-RUN)"} ===\n`);
  console.log(`clientes hoje          : ${grupos.length}`);
  console.log(`espelhos a apagar      : ${espelhos.length}`);
  console.log(`clientes que ficam     : ${mantidos.length}`);
  console.log("");
  console.log("Ficam (nome — nº de empresas):");
  for (const g of mantidos.sort((a, b) => b.companies.length - a.companies.length)) {
    console.log(`   ${String(g.companies.length).padStart(3)}  ${g.name}`);
  }
  console.log("");

  const comUma = mantidos.filter((g) => g.companies.length === 1);
  if (comUma.length > 0) {
    console.log(`${comUma.length} dos que ficam têm UMA empresa só, mas com nome diferente dela —`);
    console.log("alguém escolheu esse nome, então não apago:");
    for (const g of comUma) console.log(`   "${g.name}" → ${g.companies[0].name}`);
    console.log("");
  }

  if (!aplicar) {
    console.log("Dry-run: nada foi escrito. Rode de novo com --aplicar.");
    await prisma.$disconnect();
    return;
  }

  // Soltar as empresas antes de apagar: `Company.clientGroupId` é SetNull na
  // FK, mas fazer explícito deixa o passo visível se algo falhar no meio.
  const ids = espelhos.map((g) => g.id);
  const soltas = await prisma.company.updateMany({
    where: { tenantId: tenant.id, clientGroupId: { in: ids } },
    data: { clientGroupId: null },
  });
  const apagados = await prisma.clientGroup.deleteMany({ where: { id: { in: ids } } });

  console.log(`empresas soltas  : ${soltas.count}`);
  console.log(`clientes apagados: ${apagados.count}`);
  console.log("\nPronto.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

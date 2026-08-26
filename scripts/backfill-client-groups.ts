// Preenche `companies.clientGroupId` para 100% das empresas, criando os
// `ClientGroup` que faltarem.
//
// Roda DEPOIS da migration 20260824120000_client_group, e fora dela de
// propósito: backfill dentro de migration que falha no meio deixa o
// `migrate deploy` morto com o schema pela metade em produção.
//
//   npx tsx --env-file=.env scripts/backfill-client-groups.ts          # dry-run
//   npx tsx --env-file=.env scripts/backfill-client-groups.ts --aplicar
//
// **Dry-run é o padrão.** Sem `--aplicar` ele só imprime o que faria, e é
// assim que se confere antes de escrever em produção. Ensaiar primeiro numa
// cópia da base.
//
// Idempotente: empresa que já tem grupo não é tocada. Rodar de novo depois de
// cadastrar empresas novas agrupa só as novas.
//
// Regra de agrupamento em src/lib/clientGroups.ts, com testes. Resumo: mesma
// raiz de CNPJ vira um grupo só (caso BLD, 5 estabelecimentos sob 17122471);
// todo o resto vira grupo 1:1. O 1:1 não é burocracia — é o que permite ao
// portal consultar `where clientGroupId = X` sem lista solta de empresa.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { planejarGrupos, type EmpresaParaAgrupar } from "../src/lib/clientGroups";

const aplicar = process.argv.includes("--aplicar");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");

  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  // Só empresas ainda sem grupo — é o que torna o script idempotente.
  const semGrupo = await prisma.company.findMany({
    where: { clientGroupId: null },
    select: { id: true, tenantId: true, name: true, cnpj: true },
    orderBy: { createdAt: "asc" },
  });

  if (semGrupo.length === 0) {
    console.log("Nada a fazer — todas as empresas já têm ClientGroup.");
    await prisma.$disconnect();
    return;
  }

  // Agrupar POR TENANT antes de qualquer coisa: tenant é fronteira de acesso,
  // e duas empresas de tenants diferentes que por acaso dividem raiz de CNPJ
  // (o mesmo cliente atendido por dois escritórios) não podem cair no mesmo
  // grupo. Isto é o que a guarda `mesmoTenant` protege em runtime — aqui o
  // particionamento já impede que o caso surja.
  const porTenant = new Map<string, EmpresaParaAgrupar[]>();
  for (const c of semGrupo) {
    const atual = porTenant.get(c.tenantId);
    const empresa = { id: c.id, name: c.name, cnpj: c.cnpj };
    if (atual) atual.push(empresa);
    else porTenant.set(c.tenantId, [empresa]);
  }

  console.log(
    `${semGrupo.length} empresa(s) sem grupo, em ${porTenant.size} tenant(s).` +
      (aplicar ? "" : " — DRY-RUN, nada será escrito")
  );

  let gruposCriados = 0;
  let empresasVinculadas = 0;
  let gruposMultiCnpj = 0;

  for (const [tenantId, empresas] of porTenant) {
    const grupos = planejarGrupos(empresas);
    console.log(`\ntenant ${tenantId}: ${empresas.length} empresa(s) → ${grupos.length} grupo(s)`);

    for (const g of grupos) {
      const multi = g.empresas.length > 1;
      if (multi) gruposMultiCnpj++;
      // Grupo com mais de uma empresa é o caso interessante e raro: imprimir
      // sempre, para conferência humana antes do --aplicar.
      if (multi) {
        console.log(`  [${g.cnpjRoot}] "${g.name}" ← ${g.empresas.map((e) => e.name).join(" · ")}`);
      }

      gruposCriados++;
      empresasVinculadas += g.empresas.length;
      if (!aplicar) continue;

      // Transação por grupo: se cair no meio, o que já passou fica
      // consistente e o rerun pega de onde parou (idempotência acima).
      await prisma.$transaction(async (tx) => {
        const criado = await tx.clientGroup.create({
          data: { tenantId, name: g.name, cnpjRoot: g.cnpjRoot },
          select: { id: true },
        });
        await tx.company.updateMany({
          // O `tenantId` no where é redundante com os ids, e fica: é a
          // barreira que impede uma empresa de outro tenant ser vinculada
          // caso a lista venha errada.
          where: { id: { in: g.empresas.map((e) => e.id) }, tenantId, clientGroupId: null },
          data: { clientGroupId: criado.id },
        });
      });
    }
  }

  console.log(
    `\n${aplicar ? "Pronto" : "Faria"}: ${gruposCriados} grupo(s) criado(s), ` +
      `${empresasVinculadas} empresa(s) vinculada(s), ` +
      `${gruposMultiCnpj} grupo(s) com mais de um CNPJ.`
  );
  if (!aplicar) console.log("Rode de novo com --aplicar para escrever.");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

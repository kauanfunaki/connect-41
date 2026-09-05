// Renomeia o CÓDIGO do setor `dprh` para `dp` em todos os tenants.
//
//   npx tsx --env-file=.env scripts/renomear-setor-dprh-para-dp.ts            # dry-run
//   npx tsx --env-file=.env scripts/renomear-setor-dprh-para-dp.ts --aplicar
//
// ─── Por que existe ──────────────────────────────────────────────────────────
//
// Diferente de `renomear-setor-bpo.ts`, que mexeu em `label` (texto de
// exibição), este mexe em `code`, que é **chave**. O código do setor está
// denormalizado como string em 11 tabelas, sem foreign key: não existe
// `ON UPDATE CASCADE` para carregar a mudança, então cada tabela precisa ser
// atualizada à mão. Deixar uma para trás não quebra nada em voz alta — só
// esconde a linha do setor novo, o que é pior.
//
// Motivação: `dprh` é nomenclatura que o pessoal do setor não reconhece, e o
// endereço de subworkspace (`dpteste.useconnect.com.br`) deriva do código. Sem
// esta renomeação, `dpteste` resolve para o setor `dp`, que não existe, e a
// página carrega **sem aplicar setor nenhum** — falha silenciosa, pior que erro.
//
// ─── O label também muda ─────────────────────────────────────────────────────
//
// Decidido em 04/09: o rótulo passa de "DP / RH" para "DP", acompanhando o
// código. Só as linhas que ainda têm o texto antigo são tocadas — tenant que
// deliberadamente renomeou o setor no /admin/setores fica como está, mesmo
// critério do `renomear-setor-bpo.ts`.
//
// Os códigos de módulo (`dprh_colaboradores` → `dp_colaboradores`) mudaram no
// catálogo, em código. Não há UPDATE aqui porque `TenantModule` tem **0 linhas**
// com prefixo `dprh_` — os módulos de DP/RH nunca foram habilitados em nenhum
// tenant. Se algum dia tiverem sido, esta conta deixa de fechar e o dry-run
// avisa antes de escrever.
//
// ─── Ordem ───────────────────────────────────────────────────────────────────
//
// Tudo numa transação. As dependentes vêm antes de `sectors` por clareza de
// leitura, não por exigência do banco — não há FK entre elas.

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const DE = "dprh";
const PARA = "dp";
const LABEL_ANTIGO = "DP / RH";
const LABEL_NOVO = "DP";

const aplicar = process.argv.includes("--aplicar");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  // Um setor `dp` já existente noutro tenant faria a renomeação colidir com a
  // unicidade (tenantId, code). Conferir antes vale mais que tratar o erro.
  const jaExiste = await prisma.sector.count({ where: { code: PARA } });
  if (jaExiste > 0) {
    console.log(`! Já existem ${jaExiste} setor(es) com code "${PARA}".`);
    console.log("  Renomear agora pode colidir com @@unique([tenantId, code]).");
    console.log("  Confira antes de seguir — nada foi escrito.");
    await prisma.$disconnect();
    return;
  }

  const contagens = {
    sectors: await prisma.sector.count({ where: { code: DE } }),
    labelAntigo: await prisma.sector.count({ where: { code: DE, label: LABEL_ANTIGO } }),
    userSector: await prisma.userSector.count({ where: { sectorCode: DE } }),
    tag: await prisma.tag.count({ where: { sectorCode: DE } }),
    companyService: await prisma.companyService.count({ where: { sectorCode: DE } }),
    handoffSector: await prisma.handoffSector.count({ where: { sectorCode: DE } }),
    sectorTaskView: await prisma.sectorTaskView.count({ where: { sectorCode: DE } }),
    tenantModulePrefixo: await prisma.tenantModule.count({
      where: { moduleCode: { startsWith: `${DE}_` } },
    }),
  };

  console.log(`Renomear setor "${DE}" → "${PARA}"\n`);
  for (const [tabela, n] of Object.entries(contagens)) {
    console.log("  " + tabela.padEnd(22) + n);
  }

  const total = Object.values(contagens).reduce((a, b) => a + b, 0);
  if (total === 0) {
    console.log("\nNada a fazer — já renomeado, ou nunca existiu.");
    await prisma.$disconnect();
    return;
  }

  if (contagens.tenantModulePrefixo > 0) {
    console.log(
      `\n! ${contagens.tenantModulePrefixo} linha(s) de TenantModule com prefixo "${DE}_".`
    );
    console.log("  O catálogo em código já usa `dp_`, então elas ficariam órfãs.");
    console.log("  Este script as renomeia junto.");
  }

  if (!aplicar) {
    console.log("\n--- dry-run, nada foi escrito. Rode com --aplicar. ---");
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.userSector.updateMany({ where: { sectorCode: DE }, data: { sectorCode: PARA } });
    await tx.tag.updateMany({ where: { sectorCode: DE }, data: { sectorCode: PARA } });
    await tx.companyService.updateMany({ where: { sectorCode: DE }, data: { sectorCode: PARA } });
    await tx.handoffSector.updateMany({ where: { sectorCode: DE }, data: { sectorCode: PARA } });
    await tx.sectorTaskView.updateMany({ where: { sectorCode: DE }, data: { sectorCode: PARA } });

    // `moduleCode` é o código inteiro, não só o prefixo — trocar um a um evita
    // depender de função de string do banco.
    const modulos = await tx.tenantModule.findMany({
      where: { moduleCode: { startsWith: `${DE}_` } },
      select: { id: true, moduleCode: true },
    });
    for (const m of modulos) {
      await tx.tenantModule.update({
        where: { id: m.id },
        data: { moduleCode: PARA + m.moduleCode.slice(DE.length) },
      });
    }

    // Label antes do code: depois da troca de code, `where: { code: DE }` não
    // encontraria mais nada.
    await tx.sector.updateMany({
      where: { code: DE, label: LABEL_ANTIGO },
      data: { label: LABEL_NOVO },
    });
    await tx.sector.updateMany({ where: { code: DE }, data: { code: PARA } });
  });

  const sobrou = await prisma.sector.count({ where: { code: DE } });
  console.log(`\nFeito. Setores ainda com code "${DE}": ${sobrou} (esperado 0).`);
  await prisma.$disconnect();
}

main();

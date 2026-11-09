// Põe o PROCEC como caminho alternativo na etapa "Emissão da taxa / protocolo"
// do roteiro do alvará, nos escritórios que já têm o roteiro (09/11/2026).
//
//   npx prisma generate
//   npx tsx --env-file=.env scripts/roteiro-alvara-procec.ts            # dry-run
//   npx tsx --env-file=.env scripts/roteiro-alvara-procec.ts --aplicar
//
// O `seed-societario` não recria roteiro que já existe, então a mudança do
// seed só alcança escritório novo. Este script leva o mesmo texto aos que já
// têm o tipo "alvara". Muda só a **descrição** da etapa — nenhuma etapa, ordem
// ou item —, em todas as versões do roteiro: é orientação, não estrutura, e
// assim vale também para o processo de alvará que já está andando. A regra de
// não mudar roteiro embaixo de processo em andamento é sobre etapas; aqui não
// há etapa nova.
//
// Idempotente: etapa que já fala do PROCEC fica como está.

import { getPrisma } from "../src/lib/prisma";
import {
  ETAPA_DO_PROTOCOLO_DO_ALVARA,
  TIPO_DO_ALVARA,
  descricaoComProcec,
} from "../src/lib/societario/roteiroDoAlvara";

const aplicar = process.argv.includes("--aplicar");

async function main() {
  const prisma = getPrisma();
  const tipos = await prisma.processType.findMany({
    where: { code: TIPO_DO_ALVARA },
    select: {
      name: true,
      tenant: { select: { name: true } },
      templates: {
        orderBy: { version: "asc" },
        select: {
          version: true,
          published: true,
          steps: {
            where: { label: ETAPA_DO_PROTOCOLO_DO_ALVARA },
            select: { id: true, description: true },
          },
        },
      },
    },
  });
  console.log(`${tipos.length} escritório(s) com o tipo "${TIPO_DO_ALVARA}"\n`);

  let mudariam = 0;
  for (const tipo of tipos) {
    console.log(`${tipo.tenant.name} — ${tipo.name}`);
    if (tipo.templates.length === 0) console.log("   sem roteiro");
    for (const template of tipo.templates) {
      const rotulo = `   v${template.version}${template.published ? " (publicado)" : ""}`;
      if (template.steps.length === 0) {
        // Roteiro editado pelo escritório: a etapa mudou de nome. Fica para
        // uma pessoa decidir onde o caminho entra.
        console.log(`${rotulo}: sem a etapa "${ETAPA_DO_PROTOCOLO_DO_ALVARA}" — nada feito`);
        continue;
      }
      for (const etapa of template.steps) {
        const nova = descricaoComProcec(etapa.description);
        if (nova === null) {
          console.log(`${rotulo}: já tem o PROCEC`);
          continue;
        }
        mudariam++;
        if (!aplicar) {
          console.log(`${rotulo}: ganharia o caminho do PROCEC`);
          continue;
        }
        await prisma.processTemplateStep.update({ where: { id: etapa.id }, data: { description: nova } });
        console.log(`${rotulo}: caminho do PROCEC gravado`);
      }
    }
    console.log("");
  }
  if (!aplicar) {
    console.log(`dry-run — nada foi gravado (${mudariam} etapa(s) mudariam). Rode com --aplicar.`);
  } else {
    console.log(`${mudariam} etapa(s) atualizada(s).`);
  }
}

// Sem fechar a conexão, o processo fica pendurado depois de terminar.
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => getPrisma().$disconnect());

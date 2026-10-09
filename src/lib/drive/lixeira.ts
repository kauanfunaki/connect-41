// A lixeira dos Arquivos esvazia sozinha: o que foi excluído há mais de
// DIAS_NA_LIXEIRA dias some do banco e do disco.
//
// Roda junto do motor de alertas (src/lib/alerts.ts, a cada 15 minutos, só em
// produção). Cada passada apaga um lote limitado — o atraso acumulado (o
// servidor ficou fora do ar, por exemplo) se resolve em algumas passadas sem
// segurar o motor.
//
// Ordem: primeiro o banco, depois o disco. Se o disco falhar, sobra um arquivo
// órfão em storage/drive, que não aparece para ninguém; a ordem contrária
// deixaria uma linha apontando para um arquivo que não existe mais.

import { getPrisma } from "@/lib/prisma";
import { DIAS_NA_LIXEIRA } from "./regras";
import { armazenamentoDoDrive } from "./servidor";

const LOTE_DE_ARQUIVOS = 500;
const LOTE_DE_PASTAS = 50;

export async function esvaziarLixeiraVencida(agora = new Date()): Promise<{ arquivos: number; pastas: number }> {
  const prisma = getPrisma();
  const limite = new Date(agora.getTime() - DIAS_NA_LIXEIRA * 86_400_000);

  // Arquivos excluídos um a um.
  const arquivos = await prisma.driveFile.findMany({
    where: { deletedAt: { lt: limite } },
    select: { id: true, storageKey: true },
    take: LOTE_DE_ARQUIVOS,
  });
  if (arquivos.length > 0) {
    await prisma.driveFile.deleteMany({ where: { id: { in: arquivos.map((a) => a.id) } } });
    await armazenamentoDoDrive.apagarArquivos(arquivos.map((a) => a.storageKey));
  }

  // Pastas excluídas: a subárvore vai junto (o banco apaga em cascata as
  // subpastas e os arquivos de dentro), então os arquivos em disco de toda a
  // subárvore precisam ser listados antes.
  const pastas = await prisma.driveFolder.findMany({
    where: { deletedAt: { lt: limite } },
    select: { id: true, tenantId: true, companyId: true },
    take: LOTE_DE_PASTAS,
  });
  let pastasApagadas = 0;
  for (const raiz of pastas) {
    const doEscopo = await prisma.driveFolder.findMany({
      where: { tenantId: raiz.tenantId, companyId: raiz.companyId },
      select: { id: true, parentId: true },
    });
    const filhos = new Map<string, string[]>();
    for (const p of doEscopo) {
      if (p.parentId) filhos.set(p.parentId, [...(filhos.get(p.parentId) ?? []), p.id]);
    }
    const subarvore: string[] = [];
    const fila = [raiz.id];
    while (fila.length > 0 && subarvore.length <= doEscopo.length) {
      const id = fila.shift()!;
      subarvore.push(id);
      fila.push(...(filhos.get(id) ?? []));
    }
    const dentro = await prisma.driveFile.findMany({
      where: { folderId: { in: subarvore } },
      select: { storageKey: true },
    });
    await prisma.driveFolder.delete({ where: { id: raiz.id } }).catch(() => undefined);
    await armazenamentoDoDrive.apagarArquivos(dentro.map((a) => a.storageKey));
    pastasApagadas++;
  }

  return { arquivos: arquivos.length, pastas: pastasApagadas };
}

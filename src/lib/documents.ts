import { getPrisma } from "@/lib/prisma";
import type { DocumentEntityType } from "@/generated/prisma/enums";

export async function listDocuments(
  tenantId: string,
  entityType: DocumentEntityType,
  entityId: string
) {
  const prisma = getPrisma();
  return prisma.document.findMany({
    where: { tenantId, entityType, entityId },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });
}

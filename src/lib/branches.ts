import { getPrisma } from "@/lib/prisma";

export type BranchRow = {
  id: string;
  name: string;
  active: boolean;
  order: number;
};

export async function getAllBranches(tenantId: string): Promise<BranchRow[]> {
  const prisma = getPrisma();
  return prisma.branch.findMany({
    where: { tenantId },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
}

export async function getActiveBranchOptions(tenantId: string): Promise<{ value: string; label: string }[]> {
  const prisma = getPrisma();
  const branches = await prisma.branch.findMany({
    where: { tenantId, active: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  return branches.map((b) => ({ value: b.id, label: b.name }));
}

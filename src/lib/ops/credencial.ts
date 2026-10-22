import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";

export type ChaveOpsNaTela = { id: string; name: string; createdAt: string; legacy: boolean };
export type CredencialOpsNaTela =
  | { status: "ready"; hasToken: boolean; version: number; keys: ChaveOpsNaTela[] }
  | { status: "migration_required" | "unavailable"; message: string };

/** A indisponibilidade desta integração não derruba o catálogo inteiro. */
export async function credencialOpsNaTela(tenantId: string): Promise<CredencialOpsNaTela> {
  try {
    const db = getPrisma();
    const [credential, activeKeys] = await Promise.all([
      db.opsApiCredential.findUnique({ where: { tenantId }, select: { tokenHash: true, version: true, createdAt: true } }),
      db.opsApiKey.findMany({ where: { tenantId, revokedAt: null }, select: { id: true, name: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }),
    ]);
    const keys: ChaveOpsNaTela[] = activeKeys.map(key => ({ ...key, createdAt: key.createdAt.toISOString(), legacy: false }));
    if (credential?.tokenHash) keys.push({ id: "legacy", name: "Chave anterior", createdAt: credential.createdAt.toISOString(), legacy: true });
    return { status: "ready", hasToken: keys.length > 0, version: credential?.version ?? 0, keys };
  } catch (error) {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "unknown";
    // Não registrar mensagem/objeto do driver: podem conter dados de conexão.
    console.error("[ops/credential] Consulta da configuração indisponível", { code });
    if (code === "P2021" || code === "P2022") {
      return { status: "migration_required", message: "A atualização do Ops Center está pendente no servidor. Conclua a atualização antes de gerenciar a chave. As outras integrações continuam disponíveis." };
    }
    return { status: "unavailable", message: "Não foi possível consultar a chave do Ops Center. Atualize a página para tentar novamente. As outras integrações continuam disponíveis." };
  }
}

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";

export type CredencialOpsNaTela =
  | { status: "ready"; hasToken: boolean; version: number }
  | { status: "migration_required" | "unavailable"; message: string };

/** A indisponibilidade desta integração não derruba o catálogo inteiro. */
export async function credencialOpsNaTela(tenantId: string): Promise<CredencialOpsNaTela> {
  try {
    const credential = await getPrisma().opsApiCredential.findUnique({
      where: { tenantId }, select: { tokenHash: true, version: true },
    });
    return { status: "ready", hasToken: Boolean(credential?.tokenHash), version: credential?.version ?? 0 };
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

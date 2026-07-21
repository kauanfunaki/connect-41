// Resolução de credenciais/conexão do Chatwoot por tenant — mesmo molde de
// resolveCredentials() em src/lib/ai.ts, mas SEM fallback global via env: cada
// tenant tem sua própria conta Chatwoot, não faz sentido uma conta
// compartilhada "padrão" para um dado de negócio de terceiro como este.
import { getPrisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import type { ChatwootCredentials } from "./client";

export async function resolveConnectionCredentials(tenantId: string): Promise<{ connectionId: string; creds: ChatwootCredentials } | null> {
  const prisma = getPrisma();
  const connection = await prisma.chatwootConnection.findFirst({ where: { tenantId, active: true } });
  if (!connection) return null;
  return {
    connectionId: connection.id,
    creds: {
      baseUrl: connection.baseUrl,
      accountId: connection.accountId,
      apiToken: decryptSecret(connection.apiTokenEnc),
    },
  };
}

export async function isChatwootConfigured(tenantId: string): Promise<boolean> {
  return (await resolveConnectionCredentials(tenantId)) !== null;
}

// Busca a conexão pelo id (usado pelo webhook, que identifica a conexão pelo
// path da URL — a autenticação de verdade é a assinatura HMAC, ver
// webhookAuth.ts, não o id em si, que não é secreto).
export async function resolveConnectionById(
  connectionId: string
): Promise<{ tenantId: string; webhookSecret: string; creds: ChatwootCredentials } | null> {
  const prisma = getPrisma();
  const connection = await prisma.chatwootConnection.findUnique({ where: { id: connectionId } });
  if (!connection || !connection.active) return null;
  return {
    tenantId: connection.tenantId,
    webhookSecret: decryptSecret(connection.webhookSecretEnc),
    creds: {
      baseUrl: connection.baseUrl,
      accountId: connection.accountId,
      apiToken: decryptSecret(connection.apiTokenEnc),
    },
  };
}

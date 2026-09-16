// Resolução de credenciais/conexão do Chatwoot por tenant — mesmo molde de
// resolveCredentials() em src/lib/ai.ts, mas SEM fallback global via env: cada
// tenant tem sua própria conta Chatwoot, não faz sentido uma conta
// compartilhada "padrão" para um dado de negócio de terceiro como este.
//
// Desde 16/09 a credencial vem **só** da integração (`TenantIntegration`): as
// colunas antigas da conexão saíram no passo 5 da convergência. Integração
// ausente, desligada ou incompleta é Chatwoot não configurado — a mesma regra
// do SPED, e pelo mesmo motivo: duas fontes para um segredo é como se descobre,
// tarde, que o token trocado numa tela não valia na outra.
//
// A conexão continua sendo quem diz se o Chatwoot está ativo e qual é o id do
// webhook; o que mudou de lugar foi o segredo.
import { getPrisma } from "@/lib/prisma";
import { lerConfig } from "@/lib/integracoes/data";
import { escolherCredencial, type IntegracaoGravada } from "@/lib/integracoes/fonte";
import type { ChatwootCredentials } from "./client";

const CAMPOS_DA_API = ["baseUrl", "accountId", "apiToken"] as const;
const CAMPOS_DO_WEBHOOK = ["webhookSecret"] as const;

/** O que toda leitura de conexão precisa trazer para resolver a credencial. */
export const SELECT_CONEXAO = {
  id: true,
  tenantId: true,
  active: true,
  baseUrl: true,
  accountId: true,
  integrationId: true,
  integration: { select: { enabled: true, configEnc: true, instanceKey: true, label: true } },
} as const;

type ConexaoGravada = {
  id: string;
  integration: { enabled: boolean; configEnc: string } | null;
};

function integracaoDa(c: ConexaoGravada): IntegracaoGravada {
  return c.integration ? { enabled: c.integration.enabled, config: lerConfig(c.integration.configEnc) } : null;
}

function avisarSeIncompleta(conexaoId: string, integracao: IntegracaoGravada) {
  if (integracao?.enabled) {
    console.warn(`[chatwoot] conexão ${conexaoId}: integração ligada e incompleta — Chatwoot fica sem credencial`);
  }
}

/** Credencial de API da conexão, ou `null` quando a integração não a fornece. */
export function credenciaisDaConexao(
  c: ConexaoGravada,
  integracao: IntegracaoGravada = integracaoDa(c)
): ChatwootCredentials | null {
  // Sem fonte antiga: `legado` devolve nada, e a escolha só existe quando a
  // integração está ligada e completa.
  const escolha = escolherCredencial(integracao, CAMPOS_DA_API, () => null);
  if (!escolha) {
    avisarSeIncompleta(c.id, integracao);
    return null;
  }
  return escolha.valores;
}

function segredoDoWebhook(c: ConexaoGravada, integracao: IntegracaoGravada): string | null {
  const escolha = escolherCredencial(integracao, CAMPOS_DO_WEBHOOK, () => null);
  if (!escolha) {
    avisarSeIncompleta(c.id, integracao);
    return null;
  }
  return escolha.valores.webhookSecret;
}

export async function resolveConnectionCredentials(tenantId: string): Promise<{ connectionId: string; creds: ChatwootCredentials } | null> {
  const prisma = getPrisma();
  const connection = await prisma.chatwootConnection.findFirst({
    where: { tenantId, active: true },
    select: SELECT_CONEXAO,
  });
  if (!connection) return null;
  const creds = credenciaisDaConexao(connection);
  return creds ? { connectionId: connection.id, creds } : null;
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
  const connection = await prisma.chatwootConnection.findUnique({
    where: { id: connectionId },
    select: SELECT_CONEXAO,
  });
  if (!connection || !connection.active) return null;
  // Decifrada uma vez só: são dois grupos de campos da mesma config.
  const integracao = integracaoDa(connection);
  const webhookSecret = segredoDoWebhook(connection, integracao);
  const creds = credenciaisDaConexao(connection, integracao);
  // Sem segredo não há como conferir a assinatura: webhook sem credencial é
  // recusado, nunca aceito sem verificação.
  if (!webhookSecret || !creds) return null;
  return { tenantId: connection.tenantId, webhookSecret, creds };
}

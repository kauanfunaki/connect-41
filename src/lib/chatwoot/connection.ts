// Resolução de credenciais/conexão do Chatwoot por tenant — mesmo molde de
// resolveCredentials() em src/lib/ai.ts, mas SEM fallback global via env: cada
// tenant tem sua própria conta Chatwoot, não faz sentido uma conta
// compartilhada "padrão" para um dado de negócio de terceiro como este.
//
// Desde 14/09 a credencial prefere a integração convergida (`TenantIntegration`)
// quando ela está ligada na vitrine, e cai nas colunas antigas da conexão nos
// demais casos — ver `src/lib/integracoes/fonte.ts`. A conexão continua sendo
// quem diz se o Chatwoot está ativo e qual é o id do webhook: o que mudou de
// lugar foi só o segredo.
import { getPrisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { lerConfig } from "@/lib/integracoes/data";
import {
  escolherCredencial,
  type EscolhaDeCredencial,
  type IntegracaoGravada,
} from "@/lib/integracoes/fonte";
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
  apiTokenEnc: true,
  webhookSecretEnc: true,
  integrationId: true,
  integration: { select: { enabled: true, configEnc: true, instanceKey: true, label: true } },
} as const;

type ConexaoGravada = {
  id: string;
  baseUrl: string;
  accountId: string;
  apiTokenEnc: string;
  webhookSecretEnc: string;
  integration: { enabled: boolean; configEnc: string } | null;
};

function integracaoDa(c: ConexaoGravada): IntegracaoGravada {
  return c.integration ? { enabled: c.integration.enabled, config: lerConfig(c.integration.configEnc) } : null;
}

function registrarQueda(conexaoId: string, escolha: EscolhaDeCredencial<string>) {
  if (escolha.fonte === "legado" && escolha.integracaoIncompleta) {
    console.warn(
      `[chatwoot] conexão ${conexaoId}: integração ligada e incompleta — usando as credenciais antigas da conexão`
    );
  }
}

/** Credencial de API da conexão, já decidida a fonte. */
export function credenciaisDaConexao(
  c: ConexaoGravada,
  integracao: IntegracaoGravada = integracaoDa(c)
): ChatwootCredentials {
  // As colunas antigas são NOT NULL: a fonte antiga sempre existe, então a
  // escolha nunca é nula aqui.
  const escolha = escolherCredencial(integracao, CAMPOS_DA_API, () => ({
    baseUrl: c.baseUrl,
    accountId: c.accountId,
    apiToken: decryptSecret(c.apiTokenEnc),
  }))!;
  registrarQueda(c.id, escolha);
  return escolha.valores;
}

function segredoDoWebhook(c: ConexaoGravada, integracao: IntegracaoGravada): string {
  const escolha = escolherCredencial(integracao, CAMPOS_DO_WEBHOOK, () => ({
    webhookSecret: decryptSecret(c.webhookSecretEnc),
  }))!;
  registrarQueda(c.id, escolha);
  return escolha.valores.webhookSecret;
}

export async function resolveConnectionCredentials(tenantId: string): Promise<{ connectionId: string; creds: ChatwootCredentials } | null> {
  const prisma = getPrisma();
  const connection = await prisma.chatwootConnection.findFirst({
    where: { tenantId, active: true },
    select: SELECT_CONEXAO,
  });
  if (!connection) return null;
  return { connectionId: connection.id, creds: credenciaisDaConexao(connection) };
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
  return {
    tenantId: connection.tenantId,
    webhookSecret: segredoDoWebhook(connection, integracao),
    creds: credenciaisDaConexao(connection, integracao),
  };
}

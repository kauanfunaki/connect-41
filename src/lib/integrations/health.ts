import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/integrations/oauth";
import { isGoogleConfigured } from "@/lib/integrations/google";
import { isMicrosoftConfigured } from "@/lib/integrations/microsoft";
import { isTokenExpiringSoon, type IntegrationHealth } from "@/lib/integrations/tokenExpiry";
import type { MeetingProvider } from "@/generated/prisma/enums";

// Estado da conexão de reunião do usuário, pra tela avisar ANTES de ele tentar
// criar uma reunião e descobrir na hora que o token morreu.
//
// Custo: enquanto o token está longe do vencimento, é só um SELECT indexado —
// nenhuma chamada de rede. Perto de vencer, reaproveita getValidAccessToken,
// que já ia renovar de qualquer jeito; a renovação bem-sucedida é gravada e
// serve pra próxima operação. cache() garante uma avaliação por requisição.
//
// LIMITE CONHECIDO: um token revogado no provedor mas ainda dentro da validade
// aparece como OK — só a chamada real revela, e sondar a API a cada
// renderização custaria caro. O caso coberto aqui é o do item da fila: token
// vencido cuja renovação é recusada.
export const getMeetingIntegrationHealth = cache(
  async (tenantId: string, userId: string, provider: MeetingProvider): Promise<IntegrationHealth> => {
    const configured = provider === "GOOGLE" ? isGoogleConfigured() : isMicrosoftConfigured();

    const prisma = getPrisma();
    const account = await prisma.oAuthAccount.findFirst({
      where: { tenantId, userId, provider },
      select: { expiresAt: true },
    });
    if (!account) return "NOT_CONNECTED";

    // Ordem importa: sem credencial no servidor a renovação falharia sempre, e
    // o usuário levaria a culpa por um problema de configuração do ambiente.
    if (!configured) return "NOT_CONFIGURED";

    if (!isTokenExpiringSoon(account.expiresAt)) return "OK";

    const token = await getValidAccessToken(tenantId, userId, provider);
    return token ? "OK" : "NEEDS_RECONNECT";
  },
);

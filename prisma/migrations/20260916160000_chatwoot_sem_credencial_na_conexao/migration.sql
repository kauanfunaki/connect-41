-- Passo 5 da convergência das integrações: o token e o segredo do webhook do
-- Chatwoot vivem só em `tenant_integrations` desde 16/09. Conferido em produção
-- antes: a única conexão tem integração ligada e com os quatro campos.
-- AlterTable
ALTER TABLE `chatwoot_connections` DROP COLUMN `apiTokenEnc`,
    DROP COLUMN `webhookSecretEnc`;

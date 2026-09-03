-- Papel (recepção / automação) passa a viver no NOME do remetente.
--
-- Estava em `chatwoot_agent_links`, e essa tabela só ganha linha para quem já
-- foi **responsável** por uma conversa — o sync a preenche a partir de
-- `assigneeId`. Quem escreve sem nunca ser responsável não entra nela.
--
-- Foi exatamente o caso da conta dona do token da integração: 494 mensagens
-- públicas, nenhuma linha de agente, e portanto invisível na tela onde ela
-- precisava ser marcada como automação.
--
-- O nome é a chave certa porque é assim que o resto do pipeline trabalha: a
-- autoria vem do remetente da mensagem, e é por nome normalizado que
-- `chaveDoAtendente` agrupa.
--
-- ORDEM: cria a tabela, COPIA o que já estava marcado (a recepção configurada
-- em 03/09) e só então derruba as colunas antigas. Derrubar antes de copiar
-- perderia a marcação.

-- CreateTable
CREATE TABLE `chatwoot_sender_roles` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `senderName` VARCHAR(120) NOT NULL,
    `isReception` BOOLEAN NOT NULL DEFAULT false,
    `isAutomation` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `chatwoot_sender_roles_tenantId_senderName_key`(`tenantId`, `senderName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AddForeignKey
ALTER TABLE `chatwoot_sender_roles` ADD CONSTRAINT `chatwoot_sender_roles_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- CopyData: preserva o que já estava marcado antes de as colunas caírem.
-- O nome vai normalizado (minúsculas, espaço colapsado), que é a forma
-- comparada em tempo de execução por `normalizarNomeAtendente`.
INSERT INTO `chatwoot_sender_roles` (`id`, `tenantId`, `senderName`, `isReception`, `isAutomation`, `createdAt`, `updatedAt`)
SELECT UUID(),
       `tenantId`,
       LOWER(TRIM(REGEXP_REPLACE(`chatwootAgentName`, '[[:space:]]+', ' '))),
       MAX(`isReception`),
       MAX(`isAutomation`),
       NOW(3),
       NOW(3)
FROM `chatwoot_agent_links`
WHERE `isReception` = TRUE OR `isAutomation` = TRUE
GROUP BY `tenantId`, LOWER(TRIM(REGEXP_REPLACE(`chatwootAgentName`, '[[:space:]]+', ' ')));

-- AlterTable
ALTER TABLE `chatwoot_agent_links` DROP COLUMN `isAutomation`,
    DROP COLUMN `isReception`;

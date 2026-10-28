-- O banco do zero pelas migrations (lote 5, 28/10/2026). `chatwoot_agent_links`
-- e `conversation_evaluations` entraram na produção sem migration, e a
-- `avaliacao_por_segmento` (logo depois desta) altera as duas. Cria as duas na
-- forma de antes dela: a avaliação com uma linha por conversa (o único em
-- `conversationId`) e sem segmento.
--
-- Na produção as tabelas já existem: IF NOT EXISTS faz desta migration um nada.

CREATE TABLE IF NOT EXISTS `chatwoot_agent_links` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `chatwootAgentId` INTEGER NOT NULL,
    `chatwootAgentName` VARCHAR(120) NOT NULL,
    `linkedUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `chatwoot_agent_links_tenantId_linkedUserId_idx`(`tenantId`, `linkedUserId`),
    UNIQUE INDEX `chatwoot_agent_links_tenantId_chatwootAgentId_key`(`tenantId`, `chatwootAgentId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `chatwoot_agent_links_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `chatwoot_agent_links_linkedUserId_fkey` FOREIGN KEY (`linkedUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `conversation_evaluations` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `score` INTEGER NOT NULL,
    `writingScore` INTEGER NOT NULL,
    `slaScore` INTEGER NOT NULL,
    `reasoning` TEXT NOT NULL,
    `evaluatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `conversation_evaluations_tenantId_evaluatedAt_idx`(`tenantId`, `evaluatedAt`),
    UNIQUE INDEX `conversation_evaluations_conversationId_key`(`conversationId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `conversation_evaluations_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `chatwoot_conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

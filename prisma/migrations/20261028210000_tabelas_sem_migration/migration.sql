-- O banco do zero pelas migrations (lote 5, 28/10/2026). Quatro tabelas do
-- schema que nenhuma migration cria nem altera: o resumo das avaliações de
-- atendimento, as credenciais do BPO (e quem as viu) e as preferências do
-- usuário. Entraram na produção por fora; num banco novo elas faltavam.
--
-- Na produção as tabelas já existem: IF NOT EXISTS faz desta migration um nada.

CREATE TABLE IF NOT EXISTS `agent_evaluation_summaries` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `groupKey` VARCHAR(160) NOT NULL,
    `summary` TEXT NOT NULL,
    `exampleConversationIds` JSON NOT NULL,
    `evaluationCount` INTEGER NOT NULL,
    `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `agent_evaluation_summaries_tenantId_groupKey_key`(`tenantId`, `groupKey`),
    PRIMARY KEY (`id`),
    CONSTRAINT `agent_evaluation_summaries_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bpo_credentials` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `title` VARCHAR(120) NOT NULL,
    `username` VARCHAR(180) NULL,
    `passwordEnc` TEXT NOT NULL,
    `url` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `bpo_credentials_tenantId_companyId_idx`(`tenantId`, `companyId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `bpo_credentials_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `bpo_credentials_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `bpo_credentials_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bpo_credential_views` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `credentialId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `viewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bpo_credential_views_credentialId_idx`(`credentialId`),
    PRIMARY KEY (`id`),
    CONSTRAINT `bpo_credential_views_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `bpo_credential_views_credentialId_fkey` FOREIGN KEY (`credentialId`) REFERENCES `bpo_credentials`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `bpo_credential_views_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_preferences` (
    `userId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `homeWidgets` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `user_preferences_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`userId`),
    CONSTRAINT `user_preferences_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

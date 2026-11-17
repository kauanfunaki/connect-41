-- Chamados: o histórico do Hub como casos para a triagem por IA (17/11/2026).
-- Só acrescenta uma tabela nova.

-- CreateTable
CREATE TABLE `helpdesk_historic_cases` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `source` VARCHAR(20) NOT NULL,
    `externalId` VARCHAR(64) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `teamReplies` JSON NOT NULL,
    `originalCategory` VARCHAR(255) NOT NULL,
    `requesterSector` VARCHAR(120) NULL,
    `priority` VARCHAR(20) NULL,
    `sourceStatus` VARCHAR(30) NOT NULL,
    `openedAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,
    `summary` TEXT NULL,
    `solution` TEXT NULL,
    `tags` JSON NOT NULL,
    `originalCategoryId` VARCHAR(191) NULL,
    `suggestedCategoryId` VARCHAR(191) NULL,
    `finalCategoryId` VARCHAR(191) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PROCESSANDO',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` VARCHAR(300) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `helpdesk_historic_cases_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `helpdesk_historic_cases_reviewedById_idx`(`reviewedById`),
    UNIQUE INDEX `helpdesk_historic_cases_tenantId_source_externalId_key`(`tenantId`, `source`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `helpdesk_historic_cases` ADD CONSTRAINT `helpdesk_historic_cases_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


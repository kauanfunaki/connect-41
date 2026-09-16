-- Aprovação por alçada: estado de aprovação no lançamento (padrão NAO_REQUER,
-- nada existente muda), alçadas por usuário do portal e empresa, e o histórico
-- de decisões. Aditiva: coluna com default, tabelas e índice novos.

-- AlterTable
ALTER TABLE `finance_entries` ADD COLUMN `approvalStatus` ENUM('NAO_REQUER', 'AGUARDANDO', 'APROVADO', 'REPROVADO') NOT NULL DEFAULT 'NAO_REQUER',
    ADD COLUMN `approvedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `portal_approval_limits` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `portalUserId` VARCHAR(191) NOT NULL,
    `maxAmount` DECIMAL(12, 2) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `portal_approval_limits_tenantId_companyId_active_idx`(`tenantId`, `companyId`, `active`),
    UNIQUE INDEX `portal_approval_limits_portalUserId_companyId_key`(`portalUserId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `finance_approval_events` (
    `id` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `decision` ENUM('ENVIADO', 'APROVADO', 'REPROVADO') NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `actorPortalUserId` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `finance_approval_events_entryId_createdAt_idx`(`entryId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `finance_entries_tenantId_approvalStatus_companyId_idx` ON `finance_entries`(`tenantId`, `approvalStatus`, `companyId`);

-- AddForeignKey
ALTER TABLE `portal_approval_limits` ADD CONSTRAINT `portal_approval_limits_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `portal_approval_limits` ADD CONSTRAINT `portal_approval_limits_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `portal_approval_limits` ADD CONSTRAINT `portal_approval_limits_portalUserId_fkey` FOREIGN KEY (`portalUserId`) REFERENCES `portal_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_approval_events` ADD CONSTRAINT `finance_approval_events_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `finance_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_approval_events` ADD CONSTRAINT `finance_approval_events_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_approval_events` ADD CONSTRAINT `finance_approval_events_actorPortalUserId_fkey` FOREIGN KEY (`actorPortalUserId`) REFERENCES `portal_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

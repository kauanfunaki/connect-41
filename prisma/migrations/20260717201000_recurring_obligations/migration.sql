-- Obrigações recorrentes por empresa/setor — geram itens de kanban todo mês
CREATE TABLE `recurring_obligations` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `pipelineId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `description` TEXT NULL,
    `dayOfMonth` INTEGER NOT NULL,
    `responsibleId` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `recurring_obligations_tenantId_active_idx`(`tenantId`, `active`),
    INDEX `recurring_obligations_companyId_fkey`(`companyId`),
    INDEX `recurring_obligations_pipelineId_fkey`(`pipelineId`),
    INDEX `recurring_obligations_responsibleId_fkey`(`responsibleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `recurring_obligations` ADD CONSTRAINT `recurring_obligations_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `recurring_obligations` ADD CONSTRAINT `recurring_obligations_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `recurring_obligations` ADD CONSTRAINT `recurring_obligations_pipelineId_fkey` FOREIGN KEY (`pipelineId`) REFERENCES `pipelines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `recurring_obligations` ADD CONSTRAINT `recurring_obligations_responsibleId_fkey` FOREIGN KEY (`responsibleId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Rateio da conta (lote D, 20/10): linhas de categoria, centro e projeto que
-- somam o valor da conta. Tabela nova; nada existente muda.
-- CreateTable
CREATE TABLE `finance_entry_allocations` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `costCenterId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `finance_entry_allocations_entryId_idx`(`entryId`),
    INDEX `finance_entry_allocations_categoryId_idx`(`categoryId`),
    INDEX `finance_entry_allocations_costCenterId_idx`(`costCenterId`),
    INDEX `finance_entry_allocations_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `finance_entry_allocations` ADD CONSTRAINT `finance_entry_allocations_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `finance_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_entry_allocations` ADD CONSTRAINT `finance_entry_allocations_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `finance_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_entry_allocations` ADD CONSTRAINT `finance_entry_allocations_costCenterId_fkey` FOREIGN KEY (`costCenterId`) REFERENCES `cost_centers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_entry_allocations` ADD CONSTRAINT `finance_entry_allocations_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


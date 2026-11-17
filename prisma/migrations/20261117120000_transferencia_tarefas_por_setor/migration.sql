-- Transferências: tarefas por setor e dados do pedido (17/11/2026, melhoria-705).
-- Só acrescenta: coluna nula em handoffs e tabela nova. As transferências de antes ficam como estão.

-- AlterTable
ALTER TABLE `handoffs` ADD COLUMN `details` JSON NULL;

-- CreateTable
CREATE TABLE `handoff_sector_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `handoffSectorId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(300) NOT NULL,
    `position` INTEGER NOT NULL,
    `doneAt` DATETIME(3) NULL,
    `doneById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `handoff_sector_tasks_handoffSectorId_position_idx`(`handoffSectorId`, `position`),
    INDEX `handoff_sector_tasks_tenantId_idx`(`tenantId`),
    INDEX `handoff_sector_tasks_doneById_idx`(`doneById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `handoff_sector_tasks` ADD CONSTRAINT `handoff_sector_tasks_handoffSectorId_fkey` FOREIGN KEY (`handoffSectorId`) REFERENCES `handoff_sectors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `handoff_sector_tasks` ADD CONSTRAINT `handoff_sector_tasks_doneById_fkey` FOREIGN KEY (`doneById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


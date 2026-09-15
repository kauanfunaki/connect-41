-- AlterTable
ALTER TABLE `processes` ADD COLUMN `dueAt` DATETIME(3) NULL,
    ADD COLUMN `priority` ENUM('BAIXA', 'NORMAL', 'ALTA', 'URGENTE') NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN `title` VARCHAR(160) NULL;

-- CreateIndex
CREATE INDEX `processes_tenantId_ownerUserId_idx` ON `processes`(`tenantId`, `ownerUserId`);


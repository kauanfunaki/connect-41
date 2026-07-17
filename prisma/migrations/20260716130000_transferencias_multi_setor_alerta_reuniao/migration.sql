-- Transferências multi-setor + prioridade (itens 2/6) e ciência de alerta de
-- reunião (item 1).
--
-- Cada transferência passa a ter N setores de destino (handoff_sectors), cada
-- um com instrução, status próprio (Nova/Resolvendo/Finalizada) e responsável.
-- Os campos de destino único do handoff (toSector/status/assignedTo/resolvedAt)
-- são migrados para handoff_sectors e removidos.

-- CreateTable
CREATE TABLE `handoff_sectors` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `handoffId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `instruction` TEXT NULL,
    `status` ENUM('NEW', 'IN_PROGRESS', 'DONE') NOT NULL DEFAULT 'NEW',
    `assignedTo` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `handoff_sectors_tenantId_sectorCode_status_idx`(`tenantId`, `sectorCode`, `status`),
    UNIQUE INDEX `handoff_sectors_handoffId_sectorCode_key`(`handoffId`, `sectorCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `handoff_sectors` ADD CONSTRAINT `handoff_sectors_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `handoff_sectors` ADD CONSTRAINT `handoff_sectors_handoffId_fkey` FOREIGN KEY (`handoffId`) REFERENCES `handoffs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `handoff_sectors` ADD CONSTRAINT `handoff_sectors_assignedTo_fkey` FOREIGN KEY (`assignedTo`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: prioridade da transferência
ALTER TABLE `handoffs` ADD COLUMN `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM';

-- Backfill: cada handoff antigo (destino único) vira uma linha de handoff_sectors.
-- PENDING -> NEW ("Nova"), ACCEPTED -> IN_PROGRESS ("Resolvendo"), REJECTED -> DONE ("Finalizada").
INSERT INTO `handoff_sectors` (`id`, `tenantId`, `handoffId`, `sectorCode`, `instruction`, `status`, `assignedTo`, `resolvedAt`, `createdAt`, `updatedAt`)
SELECT
    UUID(), h.`tenantId`, h.`id`, h.`toSector`, NULL,
    CASE h.`status` WHEN 'PENDING' THEN 'NEW' WHEN 'ACCEPTED' THEN 'IN_PROGRESS' ELSE 'DONE' END,
    h.`assignedTo`, h.`resolvedAt`, h.`createdAt`, h.`updatedAt`
FROM `handoffs` h;

-- AlterTable: remove os campos de destino único (já migrados acima)
ALTER TABLE `handoffs` DROP FOREIGN KEY `handoffs_assignedTo_fkey`;
DROP INDEX `handoffs_tenantId_toSector_status_idx` ON `handoffs`;
ALTER TABLE `handoffs`
    DROP COLUMN `toSector`,
    DROP COLUMN `status`,
    DROP COLUMN `assignedTo`,
    DROP COLUMN `resolvedAt`;
CREATE INDEX `handoffs_tenantId_createdAt_idx` ON `handoffs`(`tenantId`, `createdAt`);

-- AlterTable: ciência do alerta focal de reunião
ALTER TABLE `meeting_attendees` ADD COLUMN `acknowledgedAt` DATETIME(3) NULL;

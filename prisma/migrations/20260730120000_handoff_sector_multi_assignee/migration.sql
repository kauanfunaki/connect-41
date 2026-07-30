-- HandoffSector passa a aceitar VÁRIOS responsáveis por setor.
--
-- `handoff_sectors.assignedTo` (um único usuário) é mantido nesta migration e
-- continua sendo populado com o primeiro responsável — remover a coluna exige
-- backfill verificado e limpar as leituras restantes no app.

-- CreateTable
CREATE TABLE `handoff_sector_assignees` (
    `handoffSectorId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `handoff_sector_assignees_userId_idx`(`userId`),
    PRIMARY KEY (`handoffSectorId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `handoff_sector_assignees` ADD CONSTRAINT `handoff_sector_assignees_handoffSectorId_fkey` FOREIGN KEY (`handoffSectorId`) REFERENCES `handoff_sectors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `handoff_sector_assignees` ADD CONSTRAINT `handoff_sector_assignees_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: cada responsável único já existente vira uma linha na tabela nova,
-- pra que as transferências antigas não apareçam sem responsável.
INSERT IGNORE INTO `handoff_sector_assignees` (`handoffSectorId`, `userId`)
SELECT `id`, `assignedTo`
FROM `handoff_sectors`
WHERE `assignedTo` IS NOT NULL;

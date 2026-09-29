-- Horas de operação em processo do Societário (29/09).
-- AlterTable
ALTER TABLE `time_entries` ADD COLUMN `processId` VARCHAR(191) NULL,
    MODIFY `pipelineItemId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `processes` ADD COLUMN `activeTimerStartedAt` DATETIME(3) NULL,
    ADD COLUMN `activeTimerUserId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `time_entries_tenantId_loggedOn_idx` ON `time_entries`(`tenantId`, `loggedOn`);

-- CreateIndex
CREATE INDEX `time_entries_processId_idx` ON `time_entries`(`processId`);

-- AddForeignKey
ALTER TABLE `time_entries` ADD CONSTRAINT `time_entries_processId_fkey` FOREIGN KEY (`processId`) REFERENCES `processes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


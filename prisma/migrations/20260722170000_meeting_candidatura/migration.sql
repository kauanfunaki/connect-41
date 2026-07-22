-- AlterTable
ALTER TABLE `meetings` ADD COLUMN `candidaturaId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `meetings_tenantId_candidaturaId_idx` ON `meetings`(`tenantId`, `candidaturaId`);

-- AddForeignKey
ALTER TABLE `meetings` ADD CONSTRAINT `meetings_candidaturaId_fkey` FOREIGN KEY (`candidaturaId`) REFERENCES `candidaturas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

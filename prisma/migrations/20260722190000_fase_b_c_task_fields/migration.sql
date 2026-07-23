-- AlterTable: entidade vira opcional, novos campos de data/estimativa/cronômetro/recorrência
ALTER TABLE `pipeline_items`
  MODIFY COLUMN `entityType` ENUM('COMPANY', 'PERSON') NULL,
  MODIFY COLUMN `entityId` VARCHAR(191) NULL,
  ADD COLUMN `startDate` DATETIME(3) NULL,
  ADD COLUMN `activeTimerUserId` VARCHAR(191) NULL,
  ADD COLUMN `activeTimerStartedAt` DATETIME(3) NULL,
  ADD COLUMN `recurring` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `recurrenceFrequency` ENUM('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY') NULL;

-- AlterTable: prioridade por responsável
ALTER TABLE `pipeline_item_assignees`
  ADD COLUMN `priority` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `pipeline_item_links` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `pipelineItemId` VARCHAR(191) NOT NULL,
  `linkedItemId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `pipeline_item_links_pipelineItemId_linkedItemId_key`(`pipelineItemId`, `linkedItemId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pipeline_item_links` ADD CONSTRAINT `pipeline_item_links_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `pipeline_item_links` ADD CONSTRAINT `pipeline_item_links_pipelineItemId_fkey` FOREIGN KEY (`pipelineItemId`) REFERENCES `pipeline_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `pipeline_item_links` ADD CONSTRAINT `pipeline_item_links_linkedItemId_fkey` FOREIGN KEY (`linkedItemId`) REFERENCES `pipeline_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

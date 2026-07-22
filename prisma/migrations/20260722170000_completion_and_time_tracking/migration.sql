-- AlterTable
ALTER TABLE `pipeline_items`
  ADD COLUMN `estimateMinutes` INTEGER NULL;

-- AlterTable
ALTER TABLE `activities`
  MODIFY COLUMN `type` ENUM('NOTE', 'STATUS_CHANGE', 'DOCUMENT', 'HANDOFF', 'MENTION', 'CREATED', 'PRIORITY_CHANGE', 'DUE_DATE_CHANGE', 'DESCRIPTION_CHANGE', 'ASSIGNEE_CHANGE', 'TAG_CHANGE', 'CHECKLIST_CHANGE', 'SUBTASK_CHANGE', 'COMPLETED', 'REOPENED', 'TIME_LOGGED') NOT NULL;

-- CreateTable
CREATE TABLE `time_entries` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `pipelineItemId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `minutes` INTEGER NOT NULL,
  `note` VARCHAR(280) NULL,
  `loggedOn` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `time_entries_tenantId_pipelineItemId_idx`(`tenantId`, `pipelineItemId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `time_entries` ADD CONSTRAINT `time_entries_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `time_entries` ADD CONSTRAINT `time_entries_pipelineItemId_fkey` FOREIGN KEY (`pipelineItemId`) REFERENCES `pipeline_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `time_entries` ADD CONSTRAINT `time_entries_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

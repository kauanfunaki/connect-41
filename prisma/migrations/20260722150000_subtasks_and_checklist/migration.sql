-- AlterTable
ALTER TABLE `pipeline_items`
  ADD COLUMN `title` VARCHAR(200) NULL,
  ADD COLUMN `parentItemId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `activities`
  MODIFY COLUMN `type` ENUM('NOTE', 'STATUS_CHANGE', 'DOCUMENT', 'HANDOFF', 'MENTION', 'CREATED', 'PRIORITY_CHANGE', 'DUE_DATE_CHANGE', 'DESCRIPTION_CHANGE', 'ASSIGNEE_CHANGE', 'TAG_CHANGE', 'CHECKLIST_CHANGE', 'SUBTASK_CHANGE') NOT NULL;

-- CreateTable
CREATE TABLE `checklist_items` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `pipelineItemId` VARCHAR(191) NOT NULL,
  `text` VARCHAR(280) NOT NULL,
  `done` BOOLEAN NOT NULL DEFAULT false,
  `order` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `checklist_items_tenantId_pipelineItemId_idx`(`tenantId`, `pipelineItemId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `pipeline_items_parentItemId_idx` ON `pipeline_items`(`parentItemId`);

-- AddForeignKey
ALTER TABLE `pipeline_items` ADD CONSTRAINT `pipeline_items_parentItemId_fkey` FOREIGN KEY (`parentItemId`) REFERENCES `pipeline_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `checklist_items` ADD CONSTRAINT `checklist_items_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `checklist_items` ADD CONSTRAINT `checklist_items_pipelineItemId_fkey` FOREIGN KEY (`pipelineItemId`) REFERENCES `pipeline_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

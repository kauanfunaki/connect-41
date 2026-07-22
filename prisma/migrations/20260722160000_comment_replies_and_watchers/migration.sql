-- AlterTable
ALTER TABLE `activities`
  ADD COLUMN `parentActivityId` VARCHAR(191) NULL,
  ADD COLUMN `editedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `activities_parentActivityId_idx` ON `activities`(`parentActivityId`);

-- AddForeignKey
ALTER TABLE `activities` ADD CONSTRAINT `activities_parentActivityId_fkey` FOREIGN KEY (`parentActivityId`) REFERENCES `activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `pipeline_item_watchers` (
  `pipelineItemId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`pipelineItemId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pipeline_item_watchers` ADD CONSTRAINT `pipeline_item_watchers_pipelineItemId_fkey` FOREIGN KEY (`pipelineItemId`) REFERENCES `pipeline_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pipeline_item_watchers` ADD CONSTRAINT `pipeline_item_watchers_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

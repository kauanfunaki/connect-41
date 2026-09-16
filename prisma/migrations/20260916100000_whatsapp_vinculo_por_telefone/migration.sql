-- AlterTable
ALTER TABLE `whatsapp_threads` ADD COLUMN `linkAttempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `linkFailedAt` DATETIME(3) NULL,
    ADD COLUMN `linkPendingPersonId` VARCHAR(191) NULL;

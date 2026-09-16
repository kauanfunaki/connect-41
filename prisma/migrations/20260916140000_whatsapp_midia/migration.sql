-- AlterTable
ALTER TABLE `whatsapp_messages` ADD COLUMN `mediaFileName` VARCHAR(180) NULL,
    ADD COLUMN `mediaMimeType` VARCHAR(100) NULL,
    ADD COLUMN `mediaUrl` VARCHAR(255) NULL;

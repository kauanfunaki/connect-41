-- Aditiva (28/10/2026): aviso de erro fechado no card do robô vale para a equipe;
-- o evento guarda quem fechou e quando.
-- AlterTable
ALTER TABLE `ops_events` ADD COLUMN `dismissedAt` DATETIME(3) NULL,
    ADD COLUMN `dismissedBy` VARCHAR(191) NULL;



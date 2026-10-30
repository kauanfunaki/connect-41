-- A situação da inscrição estadual no CICAD (robô do Societário, 30/10/2026).
-- AlterTable
ALTER TABLE `companies` ADD COLUMN `stateRegistrationChangedAt` DATETIME(3) NULL,
    ADD COLUMN `stateRegistrationCheckedAt` DATETIME(3) NULL,
    ADD COLUMN `stateRegistrationStatus` VARCHAR(12) NULL;


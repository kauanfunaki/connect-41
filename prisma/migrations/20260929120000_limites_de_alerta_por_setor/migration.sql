-- Limites dos alertas da Gestão por setor (29/09).
-- AlterTable
ALTER TABLE `sectors` ADD COLUMN `alertDueSoonDays` INTEGER NULL,
    ADD COLUMN `alertStalledDays` INTEGER NULL;


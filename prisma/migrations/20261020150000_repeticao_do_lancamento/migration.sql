-- A repetição do lançamento (lote D, 19/10): as contas que nascem juntas de
-- um lançamento que repete têm a mesma série e a posição nela ("3 de 12").
-- Só aditiva: as contas que já existem ficam sem série.
ALTER TABLE `finance_entries` ADD COLUMN `recurrenceId` VARCHAR(36) NULL,
    ADD COLUMN `recurrenceIndex` INTEGER NULL,
    ADD COLUMN `recurrenceTotal` INTEGER NULL;

CREATE INDEX `finance_entries_tenantId_recurrenceId_idx` ON `finance_entries`(`tenantId`, `recurrenceId`);

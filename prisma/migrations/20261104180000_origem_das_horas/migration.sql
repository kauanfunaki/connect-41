-- De onde veio cada hora lançada (04/11/2026, lote D dos ajustes de 03/11):
-- o cronômetro ou à mão, e quando foi corrigida depois.
-- AlterTable
ALTER TABLE `time_entries` ADD COLUMN `editedAt` DATETIME(3) NULL,
    ADD COLUMN `source` ENUM('CRONOMETRO', 'MANUAL') NULL;

-- As do cronômetro do processo já levavam a nota "cronômetro": dá para saber.
-- O resto das antigas fica sem origem (a tela diz "antes de 04/11").
UPDATE `time_entries` SET `source` = 'CRONOMETRO' WHERE `processId` IS NOT NULL AND `note` = 'cronômetro';

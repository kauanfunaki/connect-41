-- Pontuação automática da triagem (R1): guarda a última falha da candidatura
-- para o cron não tentar de novo a cada rodada.
--
-- Aditiva: duas colunas opcionais em `candidaturas`.

-- AlterTable
ALTER TABLE `candidaturas` ADD COLUMN `triagemFalha` VARCHAR(200) NULL,
    ADD COLUMN `triagemFalhaEm` DATETIME(3) NULL;


-- Quadro de sócios (25/09): qualificação, quotas, capital, entrada e saída, o CPF
-- mascarado da Receita e a origem do cadastro. Só acrescenta colunas; os 11 sócios
-- existentes ficam com origem MANUAL e sem data de saída.
-- AlterTable
ALTER TABLE `company_partners` ADD COLUMN `capitalAmount` DECIMAL(14, 2) NULL,
    ADD COLUMN `documentMasked` VARCHAR(20) NULL,
    ADD COLUMN `entryDate` DATETIME(3) NULL,
    ADD COLUMN `exitDate` DATETIME(3) NULL,
    ADD COLUMN `origin` VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN `qualification` VARCHAR(80) NULL,
    ADD COLUMN `quotas` INTEGER NULL;


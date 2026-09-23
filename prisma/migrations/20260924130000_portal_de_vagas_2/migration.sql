-- Portal de vagas, 2ª leva: benefícios, prazo de inscrição e local próprio.
--
-- Aditiva: quatro colunas opcionais em `vagas`.

-- AlterTable
ALTER TABLE `vagas` ADD COLUMN `applicationDeadline` DATETIME(3) NULL,
    ADD COLUMN `benefits` TEXT NULL,
    ADD COLUMN `workCity` VARCHAR(80) NULL,
    ADD COLUMN `workStateCode` VARCHAR(2) NULL;

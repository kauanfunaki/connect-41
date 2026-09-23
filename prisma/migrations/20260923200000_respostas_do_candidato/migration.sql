-- Respostas do candidato (R2): pretensão salarial, disponibilidade e tempo de
-- deslocamento na candidatura, com a origem de cada uma (WhatsApp ou recrutador).
--
-- Aditiva: quatro colunas opcionais em `candidaturas`.

-- AlterTable
ALTER TABLE `candidaturas` ADD COLUMN `deslocamentoMinutos` INTEGER NULL,
    ADD COLUMN `disponibilidade` VARCHAR(120) NULL,
    ADD COLUMN `pretensaoSalarial` DECIMAL(12, 2) NULL,
    ADD COLUMN `respostasFonte` JSON NULL;


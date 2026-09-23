-- Portal de vagas: faixa salarial opcional, modalidade e tipo de contrato.
--
-- Aditiva: cinco colunas opcionais (ou com padrão) em `vagas`.

-- AlterTable
ALTER TABLE `vagas` ADD COLUMN `contractType` ENUM('CLT', 'PJ', 'ESTAGIO', 'TEMPORARIO', 'APRENDIZ') NULL,
    ADD COLUMN `salaryMax` DECIMAL(12, 2) NULL,
    ADD COLUMN `salaryMin` DECIMAL(12, 2) NULL,
    ADD COLUMN `showSalary` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `workMode` ENUM('PRESENCIAL', 'HIBRIDO', 'REMOTO') NULL;

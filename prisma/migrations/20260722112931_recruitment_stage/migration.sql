-- AlterTable
ALTER TABLE `candidaturas` ADD COLUMN `stage` ENUM('TRIAGEM', 'ENTREVISTA', 'TESTE', 'PROPOSTA', 'CONTRATADO') NOT NULL DEFAULT 'TRIAGEM';

-- Data-fix: alinha a etapa dos registros existentes ao status atual, para o
-- funil não mostrar contratados/aprovados presos na Triagem.
UPDATE `candidaturas` SET `stage` = 'CONTRATADO' WHERE `status` = 'CONTRATADO';
UPDATE `candidaturas` SET `stage` = 'PROPOSTA' WHERE `status` = 'APROVADO';

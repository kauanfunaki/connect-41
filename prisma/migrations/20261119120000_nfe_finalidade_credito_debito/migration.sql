-- Finalidade da NF-e e notas de crédito/débito da reforma tributária
-- (19/11/2026, funcionalidade-793). finNFe 5 e 6 ajustam só IBS/CBS de uma
-- nota anterior: ficam fora do faturamento e entram no acervo como IGNORADO,
-- sem virar conta. Ver src/lib/fiscal/finalidade.ts.
--
-- Só colunas opcionais; não altera registros existentes (sem backfill: nota
-- já importada continua sem a marca).

-- AlterTable
ALTER TABLE `fiscal_documents` ADD COLUMN `chavesReferenciadas` TEXT NULL,
    ADD COLUMN `finalidade` VARCHAR(1) NULL,
    ADD COLUMN `tipoAjuste` VARCHAR(2) NULL,
    ADD COLUMN `valorCbs` DECIMAL(12, 2) NULL,
    ADD COLUMN `valorIbs` DECIMAL(12, 2) NULL;

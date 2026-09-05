-- Marca de correção manual no documento fiscal.
--
-- Aditiva: uma coluna nulável, nada existente é tocado. Documento já importado
-- fica com NULL, que é a verdade — ele nunca foi editado à mão.
ALTER TABLE `fiscal_documents` ADD COLUMN `editedAt` DATETIME(3) NULL;

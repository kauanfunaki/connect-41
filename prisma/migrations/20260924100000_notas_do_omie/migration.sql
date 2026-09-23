-- Notas do Omie no acervo fiscal (Fase 1b da integração): nova origem OMIE e o
-- id da nota do lado do Omie.
--
-- Aditiva: um valor novo no enum de origem e uma coluna opcional.

-- AlterTable
ALTER TABLE `fiscal_documents` MODIFY `origin` ENUM('SPED', 'UPLOAD', 'OMIE') NOT NULL,
    ADD COLUMN `omieIdNF` VARCHAR(30) NULL;

-- As retenções por tributo que a NFS-e declara (lote D, 20/10), lidas do XML na
-- entrada. Coluna nova, anulável: as notas que já estão no acervo ficam nulas.
-- AlterTable
ALTER TABLE `fiscal_documents` ADD COLUMN `retentionsByTax` JSON NULL;


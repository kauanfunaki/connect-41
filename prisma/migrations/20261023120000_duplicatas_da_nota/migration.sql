-- As duplicatas da NF-e (`<cobr><dup>`, 23/10/2026), do upload do XML e do
-- índice do SPED: é o que faz a conta a pagar da nota de compra nascer
-- parcelada. Coluna nova, anulável: as notas que já estão no acervo ficam
-- nulas, e a conta delas nasce como sempre nasceu.
-- AlterTable
ALTER TABLE `fiscal_documents` ADD COLUMN `installments` JSON NULL;

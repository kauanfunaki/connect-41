-- Data de previsão do título (lote D, 20/10): quando o dinheiro deve andar,
-- se não for no vencimento. Nula é o próprio vencimento.
-- AlterTable
ALTER TABLE `finance_entries` ADD COLUMN `forecastDate` DATETIME(3) NULL;


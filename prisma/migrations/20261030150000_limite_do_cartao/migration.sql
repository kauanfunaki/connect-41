-- O limite do cartão de crédito (30/10/2026), lido do valor_limite da conta
-- de cartão do Omie. Coluna nova e nula; não altera registros existentes.
-- AlterTable
ALTER TABLE `bank_accounts` ADD COLUMN `cardLimit` DECIMAL(14, 2) NULL;

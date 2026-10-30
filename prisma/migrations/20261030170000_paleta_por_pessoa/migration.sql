-- A paleta de cores de cada pessoa (30/10/2026): a cor de destaque, em hex.
-- Coluna nova e nula (nula usa a cor do escritório); não altera registros.
-- AlterTable
ALTER TABLE `users` ADD COLUMN `accentColor` VARCHAR(7) NULL;

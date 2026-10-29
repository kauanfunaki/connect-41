-- A chave "Trabalhar numa empresa por vez" por setor (29/10/2026), em
-- Configurações › Setores. Coluna nova e nula: nulo é ligado, o de antes da
-- chave; não altera registros existentes.
-- AlterTable
ALTER TABLE `sectors` ADD COLUMN `companyFocus` BOOLEAN NULL;

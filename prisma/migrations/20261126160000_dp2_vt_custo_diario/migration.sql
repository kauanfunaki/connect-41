-- Custo diário do vale-transporte no contrato do DP 2 (funcionalidade-753)
ALTER TABLE `dp2_vinculos` ADD COLUMN `vtCustoDiario` DECIMAL(10, 2) NULL;

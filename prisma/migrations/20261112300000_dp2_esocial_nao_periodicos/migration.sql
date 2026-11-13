-- DP 2, fase 3b (12/11/2026, funcionalidade-635): os dados que os eventos não
-- periódicos do eSocial pedem e o cadastro não tem (no contrato do DP 2) e o
-- CNPJ do sindicato na convenção. Só colunas opcionais; nada existente muda.

-- AlterTable
ALTER TABLE `dp2_convencoes` ADD COLUMN `cnpjSindicato` VARCHAR(18) NULL;

-- AlterTable
ALTER TABLE `dp2_vinculos` ADD COLUMN `dadosEsocial` JSON NULL;


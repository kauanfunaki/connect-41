-- Natureza jurídica no cadastro de empresa (18/11/2026, funcionalidade-780):
-- código e descrição da tabela da Receita, como no cartão CNPJ
-- ("206-2 - Sociedade Empresária Limitada"). Preenchida pela consulta do CNPJ
-- no formulário.
--
-- Só uma coluna opcional; não altera registros existentes.

-- AlterTable
ALTER TABLE `companies` ADD COLUMN `naturezaJuridica` VARCHAR(120) NULL;

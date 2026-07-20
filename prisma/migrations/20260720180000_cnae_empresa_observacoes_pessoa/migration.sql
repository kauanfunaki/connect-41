-- Campos aditivos, todos NULL por padrão — não afeta linhas existentes.
-- CNAE principal/secundário em Company (pendente de modelagem, TODO antigo do
-- EmpresaForm); Observações livres em Person.

-- AlterTable
ALTER TABLE `companies`
    ADD COLUMN `cnaePrincipal` VARCHAR(20) NULL,
    ADD COLUMN `cnaeSecundarios` TEXT NULL;

-- AlterTable
ALTER TABLE `people`
    ADD COLUMN `notes` TEXT NULL;

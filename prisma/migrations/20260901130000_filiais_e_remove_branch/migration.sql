-- Duas mudanças na mesma leva, porque uma substitui a outra.
--
-- 1. `companies.parentCompanyId` — hierarquia matriz→filial explícita. Derivar
--    da raiz do CNPJ resolveria o caso comum e falharia nos que existem de
--    verdade: filial sem CNPJ próprio ainda em abertura, e holding cuja matriz
--    tem outra raiz.
--
-- 2. `branches` sai. Era "filial" no sentido de unidade do escritório, e a
--    palavra passou a significar estabelecimento da empresa cliente — dois
--    campos "Filial" na mesma tela querendo dizer coisas opostas. A função
--    nunca entrou em uso: 2 linhas, ambas de teste ("Teste" e um nome de
--    empresa duplicado), e 1 empresa de 11 apontando para elas.

-- AlterTable: hierarquia de filiais
ALTER TABLE `companies` ADD COLUMN `parentCompanyId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `companies_tenantId_parentCompanyId_idx` ON `companies`(`tenantId`, `parentCompanyId`);

-- AddForeignKey
ALTER TABLE `companies` ADD CONSTRAINT `companies_parentCompanyId_fkey` FOREIGN KEY (`parentCompanyId`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE `companies` DROP FOREIGN KEY `companies_branchId_fkey`;

-- AlterTable
ALTER TABLE `companies` DROP COLUMN `branchId`;

-- DropTable
DROP TABLE `branches`;

-- Plano de contas por empresa e contas do Omie no financeiro (25/09).
--
-- Aditiva no dado: nenhuma linha muda. As categorias que já existem ficam como
-- plano padrão do escritório (`companyId` nulo, `scope` vazio), que é o que
-- elas já eram. O unique troca de (tenantId, name, kind) para
-- (tenantId, scope, name, kind); como todas nascem com `scope = ''`, o índice
-- novo aceita exatamente as mesmas linhas que o antigo.
--
-- A FK de tenant é recriada só porque o MySQL usava o unique antigo como índice
-- dela; o índice (tenantId, kind) cobre a FK depois da troca.

-- DropForeignKey
ALTER TABLE `finance_categories` DROP FOREIGN KEY `finance_categories_tenantId_fkey`;

-- DropIndex
DROP INDEX `finance_categories_tenantId_name_kind_key` ON `finance_categories`;

-- AlterTable
ALTER TABLE `finance_categories` ADD COLUMN `companyId` VARCHAR(191) NULL,
    ADD COLUMN `omieCode` VARCHAR(20) NULL,
    ADD COLUMN `planGroup` VARCHAR(120) NULL,
    ADD COLUMN `scope` VARCHAR(36) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `finance_entries` ADD COLUMN `omieTitleId` VARCHAR(20) NULL;

-- CreateTable
CREATE TABLE `finance_category_hidden` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `finance_category_hidden_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `finance_category_hidden_companyId_categoryId_key`(`companyId`, `categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `finance_categories_tenantId_companyId_idx` ON `finance_categories`(`tenantId`, `companyId`);

-- CreateIndex
CREATE UNIQUE INDEX `finance_categories_tenantId_scope_name_kind_key` ON `finance_categories`(`tenantId`, `scope`, `name`, `kind`);

-- CreateIndex
CREATE UNIQUE INDEX `finance_entries_companyId_omieTitleId_key` ON `finance_entries`(`companyId`, `omieTitleId`);

-- AddForeignKey
ALTER TABLE `finance_categories` ADD CONSTRAINT `finance_categories_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_categories` ADD CONSTRAINT `finance_categories_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_category_hidden` ADD CONSTRAINT `finance_category_hidden_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_category_hidden` ADD CONSTRAINT `finance_category_hidden_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_category_hidden` ADD CONSTRAINT `finance_category_hidden_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `finance_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


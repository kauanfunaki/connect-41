-- Fluxo de caixa projetado, fase 1 (25/11/2026, funcionalidade-837): as categorias
-- do cliente (a nomenclatura própria dele) e o de-para das categorias do Omie para
-- elas, por empresa. Só cria: nenhuma tabela existente muda.

-- CreateTable
CREATE TABLE `client_categories` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `line` VARCHAR(40) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `client_categories_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `client_categories_companyId_name_key`(`companyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `client_category_mappings` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `clientCategoryId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `client_category_mappings_tenantId_companyId_idx`(`tenantId`, `companyId`),
    INDEX `client_category_mappings_clientCategoryId_idx`(`clientCategoryId`),
    UNIQUE INDEX `client_category_mappings_companyId_categoryId_key`(`companyId`, `categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `client_categories` ADD CONSTRAINT `client_categories_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_categories` ADD CONSTRAINT `client_categories_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_category_mappings` ADD CONSTRAINT `client_category_mappings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_category_mappings` ADD CONSTRAINT `client_category_mappings_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_category_mappings` ADD CONSTRAINT `client_category_mappings_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `finance_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_category_mappings` ADD CONSTRAINT `client_category_mappings_clientCategoryId_fkey` FOREIGN KEY (`clientCategoryId`) REFERENCES `client_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


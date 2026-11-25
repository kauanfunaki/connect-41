-- Fluxo de caixa projetado, fase 2 (26/11/2026, funcionalidade-838): os pedidos de venda
-- do Omie e as etapas de faturamento, as premissas do cenário e três colunas novas em
-- cash_flow_settings (tabela do mesmo projeto, lida só com select explícito).

-- AlterTable
ALTER TABLE `cash_flow_settings` ADD COLUMN `salesOrderStages` VARCHAR(200) NULL,
    ADD COLUMN `salesOrdersEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `scenarioVisibleToClient` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `sales_orders` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `omieOrderId` VARCHAR(30) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `stageCode` VARCHAR(4) NOT NULL,
    `customerName` VARCHAR(180) NOT NULL,
    `forecastDate` DATETIME(3) NULL,
    `totalAmount` DECIMAL(15, 2) NOT NULL,
    `installments` JSON NOT NULL,
    `fetchedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sales_orders_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `sales_orders_companyId_omieOrderId_key`(`companyId`, `omieOrderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `omie_order_stages` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(4) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `inactive` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `omie_order_stages_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `omie_order_stages_companyId_code_key`(`companyId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cash_flow_assumptions` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `amount` DECIMAL(15, 4) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `cash_flow_assumptions_tenantId_companyId_idx`(`tenantId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sales_orders` ADD CONSTRAINT `sales_orders_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_orders` ADD CONSTRAINT `sales_orders_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `omie_order_stages` ADD CONSTRAINT `omie_order_stages_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `omie_order_stages` ADD CONSTRAINT `omie_order_stages_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cash_flow_assumptions` ADD CONSTRAINT `cash_flow_assumptions_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cash_flow_assumptions` ADD CONSTRAINT `cash_flow_assumptions_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


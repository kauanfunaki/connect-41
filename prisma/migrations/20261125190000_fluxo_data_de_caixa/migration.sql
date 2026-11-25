-- Fluxo de caixa projetado, fase 1 (25/11/2026, funcionalidade-837): a data de caixa
-- por empresa (dias depois da previsão ou do vencimento, a receber e a pagar). Só cria.

-- CreateTable
CREATE TABLE `cash_flow_settings` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `receivableDays` INTEGER NOT NULL DEFAULT 0,
    `payableDays` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cash_flow_settings_companyId_key`(`companyId`),
    INDEX `cash_flow_settings_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `cash_flow_settings` ADD CONSTRAINT `cash_flow_settings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cash_flow_settings` ADD CONSTRAINT `cash_flow_settings_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


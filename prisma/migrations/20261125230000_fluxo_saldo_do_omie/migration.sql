-- Fluxo de caixa projetado, fase 1 (25/11/2026, funcionalidade-837): o saldo das contas
-- correntes no Omie, lido pela sincronização do financeiro, e de onde o previsto tira o
-- saldo inicial. Cria omie_account_balances e acrescenta uma coluna anulável em
-- cash_flow_settings, tabela nova do mesmo projeto (lida só com select explícito).

-- AlterTable
ALTER TABLE `cash_flow_settings` ADD COLUMN `balanceSource` VARCHAR(20) NULL;

-- CreateTable
CREATE TABLE `omie_account_balances` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `omieAccountId` VARCHAR(30) NOT NULL,
    `label` VARCHAR(120) NOT NULL,
    `balance` DECIMAL(15, 2) NOT NULL,
    `fetchedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `omie_account_balances_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `omie_account_balances_companyId_omieAccountId_key`(`companyId`, `omieAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `omie_account_balances` ADD CONSTRAINT `omie_account_balances_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `omie_account_balances` ADD CONSTRAINT `omie_account_balances_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


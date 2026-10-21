-- Regras de conciliação (fila do BPO, 21/10): a regra da empresa e o registro
-- de qual regra lançou o quê. Tabelas novas; nada existente muda.
-- CreateTable
CREATE TABLE `bank_reconciliation_rules` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `direction` ENUM('ENTRADA', 'SAIDA') NOT NULL,
    `textContains` VARCHAR(120) NULL,
    `minAmount` DECIMAL(14, 2) NULL,
    `maxAmount` DECIMAL(14, 2) NULL,
    `bankAccountId` VARCHAR(191) NULL,
    `counterpartyId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `costCenterId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `description` VARCHAR(255) NULL,
    `mode` ENUM('SUGERIR', 'LANCAR') NOT NULL DEFAULT 'SUGERIR',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `bank_reconciliation_rules_tenantId_companyId_idx`(`tenantId`, `companyId`),
    INDEX `bank_reconciliation_rules_bankAccountId_idx`(`bankAccountId`),
    INDEX `bank_reconciliation_rules_counterpartyId_idx`(`counterpartyId`),
    INDEX `bank_reconciliation_rules_categoryId_idx`(`categoryId`),
    INDEX `bank_reconciliation_rules_costCenterId_idx`(`costCenterId`),
    INDEX `bank_reconciliation_rules_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_rule_applications` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `ruleId` VARCHAR(191) NULL,
    `ruleName` VARCHAR(120) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `financeEntryId` VARCHAR(191) NOT NULL,
    `automatic` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `undoneAt` DATETIME(3) NULL,
    `undoneById` VARCHAR(191) NULL,

    INDEX `bank_rule_applications_tenantId_companyId_createdAt_idx`(`tenantId`, `companyId`, `createdAt`),
    INDEX `bank_rule_applications_ruleId_idx`(`ruleId`),
    INDEX `bank_rule_applications_transactionId_idx`(`transactionId`),
    INDEX `bank_rule_applications_financeEntryId_idx`(`financeEntryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bank_reconciliation_rules` ADD CONSTRAINT `bank_reconciliation_rules_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_reconciliation_rules` ADD CONSTRAINT `bank_reconciliation_rules_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `bank_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_reconciliation_rules` ADD CONSTRAINT `bank_reconciliation_rules_counterpartyId_fkey` FOREIGN KEY (`counterpartyId`) REFERENCES `finance_counterparties`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_reconciliation_rules` ADD CONSTRAINT `bank_reconciliation_rules_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `finance_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_reconciliation_rules` ADD CONSTRAINT `bank_reconciliation_rules_costCenterId_fkey` FOREIGN KEY (`costCenterId`) REFERENCES `cost_centers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_reconciliation_rules` ADD CONSTRAINT `bank_reconciliation_rules_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `finance_projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_rule_applications` ADD CONSTRAINT `bank_rule_applications_ruleId_fkey` FOREIGN KEY (`ruleId`) REFERENCES `bank_reconciliation_rules`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_rule_applications` ADD CONSTRAINT `bank_rule_applications_transactionId_fkey` FOREIGN KEY (`transactionId`) REFERENCES `bank_transactions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_rule_applications` ADD CONSTRAINT `bank_rule_applications_financeEntryId_fkey` FOREIGN KEY (`financeEntryId`) REFERENCES `finance_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


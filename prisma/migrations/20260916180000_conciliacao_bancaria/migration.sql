-- Conciliação bancária: contas, importações de extrato OFX, transações e o
-- vínculo transação → lançamentos. Aditiva: só cria tabelas.

-- CreateTable
CREATE TABLE `bank_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(80) NOT NULL,
    `bankCode` VARCHAR(3) NOT NULL,
    `agency` VARCHAR(10) NULL,
    `accountNumber` VARCHAR(30) NOT NULL,
    `accountDigits` VARCHAR(30) NOT NULL,
    `type` ENUM('CORRENTE', 'POUPANCA') NOT NULL DEFAULT 'CORRENTE',
    `openingBalance` DECIMAL(14, 2) NULL,
    `openingBalanceDate` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `bank_accounts_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `bank_accounts_tenantId_companyId_bankCode_accountDigits_key`(`tenantId`, `companyId`, `bankCode`, `accountDigits`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_statement_imports` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `bankAccountId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `periodStart` DATETIME(3) NULL,
    `periodEnd` DATETIME(3) NULL,
    `ledgerBalance` DECIMAL(14, 2) NULL,
    `ledgerBalanceAt` DATETIME(3) NULL,
    `transactionsRead` INTEGER NOT NULL,
    `transactionsNew` INTEGER NOT NULL,
    `importedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `bank_statement_imports_tenantId_bankAccountId_createdAt_idx`(`tenantId`, `bankAccountId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `bankAccountId` VARCHAR(191) NOT NULL,
    `importId` VARCHAR(191) NOT NULL,
    `fitId` VARCHAR(255) NOT NULL,
    `postedAt` DATETIME(3) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `memo` VARCHAR(255) NULL,
    `payeeName` VARCHAR(180) NULL,
    `status` ENUM('PENDENTE', 'CONCILIADA', 'IGNORADA') NOT NULL DEFAULT 'PENDENTE',
    `ignoredReason` VARCHAR(255) NULL,
    `reconciledAt` DATETIME(3) NULL,
    `reconciledById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `bank_transactions_tenantId_bankAccountId_status_postedAt_idx`(`tenantId`, `bankAccountId`, `status`, `postedAt`),
    UNIQUE INDEX `bank_transactions_bankAccountId_fitId_key`(`bankAccountId`, `fitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_transaction_matches` (
    `id` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `financeEntryId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `entryStatusBefore` ENUM('PROVISORIO', 'CONFERIDO', 'PAGO', 'CANCELADO') NOT NULL,
    `entryPaidAtBefore` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `bank_transaction_matches_financeEntryId_key`(`financeEntryId`),
    INDEX `bank_transaction_matches_transactionId_idx`(`transactionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bank_accounts` ADD CONSTRAINT `bank_accounts_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_accounts` ADD CONSTRAINT `bank_accounts_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_statement_imports` ADD CONSTRAINT `bank_statement_imports_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_statement_imports` ADD CONSTRAINT `bank_statement_imports_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `bank_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_statement_imports` ADD CONSTRAINT `bank_statement_imports_importedById_fkey` FOREIGN KEY (`importedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_transactions` ADD CONSTRAINT `bank_transactions_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_transactions` ADD CONSTRAINT `bank_transactions_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `bank_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_transactions` ADD CONSTRAINT `bank_transactions_importId_fkey` FOREIGN KEY (`importId`) REFERENCES `bank_statement_imports`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_transactions` ADD CONSTRAINT `bank_transactions_reconciledById_fkey` FOREIGN KEY (`reconciledById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_transaction_matches` ADD CONSTRAINT `bank_transaction_matches_transactionId_fkey` FOREIGN KEY (`transactionId`) REFERENCES `bank_transactions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_transaction_matches` ADD CONSTRAINT `bank_transaction_matches_financeEntryId_fkey` FOREIGN KEY (`financeEntryId`) REFERENCES `finance_entries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_transaction_matches` ADD CONSTRAINT `bank_transaction_matches_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


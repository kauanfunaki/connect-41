-- Lote C do BPO (19/10): a baixa vira registro próprio — várias por conta,
-- com conta bancária, juros, multa e desconto — e a conciliação passa a ligar a
-- linha do extrato à baixa, não à conta (a conta paga em duas vezes concilia
-- com as duas linhas).
--
-- O que muda no que já existe:
-- - toda conta paga ganha **uma** baixa cheia (origem MIGRACAO), no dia e no
--   valor de hoje, sem juros nem desconto — os relatórios de caixa, que passam
--   a somar as baixas, dão exatamente os mesmos números de antes;
-- - `paidPrincipal` dessas contas fica igual ao valor (saldo zero);
-- - cada vínculo com o extrato aponta para a baixa da sua conta;
-- - o vínculo deixa de ser único por conta (passa a ser único por baixa). O
--   índice comum vem antes de tirar o único: a chave estrangeira precisa de um.

-- AlterTable
ALTER TABLE `finance_entries` ADD COLUMN `paidPrincipal` DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `finance_entry_payments` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `paidAt` DATETIME(3) NOT NULL,
    `principal` DECIMAL(12, 2) NOT NULL,
    `interest` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `fine` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `cash` DECIMAL(12, 2) NOT NULL,
    `interestCategoryId` VARCHAR(191) NULL,
    `discountCategoryId` VARCHAR(191) NULL,
    `bankAccountId` VARCHAR(191) NULL,
    `note` VARCHAR(255) NULL,
    `origin` ENUM('MANUAL', 'LANCAMENTO', 'CONCILIACAO', 'TRANSFERENCIA', 'OMIE', 'MIGRACAO') NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `finance_entry_payments_tenantId_companyId_paidAt_idx`(`tenantId`, `companyId`, `paidAt`),
    INDEX `finance_entry_payments_entryId_idx`(`entryId`),
    INDEX `finance_entry_payments_bankAccountId_idx`(`bankAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- O vínculo com o extrato: índice comum, depois sai o único, depois a baixa.
CREATE INDEX `bank_transaction_matches_financeEntryId_idx` ON `bank_transaction_matches`(`financeEntryId`);
DROP INDEX `bank_transaction_matches_financeEntryId_key` ON `bank_transaction_matches`;
ALTER TABLE `bank_transaction_matches` ADD COLUMN `paymentId` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `bank_transaction_matches_paymentId_key` ON `bank_transaction_matches`(`paymentId`);

-- AddForeignKey
ALTER TABLE `finance_entry_payments` ADD CONSTRAINT `finance_entry_payments_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `finance_entry_payments` ADD CONSTRAINT `finance_entry_payments_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `finance_entry_payments` ADD CONSTRAINT `finance_entry_payments_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `finance_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `finance_entry_payments` ADD CONSTRAINT `finance_entry_payments_interestCategoryId_fkey` FOREIGN KEY (`interestCategoryId`) REFERENCES `finance_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `finance_entry_payments` ADD CONSTRAINT `finance_entry_payments_discountCategoryId_fkey` FOREIGN KEY (`discountCategoryId`) REFERENCES `finance_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `finance_entry_payments` ADD CONSTRAINT `finance_entry_payments_bankAccountId_fkey` FOREIGN KEY (`bankAccountId`) REFERENCES `bank_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `finance_entry_payments` ADD CONSTRAINT `finance_entry_payments_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `bank_transaction_matches` ADD CONSTRAINT `bank_transaction_matches_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `finance_entry_payments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- As baixas de hoje: uma cheia por conta paga. A conta bancária é a da linha
-- do extrato conciliada, ou a do Omie ligada a uma conta do Connect.
INSERT INTO `finance_entry_payments`
    (`id`, `tenantId`, `companyId`, `entryId`, `paidAt`, `principal`, `interest`, `fine`, `discount`, `cash`, `bankAccountId`, `origin`, `createdAt`)
SELECT
    UUID(), fe.`tenantId`, fe.`companyId`, fe.`id`, fe.`paidAt`, fe.`amount`, 0, 0, 0, fe.`amount`,
    COALESCE(
        (SELECT bt.`bankAccountId` FROM `bank_transaction_matches` m
           INNER JOIN `bank_transactions` bt ON bt.`id` = m.`transactionId`
          WHERE m.`financeEntryId` = fe.`id` LIMIT 1),
        (SELECT ba.`id` FROM `bank_accounts` ba
          WHERE ba.`companyId` = fe.`companyId` AND fe.`omieAccountId` IS NOT NULL AND ba.`omieAccountId` = fe.`omieAccountId` LIMIT 1)
    ),
    'MIGRACAO', CURRENT_TIMESTAMP(3)
FROM `finance_entries` fe
WHERE fe.`paidAt` IS NOT NULL AND fe.`status` <> 'CANCELADO';

UPDATE `finance_entries` SET `paidPrincipal` = `amount` WHERE `paidAt` IS NOT NULL AND `status` <> 'CANCELADO';

UPDATE `bank_transaction_matches` AS m
  INNER JOIN `finance_entry_payments` AS p ON p.`entryId` = m.`financeEntryId`
SET m.`paymentId` = p.`id`
WHERE m.`paymentId` IS NULL;

-- Retenções na fonte da conta a pagar (lote D, 20/10): o imposto que o tomador
-- segura do fornecedor, e a ligação com a conta do imposto. Tabela nova.
-- CreateTable
CREATE TABLE `finance_entry_retentions` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `tax` ENUM('IRRF', 'PIS', 'COFINS', 'CSLL', 'INSS', 'ISS') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `taxEntryId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `finance_entry_retentions_taxEntryId_key`(`taxEntryId`),
    UNIQUE INDEX `finance_entry_retentions_entryId_tax_key`(`entryId`, `tax`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `finance_entry_retentions` ADD CONSTRAINT `finance_entry_retentions_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `finance_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_entry_retentions` ADD CONSTRAINT `finance_entry_retentions_taxEntryId_fkey` FOREIGN KEY (`taxEntryId`) REFERENCES `finance_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


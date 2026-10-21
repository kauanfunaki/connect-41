-- BPO, lote H2 (19/10): anexo no lançamento — o boleto, a nota ou o
-- comprovante da conta, como o anexo do título no Omie e no Nibo.
--
-- Aditiva: só uma tabela nova, sem dado escrito. O arquivo em si fica em
-- `storage/finance-entries/<tenantId>/<uuid>.<ext>`, sob o volume de
-- `/app/storage` do EasyPanel. Apagar o lançamento leva os anexos em cascata;
-- quem os grava pode sair do Connect sem levar o anexo (SET NULL).

-- CreateTable
CREATE TABLE `finance_entry_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `uploadedByUserId` VARCHAR(191) NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `fileUrl` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `finance_entry_attachments_entryId_idx`(`entryId`),
    INDEX `finance_entry_attachments_uploadedByUserId_idx`(`uploadedByUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `finance_entry_attachments` ADD CONSTRAINT `finance_entry_attachments_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `finance_entries`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `finance_entry_attachments` ADD CONSTRAINT `finance_entry_attachments_uploadedByUserId_fkey` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Controle interno (05/11/2026): anexos do item — imagens, PDFs e outros
-- arquivos. Tabela nova; não altera registros existentes.
-- CreateTable
CREATE TABLE `tech_internal_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `uploadedByName` VARCHAR(120) NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `fileUrl` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tech_internal_attachments_tenantId_itemId_createdAt_idx`(`tenantId`, `itemId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tech_internal_attachments` ADD CONSTRAINT `tech_internal_attachments_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tech_internal_attachments` ADD CONSTRAINT `tech_internal_attachments_tenantId_itemId_fkey` FOREIGN KEY (`tenantId`, `itemId`) REFERENCES `tech_internal_items`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

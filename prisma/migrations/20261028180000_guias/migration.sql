-- Guias pelo Connect (28/10/2026): a guia como registro. Tabela nova; não
-- altera registros existentes.

-- CreateTable
CREATE TABLE `guias` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `descricao` VARCHAR(160) NOT NULL,
    `competencia` VARCHAR(7) NULL,
    `vencimento` VARCHAR(10) NULL,
    `validoAte` VARCHAR(10) NULL,
    `valor` DECIMAL(14, 2) NULL,
    `numeroDocumento` VARCHAR(60) NULL,
    `linhaDigitavel` VARCHAR(60) NULL,
    `origem` VARCHAR(10) NOT NULL,
    `driveFileId` VARCHAR(191) NULL,
    `clientDocumentId` VARCHAR(191) NULL,
    `pagaEm` DATETIME(3) NULL,
    `pagaPorId` VARCHAR(191) NULL,
    `emitidaPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `guias_tenantId_companyId_competencia_idx`(`tenantId`, `companyId`, `competencia`),
    INDEX `guias_tenantId_vencimento_idx`(`tenantId`, `vencimento`),
    INDEX `guias_driveFileId_idx`(`driveFileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `guias` ADD CONSTRAINT `guias_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guias` ADD CONSTRAINT `guias_driveFileId_fkey` FOREIGN KEY (`driveFileId`) REFERENCES `drive_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `guias` ADD CONSTRAINT `guias_clientDocumentId_fkey` FOREIGN KEY (`clientDocumentId`) REFERENCES `client_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


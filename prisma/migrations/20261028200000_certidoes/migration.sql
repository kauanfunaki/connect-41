-- Certidões pelo Connect (28/10/2026): cada consulta de certidão vira uma
-- linha. Tabela nova; não altera registros existentes.
-- CreateTable
CREATE TABLE `certidoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `situacao` VARCHAR(20) NOT NULL,
    `codigo` VARCHAR(80) NULL,
    `emitidaEm` VARCHAR(10) NULL,
    `validaAte` VARCHAR(10) NULL,
    `mensagem` VARCHAR(500) NULL,
    `trimestre` VARCHAR(7) NULL,
    `driveFileId` VARCHAR(191) NULL,
    `pedidaPorId` VARCHAR(191) NULL,
    `vistaEm` DATETIME(3) NULL,
    `vistaPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `certidoes_tenantId_companyId_tipo_createdAt_idx`(`tenantId`, `companyId`, `tipo`, `createdAt`),
    INDEX `certidoes_tenantId_trimestre_idx`(`tenantId`, `trimestre`),
    INDEX `certidoes_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `certidoes_driveFileId_idx`(`driveFileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `certidoes` ADD CONSTRAINT `certidoes_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `certidoes` ADD CONSTRAINT `certidoes_driveFileId_fkey` FOREIGN KEY (`driveFileId`) REFERENCES `drive_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- Exportação para a Domínio (fila do BPO, 21/10): o código Matriz/Filial da
-- empresa e o de-para dos cadastros do financeiro para as contas contábeis.
-- Uma coluna nula e uma tabela nova; nada existente muda.
-- AlterTable
ALTER TABLE `companies` ADD COLUMN `dominioBranchCode` VARCHAR(20) NULL;

-- CreateTable
CREATE TABLE `dominio_account_maps` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `kind` ENUM('CATEGORIA', 'CONTA_BANCARIA', 'CONTRAPARTE') NOT NULL,
    `refId` VARCHAR(36) NOT NULL,
    `account` VARCHAR(20) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `dominio_account_maps_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `dominio_account_maps_companyId_kind_refId_key`(`companyId`, `kind`, `refId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `dominio_account_maps` ADD CONSTRAINT `dominio_account_maps_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


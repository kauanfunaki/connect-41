-- SST no DP 2, entrega 2: médicos do ASO e ambiente no contrato (funcionalidade-761)
CREATE TABLE `dp2_medicos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(70) NOT NULL,
    `crm` VARCHAR(10) NOT NULL,
    `uf` VARCHAR(2) NOT NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_medicos_tenantId_companyId_idx`(`tenantId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `dp2_vinculos` ADD COLUMN `ambienteId` VARCHAR(191) NULL;

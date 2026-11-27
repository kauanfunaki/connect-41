-- AlterTable
ALTER TABLE `companies` ADD COLUMN `capitalIntegralizado` DECIMAL(14, 2) NULL,
    ADD COLUMN `capitalSocial` DECIMAL(14, 2) NULL,
    ADD COLUMN `juntaRegistradoEm` DATETIME(3) NULL,
    ADD COLUMN `objetoSocial` TEXT NULL,
    ADD COLUMN `responsavelLegalCargo` VARCHAR(80) NULL,
    ADD COLUMN `responsavelLegalCpf` VARCHAR(11) NULL,
    ADD COLUMN `responsavelLegalEmail` VARCHAR(120) NULL,
    ADD COLUMN `responsavelLegalNome` VARCHAR(180) NULL,
    ADD COLUMN `responsavelLegalRg` VARCHAR(30) NULL;

-- CreateTable
CREATE TABLE `company_quadros_societarios` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `data` DATETIME(3) NOT NULL,
    `capitalSocial` DECIMAL(14, 2) NULL,
    `socios` JSON NOT NULL,
    `origem` VARCHAR(20) NOT NULL,
    `processId` VARCHAR(191) NULL,
    `registradoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `company_quadros_societarios_tenantId_companyId_data_idx`(`tenantId`, `companyId`, `data`),
    INDEX `company_quadros_societarios_companyId_idx`(`companyId`),
    INDEX `company_quadros_societarios_processId_idx`(`processId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `company_quadros_societarios` ADD CONSTRAINT `company_quadros_societarios_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_quadros_societarios` ADD CONSTRAINT `company_quadros_societarios_processId_fkey` FOREIGN KEY (`processId`) REFERENCES `processes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


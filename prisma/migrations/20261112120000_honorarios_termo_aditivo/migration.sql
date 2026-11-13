-- AlterTable
ALTER TABLE `company_partners` ADD COLUMN `maritalStatus` VARCHAR(40) NULL,
    ADD COLUMN `nationality` VARCHAR(60) NULL,
    ADD COLUMN `occupation` VARCHAR(120) NULL;

-- CreateTable
CREATE TABLE `hon_contatos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `papel` VARCHAR(15) NOT NULL,
    `nome` VARCHAR(180) NOT NULL,
    `telefone` VARCHAR(30) NULL,
    `email` VARCHAR(120) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `hon_contatos_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `hon_contatos_companyId_papel_key`(`companyId`, `papel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hon_modelo_do_termo` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nomeArquivo` VARCHAR(255) NOT NULL,
    `conteudo` MEDIUMBLOB NOT NULL,
    `cidade` VARCHAR(80) NOT NULL,
    `enviadoPor` VARCHAR(150) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `hon_modelo_do_termo_tenantId_key`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hon_termos_gerados` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `nomeArquivo` VARCHAR(255) NOT NULL,
    `driveFileId` VARCHAR(191) NULL,
    `geradoPor` VARCHAR(150) NOT NULL,
    `geradoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `hon_termos_gerados_tenantId_companyId_geradoEm_idx`(`tenantId`, `companyId`, `geradoEm`),
    INDEX `hon_termos_gerados_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `hon_contatos` ADD CONSTRAINT `hon_contatos_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hon_termos_gerados` ADD CONSTRAINT `hon_termos_gerados_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


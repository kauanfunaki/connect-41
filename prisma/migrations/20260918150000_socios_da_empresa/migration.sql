-- CreateTable
CREATE TABLE `company_partners` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `document` VARCHAR(14) NULL,
    `administrator` BOOLEAN NOT NULL DEFAULT false,
    `sharePercent` DECIMAL(7, 4) NULL,
    `zipCode` VARCHAR(10) NULL,
    `addressStreet` VARCHAR(180) NULL,
    `addressNumber` VARCHAR(20) NULL,
    `addressComplement` VARCHAR(80) NULL,
    `neighborhood` VARCHAR(80) NULL,
    `city` VARCHAR(80) NULL,
    `stateCode` VARCHAR(2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `company_partners_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `company_partners_tenantId_companyId_document_key`(`tenantId`, `companyId`, `document`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `company_partners` ADD CONSTRAINT `company_partners_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_partners` ADD CONSTRAINT `company_partners_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


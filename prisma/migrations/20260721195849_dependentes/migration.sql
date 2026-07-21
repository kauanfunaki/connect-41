-- CreateTable
CREATE TABLE `dependentes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(180) NOT NULL,
    `cpf` VARCHAR(14) NULL,
    `birthDate` DATETIME(3) NULL,
    `relationship` ENUM('CONJUGE', 'COMPANHEIRO', 'FILHO', 'ENTEADO', 'PAIS', 'OUTRO') NOT NULL DEFAULT 'OUTRO',
    `isIRDependent` BOOLEAN NOT NULL DEFAULT false,
    `isSalarioFamilia` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dependentes_tenantId_personId_idx`(`tenantId`, `personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `dependentes` ADD CONSTRAINT `dependentes_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dependentes` ADD CONSTRAINT `dependentes_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

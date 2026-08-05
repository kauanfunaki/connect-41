-- AlterTable: data do término do contrato (base do prazo legal) + tipo de aviso
ALTER TABLE `terminations` ADD COLUMN `terminationDate` DATETIME(3) NULL;
ALTER TABLE `terminations` ADD COLUMN `noticeType` ENUM('INDENIZADO', 'TRABALHADO', 'DISPENSADO', 'NAO_APLICAVEL') NULL;

-- CreateTable
CREATE TABLE `termination_checks` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `terminationId` VARCHAR(191) NOT NULL,
    `itemKey` VARCHAR(60) NOT NULL,
    `status` ENUM('PENDENTE', 'CONFERIDO', 'DIVERGENTE', 'NAO_APLICAVEL') NOT NULL DEFAULT 'PENDENTE',
    `informedValue` DECIMAL(12, 2) NULL,
    `note` TEXT NULL,
    `checkedById` VARCHAR(191) NULL,
    `checkedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `termination_checks_terminationId_itemKey_key`(`terminationId`, `itemKey`),
    INDEX `termination_checks_tenantId_status_idx`(`tenantId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `termination_checks` ADD CONSTRAINT `termination_checks_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `termination_checks` ADD CONSTRAINT `termination_checks_terminationId_fkey` FOREIGN KEY (`terminationId`) REFERENCES `terminations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `termination_checks` ADD CONSTRAINT `termination_checks_checkedById_fkey` FOREIGN KEY (`checkedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `assessment_links` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `candidaturaId` VARCHAR(191) NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `type` ENUM('DISC') NOT NULL DEFAULT 'DISC',
    `token` VARCHAR(64) NOT NULL,
    `status` ENUM('PENDENTE', 'RESPONDIDO') NOT NULL DEFAULT 'PENDENTE',
    `expiresAt` DATETIME(3) NOT NULL,
    `submittedAt` DATETIME(3) NULL,
    `answers` JSON NULL,
    `scores` JSON NULL,
    `primaryProfile` VARCHAR(4) NULL,
    `secondaryProfile` VARCHAR(4) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `assessment_links_token_key`(`token`),
    INDEX `assessment_links_tenantId_personId_idx`(`tenantId`, `personId`),
    INDEX `assessment_links_tenantId_sectorCode_status_idx`(`tenantId`, `sectorCode`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `assessment_links` ADD CONSTRAINT `assessment_links_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_links` ADD CONSTRAINT `assessment_links_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_links` ADD CONSTRAINT `assessment_links_candidaturaId_fkey` FOREIGN KEY (`candidaturaId`) REFERENCES `candidaturas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_links` ADD CONSTRAINT `assessment_links_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

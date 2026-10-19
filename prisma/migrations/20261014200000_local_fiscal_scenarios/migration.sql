CREATE TABLE `local_fiscal_scenarios` (
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `favorites` JSON NOT NULL,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`tenantId`, `userId`),
    INDEX `local_fiscal_scenarios_userId_idx` (`userId`),
    CONSTRAINT `local_fiscal_scenarios_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `local_fiscal_scenarios_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

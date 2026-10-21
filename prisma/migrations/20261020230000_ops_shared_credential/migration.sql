CREATE TABLE `ops_api_credentials` (
    `tenantId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ops_api_credentials_tokenHash_key`(`tokenHash`),
    PRIMARY KEY (`tenantId`),
    CONSTRAINT `ops_api_credentials_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

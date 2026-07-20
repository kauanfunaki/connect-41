-- CreateTable
CREATE TABLE `alert_dispatches` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `alertKey` VARCHAR(160) NOT NULL,
    `sentOn` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `alert_dispatches_tenantId_sentOn_idx`(`tenantId`, `sentOn`),
    UNIQUE INDEX `alert_dispatches_tenantId_alertKey_sentOn_key`(`tenantId`, `alertKey`, `sentOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `alert_dispatches` ADD CONSTRAINT `alert_dispatches_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


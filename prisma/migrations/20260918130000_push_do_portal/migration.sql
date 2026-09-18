-- CreateTable
CREATE TABLE `portal_push_subscriptions` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `portalUserId` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(500) NOT NULL,
    `p256dh` VARCHAR(255) NOT NULL,
    `auth` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `portal_push_subscriptions_endpoint_key`(`endpoint`),
    INDEX `portal_push_subscriptions_tenantId_portalUserId_idx`(`tenantId`, `portalUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `portal_push_subscriptions` ADD CONSTRAINT `portal_push_subscriptions_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `portal_push_subscriptions` ADD CONSTRAINT `portal_push_subscriptions_portalUserId_fkey` FOREIGN KEY (`portalUserId`) REFERENCES `portal_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


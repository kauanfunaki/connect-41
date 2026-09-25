-- Conversa e documentos dentro de cada processo do Societário (25/09).
-- CreateTable
CREATE TABLE `process_messages` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `processId` VARCHAR(191) NOT NULL,
    `authorUserId` VARCHAR(191) NULL,
    `authorPortalUserId` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `process_messages_processId_createdAt_idx`(`processId`, `createdAt`),
    INDEX `process_messages_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `process_documents` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `processId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NULL,
    `uploadedByUserId` VARCHAR(191) NULL,
    `uploadedByPortalUserId` VARCHAR(191) NULL,
    `description` VARCHAR(200) NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `fileUrl` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `process_documents_processId_createdAt_idx`(`processId`, `createdAt`),
    INDEX `process_documents_messageId_idx`(`messageId`),
    INDEX `process_documents_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `process_messages` ADD CONSTRAINT `process_messages_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_messages` ADD CONSTRAINT `process_messages_processId_fkey` FOREIGN KEY (`processId`) REFERENCES `processes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_messages` ADD CONSTRAINT `process_messages_authorUserId_fkey` FOREIGN KEY (`authorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_messages` ADD CONSTRAINT `process_messages_authorPortalUserId_fkey` FOREIGN KEY (`authorPortalUserId`) REFERENCES `portal_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_documents` ADD CONSTRAINT `process_documents_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_documents` ADD CONSTRAINT `process_documents_processId_fkey` FOREIGN KEY (`processId`) REFERENCES `processes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_documents` ADD CONSTRAINT `process_documents_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `process_messages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_documents` ADD CONSTRAINT `process_documents_uploadedByUserId_fkey` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `process_documents` ADD CONSTRAINT `process_documents_uploadedByPortalUserId_fkey` FOREIGN KEY (`uploadedByPortalUserId`) REFERENCES `portal_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


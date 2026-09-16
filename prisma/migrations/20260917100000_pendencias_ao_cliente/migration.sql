-- Pendências ao cliente: pedido da equipe ao cliente (documento, informação,
-- confirmação), conversa e anexos. Aditiva: só cria tabelas.

-- CreateTable
CREATE TABLE `client_requests` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `kind` ENUM('DOCUMENTO', 'INFORMACAO', 'CONFIRMACAO') NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `description` TEXT NULL,
    `dueDate` DATETIME(3) NULL,
    `status` ENUM('ABERTA', 'RESPONDIDA', 'RESOLVIDA', 'CANCELADA') NOT NULL DEFAULT 'ABERTA',
    `financeEntryId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolvedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `client_requests_tenantId_status_dueDate_idx`(`tenantId`, `status`, `dueDate`),
    INDEX `client_requests_tenantId_companyId_status_idx`(`tenantId`, `companyId`, `status`),
    INDEX `client_requests_financeEntryId_idx`(`financeEntryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `client_request_messages` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `authorUserId` VARCHAR(191) NULL,
    `authorPortalUserId` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `client_request_messages_requestId_createdAt_idx`(`requestId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `client_request_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NULL,
    `uploadedByUserId` VARCHAR(191) NULL,
    `uploadedByPortalUserId` VARCHAR(191) NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `fileUrl` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `client_request_attachments_requestId_idx`(`requestId`),
    INDEX `client_request_attachments_messageId_idx`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `client_requests` ADD CONSTRAINT `client_requests_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_requests` ADD CONSTRAINT `client_requests_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_requests` ADD CONSTRAINT `client_requests_financeEntryId_fkey` FOREIGN KEY (`financeEntryId`) REFERENCES `finance_entries`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_requests` ADD CONSTRAINT `client_requests_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_requests` ADD CONSTRAINT `client_requests_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_request_messages` ADD CONSTRAINT `client_request_messages_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `client_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_request_messages` ADD CONSTRAINT `client_request_messages_authorUserId_fkey` FOREIGN KEY (`authorUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_request_messages` ADD CONSTRAINT `client_request_messages_authorPortalUserId_fkey` FOREIGN KEY (`authorPortalUserId`) REFERENCES `portal_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_request_attachments` ADD CONSTRAINT `client_request_attachments_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `client_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_request_attachments` ADD CONSTRAINT `client_request_attachments_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `client_request_messages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_request_attachments` ADD CONSTRAINT `client_request_attachments_uploadedByUserId_fkey` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_request_attachments` ADD CONSTRAINT `client_request_attachments_uploadedByPortalUserId_fkey` FOREIGN KEY (`uploadedByPortalUserId`) REFERENCES `portal_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

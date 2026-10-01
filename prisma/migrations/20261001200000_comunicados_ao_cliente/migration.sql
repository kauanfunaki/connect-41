-- Comunicados da 41 aos clientes (01/10/2026).
--
-- Só tabelas novas. Rodar antes da publicação: a home do portal conta os
-- comunicados não lidos, e sem a tabela ela cai.

-- CreateTable
CREATE TABLE `client_announcements` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `body` TEXT NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `notifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `client_announcements_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `client_announcement_groups` (
    `id` VARCHAR(191) NOT NULL,
    `announcementId` VARCHAR(191) NOT NULL,
    `clientGroupId` VARCHAR(191) NOT NULL,

    INDEX `client_announcement_groups_clientGroupId_idx`(`clientGroupId`),
    UNIQUE INDEX `client_announcement_groups_announcementId_clientGroupId_key`(`announcementId`, `clientGroupId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `client_announcement_reads` (
    `id` VARCHAR(191) NOT NULL,
    `announcementId` VARCHAR(191) NOT NULL,
    `portalUserId` VARCHAR(191) NOT NULL,
    `readAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `client_announcement_reads_portalUserId_idx`(`portalUserId`),
    UNIQUE INDEX `client_announcement_reads_announcementId_portalUserId_key`(`announcementId`, `portalUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `client_announcement_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `announcementId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `fileUrl` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `client_announcement_attachments_announcementId_idx`(`announcementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `client_announcements` ADD CONSTRAINT `client_announcements_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_announcements` ADD CONSTRAINT `client_announcements_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_announcement_groups` ADD CONSTRAINT `client_announcement_groups_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `client_announcements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_announcement_groups` ADD CONSTRAINT `client_announcement_groups_clientGroupId_fkey` FOREIGN KEY (`clientGroupId`) REFERENCES `client_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_announcement_reads` ADD CONSTRAINT `client_announcement_reads_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `client_announcements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_announcement_reads` ADD CONSTRAINT `client_announcement_reads_portalUserId_fkey` FOREIGN KEY (`portalUserId`) REFERENCES `portal_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `client_announcement_attachments` ADD CONSTRAINT `client_announcement_attachments_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `client_announcements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


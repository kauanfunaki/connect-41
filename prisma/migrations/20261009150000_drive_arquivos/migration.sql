-- Arquivos (Drive) do Connect (09/10/2026): pastas por empresa e internas do
-- escritório, compartilháveis com o cliente pelo portal.
--
-- Só tabelas novas: nada muda em tabela que o app já lê. Ainda assim, rodar
-- ANTES da publicação — as telas /arquivos, a aba Arquivos da empresa e a área
-- Arquivos do portal consultam estas tabelas, e a tabela ausente derruba as três.
--
-- Os arquivos em si ficam em disco, em storage/drive/<tenant>/, dentro do volume
-- único de /app/storage no EasyPanel. Nenhuma pasta nasce aqui: cada empresa
-- ganha as pastas do modelo na primeira vez que alguém abre os Arquivos dela.

-- CreateTable
CREATE TABLE `drive_folders` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `parentId` VARCHAR(191) NULL,
    `name` VARCHAR(120) NOT NULL,
    `sectorCode` VARCHAR(40) NULL,
    `systemKey` VARCHAR(60) NULL,
    `sharedWithPortal` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,

    INDEX `drive_folders_tenantId_companyId_parentId_idx`(`tenantId`, `companyId`, `parentId`),
    INDEX `drive_folders_tenantId_deletedAt_idx`(`tenantId`, `deletedAt`),
    INDEX `drive_folders_deletedAt_idx`(`deletedAt`),
    UNIQUE INDEX `drive_folders_tenantId_companyId_systemKey_key`(`tenantId`, `companyId`, `systemKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `drive_files` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `folderId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `storageKey` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `uploadedByUserId` VARCHAR(191) NULL,
    `uploadedByPortalUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `deletedById` VARCHAR(191) NULL,

    INDEX `drive_files_tenantId_folderId_idx`(`tenantId`, `folderId`),
    INDEX `drive_files_tenantId_deletedAt_idx`(`tenantId`, `deletedAt`),
    INDEX `drive_files_deletedAt_idx`(`deletedAt`),
    INDEX `drive_files_tenantId_uploadedByPortalUserId_createdAt_idx`(`tenantId`, `uploadedByPortalUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `drive_file_accesses` (
    `id` VARCHAR(191) NOT NULL,
    `fileId` VARCHAR(191) NOT NULL,
    `portalUserId` VARCHAR(191) NULL,
    `kind` ENUM('VIEW', 'DOWNLOAD') NOT NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `drive_file_accesses_fileId_createdAt_idx`(`fileId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `drive_template_folders` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `sectorCode` VARCHAR(40) NULL,
    `sharedWithPortal` BOOLEAN NOT NULL DEFAULT false,
    `position` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `drive_template_folders_tenantId_position_idx`(`tenantId`, `position`),
    UNIQUE INDEX `drive_template_folders_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `drive_folders` ADD CONSTRAINT `drive_folders_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drive_folders` ADD CONSTRAINT `drive_folders_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drive_folders` ADD CONSTRAINT `drive_folders_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `drive_folders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drive_files` ADD CONSTRAINT `drive_files_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drive_files` ADD CONSTRAINT `drive_files_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `drive_folders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drive_files` ADD CONSTRAINT `drive_files_uploadedByUserId_fkey` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drive_files` ADD CONSTRAINT `drive_files_uploadedByPortalUserId_fkey` FOREIGN KEY (`uploadedByPortalUserId`) REFERENCES `portal_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drive_file_accesses` ADD CONSTRAINT `drive_file_accesses_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `drive_files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drive_file_accesses` ADD CONSTRAINT `drive_file_accesses_portalUserId_fkey` FOREIGN KEY (`portalUserId`) REFERENCES `portal_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `drive_template_folders` ADD CONSTRAINT `drive_template_folders_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


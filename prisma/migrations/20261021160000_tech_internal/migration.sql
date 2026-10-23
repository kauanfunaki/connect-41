-- CreateTable
CREATE TABLE `tech_internal_tools` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tech_internal_tools_tenantId_active_idx`(`tenantId`, `active`),
    UNIQUE INDEX `tech_internal_tools_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `tech_internal_tools_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tech_internal_items` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NULL,
    `type` ENUM('BUG', 'IMPROVEMENT', 'FEATURE', 'TEST', 'MIGRATION') NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'VALIDATION', 'DONE', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `systemMode` ENUM('NONE', 'EXISTING', 'NEW') NOT NULL DEFAULT 'NONE',
    `toolId` VARCHAR(191) NULL,
    `assigneeId` VARCHAR(191) NULL,
    `dueDate` DATE NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tech_internal_items_tenantId_status_priority_dueDate_idx`(`tenantId`, `status`, `priority`, `dueDate`),
    INDEX `tech_internal_items_tenantId_toolId_idx`(`tenantId`, `toolId`),
    INDEX `tech_internal_items_tenantId_assigneeId_idx`(`tenantId`, `assigneeId`),
    UNIQUE INDEX `tech_internal_items_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tech_internal_comments` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `authorName` VARCHAR(120) NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tech_internal_comments_tenantId_itemId_createdAt_idx`(`tenantId`, `itemId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tech_internal_changes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `authorName` VARCHAR(120) NOT NULL,
    `version` INTEGER NOT NULL,
    `changes` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tech_internal_changes_tenantId_itemId_createdAt_idx`(`tenantId`, `itemId`, `createdAt`),
    UNIQUE INDEX `tech_internal_changes_tenantId_itemId_version_key`(`tenantId`, `itemId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tech_internal_tools` ADD CONSTRAINT `tech_internal_tools_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tech_internal_items` ADD CONSTRAINT `tech_internal_items_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tech_internal_items` ADD CONSTRAINT `tech_internal_items_tenantId_toolId_fkey` FOREIGN KEY (`tenantId`, `toolId`) REFERENCES `tech_internal_tools`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tech_internal_items` ADD CONSTRAINT `tech_internal_items_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tech_internal_comments` ADD CONSTRAINT `tech_internal_comments_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tech_internal_comments` ADD CONSTRAINT `tech_internal_comments_tenantId_itemId_fkey` FOREIGN KEY (`tenantId`, `itemId`) REFERENCES `tech_internal_items`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tech_internal_changes` ADD CONSTRAINT `tech_internal_changes_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tech_internal_changes` ADD CONSTRAINT `tech_internal_changes_tenantId_itemId_fkey` FOREIGN KEY (`tenantId`, `itemId`) REFERENCES `tech_internal_items`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

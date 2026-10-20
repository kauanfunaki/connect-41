-- Ops Center: tabelas novas, sem importar dados ou ativar módulos existentes.
CREATE TABLE `ops_watchers` (
    `tenantId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `slug` VARCHAR(60) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(1000) NULL,
    `client` VARCHAR(120) NULL,
    `folderInput` VARCHAR(1000) NULL,
    `folderOutput` VARCHAR(1000) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 0,
    `tokenHash` CHAR(64) NULL,
    `lastHeartbeatAt` DATETIME(3) NULL,
    `instabilityReportedAt` DATETIME(3) NULL,
    `instabilityReportedBy` VARCHAR(191) NULL,
    `instabilityNote` TEXT NULL,
    `instabilityTicketId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `ops_watchers_tokenHash_key`(`tokenHash`),
    INDEX `ops_watchers_tenantId_ownerId_idx`(`tenantId`, `ownerId`),
    PRIMARY KEY (`tenantId`, `slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ops_events` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `watcherSlug` VARCHAR(60) NOT NULL,
    `eventId` VARCHAR(100) NOT NULL,
    `payloadHash` CHAR(64) NOT NULL,
    `filename` VARCHAR(1000) NOT NULL,
    `filenameRenamed` VARCHAR(1000) NULL,
    `status` VARCHAR(10) NOT NULL,
    `errorMessage` TEXT NULL,
    `client` VARCHAR(120) NULL,
    `n8nExecutionId` VARCHAR(120) NULL,
    `processedAt` DATETIME(3) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `ops_events_tenantId_watcherSlug_eventId_key`(`tenantId`, `watcherSlug`, `eventId`),
    INDEX `ops_events_tenantId_processedAt_idx`(`tenantId`, `processedAt`),
    INDEX `ops_events_tenantId_status_processedAt_idx`(`tenantId`, `status`, `processedAt`),
    INDEX `ops_events_tenantId_watcherSlug_processedAt_idx`(`tenantId`, `watcherSlug`, `processedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ops_watchers` ADD CONSTRAINT `ops_watchers_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ops_watchers` ADD CONSTRAINT `ops_watchers_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ops_events` ADD CONSTRAINT `ops_events_tenantId_watcherSlug_fkey` FOREIGN KEY (`tenantId`, `watcherSlug`) REFERENCES `ops_watchers`(`tenantId`, `slug`) ON DELETE RESTRICT ON UPDATE CASCADE;

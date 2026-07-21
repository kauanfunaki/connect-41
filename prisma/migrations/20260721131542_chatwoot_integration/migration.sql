-- CreateTable
CREATE TABLE `chatwoot_connections` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `baseUrl` VARCHAR(255) NOT NULL,
    `accountId` VARCHAR(40) NOT NULL,
    `apiTokenEnc` TEXT NOT NULL,
    `webhookSecretEnc` TEXT NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `lastSyncAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `chatwoot_connections_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `chatwoot_connections_tenantId_accountId_key`(`tenantId`, `accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chatwoot_contact_links` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `chatwootContactId` INTEGER NOT NULL,
    `personId` VARCHAR(191) NULL,
    `companyId` VARCHAR(191) NULL,
    `chatwootEmail` VARCHAR(180) NULL,
    `chatwootPhoneE164` VARCHAR(20) NULL,
    `linkMethod` ENUM('MANUAL', 'EMAIL', 'PHONE', 'ASSISTED', 'UNLINKED') NOT NULL DEFAULT 'UNLINKED',
    `linkConfidence` INTEGER NULL,
    `lastSyncAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `chatwoot_contact_links_tenantId_personId_idx`(`tenantId`, `personId`),
    INDEX `chatwoot_contact_links_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `chatwoot_contact_links_tenantId_connectionId_chatwootContact_key`(`tenantId`, `connectionId`, `chatwootContactId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chatwoot_conversations` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `chatwootConversationId` INTEGER NOT NULL,
    `contactLinkId` VARCHAR(191) NULL,
    `inboxId` INTEGER NOT NULL,
    `assigneeLabel` VARCHAR(120) NULL,
    `teamLabel` VARCHAR(120) NULL,
    `status` VARCHAR(30) NOT NULL,
    `priority` VARCHAR(20) NULL,
    `labels` JSON NULL,
    `channel` VARCHAR(60) NOT NULL,
    `lastActivityAt` DATETIME(3) NULL,
    `unreadCount` INTEGER NOT NULL DEFAULT 0,
    `lastMessagePreview` VARCHAR(280) NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chatwoot_conversations_tenantId_contactLinkId_idx`(`tenantId`, `contactLinkId`),
    INDEX `chatwoot_conversations_tenantId_status_lastActivityAt_idx`(`tenantId`, `status`, `lastActivityAt`),
    UNIQUE INDEX `chatwoot_conversations_tenantId_connectionId_chatwootConvers_key`(`tenantId`, `connectionId`, `chatwootConversationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chatwoot_messages` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `chatwootMessageId` INTEGER NOT NULL,
    `senderLabel` VARCHAR(120) NULL,
    `senderType` VARCHAR(30) NOT NULL,
    `messageType` VARCHAR(20) NOT NULL,
    `contentType` VARCHAR(30) NOT NULL,
    `content` TEXT NULL,
    `isPrivate` BOOLEAN NOT NULL DEFAULT false,
    `attachments` JSON NULL,
    `chatwootCreatedAt` DATETIME(3) NOT NULL,
    `chatwootUpdatedAt` DATETIME(3) NULL,
    `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chatwoot_messages_tenantId_conversationId_chatwootCreatedAt_idx`(`tenantId`, `conversationId`, `chatwootCreatedAt`),
    UNIQUE INDEX `chatwoot_messages_tenantId_conversationId_chatwootMessageId_key`(`tenantId`, `conversationId`, `chatwootMessageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chatwoot_webhook_events` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(60) NOT NULL,
    `externalEventId` VARCHAR(180) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,
    `error` TEXT NULL,

    INDEX `chatwoot_webhook_events_tenantId_status_idx`(`tenantId`, `status`),
    UNIQUE INDEX `chatwoot_webhook_events_tenantId_connectionId_externalEventI_key`(`tenantId`, `connectionId`, `externalEventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chatwoot_sync_runs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `nextPage` INTEGER NOT NULL DEFAULT 1,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `recordsRead` INTEGER NOT NULL DEFAULT 0,
    `recordsCreated` INTEGER NOT NULL DEFAULT 0,
    `recordsUpdated` INTEGER NOT NULL DEFAULT 0,
    `recordsSkipped` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,

    INDEX `chatwoot_sync_runs_tenantId_connectionId_startedAt_idx`(`tenantId`, `connectionId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `chatwoot_connections` ADD CONSTRAINT `chatwoot_connections_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chatwoot_contact_links` ADD CONSTRAINT `chatwoot_contact_links_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `chatwoot_connections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chatwoot_contact_links` ADD CONSTRAINT `chatwoot_contact_links_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chatwoot_contact_links` ADD CONSTRAINT `chatwoot_contact_links_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chatwoot_conversations` ADD CONSTRAINT `chatwoot_conversations_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `chatwoot_connections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chatwoot_conversations` ADD CONSTRAINT `chatwoot_conversations_contactLinkId_fkey` FOREIGN KEY (`contactLinkId`) REFERENCES `chatwoot_contact_links`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chatwoot_messages` ADD CONSTRAINT `chatwoot_messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `chatwoot_conversations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chatwoot_webhook_events` ADD CONSTRAINT `chatwoot_webhook_events_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `chatwoot_connections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chatwoot_sync_runs` ADD CONSTRAINT `chatwoot_sync_runs_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `chatwoot_connections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

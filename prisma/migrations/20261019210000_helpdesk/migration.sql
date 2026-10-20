-- CreateTable
CREATE TABLE `helpdesk_requester_sectors` (
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,

    PRIMARY KEY (`tenantId`, `sectorCode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helpdesk_categories` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 0,
    `descriptionTemplate` TEXT NOT NULL,
    `templateApplyMode` VARCHAR(30) NOT NULL DEFAULT 'replace_if_empty',
    `formSchema` JSON NOT NULL,
    `requiredAttachments` JSON NOT NULL,
    `checklistTemplate` JSON NOT NULL,
    `requiresApproval` BOOLEAN NOT NULL DEFAULT false,
    `approvalMode` VARCHAR(30) NOT NULL DEFAULT 'REQUESTER_COORDINATOR',
    `approvalUserIds` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `helpdesk_categories_tenantId_active_idx`(`tenantId`, `active`),
    UNIQUE INDEX `helpdesk_categories_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `helpdesk_categories_tenantId_name_key`(`tenantId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helpdesk_sla_policies` (
    `tenantId` VARCHAR(191) NOT NULL,
    `priority` ENUM('BAIXA', 'MEDIA', 'ALTA', 'URGENTE') NOT NULL,
    `firstResponseMinutes` INTEGER NOT NULL,
    `resolutionMinutes` INTEGER NOT NULL,

    PRIMARY KEY (`tenantId`, `priority`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helpdesk_drafts` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `payload` JSON NOT NULL,
    `review` JSON NULL,
    `reviewVersion` INTEGER NULL,
    `analysisToken` VARCHAR(191) NULL,
    `analysisStartedAt` DATETIME(3) NULL,
    `submittedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `helpdesk_drafts_tenantId_createdById_submittedAt_idx`(`tenantId`, `createdById`, `submittedAt`),
    UNIQUE INDEX `helpdesk_drafts_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helpdesk_triage_messages` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `draftId` VARCHAR(191) NOT NULL,
    `role` VARCHAR(20) NOT NULL,
    `body` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `helpdesk_triage_messages_tenantId_draftId_createdAt_idx`(`tenantId`, `draftId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helpdesk_tickets` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `draftId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `requesterSectorCode` VARCHAR(40) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `status` ENUM('ABERTO', 'NA_FILA', 'EM_ANDAMENTO', 'AGUARDANDO_USUARIO', 'AGUARDANDO_APROVACAO', 'AGUARDANDO_REQUERENTE', 'STANDBY', 'RESOLVIDO', 'CANCELADO') NOT NULL DEFAULT 'ABERTO',
    `priority` ENUM('BAIXA', 'MEDIA', 'ALTA', 'URGENTE') NOT NULL DEFAULT 'MEDIA',
    `requestData` JSON NOT NULL,
    `tags` JSON NOT NULL,
    `approverIds` JSON NOT NULL,
    `approvalRequired` BOOLEAN NOT NULL DEFAULT false,
    `approvalStatus` VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUIRED',
    `queueOrder` INTEGER NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,

    UNIQUE INDEX `helpdesk_tickets_draftId_key`(`draftId`),
    INDEX `helpdesk_tickets_tenantId_status_queueOrder_idx`(`tenantId`, `status`, `queueOrder`),
    INDEX `helpdesk_tickets_tenantId_createdById_createdAt_idx`(`tenantId`, `createdById`, `createdAt`),
    INDEX `helpdesk_tickets_tenantId_requesterSectorCode_status_idx`(`tenantId`, `requesterSectorCode`, `status`),
    UNIQUE INDEX `helpdesk_tickets_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `helpdesk_tickets_tenantId_draftId_key`(`tenantId`, `draftId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helpdesk_assignees` (
    `tenantId` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`tenantId`, `ticketId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helpdesk_participants` (
    `tenantId` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`tenantId`, `ticketId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helpdesk_comments` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `internal` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `helpdesk_comments_tenantId_ticketId_createdAt_idx`(`tenantId`, `ticketId`, `createdAt`),
    UNIQUE INDEX `helpdesk_comments_tenantId_id_key`(`tenantId`, `id`),
    UNIQUE INDEX `helpdesk_comments_tenantId_ticketId_requestId_key`(`tenantId`, `ticketId`, `requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helpdesk_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `draftId` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NULL,
    `commentId` VARCHAR(191) NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `sha256` VARCHAR(64) NOT NULL,
    `attachmentKey` VARCHAR(80) NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `fileUrl` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `internal` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `helpdesk_attachments_tenantId_draftId_idx`(`tenantId`, `draftId`),
    INDEX `helpdesk_attachments_tenantId_ticketId_idx`(`tenantId`, `ticketId`),
    UNIQUE INDEX `helpdesk_attachments_tenantId_id_key`(`tenantId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helpdesk_checklist_items` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(80) NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `doneById` VARCHAR(191) NULL,
    `doneAt` DATETIME(3) NULL,

    UNIQUE INDEX `helpdesk_checklist_items_tenantId_ticketId_key_key`(`tenantId`, `ticketId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helpdesk_sla_cycles` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `cycleNumber` INTEGER NOT NULL,
    `openedAt` DATETIME(3) NOT NULL,
    `firstResponseDueAt` DATETIME(3) NOT NULL,
    `resolutionDueAt` DATETIME(3) NOT NULL,
    `firstResponseAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `pausedAt` DATETIME(3) NULL,
    `pausedMinutes` INTEGER NOT NULL DEFAULT 0,
    `manualDeadline` BOOLEAN NOT NULL DEFAULT false,

    INDEX `helpdesk_sla_cycles_tenantId_resolvedAt_resolutionDueAt_idx`(`tenantId`, `resolvedAt`, `resolutionDueAt`),
    UNIQUE INDEX `helpdesk_sla_cycles_tenantId_ticketId_cycleNumber_key`(`tenantId`, `ticketId`, `cycleNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helpdesk_events` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `type` VARCHAR(60) NOT NULL,
    `data` JSON NOT NULL,
    `internal` BOOLEAN NOT NULL DEFAULT false,
    `dedupKey` VARCHAR(191) NULL,
    `dispatchedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `helpdesk_events_tenantId_ticketId_createdAt_idx`(`tenantId`, `ticketId`, `createdAt`),
    INDEX `helpdesk_events_tenantId_dispatchedAt_createdAt_idx`(`tenantId`, `dispatchedAt`, `createdAt`),
    UNIQUE INDEX `helpdesk_events_tenantId_dedupKey_key`(`tenantId`, `dedupKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helpdesk_approvals` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `cycleNumber` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `decidedById` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedAt` DATETIME(3) NULL,

    UNIQUE INDEX `helpdesk_approvals_tenantId_ticketId_cycleNumber_key`(`tenantId`, `ticketId`, `cycleNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `helpdesk_reopen_requests` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `decidedById` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedAt` DATETIME(3) NULL,

    INDEX `helpdesk_reopen_requests_tenantId_ticketId_status_idx`(`tenantId`, `ticketId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `helpdesk_requester_sectors` ADD CONSTRAINT `helpdesk_requester_sectors_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_categories` ADD CONSTRAINT `helpdesk_categories_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_categories` ADD CONSTRAINT `helpdesk_categories_tenantId_parentId_fkey` FOREIGN KEY (`tenantId`, `parentId`) REFERENCES `helpdesk_categories`(`tenantId`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `helpdesk_sla_policies` ADD CONSTRAINT `helpdesk_sla_policies_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_drafts` ADD CONSTRAINT `helpdesk_drafts_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_triage_messages` ADD CONSTRAINT `helpdesk_triage_messages_tenantId_draftId_fkey` FOREIGN KEY (`tenantId`, `draftId`) REFERENCES `helpdesk_drafts`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_tickets` ADD CONSTRAINT `helpdesk_tickets_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_tickets` ADD CONSTRAINT `helpdesk_tickets_tenantId_draftId_fkey` FOREIGN KEY (`tenantId`, `draftId`) REFERENCES `helpdesk_drafts`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_tickets` ADD CONSTRAINT `helpdesk_tickets_tenantId_categoryId_fkey` FOREIGN KEY (`tenantId`, `categoryId`) REFERENCES `helpdesk_categories`(`tenantId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_assignees` ADD CONSTRAINT `helpdesk_assignees_tenantId_ticketId_fkey` FOREIGN KEY (`tenantId`, `ticketId`) REFERENCES `helpdesk_tickets`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_participants` ADD CONSTRAINT `helpdesk_participants_tenantId_ticketId_fkey` FOREIGN KEY (`tenantId`, `ticketId`) REFERENCES `helpdesk_tickets`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_comments` ADD CONSTRAINT `helpdesk_comments_tenantId_ticketId_fkey` FOREIGN KEY (`tenantId`, `ticketId`) REFERENCES `helpdesk_tickets`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_attachments` ADD CONSTRAINT `helpdesk_attachments_tenantId_draftId_fkey` FOREIGN KEY (`tenantId`, `draftId`) REFERENCES `helpdesk_drafts`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_attachments` ADD CONSTRAINT `helpdesk_attachments_tenantId_ticketId_fkey` FOREIGN KEY (`tenantId`, `ticketId`) REFERENCES `helpdesk_tickets`(`tenantId`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `helpdesk_attachments` ADD CONSTRAINT `helpdesk_attachments_tenantId_commentId_fkey` FOREIGN KEY (`tenantId`, `commentId`) REFERENCES `helpdesk_comments`(`tenantId`, `id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `helpdesk_checklist_items` ADD CONSTRAINT `helpdesk_checklist_items_tenantId_ticketId_fkey` FOREIGN KEY (`tenantId`, `ticketId`) REFERENCES `helpdesk_tickets`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_sla_cycles` ADD CONSTRAINT `helpdesk_sla_cycles_tenantId_ticketId_fkey` FOREIGN KEY (`tenantId`, `ticketId`) REFERENCES `helpdesk_tickets`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_events` ADD CONSTRAINT `helpdesk_events_tenantId_ticketId_fkey` FOREIGN KEY (`tenantId`, `ticketId`) REFERENCES `helpdesk_tickets`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_approvals` ADD CONSTRAINT `helpdesk_approvals_tenantId_ticketId_fkey` FOREIGN KEY (`tenantId`, `ticketId`) REFERENCES `helpdesk_tickets`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `helpdesk_reopen_requests` ADD CONSTRAINT `helpdesk_reopen_requests_tenantId_ticketId_fkey` FOREIGN KEY (`tenantId`, `ticketId`) REFERENCES `helpdesk_tickets`(`tenantId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

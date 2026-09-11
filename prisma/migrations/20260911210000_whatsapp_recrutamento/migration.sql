-- CreateTable
CREATE TABLE `whatsapp_threads` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `integrationId` VARCHAR(191) NOT NULL,
    `waPhone` VARCHAR(20) NOT NULL,
    `personId` VARCHAR(191) NULL,
    `candidaturaId` VARCHAR(191) NULL,
    `lastInboundAt` DATETIME(3) NULL,
    `optedOutAt` DATETIME(3) NULL,
    `handoffAt` DATETIME(3) NULL,
    `handoffReason` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `whatsapp_threads_tenantId_handoffAt_idx`(`tenantId`, `handoffAt`),
    UNIQUE INDEX `whatsapp_threads_integrationId_waPhone_key`(`integrationId`, `waPhone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_messages` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `direction` ENUM('ENTRADA', 'SAIDA') NOT NULL,
    `waMessageId` VARCHAR(120) NULL,
    `body` TEXT NOT NULL,
    `status` ENUM('PENDENTE', 'ENVIADA', 'FALHOU', 'BLOQUEADA') NULL,
    `error` VARCHAR(500) NULL,
    `agentRunId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `whatsapp_messages_threadId_createdAt_idx`(`threadId`, `createdAt`),
    INDEX `whatsapp_messages_tenantId_direction_createdAt_idx`(`tenantId`, `direction`, `createdAt`),
    UNIQUE INDEX `whatsapp_messages_waMessageId_key`(`waMessageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `whatsapp_threads` ADD CONSTRAINT `whatsapp_threads_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_messages` ADD CONSTRAINT `whatsapp_messages_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_messages` ADD CONSTRAINT `whatsapp_messages_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `whatsapp_threads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


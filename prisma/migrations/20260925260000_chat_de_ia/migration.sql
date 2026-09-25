-- Chat de IA do canto da tela (25/09): conversas por pessoa e quem vê o chat.
-- Só tabelas novas — nada muda nas existentes.
-- CreateTable
CREATE TABLE `ai_chat_settings` (
    `tenantId` VARCHAR(191) NOT NULL,
    `audience` ENUM('COORDENADORES', 'TODOS') NOT NULL DEFAULT 'COORDENADORES',
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent_conversations` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `agentCode` VARCHAR(60) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `agent_conversations_tenantId_userId_updatedAt_idx`(`tenantId`, `userId`, `updatedAt`),
    INDEX `agent_conversations_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent_messages` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `role` ENUM('USUARIO', 'ASSISTENTE') NOT NULL,
    `content` TEXT NOT NULL,
    `proposals` JSON NULL,
    `runId` VARCHAR(191) NULL,
    `truncated` BOOLEAN NOT NULL DEFAULT false,
    `failed` BOOLEAN NOT NULL DEFAULT false,
    `contextLabel` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `agent_messages_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_chat_settings` ADD CONSTRAINT `ai_chat_settings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_conversations` ADD CONSTRAINT `agent_conversations_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_conversations` ADD CONSTRAINT `agent_conversations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_messages` ADD CONSTRAINT `agent_messages_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `agent_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


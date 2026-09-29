-- Fila de propostas da IA (funções de IA do protótipo do Societário, 29/09).
-- CreateTable
CREATE TABLE `agent_proposals` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `agentCode` VARCHAR(60) NOT NULL,
    `runId` VARCHAR(191) NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `entityType` VARCHAR(40) NULL,
    `entityId` VARCHAR(191) NULL,
    `title` VARCHAR(200) NOT NULL,
    `payload` JSON NOT NULL,
    `confidence` ENUM('ALTA', 'MEDIA', 'BAIXA') NULL,
    `status` ENUM('PENDENTE', 'APROVADA', 'EDITADA', 'REJEITADA') NOT NULL DEFAULT 'PENDENTE',
    `appliedPayload` JSON NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `agent_proposals_tenantId_sectorCode_status_createdAt_idx`(`tenantId`, `sectorCode`, `status`, `createdAt`),
    INDEX `agent_proposals_tenantId_agentCode_createdAt_idx`(`tenantId`, `agentCode`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `agent_proposals` ADD CONSTRAINT `agent_proposals_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_proposals` ADD CONSTRAINT `agent_proposals_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_proposals` ADD CONSTRAINT `agent_proposals_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


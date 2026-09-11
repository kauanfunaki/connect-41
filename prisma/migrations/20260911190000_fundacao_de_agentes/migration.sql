-- CreateTable
CREATE TABLE `tenant_agents` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `agentCode` VARCHAR(60) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `model` VARCHAR(80) NULL,
    `monthlyCapCents` INTEGER NULL,
    `monthlyCapCalls` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tenant_agents_tenantId_enabled_idx`(`tenantId`, `enabled`),
    UNIQUE INDEX `tenant_agents_tenantId_agentCode_key`(`tenantId`, `agentCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent_runs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `agentCode` VARCHAR(60) NOT NULL,
    `trigger` ENUM('USUARIO', 'CRON', 'SISTEMA') NOT NULL DEFAULT 'USUARIO',
    `userId` VARCHAR(191) NULL,
    `entityType` VARCHAR(40) NULL,
    `entityId` VARCHAR(191) NULL,
    `provider` ENUM('ANTHROPIC', 'OPENAI') NOT NULL,
    `model` VARCHAR(80) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `ok` BOOLEAN NULL,
    `error` VARCHAR(500) NULL,
    `inputTokens` INTEGER NULL,
    `outputTokens` INTEGER NULL,
    `costCents` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `agent_runs_tenantId_agentCode_startedAt_idx`(`tenantId`, `agentCode`, `startedAt`),
    INDEX `agent_runs_tenantId_startedAt_idx`(`tenantId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenant_agents` ADD CONSTRAINT `tenant_agents_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_runs` ADD CONSTRAINT `agent_runs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


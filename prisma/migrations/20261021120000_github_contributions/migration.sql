-- CreateTable
CREATE TABLE `github_connections` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `integrationId` VARCHAR(191) NOT NULL,
    `githubUserId` VARCHAR(100) NULL,
    `login` VARCHAR(100) NULL,
    `connectedBy` VARCHAR(191) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'disconnected',
    `generation` INTEGER NOT NULL DEFAULT 0,
    `timezone` VARCHAR(80) NOT NULL DEFAULT 'America/Sao_Paulo',
    `intervalMinutes` INTEGER NOT NULL DEFAULT 30,
    `nextSyncAt` DATETIME(3) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `inventoryAt` DATETIME(3) NULL,
    `lastError` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `github_connections_integrationId_key`(`integrationId`),
    INDEX `github_connections_tenantId_status_idx`(`tenantId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `github_repositories` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(100) NOT NULL,
    `owner` VARCHAR(100) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `fullName` VARCHAR(210) NOT NULL,
    `defaultBranch` VARCHAR(255) NOT NULL,
    `private` BOOLEAN NOT NULL DEFAULT false,
    `fork` BOOLEAN NOT NULL DEFAULT false,
    `archived` BOOLEAN NOT NULL DEFAULT false,
    `selected` BOOLEAN NOT NULL DEFAULT false,
    `accessible` BOOLEAN NOT NULL DEFAULT true,
    `accessCheckedAt` DATETIME(3) NULL,
    `discoveredIn` VARCHAR(40) NULL,
    `lastError` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `github_repositories_tenantId_connectionId_selected_accessibl_idx`(`tenantId`, `connectionId`, `selected`, `accessible`),
    UNIQUE INDEX `github_repositories_connectionId_externalId_key`(`connectionId`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `github_users` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(100) NOT NULL,
    `login` VARCHAR(100) NOT NULL,
    `name` VARCHAR(200) NULL,
    `isBot` BOOLEAN NOT NULL DEFAULT false,
    `unidentified` BOOLEAN NOT NULL DEFAULT false,
    `tracked` BOOLEAN NOT NULL DEFAULT false,

    INDEX `github_users_tenantId_connectionId_login_idx`(`tenantId`, `connectionId`, `login`),
    UNIQUE INDEX `github_users_connectionId_externalId_key`(`connectionId`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `github_contributions` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `repositoryId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `externalId` VARCHAR(100) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `day` CHAR(10) NOT NULL,
    `url` VARCHAR(1000) NOT NULL,
    `number` INTEGER NULL,
    `current` BOOLEAN NOT NULL DEFAULT true,
    `seenIn` VARCHAR(40) NULL,

    INDEX `github_contributions_tenantId_repositoryId_day_current_idx`(`tenantId`, `repositoryId`, `day`, `current`),
    INDEX `github_contributions_tenantId_userId_day_type_idx`(`tenantId`, `userId`, `day`, `type`),
    UNIQUE INDEX `github_contributions_repositoryId_type_externalId_key`(`repositoryId`, `type`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `github_daily_contributions` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `repositoryId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `day` CHAR(10) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `count` INTEGER NOT NULL,

    INDEX `github_daily_contributions_tenantId_userId_day_idx`(`tenantId`, `userId`, `day`),
    INDEX `github_daily_contributions_tenantId_repositoryId_day_idx`(`tenantId`, `repositoryId`, `day`),
    UNIQUE INDEX `github_daily_contributions_repositoryId_userId_day_type_key`(`repositoryId`, `userId`, `day`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `github_sync_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `repositoryId` VARCHAR(191) NULL,
    `key` VARCHAR(150) NOT NULL,
    `resource` VARCHAR(20) NOT NULL,
    `state` VARCHAR(20) NOT NULL DEFAULT 'queued',
    `generation` INTEGER NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 10,
    `cursor` JSON NULL,
    `coveredFrom` DATETIME(3) NULL,
    `coveredThrough` DATETIME(3) NULL,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(500) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `github_sync_jobs_state_nextAttemptAt_priority_idx`(`state`, `nextAttemptAt`, `priority`),
    INDEX `github_sync_jobs_tenantId_connectionId_generation_idx`(`tenantId`, `connectionId`, `generation`),
    UNIQUE INDEX `github_sync_jobs_connectionId_key_key`(`connectionId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `github_account_leases` (
    `githubUserId` VARCHAR(100) NOT NULL,
    `owner` VARCHAR(40) NULL,
    `expiresAt` DATETIME(3) NULL,
    `nextAttemptAt` DATETIME(3) NULL,

    PRIMARY KEY (`githubUserId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `github_oauth_attempts` (
    `stateHash` CHAR(64) NOT NULL,
    `connectionId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sessionHash` CHAR(64) NOT NULL,
    `verifierEnc` TEXT NOT NULL,
    `generation` INTEGER NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `github_oauth_attempts_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`stateHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `github_connections` ADD CONSTRAINT `github_connections_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `tenant_integrations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `github_repositories` ADD CONSTRAINT `github_repositories_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `github_connections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `github_users` ADD CONSTRAINT `github_users_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `github_connections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `github_contributions` ADD CONSTRAINT `github_contributions_repositoryId_fkey` FOREIGN KEY (`repositoryId`) REFERENCES `github_repositories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `github_contributions` ADD CONSTRAINT `github_contributions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `github_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `github_daily_contributions` ADD CONSTRAINT `github_daily_contributions_repositoryId_fkey` FOREIGN KEY (`repositoryId`) REFERENCES `github_repositories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `github_daily_contributions` ADD CONSTRAINT `github_daily_contributions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `github_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `github_sync_jobs` ADD CONSTRAINT `github_sync_jobs_connectionId_fkey` FOREIGN KEY (`connectionId`) REFERENCES `github_connections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `github_sync_jobs` ADD CONSTRAINT `github_sync_jobs_repositoryId_fkey` FOREIGN KEY (`repositoryId`) REFERENCES `github_repositories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

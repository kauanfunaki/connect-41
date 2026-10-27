-- Aditiva (27/10/2026): vínculo da pessoa do Connect com a conta GitHub, título das
-- contribuições e finalidade das tentativas OAuth. Não altera registros existentes;
-- os títulos chegam na próxima coleta de cada contribuição.

-- AlterTable
ALTER TABLE `github_contributions` ADD COLUMN `title` VARCHAR(300) NULL;

-- AlterTable
ALTER TABLE `github_oauth_attempts` ADD COLUMN `purpose` VARCHAR(20) NOT NULL DEFAULT 'connection';

-- CreateTable
CREATE TABLE `github_account_links` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(100) NOT NULL,
    `login` VARCHAR(100) NOT NULL,
    `linkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `github_account_links_userId_key`(`userId`),
    UNIQUE INDEX `github_account_links_tenantId_externalId_key`(`tenantId`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `github_account_links` ADD CONSTRAINT `github_account_links_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

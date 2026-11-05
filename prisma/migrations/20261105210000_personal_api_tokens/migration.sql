-- Token pessoal de acesso (05/11/2026, decisão D2): a IA e as integrações da
-- pessoa agem no Connect em nome dela, pela API /api/v1 e pelo servidor MCP.
-- Só tabela nova; nada muda nas existentes. Guarda só o hash do token.
-- CreateTable
CREATE TABLE `personal_api_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `hint` VARCHAR(24) NOT NULL,
    `scopes` VARCHAR(500) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `personal_api_tokens_tokenHash_key`(`tokenHash`),
    INDEX `personal_api_tokens_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `personal_api_tokens_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `personal_api_tokens` ADD CONSTRAINT `personal_api_tokens_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `personal_api_tokens` ADD CONSTRAINT `personal_api_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


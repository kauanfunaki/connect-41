-- Telas fixadas na sidebar, por usuário e por workspace.
--
-- Aditiva: só cria a tabela, nenhuma existente muda. Pode rodar antes do deploy,
-- e deploy que chegue antes dela quebra só o que é novo (a lista de fixadas),
-- não a leitura de preferência de todo mundo.

-- CreateTable
CREATE TABLE `user_pinned_modules` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `moduleCode` VARCHAR(60) NOT NULL,
    `position` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_pinned_modules_userId_tenantId_position_idx`(`userId`, `tenantId`, `position`),
    UNIQUE INDEX `user_pinned_modules_userId_tenantId_moduleCode_key`(`userId`, `tenantId`, `moduleCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_pinned_modules` ADD CONSTRAINT `user_pinned_modules_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_pinned_modules` ADD CONSTRAINT `user_pinned_modules_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

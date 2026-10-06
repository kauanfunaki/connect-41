-- Expediente da Agenda (05/10/2026): o horário da grade de dia/semana, do
-- escritório e de cada pessoa. Era fixo, 7h às 21h.
--
-- Só tabelas novas; sem linha, a Agenda segue 7h–21h. Rodar antes da
-- publicação: sem as tabelas a leitura cai no padrão 7h–21h (não derruba a
-- Agenda), mas salvar o horário em /admin/tenant ou /configuracoes falha.

-- CreateTable
CREATE TABLE `tenant_agenda_configs` (
    `tenantId` VARCHAR(191) NOT NULL,
    `inicioHora` INTEGER NOT NULL,
    `fimHora` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_agenda_configs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `inicioHora` INTEGER NOT NULL,
    `fimHora` INTEGER NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `user_agenda_configs_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `user_agenda_configs_userId_tenantId_key`(`userId`, `tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenant_agenda_configs` ADD CONSTRAINT `tenant_agenda_configs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_agenda_configs` ADD CONSTRAINT `user_agenda_configs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_agenda_configs` ADD CONSTRAINT `user_agenda_configs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

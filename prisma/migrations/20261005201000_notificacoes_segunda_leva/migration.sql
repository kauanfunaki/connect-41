-- Notificações, segunda leva (05/10/2026): a foto de quem fez, arquivar e
-- escolher o que cada aba mostra.
--
-- Rodar ANTES da publicação: o sino, a central e a criação de notificação
-- passam a ler e gravar as colunas novas. (O contador do sino no layout tem
-- rede de proteção e não derruba o app, mas o resto das notificações cai.)
--
-- `notifications` é grande, por isso:
-- - as duas colunas são opcionais (ADD COLUMN nulo é instantâneo no MySQL 8);
-- - `actorUserId` fica sem FK — a FK obrigaria o MySQL a copiar a tabela;
-- - o índice novo é criado em linha, sem travar a escrita.
-- Nenhuma linha antiga é alterada.

-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `actorUserId` VARCHAR(191) NULL,
    ADD COLUMN `archivedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `notification_hidden_types` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(60) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_hidden_types_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `notification_hidden_types_userId_tenantId_type_key`(`userId`, `tenantId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `notifications_tenantId_userId_archivedAt_createdAt_idx` ON `notifications`(`tenantId`, `userId`, `archivedAt`, `createdAt`);

-- AddForeignKey
ALTER TABLE `notification_hidden_types` ADD CONSTRAINT `notification_hidden_types_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_hidden_types` ADD CONSTRAINT `notification_hidden_types_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

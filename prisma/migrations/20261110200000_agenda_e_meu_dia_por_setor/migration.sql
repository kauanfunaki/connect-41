-- Agenda e Meu dia por setor (10/11/2026, pedido do Kauan: "tem setores que
-- não fazem reuniões"). Só acrescenta; não altera registros existentes.
-- - sector_agenda_views: se o setor usa reuniões e as fontes de prazo que a
--   Agenda esconde por padrão. Sem linha = usa reuniões e mostra todas.
-- - user_agenda_views: as fontes que a pessoa escondeu e a última visão que ela
--   escolheu na Agenda. Sem linha = segue o setor.
-- - índice (tenantId, dataLegal) em obrigacoes_geradas: a data legal das
--   obrigações entra na Agenda, buscada por período.
-- CreateTable
CREATE TABLE `sector_agenda_views` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `usaReunioes` BOOLEAN NOT NULL DEFAULT true,
    `fontesOcultas` TEXT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sector_agenda_views_tenantId_sectorCode_key`(`tenantId`, `sectorCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_agenda_views` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `fontesOcultas` TEXT NULL,
    `visao` VARCHAR(10) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `user_agenda_views_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `user_agenda_views_userId_tenantId_key`(`userId`, `tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `obrigacoes_geradas_tenantId_dataLegal_idx` ON `obrigacoes_geradas`(`tenantId`, `dataLegal`);

-- AddForeignKey
ALTER TABLE `sector_agenda_views` ADD CONSTRAINT `sector_agenda_views_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_agenda_views` ADD CONSTRAINT `user_agenda_views_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_agenda_views` ADD CONSTRAINT `user_agenda_views_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

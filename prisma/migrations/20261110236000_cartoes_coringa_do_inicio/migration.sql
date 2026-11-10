-- Cartões coringa do topo do Início (10/11/2026, pedido do Kauan — Controle
-- interno melhoria-588).
--
-- 1. `sector_home_cards`: o padrão de cada setor para os quatro cartões do
--    topo, gravado por quem coordena o setor (ou pelo admin). Uma linha por
--    setor; sem linha, vale o padrão do código (src/lib/home/cartoes.ts).
-- 2. `user_home_cards`: a escolha de cada pessoa, por setor ativo ("" em
--    "Todos os setores"). Vale mais que o padrão do setor; sai junto com a
--    pessoa (CASCADE).
--    Nas duas, `cards` é o JSON das quatro posições: a chave do cartão ou
--    null ("vale o de cima").
--
-- O cartão "Obrigações em risco de multa" usa o índice `(tenantId, dataLegal)`
-- de `obrigacoes_geradas`, que já vem da migration da Agenda
-- (20261110200000_agenda_e_meu_dia_por_setor) — rodar aquela antes desta.
--
-- Só acrescenta: duas tabelas novas. Nenhuma linha é apagada nem muda.
-- Rodar antes do deploy: sem as tabelas o Início abre com o padrão de cada
-- setor, mas trocar um cartão pelo lápis dá erro.

-- CreateTable
CREATE TABLE `sector_home_cards` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `cards` TEXT NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sector_home_cards_tenantId_sectorCode_key`(`tenantId`, `sectorCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_home_cards` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL DEFAULT '',
    `cards` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `user_home_cards_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `user_home_cards_userId_tenantId_sectorCode_key`(`userId`, `tenantId`, `sectorCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sector_home_cards` ADD CONSTRAINT `sector_home_cards_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_home_cards` ADD CONSTRAINT `user_home_cards_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_home_cards` ADD CONSTRAINT `user_home_cards_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

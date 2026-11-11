-- Academia, fase 2 (11/11/2026, Controle interno funcionalidade-594, escolhas
-- do Kauan em 10/11): desafio do dia e sequência, meta pessoal, ranking de
-- evolução, placar por setor, conquistas, Hall dos campeões, parabéns entre
-- colegas e o teste de atalhos do Excel e do Connect. Só acrescenta.
--
-- 1. `academia_resultados.dia`: o dia (São Paulo) do resultado. É por ele que
--    o desafio do dia (teste "desafio") conta a sequência; nulo nos de antes.
-- 2. `academia_premios.textoEvolucao`: o prêmio da maior evolução do mês, ao
--    lado do prêmio do pódio (`texto`).
-- 3. `academia_metas`: a meta pessoal, uma por pessoa.
-- 4. `academia_campeoes` e `academia_meses_fechados`: o Hall dos campeões,
--    gravado quando o mês fecha, e a marca de mês já fechado.
-- 5. `academia_parabens`: um "Parabéns" por quem manda, quem recebe, mês e tipo.
--
-- O desafio e os atalhos não pedem tabela: são valores novos de `teste`
-- (texto, e não enum do banco).

-- AlterTable
ALTER TABLE `academia_resultados` ADD COLUMN `dia` CHAR(10) NULL;

-- AlterTable
ALTER TABLE `academia_premios` ADD COLUMN `textoEvolucao` VARCHAR(200) NULL;

-- CreateTable
CREATE TABLE `academia_metas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `teste` VARCHAR(12) NOT NULL,
    `nivel` VARCHAR(10) NULL,
    `alvo` INTEGER NOT NULL,
    `prazo` CHAR(10) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `academia_metas_userId_key`(`userId`),
    INDEX `academia_metas_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academia_campeoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `mes` CHAR(7) NOT NULL,
    `categoria` VARCHAR(12) NOT NULL,
    `posicao` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `teste` VARCHAR(12) NOT NULL,
    `valor` VARCHAR(80) NOT NULL,
    `premio` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `academia_campeoes_userId_categoria_idx`(`userId`, `categoria`),
    UNIQUE INDEX `academia_campeoes_tenantId_mes_categoria_posicao_key`(`tenantId`, `mes`, `categoria`, `posicao`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academia_meses_fechados` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `mes` CHAR(7) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `academia_meses_fechados_tenantId_mes_key`(`tenantId`, `mes`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academia_parabens` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `deUserId` VARCHAR(191) NOT NULL,
    `paraUserId` VARCHAR(191) NOT NULL,
    `mes` CHAR(7) NOT NULL,
    `tipo` VARCHAR(12) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `academia_parabens_paraUserId_mes_idx`(`paraUserId`, `mes`),
    INDEX `academia_parabens_tenantId_mes_tipo_idx`(`tenantId`, `mes`, `tipo`),
    UNIQUE INDEX `academia_parabens_deUserId_paraUserId_mes_tipo_key`(`deUserId`, `paraUserId`, `mes`, `tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `academia_resultados_userId_teste_dia_idx` ON `academia_resultados`(`userId`, `teste`, `dia`);

-- AddForeignKey
ALTER TABLE `academia_metas` ADD CONSTRAINT `academia_metas_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_metas` ADD CONSTRAINT `academia_metas_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_campeoes` ADD CONSTRAINT `academia_campeoes_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_campeoes` ADD CONSTRAINT `academia_campeoes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_meses_fechados` ADD CONSTRAINT `academia_meses_fechados_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_parabens` ADD CONSTRAINT `academia_parabens_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_parabens` ADD CONSTRAINT `academia_parabens_deUserId_fkey` FOREIGN KEY (`deUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_parabens` ADD CONSTRAINT `academia_parabens_paraUserId_fkey` FOREIGN KEY (`paraUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

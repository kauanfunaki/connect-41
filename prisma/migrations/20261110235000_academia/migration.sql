-- Academia, fase 1 (10/11/2026, pedido do Kauan): a área de aprendizado da
-- equipe — digitação, digitação de números e lógica com imagens, ranking do
-- mês e certificado para o pódio.
--
-- 1. `academia_textos` e `academia_questoes`: o que o teste serve, por nível.
--    `origemHubId` é o id no 41 Hub, para a importação não duplicar.
-- 2. `academia_sessoes`: cada rodada servida pelo servidor, com nonce,
--    validade e a foto do que foi mostrado. A chave única
--    (userId, teste, nivel, diaValendo) é a regra de uma tentativa valendo
--    por dia, por nível e por teste; o treino livre grava `diaValendo` nulo e
--    não esbarra nela.
-- 3. `academia_resultados`: o resultado de cada rodada. O ranking lê pelo
--    índice (tenantId, teste, mes, valendo, nivel), sempre de um mês só.
-- 4. `academia_preferencias`: "Aparecer no ranking" (sem linha, aparece).
-- 5. `academia_premios`: o prêmio do mês, em texto livre.
--
-- Só acrescenta: seis tabelas novas, nenhuma coluna mexida. Rodar antes do
-- deploy: a Academia lê estas tabelas (o ícone do topo só aparece com o
-- módulo ligado, e ele nasce desligado).

-- CreateTable
CREATE TABLE `academia_textos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nivel` VARCHAR(10) NOT NULL,
    `conteudo` TEXT NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `origemHubId` VARCHAR(64) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `academia_textos_tenantId_nivel_ativo_idx`(`tenantId`, `nivel`, `ativo`),
    UNIQUE INDEX `academia_textos_tenantId_origemHubId_key`(`tenantId`, `origemHubId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academia_questoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nivel` VARCHAR(10) NOT NULL,
    `enunciado` TEXT NOT NULL,
    `imagemUrl` VARCHAR(255) NULL,
    `alternativas` JSON NOT NULL,
    `correta` INTEGER NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `origemHubId` VARCHAR(64) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `academia_questoes_tenantId_nivel_ativo_idx`(`tenantId`, `nivel`, `ativo`),
    UNIQUE INDEX `academia_questoes_tenantId_origemHubId_key`(`tenantId`, `origemHubId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academia_sessoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `teste` VARCHAR(12) NOT NULL,
    `nivel` VARCHAR(10) NOT NULL,
    `valendo` BOOLEAN NOT NULL,
    `diaValendo` CHAR(10) NULL,
    `nonce` CHAR(32) NOT NULL,
    `payload` JSON NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `submittedAt` DATETIME(3) NULL,

    UNIQUE INDEX `academia_sessoes_nonce_key`(`nonce`),
    INDEX `academia_sessoes_tenantId_userId_startedAt_idx`(`tenantId`, `userId`, `startedAt`),
    UNIQUE INDEX `academia_sessoes_userId_teste_nivel_diaValendo_key`(`userId`, `teste`, `nivel`, `diaValendo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academia_resultados` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NULL,
    `teste` VARCHAR(12) NOT NULL,
    `nivel` VARCHAR(10) NOT NULL,
    `mes` CHAR(7) NOT NULL,
    `ppm` INTEGER NULL,
    `acertos` INTEGER NULL,
    `total` INTEGER NULL,
    `precisao` DECIMAL(5, 2) NOT NULL,
    `duracaoMs` INTEGER NOT NULL,
    `valendo` BOOLEAN NOT NULL,
    `origem` VARCHAR(10) NOT NULL DEFAULT 'connect',
    `sessaoId` VARCHAR(191) NULL,
    `origemHubId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `academia_resultados_sessaoId_key`(`sessaoId`),
    INDEX `academia_resultados_tenantId_teste_mes_valendo_nivel_idx`(`tenantId`, `teste`, `mes`, `valendo`, `nivel`),
    INDEX `academia_resultados_userId_teste_mes_idx`(`userId`, `teste`, `mes`),
    UNIQUE INDEX `academia_resultados_tenantId_origemHubId_key`(`tenantId`, `origemHubId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academia_preferencias` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `aparecerNoRanking` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `academia_preferencias_userId_key`(`userId`),
    INDEX `academia_preferencias_tenantId_aparecerNoRanking_idx`(`tenantId`, `aparecerNoRanking`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academia_premios` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `mes` CHAR(7) NOT NULL,
    `texto` VARCHAR(200) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `academia_premios_tenantId_mes_key`(`tenantId`, `mes`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `academia_textos` ADD CONSTRAINT `academia_textos_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_questoes` ADD CONSTRAINT `academia_questoes_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_sessoes` ADD CONSTRAINT `academia_sessoes_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_sessoes` ADD CONSTRAINT `academia_sessoes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_resultados` ADD CONSTRAINT `academia_resultados_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_resultados` ADD CONSTRAINT `academia_resultados_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_preferencias` ADD CONSTRAINT `academia_preferencias_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_preferencias` ADD CONSTRAINT `academia_preferencias_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `academia_premios` ADD CONSTRAINT `academia_premios_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

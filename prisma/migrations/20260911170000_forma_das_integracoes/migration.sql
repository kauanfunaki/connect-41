-- A forma das integrações: uma, no lugar de oito.
--
-- Aditiva — duas tabelas novas, nada existente tocado. Chatwoot, SPED e
-- BpoCredential seguem como estão; convergi-los é trabalho à parte, com dado
-- dentro, e não cabe na mesma migration.
--
-- Espelha a espinha que já roda: `MODULE_CATALOG` + `TenantModule` é "o cliente
-- liga o que contratou", e `TenantIntegration` é a mesma ideia onde o que liga é
-- uma conexão com sistema de fora.
--
-- Três decisões que o histórico deste repositório explica:
--
--   1. `instanceKey` — um cliente pode ter DUAS contas do mesmo sistema. O
--      Chatwoot já permite isso hoje (uma por setor). Sem a chave, a segunda
--      sobrescreveria a primeira em silêncio.
--   2. `configEnc` guarda o JSON inteiro cifrado, não uma coluna por campo: o
--      conjunto de credenciais muda com o catálogo, e coluna por credencial
--      seria migration a cada plugin novo.
--   3. `lastError` é NULL sempre que a última execução deu certo, inclusive
--      quando ela não achou nada para fazer — e existe um único caminho que
--      encerra rodada (`finalizarExecucao`) justamente para que isso não dependa
--      de alguém lembrar. Em 10/09 o `lastError` do SPED só era limpo num
--      caminho, e 25 raízes saudáveis exibiram por dias um 403 que não existia.

-- CreateTable
CREATE TABLE `tenant_integrations` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `integrationCode` VARCHAR(60) NOT NULL,
    `instanceKey` VARCHAR(60) NOT NULL DEFAULT 'default',
    `label` VARCHAR(120) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `configEnc` TEXT NOT NULL,
    `cursor` TEXT NULL,
    `watermark` VARCHAR(80) NULL,
    `lastRunAt` DATETIME(3) NULL,
    `lastError` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tenant_integrations_tenantId_enabled_idx`(`tenantId`, `enabled`),
    UNIQUE INDEX `tenant_integrations_tenantId_integrationCode_instanceKey_key`(`tenantId`, `integrationCode`, `instanceKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `integration_runs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `integrationId` VARCHAR(191) NOT NULL,
    `trigger` ENUM('CRON', 'MANUAL', 'WEBHOOK') NOT NULL DEFAULT 'CRON',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `ok` BOOLEAN NULL,
    `error` VARCHAR(500) NULL,
    `counters` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `integration_runs_integrationId_startedAt_idx`(`integrationId`, `startedAt`),
    INDEX `integration_runs_tenantId_ok_idx`(`tenantId`, `ok`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenant_integrations` ADD CONSTRAINT `tenant_integrations_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `integration_runs` ADD CONSTRAINT `integration_runs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `integration_runs` ADD CONSTRAINT `integration_runs_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `tenant_integrations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


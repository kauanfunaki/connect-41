-- Sessão assistida do robô (06/11/2026): o robô para no captcha, espelha a tela
-- no Connect e uma pessoa do setor resolve com o mouse. Tabela nova, sem tocar
-- nas que existem.

-- CreateTable
CREATE TABLE `robot_assists` (
    `id` VARCHAR(36) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `attempt` INTEGER NOT NULL,
    `reason` VARCHAR(40) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deadlineAt` DATETIME(3) NOT NULL,
    `escalatedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `outcome` VARCHAR(20) NULL,
    `clicks` INTEGER NOT NULL DEFAULT 0,
    `lastClickById` VARCHAR(191) NULL,
    `lastClickAt` DATETIME(3) NULL,

    INDEX `robot_assists_tenantId_startedAt_idx`(`tenantId`, `startedAt`),
    UNIQUE INDEX `robot_assists_taskId_attempt_key`(`taskId`, `attempt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

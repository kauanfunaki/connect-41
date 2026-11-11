-- Atendimento (11/11/2026): os modelos da Meta, para retomar a conversa depois
-- de 24 h. Só uma tabela nova. Rodar o migrate deploy ANTES do deploy.

-- CreateTable
CREATE TABLE `atendimento_modelos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `rotulo` VARCHAR(80) NOT NULL,
    `nomeNaMeta` VARCHAR(120) NOT NULL,
    `idioma` VARCHAR(10) NOT NULL DEFAULT 'pt_BR',
    `texto` TEXT NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `atendimento_modelos_tenantId_ativo_idx`(`tenantId`, `ativo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


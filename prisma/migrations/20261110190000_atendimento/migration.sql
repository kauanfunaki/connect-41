-- Atendimento (10/11/2026): a caixa do WhatsApp oficial do escritório, no menu
-- Geral. Só tabelas novas (atendimento_*): nada muda nas tabelas do WhatsApp do
-- Recrutamento. Rodar o migrate deploy ANTES do deploy: as telas novas leem
-- estas tabelas, e o módulo nasce desligado.

-- CreateTable
CREATE TABLE `atendimento_configs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `integrationId` VARCHAR(191) NULL,
    `diasDaSemana` VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5',
    `abreAs` VARCHAR(5) NOT NULL DEFAULT '08:00',
    `fechaAs` VARCHAR(5) NOT NULL DEFAULT '18:00',
    `boasVindas` TEXT NULL,
    `foraDoHorario` TEXT NULL,
    `diasParaReabrir` INTEGER NOT NULL DEFAULT 7,
    `setores` JSON NULL,
    `ceciLigada` BOOLEAN NOT NULL DEFAULT false,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `atendimento_configs_tenantId_key`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `atendimento_contatos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `waPhone` VARCHAR(20) NOT NULL,
    `nomeNoWhatsapp` VARCHAR(120) NULL,
    `tipo` ENUM('DESCONHECIDO', 'CLIENTE', 'NOVO') NOT NULL DEFAULT 'DESCONHECIDO',
    `companyId` VARCHAR(191) NULL,
    `personId` VARCHAR(191) NULL,
    `nome` VARCHAR(120) NULL,
    `interesse` VARCHAR(60) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `atendimento_contatos_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `atendimento_contatos_tenantId_waPhone_key`(`tenantId`, `waPhone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `atendimento_conversas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `integrationId` VARCHAR(191) NOT NULL,
    `waPhone` VARCHAR(20) NOT NULL,
    `contatoId` VARCHAR(191) NOT NULL,
    `lastInboundAt` DATETIME(3) NULL,
    `lastMessageAt` DATETIME(3) NULL,
    `optedOutAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `atendimento_conversas_tenantId_lastMessageAt_idx`(`tenantId`, `lastMessageAt`),
    UNIQUE INDEX `atendimento_conversas_integrationId_waPhone_key`(`integrationId`, `waPhone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `atendimento_ciclos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `conversaId` VARCHAR(191) NOT NULL,
    `situacao` ENUM('TRIAGEM', 'NO_SETOR', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE', 'ENCERRADO') NOT NULL DEFAULT 'TRIAGEM',
    `sectorCode` VARCHAR(40) NULL,
    `assignedToId` VARCHAR(191) NULL,
    `assignedAt` DATETIME(3) NULL,
    `abertoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `encerradoEm` DATETIME(3) NULL,
    `encerradoPorId` VARCHAR(191) NULL,
    `desfechoId` VARCHAR(191) NULL,
    `desfechoTexto` VARCHAR(120) NULL,
    `resumo` TEXT NULL,
    `ceciSectorCode` VARCHAR(40) NULL,
    `ceciRunId` VARCHAR(191) NULL,
    `triagemSectorCode` VARCHAR(40) NULL,

    INDEX `atendimento_ciclos_tenantId_situacao_sectorCode_idx`(`tenantId`, `situacao`, `sectorCode`),
    INDEX `atendimento_ciclos_tenantId_assignedToId_situacao_idx`(`tenantId`, `assignedToId`, `situacao`),
    INDEX `atendimento_ciclos_conversaId_abertoEm_idx`(`conversaId`, `abertoEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `atendimento_mensagens` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `conversaId` VARCHAR(191) NOT NULL,
    `cicloId` VARCHAR(191) NULL,
    `direcao` ENUM('ENTRADA', 'SAIDA') NOT NULL,
    `body` TEXT NOT NULL,
    `waMessageId` VARCHAR(120) NULL,
    `status` ENUM('PENDENTE', 'ENVIADA', 'FALHOU', 'BLOQUEADA') NULL,
    `erro` VARCHAR(500) NULL,
    `senderUserId` VARCHAR(191) NULL,
    `assinatura` VARCHAR(160) NULL,
    `interna` BOOLEAN NOT NULL DEFAULT false,
    `automatica` BOOLEAN NOT NULL DEFAULT false,
    `midiaTipo` VARCHAR(30) NULL,
    `midiaPath` VARCHAR(255) NULL,
    `midiaNome` VARCHAR(180) NULL,
    `midiaMime` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `atendimento_mensagens_waMessageId_key`(`waMessageId`),
    INDEX `atendimento_mensagens_conversaId_createdAt_idx`(`conversaId`, `createdAt`),
    INDEX `atendimento_mensagens_cicloId_idx`(`cicloId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `atendimento_movimentos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `cicloId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('CHEGOU', 'ASSUMIU', 'ENCAMINHOU', 'TRANSFERIU', 'PEDIU', 'APROVOU', 'RECUSOU', 'AGUARDANDO', 'ENCERROU', 'REABRIU', 'VINCULOU') NOT NULL,
    `deSector` VARCHAR(40) NULL,
    `paraSector` VARCHAR(40) NULL,
    `porUserId` VARCHAR(191) NULL,
    `paraUserId` VARCHAR(191) NULL,
    `nota` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `atendimento_movimentos_cicloId_createdAt_idx`(`cicloId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `atendimento_pedidos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `cicloId` VARCHAR(191) NOT NULL,
    `deSector` VARCHAR(40) NOT NULL,
    `paraSector` VARCHAR(40) NULL,
    `motivo` TEXT NOT NULL,
    `avisarCliente` BOOLEAN NOT NULL DEFAULT true,
    `pedidoPorId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDENTE', 'APROVADO', 'RECUSADO') NOT NULL DEFAULT 'PENDENTE',
    `decididoPorId` VARCHAR(191) NULL,
    `setorAprovado` VARCHAR(40) NULL,
    `nota` TEXT NULL,
    `decididoEm` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `atendimento_pedidos_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `atendimento_pedidos_cicloId_status_idx`(`cicloId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `atendimento_desfechos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(60) NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `ordem` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `atendimento_desfechos_tenantId_ativo_ordem_idx`(`tenantId`, `ativo`, `ordem`),
    UNIQUE INDEX `atendimento_desfechos_tenantId_label_key`(`tenantId`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `atendimento_mensagens_padrao` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `titulo` VARCHAR(80) NOT NULL,
    `sectorCode` VARCHAR(40) NULL,
    `texto` TEXT NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `atendimento_mensagens_padrao_tenantId_ativo_idx`(`tenantId`, `ativo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `atendimento_conversas` ADD CONSTRAINT `atendimento_conversas_contatoId_fkey` FOREIGN KEY (`contatoId`) REFERENCES `atendimento_contatos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `atendimento_ciclos` ADD CONSTRAINT `atendimento_ciclos_conversaId_fkey` FOREIGN KEY (`conversaId`) REFERENCES `atendimento_conversas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `atendimento_mensagens` ADD CONSTRAINT `atendimento_mensagens_conversaId_fkey` FOREIGN KEY (`conversaId`) REFERENCES `atendimento_conversas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `atendimento_movimentos` ADD CONSTRAINT `atendimento_movimentos_cicloId_fkey` FOREIGN KEY (`cicloId`) REFERENCES `atendimento_ciclos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `atendimento_pedidos` ADD CONSTRAINT `atendimento_pedidos_cicloId_fkey` FOREIGN KEY (`cicloId`) REFERENCES `atendimento_ciclos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


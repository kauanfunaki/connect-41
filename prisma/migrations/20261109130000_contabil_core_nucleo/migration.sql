-- Contábil Core, Bloco A (Fase 1, 09/11/2026): as onze tabelas core_* do
-- núcleo (empresas, plano de contas, agências, contrapartes, regras,
-- importações, transações, registros, decisões do NEO e exportações).
-- Só CREATE TABLE e chaves estrangeiras entre elas, para tenants e companies:
-- nada existente é alterado. O módulo nasce desligado (`contabil_core`), então
-- a ordem com o deploy não importa, mas rodar ANTES é o de sempre.
-- Desenho em docs/CONTABIL-CORE.md.

-- CreateTable
CREATE TABLE `core_empresas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `cnpj` VARCHAR(18) NOT NULL,
    `razaoSocial` VARCHAR(300) NOT NULL,
    `regimeTributario` VARCHAR(20) NOT NULL,
    `ativa` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `core_empresas_companyId_key`(`companyId`),
    UNIQUE INDEX `core_empresas_tenantId_cnpj_key`(`tenantId`, `cnpj`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_plano_contas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `contaNumero` INTEGER NULL,
    `codigo` VARCHAR(30) NOT NULL,
    `descricao` VARCHAR(300) NOT NULL,
    `tipo` VARCHAR(50) NOT NULL,
    `tipoSa` CHAR(1) NOT NULL DEFAULT 'A',
    `aceitaLancamentos` BOOLEAN NOT NULL DEFAULT true,
    `paiId` VARCHAR(191) NULL,
    `codigoAtivo` CHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_plano_contas_tenantId_empresaId_idx`(`tenantId`, `empresaId`),
    INDEX `core_plano_contas_paiId_idx`(`paiId`),
    UNIQUE INDEX `core_plano_contas_empresaId_codigoAtivo_key`(`empresaId`, `codigoAtivo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_plano_faixas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(50) NOT NULL,
    `codigoDe` VARCHAR(30) NOT NULL,
    `codigoAte` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_plano_faixas_empresaId_idx`(`empresaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_agencias` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `bancoSigla` VARCHAR(20) NOT NULL,
    `agencia` VARCHAR(10) NOT NULL,
    `numero` VARCHAR(20) NOT NULL,
    `digito` VARCHAR(5) NULL,
    `ativa` BOOLEAN NOT NULL DEFAULT true,
    `contaContabilId` VARCHAR(191) NULL,
    `chave` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `core_agencias_contaContabilId_key`(`contaContabilId`),
    INDEX `core_agencias_tenantId_empresaId_idx`(`tenantId`, `empresaId`),
    UNIQUE INDEX `core_agencias_empresaId_chave_key`(`empresaId`, `chave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_contrapartes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(12) NOT NULL,
    `documento` VARCHAR(14) NOT NULL,
    `razaoSocial` VARCHAR(300) NOT NULL,
    `nomeFantasia` VARCHAR(300) NULL,
    `contaContabilId` VARCHAR(191) NOT NULL,
    `origem` VARCHAR(20) NOT NULL DEFAULT 'manual',
    `dadosCadastrais` JSON NULL,
    `confirmadoEm` DATETIME(3) NULL,
    `confirmadoPorId` VARCHAR(191) NULL,
    `ativa` BOOLEAN NOT NULL DEFAULT true,
    `chaveAtiva` CHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_contrapartes_empresaId_razaoSocial_idx`(`empresaId`, `razaoSocial`),
    INDEX `core_contrapartes_empresaId_documento_idx`(`empresaId`, `documento`),
    INDEX `core_contrapartes_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `core_contrapartes_empresaId_chaveAtiva_key`(`empresaId`, `chaveAtiva`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_regras` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `contaId` VARCHAR(191) NOT NULL,
    `agenciaId` VARCHAR(191) NULL,
    `descricao` VARCHAR(500) NOT NULL,
    `historico` VARCHAR(500) NOT NULL,
    `historicoNormalizado` VARCHAR(500) NOT NULL,
    `dc` CHAR(1) NOT NULL,
    `tipo` VARCHAR(12) NOT NULL,
    `manterHistorico` BOOLEAN NOT NULL DEFAULT false,
    `ativa` BOOLEAN NOT NULL DEFAULT true,
    `chaveAtiva` CHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_regras_empresaId_ativa_tipo_idx`(`empresaId`, `ativa`, `tipo`),
    INDEX `core_regras_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `core_regras_empresaId_chaveAtiva_key`(`empresaId`, `chaveAtiva`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_importacoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `agenciaId` VARCHAR(191) NOT NULL,
    `nomeArquivo` VARCHAR(255) NOT NULL,
    `hashArquivo` CHAR(64) NOT NULL,
    `totalNoArquivo` INTEGER NOT NULL DEFAULT 0,
    `importadas` INTEGER NOT NULL DEFAULT 0,
    `duplicadas` INTEGER NOT NULL DEFAULT 0,
    `rejeitadas` INTEGER NOT NULL DEFAULT 0,
    `criadoPorId` VARCHAR(191) NULL,
    `canceladaEm` DATETIME(3) NULL,
    `canceladaPorId` VARCHAR(191) NULL,
    `motivoCancelamento` VARCHAR(300) NULL,
    `saldoDeclarado` DECIMAL(15, 2) NULL,
    `dataSaldoDeclarado` DATE NULL,
    `alertaSaldo` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_importacoes_empresaId_createdAt_idx`(`empresaId`, `createdAt`),
    INDEX `core_importacoes_empresaId_hashArquivo_idx`(`empresaId`, `hashArquivo`),
    INDEX `core_importacoes_agenciaId_dataSaldoDeclarado_idx`(`agenciaId`, `dataSaldoDeclarado`),
    INDEX `core_importacoes_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_transacoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `agenciaId` VARCHAR(191) NOT NULL,
    `data` DATE NOT NULL,
    `valor` DECIMAL(15, 2) NOT NULL,
    `saldoApos` DECIMAL(15, 2) NULL,
    `historico` VARCHAR(500) NOT NULL,
    `ordem` INTEGER NULL,
    `importacaoId` VARCHAR(191) NULL,
    `dc` CHAR(1) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'pendente',
    `hashDedup` CHAR(64) NOT NULL,
    `hashAtivo` CHAR(64) NULL,
    `autoRecusadoEm` DATETIME(3) NULL,
    `autoRecusadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_transacoes_empresaId_status_autoRecusadoEm_idx`(`empresaId`, `status`, `autoRecusadoEm`),
    INDEX `core_transacoes_empresaId_data_ordem_idx`(`empresaId`, `data`, `ordem`),
    INDEX `core_transacoes_importacaoId_idx`(`importacaoId`),
    INDEX `core_transacoes_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `core_transacoes_empresaId_hashAtivo_key`(`empresaId`, `hashAtivo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_registros` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `transacaoId` VARCHAR(191) NULL,
    `lancamentoId` VARCHAR(36) NOT NULL,
    `ordemComposicao` INTEGER NULL,
    `contaId` VARCHAR(191) NOT NULL,
    `agenciaId` VARCHAR(191) NOT NULL,
    `descricao` VARCHAR(500) NOT NULL,
    `historico` VARCHAR(500) NOT NULL,
    `historicoExtrato` VARCHAR(500) NOT NULL,
    `dc` CHAR(1) NOT NULL,
    `tipoRegra` VARCHAR(50) NOT NULL,
    `valor` DECIMAL(15, 2) NOT NULL,
    `dataLancamento` DATETIME(3) NOT NULL,
    `canceladoEm` DATETIME(3) NULL,
    `canceladoPorId` VARCHAR(191) NULL,
    `motivoCancelamento` VARCHAR(300) NULL,
    `chaveAtiva` VARCHAR(40) NULL,
    `chavePadraoAtiva` CHAR(1) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_registros_empresaId_dataLancamento_idx`(`empresaId`, `dataLancamento`),
    INDEX `core_registros_empresaId_canceladoEm_idx`(`empresaId`, `canceladoEm`),
    INDEX `core_registros_lancamentoId_idx`(`lancamentoId`),
    INDEX `core_registros_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `core_registros_transacaoId_chaveAtiva_key`(`transacaoId`, `chaveAtiva`),
    UNIQUE INDEX `core_registros_transacaoId_chavePadraoAtiva_key`(`transacaoId`, `chavePadraoAtiva`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_neo_decisoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `transacaoId` VARCHAR(191) NOT NULL,
    `regraId` VARCHAR(191) NULL,
    `contaId` VARCHAR(191) NULL,
    `contraparteId` VARCHAR(191) NULL,
    `contaContraparteId` VARCHAR(191) NULL,
    `origemEvidencia` VARCHAR(20) NULL,
    `contaDivergente` BOOLEAN NULL,
    `resultado` VARCHAR(12) NOT NULL,
    `estrategia` VARCHAR(50) NULL,
    `motivo` VARCHAR(500) NULL,
    `processadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `transacaoSemRegra` VARCHAR(191) NULL,

    UNIQUE INDEX `core_neo_decisoes_transacaoSemRegra_key`(`transacaoSemRegra`),
    INDEX `core_neo_decisoes_empresaId_resultado_idx`(`empresaId`, `resultado`),
    INDEX `core_neo_decisoes_transacaoId_idx`(`transacaoId`),
    INDEX `core_neo_decisoes_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_exportacoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `formato` VARCHAR(4) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'pendente',
    `filtroDe` DATETIME(3) NULL,
    `filtroAte` DATETIME(3) NULL,
    `totalRegistros` INTEGER NULL,
    `arquivoPath` VARCHAR(500) NULL,
    `erroMsg` VARCHAR(500) NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    INDEX `core_exportacoes_empresaId_status_idx`(`empresaId`, `status`),
    INDEX `core_exportacoes_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `core_empresas` ADD CONSTRAINT `core_empresas_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_empresas` ADD CONSTRAINT `core_empresas_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_plano_contas` ADD CONSTRAINT `core_plano_contas_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_plano_contas` ADD CONSTRAINT `core_plano_contas_paiId_fkey` FOREIGN KEY (`paiId`) REFERENCES `core_plano_contas`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `core_plano_faixas` ADD CONSTRAINT `core_plano_faixas_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_agencias` ADD CONSTRAINT `core_agencias_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_agencias` ADD CONSTRAINT `core_agencias_contaContabilId_fkey` FOREIGN KEY (`contaContabilId`) REFERENCES `core_plano_contas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_contrapartes` ADD CONSTRAINT `core_contrapartes_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_contrapartes` ADD CONSTRAINT `core_contrapartes_contaContabilId_fkey` FOREIGN KEY (`contaContabilId`) REFERENCES `core_plano_contas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_regras` ADD CONSTRAINT `core_regras_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_regras` ADD CONSTRAINT `core_regras_contaId_fkey` FOREIGN KEY (`contaId`) REFERENCES `core_plano_contas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_regras` ADD CONSTRAINT `core_regras_agenciaId_fkey` FOREIGN KEY (`agenciaId`) REFERENCES `core_agencias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_importacoes` ADD CONSTRAINT `core_importacoes_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_importacoes` ADD CONSTRAINT `core_importacoes_agenciaId_fkey` FOREIGN KEY (`agenciaId`) REFERENCES `core_agencias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_transacoes` ADD CONSTRAINT `core_transacoes_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_transacoes` ADD CONSTRAINT `core_transacoes_agenciaId_fkey` FOREIGN KEY (`agenciaId`) REFERENCES `core_agencias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_transacoes` ADD CONSTRAINT `core_transacoes_importacaoId_fkey` FOREIGN KEY (`importacaoId`) REFERENCES `core_importacoes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_registros` ADD CONSTRAINT `core_registros_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_registros` ADD CONSTRAINT `core_registros_transacaoId_fkey` FOREIGN KEY (`transacaoId`) REFERENCES `core_transacoes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_registros` ADD CONSTRAINT `core_registros_contaId_fkey` FOREIGN KEY (`contaId`) REFERENCES `core_plano_contas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_registros` ADD CONSTRAINT `core_registros_agenciaId_fkey` FOREIGN KEY (`agenciaId`) REFERENCES `core_agencias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_neo_decisoes` ADD CONSTRAINT `core_neo_decisoes_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_neo_decisoes` ADD CONSTRAINT `core_neo_decisoes_transacaoId_fkey` FOREIGN KEY (`transacaoId`) REFERENCES `core_transacoes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_neo_decisoes` ADD CONSTRAINT `core_neo_decisoes_regraId_fkey` FOREIGN KEY (`regraId`) REFERENCES `core_regras`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_neo_decisoes` ADD CONSTRAINT `core_neo_decisoes_contaId_fkey` FOREIGN KEY (`contaId`) REFERENCES `core_plano_contas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_neo_decisoes` ADD CONSTRAINT `core_neo_decisoes_contraparteId_fkey` FOREIGN KEY (`contraparteId`) REFERENCES `core_contrapartes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_neo_decisoes` ADD CONSTRAINT `core_neo_decisoes_contaContraparteId_fkey` FOREIGN KEY (`contaContraparteId`) REFERENCES `core_plano_contas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_exportacoes` ADD CONSTRAINT `core_exportacoes_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


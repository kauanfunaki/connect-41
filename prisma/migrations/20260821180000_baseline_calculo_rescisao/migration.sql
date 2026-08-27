-- BASELINE — NÃO EXECUTAR EM PRODUÇÃO.
--
-- Todo o DDL abaixo JÁ EXISTE no banco de produção desde antes de 2026-08-21.
-- Esta migration existe para alinhar o histórico do repositório com a realidade,
-- e deve ser registrada com:
--
--   npx prisma migrate resolve --applied 20260821180000_baseline_calculo_rescisao
--
-- Em banco de desenvolvimento criado a partir das migrations do repo, ela roda
-- normalmente e cria as estruturas.
--
-- Origem do drift: o módulo de cálculo de rescisão foi construído direto contra o
-- banco e nunca entrou no repositório. Nenhum código de src/ referencia estes
-- models — só `prisma.termination`, que já existia.

-- AlterTable
ALTER TABLE `cargos` ADD COLUMN `family` VARCHAR(80) NULL,
    ADD COLUMN `seniority` ENUM('ESTAGIO', 'APRENDIZ', 'JUNIOR', 'PLENO', 'SENIOR', 'ESPECIALISTA', 'COORDENACAO', 'GERENCIA', 'DIRETORIA') NULL;

-- AlterTable
ALTER TABLE `terminations` ADD COLUMN `apprentice` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `fgtsBalanceInformed` DECIMAL(12, 2) NULL,
    ADD COLUMN `noticeType` ENUM('INDENIZADO', 'TRABALHADO', 'DISPENSADO', 'NAO_APLICAVEL') NULL,
    ADD COLUMN `noticeWorkedDays` INTEGER NULL,
    ADD COLUMN `terminationDate` DATETIME(3) NULL,
    ADD COLUMN `thirteenthAdvancePaid` DECIMAL(12, 2) NULL,
    ADD COLUMN `unjustifiedAbsences` INTEGER NULL,
    MODIFY `type` ENUM('VOLUNTARIO', 'INVOLUNTARIO', 'TERMINO_CONTRATO', 'EXPERIENCIA', 'JUSTA_CAUSA', 'SEM_JUSTA_CAUSA', 'ACORDO_484A', 'RESCISAO_INDIRETA') NOT NULL;

-- CreateTable
CREATE TABLE `tenant_rescisao_configs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `insalubridadeGrau` ENUM('NENHUM', 'MINIMO', 'MEDIO', 'MAXIMO') NOT NULL DEFAULT 'NENHUM',
    `insalubridadeBase` ENUM('SALARIO_MINIMO', 'SALARIO_BASE', 'PISO_CATEGORIA') NOT NULL DEFAULT 'SALARIO_MINIMO',
    `periculosidadeAplica` BOOLEAN NOT NULL DEFAULT false,
    `periculosidadeIntegral` BOOLEAN NOT NULL DEFAULT false,
    `mediaMeses` INTEGER NOT NULL DEFAULT 12,
    `mediaBaseFerias` ENUM('PERIODO_AQUISITIVO', 'ANO_CIVIL', 'ULTIMOS_N_MESES') NOT NULL DEFAULT 'PERIODO_AQUISITIVO',
    `mediaBaseDecimoTerceiro` ENUM('PERIODO_AQUISITIVO', 'ANO_CIVIL', 'ULTIMOS_N_MESES') NOT NULL DEFAULT 'ANO_CIVIL',
    `tercoApresentadoSeparado` BOOLEAN NOT NULL DEFAULT true,
    `verbasDesabilitadas` JSON NULL,
    `descontosPadrao` JSON NULL,
    `toleranciaPct` DECIMAL(5, 2) NOT NULL DEFAULT 1.00,
    `cctNome` VARCHAR(180) NULL,
    `cctObservacoes` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenant_rescisao_configs_tenantId_key`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_rescisao_configs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `insalubridadeGrau` ENUM('NENHUM', 'MINIMO', 'MEDIO', 'MAXIMO') NULL,
    `insalubridadeBase` ENUM('SALARIO_MINIMO', 'SALARIO_BASE', 'PISO_CATEGORIA') NULL,
    `periculosidadeAplica` BOOLEAN NULL,
    `periculosidadeIntegral` BOOLEAN NULL,
    `mediaMeses` INTEGER NULL,
    `mediaBaseFerias` ENUM('PERIODO_AQUISITIVO', 'ANO_CIVIL', 'ULTIMOS_N_MESES') NULL,
    `mediaBaseDecimoTerceiro` ENUM('PERIODO_AQUISITIVO', 'ANO_CIVIL', 'ULTIMOS_N_MESES') NULL,
    `tercoApresentadoSeparado` BOOLEAN NULL,
    `verbasDesabilitadas` JSON NULL,
    `descontosPadrao` JSON NULL,
    `toleranciaPct` DECIMAL(5, 2) NULL,
    `cctNome` VARCHAR(180) NULL,
    `cctObservacoes` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `company_rescisao_configs_companyId_key`(`companyId`),
    INDEX `company_rescisao_configs_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `termination_checks` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `terminationId` VARCHAR(191) NOT NULL,
    `itemKey` VARCHAR(60) NOT NULL,
    `status` ENUM('PENDENTE', 'CONFERIDO', 'DIVERGENTE', 'NAO_APLICAVEL') NOT NULL DEFAULT 'PENDENTE',
    `informedValue` DECIMAL(12, 2) NULL,
    `calculatedValue` DECIMAL(12, 2) NULL,
    `calculationBasis` TEXT NULL,
    `calculationVersion` VARCHAR(20) NULL,
    `calculatedAt` DATETIME(3) NULL,
    `note` TEXT NULL,
    `checkedById` VARCHAR(191) NULL,
    `checkedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `termination_checks_checkedById_fkey`(`checkedById`),
    INDEX `termination_checks_tenantId_status_idx`(`tenantId`, `status`),
    UNIQUE INDEX `termination_checks_terminationId_itemKey_key`(`terminationId`, `itemKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenant_rescisao_configs` ADD CONSTRAINT `tenant_rescisao_configs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_rescisao_configs` ADD CONSTRAINT `company_rescisao_configs_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_rescisao_configs` ADD CONSTRAINT `company_rescisao_configs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `termination_checks` ADD CONSTRAINT `termination_checks_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `termination_checks` ADD CONSTRAINT `termination_checks_terminationId_fkey` FOREIGN KEY (`terminationId`) REFERENCES `terminations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `termination_checks` ADD CONSTRAINT `termination_checks_checkedById_fkey` FOREIGN KEY (`checkedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


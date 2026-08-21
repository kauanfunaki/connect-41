-- Motor de cálculo de referência da rescisão. Migration 100% aditiva:
-- nenhum UPDATE, nenhum DROP, nenhum backfill. Ausência de linha de config
-- significa "usa o padrão legal", então o sistema funciona sem nenhuma linha.

-- AlterEnum: valores novos SEMPRE no fim — em ENUM do MariaDB a posição define
-- o ordinal armazenado, então append preserva as linhas existentes.
ALTER TABLE `terminations`
  MODIFY `type` ENUM('VOLUNTARIO', 'INVOLUNTARIO', 'TERMINO_CONTRATO', 'EXPERIENCIA', 'JUSTA_CAUSA', 'SEM_JUSTA_CAUSA', 'ACORDO_484A', 'RESCISAO_INDIRETA') NOT NULL;

-- AlterTable: entradas do cálculo que não podem ser inferidas de outro módulo
ALTER TABLE `terminations` ADD COLUMN `fgtsBalanceInformed` DECIMAL(12, 2) NULL;
ALTER TABLE `terminations` ADD COLUMN `thirteenthAdvancePaid` DECIMAL(12, 2) NULL;
ALTER TABLE `terminations` ADD COLUMN `unjustifiedAbsences` INTEGER NULL;
ALTER TABLE `terminations` ADD COLUMN `noticeWorkedDays` INTEGER NULL;
ALTER TABLE `terminations` ADD COLUMN `apprentice` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: snapshot do cálculo no momento da conferência (auditoria)
ALTER TABLE `termination_checks` ADD COLUMN `calculatedValue` DECIMAL(12, 2) NULL;
ALTER TABLE `termination_checks` ADD COLUMN `calculationBasis` TEXT NULL;
ALTER TABLE `termination_checks` ADD COLUMN `calculationVersion` VARCHAR(20) NULL;
ALTER TABLE `termination_checks` ADD COLUMN `calculatedAt` DATETIME(3) NULL;

-- CreateTable: padrão do escritório (colunas NOT NULL com default = base completa)
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

-- CreateTable: override por empresa (TODAS nullable — null = herda do tenant)
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

-- AddForeignKey
ALTER TABLE `tenant_rescisao_configs` ADD CONSTRAINT `tenant_rescisao_configs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_rescisao_configs` ADD CONSTRAINT `company_rescisao_configs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_rescisao_configs` ADD CONSTRAINT `company_rescisao_configs_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

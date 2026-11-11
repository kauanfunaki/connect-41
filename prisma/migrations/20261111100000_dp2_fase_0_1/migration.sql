-- DP 2, fases 0 e 1 (11/11/2026, funcionalidade-621): o setor novo, ao lado
-- do DP de sempre, que continua no ar. Só tabelas novas (dp2_*) e a linha do
-- setor "DP 2" nos escritórios que já têm setores; nenhum registro existente
-- muda. Os módulos do DP 2 nascem desligados (Admin › Módulos).

-- CreateTable
CREATE TABLE `dp2_tabelas_oficiais` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `vigencia` VARCHAR(7) NOT NULL,
    `dados` JSON NOT NULL,
    `observacao` VARCHAR(500) NULL,
    `criadaPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dp2_tabelas_oficiais_tenantId_tipo_vigencia_key`(`tenantId`, `tipo`, `vigencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dp2_rubricas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `codigo` VARCHAR(10) NOT NULL,
    `nome` VARCHAR(120) NOT NULL,
    `tipo` VARCHAR(12) NOT NULL,
    `papel` VARCHAR(30) NULL,
    `lancamento` VARCHAR(10) NOT NULL DEFAULT 'VALOR',
    `naturezaEsocial` VARCHAR(4) NULL,
    `incideInss` BOOLEAN NOT NULL DEFAULT true,
    `incideFgts` BOOLEAN NOT NULL DEFAULT true,
    `incideIrrf` BOOLEAN NOT NULL DEFAULT true,
    `entraNaMedia` BOOLEAN NOT NULL DEFAULT false,
    `contaDebito` VARCHAR(40) NULL,
    `contaCredito` VARCHAR(40) NULL,
    `ativa` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `dp2_rubricas_tenantId_papel_idx`(`tenantId`, `papel`),
    UNIQUE INDEX `dp2_rubricas_tenantId_codigo_key`(`tenantId`, `codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dp2_convencoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(160) NOT NULL,
    `sindicato` VARCHAR(160) NULL,
    `dataBase` INTEGER NULL,
    `vigenciaInicio` VARCHAR(10) NULL,
    `vigenciaFim` VARCHAR(10) NULL,
    `piso` DECIMAL(12, 2) NULL,
    `he50` DECIMAL(6, 2) NOT NULL DEFAULT 50,
    `he100` DECIMAL(6, 2) NOT NULL DEFAULT 100,
    `noturno` DECIMAL(6, 2) NOT NULL DEFAULT 20,
    `observacoes` TEXT NULL,
    `ativa` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `dp2_convencoes_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dp2_empresas_config` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `convencaoId` VARCHAR(191) NULL,
    `patronalNoDas` BOOLEAN NOT NULL DEFAULT false,
    `ratAliquota` DECIMAL(5, 2) NOT NULL DEFAULT 2,
    `fap` DECIMAL(6, 4) NOT NULL DEFAULT 1,
    `terceirosAliquota` DECIMAL(5, 2) NOT NULL DEFAULT 5.8,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dp2_empresas_config_companyId_key`(`companyId`),
    INDEX `dp2_empresas_config_tenantId_idx`(`tenantId`),
    INDEX `dp2_empresas_config_convencaoId_idx`(`convencaoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dp2_vinculos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `salarioBase` DECIMAL(12, 2) NOT NULL,
    `tipoSalario` VARCHAR(10) NOT NULL DEFAULT 'MENSAL',
    `horasMensais` INTEGER NOT NULL DEFAULT 220,
    `dependentesIrrf` INTEGER NOT NULL DEFAULT 0,
    `filhosSalarioFamilia` INTEGER NOT NULL DEFAULT 0,
    `insalubridade` VARCHAR(10) NOT NULL DEFAULT 'NENHUM',
    `periculosidade` BOOLEAN NOT NULL DEFAULT false,
    `valeTransporte` BOOLEAN NOT NULL DEFAULT false,
    `aprendiz` BOOLEAN NOT NULL DEFAULT false,
    `observacoes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dp2_vinculos_personId_key`(`personId`),
    INDEX `dp2_vinculos_tenantId_companyId_idx`(`tenantId`, `companyId`),
    INDEX `dp2_vinculos_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dp2_competencias` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `ano` INTEGER NOT NULL,
    `mes` INTEGER NOT NULL,
    `tipo` VARCHAR(10) NOT NULL DEFAULT 'MENSAL',
    `situacao` VARCHAR(10) NOT NULL DEFAULT 'ABERTA',
    `abertaPorId` VARCHAR(191) NULL,
    `calculadaEm` DATETIME(3) NULL,
    `fechadaEm` DATETIME(3) NULL,
    `fechadaPorId` VARCHAR(191) NULL,
    `totais` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `dp2_competencias_tenantId_ano_mes_idx`(`tenantId`, `ano`, `mes`),
    UNIQUE INDEX `dp2_competencias_companyId_ano_mes_tipo_key`(`companyId`, `ano`, `mes`, `tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dp2_eventos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `competenciaId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `rubricaId` VARCHAR(191) NOT NULL,
    `quantidade` DECIMAL(10, 2) NULL,
    `valor` DECIMAL(12, 2) NULL,
    `origem` VARCHAR(10) NOT NULL DEFAULT 'DP',
    `observacao` VARCHAR(300) NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `dp2_eventos_competenciaId_personId_idx`(`competenciaId`, `personId`),
    INDEX `dp2_eventos_rubricaId_idx`(`rubricaId`),
    INDEX `dp2_eventos_personId_idx`(`personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dp2_calculos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `competenciaId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `proventos` DECIMAL(12, 2) NOT NULL,
    `descontos` DECIMAL(12, 2) NOT NULL,
    `liquido` DECIMAL(12, 2) NOT NULL,
    `baseInss` DECIMAL(12, 2) NOT NULL,
    `inss` DECIMAL(12, 2) NOT NULL,
    `baseIrrf` DECIMAL(12, 2) NOT NULL,
    `irrf` DECIMAL(12, 2) NOT NULL,
    `baseFgts` DECIMAL(12, 2) NOT NULL,
    `fgts` DECIMAL(12, 2) NOT NULL,
    `itens` JSON NOT NULL,
    `memoria` JSON NOT NULL,
    `encargos` JSON NOT NULL,
    `provisoes` JSON NOT NULL,
    `alertas` JSON NOT NULL,
    `calculadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_calculos_personId_idx`(`personId`),
    UNIQUE INDEX `dp2_calculos_competenciaId_personId_key`(`competenciaId`, `personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dp2_comparativos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `competenciaId` VARCHAR(191) NOT NULL,
    `personId` VARCHAR(191) NOT NULL,
    `proventos` DECIMAL(12, 2) NULL,
    `descontos` DECIMAL(12, 2) NULL,
    `liquido` DECIMAL(12, 2) NULL,
    `inss` DECIMAL(12, 2) NULL,
    `irrf` DECIMAL(12, 2) NULL,
    `fgts` DECIMAL(12, 2) NULL,
    `importadoPorId` VARCHAR(191) NULL,
    `importadoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dp2_comparativos_personId_idx`(`personId`),
    UNIQUE INDEX `dp2_comparativos_competenciaId_personId_key`(`competenciaId`, `personId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `dp2_empresas_config` ADD CONSTRAINT `dp2_empresas_config_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dp2_empresas_config` ADD CONSTRAINT `dp2_empresas_config_convencaoId_fkey` FOREIGN KEY (`convencaoId`) REFERENCES `dp2_convencoes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dp2_vinculos` ADD CONSTRAINT `dp2_vinculos_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dp2_vinculos` ADD CONSTRAINT `dp2_vinculos_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dp2_competencias` ADD CONSTRAINT `dp2_competencias_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dp2_eventos` ADD CONSTRAINT `dp2_eventos_competenciaId_fkey` FOREIGN KEY (`competenciaId`) REFERENCES `dp2_competencias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dp2_eventos` ADD CONSTRAINT `dp2_eventos_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dp2_eventos` ADD CONSTRAINT `dp2_eventos_rubricaId_fkey` FOREIGN KEY (`rubricaId`) REFERENCES `dp2_rubricas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dp2_calculos` ADD CONSTRAINT `dp2_calculos_competenciaId_fkey` FOREIGN KEY (`competenciaId`) REFERENCES `dp2_competencias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dp2_calculos` ADD CONSTRAINT `dp2_calculos_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dp2_comparativos` ADD CONSTRAINT `dp2_comparativos_competenciaId_fkey` FOREIGN KEY (`competenciaId`) REFERENCES `dp2_competencias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dp2_comparativos` ADD CONSTRAINT `dp2_comparativos_personId_fkey` FOREIGN KEY (`personId`) REFERENCES `people`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- O setor "DP 2", como a Controladoria em 20260930200000: só nos tenants que já
-- têm setores e ainda não têm este. Tenant sem setor nenhum é semeado pelo
-- ensureDefaultSectors, que já inclui o DP 2.
INSERT INTO `sectors` (`id`, `tenantId`, `code`, `label`, `color`, `active`, `order`, `createdAt`, `updatedAt`)
SELECT UUID(), t.`id`, 'dp2', 'DP 2', '#5B3FA6', true,
       (SELECT COALESCE(MAX(s.`order`), -1) + 1 FROM `sectors` s WHERE s.`tenantId` = t.`id`),
       NOW(3), NOW(3)
FROM `tenants` t
WHERE EXISTS (SELECT 1 FROM `sectors` s1 WHERE s1.`tenantId` = t.`id`)
  AND NOT EXISTS (SELECT 1 FROM `sectors` s2 WHERE s2.`tenantId` = t.`id` AND s2.`code` = 'dp2');

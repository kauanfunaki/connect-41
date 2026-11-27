-- CreateTable
CREATE TABLE `fiscal_produtos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `participanteDocumento` VARCHAR(14) NOT NULL DEFAULT '',
    `codigo` VARCHAR(120) NOT NULL,
    `descricao` VARCHAR(500) NOT NULL,
    `ncm` VARCHAR(8) NOT NULL DEFAULT '',
    `cest` VARCHAR(7) NULL,
    `unidade` VARCHAR(6) NULL,
    `grupo` VARCHAR(60) NULL,
    `origem` VARCHAR(1) NULL,
    `tipoItem` VARCHAR(2) NOT NULL DEFAULT '99',
    `cClassTrib` VARCHAR(6) NULL,
    `cstIbsCbs` VARCHAR(3) NULL,
    `sentido` VARCHAR(7) NOT NULL,
    `ocorrencias` INTEGER NOT NULL DEFAULT 0,
    `ultimaNotaEm` DATETIME(3) NULL,
    `editadoEm` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fiscal_produtos_companyId_idx`(`companyId`),
    INDEX `fiscal_produtos_tenantId_companyId_ncm_idx`(`tenantId`, `companyId`, `ncm`),
    UNIQUE INDEX `fiscal_produtos_tenantId_companyId_participanteDocumento_cod_key`(`tenantId`, `companyId`, `participanteDocumento`, `codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fiscal_participantes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `documento` VARCHAR(14) NOT NULL,
    `nome` VARCHAR(180) NOT NULL,
    `papel` VARCHAR(10) NOT NULL,
    `uf` VARCHAR(2) NULL,
    `inscricaoEstadual` VARCHAR(30) NULL,
    `regime` VARCHAR(8) NULL,
    `contribuinteIcms` VARCHAR(1) NULL,
    `documentos` INTEGER NOT NULL DEFAULT 0,
    `primeiraNotaEm` DATETIME(3) NULL,
    `ultimaNotaEm` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fiscal_participantes_companyId_idx`(`companyId`),
    UNIQUE INDEX `fiscal_participantes_tenantId_companyId_documento_key`(`tenantId`, `companyId`, `documento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fiscal_vinculos_ncm` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `ncm` VARCHAR(8) NOT NULL,
    `cClassTrib` VARCHAR(6) NOT NULL,
    `cstIbsCbs` VARCHAR(3) NULL,
    `observacao` VARCHAR(200) NULL,
    `atualizadoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fiscal_vinculos_ncm_tenantId_ncm_key`(`tenantId`, `ncm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fiscal_produtos` ADD CONSTRAINT `fiscal_produtos_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fiscal_participantes` ADD CONSTRAINT `fiscal_participantes_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


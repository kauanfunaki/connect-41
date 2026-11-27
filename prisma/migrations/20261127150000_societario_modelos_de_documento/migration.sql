-- CreateTable
CREATE TABLE `soc_modelos_documento` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(30) NOT NULL,
    `nome` VARCHAR(120) NOT NULL,
    `nomeArquivo` VARCHAR(255) NOT NULL,
    `conteudo` MEDIUMBLOB NOT NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `enviadoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `soc_modelos_documento_tenantId_tipo_idx`(`tenantId`, `tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `soc_participantes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `papel` VARCHAR(12) NOT NULL,
    `nome` VARCHAR(180) NOT NULL,
    `cpf` VARCHAR(11) NULL,
    `rg` VARCHAR(30) NULL,
    `oab` VARCHAR(30) NULL,
    `nacionalidade` VARCHAR(60) NULL,
    `estadoCivil` VARCHAR(40) NULL,
    `profissao` VARCHAR(120) NULL,
    `endereco` VARCHAR(300) NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `soc_participantes_tenantId_papel_idx`(`tenantId`, `papel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `soc_processo_participantes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `processId` VARCHAR(191) NOT NULL,
    `participanteId` VARCHAR(191) NOT NULL,
    `lugar` VARCHAR(14) NOT NULL,

    INDEX `soc_processo_participantes_participanteId_idx`(`participanteId`),
    INDEX `soc_processo_participantes_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `soc_processo_participantes_processId_lugar_key`(`processId`, `lugar`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `soc_documentos_gerados` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `processId` VARCHAR(191) NOT NULL,
    `modeloId` VARCHAR(191) NULL,
    `nomeArquivo` VARCHAR(255) NOT NULL,
    `driveFileId` VARCHAR(191) NULL,
    `geradoPor` VARCHAR(150) NOT NULL,
    `geradoEm` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `soc_documentos_gerados_processId_geradoEm_idx`(`processId`, `geradoEm`),
    INDEX `soc_documentos_gerados_modeloId_idx`(`modeloId`),
    INDEX `soc_documentos_gerados_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `soc_processo_participantes` ADD CONSTRAINT `soc_processo_participantes_processId_fkey` FOREIGN KEY (`processId`) REFERENCES `processes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `soc_processo_participantes` ADD CONSTRAINT `soc_processo_participantes_participanteId_fkey` FOREIGN KEY (`participanteId`) REFERENCES `soc_participantes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `soc_documentos_gerados` ADD CONSTRAINT `soc_documentos_gerados_processId_fkey` FOREIGN KEY (`processId`) REFERENCES `processes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `soc_documentos_gerados` ADD CONSTRAINT `soc_documentos_gerados_modeloId_fkey` FOREIGN KEY (`modeloId`) REFERENCES `soc_modelos_documento`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


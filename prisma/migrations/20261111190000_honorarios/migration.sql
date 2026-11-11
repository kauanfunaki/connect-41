-- CreateTable
CREATE TABLE `hon_config` (
    `tenantId` VARCHAR(191) NOT NULL,
    `raizUnc` VARCHAR(300) NOT NULL,
    `pastaInicial` VARCHAR(300) NOT NULL,
    `pastaFinal` VARCHAR(300) NOT NULL,
    `regexSubpastaContrato` VARCHAR(500) NOT NULL,
    `horarioAgendado` VARCHAR(5) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hon_sync_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(12) NOT NULL,
    `origem` VARCHAR(10) NOT NULL,
    `ativoTenantId` VARCHAR(36) NULL,
    `solicitadoEm` DATETIME(3) NOT NULL,
    `iniciadoEm` DATETIME(3) NULL,
    `ultimoLoteEm` DATETIME(3) NULL,
    `concluidoEm` DATETIME(3) NULL,
    `roboHost` VARCHAR(100) NULL,
    `pastasTotal` INTEGER NULL,
    `pastasRecebidas` INTEGER NOT NULL DEFAULT 0,
    `arquivosRecebidos` INTEGER NOT NULL DEFAULT 0,
    `erro` TEXT NULL,

    UNIQUE INDEX `hon_sync_jobs_ativoTenantId_key`(`ativoTenantId`),
    INDEX `hon_sync_jobs_tenantId_status_solicitadoEm_idx`(`tenantId`, `status`, `solicitadoEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hon_robos` (
    `tenantId` VARCHAR(191) NOT NULL,
    `host` VARCHAR(100) NOT NULL,
    `versao` VARCHAR(30) NULL,
    `vistoEm` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`, `host`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hon_pastas` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `jobId` VARCHAR(191) NOT NULL,
    `nomePasta` VARCHAR(300) NOT NULL,
    `nomePastaHash` CHAR(64) NOT NULL,
    `subpastasContrato` JSON NOT NULL,
    `erro` VARCHAR(1000) NULL,

    UNIQUE INDEX `hon_pastas_jobId_nomePastaHash_key`(`jobId`, `nomePastaHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hon_arquivos` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `jobId` VARCHAR(191) NOT NULL,
    `pastaId` BIGINT NOT NULL,
    `caminhoRelativo` VARCHAR(1000) NOT NULL,
    `nome` VARCHAR(300) NOT NULL,
    `ext` VARCHAR(20) NOT NULL,
    `tamanho` BIGINT NOT NULL,
    `modificadoEm` DATETIME(3) NOT NULL,
    `pdfAssinado` BOOLEAN NULL,
    `pdfMarca` VARCHAR(20) NULL,

    INDEX `hon_arquivos_jobId_idx`(`jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hon_vinculos_pasta` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `nomePasta` VARCHAR(300) NOT NULL,
    `nomePastaHash` CHAR(64) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `tipo` VARCHAR(12) NOT NULL,
    `vinculadoEm` DATETIME(3) NOT NULL,

    INDEX `hon_vinculos_pasta_companyId_idx`(`companyId`),
    UNIQUE INDEX `hon_vinculos_pasta_tenantId_nomePastaHash_key`(`tenantId`, `nomePastaHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hon_empresas_sem_pasta` (
    `companyId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `motivo` VARCHAR(300) NULL,
    `marcadoEm` DATETIME(3) NOT NULL,

    INDEX `hon_empresas_sem_pasta_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hon_textos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `chave` CHAR(64) NOT NULL,
    `nomePasta` VARCHAR(300) NOT NULL,
    `caminhoRelativo` VARCHAR(1000) NOT NULL,
    `modificadoEm` DATETIME(3) NOT NULL,
    `tamanho` BIGINT NOT NULL,
    `status` VARCHAR(10) NOT NULL,
    `paginas` SMALLINT NULL,
    `texto` MEDIUMTEXT NULL,
    `erro` VARCHAR(500) NULL,
    `extraidoEm` DATETIME(3) NOT NULL,
    `roboVersao` VARCHAR(30) NULL,
    `leitorVersao` SMALLINT NOT NULL DEFAULT 0,
    `tipoDocumento` VARCHAR(10) NULL,
    `dataDocumento` DATE NULL,
    `honorario` DECIMAL(12, 2) NULL,
    `adicionalFuncionario` DECIMAL(12, 2) NULL,
    `formaLeitura` VARCHAR(20) NULL,
    `condicional` BOOLEAN NULL,
    `trecho` VARCHAR(600) NULL,
    `cnpjs` VARCHAR(600) NULL,

    INDEX `hon_textos_tenantId_leitorVersao_idx`(`tenantId`, `leitorVersao`),
    UNIQUE INDEX `hon_textos_tenantId_chave_key`(`tenantId`, `chave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hon_manuais` (
    `companyId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `valor` DECIMAL(12, 2) NOT NULL,
    `documento` VARCHAR(1000) NULL,
    `observacao` VARCHAR(300) NULL,
    `origem` VARCHAR(12) NOT NULL DEFAULT 'digitado',
    `informadoPor` VARCHAR(150) NOT NULL,
    `informadoEm` DATETIME(3) NOT NULL,

    INDEX `hon_manuais_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`companyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hon_acessorias_empresas` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `cnpjDigitos` VARCHAR(14) NOT NULL,
    `identificador` VARCHAR(20) NOT NULL,
    `acessoriasId` VARCHAR(20) NULL,
    `razao` VARCHAR(300) NULL,
    `situacao` VARCHAR(50) NULL,
    `honorario` DECIMAL(12, 2) NULL,
    `lidoEm` DATETIME(3) NOT NULL,

    UNIQUE INDEX `hon_acessorias_empresas_tenantId_cnpjDigitos_key`(`tenantId`, `cnpjDigitos`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hon_acessorias_envios` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `cnpjDigitos` VARCHAR(14) NOT NULL,
    `razaoSocial` VARCHAR(300) NOT NULL,
    `valorAnterior` DECIMAL(12, 2) NULL,
    `valorEnviado` DECIMAL(12, 2) NOT NULL,
    `fonte` VARCHAR(10) NOT NULL,
    `documento` VARCHAR(1000) NULL,
    `conta` VARCHAR(150) NOT NULL,
    `ip` VARCHAR(64) NULL,
    `status` VARCHAR(5) NOT NULL,
    `erro` VARCHAR(1000) NULL,
    `outrosCampos` JSON NULL,
    `fichaAntes` JSON NULL,
    `fichaDepois` JSON NULL,
    `enviadoEm` DATETIME(3) NOT NULL,
    `conferidoEm` DATETIME(3) NULL,
    `conferidoPor` VARCHAR(150) NULL,

    INDEX `hon_acessorias_envios_tenantId_enviadoEm_idx`(`tenantId`, `enviadoEm`),
    INDEX `hon_acessorias_envios_companyId_enviadoEm_idx`(`companyId`, `enviadoEm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `hon_pastas` ADD CONSTRAINT `hon_pastas_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `hon_sync_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hon_arquivos` ADD CONSTRAINT `hon_arquivos_pastaId_fkey` FOREIGN KEY (`pastaId`) REFERENCES `hon_pastas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hon_vinculos_pasta` ADD CONSTRAINT `hon_vinculos_pasta_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hon_empresas_sem_pasta` ADD CONSTRAINT `hon_empresas_sem_pasta_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hon_manuais` ADD CONSTRAINT `hon_manuais_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hon_acessorias_envios` ADD CONSTRAINT `hon_acessorias_envios_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

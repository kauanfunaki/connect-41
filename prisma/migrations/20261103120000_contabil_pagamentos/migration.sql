-- CreateTable
CREATE TABLE `contabil_documentos_pagamento` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(20) NOT NULL,
    `categoria` VARCHAR(40) NOT NULL DEFAULT '',
    `nome` VARCHAR(255) NOT NULL,
    `pasta` VARCHAR(255) NOT NULL DEFAULT '',
    `fileUrl` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `paginas` INTEGER NOT NULL DEFAULT 0,
    `semTexto` INTEGER NOT NULL DEFAULT 0,
    `enviadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `contabil_documentos_pagamento_tenantId_companyId_tipo_idx`(`tenantId`, `companyId`, `tipo`),
    UNIQUE INDEX `contabil_documentos_pagamento_companyId_sha256_key`(`companyId`, `sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contabil_pagamentos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `arquivoId` VARCHAR(191) NOT NULL,
    `pagina` INTEGER NOT NULL,
    `ordem` INTEGER NOT NULL DEFAULT 1,
    `tipo` VARCHAR(20) NOT NULL,
    `categoria` VARCHAR(40) NOT NULL DEFAULT '',
    `competencia` VARCHAR(7) NOT NULL DEFAULT '',
    `nome` VARCHAR(200) NOT NULL DEFAULT '',
    `documento` VARCHAR(14) NOT NULL DEFAULT '',
    `numero` VARCHAR(30) NOT NULL DEFAULT '',
    `dataPagamento` VARCHAR(10) NOT NULL DEFAULT '',
    `dataServico` VARCHAR(10) NOT NULL DEFAULT '',
    `bruto` DECIMAL(15, 2) NULL,
    `liquido` DECIMAL(15, 2) NULL,
    `retencoes` JSON NULL,
    `centroCusto` VARCHAR(20) NOT NULL DEFAULT '',
    `comprovanteId` VARCHAR(191) NULL,
    `situacao` VARCHAR(12) NOT NULL DEFAULT 'ok',
    `observacao` VARCHAR(300) NOT NULL DEFAULT '',
    `chaveNegocio` VARCHAR(120) NOT NULL DEFAULT '',
    `tipoCorrigido` VARCHAR(20) NOT NULL DEFAULT '',
    `categoriaCorrigida` VARCHAR(40) NOT NULL DEFAULT '',
    `nomeCorrigido` VARCHAR(200) NOT NULL DEFAULT '',
    `documentoCorrigido` VARCHAR(14) NOT NULL DEFAULT '',
    `competenciaCorrigida` VARCHAR(7) NOT NULL DEFAULT '',
    `dataPagamentoCorrigida` VARCHAR(10) NOT NULL DEFAULT '',
    `valorCorrigido` DECIMAL(15, 2) NULL,
    `corrigidoPorId` VARCHAR(191) NULL,
    `corrigidoEm` DATETIME(3) NULL,
    `decisao` VARCHAR(12) NOT NULL DEFAULT '',
    `motivoDecisao` VARCHAR(300) NOT NULL DEFAULT '',
    `decididoPorId` VARCHAR(191) NULL,
    `decididoEm` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `contabil_pagamentos_tenantId_companyId_competencia_idx`(`tenantId`, `companyId`, `competencia`),
    INDEX `contabil_pagamentos_tenantId_companyId_competenciaCorrigida_idx`(`tenantId`, `companyId`, `competenciaCorrigida`),
    INDEX `contabil_pagamentos_chaveNegocio_idx`(`chaveNegocio`),
    UNIQUE INDEX `contabil_pagamentos_arquivoId_pagina_ordem_key`(`arquivoId`, `pagina`, `ordem`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contabil_pagamento_categorias` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `categoria` VARCHAR(40) NOT NULL,
    `codigoDebito` VARCHAR(20) NOT NULL DEFAULT '',
    `contaCredito` VARCHAR(20) NOT NULL DEFAULT '',
    `observacao` VARCHAR(500) NOT NULL DEFAULT '',
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `contabil_pagamento_categorias_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `contabil_pagamento_categorias_companyId_categoria_key`(`companyId`, `categoria`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contabil_pagamento_nomes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `chaveNome` VARCHAR(200) NOT NULL,
    `nome` VARCHAR(200) NOT NULL,
    `contaCredito` VARCHAR(20) NOT NULL,
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `contabil_pagamento_nomes_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `contabil_pagamento_nomes_companyId_chaveNome_key`(`companyId`, `chaveNome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contabil_contas_pagamento` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `chave` VARCHAR(40) NOT NULL,
    `conta` VARCHAR(20) NOT NULL DEFAULT '',
    `updatedById` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `contabil_contas_pagamento_tenantId_companyId_idx`(`tenantId`, `companyId`),
    UNIQUE INDEX `contabil_contas_pagamento_companyId_chave_key`(`companyId`, `chave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `contabil_documentos_pagamento` ADD CONSTRAINT `contabil_documentos_pagamento_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contabil_pagamentos` ADD CONSTRAINT `contabil_pagamentos_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contabil_pagamentos` ADD CONSTRAINT `contabil_pagamentos_arquivoId_fkey` FOREIGN KEY (`arquivoId`) REFERENCES `contabil_documentos_pagamento`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contabil_pagamento_categorias` ADD CONSTRAINT `contabil_pagamento_categorias_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contabil_pagamento_nomes` ADD CONSTRAINT `contabil_pagamento_nomes_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contabil_contas_pagamento` ADD CONSTRAINT `contabil_contas_pagamento_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


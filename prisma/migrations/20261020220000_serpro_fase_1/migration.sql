-- Integra Contador, Fase 1 (20/10/2026): o que o Serpro dá de graça ou sob
-- pedido, sem transmitir nada.
-- - serpro_eventos: o último evento de cada contribuinte (DCTFWeb, Caixa
--   Postal, pagamento) e o "sem acesso" de quem não tem autorização, lidos
--   uma vez por dia na matriz dos Eventos de Atualização;
-- - serpro_pedidos: os pedidos que o Serpro responde depois (o relatório de
--   situação fiscal e o lote dos Eventos), com o protocolo e a próxima tentativa;
-- - serpro_mensagens: as mensagens da Caixa Postal da Receita, e quem abriu
--   cada uma pelo Connect (abrir dá ciência da intimação).
-- Tabelas novas, sem mexer nas existentes. A ficha da empresa e o agendador
-- leem as três: rodar ANTES do deploy.

-- CreateTable
CREATE TABLE `serpro_eventos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `chave` VARCHAR(14) NOT NULL,
    `documento` VARCHAR(14) NOT NULL,
    `evento` VARCHAR(5) NOT NULL,
    `ultimoEm` DATETIME(3) NULL,
    `semAcesso` BOOLEAN NOT NULL DEFAULT false,
    `pendente` BOOLEAN NOT NULL DEFAULT false,
    `lidoEm` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `serpro_eventos_tenantId_evento_pendente_idx`(`tenantId`, `evento`, `pendente`),
    UNIQUE INDEX `serpro_eventos_tenantId_chave_evento_key`(`tenantId`, `chave`, `evento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `serpro_pedidos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(30) NOT NULL,
    `contribuinte` VARCHAR(14) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `protocolo` TEXT NULL,
    `situacao` VARCHAR(12) NOT NULL,
    `proximaTentativa` DATETIME(3) NOT NULL,
    `tentativas` INTEGER NOT NULL DEFAULT 0,
    `dia` VARCHAR(10) NOT NULL,
    `erro` VARCHAR(500) NULL,
    `driveFileId` VARCHAR(191) NULL,
    `pedidoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `serpro_pedidos_tenantId_situacao_proximaTentativa_idx`(`tenantId`, `situacao`, `proximaTentativa`),
    INDEX `serpro_pedidos_tenantId_companyId_tipo_idx`(`tenantId`, `companyId`, `tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `serpro_mensagens` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `chave` VARCHAR(14) NOT NULL,
    `documento` VARCHAR(14) NOT NULL,
    `isn` VARCHAR(20) NOT NULL,
    `assunto` VARCHAR(400) NOT NULL,
    `enviadaEm` DATETIME(3) NOT NULL,
    `relevante` BOOLEAN NOT NULL,
    `origem` VARCHAR(120) NULL,
    `numeroControle` VARCHAR(30) NULL,
    `validaAte` DATETIME(3) NULL,
    `cienciaEm` DATETIME(3) NULL,
    `lidaNoSerpro` BOOLEAN NOT NULL DEFAULT false,
    `abertaEm` DATETIME(3) NULL,
    `abertaPorId` VARCHAR(191) NULL,
    `corpo` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `serpro_mensagens_tenantId_abertaEm_idx`(`tenantId`, `abertaEm`),
    UNIQUE INDEX `serpro_mensagens_tenantId_chave_isn_key`(`tenantId`, `chave`, `isn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `serpro_eventos` ADD CONSTRAINT `serpro_eventos_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serpro_pedidos` ADD CONSTRAINT `serpro_pedidos_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `serpro_mensagens` ADD CONSTRAINT `serpro_mensagens_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


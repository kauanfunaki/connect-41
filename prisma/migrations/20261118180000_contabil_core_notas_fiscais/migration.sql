-- Contábil Core, Bloco C (Fase C1, 18/11/2026): as notas fiscais.
-- Uma tabela nova, porte de notas_fiscais do original (0001, 0010, 0018 e 0035):
-- NF-e e NFS-e da empresa, importadas do XML, do PDF ou da imagem, ou cadastradas à
-- mão, e ligadas à mão a uma transação do extrato. Só CREATE TABLE, chaves e
-- checagens: nada existente é alterado.
--
-- - As duas unicidades do original (uq_nota_empresa_chave e uq_nota_empresa_dedup)
--   são TOTAIS, não parciais: continuam como índices únicos comuns. Chave de
--   acesso nula não colide, como no PostgreSQL.
-- - `transacaoId` aponta para core_transacoes, como o transacao_id do original.
--   A transação nunca é apagada de verdade (só `deletedAt`), então a chave não
--   trava o desfazer da importação; a exclusão da empresa apaga as notas antes.
-- - Os três enums do original (tipo_nota_enum, status_nota_enum e
--   origem_nota_enum) entram como CHECK, que o MySQL 8 confere.
-- Desenho em docs/CONTABIL-CORE.md (Fase C1).

-- CreateTable
CREATE TABLE `core_notas_fiscais` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(5) NOT NULL,
    `numero` VARCHAR(50) NOT NULL,
    `serie` VARCHAR(10) NULL,
    `cnpjEmitente` VARCHAR(18) NOT NULL,
    `nomeEmitente` VARCHAR(300) NULL,
    `cnpjDestinatario` VARCHAR(18) NULL,
    `valor` DECIMAL(15, 2) NOT NULL,
    `dataEmissao` DATETIME(3) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'pendente',
    `transacaoId` VARCHAR(191) NULL,
    `chaveAcesso` VARCHAR(44) NULL,
    `assinaturaMotivo` VARCHAR(200) NULL,
    `dedupKey` CHAR(64) NOT NULL,
    `observacao` VARCHAR(500) NULL,
    `origem` VARCHAR(20) NOT NULL DEFAULT 'xml_assinado',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_notas_fiscais_empresaId_status_idx`(`empresaId`, `status`),
    INDEX `core_notas_fiscais_empresaId_dataEmissao_idx`(`empresaId`, `dataEmissao`),
    INDEX `core_notas_fiscais_transacaoId_idx`(`transacaoId`),
    INDEX `core_notas_fiscais_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `core_notas_fiscais_empresaId_chaveAcesso_key`(`empresaId`, `chaveAcesso`),
    UNIQUE INDEX `core_notas_fiscais_empresaId_dedupKey_key`(`empresaId`, `dedupKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `core_notas_fiscais` ADD CONSTRAINT `core_notas_fiscais_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_notas_fiscais` ADD CONSTRAINT `core_notas_fiscais_transacaoId_fkey` FOREIGN KEY (`transacaoId`) REFERENCES `core_transacoes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Os enums do original como checagens.
ALTER TABLE `core_notas_fiscais` ADD CONSTRAINT `ck_core_nota_tipo` CHECK (`tipo` IN ('nfe', 'nfse'));

ALTER TABLE `core_notas_fiscais` ADD CONSTRAINT `ck_core_nota_status` CHECK (`status` IN ('pendente', 'associada', 'cancelada'));

ALTER TABLE `core_notas_fiscais` ADD CONSTRAINT `ck_core_nota_origem` CHECK (`origem` IN ('xml_assinado', 'xml_nao_verificado', 'ocr'));

-- A chave do escritório para documento financeiro ir à IA (19/11/2026): o
-- ALLOW_FINANCIAL_DATA_TO_OPENAI do original, por tenant e desligada por padrão.
-- CreateTable
CREATE TABLE `tenant_contabil_core_configs` (
    `tenantId` VARCHAR(191) NOT NULL,
    `iaDocumentosFinanceiros` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenant_contabil_core_configs` ADD CONSTRAINT `tenant_contabil_core_configs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

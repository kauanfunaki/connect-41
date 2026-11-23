-- Contábil Core, Bloco C (Fase C2, 19/11/2026): os comprovantes de pagamento.
-- Uma tabela nova, porte de comprovantes do original (0002 e 0037): o PIX, a TED,
-- o DOC e o boleto pago da empresa, lidos do PDF ou da imagem, ou cadastrados à
-- mão, e ligados a uma transação do extrato (à mão ou pelo NEO). Só CREATE TABLE,
-- chaves e checagens: nada existente é alterado.
--
-- - O arquivo fica em disco (storage/contabil-core/comprovantes/<tenantId>/<id>.<ext>),
--   e não numa coluna base64 como lá; a linha guarda nome, tipo, tamanho, SHA-256
--   e a chave (`storageKey`). A carga (C4) tira os bytes de `arquivo_base64` e os
--   grava em disco.
-- - O índice de (empresa, SHA-256) é comum, SEM unique, de propósito, como no
--   original: a base de lá tem duplicados de antes do hash, e quem barra o arquivo
--   repetido é o serviço.
-- - `transacaoId` aponta para core_transacoes, como o transacao_id do original. A
--   transação nunca é apagada de verdade (só `deletedAt`); a exclusão da empresa
--   apaga os comprovantes antes.
-- - As restrições do ComprovanteCreate (valor pago maior que zero; juros, multa e
--   desconto não negativos) entram como CHECK, que o MySQL 8 confere.
-- Desenho em docs/CONTABIL-CORE.md (Fase C2).

-- CreateTable
CREATE TABLE `core_comprovantes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `agenciaId` VARCHAR(191) NULL,
    `transacaoId` VARCHAR(191) NULL,
    `favorecido` VARCHAR(300) NULL,
    `cpfCnpj` VARCHAR(18) NULL,
    `dataPagamento` DATETIME(3) NULL,
    `dataVencimento` DATETIME(3) NULL,
    `valorDocumento` DECIMAL(15, 2) NULL,
    `valorPago` DECIMAL(15, 2) NOT NULL,
    `juros` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `multa` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `desconto` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `observacao` VARCHAR(500) NULL,
    `arquivoNome` VARCHAR(255) NULL,
    `arquivoSha256` CHAR(64) NULL,
    `arquivoTipo` VARCHAR(100) NULL,
    `arquivoTamanho` INTEGER NULL,
    `storageKey` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_comprovantes_empresaId_idx`(`empresaId`),
    INDEX `core_comprovantes_transacaoId_idx`(`transacaoId`),
    INDEX `core_comprovantes_empresaId_arquivoSha256_idx`(`empresaId`, `arquivoSha256`),
    INDEX `core_comprovantes_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `core_comprovantes` ADD CONSTRAINT `core_comprovantes_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_comprovantes` ADD CONSTRAINT `core_comprovantes_agenciaId_fkey` FOREIGN KEY (`agenciaId`) REFERENCES `core_agencias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_comprovantes` ADD CONSTRAINT `core_comprovantes_transacaoId_fkey` FOREIGN KEY (`transacaoId`) REFERENCES `core_transacoes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- As restrições do ComprovanteCreate como checagens.
ALTER TABLE `core_comprovantes` ADD CONSTRAINT `ck_core_comprovante_valor_pago` CHECK (`valorPago` > 0);

ALTER TABLE `core_comprovantes` ADD CONSTRAINT `ck_core_comprovante_acrescimos` CHECK (`juros` >= 0 AND `multa` >= 0 AND `desconto` >= 0);

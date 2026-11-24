-- Contábil Core, Bloco C (Fase C3, 23/11/2026): os cartões de crédito.
-- Cinco tabelas novas, porte de cartoes_credito, faturas_cartao e lancamentos_cartao
-- (0004 e 0011) e de fatura_documentos e fatura_distribuicoes (0043): o cartão, a
-- fatura de cada competência, os gastos, os PDFs enviados com o rascunho lido e a
-- distribuição da fatura sobre a transação que a pagou. Só CREATE TABLE, chaves e
-- checagens: nada existente é alterado.
--
-- - As unicidades do original são TOTAIS (não parciais) e continuam como índices
--   únicos comuns: (cartão, competência), a transação que quitou a fatura (uma
--   transação quita no máximo uma fatura; nulo pode repetir), (fatura, hash do PDF)
--   e a distribuição por fatura. Não há `chaveAtiva`.
-- - O PDF da fatura fica em disco (storage/contabil-core/faturas/<tenantId>/<id>.pdf),
--   e não na coluna `conteudo` como lá; a linha guarda nome, hash, tamanho e a chave
--   (`storageKey`). A carga (C4) tira os bytes de `conteudo` e os grava em disco.
-- - `transacaoId` aponta para core_transacoes e `contaId` para core_plano_contas,
--   como no original. A exclusão da empresa apaga estas tabelas antes delas.
-- - O enum de status da fatura (status_fatura_enum) e as restrições dos esquemas
--   que o banco pode conferir sem contradizer o original entram como CHECK.
-- Desenho em docs/CONTABIL-CORE.md (Fase C3).

-- CreateTable
CREATE TABLE `core_cartoes_credito` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(200) NOT NULL,
    `bandeira` VARCHAR(20) NOT NULL,
    `ultimosDigitos` VARCHAR(4) NULL,
    `diaFechamento` INTEGER NOT NULL,
    `diaVencimento` INTEGER NOT NULL,
    `limite` DECIMAL(15, 2) NULL,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_cartoes_credito_empresaId_idx`(`empresaId`),
    INDEX `core_cartoes_credito_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_faturas_cartao` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `cartaoId` VARCHAR(191) NOT NULL,
    `competencia` VARCHAR(7) NOT NULL,
    `dataFechamento` DATETIME(3) NULL,
    `dataVencimento` DATETIME(3) NULL,
    `valorTotal` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `status` VARCHAR(10) NOT NULL DEFAULT 'aberta',
    `transacaoId` VARCHAR(191) NULL,
    `observacao` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `core_faturas_cartao_transacaoId_key`(`transacaoId`),
    INDEX `core_faturas_cartao_empresaId_status_idx`(`empresaId`, `status`),
    INDEX `core_faturas_cartao_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `core_faturas_cartao_cartaoId_competencia_key`(`cartaoId`, `competencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_lancamentos_cartao` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `faturaId` VARCHAR(191) NOT NULL,
    `dataCompra` DATETIME(3) NOT NULL,
    `descricao` VARCHAR(500) NOT NULL,
    `valor` DECIMAL(15, 2) NOT NULL,
    `contaId` VARCHAR(191) NULL,
    `parcelaAtual` INTEGER NULL,
    `parcelaTotal` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_lancamentos_cartao_faturaId_idx`(`faturaId`),
    INDEX `core_lancamentos_cartao_contaId_idx`(`contaId`),
    INDEX `core_lancamentos_cartao_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_fatura_documentos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `faturaId` VARCHAR(191) NOT NULL,
    `nome` VARCHAR(255) NOT NULL,
    `hashArquivo` CHAR(64) NOT NULL,
    `tamanho` INTEGER NOT NULL,
    `storageKey` VARCHAR(255) NULL,
    `status` VARCHAR(30) NOT NULL,
    `resultado` JSON NOT NULL,
    `erro` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `core_fatura_documentos_tenantId_idx`(`tenantId`),
    UNIQUE INDEX `core_fatura_documentos_faturaId_hashArquivo_key`(`faturaId`, `hashArquivo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `core_fatura_distribuicoes` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `empresaId` VARCHAR(191) NOT NULL,
    `faturaId` VARCHAR(191) NOT NULL,
    `versao` INTEGER NOT NULL,
    `distribuicoes` JSON NOT NULL,
    `aplicacao` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `core_fatura_distribuicoes_faturaId_key`(`faturaId`),
    INDEX `core_fatura_distribuicoes_empresaId_idx`(`empresaId`),
    INDEX `core_fatura_distribuicoes_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `core_cartoes_credito` ADD CONSTRAINT `core_cartoes_credito_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_faturas_cartao` ADD CONSTRAINT `core_faturas_cartao_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_faturas_cartao` ADD CONSTRAINT `core_faturas_cartao_cartaoId_fkey` FOREIGN KEY (`cartaoId`) REFERENCES `core_cartoes_credito`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_faturas_cartao` ADD CONSTRAINT `core_faturas_cartao_transacaoId_fkey` FOREIGN KEY (`transacaoId`) REFERENCES `core_transacoes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_lancamentos_cartao` ADD CONSTRAINT `core_lancamentos_cartao_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_lancamentos_cartao` ADD CONSTRAINT `core_lancamentos_cartao_faturaId_fkey` FOREIGN KEY (`faturaId`) REFERENCES `core_faturas_cartao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_lancamentos_cartao` ADD CONSTRAINT `core_lancamentos_cartao_contaId_fkey` FOREIGN KEY (`contaId`) REFERENCES `core_plano_contas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_fatura_documentos` ADD CONSTRAINT `core_fatura_documentos_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_fatura_documentos` ADD CONSTRAINT `core_fatura_documentos_faturaId_fkey` FOREIGN KEY (`faturaId`) REFERENCES `core_faturas_cartao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_fatura_distribuicoes` ADD CONSTRAINT `core_fatura_distribuicoes_empresaId_fkey` FOREIGN KEY (`empresaId`) REFERENCES `core_empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `core_fatura_distribuicoes` ADD CONSTRAINT `core_fatura_distribuicoes_faturaId_fkey` FOREIGN KEY (`faturaId`) REFERENCES `core_faturas_cartao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- O enum do original e as restrições dos esquemas como checagens. O valor do gasto
-- pode ser 0,00 (o esquema exige maior que zero, mas 0,004 arredonda na coluna, lá e
-- aqui). A parcela fica de
-- fora: o leitor do original grava "00/03" como parcela 0. O limite do cartão também:
-- o `CartaoUpdate` do original não tem o `ge=0` do cadastro.
ALTER TABLE `core_cartoes_credito` ADD CONSTRAINT `ck_core_cartao_bandeira` CHECK (`bandeira` IN ('visa', 'mastercard', 'elo', 'amex', 'hipercard', 'outros'));

ALTER TABLE `core_cartoes_credito` ADD CONSTRAINT `ck_core_cartao_dias` CHECK (`diaFechamento` BETWEEN 1 AND 28 AND `diaVencimento` BETWEEN 1 AND 28);

ALTER TABLE `core_faturas_cartao` ADD CONSTRAINT `ck_core_fatura_status` CHECK (`status` IN ('aberta', 'fechada', 'paga'));

ALTER TABLE `core_lancamentos_cartao` ADD CONSTRAINT `ck_core_lancamento_cartao_valor` CHECK (`valor` >= 0);

ALTER TABLE `core_fatura_documentos` ADD CONSTRAINT `ck_core_fatura_documento_status` CHECK (`status` IN ('processando', 'revisar', 'falhou', 'principal', 'complementar'));

ALTER TABLE `core_fatura_distribuicoes` ADD CONSTRAINT `ck_core_fatura_distribuicao_versao` CHECK (`versao` >= 0);

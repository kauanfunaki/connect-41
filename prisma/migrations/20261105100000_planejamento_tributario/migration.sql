-- Planejamento tributário (05/11/2026): as avaliações do Connect Tributário
-- (dev41tech/connect-tributario, motor R_4.1) trazidas para o Connect como o
-- módulo `contabil_planejamento`. Fase 1: o simulador, sem documentos.
--
-- Só duas tabelas novas, sem coluna em tabela existente. A avaliação inteira
-- fica em `dados` (JSON, o `Study` validado por studySchema); `nome`, `cnpj`,
-- `modo` e `ano` são cópias para lista e filtro. `revisao` é o controle de
-- edição concorrente. `avaliacoes_tributarias_versoes` guarda uma foto a cada
-- gravação, como o study_revisions do original.
--
-- A empresa é opcional (prospecto sem cadastro): apagar a empresa só solta o
-- vínculo (SET NULL) e preserva a avaliação. Rodar antes da publicação — sem as
-- tabelas, a tela do módulo falha ao abrir. O módulo nasce desligado.

-- CreateTable
CREATE TABLE `avaliacoes_tributarias` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `nome` VARCHAR(160) NOT NULL,
    `cnpj` VARCHAR(14) NULL,
    `modo` VARCHAR(10) NOT NULL,
    `ano` INTEGER NOT NULL,
    `dados` JSON NOT NULL,
    `motor` VARCHAR(10) NOT NULL,
    `revisao` INTEGER NOT NULL DEFAULT 1,
    `naLixeiraEm` DATETIME(3) NULL,
    `criadoPorId` VARCHAR(191) NULL,
    `atualizadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `avaliacoes_tributarias_tenantId_naLixeiraEm_updatedAt_idx`(`tenantId`, `naLixeiraEm`, `updatedAt`),
    INDEX `avaliacoes_tributarias_tenantId_companyId_idx`(`tenantId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `avaliacoes_tributarias_versoes` (
    `id` VARCHAR(191) NOT NULL,
    `avaliacaoId` VARCHAR(191) NOT NULL,
    `revisao` INTEGER NOT NULL,
    `acao` VARCHAR(80) NOT NULL,
    `dados` JSON NOT NULL,
    `motor` VARCHAR(10) NOT NULL,
    `autorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `avaliacoes_tributarias_versoes_avaliacaoId_revisao_idx`(`avaliacaoId`, `revisao`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `avaliacoes_tributarias` ADD CONSTRAINT `avaliacoes_tributarias_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `avaliacoes_tributarias` ADD CONSTRAINT `avaliacoes_tributarias_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `avaliacoes_tributarias` ADD CONSTRAINT `avaliacoes_tributarias_criadoPorId_fkey` FOREIGN KEY (`criadoPorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `avaliacoes_tributarias` ADD CONSTRAINT `avaliacoes_tributarias_atualizadoPorId_fkey` FOREIGN KEY (`atualizadoPorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `avaliacoes_tributarias_versoes` ADD CONSTRAINT `avaliacoes_tributarias_versoes_avaliacaoId_fkey` FOREIGN KEY (`avaliacaoId`) REFERENCES `avaliacoes_tributarias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `avaliacoes_tributarias_versoes` ADD CONSTRAINT `avaliacoes_tributarias_versoes_autorId_fkey` FOREIGN KEY (`autorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

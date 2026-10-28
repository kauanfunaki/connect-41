-- Quadros dos colaboradores (28/10/2026): os setores em que o coordenador
-- bloqueou a criação e a edição de tarefas pelos colaboradores. Sem linha é
-- liberado. Tabela nova; não altera registros existentes.
-- CreateTable
CREATE TABLE `quadros_bloqueados_por_setor` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `sectorCode` VARCHAR(40) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `quadros_bloqueados_por_setor_tenantId_sectorCode_key`(`tenantId`, `sectorCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `quadros_bloqueados_por_setor` ADD CONSTRAINT `quadros_bloqueados_por_setor_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

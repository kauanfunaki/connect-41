-- Integra Contador, Fase 3 (27/10/2026): o termo de autorização do modelo
-- software house. Quem contratou o Serpro (a 41 Tech) pede em nome de quem
-- recebe as autorizações (a 41 Contábil), que assina o termo fora do servidor.
-- Tabela nova, sem mexer nas existentes. A tela de Integrações e toda chamada
-- ao Serpro leem a tabela: rodar ANTES do deploy.

-- CreateTable
CREATE TABLE `serpro_termos` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `xml` TEXT NOT NULL,
    `contratante` VARCHAR(14) NOT NULL,
    `autor` VARCHAR(14) NOT NULL,
    `assinadoEm` VARCHAR(10) NOT NULL,
    `vigencia` VARCHAR(10) NOT NULL,
    `certificadoTitular` VARCHAR(200) NULL,
    `certificadoValidoAte` VARCHAR(10) NOT NULL,
    `aceitoEm` DATETIME(3) NULL,
    `erro` VARCHAR(500) NULL,
    `enviadoPorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `serpro_termos_tenantId_key`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `serpro_termos` ADD CONSTRAINT `serpro_termos_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


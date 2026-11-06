-- Campos do SPED no cadastro de empresa (06/11/2026): versão do leiaute, perfil,
-- atividade, contabilista, conta contábil e código de observação padrão, mais o
-- código IBGE do município. E o contabilista padrão do escritório.
--
-- Só colunas opcionais e uma tabela nova; não altera registros existentes.

-- AlterTable
ALTER TABLE `companies` ADD COLUMN `codMunicipioIbge` VARCHAR(7) NULL,
    ADD COLUMN `spedCodVersao` VARCHAR(3) NULL,
    ADD COLUMN `spedIndPerfil` VARCHAR(1) NULL,
    ADD COLUMN `spedIndAtividade` VARCHAR(1) NULL,
    ADD COLUMN `contabilistaNome` VARCHAR(100) NULL,
    ADD COLUMN `contabilistaCpf` VARCHAR(11) NULL,
    ADD COLUMN `contabilistaCrc` VARCHAR(20) NULL,
    ADD COLUMN `spedContaContabilPadrao` VARCHAR(60) NULL,
    ADD COLUMN `spedCodObservacaoPadrao` VARCHAR(60) NULL;

-- CreateTable
CREATE TABLE `tenant_sped_configs` (
    `tenantId` VARCHAR(191) NOT NULL,
    `contabilistaNome` VARCHAR(100) NULL,
    `contabilistaCpf` VARCHAR(11) NULL,
    `contabilistaCrc` VARCHAR(20) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`tenantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tenant_sped_configs` ADD CONSTRAINT `tenant_sped_configs_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

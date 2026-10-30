ALTER TABLE `contabil_regras`
  ADD COLUMN `observacao` VARCHAR(500) NOT NULL DEFAULT '',
  ADD COLUMN `dataLancamento` VARCHAR(10) NOT NULL DEFAULT '',
  ADD COLUMN `valor` DECIMAL(15,2) NULL,
  ADD COLUMN `iniciaLote` VARCHAR(1) NOT NULL DEFAULT '',
  ADD COLUMN `codigoFilial` VARCHAR(10) NOT NULL DEFAULT '',
  ADD COLUMN `centroCustoDebito` VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN `centroCustoCredito` VARCHAR(40) NOT NULL DEFAULT '';

CREATE TABLE `contabil_cfop_contas` (
  `id` VARCHAR(191) NOT NULL,
  `tenantId` VARCHAR(191) NOT NULL,
  `companyId` VARCHAR(191) NOT NULL,
  `cfop` VARCHAR(4) NOT NULL,
  `contaDebito` VARCHAR(20) NOT NULL,
  `observacao` VARCHAR(500) NOT NULL DEFAULT '',
  `updatedById` VARCHAR(191) NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `contabil_cfop_contas_companyId_cfop_key` (`companyId`, `cfop`),
  INDEX `contabil_cfop_contas_tenantId_companyId_idx` (`tenantId`, `companyId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `contabil_cfop_contas_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

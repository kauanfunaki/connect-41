-- Atendimento (12/11/2026): transferência que espera a pessoa assumir, a nota
-- de 1 a 5 do cliente ao encerrar, e índices das métricas por período.
ALTER TABLE `atendimento_ciclos`
    ADD COLUMN `transferidaParaId` VARCHAR(191) NULL,
    ADD COLUMN `transferidaEm` DATETIME(3) NULL,
    ADD COLUMN `notaPedidaEm` DATETIME(3) NULL,
    ADD COLUMN `nota` INTEGER NULL,
    ADD COLUMN `notaEm` DATETIME(3) NULL;

CREATE INDEX `atendimento_ciclos_tenantId_abertoEm_idx` ON `atendimento_ciclos`(`tenantId`, `abertoEm`);
CREATE INDEX `atendimento_ciclos_tenantId_encerradoEm_idx` ON `atendimento_ciclos`(`tenantId`, `encerradoEm`);

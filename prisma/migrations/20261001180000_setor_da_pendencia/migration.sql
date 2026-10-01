-- Pendência com o setor que pediu (01/10/2026): a 41 pede ao cliente pelo
-- portal a partir de qualquer setor, não só do BPO.
--
-- Coluna nova numa tabela que o app já lê: rodar ANTES da publicação.
-- As pendências de antes ficam com setor nulo e continuam valendo como do
-- setor do módulo bpo_pendencias — nada muda na tela do BPO.

-- AlterTable
ALTER TABLE `client_requests` ADD COLUMN `sectorCode` VARCHAR(40) NULL;

-- CreateIndex
CREATE INDEX `client_requests_tenantId_sectorCode_status_idx` ON `client_requests`(`tenantId`, `sectorCode`, `status`);


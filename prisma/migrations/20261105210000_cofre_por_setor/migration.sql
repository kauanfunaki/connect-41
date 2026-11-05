-- Cofre por setor (05/11/2026): o Repositório de senhas virou Apoio de todo
-- setor, e cada setor vê só as suas credenciais. As que já existem ficam no
-- setor que operava a tela neste escritório: o BPO, ou o setor para onde o
-- módulo `bpo_senhas` foi transferido (tenant_modules.sectorCode).
-- Só acrescenta: nenhuma credencial é apagada nem muda de dono fora disso.

-- AlterTable
ALTER TABLE `bpo_credentials` ADD COLUMN `sectorCode` VARCHAR(40) NOT NULL DEFAULT 'bpo';

-- As credenciais do escritório que transferiu a tela para outro setor.
UPDATE `bpo_credentials` c
  JOIN `tenant_modules` tm ON tm.`tenantId` = c.`tenantId` AND tm.`moduleCode` = 'bpo_senhas'
  SET c.`sectorCode` = tm.`sectorCode`
  WHERE tm.`sectorCode` IS NOT NULL AND tm.`sectorCode` <> '';

-- CreateIndex
CREATE INDEX `bpo_credentials_tenantId_sectorCode_idx` ON `bpo_credentials`(`tenantId`, `sectorCode`);

-- Os manuais já tinham setor (`manual_documents.sectorCode`), mas a tela
-- gravava e lia sempre 'bpo'. Os do escritório que transferiu o Repositório de
-- manuais para outro setor vão para esse setor, como as senhas acima.
UPDATE `manual_documents` d
  JOIN `tenant_modules` tm ON tm.`tenantId` = d.`tenantId` AND tm.`moduleCode` = 'bpo_manual'
  SET d.`sectorCode` = tm.`sectorCode`
  WHERE d.`sectorCode` = 'bpo' AND tm.`sectorCode` IS NOT NULL AND tm.`sectorCode` <> '';

-- Vencimento opcional de documentos (ASO, CNH, certificado NR, contrato...)
ALTER TABLE `documents` ADD COLUMN `expiresAt` DATETIME(3) NULL;

CREATE INDEX `documents_tenantId_expiresAt_idx` ON `documents`(`tenantId`, `expiresAt`);

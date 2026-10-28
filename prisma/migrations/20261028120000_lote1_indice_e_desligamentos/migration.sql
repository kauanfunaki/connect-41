-- Lote 1 (28/10/2026).

-- 1. Documentos fiscais: a listagem filtrada por empresa, na ordem da data de
-- emissão. Índice novo, sem mexer nos dados.

-- CreateIndex
CREATE INDEX `fiscal_documents_tenantId_companyId_issuedAt_idx` ON `fiscal_documents`(`tenantId`, `companyId`, `issuedAt`);

-- 2. Desligamentos já finalizados: a data de desligamento da pessoa passa a ser
-- o término do contrato informado na conferência da rescisão, e não o dia do
-- clique em "Finalizado". Só muda quem ainda tem exatamente a data do clique
-- (o `finalizedAt`) e tem o término preenchido — data acertada à mão depois
-- fica como está.
UPDATE `people` p
JOIN `terminations` t ON t.`personId` = p.`id` AND t.`tenantId` = p.`tenantId`
SET p.`dismissalDate` = t.`terminationDate`
WHERE t.`status` = 'FINALIZADO'
  AND t.`terminationDate` IS NOT NULL
  AND t.`finalizedAt` IS NOT NULL
  AND p.`dismissalDate` = t.`finalizedAt`;

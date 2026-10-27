-- Todas as parcelas da nota ligadas a ela (23/10/2026): `fiscalDocumentId`
-- deixa de ser 1:1. A guarda contra lançar a mesma nota duas vezes passa a ser
-- o unique de (`fiscalDocumentId`, `fiscalDocumentInstallment`): a conta única
-- e a 1ª parcela são a posição 1, e o segundo "lançar" bate nela antes de
-- qualquer outra parcela nascer.
--
-- A ordem é a que nunca deixa a nota sem guarda nem a FK sem índice:
--   1. a coluna nasce NOT NULL DEFAULT 1 — toda linha que já existe (as contas
--      de nota de hoje, 1:1) fica na posição 1, e o código antigo, que não
--      conhece a coluna, continua gravando 1;
--   2. o unique composto nasce antes de o simples sair — os dois valem juntos
--      por um instante, e o composto serve de índice para a FK
--      `finance_entries_fiscalDocumentId_fkey` (fiscalDocumentId é a 1ª coluna),
--      então a FK não precisa ser recriada;
--   3. o unique simples sai (é o único passo que remove algo);
--   4. as parcelas 2..N que a versão anterior desta mesma entrega (migration
--      20261023120000, ainda não em produção) criou sem vínculo ganham o da
--      1ª parcela da série. Em produção não há nenhuma; o passo só alinha um
--      banco de desenvolvimento ou homologação que já rodou aquele código.

-- AlterTable
ALTER TABLE `finance_entries` ADD COLUMN `fiscalDocumentInstallment` INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX `finance_entries_fiscalDocumentId_fiscalDocumentInstallment_key` ON `finance_entries`(`fiscalDocumentId`, `fiscalDocumentInstallment`);

-- DropIndex
DROP INDEX `finance_entries_fiscalDocumentId_key` ON `finance_entries`;

-- Backfill: as outras parcelas da série da nota, pela 1ª (a que tem o vínculo).
UPDATE `finance_entries` AS p
  INNER JOIN `finance_entries` AS primeira
    ON primeira.`recurrenceId` = p.`recurrenceId`
   AND primeira.`tenantId` = p.`tenantId`
   AND primeira.`companyId` = p.`companyId`
   AND primeira.`fiscalDocumentId` IS NOT NULL
   AND primeira.`recurrenceIndex` = 1
SET p.`fiscalDocumentId` = primeira.`fiscalDocumentId`,
    p.`fiscalDocumentInstallment` = p.`recurrenceIndex`
WHERE p.`fiscalDocumentId` IS NULL
  AND p.`recurrenceId` IS NOT NULL
  AND p.`recurrenceIndex` > 1;

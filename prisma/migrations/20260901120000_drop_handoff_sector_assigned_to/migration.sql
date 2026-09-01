-- Remove `handoff_sectors.assignedTo`, a coluna de responsável único que a
-- migration 20260730120000 substituiu por `handoff_sector_assignees`.
--
-- Ela ficou de pé porque o app ainda a lia e escrevia. As leituras saíram nesta
-- mesma leva (o select da relation em transferencias/[id]/page.tsx e o
-- currentAssigneeId do AssigneeSelect, que agora usa `assignees[0]`) e as duas
-- escritas em transferencias/actions.ts também.

-- Backfill defensivo, repetido de 20260730120000. Já rodou uma vez e é
-- idempotente (INSERT IGNORE + PK composta), mas roda de novo de propósito: se
-- alguma linha ganhou `assignedTo` sem a linha correspondente em assignees
-- entre 30/07 e hoje, o DROP abaixo apagaria o único registro daquele
-- responsável. Custa uma varredura numa tabela pequena; perder responsável de
-- transferência não custa pouco.
INSERT IGNORE INTO `handoff_sector_assignees` (`handoffSectorId`, `userId`)
SELECT `id`, `assignedTo`
FROM `handoff_sectors`
WHERE `assignedTo` IS NOT NULL;

-- DropForeignKey
ALTER TABLE `handoff_sectors` DROP FOREIGN KEY `handoff_sectors_assignedTo_fkey`;

-- AlterTable
ALTER TABLE `handoff_sectors` DROP COLUMN `assignedTo`;

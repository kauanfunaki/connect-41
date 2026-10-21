-- O departamento do título no Omie, quando ele tem um só (20/10): o centro
-- de custo da conta vem dele e trava na edição até a virada. Aditiva.

-- AlterTable
ALTER TABLE `finance_entries` ADD COLUMN `omieDepartmentId` VARCHAR(40) NULL;

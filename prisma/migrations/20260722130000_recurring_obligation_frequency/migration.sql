-- AlterTable
ALTER TABLE `recurring_obligations`
  ADD COLUMN `frequency` ENUM('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY') NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN `dayOfWeek` INT NULL,
  MODIFY COLUMN `dayOfMonth` INT NULL;

-- A Ceci no portal do cliente, ligada por empresa (21/10/2026): desligada em
-- todas, o escritório liga no piloto. Ver src/lib/portal/ceci.ts.
ALTER TABLE `companies` ADD COLUMN `ceciNoPortal` BOOLEAN NOT NULL DEFAULT false;

-- O modelo do DRE de cada empresa (21/10/2026): vazio é o padrão; "por_area"
-- é o customizado de despesas por área (o padrão até 20/10/2026). Ver
-- src/lib/dre/estrutura.ts.
ALTER TABLE `companies` ADD COLUMN `dreModelo` VARCHAR(30) NULL;

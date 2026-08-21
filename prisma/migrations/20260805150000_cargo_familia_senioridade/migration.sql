-- AlterTable: família (texto livre) e senioridade do cargo. Ambos nullable —
-- cargos já cadastrados continuam válidos e aparecem como "sem família"/"sem
-- nível" na matriz até serem classificados.
ALTER TABLE `cargos` ADD COLUMN `family` VARCHAR(80) NULL;
ALTER TABLE `cargos` ADD COLUMN `seniority` ENUM('ESTAGIO', 'APRENDIZ', 'JUNIOR', 'PLENO', 'SENIOR', 'ESPECIALISTA', 'COORDENACAO', 'GERENCIA', 'DIRETORIA') NULL;

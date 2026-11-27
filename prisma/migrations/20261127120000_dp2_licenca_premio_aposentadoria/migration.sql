-- Licença-prêmio e aposentadoria no DP 2 (funcionalidade-763)
ALTER TABLE `dp2_ocorrencias` MODIFY `tipo` VARCHAR(20) NOT NULL,
    ADD COLUMN `detalhe` VARCHAR(20) NULL,
    ADD COLUMN `beneficio` VARCHAR(10) NULL;

ALTER TABLE `dp2_convencoes` ADD COLUMN `licencaPremioAnos` INTEGER NULL,
    ADD COLUMN `licencaPremioDias` INTEGER NULL;

ALTER TABLE `dp2_vinculos` ADD COLUMN `grauExposicao` VARCHAR(1) NULL;

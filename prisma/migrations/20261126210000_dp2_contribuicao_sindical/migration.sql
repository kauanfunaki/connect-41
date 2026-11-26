-- Contribuição sindical do empregado no DP 2 (funcionalidade-774)
ALTER TABLE `dp2_convencoes` ADD COLUMN `contribuicaoMes` INTEGER NULL,
    ADD COLUMN `contribuicaoPercentual` DECIMAL(6, 2) NULL;

ALTER TABLE `dp2_vinculos` ADD COLUMN `contribuicaoSindical` BOOLEAN NOT NULL DEFAULT false;

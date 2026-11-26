-- Centro de custo e departamento no contrato do DP 2 (funcionalidade-751)
ALTER TABLE `dp2_vinculos` ADD COLUMN `costCenterId` VARCHAR(191) NULL,
    ADD COLUMN `departamento` VARCHAR(80) NULL;

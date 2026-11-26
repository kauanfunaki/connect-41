-- Adiantamento salarial (vale) na configuração da empresa no DP 2 (funcionalidade-758)
ALTER TABLE `dp2_empresas_config` ADD COLUMN `adiantamentoPercentual` DECIMAL(5, 2) NULL,
    ADD COLUMN `adiantamentoDia` INTEGER NULL;

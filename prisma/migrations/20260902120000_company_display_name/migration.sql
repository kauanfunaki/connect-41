-- Nome de exibição da empresa.
--
-- Razão social não distingue estabelecimento: matriz e filial da BLD têm a
-- mesma, e a listagem ficava com duas linhas idênticas. Este campo guarda o
-- nome curto que o time usa — "BLD MOGI - SP", "BLD MAFRA - SC".
--
-- Nulável de propósito, com fallback para a razão social na aplicação: forçar
-- NOT NULL obrigaria a inventar um valor para as 11 empresas já cadastradas, e
-- razão social é exatamente o valor certo para quem não tem apelido.
ALTER TABLE `companies` ADD COLUMN `displayName` VARCHAR(180) NULL;

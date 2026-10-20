-- A virada da empresa do Omie para o Connect (lote E, 20/10): até ela, a conta
-- que veio do Omie é do Omie — o Connect não a edita, não a baixa nem a
-- cancela, porque a leitura seguinte desfaria. Na virada, a última leitura
-- roda, a do financeiro desliga, e daí em diante o Connect é a fonte.
-- Só aditiva: as empresas que já existem continuam lidas do Omie.
ALTER TABLE `companies` ADD COLUMN `omieCutoverAt` DATETIME(3) NULL;

-- Estado da verificação automática de protocolo.
--
-- Aditiva, duas colunas nuláveis no `process_protocols`.
--
-- `lastCheckedAt` nulo significa "nenhum robô olhou ainda", que é diferente de
-- "olhou e o órgão não mudou nada" — sem a coluna os dois casos ficam iguais na
-- tela, e o setor não sabe se pode confiar no automático.
--
-- `checkError` é limpo em TODA verificação bem-sucedida, inclusive quando o
-- desfecho continua pendente. A lição é de 10/09: o `lastError` do SPED só era
-- zerado num caminho específico, e 25 raízes saudáveis ficaram exibindo um 403
-- que não existia mais. Estado que mente sobre a última execução é pior que
-- estado ausente — alguém olha, vê erro, e desliga uma automação que funciona.
ALTER TABLE `process_protocols` ADD COLUMN `checkError` VARCHAR(500) NULL,
    ADD COLUMN `lastCheckedAt` DATETIME(3) NULL;

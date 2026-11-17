-- DP 2: média por tipo nas rubricas (17/11/2026, melhoria-742).
-- A marcação única "entra na média" vira três: férias, 13º e rescisão. Quem já
-- entrava na média passa a entrar nas três. `entraNaMedia` fica, sincronizada
-- (qualquer uma das três), até a próxima limpeza, para o deploy não quebrar.
ALTER TABLE `dp2_rubricas`
    ADD COLUMN `mediaFerias` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `mediaDecimo` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `mediaRescisao` BOOLEAN NOT NULL DEFAULT false;

UPDATE `dp2_rubricas` SET `mediaFerias` = `entraNaMedia`, `mediaDecimo` = `entraNaMedia`, `mediaRescisao` = `entraNaMedia`;

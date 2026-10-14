-- Planos no site do Connect (14/10/2026): Administração › Planos › Editar.
-- Só cria duas tabelas novas; nenhuma tabela existente muda.
--   `planos_no_site`: como cada plano aparece na seção "Planos" do site
--     (mostrar ou não, ordem, destaque, "para quem é" e até três destaques).
--     Sem chave estrangeira, de propósito (ver o model `PlanoNoSite`).
--   `configuracoes_do_connect`: ajustes que valem para todos, por chave. A
--     primeira é `site.mostrarPrecos` — sem linha, os preços ficam escondidos.
-- Sem linha, nada aparece no site: logo depois da migration, nada muda para ninguém.
-- Rodar ANTES do deploy (`npx prisma migrate deploy`). Se o código subir antes,
-- nada quebra: sem as tabelas, o site esconde a seção Planos, e a tela de Planos
-- avisa que falta a atualização do banco e não mostra os campos do site.

-- CreateTable
CREATE TABLE `planos_no_site` (
    `planId` VARCHAR(191) NOT NULL,
    `mostrarNoSite` BOOLEAN NOT NULL DEFAULT false,
    `ordem` INTEGER NOT NULL DEFAULT 0,
    `destacar` BOOLEAN NOT NULL DEFAULT false,
    `paraQuem` VARCHAR(240) NULL,
    `destaques` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`planId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracoes_do_connect` (
    `chave` VARCHAR(60) NOT NULL,
    `valor` VARCHAR(255) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`chave`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

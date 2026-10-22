# Controle interno do Tech

Organiza bugs, melhorias, novas funcionalidades, testes e migrações da própria equipe. A tela fica em **Tech → Controle interno**, em `/tech/controle-interno`.

## Ativação e atualização

1. No ambiente autorizado, faça o backup habitual e aplique as migrations pendentes pelo procedimento de publicação do projeto (`npx prisma migrate deploy`). A migration `20261021160000_tech_internal` somente cria quatro tabelas, índices e vínculos; não altera registros existentes. Não use `reset` ou `db push`.
2. Publique o build do Connect com o Prisma Client regenerado (`npm run build` já executa a geração).
3. Em **Configurações → Módulos**, habilite **Controle interno** no Tech. O módulo nasce desligado e depende da liberação no plano. Seu setor é fixo.

Desligar o módulo bloqueia as telas e operações, preservando os registros. Para voltar à aplicação anterior, preserve as tabelas adicionadas. Nenhuma migration é executada automaticamente pela tela.

## Uso

- Em **Novo item**, informe título e tipo. A prioridade começa Média e a situação Pendente. A descrição é opcional.
- Tipos: Bug, Melhoria, Nova funcionalidade, Teste e Migração. Teste e Migração são classificações, sem executar operações externas.
- Sistema pode ser **Sem sistema**, **Novo sistema** ou um nome do cadastro. Novo sistema é apenas uma indicação; explique o que pretende criar no título e na descrição.
- Responsável e prazo são opcionais. Escolha uma pessoa ativa do Tech ou um administrador. O prazo é uma data de calendário, sem horário.
- Situações: Pendente, Em andamento, Em validação, Concluído e Cancelado. A equipe pode mudar a situação, inclusive reabrir um item. Em validação não exige uma aprovação adicional.
- A lista começa pelos itens em aberto, ordenados por prioridade, prazo (sem prazo por último) e atualização recente. São 50 itens por página.
- Use a busca por título/descrição e os filtros de situação, tipo, prioridade, sistema, responsável e prazo. Há atalhos **Comigo**, **Sem responsável** e **Atrasados**. Atrasados considera itens em aberto com prazo anterior ao dia atual de São Paulo.
- Abra um item para editar, comentar e consultar o histórico. Cada alteração mostra autor, data e valores anteriores e novos. Comentários e histórico são preservados; não há exclusão de itens nesta versão.

## Acesso e sistemas

Equipe Tech e administradores criam, editam e comentam. O perfil global Somente leitura consulta, como nos demais módulos. Assinatura em somente leitura bloqueia todas as gravações. Estar com o setor Tech selecionado no cabeçalho não concede permissão.

Gestores do Tech e administradores acessam **Sistemas**, onde cadastram, renomeiam ou desativam ferramentas. O nome é único por escritório. Desativar impede novas seleções; os vínculos anteriores continuam visíveis e podem ser preservados ao editar o item. Sistemas desativados também continuam disponíveis nos filtros.

Duas pessoas não sobrescrevem a mesma versão: a segunda gravação é recusada. Copie o que deseja reaproveitar, atualize a página e confira a alteração antes de salvar de novo. Comentários simultâneos são independentes. Se houver falha de conexão, atualize para conferir o que foi confirmado antes de tentar novamente.

Dados e vínculos são separados por escritório. Chamados, Ops Center, quadros e GitHub não são alterados por este módulo. Não há anexos, SLA, notificações automáticas ou sincronização externa nesta versão.

## Validação local

`npm run test:tech-interno` verifica as regras; os testes de banco ficam pulados sem configuração explícita.

Para integração e navegador, use um MySQL descartável exclusivo, sem volumes de produção. Se a porta 33379 já estiver ocupada, confira o responsável; não encerre nem reutilize um banco desconhecido.

```powershell
docker run --rm --detach --name connect41-tech-interno-test --publish 127.0.0.1:33379:3306 --env MYSQL_ROOT_PASSWORD=tech-interno-fixture --env MYSQL_DATABASE=connect41 mysql:8.0 --skip-log-bin
$env:TECH_INTERNAL_TEST_DATABASE_URL = 'mysql://root:tech-interno-fixture@127.0.0.1:33379/connect41'
npm run test:tech-interno:db
npm run build:tech-interno:verification
npm run test:tech-interno:ui
docker stop connect41-tech-interno-test
```

O teste de banco recusa qualquer endereço fora de localhost:33379/connect41. Em um banco vazio, prepara o schema anterior sem as tabelas Tech, cria um escritório fictício, aplica a migration entregue e confere preservação do registro e equivalência com o schema. Os testes usam dois escritórios fictícios e removem somente seus próprios dados.

O build de verificação usa uma cópia em `.local/tech-interno/`, sem `.env`, storage ou credenciais reais e sem disputar `.next` com servidores abertos. O teste de navegador usa esse standalone na porta 33382, sessões fictícias e Chromium/Edge headless. Logs e capturas ficam nessa mesma pasta ignorada pelo Git. O teste encerra somente o servidor que criou.

Complete as verificações com `npm test`, `npm run lint`, `npx tsc --noEmit` e build. Falhas anteriores ou de outras alterações locais devem ser identificadas separadamente. A validação local não representa homologação em produção.

Resultado da implementação e limitações verificadas: [validação de 21/10/2026](TECH-CONTROLE-INTERNO-VALIDACAO.md).

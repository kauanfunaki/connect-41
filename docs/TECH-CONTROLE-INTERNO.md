# Controle interno do Tech

Módulo `tech_controle_interno`, em `/tech/controle-interno`, exclusivo do Tech e administradores. Ative em **Configurações → Setores e módulos → Tech → Controle interno**. Continua independente de Chamados e Ops Center; nasce desligado.

Os mesmos itens aparecem em **Lista**, **Kanban** e **Agenda**. Os filtros e a visualização ficam no endereço. A agenda usa o prazo, permite navegar entre meses e separa os itens sem prazo. No Kanban, arraste o cartão ou use o seletor de situação. Mudanças são confirmadas no servidor e registram autor, data e valores anteriores. Edições concorrentes pedem atualização da página.

Tipos: Bug, Melhoria, Nova funcionalidade, Teste e Migração. Responsável e prazo são opcionais. O vínculo pode ser Sem sistema, Novo sistema ou um sistema cadastrado. Sistemas inativos permanecem no histórico e não podem receber novos vínculos. Gestores mantêm o cadastro de sistemas. Usuários Somente leitura podem consultar, sem gravar.

A lista pagina 50 itens. Kanban e agenda paginam 500 itens, com navegação explícita quando o recorte ultrapassa esse volume. A contagem por coluna corresponde à página exibida. A agenda considera o mês escolhido mais os itens sem prazo, respeitando os filtros.

## Implantação

Aplicar `20261021160000_tech_internal` em ambiente autorizado antes de publicar. A migration apenas cria quatro tabelas e suas relações; não remove dados. Ativar o módulo no escritório após publicar. Planos que usam uma lista restrita de módulos também precisam permitir `tech_controle_interno`.

## Verificação local

`node node_modules/vitest/vitest.mjs run src/lib/tech-interno`

Para verificar banco, defina `OPS_TEST_DATABASE_URL` para MySQL descartável **localhost:33379/connect41**, então execute `node scripts/test-tech-ops-db.mjs`. Esse comando prepara apenas uma base vazia ou aplica as duas migrations desta entrega quando suas tabelas ainda não existem. Nunca use uma base de demonstração que queira preservar como banco descartável.

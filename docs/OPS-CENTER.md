# Ops Center — Tech

Módulo `tech_ops_center`, rota `/ops`, grupo Operação do Tech. Reproduz o painel do 41 Hub com os componentes e permissões do Connect: automações, heartbeat, resultados do dia, histórico paginado, filtros, cópia de caminhos e sinalização de instabilidade. Os dados são próprios do escritório no Connect; não são importados do Hub automaticamente.

## Ativação

1. Aplicar as migrations `20261020120000_ops_center` e `20261020230000_ops_shared_credential` no ambiente escolhido pelo responsável pelo deploy. A segunda cria uma tabela nova; não altera nem remove dados existentes. Esta implementação não aplica migrations no banco de uso do Connect.
2. Em Administração → Setores → Tech, habilitar Ops Center para o escritório. O plano também precisa permitir o módulo caso tenha uma lista restrita.
3. Abrir Ops Center, cadastrar cada automação e escolher seu dono. Gestores do setor e administradores podem configurar; usuários do setor e perfis de leitura podem consultar. O setor efetivo do módulo é respeitado se houver transferência.
4. Em Administração → Integrações → Ops Center — bots, gerar a chave única do escritório e copiá-la para a configuração protegida das automações autorizadas. Ela aparece uma vez; o banco guarda apenas seu hash. Todos os bots usam a mesma chave e informam o próprio slug. Trocar a chave revoga a anterior para todos os bots; desativar uma automação preserva seu histórico e impede novos sinais e eventos.

As chaves individuais emitidas antes desta mudança continuam válidas durante a transição para não interromper bots já configurados. Depois de trocar cada bot para a chave compartilhada, desative e reative a automação correspondente para revogar sua chave antiga.

O dono é um usuário ativo do mesmo escritório com acesso ao setor do módulo. Sem dono, a automação permanece visível em Todas, mas erros não têm destinatário. O filtro Minhas automações usa a identidade da sessão e filtra cartões, totais do dia e histórico. A atribuição atual determina esse recorte, inclusive para eventos anteriores à troca de dono.

## Recebimento pelos bots

Usar HTTPS e `Authorization: Bearer <chave>`. A chave só aceita dados da automação à qual pertence. Os endpoints de consulta e configuração exigem a sessão da equipe. O corpo JSON tem limite de 32 KiB.

Atividade: `POST /api/ops/watchers/<slug>/heartbeat`, sem corpo, a cada 30 segundos. Sem sinal durante três minutos a tela mostra Sem comunicação; antes do primeiro sinal, Sem sinal de atividade. O painel não inicia nem encerra processos e não lê pastas da rede.

Arquivos da pasta de rede (21/10/2026): `POST /api/ops/watchers/<slug>/arquivos`, multipart, até 10 MB por arquivo. O robô `scripts/pasta-de-rede.mjs` usa esse endpoint para guardar nos Arquivos o que acha na pasta de rede das empresas do piloto, e o Connect registra cada entrada ou recusa como evento da automação. O roteiro está em `docs/PASTA-DE-REDE.md`.

Resultado: `POST /api/ops/events`, com:

```json
{
  "watcherSlug": "dominio_xls_to_txt",
  "eventId": "lote-ficticio-arquivo-001-tentativa-1",
  "filename": "exemplo.xlsx",
  "filenameRenamed": "exemplo.txt",
  "status": "SUCCESS",
  "client": "Empresa fictícia",
  "errorMessage": null,
  "processedAt": "2026-10-20T10:00:00-03:00"
}
```

Resultados: `SUCCESS`, `ERROR`, `WARNING`. `processedAt` é opcional e aceita ISO com fuso; sem ele vale o recebimento. `n8nExecutionId` é opcional. Não enviar segredos ou conteúdo dos documentos em mensagens de erro.

O produtor deve persistir `eventId` por tentativa. Retransmitir exatamente o mesmo evento devolve o ID existente e `duplicate: true`, sem duplicar evento ou aviso. O mesmo identificador com outro conteúdo devolve 409. Uma nova tentativa de processamento usa outro identificador. Após timeout, o produtor repete o mesmo payload com espera progressiva e limite de tentativas; deve manter sua fila local até confirmação. Bots antigos precisam acrescentar `eventId` e trocar o destino e a chave explicitamente.

## Monitor local de heartbeat

O repositório inclui `scripts/ops-heartbeat.mjs`, independente do processamento do bot. Ele não lê `ENTRADA`, `SAIDA`, `DOCS` ou qualquer pasta de rede e não envia eventos. A cada 30 segundos faz somente `POST` sem corpo para o heartbeat da automação, com timeout e até três tentativas progressivas.

1. Copie o slug da automação no Ops Center e a chave compartilhada em Administração → Integrações → Ops Center — bots.
2. Crie a configuração local sem versioná-la: `npm run ops:heartbeat -- --config=.local/ops-heartbeat.json`.
3. Preencha `baseUrl`, `slug` e `token` nesse arquivo local. O token não deve ir para código, frontend ou log.
4. Teste uma vez com `npm run ops:heartbeat -- --once --config=.local/ops-heartbeat.json`.
5. Consulte o estado com `--status` e acompanhe com `--watch` ou `--start`.
6. Solicite parada com `--stop`; o processo encerra no próximo intervalo, removendo o lock local.

O estado e o lock ficam em `.local/ops-heartbeat-state.json` e não substituem a confirmação do servidor: sucesso só é registrado após HTTP 200. A configuração e o estado devem permanecer fora de commits e sem tokens em mensagens de erro.

## Agentes do motor SPED (22/10/2026)

Os dois agentes do motor SPED (`agente.py`, um na VPS e um no Windows do escritório) entram no Ops Center como automações comuns, pela chave compartilhada — sem código novo no Connect. O contrato do lado do motor é `docs/API-CONNECT.md` §7.2, no repositório do motor.

1. Em Ops Center, cadastrar duas automações, uma por máquina, com os slugs `sped-agente-vps` e `sped-agente-escritorio` (o slug é livre, mas precisa ser exatamente o mesmo `OPS_SLUG` da máquina). Escolher o dono de cada uma: é quem recebe o aviso de erro de geração.
2. Em Administração → Integrações → Ops Center — bots, usar a chave compartilhada já existente (ou gerar uma, se ainda não houver; gerar de novo revoga a anterior para todos os bots).
3. No ambiente de cada agente, definir as três variáveis, fora do repositório:
   - `OPS_URL` = endereço público do Connect, sem barra no fim (o mesmo `APP_PUBLIC_URL`);
   - `OPS_TOKEN` = a chave compartilhada;
   - `OPS_SLUG` = `sped-agente-vps` na VPS e `sped-agente-escritorio` no Windows.
   Sem as três, o agente não envia nada e continua processando a fila normalmente.
4. Reiniciar o agente. O heartbeat sai a cada 30 segundos, inclusive durante uma geração longa; cada pedido finalizado vira um evento (`SUCCESS` com código de saída 0, `ERROR` nos outros casos), com `eventId` `sped-fila-<id>-<uuid>`, o rótulo do estabelecimento em `client` e a mensagem da fila (nunca o log) em `errorMessage`.
5. Conferir no `/ops`: a automação sai de "Sem sinal de atividade" no primeiro heartbeat; um pedido concluído e um com erro aparecem no histórico, e o erro avisa o dono.

O Ops Center só observa: pausar, reiniciar ou destravar a fila continua nas telas fiscais (Executar › Histórico › Destravar) ou no painel do motor. A saúde vista pelo próprio motor (`GET /saude`, tabela `agentes_batimento`) aparece no Painel fiscal, e as duas fontes podem divergir por alguns segundos.

## Responsáveis, erros e chamados

Cada evento `ERROR` gera um aviso para o dono atual no sino/central do Connect, com link para os erros da automação. Evento e aviso são salvos na mesma transação. Sucessos, avisos e retransmissões não geram alertas de erro. Push segue a configuração e as preferências do Connect e é uma entrega complementar, de melhor esforço; uma falha no push não perde o aviso do sino. Não há envio de e-mail nesta implementação.

É possível sinalizar uma instabilidade, abrir um chamado pelo fluxo existente e vincular seu ID, desde que o chamado esteja visível para quem faz o vínculo. Resolver a sinalização preserva o histórico de processamento. O módulo não cria nem transmite chamados automaticamente.

Resumo e contadores usam o dia em São Paulo. Os filtros de automação, resultado e data recortam o histórico. A tela atualiza a cada 30 segundos quando visível, permite atualização manual e informa falhas sem apresentar os dados anteriores como atuais. Desativação de usuário interrompe novos avisos; exclusão do usuário deixa a automação sem responsável.

## Verificação local

`npm run test:ops`, `npm run lint`, `npx tsc --noEmit` e `npm run build`.

`npm run test:ops:db` exige `OPS_TEST_DATABASE_URL` apontando explicitamente para MySQL descartável em `127.0.0.1:33379/connect41`. Não lê credenciais de `.env`. Em banco vazio, prepara o schema base e aplica a migration entregue, confere ausência de diferenças e testa isolamento entre escritórios, permissões, propriedade, filtro Minhas, notificações, concorrência, chaves, heartbeat e idempotência. Push é simulado. Nenhum bot real, pasta de rede ou obrigação é usado nos testes.

Para verificar a interface sem substituir `.next` dos servidores abertos, `node scripts/build-ops-verification.mjs` compila uma cópia em `.local/ops`, sem `.env`. Depois, `npm run test:ops:ui` usa essa cópia e o mesmo banco descartável explícito, cria apenas dados fictícios e salva capturas e resultados em `.local/ops`. O script encerra somente o servidor que iniciou na porta 33381.

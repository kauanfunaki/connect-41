# Ops Center — Tech

Módulo `tech_ops_center`, rota `/ops`, grupo Operação do Tech. Reproduz o painel do 41 Hub com os componentes e permissões do Connect: automações, heartbeat, resultados do dia, histórico paginado, filtros, cópia de caminhos e sinalização de instabilidade. Os dados são próprios do escritório no Connect; não são importados do Hub automaticamente.

## Ativação

1. Aplicar a migration `20261020120000_ops_center` no ambiente escolhido pelo responsável pelo deploy. Esta implementação não aplica migrations no banco de uso do Connect.
2. Em Administração → Setores → Tech, habilitar Ops Center para o escritório. O plano também precisa permitir o módulo caso tenha uma lista restrita.
3. Abrir Ops Center, cadastrar cada automação e escolher seu dono. Gestores do setor e administradores podem configurar; usuários do setor e perfis de leitura podem consultar. O setor efetivo do módulo é respeitado se houver transferência.
4. Na ação Integração, gerar a chave e armazená-la na configuração protegida do bot. Ela aparece uma vez; o banco guarda apenas seu hash. Gerar outra revoga a anterior. Desativar o recebimento também revoga a chave e preserva o histórico.

O dono é um usuário ativo do mesmo escritório com acesso ao setor do módulo. Sem dono, a automação permanece visível em Todas, mas erros não têm destinatário. O filtro Minhas automações usa a identidade da sessão e filtra cartões, totais do dia e histórico. A atribuição atual determina esse recorte, inclusive para eventos anteriores à troca de dono.

## Recebimento pelos bots

Usar HTTPS e `Authorization: Bearer <chave>`. A chave só aceita dados da automação à qual pertence. Os endpoints de consulta e configuração exigem a sessão da equipe. O corpo JSON tem limite de 32 KiB.

Atividade: `POST /api/ops/watchers/<slug>/heartbeat`, sem corpo, a cada 30 segundos. Sem sinal durante três minutos a tela mostra Sem comunicação; antes do primeiro sinal, Sem sinal de atividade. O painel não inicia nem encerra processos e não lê pastas da rede.

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

1. Na tela Integração, copie o slug cadastrado e gere a chave.
2. Crie a configuração local sem versioná-la: `npm run ops:heartbeat -- --config=.local/ops-heartbeat.json`.
3. Preencha `baseUrl`, `slug` e `token` nesse arquivo local. O token não deve ir para código, frontend ou log.
4. Teste uma vez com `npm run ops:heartbeat -- --once --config=.local/ops-heartbeat.json`.
5. Consulte o estado com `--status` e acompanhe com `--watch` ou `--start`.
6. Solicite parada com `--stop`; o processo encerra no próximo intervalo, removendo o lock local.

O estado e o lock ficam em `.local/ops-heartbeat-state.json` e não substituem a confirmação do servidor: sucesso só é registrado após HTTP 200. A configuração e o estado devem permanecer fora de commits e sem tokens em mensagens de erro.

## Responsáveis, erros e chamados

Cada evento `ERROR` gera um aviso para o dono atual no sino/central do Connect, com link para os erros da automação. Evento e aviso são salvos na mesma transação. Sucessos, avisos e retransmissões não geram alertas de erro. Push segue a configuração e as preferências do Connect e é uma entrega complementar, de melhor esforço; uma falha no push não perde o aviso do sino. Não há envio de e-mail nesta implementação.

É possível sinalizar uma instabilidade, abrir um chamado pelo fluxo existente e vincular seu ID, desde que o chamado esteja visível para quem faz o vínculo. Resolver a sinalização preserva o histórico de processamento. O módulo não cria nem transmite chamados automaticamente.

Resumo e contadores usam o dia em São Paulo. Os filtros de automação, resultado e data recortam o histórico. A tela atualiza a cada 30 segundos quando visível, permite atualização manual e informa falhas sem apresentar os dados anteriores como atuais. Desativação de usuário interrompe novos avisos; exclusão do usuário deixa a automação sem responsável.

## Verificação local

`npm run test:ops`, `npm run lint`, `npx tsc --noEmit` e `npm run build`.

`npm run test:ops:db` exige `OPS_TEST_DATABASE_URL` apontando explicitamente para MySQL descartável em `127.0.0.1:33379/connect41`. Não lê credenciais de `.env`. Em banco vazio, prepara o schema base e aplica a migration entregue, confere ausência de diferenças e testa isolamento entre escritórios, permissões, propriedade, filtro Minhas, notificações, concorrência, chaves, heartbeat e idempotência. Push é simulado. Nenhum bot real, pasta de rede ou obrigação é usado nos testes.

Para verificar a interface sem substituir `.next` dos servidores abertos, `node scripts/build-ops-verification.mjs` compila uma cópia em `.local/ops`, sem `.env`. Depois, `npm run test:ops:ui` usa essa cópia e o mesmo banco descartável explícito, cria apenas dados fictícios e salva capturas e resultados em `.local/ops`. O script encerra somente o servidor que iniciou na porta 33381.

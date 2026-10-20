# Chamados internos

O módulo `helpdesk` porta o atendimento do Hub para o Connect: categorias e formulários, anexos, checklist, responsáveis, participantes, fila, aprovações, reabertura, SLA e indicadores. Os dados pertencem a um escritório. Clientes do portal não acessam este módulo.

## Publicação e ativação

1. Na publicação autorizada, aplique as migrations com `npx prisma migrate deploy` no ambiente de destino. A migration `20261019210000_helpdesk` cria somente tabelas novas e suas chaves; não importa dados do Hub.
2. Publique o build normal do Connect, mantendo o volume persistente `storage/`.
3. Em **Configurações → Módulos**, encontre **Chamados**. Escolha um setor ativo que será responsável pelo atendimento e habilite o módulo. Ele nasce desligado e continua sujeito aos módulos liberados pelo plano contratado.
4. No mesmo cartão, abra **Configurar setores solicitantes**. Marque os setores que podem abrir chamados. A seleção começa vazia; administradores continuam podendo abrir.
5. Em **Chamados → Configurar**, cadastre categorias, campos, evidências e checklist. Categorias sujeitas a aprovação precisam de outro aprovador ativo além de quem solicita.

Chamados começa desativado no controle de módulos. Ao ativá-lo, o atalho aparece para quem tem acesso, sem uma ocultação adicional por padrão no menu Geral. Personalizações de visibilidade feitas explicitamente pelo administrador continuam sendo respeitadas.

O setor responsável vem exclusivamente de `TenantModule.sectorCode`, resolvido por `setorDoModulo`. Transferir o módulo transfere o acesso de atendimento da fila inteira. Atribuições antigas são preservadas e sinalizadas para redistribuição; não concedem acesso à equipe anterior.

Para desativar, desligue o módulo em Módulos. Telas, ações e downloads ficam indisponíveis; chamados, anexos e rascunhos permanecem guardados. Reverter a versão da aplicação não exige apagar as tabelas adicionadas. Não remova a migration nem limpe históricos para fazer rollback.

## Quem vê e quem escreve

- Usuários de setores liberados abrem chamados, mesmo sem papel de gestor. O setor ativo no cabeçalho é um filtro de navegação, não uma concessão de acesso.
- Solicitantes veem o que abriram e aquilo em que foram incluídos como participantes. Gestores também veem os chamados originados nos seus setores.
- A equipe do setor responsável atende a fila inteira, assume chamados, muda situações e registra mensagens e notas internas.
- O gestor responsável também distribui responsáveis, inclui participantes, reordena a fila, ajusta prazos com justificativa e configura categorias e políticas de SLA.
- Administradores têm acesso amplo. Somente leitura consulta, mas não modifica. Assinatura em somente leitura bloqueia gravações e análise por IA.
- Aprovadores selecionados consultam o chamado que precisam decidir. O solicitante não aprova a própria abertura.
- Notas, checklist e anexos internos só são entregues aos perfis com consulta interna. O download repete a autorização no servidor.

Remover um setor solicitante impede novas aberturas, preservando o acompanhamento dos chamados anteriores. A inclusão como responsável não substitui o vínculo com o setor atendente.

## Abertura e revisão por IA

Preencha a categoria, o setor de origem, o título, a descrição e os campos exigidos. Envie evidências usando o tipo indicado pela categoria. **Salvar rascunho** permite retomar pela lista. Ao enviar, o formulário válido é salvo antes de consultar a IA.

O rascunho não entra na fila, não inicia SLA e não gera pedido de aprovação nem notificações de atendimento. A conversa e o parecer ficam persistidos e são consultáveis no chamado após a abertura.

A IA verifica informação suficiente para **iniciar** o atendimento. Considera campos, descrição, evidências legíveis e respostas anteriores; não julga gramática nem exige diagnóstico técnico. Se faltar contexto, o chat apresenta perguntas. Cada resposta faz uma avaliação; não existe laço automático de chamadas. Perguntas idênticas já apresentadas são descartadas; se nenhuma pergunta nova restar, a análise fica indisponível e mantém o envio opcional. Com contexto suficiente, a abertura é concluída automaticamente.

**Enviar mesmo assim** dispensa a aprovação da IA. Se a análise estiver indisponível, use **Tentar análise novamente** ou **Enviar sem análise**. Essas opções não dispensam campos ou anexos obrigatórios nem aprovações de negócio.

Alterações nos dados ou anexos invalidam o parecer anterior. Escritas usam versões; duas abas não sobrescrevem silenciosamente o mesmo rascunho/chamado. A finalização é transacional e única por rascunho. Uma resposta atrasada da IA não envia uma versão que foi alterada. Se a conexão cair durante uma operação, recarregue para reconciliar o estado salvo antes de tentar novamente.

### Configuração da IA

1. Em **Integrações → Inteligência artificial**, use a chave **OpenAI do próprio escritório**. Ela permanece criptografada no servidor; não existe chave nova no frontend ou fallback global neste módulo.
2. Na administração de agentes, habilite **Triagem de chamados** (`triagem_chamados`). O agente nasce desligado, usa a faixa `rapido` do catálogo e aceita os overrides de modelo existentes.
3. Revise os tetos: padrão de **R$ 100 e 2.000 chamadas mensais**. A fundação existente controla consumo e auditoria das execuções.

Configuração Anthropic, chave ausente/ilegível, agente desligado ou teto atingido tornam a revisão indisponível; a abertura continua com a opção de envio sem análise. Não é feita troca automática do provedor dos outros agentes.

A chamada usa Responses API com JSON Schema estrito, validação Zod, `store: false`, timeout de 30 segundos e no máximo dez avaliações por usuário/escritório por minuto. Não há repetição automática de chamadas pagas. `store: false` não substitui a política de retenção da conta da API. O limite por minuto acompanha a implantação atual em uma instância; precisa de armazenamento compartilhado se o Connect passar a usar várias réplicas.

Prompts, documentos e corpos de erro do provedor não são gravados nos logs da triagem. O histórico é dado funcional, protegido pelo acesso ao chamado. Conteúdo fornecido pelo usuário é tratado como dado não confiável, sem ferramentas, comandos ou navegação por links.

## Arquivos

Upload autenticado de um arquivo por requisição, até 10 MB. Na abertura, até vinte anexos. Formatos: PDF, PNG/JPG, DOCX, XLSX, TXT, CSV, ZIP, MP4 e WEBM. Tipos são conferidos no servidor. Os arquivos ficam em `storage/helpdesk/<tenantId>/`, fora de `public/`, com nomes internos aleatórios.

A análise considera até cinco arquivos, 10 MB por arquivo e 20 MB no total, priorizando as evidências obrigatórias. ZIP e vídeos são guardados para atendimento, mas não interpretados pela IA. Arquivos ilegíveis ou ignorados aparecem na cobertura do parecer. DOCX tem cobertura de texto; XLSX/CSV têm cobertura parcial de até mil linhas por aba, sem gráficos embutidos. Não presuma que um anexo ignorado foi validado.

Falha na transação de upload desfaz o arquivo recém-gravado. Não existe rotina de limpeza automática de rascunhos ou histórico. Mantenha backup do banco e do volume de arquivos em conjunto.

## Atendimento e SLA

O fluxo mantém as situações do Hub: Aberto, Na fila, Em andamento, Aguardando usuário, Aguardando aprovação, Aguardando requerente, Em espera, Resolvido e Cancelado. O solicitante responde publicamente nas situações de espera correspondentes; a resposta devolve o atendimento à equipe.

O SLA começa em **Em andamento**. O calendário é o do Hub: segunda a quinta das 08h às 18h e sexta das 08h às 17h, em Brasília, sem expediente nos fins de semana. Não usa o horário visual da Agenda nem depende do fuso do servidor. Os valores iniciais, em minutos úteis, são:

| Prioridade | Primeira resposta | Resolução |
|---|---:|---:|
| Baixa | 1.440 | 10.080 |
| Média | 480 | 4.320 |
| Alta | 240 | 1.440 |
| Urgente | 60 | 480 |

As situações de espera pausam o ciclo. A retomada acrescenta o tempo útil da pausa ao prazo calculado; um prazo ajustado manualmente é preservado. A primeira resposta segue a convenção do Hub de início do atendimento. Alterar uma política vale para ciclos futuros, sem reescrever os anteriores.

O solicitante pede reabertura de um chamado resolvido, e o gestor decide com justificativa. Aceitar retoma Em andamento e cria novo ciclo de SLA. Mudar para categoria que exige aprovação cria um novo pedido e pausa o atendimento; uma aprovação pendente precisa ser decidida antes de trocar a categoria novamente.

Indicadores e filtros respeitam o mesmo acesso da lista. Os tempos médios de encerramento são horas corridas; os prazos de SLA usam minutos úteis. A posição apresentada na lista é relativa ao recorte visível da pessoa.

## Notificações, alertas e diagnóstico

Eventos são persistidos junto com a operação, e as notificações saem após o commit, pelo sino/push existentes. O identificador estável por evento/destinatário evita duplicações. Falha de entrega mantém o evento pendente para retomada pelo motor de alertas. A mensagem de notificação não contém o corpo de uma nota interna, e o autor não recebe o próprio aviso.

O agendador já existente verifica SLA e retoma entregas pendentes apenas com o módulo ativo. Um alerta de vencimento é único por ciclo. Nenhum agendador adicional é instalado.

Problemas comuns:

- **Módulo não aparece:** conferir plano, ativação, setor responsável ativo e seleção dos setores solicitantes. A configuração de visibilidade do menu Geral também pode esconder o atalho sem alterar permissões.
- **Não há categoria:** cadastrar ao menos uma categoria ativa na configuração operacional.
- **Não há aprovador:** cadastrar outra pessoa ativa ou um gestor do setor de origem. O solicitante é excluído da escolha de aprovadores.
- **A versão mudou:** atualizar a página; o sistema preserva a alteração confirmada e recusa sobrescrever a versão anterior.
- **IA indisponível:** conferir provedor OpenAI, chave, agente e tetos. O usuário pode enviar sem análise.
- **Arquivo indisponível:** conferir o volume persistente e restaurar banco/arquivos do mesmo backup, preservando os registros.

## Verificações locais

`npm run test:helpdesk` executa regras e contratos simulados. A suíte de integração fica pulada sem configuração explícita; nunca utiliza `DATABASE_URL` de produção.

Para o banco real descartável, crie um contêiner exclusivo, sem volumes de produção:

```powershell
docker run --rm --detach --name connect41-helpdesk-test --publish 127.0.0.1:33379:3306 --env MYSQL_ROOT_PASSWORD=helpdesk-fixture --env MYSQL_DATABASE=connect41 mysql:8.0 --skip-log-bin
$env:HELPDESK_TEST_DATABASE_URL = 'mysql://root:helpdesk-fixture@127.0.0.1:33379/connect41'
npm run test:helpdesk:db
$env:DATABASE_URL = $env:HELPDESK_TEST_DATABASE_URL
npm run build:local
npm run test:helpdesk:ui
docker stop connect41-helpdesk-test
```

Os scripts recusam qualquer destino fora de localhost:33379/connect41. O primeiro gera o schema somente quando o banco está vazio; não apaga tabelas existentes. O segundo usa sessão e pessoas fictícias, agente sem chave, servidor temporário na porta 33380 e Chromium/Edge headless. Ele encerra apenas o servidor que criou e guarda capturas e diagnóstico em `.local/helpdesk/`, ignorado pelo Git. A interface roda sobre uma cópia do pacote standalone do último build local, sem copiar `.env` ou `storage` e sem herdar credenciais de integração do terminal. Isso verifica o pacote real e não disputa o cache de um `next dev` já aberto. Refaça o build após alterar o código. Reserve a porta 33380 para o teste.

Complete também `npm test`, `npm run lint`, `npx tsc --noEmit` e `npm run build:local`. Para verificações que possam executar código de servidor, use `DATABASE_URL` explicitamente apontada para o contêiner de teste. Testes simulados e de banco não homologam respostas de um modelo real; essa avaliação deve usar casos fictícios e uma configuração OpenAI autorizada antes da ativação.

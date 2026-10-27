# Chamados internos

O módulo `helpdesk` porta o atendimento do Hub para o Connect: categorias e formulários, anexos, checklist, responsáveis, participantes, fila, aprovações, reabertura, SLA e indicadores. Os dados pertencem a um escritório. Clientes do portal não acessam este módulo.

## Publicação e ativação

1. Na publicação autorizada, aplique as migrations com `npx prisma migrate deploy` no ambiente de destino. A migration `20261019210000_helpdesk` cria somente tabelas novas e suas chaves; não importa dados do Hub.
2. Publique o build normal do Connect, mantendo o volume persistente `storage/`.
3. Em **Configurações → Setores e módulos**, no setor Tech, encontre **Chamados**. Escolha um setor ativo que será responsável pelo atendimento e habilite o módulo. Ele nasce desligado e continua sujeito aos módulos liberados pelo plano contratado.
4. Em **Configurações → Rotinas e cálculos → Chamados internos** (`/admin/modulos/helpdesk`), escolha os setores solicitantes. Marque os setores que podem abrir chamados. A seleção começa vazia; administradores continuam podendo abrir.
5. Em **Chamados → Configurar** (ícone de engrenagem), revise as políticas de SLA. Desde 26/10/2026 a configuração não cadastra categorias nem formulários: a IA interpreta o pedido e pergunta o que faltar. Sem categoria ativa, a primeira abertura cria a categoria **Geral**; as categorias já cadastradas continuam valendo (com uma só, a abertura nem pergunta a categoria).

Chamados começa desativado no controle de módulos. Ao ativá-lo, o atalho aparece para quem tem acesso, sem uma ocultação adicional por padrão no menu Geral. Personalizações de visibilidade feitas explicitamente pelo administrador continuam sendo respeitadas.

O setor responsável vem exclusivamente de `TenantModule.sectorCode`, resolvido por `setorDoModulo`. Transferir o módulo transfere o acesso de atendimento da fila inteira. Atribuições antigas são preservadas e sinalizadas para redistribuição; não concedem acesso à equipe anterior.

Para desativar, desligue o módulo em Módulos. Telas, ações e downloads ficam indisponíveis; chamados, anexos e rascunhos permanecem guardados. Reverter a versão da aplicação não exige apagar as tabelas adicionadas. Não remova a migration nem limpe históricos para fazer rollback.

## Quem vê e quem escreve

- Usuários de setores liberados abrem chamados, mesmo sem papel de gestor. O setor ativo no cabeçalho é um filtro de navegação, não uma concessão de acesso.
- Desde 27/10/2026, só a equipe do setor responsável e os administradores veem a fila inteira e as abas **Em Fila**, **Aguardando Usuário** e **Em Pausa**. Os demais veem só o que abriram, em **Abertos** e **Histórico**; o gestor do setor (coordenador) vê também tudo o que o setor dele abriu.
- Na lista desses usuários, o chamado que aguarda a resposta do solicitante fica destacado ("Aguardando sua resposta"), com um aviso no topo. Quem abriu recebe a notificação **Chamado aguardando sua resposta** quando o chamado entra nessa situação.
- A equipe do setor responsável atende a fila inteira, se adiciona como responsável (o **Adicionar** de Responsáveis, no chamado), muda a situação e registra mensagens e notas internas.
- O gestor responsável também adiciona e retira responsáveis e participantes, reordena a fila pelas setas de subir e descer na aba Em Fila da lista (a ordem vale para todos), ajusta prazos com justificativa e configura as políticas de SLA.
- Administradores têm acesso amplo. Somente leitura consulta, mas não modifica. Assinatura em somente leitura bloqueia gravações e análise por IA.
- Aprovadores selecionados consultam o chamado que precisam decidir. O solicitante não aprova a própria abertura.
- Notas, checklist e anexos internos só são entregues aos perfis com consulta interna. O download repete a autorização no servidor.

Remover um setor solicitante impede novas aberturas, preservando o acompanhamento dos chamados anteriores. A inclusão como responsável não substitui o vínculo com o setor atendente.

## Abertura e revisão por IA

Preencha o setor de origem, o título e a descrição. A abertura não exige escolher categoria: ao enviar, a IA identifica o grupo e a categoria pelo conteúdo e pelas respostas do solicitante. O rascunho aceita categoria vazia e pode ser retomado pela lista. Campos e evidências específicos aparecem depois da classificação e continuam obrigatórios antes da abertura. O texto original é preservado.

No primeiro rascunho, o servidor prepara a lista padrão: **Desenvolvimento** (10 categorias), **Infraestrutura** (7) e **Suporte** (7), conforme `src/lib/chamados/catalogo.ts`. A preparação reutiliza nomes existentes, vincula categorias soltas ao grupo e preserva formulários, anexos, checklists, aprovações e desativações. Não altera chamados antigos nem exige nova migration. Grupos organizam a lista; a IA escolhe somente folhas ativas, com pais ativos. A lista e o detalhe mostram **Grupo › Categoria**; o filtro de um grupo inclui seus descendentes. A equipe pode corrigir a classificação em **Editar dados**.

Se não houver resposta válida de nenhum provedor ou faltar contexto para classificar, fica **A classificar**. O usuário pode detalhar o texto e tentar novamente ou enviar para classificação pela equipe. O sistema não inventa uma categoria. Essa categoria de contingência precisa permanecer ativa. Classificações ficam registradas no rascunho e no evento de abertura; editar título, descrição ou setor invalida a classificação anterior.

O rascunho não entra na fila, não inicia SLA e não gera pedido de aprovação nem notificações de atendimento. A conversa e o parecer ficam persistidos e são consultáveis no chamado após a abertura.

A IA verifica informação suficiente para **iniciar** o atendimento. Considera campos, descrição, evidências legíveis e respostas anteriores; não julga gramática nem exige diagnóstico técnico. Se faltar contexto, o chat apresenta perguntas. Cada resposta faz uma avaliação; não existe laço automático de chamadas. Perguntas idênticas já apresentadas são descartadas; se nenhuma pergunta nova restar, a análise fica indisponível e mantém o envio opcional. Com contexto suficiente, a abertura é concluída automaticamente.

**Enviar mesmo assim** dispensa a aprovação da IA. Se a análise estiver indisponível, use **Tentar análise novamente** ou **Enviar sem análise**. Essas opções não dispensam campos ou anexos obrigatórios nem aprovações de negócio.

Alterações nos dados ou anexos invalidam o parecer anterior. Escritas usam versões; duas abas não sobrescrevem silenciosamente o mesmo rascunho/chamado. A finalização é transacional e única por rascunho. Uma resposta atrasada da IA não envia uma versão que foi alterada. Se a conexão cair durante uma operação, recarregue para reconciliar o estado salvo antes de tentar novamente.

### Configuração da IA

1. Em **Integrações → Inteligência artificial**, cadastre a chave do próprio escritório — **OpenAI ou Anthropic**; o provedor configurado é a primeira tentativa. Ela permanece criptografada no servidor; não existe chave global neste módulo.
2. Na administração de agentes, habilite **Triagem de chamados** (`triagem_chamados`). O agente nasce desligado, usa a faixa `rapido` do catálogo (o modelo rápido do provedor configurado, o mesmo dos outros agentes dessa faixa) e aceita os overrides de modelo existentes.
3. Revise os tetos: padrão de **R$ 100 e 2.000 chamadas mensais**. A fundação existente controla consumo e auditoria das execuções.

Para usar a alternativa, um administrador acessa **Chamados → Configurar → IA alternativa para chamados**, cria uma chave em [Groq → API Keys](https://console.groq.com/keys), salva a chave e marca **Usar Groq quando a IA principal estiver indisponível**. A chave pertence ao escritório, fica cifrada em `TenantIntegration.configEnc` com a chave de instalação existente e nunca volta à tela. Atualização com campo vazio preserva a chave. Salvar a configuração não liga o agente: mantenha **Triagem de chamados** habilitado. Não é necessário instalar SDK ou mudar variáveis globais.

Em falha da IA principal (inclusive chave ausente), há uma tentativa na Groq com `openai/gpt-oss-20b`, JSON Schema estrito e timeout de 20 segundos. O fallback atende tanto classificação quanto revisão, somente com texto: não envia binários, não afirma ler anexos e marca a cobertura como ilegível. A disponibilidade e os limites gratuitos dependem do [plano e limites da conta Groq](https://console.groq.com/docs/rate-limits). Não há cadastro automático de conta/chave nem garantia de uso gratuito em conta paga. O formato segue a [documentação de saída estruturada da Groq](https://console.groq.com/docs/structured-outputs).

Agente desligado e tetos atingidos bloqueiam ambos os caminhos. Tentativas da Groq têm histórico em `IntegrationRun`, sem texto do chamado, chave ou corpo do erro; seu total mensal soma ao consumo de chamadas do agente antes de novas tentativas. Classificação e revisão são chamadas separadas e compartilham os tetos. Falha dos dois provedores preserva o envio opcional. Modelos externos precisam ser homologados com casos fictícios após cadastrar as chaves; testes simulados não comprovam acesso real.

Com OpenAI, a chamada usa Responses API com JSON Schema estrito e `store: false`; com Anthropic, Messages API com saída estruturada (`output_config.format` JSON Schema). Nos dois: teto de tokens de saída, validação Zod, timeout de 30 segundos, resposta incompleta ou recusada vira indisponível, e no máximo dez avaliações por usuário/escritório por minuto. Custo e tetos mensais passam pela mesma fundação de agentes (`executarAgente`). Não há repetição automática de chamadas pagas. `store: false` não substitui a política de retenção da conta da API; na Anthropic, a retenção é a da conta. Como o Anthropic só lê PDF, imagem e texto, DOCX (texto) e XLSX (até mil linhas por aba) são convertidos em texto no servidor antes do envio; o que não puder ser convertido vai como aviso e o modelo marca o anexo como ilegível. O limite por minuto acompanha a implantação atual em uma instância; precisa de armazenamento compartilhado se o Connect passar a usar várias réplicas.

Prompts, documentos e corpos de erro do provedor não são gravados nos logs da triagem. O histórico é dado funcional, protegido pelo acesso ao chamado. Conteúdo fornecido pelo usuário é tratado como dado não confiável, sem ferramentas, comandos ou navegação por links.

## Arquivos

No chamado, os arquivos vão junto com a mensagem: o clipe abre o seletor (vários arquivos de uma vez) e **Ctrl+V** cola prints e arquivos na caixa de texto. Cada arquivo sobe antes da mensagem e fica ligado a ela (`HelpdeskAttachment.commentId`); a mensagem pode ser só de arquivos. "Somente a equipe" vale para a mensagem e os arquivos dela. Os arquivos da abertura aparecem na solicitação.

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

A conversa do chamado é uma linha do tempo única: mensagens, arquivos e eventos (situação, responsáveis, prazo, aprovação, fila…) em ordem, cada evento com quem fez e o quê. Notas e eventos internos aparecem marcados e só para quem tem consulta interna.

Na lista, a busca escolhe onde procurar — **Chamado** (título, descrição ou protocolo), **Setor** (solicitante) ou **Responsável** — e **Atribuídos a mim** fica junto da busca. Os parâmetros antigos `prioridade`, `categoria`, `setor` e `responsavel` continuam aceitos no endereço.

Indicadores e filtros respeitam o mesmo acesso da lista. Os tempos médios de encerramento são horas corridas; os prazos de SLA usam minutos úteis. A posição apresentada na lista é relativa ao recorte visível da pessoa.

## Notificações, alertas e diagnóstico

Eventos são persistidos junto com a operação, e as notificações saem após o commit, pelo sino/push existentes. O identificador estável por evento/destinatário evita duplicações. Falha de entrega mantém o evento pendente para retomada pelo motor de alertas. A mensagem de notificação não contém o corpo de uma nota interna, e o autor não recebe o próprio aviso.

O agendador já existente verifica SLA e retoma entregas pendentes apenas com o módulo ativo. Um alerta de vencimento é único por ciclo. Nenhum agendador adicional é instalado.

Problemas comuns:

- **Módulo não aparece:** conferir plano, ativação, setor responsável ativo e seleção dos setores solicitantes. A configuração de visibilidade do menu Geral também pode esconder o atalho sem alterar permissões.
- **Não há categoria:** a lista padrão é preparada no primeiro rascunho; conferir se suas categorias e grupos estão ativos.
- **Não há aprovador:** cadastrar outra pessoa ativa ou um gestor do setor de origem. O solicitante é excluído da escolha de aprovadores.
- **A versão mudou:** atualizar a página; o sistema preserva a alteração confirmada e recusa sobrescrever a versão anterior.
- **IA indisponível:** conferir a chave principal, a alternativa Groq, o agente e os tetos. Sem classificação, o usuário pode enviar como A classificar.
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

Complete também `npm test`, `npm run lint`, `npx tsc --noEmit` e `npm run build:local`. Para verificações que possam executar código de servidor, use `DATABASE_URL` explicitamente apontada para o contêiner de teste. Testes simulados e de banco não homologam respostas de um modelo real; essa avaliação deve usar casos fictícios e uma configuração de IA (OpenAI ou Anthropic) autorizada antes da ativação.

# Robô do Societário na máquina do TI

Roteiro de 30/10/2026. O robô roda na máquina do TI, ligada o tempo todo, e executa nos sites dos órgãos o que o Connect põe na fila. Hoje ele faz uma coisa: **imprimir o alvará de Curitiba**, pedido no ⋯ de uma licença de alvará. O PDF vai para **Arquivos › Societário** da empresa.

A máquina fica atrás do firewall do escritório. Por isso é ela que busca trabalho no Connect: a cada 30 segundos pede a próxima tarefa, executa num navegador de verdade e devolve o resultado. Quando um órgão pedir certificado, a senha é lida do cofre na hora e fica só na memória do robô. O certificado e a senha nunca vão para o Connect.

Desde 05/11/2026, ao devolver uma tarefa feita com certificado (a IE e o SIMA), a máquina manda junto só o CNPJ do certificado usado. O Connect anota o uso na tela Certificados ("Usado por", "Último uso" e "Se vencer, para…"). Máquina com o programa antigo não manda o campo e segue funcionando; só o uso dela não aparece.

## 1. Publicar

1. Rode `npx prisma migrate deploy`. A migration `20261030120000_robo_do_societario` cria a tabela `robot_tasks`, a fila. Ela não altera registros existentes.
2. Publique o deploy.

## 2. Cadastrar a automação no Ops Center

1. Em **Ops Center**, crie a automação com o identificador `robo-societario`. O responsável recebe no sino os erros dela.
2. Use a chave compartilhada do escritório, em **Configurações › Integrações › Ops Center — bots**. É a mesma da pasta de rede.

O Ops Center precisa estar ligado: sem ele a máquina não busca nada, e o Connect recusa o pedido com esse motivo.

Ligue também o módulo **Robô** do Societário em Configurações (desde 03/11/2026, desligado por padrão). É ele que põe a tela no menu e libera o "Imprimir pelo robô" no ⋯ da licença.

## 3. Instalar na máquina do TI

É preciso ter Node 20 ou mais novo e o repositório do Connect clonado na máquina.

```
npm ci
npx playwright install chromium
npm run robo:societario -- --config=.local/robo-societario.json
```

O último comando cria o arquivo de configuração. Preencha os campos nele, e só nele: nunca no repositório nem em mensagem.

| Campo | O que é |
|---|---|
| `baseUrl` | endereço do Connect |
| `slug` | `robo-societario`, ou o identificador cadastrado no Ops Center |
| `token` | a chave do passo 2 |
| `intervaloMs` | de quanto em quanto tempo ele pede trabalho. O padrão é 30 segundos, e o mínimo é 15 |
| `navegador.visivel` | `true` abre a janela do navegador (o padrão, e o que o site do alvará prefere); `false` roda escondido |
| `navegador.canal` | `"chrome"` usa o Chrome instalado na máquina, em vez do Chromium do Playwright |
| `cofre.arquivo` e `cofre.arquivoChave` | o cofre do KeePassXC e o arquivo-chave. Só o teste do certificado usa, por enquanto |

Antes da primeira tarefa de verdade, faça o ensaio. Ele consulta a inscrição no site da prefeitura e para antes do aceite: não marca nada, não imprime e não fala com o Connect. Mostra se achou o alvará, se o texto do aceite é o mesmo e o começo do texto da página, e guarda uma captura da tela.

```
npm run robo:societario -- --ensaio-alvara --inscricao=<inscrição municipal> --config=.local/robo-societario.json
```

Para testar uma volta, peça um alvará pelo ⋯ de uma licença e rode:

```
npm run robo:societario -- --once --config=.local/robo-societario.json
```

Para deixar rodando, use `--watch` num serviço do Windows (NSSM ou o Agendador de Tarefas, "ao iniciar"). O mesmo comando aceita:
- `--status`: a última volta, a última tarefa e o último erro;
- `--stop`: para o robô na próxima volta.

O robô grava o que faz em `.local/robo-societario.log`, além da janela do cmd: o detalhe de uma falha fica no arquivo depois que a janela fecha. Passou de 2 MB, o arquivo vira `.log.1` e começa outro; o `--status` mostra o caminho.

Quando uma tela sai do esperado, o robô guarda uma captura em `.local/capturas-do-robo/<id da tarefa>.png`. É o material para ajustar o robô.

## 4. Testar como um site pede o certificado

É o primeiro risco do mapa dos robôs. Se o site pede o certificado pela janela comum do Windows, o robô resolve sozinho. Se pedir uma extensão no navegador (Web PKI e afins), o jeito de passar o certificado muda antes de escrever o robô daquele órgão.

```
npm run robo:societario -- --testar-certificado --config=.local/robo-societario.json --url=https://sima.curitiba.pr.gov.br/ --pfx="\\servidor\41 Tech\Certificados\<arquivo>.pfx" --entrada="<título da entrada no cofre>" --origens=https://sima.curitiba.pr.gov.br,https://autenticacao-ecidadao.curitiba.pr.gov.br
```

- A senha mestra do cofre é digitada no terminal, sem aparecer na tela, e não é gravada.
- `--origens` lista os endereços que podem pedir o certificado. No SIMA, o login é no e-Cidadão, outro endereço.
- O navegador fica aberto. Siga o login e veja se entrou. Ao terminar, aperte Enter no terminal: o robô guarda uma captura da última tela e fecha.

### Mapear um site novo

Para escrever a leitura de um órgão contra a página real, uma pessoa faz o caminho à mão com o certificado, e o robô anota cada tela:

```
npm run robo:societario -- --mapear --nome=cicad --config=.local/robo-societario.json --url=https://receita.pr.gov.br/login --pfx="<arquivo>.pfx" --entrada="<título da entrada no cofre>"
```

- A cada tela que importa, aperte Enter no terminal. Dá para escrever uma nota antes do Enter ("depois de emitir", por exemplo). Para terminar, escreva `fim` e Enter.
- Em cada passo o robô anota o endereço, os campos (rótulo, nome, id e tipo, sem o que foi digitado), os botões e links, o começo do texto e uma captura de cada aba aberta. PDF que o site abrir é guardado.
- No fim, mostra os endereços que o site usou. Se o certificado for pedido num endereço que não está em `--origens`, o login falha: acrescente o endereço e rode de novo.
- Tudo fica em `.local/capturas-do-robo/mapa-<nome>/`, só na máquina, porque tem dado de cliente.
- O `npm run robo:societario` liga o `--openssl-legacy-provider` do Node. Os `.pfx` das certificadoras vêm cifrados num algoritmo antigo (RC2), e sem essa opção o robô para em "Unsupported TLS certificate". Quem chamar o `node` direto (o Agendador, por exemplo) precisa pôr a opção antes do script.
- **Site com Web PKI** (a Receita do PR, 03/11/2026): a tela mostra uma "Lista de Certificados" lida por uma extensão, e não pede o certificado pela janela do navegador. Para esses sites o robô usa um perfil fixo do Chrome, em `.local/perfil-do-chrome`, com a extensão Web PKI, e o certificado instalado no Windows da máquina (usuário atual, sem marcar como exportável). Uma vez, rode `--preparar-perfil`: o Chrome abre nesse perfil, você instala a extensão pelo aviso do site, autoriza o site e confere se o certificado aparece na lista. Depois, mapeie com `--perfil` no lugar de `--pfx` e `--entrada`.
- Sem `--entrada`, o robô pede a senha do certificado no terminal, sem aparecer na tela, e não grava. Serve quando o cofre não está à mão; vale também para `--testar-certificado`.

## 5. Acompanhar

- **Societário › Robô** no menu (`/robo`): a fila, o que já foi (com o link do PDF) e o que parou para alguém olhar, com o motivo. Tarefa que ainda está na fila pode ser cancelada.
- **Sino**: quem pediu recebe "O robô precisa de você" quando a tarefa para.
- **Ops Center, automação `robo-societario`**: o sinal de vida da máquina.
- **Trilha de auditoria**: cada aceite de acessibilidade que o robô marcou, com a empresa e a inscrição.

## Como o alvará funciona

1. Na licença de alvará, **⋯ › Imprimir pelo robô**. O Connect confere antes:
   - a licença é de alvará e não está revogada;
   - a empresa tem inscrição municipal. O campo do site recebe 8 dígitos (`0804925-8`), e o Connect aceita o cadastro também sem o zero (`804925-8`) ou com o código inteiro que o site exibe (`17 19 804.925-8`);
   - a cidade é Curitiba (ou está em branco).
2. A máquina consulta a inscrição no site da prefeitura.
3. Se o alvará aparece e o texto do aceite é o mesmo decidido em 15/09, ela marca o aceite, imprime e devolve o PDF da aba nova.
4. O Connect guarda o PDF como `<EMPRESA> - Alvará de Funcionamento <ano>.pdf` e preenche o número e a data de emissão na licença, se estiverem vazios.
5. Vai para alguém olhar:
   - "não encontrado" ou "sem alvará": divergência entre a Junta e a prefeitura, decisão de 15/09;
   - "Alvará pendente de regularização, aguardando anuências…" (03/11/2026): a prefeitura ainda não libera a impressão. A frase dela vai para o motivo, e a tarefa não volta para a fila;
   - a caixa "Não sou um robô" (ICI Captcha, desde 03/11/2026): o robô não marca. Ele pede ajuda pelo Connect (sessão assistida, seção abaixo). Se ninguém marcar no prazo, ou fora do horário comercial, o motivo traz o link da consulta e a inscrição, para fazer à mão e subir o PDF em Licenças › Editar › Ler do PDF, que preenche número, emissão e validade e guarda o PDF em Arquivos › Societário;
   - texto do aceite diferente: alguém relê antes de o robô aceitar em nome do cliente;
   - PDF que não veio;
   - tela desconhecida.
6. Site fora do ar, tela que demorou ou janela do navegador fechada: a tarefa volta para a fila, até 3 tentativas. O motivo vai em frase; o erro técnico fica no registro da máquina. O alvará que a máquina pegou e não devolveu em 25 minutos também volta (eram 15; subiu em 06/11/2026 para caber a espera do captcha).

## O captcha resolvido pelo Connect (sessão assistida)

Desde 06/11/2026. Quando aparece o "Não sou um robô", o robô deixa de esperar alguém na própria máquina:

1. Pede ajuda ao Connect. **No horário comercial** (segunda a sexta, 8h às 18h de Brasília), o Connect abre a sessão por **10 minutos** e avisa **quem pediu a tarefa**, no sino e no celular. **Fora do horário**, responde "não espere", e a tarefa segue direto para o caminho do PDF.
2. O Chrome do robô transmite a tela (screencast em JPEG, uns 10 a 100 KB por quadro), e a máquina repassa o quadro mais novo ao Connect.
3. Quem recebeu o aviso abre **Robô do Societário › Resolver o captcha** (o aviso leva direto), vê a tela ao vivo e clica na caixa. Se aparecer desafio de imagens, clica nas imagens e em Verificar.
4. O Connect manda o clique ao robô com a resposta do próximo quadro. **Só clique**: não existe caminho para tecla, então pela janela não se digita nada no site. Certificado e senha nunca saem da máquina.
5. Depois de **2 minutos** sem clique, o aviso vai para **todo o setor** que opera o módulo do robô.
6. O Consultar liberou: o robô segue sozinho e encerra a sessão. A auditoria grava **quem clicou** como quem resolveu (`societario.robo.assistencia_resolvida`). Sem clique no prazo, a tarefa segue para o caminho do PDF.

A tarefa parada no captcha aparece na lista do Robô do Societário com o botão **Resolver o captcha**, para quem não viu o aviso.

Feriado não está no calendário: num feriado de semana, o robô espera os 10 minutos à toa antes do caminho do PDF.

**Na máquina:** depois do `git pull`, nada a configurar. O programa novo usa `scripts/robo-assistencia.mjs`, que fica na mesma pasta. Com um Connect que ainda não tem a sessão assistida, ele espera na máquina, como antes.

**Teste sem a prefeitura:** `node scripts/local/testar-robo-assistencia.mjs` abre um Chrome sem janela, com uma página local com a caixa num iframe. Um Connect de mentira recebe os quadros e devolve um clique. O teste confere três casos: resolvido, fora do horário e prazo.

## Por dentro

| Peça | Onde |
|---|---|
| Programa da máquina | `scripts/robo-societario.mjs` |
| Pedir a próxima tarefa | `POST /api/ops/watchers/<slug>/tarefas`, com `{ capacidades: ["imprimir_alvara"] }`. Responde `{ tarefa }` ou `{ tarefa: null }` |
| Devolver a tarefa | `POST /api/ops/watchers/<slug>/tarefas/<id>`: JSON `{ ok, resultado }` ou `{ ok: false, motivo, recuperavel }`; com arquivo, multipart com os campos `resultado` e `arquivo` |
| Regra da fila (estados, prazo, tentativas) | `src/lib/robo/tarefas.ts` |
| Decisão do alvará | `src/lib/robo/alvara.ts` |
| Banco | `src/lib/robo/servidor.ts` |
| Levantamento da página do alvará | `src/lib/societario/orgaos/alvara-curitiba.ts` |
| Sessão assistida (captcha): pedir ajuda, mandar a tela, encerrar | `POST …/tarefas/<id>/assistencia` (`{ motivo: "captcha" }`), `PUT …/tarefas/<id>/tela` (JPEG; responde `{ encerrar, cliques }`), `POST …/tarefas/<id>/assistencia/fim` (`{ resultado }`) |
| Regra, memória e banco da sessão assistida | `src/lib/robo/assistencia.ts`, `assistenciaAoVivo.ts`, `assistenciaServidor.ts`; tela em `/robo/assistir/<tarefa>` |
| Lado da máquina da sessão assistida | `scripts/robo-assistencia.mjs` |

Um órgão novo entra em três lugares, com o mesmo nome de tipo:
1. `TIPOS_DE_TAREFA`, em `tarefas.ts`, dizendo se é repetível. Tipo que submete algo ao órgão nunca é repetível: repetir abre dois processos lá.
2. A decisão do resultado, num arquivo ao lado do `alvara.ts`.
3. A função em `CAPACIDADES`, no programa da máquina.

## A vigilância da inscrição estadual (vigiar_ie)

O Connect já sabe o que fazer com a leitura: grava a situação da IE na empresa, mostra o selo na ficha e avisa o Societário quando ela muda (`src/lib/societario/inscricaoEstadual.ts`). A tarefa não é pedida por ninguém: nasce quando a máquina pede trabalho com `vigiar_ie` nas capacidades, uma empresa por vez:

- entram as empresas ativas com IE do PR, as nunca lidas primeiro, e cada uma volta depois de 7 dias;
- a que parou numa pessoa não volta na mesma semana;
- três leituras seguidas que pararam numa pessoa param a rodada por 24 horas (a tela do CICAD mudou, o certificado venceu).

**A leitura na máquina (03/11/2026).** Mapeada contra a página real: nem o login nem a emissão do CICAD pedem captcha, mas o login usa Web PKI, então ela roda no perfil do Chrome do robô (seção 4), com o certificado da 041 instalado no Windows. O robô escolhe o certificado pelo CNPJ (`31052957000105`, ou `vigiarIE.cnpjDoCertificado`), abre a Emissão de CICAD pelo menu, emite e lê o texto entre "Situação Atual" e "Natureza Jurídica". O Chrome fica aberto entre uma empresa e outra, com 15 s de pausa, e fecha depois de 5 minutos sem trabalho.

Para estabelecimento fora de ativo, a Receita não emite o CICAD: responde "Sua solicitação não pôde ser atendida", com o motivo "Estabelecimento inativo no CAD/ICMS." (03/11/2026). Isso é a situação do cliente, e não falha do robô. O robô devolve o motivo como situação, e o Connect grava **inativa** e avisa o Societário. Motivo que o Connect não conhece vai para alguém, com o texto da Receita.

Vai para alguém olhar, sem nova tentativa:
- o certificado não aparece na lista da Receita;
- a Receita diz "CAD/ICMS Inválido.";
- o CICAD que abriu é de outra IE, ou de outro CNPJ que não o do cadastro;
- o CICAD abriu sem o campo Situação Atual.

Antes de ligar, ensaie com uma IE conhecida. O ensaio mostra o que o robô leria, sem falar com o Connect:

```
npm run robo:societario -- --ensaio-ie --inscricao=<IE> --config=.local/robo-societario.json
```

Para ligar, acrescente `"vigiarIE": { "ativo": true }` em `.local/robo-societario.json` e reinicie o robô. Sem isso, a máquina não diz `vigiar_ie` e nenhuma tarefa nasce.

A tarefa recebe `{ inscricao, cnpj }` (só dígitos; `cnpj` nulo quando o cadastro não tem) e devolve `{ ok: true, resultado: { situacao } }`, com o texto do campo "Situação Atual" como está na tela. Quem interpreta é o Connect.

## O acompanhamento dos protocolos do SIMA (observar_sima)

Mapeado contra a página real em 03/11/2026, com o certificado da 041. A cada 6 horas, quando há protocolo do SIMA (órgão `MA`) à espera do órgão e com número, o Connect cria uma rodada com até 60 protocolos. A máquina:

1. abre `/solicitacoes` no Chrome do robô. Sem sessão, entra pelo e-Cidadão com o certificado da 041 ("Entrar com Certificado Digital" e, no primeiro acesso, "Aceitar e entrar");
2. espera o "Carregando solicitações..." sumir: os dados chegam 5 a 15 s depois da página;
3. passa pelas três abas (Pendente, Em análise, Finalizado) e lê o selo e o protocolo de cada cartão;
4. no finalizado sem deferimento, abre o detalhe e lê o "Motivo do cancelamento".

O Connect decide com `classificarSolicitacao` (`src/lib/societario/orgaos/sima.ts`) e grava como o observador de protocolo:
- **Em análise**: segue pendente, com a hora da verificação;
- **Finalizado DEFERIDO**: conclui o protocolo e a etapa, como feito pelo robô;
- **Finalizado CANCELADO**: exigência com o motivo do SIMA, e a etapa volta para o setor;
- **Pendente** com "Aguardando Envio de Documento", "Aguardando Assinatura" ou "Aguardando Pagamento": exigência;
- selo que a tela ainda não mostrou, ou protocolo que não aparece no login da 041 (aberto com o certificado do cliente): fica anotado no protocolo como falha da verificação, sem mexer no desfecho.

Antes de ligar, ensaie. O ensaio lê a lista e mostra o que devolveria, sem falar com o Connect:

```
npm run robo:societario -- --ensaio-sima --config=.local/robo-societario.json
```

Para ligar, acrescente `"observarSima": { "ativo": true }` em `.local/robo-societario.json` e reinicie o robô.

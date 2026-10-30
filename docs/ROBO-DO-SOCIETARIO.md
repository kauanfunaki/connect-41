# Robô do Societário na máquina do TI

Roteiro de 30/10/2026. O robô roda na máquina do TI, ligada o tempo todo, e executa nos sites dos órgãos o que o Connect põe na fila. Hoje ele faz uma coisa: **imprimir o alvará de Curitiba**, pedido no ⋯ de uma licença de alvará. O PDF vai para **Arquivos › Societário** da empresa.

A máquina fica atrás do firewall do escritório. Por isso é ela que busca trabalho no Connect: a cada 30 segundos pede a próxima tarefa, executa num navegador de verdade e devolve o resultado. Quando um órgão pedir certificado, a senha é lida do cofre na hora e fica só na memória do robô. O certificado e a senha nunca vão para o Connect.

## 1. Publicar

1. Rode `npx prisma migrate deploy`. A migration `20261030120000_robo_do_societario` cria a tabela `robot_tasks`, a fila. Ela não altera registros existentes.
2. Publique o deploy.

## 2. Cadastrar a automação no Ops Center

1. Em **Ops Center**, crie a automação com o identificador `robo-societario`. O responsável recebe no sino os erros dela.
2. Use a chave compartilhada do escritório, em **Configurações › Integrações › Ops Center — bots**. É a mesma da pasta de rede.

O Ops Center precisa estar ligado: sem ele a máquina não busca nada, e o Connect recusa o pedido com esse motivo.

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
npm run robo:societario -- --ensaio-alvara --inscricao=<8 dígitos> --config=.local/robo-societario.json
```

Para testar uma volta, peça um alvará pelo ⋯ de uma licença e rode:

```
npm run robo:societario -- --once --config=.local/robo-societario.json
```

Para deixar rodando, use `--watch` num serviço do Windows (NSSM ou o Agendador de Tarefas, "ao iniciar"). O mesmo comando aceita:
- `--status`: a última volta, a última tarefa e o último erro;
- `--stop`: para o robô na próxima volta.

Quando uma tela sai do esperado, o robô guarda uma captura em `.local/capturas-do-robo/<id da tarefa>.png`. É o material para ajustar o robô.

## 4. Testar como um site pede o certificado

É o primeiro risco do mapa dos robôs. Se o site pede o certificado pela janela comum do Windows, o robô resolve sozinho. Se pedir uma extensão no navegador (Web PKI e afins), o jeito de passar o certificado muda antes de escrever o robô daquele órgão.

```
npm run robo:societario -- --testar-certificado --config=.local/robo-societario.json --url=https://sima.curitiba.pr.gov.br/ --pfx="\\servidor\41 Tech\Certificados\<arquivo>.pfx" --entrada="<título da entrada no cofre>" --origens=https://sima.curitiba.pr.gov.br,https://autenticacao-ecidadao.curitiba.pr.gov.br
```

- A senha mestra do cofre é digitada no terminal, sem aparecer na tela, e não é gravada.
- `--origens` lista os endereços que podem pedir o certificado. No SIMA, o login é no e-Cidadão, outro endereço.
- O navegador fica aberto. Siga o login e veja se entrou. Ao terminar, aperte Enter no terminal: o robô guarda uma captura da última tela e fecha.

## 5. Acompanhar

- **Societário › Licenças › Robô** (`/societario/robo`): a fila, o que já foi (com o link do PDF) e o que parou para alguém olhar, com o motivo. Tarefa que ainda está na fila pode ser cancelada.
- **Sino**: quem pediu recebe "O robô precisa de você" quando a tarefa para.
- **Ops Center, automação `robo-societario`**: o sinal de vida da máquina.
- **Trilha de auditoria**: cada aceite de acessibilidade que o robô marcou, com a empresa e a inscrição.

## Como o alvará funciona

1. Na licença de alvará, **⋯ › Imprimir pelo robô**. O Connect confere antes:
   - a licença é de alvará e não está revogada;
   - a empresa tem inscrição municipal de 8 dígitos;
   - a cidade é Curitiba (ou está em branco).
2. A máquina consulta a inscrição no site da prefeitura.
3. Se o alvará aparece e o texto do aceite é o mesmo decidido em 15/09, ela marca o aceite, imprime e devolve o PDF da aba nova.
4. O Connect guarda o PDF como `<EMPRESA> - Alvará de Funcionamento <ano>.pdf` e preenche o número e a data de emissão na licença, se estiverem vazios.
5. Vai para alguém olhar:
   - "não encontrado" ou "sem alvará": divergência entre a Junta e a prefeitura, decisão de 15/09;
   - texto do aceite diferente: alguém relê antes de o robô aceitar em nome do cliente;
   - PDF que não veio;
   - tela desconhecida.
6. Site fora do ar ou tela que demorou: a tarefa volta para a fila, até 3 tentativas. Tarefa que a máquina pegou e não devolveu em 15 minutos também volta.

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

Um órgão novo entra em três lugares, com o mesmo nome de tipo:
1. `TIPOS_DE_TAREFA`, em `tarefas.ts`, dizendo se é repetível. Tipo que submete algo ao órgão nunca é repetível: repetir abre dois processos lá.
2. A decisão do resultado, num arquivo ao lado do `alvara.ts`.
3. A função em `CAPACIDADES`, no programa da máquina.

## A vigilância da inscrição estadual (vigiar_ie)

O Connect já sabe o que fazer com a leitura: grava a situação da IE na empresa, mostra o selo na ficha e avisa o Societário quando ela muda (`src/lib/societario/inscricaoEstadual.ts`). A tarefa não é pedida por ninguém: nasce quando a máquina pede trabalho com `vigiar_ie` nas capacidades, uma empresa por vez:

- entram as empresas ativas com IE do PR, as nunca lidas primeiro, e cada uma volta depois de 7 dias;
- a que parou numa pessoa não volta na mesma semana;
- três leituras seguidas que pararam numa pessoa param a rodada por 24 horas (a tela do CICAD mudou, o certificado venceu).

**Falta a leitura na máquina.** Ela entra em `CAPACIDADES` só depois de testada contra a página real da Receita do PR, como o SIMA. Até lá, a máquina não diz `vigiar_ie` e nenhuma tarefa nasce. Antes, a Ruli precisa confirmar que a emissão do CICAD não pede captcha.

A tarefa recebe `{ inscricao, cnpj }` (só dígitos; `cnpj` nulo quando o cadastro não tem) e devolve `{ ok: true, resultado: { situacao } }`, com o texto do campo "Situação Atual" como está na tela. Quem interpreta é o Connect.

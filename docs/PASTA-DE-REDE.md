# Pasta de rede ligada aos Arquivos: o piloto

Roteiro de 21/10/2026, do pedido de 15/10 (Ajustes Connect, item 9). Um robô numa máquina do escritório lê a pasta de rede dos clientes e traz para os **Arquivos** do Connect o que a equipe põe lá. Ele entra poucos clientes por vez, e só nas empresas ligadas no piloto.

O robô **só lê** a rede. Ele não apaga, não move e não renomeia nada lá.

## 1. O modelo da pasta na rede

```
<raiz>\<CNPJ> - <nome da empresa>\<pasta do modelo>\<subpastas…>\<arquivo>

\\servidor\clientes\12.345.678 0001-90 - Padaria Central\Fiscal\2026\10\nota.pdf
```

- **A pasta da empresa começa pelo CNPJ.** Pode ser com pontuação ou sem ela. A barra não vale em nome de pasta no Windows, então use espaço no lugar dela: `12.345.678 0001-90`. O resto do nome é livre.
- **O primeiro nível é uma pasta do modelo dos Arquivos**, de **Administração › Arquivos**: Fiscal, Departamento Pessoal, Societário, Contábil, Guias, Certidões, ou o que o escritório tiver.
  - O nome é comparado sem acento e sem diferença de maiúsculas.
  - É essa pasta que decide o setor dono e o que o cliente vê no portal, como em qualquer arquivo dos Arquivos.
- **Subpastas** abaixo dela se repetem nos Arquivos. Elas são criadas na primeira vez que aparecem.
- **Não entra:**
  - arquivo solto na pasta da empresa;
  - arquivo em pasta fora do modelo;
  - tipo que os Arquivos não aceitam;
  - arquivo acima de 10 MB.

  O robô avisa cada um desses no Ops Center, e o arquivo só é tentado de novo quando muda.
- **Temporários e arquivos do sistema** são ignorados: `~$…`, `Thumbs.db`, `desktop.ini`, `.tmp` e outros parecidos.

**Arquivo alterado na rede** (mesmo caminho, conteúdo novo) entra como outro arquivo nos Arquivos, ao lado do anterior.

**Arquivo apagado nos Arquivos** não volta. O Connect lembra o que já recebeu.

## 2. Publicar

1. Rode `npx prisma migrate deploy`. A migration `20261021220000_pasta_de_rede` cria duas coisas:
   - a coluna `companies.pastaDeRedeNoDrive`, que começa desligada em todas as empresas;
   - a tabela `drive_network_files`, com o que já veio.
2. Publique o deploy.

## 3. Cadastrar a automação no Ops Center

1. Em **Ops Center**, crie a automação com o identificador `pasta-de-rede`. Em "pasta de entrada", ponha a raiz da rede, para referência. O responsável recebe no sino os erros da automação.
2. Use a chave compartilhada do escritório, em **Configurações › Integrações › Ops Center — bots** (**Gerar chave**). Desde o #251 não há mais chave por automação. A chave aparece uma vez só, e é a mesma dos outros robôs.

## 4. Ligar as empresas do piloto

Em **Administração › Arquivos › Pasta de rede**, escolha 2 ou 3 empresas e clique em **Ligar no piloto**.

A lista mostra quantos arquivos já vieram de cada empresa e quando chegou o último. Para tirar uma empresa do piloto, desligue o interruptor. Vale na hora.

Antes de ligar, peça ao setor que organize a pasta da empresa na rede no modelo acima.

## 5. Instalar o robô na máquina do escritório

É preciso ter Node 20 ou mais novo, e a máquina precisa enxergar a pasta de rede.

```
npm run rede:robo -- --config=.local/pasta-de-rede.json
```

Esse comando cria o arquivo de configuração. Preencha os campos nele, e só nele: nunca no repositório nem em mensagem.

| Campo | O que é |
|---|---|
| `baseUrl` | endereço do Connect |
| `slug` | `pasta-de-rede`, ou o identificador cadastrado no Ops Center |
| `token` | a chave do passo 3 |
| `raiz` | a pasta com as pastas das empresas, por exemplo `\\servidor\clientes` |
| `empresas` | opcional: os CNPJs do piloto. Assim o robô nem lê as outras pastas |
| `intervaloMs` | de quanto em quanto tempo ele roda. O padrão é 5 minutos, e o mínimo é 1 minuto |

Para testar uma volta:

```
npm run rede:robo -- --once --config=.local/pasta-de-rede.json
```

Na primeira volta ele só olha a pasta. Um arquivo só é enviado quando aparece igual em duas voltas seguidas, o que evita mandar arquivo que ainda está sendo copiado. Por isso, rode o comando duas vezes no teste.

Para deixar rodando, use `--watch` num serviço do Windows (NSSM ou o Agendador de Tarefas, "ao iniciar"). O mesmo comando aceita outras opções:
- `--status` mostra a última volta, quantos foram e o que foi recusado, com o motivo;
- `--stop` para o robô.

O estado fica em `.local/pasta-de-rede-estado.json`, ao lado da configuração. Apagar esse arquivo faz o robô conferir tudo de novo. O Connect não duplica: o que já veio volta como "duplicado".

## 6. Acompanhar

- **Ops Center, automação `pasta-de-rede`**:
  - cada arquivo que entrou aparece como sucesso;
  - cada recusa aparece como aviso, com o motivo (pasta fora do modelo, empresa fora do piloto, tipo não aceito);
  - o heartbeat mostra se o robô está vivo.
- **Arquivos da empresa**: o que veio da rede aparece na pasta do modelo, sem "enviado por".

## Como funciona por dentro

- O robô está em `scripts/pasta-de-rede.mjs`.
- Ele chama `POST /api/ops/watchers/<slug>/arquivos`, com `Authorization: Bearer <chave>` e multipart com os campos `cnpj`, `caminho` (relativo à pasta da empresa), `sha256` e `arquivo`. A resposta é `{ ok, arquivoId, duplicado }`.
- A regra fica em `src/lib/drive/pastaDeRede.ts`, e o que toca o banco fica em `src/lib/drive/pastaDeRedeServidor.ts`.
- Respostas de erro:
  - 401 (chave), 409 (o mesmo arquivo já está sendo recebido) e 5xx: o robô tenta de novo na volta seguinte;
  - os outros 4xx são recusa do conteúdo: o robô só tenta de novo quando o arquivo muda.

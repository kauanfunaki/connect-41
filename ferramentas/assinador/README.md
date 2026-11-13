# Assinador do Connect

> **Medida temporária** (decisão de 13/11/2026). Sai quando a assinatura definitiva entrar (CertificadoConnect ou certificado no servidor).

Programa do Windows que deixa o Connect usar o certificado digital **ligado no CertDigital** do computador de quem está trabalhando. O navegador não alcança o repositório de certificados do Windows, e o eSocial só atende quem se identifica com o certificado. Por isso a assinatura e a conversa com o eSocial acontecem aqui, e a chave nunca sai do computador.

Hoje ele atende a busca de colaboradores do DP 2 por CPF e admissão (funcionalidade-671):

| Rota | O que faz |
|---|---|
| `GET /status` | Versão e certificados do repositório pessoal (CurrentUser\My) com chave acessível de verdade |
| `POST /esocial/consultar-trabalhador` | Consulta os identificadores dos eventos de um CPF num período de até 31 dias |
| `POST /esocial/baixar` | Baixa os XML dos eventos pelos Id (até 50 por pedido) |

O envio de eventos (funcionalidade-668) entra depois, reaproveitando a mesma assinatura.

## Segurança

- Atende só em `127.0.0.1:47141`.
- Só aceita chamadas das origens em `appsettings.json` (`OrigensPermitidas`). Outros sites, e chamadas `POST` sem `Origin`, recebem 403.
- Recusa `Host` diferente de `127.0.0.1`/`localhost` (contra DNS rebinding).
- Uma consulta por vez por empresa, como o eSocial exige.
- Não grava log com CPF nem com o conteúdo dos eventos.

## Regras do eSocial (Manual do Desenvolvedor v1.16, 7.7 e 7.8)

- 10 acessos por dia por empregador, somando consulta e download. Quem conta é o Connect, no servidor (`dp2_buscas_esocial`).
- Nenhuma consulta do dia 1 ao 7 de cada mês.
- Consulta de trabalhador só por CPF, com período de recepção de até 31 dias e fim até 1 hora antes de agora.
- Assinatura XMLDSig enveloped, RSA-SHA256, SHA-256, C14N, `Reference URI=""`, só o certificado final.
- Esquemas e WSDL do Pacote de Comunicação v1.6 (`v1_0_0`). Os testes validam o XML assinado contra os XSD oficiais (`Assinador.Tests/xsd`).

## Gerar o executável

Precisa do SDK do .NET 10.

```powershell
cd ferramentas/assinador
dotnet test Assinador.Tests/Assinador.Tests.csproj
dotnet publish Assinador/Assinador.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o publicar
```

Sai `publicar/AssinadorDoConnect.exe` mais o `appsettings.json`. O executável já leva o .NET, então a máquina do DP não precisa instalá-lo.

## Instalar na máquina do DP (TI)

1. Copie a pasta `publicar` para `C:\Program Files\AssinadorDoConnect`.
2. Crie um atalho na pasta Inicializar do usuário (`shell:startup`) para abrir com o Windows.
3. Com o CertDigital ligado, abra `http://127.0.0.1:47141/status` no navegador: deve listar o certificado com `"chaveAcessivel": true`.
4. Em DP 2 › Colaboradores › Importar do eSocial, o quadro "Buscar no eSocial por CPF e admissão" deve mostrar o certificado.

Se o endereço do Connect mudar, acrescente a origem em `OrigensPermitidas` no `appsettings.json` e reabra o programa.

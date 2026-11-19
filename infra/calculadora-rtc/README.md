# Calculadora da reforma (serviço interno)

A calculadora oficial da Receita Federal para CBS, IBS e Imposto Seletivo do
regime geral ([ReceitaFederal/calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular),
MIT), empacotada para rodar ao lado do Connect. A Receita não hospeda API
pública: o Connect usa a cópia própria, na rede interna do EasyPanel. É ela que
responde a tela **Calculadora da reforma** (módulo `fiscal_calculadora`, rota
`/calculadora-tributaria`) e o **Simulador da reforma** do portal.

O `Dockerfile` clona a tag oficial (`CALCULADORA_TAG`, hoje `1.6.1`), gera o
banco SQLite com o Flyway (`flyway-pro.conf`), empacota o JAR e roda com o JRE
21 no perfil `offline`, que abre o banco só para leitura. Nada do código da
Receita é alterado.

## Deploy no EasyPanel

1. No projeto do Connect, crie um serviço **App** novo, por exemplo
   `calculadora-rtc`.
2. Fonte: o mesmo repositório do Connect, branch `main`. Build: **Dockerfile**,
   com o caminho `infra/calculadora-rtc/Dockerfile` e o contexto
   `infra/calculadora-rtc` (o build clona a Receita sozinho; não precisa do
   resto do repositório).
3. **Sem domínio.** A porta interna é a `8080` (a API fica em `/api`). Não
   publique porta nem crie domínio: só o Connect, na mesma rede, chama o
   serviço.
4. Memória: reserve 1 GB (o serviço parado usa cerca de 750 MB). O build baixa
   as dependências do Maven e leva alguns minutos; a imagem final tem cerca de
   650 MB.
5. Faça o deploy e espere o serviço ficar saudável (o `HEALTHCHECK` consulta
   `http://127.0.0.1:9101/health`).
6. No serviço do Connect, crie a variável de ambiente e refaça o deploy:

   ```
   CALCULADORA_RTC_URL=http://<projeto>_calculadora-rtc:8080
   ```

   O host é o nome interno do serviço no EasyPanel (`<projeto>_<serviço>`).
   Com ou sem `/api` no fim, vale igual. **Sem prefixo `NEXT_PUBLIC_`**: o
   endereço só é lido no servidor.
7. Em Configurações › Setores e módulos › Fiscal, ligue **Calculadora da
   reforma** (nasce desligada). Para o cliente **não** ver o Simulador no
   portal ainda, bloqueie a tela em Configurações › Portal do cliente › Telas
   liberadas **antes** de ligar o módulo.

Sem a variável, a tela mostra "Calculadora não configurada" e o portal diz que
o simulador não está disponível; nada quebra.

## Conferir que responde

Pelo console do serviço no EasyPanel (ou local, com `-p 8080:8080`):

```bash
curl http://localhost:8080/api/calculadora/dados-abertos/versao
# {"versaoApp":"1.6.1","versaoDb":"V0059","dataVersaoDb":"2026-09-30","ambiente":"offline",...}
```

Local, na raiz do repositório:

```bash
docker build -t connect-calculadora-rtc infra/calculadora-rtc
docker run --rm -p 8080:8080 connect-calculadora-rtc
```

O Swagger fica em `http://localhost:8080/api/swagger-ui.html` (só na rede
interna, ou na máquina local).

## Atualizar a versão

A Receita publica versões novas da aplicação e da base (alíquotas,
classificações, NCM/NBS). Ao subir, o serviço registra no log a versão online
que a Receita roda (`Aplicação (ONLINE)` e `Banco de Dados (ONLINE)`); em
19/11/2026 a online era 1.7.1 / V0073, e a última tag pública no GitHub, 1.6.1
/ V0059. Quando sair tag nova:

1. Troque `ARG CALCULADORA_TAG=` no `Dockerfile` pela tag nova.
2. Construa e rode localmente, e confira `/dados-abertos/versao` e um cálculo
   (os gabaritos dos testes do Connect estão em
   `src/lib/tributario/calculadora/gabarito`).
3. Rode `npx vitest run src/lib/tributario/calculadora`. Se a resposta mudou de
   formato, atualize os gabaritos e as regras de leitura.
4. Abra o PR e refaça o deploy do serviço.

A consulta à versão online é só informativa: sem internet, o serviço sobe e
calcula igual.

## Simples Nacional: ainda não

A Receita também publicou a calculadora do Simples Nacional
([calculadora-rtc-simples-nacional](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional),
0.0.6, porta 8082), mas o repositório não traz os scripts do banco: o README
manda copiar a pasta `flyway/` de um repositório que é ele mesmo, e a pasta não
existe (conferido na tag 0.0.6 em 19/11/2026). Sem o banco, o perfil offline
não sobe. Fica para quando a Receita publicar os scripts; o serviço entraria
numa segunda pasta (`infra/calculadora-rtc-sn`) com a variável
`CALCULADORA_RTC_SN_URL`.

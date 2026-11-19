# Calculadora oficial da Receita Federal para CBS, IBS e Imposto Seletivo
# (regime geral da reforma tributária, LC 214/2025), rodando como serviço
# interno do Connect. Código aberto (MIT):
#   https://github.com/ReceitaFederal/calculadora-rtc-regime-regular
#
# A imagem clona a tag oficial, gera o banco SQLite com o Flyway (o banco não
# vem pronto no repositório), empacota o JAR e roda com o JRE 21 no perfil
# offline, que lê o banco em modo somente leitura. Nada é alterado no código da
# Receita. Para trocar de versão, mude CALCULADORA_TAG e refaça o build.
#
# Build:  docker build -t connect-calculadora-rtc infra/calculadora-rtc
# Rodar:  docker run --rm -p 8080:8080 connect-calculadora-rtc
# Teste:  curl http://localhost:8080/api/calculadora/dados-abertos/versao

ARG CALCULADORA_TAG=1.6.1

# ── 1. Fonte, banco e JAR ────────────────────────────────────────────────────
FROM eclipse-temurin:21-jdk AS build
ARG CALCULADORA_TAG
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 --branch "${CALCULADORA_TAG}" \
      https://github.com/ReceitaFederal/calculadora-rtc-regime-regular.git . \
 && chmod +x mvnw
# Baixa as dependências numa camada própria (reaproveitada entre builds).
RUN ./mvnw -B -q dependency:go-offline || true
# Gera ./calculadora/db/calculadora-pro.db a partir de flyway/sql.
RUN mkdir -p calculadora/db \
 && ./mvnw -B flyway:migrate -Dflyway.configFiles=./flyway/flyway-pro.conf --errors \
 && test -s calculadora/db/calculadora-pro.db
# Os testes da Receita precisam do perfil "testes"; não fazem parte do deploy.
RUN ./mvnw -B package -DskipTests \
 && cp target/api-regime-geral.jar /src/app.jar

# ── 2. Execução ──────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre
ARG CALCULADORA_TAG
LABEL org.opencontainers.image.title="connect-calculadora-rtc" \
      org.opencontainers.image.version="${CALCULADORA_TAG}" \
      org.opencontainers.image.source="https://github.com/ReceitaFederal/calculadora-rtc-regime-regular" \
      org.opencontainers.image.licenses="MIT"
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --home /app calculadora
WORKDIR /app
COPY --from=build --chown=calculadora /src/app.jar app.jar
COPY --from=build --chown=calculadora /src/calculadora/db/calculadora-pro.db calculadora/db/calculadora-pro.db
USER calculadora
# 8080: API (contexto /api). 9101: saúde e métricas do Spring (management).
EXPOSE 8080
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:9101/health || exit 1
# O JAR precisa rodar da pasta que contém ./calculadora/db.
ENTRYPOINT ["java", "-Dspring.profiles.active=offline", "-jar", "/app/app.jar"]

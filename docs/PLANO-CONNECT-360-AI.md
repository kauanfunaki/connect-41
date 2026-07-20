# Connect 360 AI — análise do documento e plano de execução (17/07/2026)

> Análise do documento "CONNECT 360 AI.docx" (visão de ERP contábil AI-First)
> confrontada com o estado real do Connect hoje, com veredito de viabilidade
> por bloco e um roadmap proposto. Inclui a landing page (domínio
> **useconnect.com.br**, já comprado).

---

## 1. Leitura geral do documento

O documento descreve um **ERP contábil completo AI-First**: motor contábil
(escrituração, ECD/ECF), motor fiscal (importação de NF-e, apurações, SPED,
IBS/CBS), tributário (simulador, planejamento), DP com eSocial/FGTS Digital,
societário, jurídico, financeiro/BPO, CRM, portal do cliente, BPM, agenda de
obrigações, ~20 agentes de IA orquestrados, motor de atualização legislativa
e uma stack nova (Temporal, Keycloak, OpenSearch, OpenTelemetry).

Três observações antes de qualquer requisito:

1. **O documento foi escrito como greenfield** — ignora que o Connect já
   existe e já cobre uma parte relevante do escopo (cadastros, RBAC,
   processos/kanban, transferências multi-setor, documentos com prova de
   recebimento, agenda de reuniões, RH/DP, notificações, assinaturas
   comerciais, auditoria). O plano abaixo parte do que existe, não do zero.
2. **O próprio documento se contradiz no ponto mais caro**: a seção 22 exclui
   do MVP a "substituição completa do sistema contábil" e pede "integração
   inicial com o sistema contábil existente" — ou seja, nem a visão original
   exige construir motor contábil/fiscal próprio agora. Isso é a decisão
   estratégica central (seção 3 abaixo).
3. **Naming**: o texto alterna "CONNET 360 AI", "Contix 360 AI" e "Connect
   360 AI". Padronizar como **Connect** (marca já em uso, domínio
   useconnect.com.br comprado).

---

## 2. Mapa: documento × estado atual do Connect

| Bloco do documento | O que o Connect JÁ tem | Gap real |
|---|---|---|
| 6.1 Cadastro 360 | Empresas (CNPJ com autofill, 16 regimes tributários, IE/IM/NIRE, endereço, filiais, serviços por setor com responsável), Pessoas, campos customizados | Sócios/administradores, CNAEs, certificados digitais, procurações, contas bancárias, "obrigações aplicáveis" |
| 6.2 Gestão de documentos | Módulo de Documentos + Documentos para Cliente (edição, publicação, envio por e-mail com prova de recebimento/IP, SMTP por tenant) | OCR/classificação automática, vinculação a processo, detecção de duplicidade, retenção |
| 6.3 Processos/BPM | Kanban por setor (estágios, responsáveis, prazos, atividades), Transferências multi-setor (instrução por setor, status Nova/Resolvendo/Finalizada, prioridade), tela Tarefas | Templates de processo, checklist, prazo legal × interno, SLA, campo risco, evidências de conclusão |
| 6.4 Agenda de obrigações | Nada (só agenda de reuniões) | **Módulo inteiro — é o coração do Acessórias e o maior gap de produto** |
| 6.5 Módulo contábil | Nada | Motor completo — ver veredito ❌ |
| 6.6 Módulo fiscal | Nada | Motor completo (SPED, IBS/CBS) — ver veredito ❌ |
| 6.7 Tributário | Cadastro do regime por empresa | Simulador/planejamento — ❌ por ora |
| 6.8 DP | Módulos RH/DP extensos (admissões, férias, afastamentos, desligamentos, folha [registro], horas extras, benefícios, escalas, ponto não) | Transmissão eSocial/FGTS Digital/DCTFWeb — ❌ (registro sim, transmissão não) |
| 6.9 Societário | Setor societário no Kanban | Gerador documental IA — possível na fase de IA, escopo reduzido |
| 6.10 Jurídico | Nada | ❌ por ora |
| 6.11 Financeiro | Assinaturas/cobrança do próprio Connect | BPO financeiro — fora de escopo por ora |
| 6.12 Comercial/CRM | Kanban comercial, módulo de Assinaturas (planos, gestão) | Automação proposta→implantação |
| 6.13 Gestão de pessoas | Cargos/salários, avaliações, treinamentos, capacidade (Capacity no Monday) | Distribuição inteligente de tarefas |
| 7 Níveis de automação | — | Adotar a régua 1–5 como política dos agentes (boa ideia, custo zero) |
| 8 Dashboard | Home work-first (Meu dia, transferências, agenda, gráficos) | Visões legal/financeira/agentes conforme módulos existirem |
| 9 Portal do cliente | Link público de documento com prova de recebimento | Portal logado com solicitações — grande, mas viável em fases |
| 10 Motor legislativo | Nada | ❌ como motor automático; ✅ como base curada manual |
| 11–13 Arquitetura (Temporal, Keycloak, OpenSearch, microsserviços) | Monólito Next.js + Prisma/MySQL + JWT próprio + RBAC + auditoria | Não adotar — ver seção 4 |
| 14–15 Arquitetura/governança de agentes | Nada de IA em produção | Base do Connect IA (já aprovado em pitch, plano em 4 etapas no backlog) |
| 20 Alertas | Notificações in-app, alerta focal de reunião | Alertas de vencimento (certidão/procuração/certificado/obrigação) — dependem dos cadastros da Fase 1 |

**Resumo honesto**: o Connect já cobre ~40% do escopo "gestão" do documento.
Os 60% restantes se dividem em: (a) módulos de gestão viáveis (obrigações,
portal, processos ricos), (b) camada de IA viável em escopo reduzido, e (c)
motores contábil/fiscal/folha-transmissão que **não valem a pena construir**.

---

## 3. Decisão estratégica central

**O Connect não deve virar um ERP contábil. Deve ser a camada de gestão +
IA por cima do sistema contábil que o escritório já usa.**

- O concorrente real do Connect é o **Acessórias** (gestão de obrigações,
  processos, documentos, portal) — que a 41 já usa e quer substituir — e não
  o Domínio/Alterdata/Onvio (escrituração, SPED, folha).
- Motor contábil/fiscal/eSocial é uma guerra de década contra players
  estabelecidos, com risco regulatório contínuo (o próprio doc cita IBS/CBS
  com exigência a partir de 03/08/2026, leiautes SPED e eSocial S-1.3
  versionados — isso é um custo *permanente* de manutenção, não um projeto).
- Time real: 2 devs (Kauan + Nathan). O doc pede ~6 pessoas de dev + núcleo
  contábil só pro MVP dele.
- A prioridade declarada atual é **terminar os módulos dos setores** — o
  plano respeita isso.

O que o documento tem de melhor e deve ser absorvido: **agenda de
obrigações**, **processos com prazo legal/SLA/evidência**, **portal do
cliente**, **régua de automação 1–5 com aprovação humana**, **saída
estruturada dos agentes** (JSON com fontes/confiança/requer_aprovacao) e a
**governança de IA** (seção 15 — praticamente uma política pronta).

---

## 4. Veredito de viabilidade por bloco

### ✅ Vale a pena e é viável (aproveita o que existe)

| Item | Por quê / como |
|---|---|
| **Agenda de obrigações** | Maior gap vs. Acessórias. Motor de recorrência: templates de obrigação (federal/estadual/municipal) aplicados por regime tributário (os 16 já cadastrados), UF/município e serviços contratados. Gera competências com vencimento, responsável (via CompanyService), status, protocolo/comprovante como evidência. |
| **Empresa 360 (complemento de cadastro)** | Adicionar: sócios/administradores, CNAEs (já há TODO no formulário), certificados digitais e procurações **com vencimento**, contas bancárias, sistemas utilizados. São tabelas satélites de Company — padrão já existente. |
| **Alertas de vencimento** | Certidão/procuração/certificado/obrigação vencendo. A infra de notificação + alerta focal (reunião) já existe; é criar os cron checks. |
| **Processos ricos (BPM lite)** | Evoluir Kanban/Transferências/Tarefas: templates de processo com checklist por departamento, prazo legal × interno, campo risco, evidência de conclusão. Sem engine BPM externa. |
| **Portal do cliente** | Fase própria. Já existe a semente (link público com prova). Portal logado: minhas empresas, documentos, solicitações, guias, pendências. É o que destrava a comercialização. |
| **Régua de automação 1–5 + governança de IA** | Adotar como política escrita dos agentes desde o 1º agente. Custo ~zero, valor alto (inclusive comercial/LGPD). |
| **Landing page (useconnect.com.br)** | Ver seção 6. |

### ⚠️ Vale a pena, mas depois / com escopo reduzido

| Item | Escopo reduzido proposto |
|---|---|
| **Orquestrador de agentes** | Não são 20 agentes. Começar com **3**: (1) Triagem — lê solicitação do cliente/controladoria e cria processo+tarefas com prazo; (2) Documentos — classifica upload, extrai CNPJ/competência, vincula à empresa; (3) Cobrança documental — cobra cliente de documento faltante. Tudo nível de automação ≤3 (humano aprova). Claude API. |
| **Connect IA / "Second Brain"** | Já aprovado em pitch, plano de 4 etapas no backlog — a etapa 1 (prioridade no Handoff) **foi entregue hoje** com as transferências. Retomar quando os módulos de setores terminarem. |
| **Gerador documental societário** | Minutas/atas/checklists via IA com revisão obrigatória (nível 3–4). Só depois do agente de triagem provar o padrão. |
| **Distribuição inteligente de tarefas** | Começar com o simples: sugestão por carga aberta + setor. Os fatores do doc (desempenho anterior, custo) exigem histórico que ainda não existe. |
| **Storage S3 + OCR** | Migrar documentos pra storage S3-compatível (MinIO na VPS serve) quando o portal do cliente entrar; OCR junto com o agente de documentos. |
| **Base legal curada** | Não como "motor automático": uma tabela versionada de regras/prazos mantida manualmente pelo núcleo contábil, com campo fonte oficial. O fluxo de homologação humana do doc está certo — a coleta automática, não. |
| **Simulador tributário** | Só comparação Simples × Presumido × Real com premissas explícitas, bem mais tarde. Nunca como parecer automático. |

### ❌ Não vale a pena (não construir)

| Item | Motivo |
|---|---|
| Motor contábil (escrituração, ECD/ECF, livros) | Competir com Domínio/Onvio com 2 devs; manutenção regulatória perpétua. Integrar, não substituir. |
| Motor fiscal (SPED, EFD, apurações, IBS/CBS) | Idem — o risco IBS/CBS 2026 citado no doc é justamente o argumento contra: quem constrói motor fiscal agora paga a reforma tributária inteira em manutenção. |
| Folha própria + transmissão eSocial/FGTS Digital/DCTFWeb | O RH/DP do Connect registra e gerencia; transmitir é território do sistema de folha. |
| Banco digital / liberação de pagamentos | O doc mesmo proíbe a IA de liberar pagamento; sem caso de uso hoje. |
| Motor de atualização legislativa automático | Coleta automática de norma + implantação de regra = risco altíssimo; versão curada manual cobre. |
| Temporal / Keycloak / OpenSearch / OpenTelemetry / microsserviços | O Connect já tem auth JWT+RBAC funcionando (migrar pra Keycloak é custo sem ganho), o volume não justifica Temporal (cron + tabela de jobs resolve), busca atual atende, monólito modular é exatamente o que o doc recomenda pro MVP — e já é o que existe. Reavaliar OpenTelemetry quando houver agentes em produção. |
| Módulo jurídico completo | Sem demanda interna mapeada; atos privativos de advogado. |

---

## 5. Roadmap proposto

> Premissas: 2 devs, prioridade atual = terminar módulos dos setores.
> Fases pequenas, cada uma vendável por si.

- **Fase 0 — em andamento**: terminar os módulos dos setores + deploy das
  pendências (transferências multi-setor, alerta de reunião, etc.). Os
  módulos 6.5–6.12 do documento (contábil, fiscal, tributário, DP,
  societário, jurídico, financeiro, comercial) **são o insumo de requisitos
  desta fase**, adaptados pra versão "gestão" (seção 5.1) — mais BPO e
  Recrutamento, que não constam no documento. O levantamento por setor
  (seção 5.2) faz parte da Fase 0.
- **Landing page**: adiada por decisão de 17/07 — só quando o app sair do
  MVP. O plano da seção 6 fica pronto pra quando chegar a hora.
- **Fase 1 — Empresa 360 + Agenda de Obrigações** (o "matador de
  Acessórias"): cadastros satélites (sócios, CNAEs, certificados,
  procurações, contas), motor de obrigações recorrentes por
  regime/UF/serviço, alertas de vencimento. É o módulo que justifica migrar
  do Acessórias de vez.
- **Fase 2 — Processos ricos**: templates com checklist, prazo legal ×
  interno, risco, SLA, evidências; Tarefas vira a visão operacional central
  (caminho já iniciado hoje).
- **Fase 3 — Portal do Cliente**: login de cliente, solicitações,
  documentos/guias, pendências. Pré-requisito prático: storage S3 + revisar
  RBAC pra papel "cliente".
- **Fase 4 — Connect IA v1**: agentes de Triagem, Documentos e Cobrança
  documental, com a régua 1–5, saída JSON estruturada e log de execução
  (governança da seção 15 do doc como política). Retoma o plano do backlog
  Connect IA (etapas 2–4).
- **Fase 5 — Expansão**: dashboards por visão (legal/financeira/agentes),
  distribuição inteligente, gerador documental societário, base legal curada.

Cada fase vira um Épico no Monday **quando for confirmada** (não criados
ainda — regra do CLAUDE.md: épico só com confirmação explícita).

### 5.1 Fase 0 — o que "adaptar" significa por módulo

O documento lista as funções de cada módulo em termos de **motor** (calcular,
escriturar, transmitir). A adaptação pro Connect é a versão **gestão** de
cada um: rotinas como processos com checklist, obrigações com prazo e
evidência, documentos vinculados — o cálculo continua no sistema
especialista.

> Correção de 17/07 (feedback do Kauan): **não existe setor Tributário** na
> empresa — as funções do módulo 6.7 são distribuídas entre **Societário
> (maior parte)** e **Fiscal**. Também não existe setor Jurídico, mas 6.10
> permanece como **módulo sem setor próprio** (funções não se confundem com
> as do Societário). **Controladoria** entra na lista (faltava).

| Setor | Módulo adaptado no Connect (escopo-alvo) |
|---|---|
| Controladoria (fora do doc) | Centro de controle: abertura/acompanhamento das transferências entre setores (entregue), visão geral de prazos e pendências de todos os setores, cobrança interna. Detém a lista de obrigações do Acessórias — fonte principal do levantamento. |
| Contábil (6.5) | Fechamento mensal como processo/checklist por empresa (a seção 16 do doc é o template pronto, itens 1–22); controle de conciliações como tarefas; ECD/ECF como **obrigações a controlar** (prazo+protocolo), não a gerar. |
| Fiscal (6.6 + parte do 6.7) | Checklist mensal de apurações/entregas por empresa×regime; SPED/EFD como obrigações com evidência de transmissão; relatório de pendências. Absorve do tributário o que é ligado a apuração (retenções, créditos). Sem importação de XML no início. |
| DP (6.8) | **Praticamente pronto** (módulos RH/DP do Nathan). Fazer só conferência de lacunas contra a lista do doc (SST, convenções coletivas, alertas trabalhistas). Transmissões (eSocial etc.) seguem fora. |
| Societário (6.9 + maior parte do 6.7) | Atos societários (constituição/alteração/baixa) como processos com checklist, protocolo e acompanhamento; procurações e certidões com vencimento. Absorve a maior parte do tributário: regimes, parcelamentos, débitos, notificações, planejamento. Minutas por IA ficam pra Fase 4+. |
| Jurídico (6.10 — módulo, sem setor próprio) | Mantido como módulo à parte porque as funções (contratos com vigência, obrigações contratuais, prazos) não se confundem com as do Societário. Escopo mínimo; defesas e processos judiciais seguem fora. |
| Financeiro (6.11) | Honorários e cobrança do escritório (inadimplência, alertas). BPO financeiro completo fora do escopo inicial. |
| Comercial (6.12) | Funil já existe no Kanban; adaptar a automação proposta-aceita → cria empresa + processo de implantação + solicitação de documentos. |
| BPO (fora do doc) | Levantamento do zero com o setor — sem seção no documento. |
| Recrutamento (fora do doc) | Já existe (vagas/candidatos/candidaturas). Só conferência de lacunas com o setor. |

### 5.2 Levantamento com os setores — precisa, mas enxuto

O documento dá o **vocabulário** das funções; não dá a **realidade** de cada
setor (volumes, sistemas usados, o que de fato é rotina vs. exceção). O
levantamento não é "quais funções vocês querem" — é validar o escopo-alvo da
tabela acima e preencher o que só o setor sabe. Uma conversa de ~1h por
coordenador, com roteiro fixo:

1. Rotinas recorrentes (mensal/trimestral/anual) e em que sistema rodam hoje;
2. Obrigações com prazo que o setor entrega (a lista real do Acessórias é o
   insumo — exportar antes da conversa);
3. Demandas pontuais mais comuns (viram templates de processo);
4. Documentos que entram/saem e de quem cobram;
5. O que precisa de aprovação de quem;
6. Maior dor com o fluxo atual no Acessórias.

O mesmo levantamento alimenta a Fase 0 (módulos) **e** a Fase 1 (templates
de obrigações) — fazer uma vez só. Rodada completa: Contábil, Fiscal,
Societário, Financeiro, Comercial, BPO e **Controladoria** (que além do
próprio fluxo traz a lista de obrigações do Acessórias). DP e Recrutamento
dispensam (módulos já construídos): só conferência de lacunas.

---

## 6. Landing page — useconnect.com.br

> **Adiada (decisão de 17/07/2026)**: entra só quando o app sair do MVP.
> O planejamento abaixo fica pronto pra esse momento.

**Arquitetura recomendada**: projeto separado e enxuto (Next.js estático ou
Astro) em repo próprio (`connect-landing`), deploy no EasyPanel:

- `useconnect.com.br` → landing (site de marketing).
- `app.useconnect.com.br` → o Connect atual (hoje em domínio interno).
- Motivos: não acoplar marketing ao repo do app (deploys independentes, sem
  risco de vazar código do app), página estática = rápida e barata, e o kit
  de marca `connect-brand/` já existe pra reaproveitar.

**Estrutura de conteúdo** (1 página + /precos se quiser separar):

1. **Hero** — posicionamento: "Gestão inteligente para escritórios
   contábeis" (gestão de obrigações, processos entre setores, documentos com
   prova, portal do cliente). Não vender "IA que faz contabilidade" — vender
   controle. CTA: "Agendar demonstração".
2. **Dores** — planilhas, e-mails dispersos, prazo perdido, dependência de
   pessoas (a seção 26 do doc é literalmente o copy disso).
3. **Módulos** — Empresas 360, Obrigações, Transferências entre setores,
   Documentos com prova de recebimento, Agenda, RH/DP, Kanban — com
   screenshots reais do app (tema claro e escuro).
4. **Connect IA** — teaser honesto do roadmap (triagem, cobrança documental,
   classificação de documentos) com selo "em desenvolvimento" + o argumento
   de governança (aprovação humana sempre) como diferencial.
5. **Planos** — refletindo o módulo de Assinaturas já existente (gerenciado
   × autoatendimento; preço sob consulta no início).
6. **Rodapé** — LGPD/privacidade, contato, 41 Tech como operadora inicial.

**Pendências não-código**: apontar DNS do useconnect.com.br pro EasyPanel,
certificado TLS, e-mail de contato (contato@useconnect.com.br via cPanel),
decidir a paleta de azul (pendência antiga do rebrand — a landing força essa
decisão, o que é bom).

---

## 7. Próximos passos imediatos sugeridos

1. Validar com Nathan e os sócios a **decisão estratégica da seção 3 deste
   plano** (Connect = gestão + IA integrando com o sistema contábil; não
   construir motores contábil/fiscal/folha). É a única validação de rumo
   necessária agora — o organograma de agentes do docx só vira pauta na
   Fase 4.
2. Confirmar quais fases viram Épicos no Monday (crio na confirmação).
3. Rodar o levantamento enxuto da seção 5.2 com os setores (exportar a lista
   de obrigações do Acessórias antes).
4. Seguir a Fase 0 com o escopo-alvo da seção 5.1.
5. Landing page: adiada pra pós-MVP (seção 6).

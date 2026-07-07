Você vai atuar como analista funcional e técnico do projeto Connect 41.

Contexto do projeto:

O Connect 41 é um CRM interno/multiárea que será usado por todos os setores da empresa. A base do sistema já existe e possui autenticação, layout autenticado, navegação por setores, CRUDs principais e um motor de pipeline genérico.

Agora vamos iniciar a entrada real de informações dos setores de Recrutamento, RH e DP.

Não vou anexar as planilhas nesta etapa. Abaixo está o levantamento funcional já consolidado com base nos controles atuais desses setores. Use este documento como referência para analisar o projeto atual e verificar quais telas, campos e fluxos fazem sentido dentro do Connect 41.

Importante:

Não quero implementação agora.

Não quero alteração de stack, arquitetura, banco, variáveis de ambiente, autenticação, permissões ou estrutura técnica sem autorização.

O objetivo desta etapa é apenas análise funcional e validação de viabilidade dentro do projeto atual.

Sua tarefa:

1. Analise o projeto atual do Connect 41.
2. Use o levantamento funcional abaixo como referência.
3. Verifique quais campos, telas e fluxos já são compatíveis com o que existe.
4. Identifique o que precisaria ser criado.
5. Identifique o que pode ser reaproveitado, principalmente cadastro de pessoas, empresas, pipeline e timeline.
6. Separe o que é tela operacional do que é indicador futuro para dashboard.
7. Não implemente nada.
8. Não altere arquivos.
9. Ao final, entregue uma análise objetiva e pare aguardando aprovação.

Levantamento funcional para Recrutamento, RH e DP:

## 1. Núcleo de Colaboradores

Objetivo:
Criar uma base central de colaboradores para ser usada pelos módulos de RH, DP, recrutamento, férias, folha, benefícios, turnover, treinamentos e desempenho.

Telas necessárias:

* Lista de colaboradores
* Cadastro/edição de colaborador
* Ficha do colaborador
* Histórico/timeline do colaborador
* Documentos do colaborador

Campos principais:

* Nome completo
* CPF
* RG
* PIS
* CTPS
* Data de nascimento
* Data de admissão
* Data de demissão
* Empresa
* Departamento
* Seção
* Cargo
* Salário bruto
* Jornada
* Carga horária mensal
* Carga horária semanal
* Dados bancários
* Endereço
* Escolaridade
* Status do colaborador

Status possíveis:

* Ativo
* Desligado
* Afastado
* Em férias
* Admissão em andamento

Ações do usuário:

* Cadastrar colaborador
* Editar dados cadastrais
* Vincular empresa
* Vincular cargo
* Vincular salário
* Vincular jornada
* Vincular benefícios
* Anexar documentos
* Consultar histórico

Relacionamentos:

* Empresa
* Pessoa
* Cargo
* Departamento
* Benefícios
* Jornada
* Férias
* Afastamentos
* Folha
* Treinamentos
* Desempenho

Validações importantes:

* Evitar duplicidade de CPF
* Registrar histórico de alterações sensíveis
* Controlar acesso a dados pessoais e documentos
* Separar dados operacionais de dados futuros de BI

Indicadores futuros:

* Total de colaboradores ativos
* Colaboradores por empresa
* Colaboradores por setor
* Colaboradores por cargo
* Entradas e saídas por período

## 2. Recrutamento e Seleção

Objetivo:
Controlar vagas, candidatos, etapas do processo seletivo, origem dos candidatos, aprovações, reprovações e contratações.

Telas necessárias:

* Lista de vagas
* Cadastro/edição de vaga
* Ficha da vaga
* Pipeline da vaga
* Lista de candidatos
* Cadastro/edição de candidato
* Ficha do candidato
* Candidatos vinculados à vaga

Campos principais da vaga:

* Título da vaga
* Empresa/cliente
* Setor
* Cargo
* Quantidade de vagas
* Responsável pela vaga
* Data de abertura
* Data de encerramento
* Status da vaga
* Prioridade
* Observações

Campos principais do candidato:

* Nome
* Telefone
* E-mail
* Endereço
* Escolaridade
* Perfil/resumo profissional
* Origem da candidatura
* Currículo/anexo
* Vaga pretendida
* Data de inscrição
* Status no processo
* Motivo de reprovação
* Motivo de desistência
* Data de contratação

Etapas possíveis:

* Vaga aberta
* Divulgação
* Triagem
* Entrevista RH
* Entrevista gestor
* Teste
* Proposta
* Aprovado
* Reprovado
* Contratado
* Encerrado

Ações do usuário:

* Criar vaga
* Cadastrar candidato
* Vincular candidato à vaga
* Mover candidato entre etapas
* Registrar feedback
* Registrar motivo de reprovação
* Registrar desistência
* Aprovar candidato
* Converter candidato aprovado em colaborador
* Encerrar vaga

Relacionamentos:

* Pessoa
* Empresa
* Cargo
* Pipeline
* Colaborador
* Timeline

Indicadores futuros:

* Vagas abertas
* Vagas encerradas
* Tempo médio de contratação
* Candidatos por vaga
* Taxa de aprovação
* Taxa de reprovação
* Origem de candidatos
* Motivos de reprovação
* Motivos de desistência

## 3. Processo Seletivo

Objetivo:
Detalhar o andamento individual de cada candidato dentro de uma vaga.

Telas necessárias:

* Processo seletivo por vaga
* Processo seletivo por candidato
* Histórico de interações
* Registro de entrevistas

Campos principais:

* Candidato
* Vaga
* Etapa atual
* Data de entrada na etapa
* Responsável
* Feedback
* Resultado da entrevista
* Status do processo
* Motivo de encerramento

Ações do usuário:

* Registrar entrevista
* Registrar observação
* Atualizar etapa
* Aprovar
* Reprovar
* Marcar desistência
* Encerrar processo

Status possíveis:

* Em andamento
* Aprovado
* Reprovado
* Desistente
* Contratado
* Encerrado

Indicadores futuros:

* Conversão por etapa
* Tempo em cada etapa
* Gargalos do funil
* Candidatos parados
* Processos encerrados por motivo

## 4. Cargos e Salários

Objetivo:
Controlar cargos, faixas salariais, requisitos, promoções e histórico salarial.

Telas necessárias:

* Lista de cargos
* Cadastro/edição de cargo
* Faixas salariais
* Histórico salarial do colaborador
* Promoções/reajustes

Campos principais:

* Nome do cargo
* Área
* Departamento
* Grupo
* Descrição do cargo
* Requisitos técnicos
* Requisitos comportamentais
* Conhecimentos necessários
* Faixa salarial inicial
* Faixa salarial intermediária
* Faixa salarial final
* Salário atual
* Salário anterior
* Percentual de reajuste
* Data do reajuste
* Motivo do reajuste

Ações do usuário:

* Criar cargo
* Editar cargo
* Definir faixas salariais
* Vincular colaborador ao cargo
* Registrar promoção
* Registrar reajuste
* Consultar histórico salarial

Relacionamentos:

* Colaborador
* Departamento
* Empresa
* Histórico salarial

Indicadores futuros:

* Colaboradores por cargo
* Salário médio por cargo
* Colaboradores fora da faixa
* Promoções por período
* Reajuste médio

## 5. Férias

Objetivo:
Controlar períodos aquisitivos, períodos concessivos, programação, solicitação, aprovação e conclusão de férias.

Telas necessárias:

* Lista de férias
* Calendário de férias
* Solicitação de férias
* Ficha de férias do colaborador
* Férias vencidas/a vencer

Campos principais:

* Colaborador
* Empresa
* Departamento
* Período aquisitivo inicial
* Período aquisitivo final
* Período concessivo inicial
* Período concessivo final
* Data de início das férias
* Data de retorno
* Dias de férias
* Abono pecuniário
* Parcelamento
* Status
* Observações

Etapas possíveis:

* Planejada
* Solicitada
* Em análise
* Aprovada
* Programada
* Em gozo
* Concluída
* Cancelada

Ações do usuário:

* Programar férias
* Solicitar férias
* Aprovar férias
* Reprovar férias
* Registrar abono
* Registrar parcelamento
* Anexar documentos
* Concluir férias

Validações importantes:

* Alertar férias próximas do vencimento
* Alertar férias vencidas
* Registrar histórico de alterações
* Validar conflitos com escala e afastamentos

Indicadores futuros:

* Férias vencidas
* Férias a vencer
* Férias programadas por mês
* Colaboradores sem férias programadas
* Dias de férias por setor

## 6. Folha de Pagamento

Objetivo:
Controlar lançamentos mensais que impactam a folha, sem necessariamente substituir o sistema oficial de folha.

Telas necessárias:

* Competências de folha
* Lançamentos por colaborador
* Conferência mensal
* Resumo de folha
* Exportação/conferência

Campos principais:

* Colaborador
* Competência
* Salário bruto
* Dias trabalhados
* Férias
* 13º salário
* Salário família
* Afastamentos
* Dias de afastamento
* Faltas
* Horas extras
* Adicional noturno
* Periculosidade
* Insalubridade
* Benefícios
* Descontos
* Status da conferência

Status possíveis:

* Pendente
* Em conferência
* Conferido
* Enviado
* Processado
* Cancelado

Ações do usuário:

* Abrir competência
* Lançar evento
* Conferir lançamento
* Marcar como enviado
* Anexar recibos
* Consultar histórico

Indicadores futuros:

* Custo mensal de folha
* Eventos por competência
* Benefícios lançados
* Horas extras lançadas
* Descontos por tipo
* Folha por empresa/setor

Observação:
O sistema deve ser tratado como controle e conferência de lançamentos, não como motor oficial de cálculo trabalhista, salvo decisão futura.

## 7. Horas Extras

Objetivo:
Registrar e apurar horas extras por colaborador, data, jornada e tipo de dia.

Telas necessárias:

* Lançamento de horas extras
* Apuração mensal
* Conferência por gestor
* Resumo por colaborador
* Resumo por setor

Campos principais:

* Colaborador
* Data
* Jornada prevista
* Entrada
* Intervalo
* Saída
* Horas devidas
* Horas trabalhadas
* Horas extras
* Tipo de dia
* Adicional aplicado
* Justificativa
* Status de aprovação

Tipos de dia:

* Dia útil
* Folga
* Domingo
* Feriado
* Noturno

Status possíveis:

* Lançado
* Pendente de aprovação
* Aprovado
* Reprovado
* Enviado para folha

Ações do usuário:

* Lançar horas
* Editar lançamento
* Aprovar horas
* Reprovar horas
* Enviar para folha
* Consultar saldo

Indicadores futuros:

* Total de horas extras por mês
* Horas extras por setor
* Horas extras por colaborador
* Custo estimado de horas extras
* Horas extras em feriados/domingos

## 8. Absenteísmo / Atestados / Afastamentos

Objetivo:
Controlar ausências, atestados, afastamentos, dias perdidos e horas perdidas.

Telas necessárias:

* Registro de ausência
* Lista de atestados
* Afastamentos ativos
* Retornos previstos
* Histórico de ausências do colaborador

Campos principais:

* Colaborador
* Empresa
* Departamento
* Cargo
* Data de início
* Data de retorno
* Dias perdidos
* Horas perdidas
* Tipo de ausência
* Tipo de atestado
* Motivo
* Turno
* Local de atendimento
* Conselho/profissional
* Anexo do documento
* Observações
* Status

Tipos possíveis:

* Falta
* Atestado parcial
* Atestado integral
* Licença
* Afastamento
* Retorno

Status possíveis:

* Lançado
* Em análise
* Aprovado
* Reprovado
* Afastado
* Retorno previsto
* Concluído

Validações importantes:

* Dados médicos devem ter acesso restrito
* Anexos precisam de controle de permissão
* Registrar histórico de alterações
* Alertar retorno previsto

Indicadores futuros:

* Taxa de absenteísmo
* Dias perdidos
* Horas perdidas
* Absenteísmo por setor
* Absenteísmo por turno
* Motivos recorrentes

## 9. Benefícios

Objetivo:
Controlar benefícios oferecidos, colaboradores vinculados, custos, descontos e vigências.

Telas necessárias:

* Catálogo de benefícios
* Benefícios por colaborador
* Lançamentos mensais
* Conferência de benefícios
* Histórico de benefícios

Campos principais:

* Nome do benefício
* Tipo de benefício
* Colaborador
* Empresa
* Valor empresa
* Valor desconto
* Data de início
* Data de fim
* Status
* Regra de elegibilidade
* Observações

Benefícios possíveis:

* Vale-refeição
* Vale-alimentação
* Vale-transporte
* Auxílio combustível
* Plano de saúde
* Plano odontológico
* Convênio farmácia
* Convênio SESC
* TotalPass
* Auxílio educação
* Assiduidade
* Outros

Status possíveis:

* Ativo
* Inativo
* Suspenso
* Pendente
* Cancelado

Ações do usuário:

* Cadastrar benefício
* Vincular benefício ao colaborador
* Alterar valor
* Suspender benefício
* Cancelar benefício
* Lançar desconto
* Conferir competência

Indicadores futuros:

* Custo total de benefícios
* Custo por colaborador
* Benefícios mais utilizados
* Benefícios por setor
* Descontos em folha

## 10. Turnover / Desligamentos

Objetivo:
Controlar desligamentos e gerar base para análise de turnover.

Telas necessárias:

* Registro de desligamento
* Pipeline de desligamento
* Histórico de desligamentos
* Motivos de saída
* Resumo de admissões e demissões

Campos principais:

* Colaborador
* Empresa
* Departamento
* Cargo
* Data de admissão
* Data de desligamento
* Tipo de desligamento
* Motivo do desligamento
* Tempo de casa
* Status do desligamento
* Observações

Tipos possíveis:

* Voluntário
* Involuntário
* Término de contrato
* Experiência
* Justa causa
* Sem justa causa

Etapas possíveis:

* Solicitado
* Em cálculo
* Documentação pendente
* Assinatura pendente
* Finalizado
* Cancelado

Ações do usuário:

* Registrar desligamento
* Informar motivo
* Atualizar status do colaborador
* Anexar documentos
* Concluir desligamento
* Gerar necessidade de reposição de vaga

Indicadores futuros:

* Turnover mensal
* Turnover por setor
* Admissões x demissões
* Demissões voluntárias
* Tempo médio de casa
* Motivos de saída

## 11. Escala de Trabalho

Objetivo:
Controlar escalas, turnos, feriados, folgas e cobertura por equipe.

Telas necessárias:

* Cadastro de turnos
* Calendário de escala
* Escala por colaborador
* Escala por setor
* Controle de folgas
* Cadastro de feriados

Campos principais:

* Colaborador
* Departamento
* Turno
* Data
* Horário de início
* Horário de fim
* Folga
* Feriado
* Tipo de escala
* Observações

Status possíveis:

* Planejada
* Confirmada
* Alterada
* Cancelada
* Realizada

Ações do usuário:

* Criar turno
* Montar escala
* Editar escala
* Registrar folga
* Registrar troca de turno
* Marcar feriado
* Validar conflitos

Indicadores futuros:

* Cobertura por turno
* Folgas previstas
* Trabalhos em feriado
* Conflitos de escala
* Colaboradores sem escala

## 12. Treinamentos

Objetivo:
Controlar treinamentos, turmas, participantes, carga horária, presença e reciclagens.

Telas necessárias:

* Catálogo de treinamentos
* Turmas de treinamento
* Participantes
* Histórico de treinamentos do colaborador
* Treinamentos vencidos/a vencer

Campos principais:

* Nome do treinamento
* Descrição
* Carga horária
* Data
* Turno
* Instrutor
* Participantes
* Status do participante
* Validade
* Certificado/anexo
* Observações

Status possíveis:

* Planejado
* Convocado
* Realizado
* Ausente
* Reprovado
* Concluído
* Vencido

Ações do usuário:

* Cadastrar treinamento
* Criar turma
* Vincular participantes
* Registrar presença
* Anexar certificado
* Controlar vencimento
* Consultar histórico

Indicadores futuros:

* Horas treinadas
* Treinamentos realizados
* Treinamentos pendentes
* Participação por setor
* Colaboradores sem treinamento obrigatório
* Treinamentos vencidos

## 13. Desempenho por Competência

Objetivo:
Avaliar colaboradores por competências e acompanhar evolução.

Telas necessárias:

* Cadastro de competências
* Ciclos de avaliação
* Avaliação por colaborador
* Resultado da avaliação
* Plano de desenvolvimento

Campos principais:

* Colaborador
* Cargo
* Departamento
* Competência
* Nota
* Média
* Avaliador
* Data da avaliação
* Observações
* Plano de ação
* Prazo de melhoria

Competências possíveis:

* Liderança
* Comunicação
* Ética
* Negociação
* Adaptabilidade
* Trabalho em equipe
* Organização
* Produtividade
* Conhecimento técnico

Ações do usuário:

* Criar competência
* Criar ciclo de avaliação
* Avaliar colaborador
* Registrar nota
* Registrar observação
* Criar plano de desenvolvimento
* Acompanhar evolução

Indicadores futuros:

* Média por competência
* Média por setor
* Evolução individual
* Gaps por cargo
* Colaboradores abaixo da meta

## 14. Indicadores Estratégicos de RH

Objetivo:
Definir quais dados operacionais devem alimentar dashboards futuros, sem transformar gráficos em telas operacionais desnecessárias.

Indicadores futuros esperados:

* Headcount
* Admissões
* Demissões
* Turnover
* Absenteísmo
* Horas extras
* Custo de folha
* Custo de benefícios
* Férias vencidas
* Férias a vencer
* Treinamentos realizados
* Desempenho médio
* Vagas abertas
* Tempo médio de contratação
* Candidatos por vaga
* Taxa de aprovação
* Taxa de reprovação

Regra:
Esses indicadores devem ser consequência dos dados operacionais lançados nos módulos, e não telas isoladas criadas apenas para gráficos.

Formato esperado da sua resposta:

## 1. Diagnóstico geral

Explique objetivamente como esse levantamento se conecta ao projeto atual.

## 2. Mapa de telas e campos

Monte uma tabela com:

* Módulo
* Tela sugerida
* Campos principais
* Ações principais
* Prioridade
* Observações

## 3. Fluxos operacionais sugeridos

Descreva os fluxos principais:

* Vaga aberta até contratação
* Candidato aprovado virando colaborador
* Colaborador ativo recebendo cargo, salário, jornada e benefícios
* Férias solicitadas até concluídas
* Atestado lançado até fechamento mensal
* Horas extras lançadas até conferência
* Desligamento registrado até turnover
* Treinamento planejado até realizado
* Avaliação de desempenho até plano de desenvolvimento

## 4. Reaproveitamento do que já existe

Liste o que o projeto atual pode reaproveitar, como:

* Cadastro de pessoas
* Cadastro de empresas
* Motor de pipeline
* Timeline/histórico
* Layout autenticado
* Navegação por setores
* Permissões por perfil

## 5. Lacunas funcionais

Liste somente lacunas de produto, tela, campo ou fluxo.

Não liste detalhes de stack ou implementação técnica.

## 6. Priorização sugerida

Separe em:

* P0: obrigatório para iniciar uso real
* P1: importante para operação diária
* P2: importante para gestão
* P3: importante para BI e estratégia

## 7. Decisões pendentes

Liste perguntas objetivas que precisam ser validadas comigo antes de qualquer implementação.

Regras obrigatórias:

* Não implemente código.
* Não altere arquivos.
* Não crie migrations.
* Não altere banco.
* Não altere autenticação.
* Não altere permissões.
* Não mexa em variáveis de ambiente.
* Não refatore o projeto.
* Não presuma regra trabalhista sem validação.
* Não duplique funcionalidades que já existam.
* Não proponha telas apenas porque existe indicador futuro.
* Diferencie tela operacional de dashboard.
* Quando houver dúvida, marque como “validar com usuário”.

Resultado final esperado:

Quero receber uma análise funcional para decidir quais telas, campos e fluxos serão criados primeiro no Connect 41 para Recrutamento, RH e DP.

Após entregar a análise, pare e aguarde minha aprovação antes de qualquer implementação.

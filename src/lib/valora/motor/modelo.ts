// GERADO por valora/consolidacao/exportar_modelo.py — não editar à mão.
// Catálogo modelo da 41: tempos dos questionários (Fiscal e DP, 23/09) com as premissas da
// consolidação. Custos dos setores zerados até a planilha confidencial chegar.

import type { Catalogo } from "./tipos";

export const MODELO_41: Catalogo = {
  "setores": [
    {
      "codigo": "FIS",
      "nome": "Fiscal",
      "capacidadeHorasMes": 1013.7,
      "custoMensal": 0,
      "fatorCalibracao": 0.5317,
      "minutosSemMovimento": 30
    },
    {
      "codigo": "DP",
      "nome": "Departamento Pessoal",
      "capacidadeHorasMes": 489.4,
      "custoMensal": 0,
      "fatorCalibracao": 0.8374
    }
  ],
  "atividades": [
    {
      "id": "FIS-01",
      "setor": "FIS",
      "grupo": "Documentos",
      "nome": "Cobrar e receber documentos e informações do cliente",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 15.0,
        "PRESUMIDO": 15.0,
        "REAL": 15.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-02",
      "setor": "FIS",
      "grupo": "Documentos",
      "nome": "Capturar XMLs de NF-e e CT-e (SEFAZ, portal, robô)",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 15.0,
        "PRESUMIDO": 20.0,
        "REAL": 30.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-03",
      "setor": "FIS",
      "grupo": "Escrituração",
      "nome": "Importar e conferir notas emitidas (NF-e, NFC-e, CT-e)",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 20.0,
        "PRESUMIDO": 30.0,
        "REAL": 45.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-04",
      "setor": "FIS",
      "grupo": "Escrituração",
      "nome": "Importar e conferir notas recebidas (NF-e e CT-e de entrada)",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 20.0,
        "PRESUMIDO": 60.0,
        "REAL": 60.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-05",
      "setor": "FIS",
      "grupo": "Escrituração",
      "nome": "Lançar NFS-e tomadas, com retenções (ISS, IR, PIS/COFINS/CSLL, INSS)",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 15.0,
        "PRESUMIDO": 20.0,
        "REAL": 40.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "tomaServicoComRetencao"
    },
    {
      "id": "FIS-06",
      "setor": "FIS",
      "grupo": "Escrituração",
      "nome": "Lançar ou conferir NFS-e emitidas",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 10.0,
        "PRESUMIDO": 45.0,
        "REAL": 45.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "prestaServico"
    },
    {
      "id": "FIS-07",
      "setor": "FIS",
      "grupo": "Escrituração",
      "nome": "Cadastrar produtos e parametrizar a tributação (NCM, CST, CFOP)",
      "frequencia": "evento",
      "tempoMin": {
        "SIMPLES": 10.0,
        "PRESUMIDO": 30.0,
        "REAL": 30.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 0.7465
      }
    },
    {
      "id": "FIS-08",
      "setor": "FIS",
      "grupo": "Apuração",
      "nome": "Apurar o Simples Nacional (PGDAS-D), com segregação de receitas",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 20.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-09",
      "setor": "FIS",
      "grupo": "Apuração",
      "nome": "Apurar ICMS próprio",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 20.0,
        "PRESUMIDO": 45.0,
        "REAL": 45.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temICMS"
    },
    {
      "id": "FIS-10",
      "setor": "FIS",
      "grupo": "Apuração",
      "nome": "Apurar ICMS-ST, DIFAL e antecipação",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 15.0,
        "PRESUMIDO": 25.0,
        "REAL": 25.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temST"
    },
    {
      "id": "FIS-11",
      "setor": "FIS",
      "grupo": "Apuração",
      "nome": "Apurar IPI (indústria)",
      "frequencia": "mensal",
      "tempoMin": {
        "PRESUMIDO": 20.0,
        "REAL": 20.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temIPI"
    },
    {
      "id": "FIS-12",
      "setor": "FIS",
      "grupo": "Apuração",
      "nome": "Apurar PIS/COFINS (cumulativo ou não cumulativo, com créditos)",
      "frequencia": "mensal",
      "tempoMin": {
        "PRESUMIDO": 60.0,
        "REAL": 60.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-13",
      "setor": "FIS",
      "grupo": "Apuração",
      "nome": "Apurar ISS próprio e retido e entregar a declaração municipal",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 15.0,
        "PRESUMIDO": 20.0,
        "REAL": 20.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "prestaServico"
    },
    {
      "id": "FIS-14",
      "setor": "FIS",
      "grupo": "Apuração",
      "nome": "Apurar IRPJ/CSLL do Lucro Presumido",
      "frequencia": "trimestral",
      "tempoMin": {
        "PRESUMIDO": 60.0,
        "REAL": 60.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-15",
      "setor": "FIS",
      "grupo": "Apuração",
      "nome": "Emitir e enviar as guias ao cliente (DAS, DARF, ICMS, ISS)",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 15.0,
        "SIMPLES": 20.0,
        "PRESUMIDO": 30.0,
        "REAL": 30.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-16",
      "setor": "FIS",
      "grupo": "Obrigações",
      "nome": "EFD ICMS/IPI: gerar, validar e transmitir",
      "frequencia": "mensal",
      "tempoMin": {
        "PRESUMIDO": 45.0,
        "REAL": 60.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temICMS"
    },
    {
      "id": "FIS-17",
      "setor": "FIS",
      "grupo": "Obrigações",
      "nome": "EFD-Contribuições: gerar, validar e transmitir",
      "frequencia": "mensal",
      "tempoMin": {
        "PRESUMIDO": 45.0,
        "REAL": 60.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-18",
      "setor": "FIS",
      "grupo": "Obrigações",
      "nome": "DCTFWeb/MIT dos tributos federais (IRPJ, CSLL, PIS, COFINS, IPI)",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 15.0,
        "PRESUMIDO": 30.0,
        "REAL": 30.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-19",
      "setor": "FIS",
      "grupo": "Obrigações",
      "nome": "EFD-Reinf das retenções sobre serviços tomados",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 20.0,
        "PRESUMIDO": 30.0,
        "REAL": 30.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "tomaServicoComRetencao"
    },
    {
      "id": "FIS-20",
      "setor": "FIS",
      "grupo": "Obrigações",
      "nome": "Declarações estaduais e municipais complementares",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 15.0,
        "PRESUMIDO": 20.0,
        "REAL": 20.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-23",
      "setor": "FIS",
      "grupo": "Acompanhamento",
      "nome": "Monitorar caixas postais e pendências (e-CAC, SEFAZ, prefeitura) e emitir certidões",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 15.0,
        "PRESUMIDO": 15.0,
        "REAL": 15.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-24",
      "setor": "FIS",
      "grupo": "Acompanhamento",
      "nome": "Controlar parcelamentos e emitir as parcelas",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 30.0,
        "PRESUMIDO": 30.0,
        "REAL": 30.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "parcelamentos"
      }
    },
    {
      "id": "FIS-25",
      "setor": "FIS",
      "grupo": "Acompanhamento",
      "nome": "Reforma Tributária: conferir IBS/CBS nas notas e ajustar a parametrização",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 15.0,
        "PRESUMIDO": 15.0,
        "REAL": 15.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-26",
      "setor": "FIS",
      "grupo": "Atendimento",
      "nome": "Atender o cliente (WhatsApp, e-mail, telefone, reunião)",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 15.0,
        "PRESUMIDO": 20.0,
        "REAL": 30.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-27",
      "setor": "FIS",
      "grupo": "Revisão",
      "nome": "Revisar o fechamento (sênior ou coordenação)",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 20.0,
        "PRESUMIDO": 45.0,
        "REAL": 60.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "FIS-28",
      "setor": "FIS",
      "grupo": "Eventual",
      "nome": "Retificar obrigação por informação enviada fora do prazo pelo cliente",
      "frequencia": "evento",
      "tempoMin": {
        "SIMPLES": 30.0,
        "PRESUMIDO": 60.0,
        "REAL": 60.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 0.0392
      }
    },
    {
      "id": "FIS-29",
      "setor": "FIS",
      "grupo": "Eventual",
      "nome": "Responder intimação, malha ou fiscalização",
      "frequencia": "evento",
      "tempoMin": {
        "SIMPLES": 45.0,
        "PRESUMIDO": 60.0,
        "REAL": 60.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 0.0392
      }
    },
    {
      "id": "FIS-30",
      "setor": "FIS",
      "grupo": "Eventual",
      "nome": "Estudo anual do melhor regime tributário",
      "frequencia": "anual",
      "tempoMin": {
        "SIMPLES": 120.0,
        "PRESUMIDO": 120.0,
        "REAL": 120.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 0.0392
      }
    },
    {
      "id": "FIS-31",
      "setor": "FIS",
      "grupo": "Implantação",
      "nome": "Implantar cliente novo (parametrização, saldos credores, histórico, acessos)",
      "frequencia": "evento",
      "tempoMin": {
        "SIMPLES": 120.0,
        "PRESUMIDO": 120.0,
        "REAL": 120.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "implantacao": true
    },
    {
      "id": "FIS-32",
      "setor": "FIS",
      "grupo": "Implantação",
      "nome": "Regularizar competências atrasadas",
      "frequencia": "evento",
      "tempoMin": {
        "SIMPLES": 60.0,
        "PRESUMIDO": 120.0,
        "REAL": 120.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "competenciasAtrasadas"
      },
      "implantacao": true
    },
    {
      "id": "DP-01",
      "setor": "DP",
      "grupo": "Folha",
      "nome": "Cobrar e receber as informações do mês (ponto, variáveis, faltas, comissões)",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 1.0,
        "SIMPLES": 1.0,
        "PRESUMIDO": 1.0,
        "REAL": 1.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temFolha"
    },
    {
      "id": "DP-02",
      "setor": "DP",
      "grupo": "Folha",
      "nome": "Lançar variáveis e calcular a folha",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 20.0,
        "SIMPLES": 20.0,
        "PRESUMIDO": 20.0,
        "REAL": 20.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temFolha"
    },
    {
      "id": "DP-03",
      "setor": "DP",
      "grupo": "Folha",
      "nome": "Calcular o pró-labore dos sócios",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 1.0,
        "SIMPLES": 1.0,
        "PRESUMIDO": 1.0,
        "REAL": 1.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "sociosProLabore"
      }
    },
    {
      "id": "DP-04",
      "setor": "DP",
      "grupo": "Folha",
      "nome": "Tratar ponto eletrônico, horas extras e banco de horas",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 90.0,
        "SIMPLES": 90.0,
        "PRESUMIDO": 90.0,
        "REAL": 90.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temPonto"
    },
    {
      "id": "DP-05",
      "setor": "DP",
      "grupo": "Folha",
      "nome": "Calcular comissões, adicionais e escalas diferenciadas",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 20.0,
        "SIMPLES": 20.0,
        "PRESUMIDO": 20.0,
        "REAL": 20.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temVariaveis"
    },
    {
      "id": "DP-08",
      "setor": "DP",
      "grupo": "Folha",
      "nome": "Conferir a folha e enviar holerites e relatórios ao cliente",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 65.11,
        "SIMPLES": 65.11,
        "PRESUMIDO": 65.11,
        "REAL": 65.11
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temFolha"
    },
    {
      "id": "DP-10",
      "setor": "DP",
      "grupo": "Folha",
      "nome": "RPA de autônomos",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 15.0,
        "SIMPLES": 15.0,
        "PRESUMIDO": 15.0,
        "REAL": 15.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "rpa"
      }
    },
    {
      "id": "DP-11",
      "setor": "DP",
      "grupo": "Folha",
      "nome": "Empregado doméstico (eSocial Doméstico)",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 1.0,
        "SIMPLES": 1.0,
        "PRESUMIDO": 1.0,
        "REAL": 1.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "domesticos"
      }
    },
    {
      "id": "DP-12",
      "setor": "DP",
      "grupo": "Obrigações",
      "nome": "eSocial: eventos periódicos e fechamento",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 20.0,
        "SIMPLES": 20.0,
        "PRESUMIDO": 20.0,
        "REAL": 20.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "semMovimento": true
    },
    {
      "id": "DP-13",
      "setor": "DP",
      "grupo": "Obrigações",
      "nome": "DCTFWeb (INSS e IRRF) e emissão da guia",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 20.0,
        "SIMPLES": 20.0,
        "PRESUMIDO": 20.0,
        "REAL": 20.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "semMovimento": true
    },
    {
      "id": "DP-14",
      "setor": "DP",
      "grupo": "Obrigações",
      "nome": "FGTS Digital: conferir e emitir a guia",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 10.0,
        "SIMPLES": 10.0,
        "PRESUMIDO": 10.0,
        "REAL": 10.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temFolha"
    },
    {
      "id": "DP-15",
      "setor": "DP",
      "grupo": "Obrigações",
      "nome": "Provisões de férias e 13º enviadas ao Contábil",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 12.0,
        "SIMPLES": 12.0,
        "PRESUMIDO": 12.0,
        "REAL": 12.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temFolha"
    },
    {
      "id": "DP-16",
      "setor": "DP",
      "grupo": "Eventos",
      "nome": "Admissão (cadastro, contrato, eSocial)",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 2.0,
        "SIMPLES": 2.0,
        "PRESUMIDO": 2.0,
        "REAL": 2.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "funcionarios",
        "fator": 0.03
      }
    },
    {
      "id": "DP-17",
      "setor": "DP",
      "grupo": "Eventos",
      "nome": "Rescisão (cálculo, TRCT, eSocial, FGTS rescisório)",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 30.0,
        "SIMPLES": 30.0,
        "PRESUMIDO": 30.0,
        "REAL": 30.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "funcionarios",
        "fator": 0.03
      }
    },
    {
      "id": "DP-18",
      "setor": "DP",
      "grupo": "Eventos",
      "nome": "Férias (cálculo, aviso, recibo, eSocial)",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 15.0,
        "SIMPLES": 15.0,
        "PRESUMIDO": 15.0,
        "REAL": 15.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "funcionarios",
        "fator": 0.0833
      }
    },
    {
      "id": "DP-19",
      "setor": "DP",
      "grupo": "Eventos",
      "nome": "Afastamento (doença, maternidade, acidente)",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 5.0,
        "SIMPLES": 5.0,
        "PRESUMIDO": 5.0,
        "REAL": 5.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "funcionarios",
        "fator": 0.01
      }
    },
    {
      "id": "DP-20",
      "setor": "DP",
      "grupo": "Eventos",
      "nome": "Alteração contratual (salário, cargo, jornada)",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 5.0,
        "SIMPLES": 5.0,
        "PRESUMIDO": 5.0,
        "REAL": 5.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "funcionarios",
        "fator": 0.02
      }
    },
    {
      "id": "DP-21",
      "setor": "DP",
      "grupo": "Eventos",
      "nome": "Eventos de saúde e segurança no eSocial (CAT, ASO, condições ambientais)",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 5.0,
        "SIMPLES": 5.0,
        "PRESUMIDO": 5.0,
        "REAL": 5.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "funcionarios",
        "fator": 0.06
      }
    },
    {
      "id": "DP-22",
      "setor": "DP",
      "grupo": "Anual",
      "nome": "13º salário (1ª e 2ª parcelas)",
      "frequencia": "anual",
      "tempoMin": {
        "MEI": 20.0,
        "SIMPLES": 20.0,
        "PRESUMIDO": 20.0,
        "REAL": 20.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temFolha"
    },
    {
      "id": "DP-23",
      "setor": "DP",
      "grupo": "Anual",
      "nome": "Informe de rendimentos (funcionários e sócios)",
      "frequencia": "anual",
      "tempoMin": {
        "MEI": 25.03,
        "SIMPLES": 25.03,
        "PRESUMIDO": 25.03,
        "REAL": 25.03
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "funcionarios"
      }
    },
    {
      "id": "DP-24",
      "setor": "DP",
      "grupo": "Anual",
      "nome": "Reajuste da convenção coletiva (pisos, retroativo, contribuições)",
      "frequencia": "anual",
      "tempoMin": {
        "MEI": 45,
        "SIMPLES": 45,
        "PRESUMIDO": 45,
        "REAL": 45
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temFolha"
    },
    {
      "id": "DP-25",
      "setor": "DP",
      "grupo": "Atendimento",
      "nome": "Atender o cliente e os funcionários dele (holerite, férias, dúvidas)",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 20,
        "SIMPLES": 20,
        "PRESUMIDO": 20,
        "REAL": 20
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "DP-26",
      "setor": "DP",
      "grupo": "Revisão",
      "nome": "Revisar a folha (sênior ou coordenação)",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 30.0,
        "SIMPLES": 30.0,
        "PRESUMIDO": 30.0,
        "REAL": 30.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temFolha"
    },
    {
      "id": "DP-29",
      "setor": "DP",
      "grupo": "Implantação",
      "nome": "Implantar cliente novo (cadastro da empresa, sindicato, eSocial)",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 45.0,
        "SIMPLES": 45.0,
        "PRESUMIDO": 45.0,
        "REAL": 45.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "implantacao": true
    }
  ],
  "complexidades": [
    {
      "id": "FIS-C01",
      "setor": "FIS",
      "nome": "Cliente envia documentos ou informações fora do prazo",
      "pct": 20.0
    },
    {
      "id": "FIS-C02",
      "setor": "FIS",
      "nome": "Documentos desorganizados, incompletos, em papel ou foto",
      "pct": 30.0
    },
    {
      "id": "FIS-C03",
      "setor": "FIS",
      "nome": "Cliente pede muito atendimento (dúvidas, ligações, reuniões)",
      "pct": 60.0
    },
    {
      "id": "FIS-C04",
      "setor": "FIS",
      "nome": "Cliente com várias empresas ou filiais no mesmo grupo",
      "pct": 60.0
    },
    {
      "id": "FIS-C05",
      "setor": "FIS",
      "nome": "Períodos anteriores atrasados ou com erros herdados de outro contador",
      "pct": 120.0
    },
    {
      "id": "FIS-C06",
      "setor": "FIS",
      "nome": "Operações interestaduais frequentes",
      "pct": 120.0
    },
    {
      "id": "FIS-C07",
      "setor": "FIS",
      "nome": "Importação ou exportação",
      "pct": 30.0
    },
    {
      "id": "FIS-C08",
      "setor": "FIS",
      "nome": "Benefício ou incentivo fiscal (regime especial, crédito presumido)",
      "pct": 45.0
    },
    {
      "id": "FIS-C09",
      "setor": "FIS",
      "nome": "E-commerce ou marketplace (muitas devoluções, vários canais)",
      "pct": 120.0
    },
    {
      "id": "FIS-C10",
      "setor": "FIS",
      "nome": "ISS em mais de um município",
      "pct": 120.0
    },
    {
      "id": "FIS-C11",
      "setor": "FIS",
      "nome": "Cliente muda com frequência o cadastro de produtos ou a tributação",
      "pct": 60.0
    },
    {
      "id": "FIS-C12",
      "setor": "FIS",
      "nome": "recalculos",
      "pct": 60.0
    },
    {
      "id": "DP-C02",
      "setor": "DP",
      "nome": "Documentos desorganizados, incompletos, em papel ou foto",
      "pct": 10.0
    },
    {
      "id": "DP-C03",
      "setor": "DP",
      "nome": "Cliente pede muito atendimento (dúvidas, ligações, reuniões)",
      "pct": 30.0
    },
    {
      "id": "DP-C04",
      "setor": "DP",
      "nome": "Cliente com várias empresas ou filiais no mesmo grupo",
      "pct": 5.0
    },
    {
      "id": "DP-C05",
      "setor": "DP",
      "nome": "Períodos anteriores atrasados ou com erros herdados de outro contador",
      "pct": 1.0
    }
  ],
  "campos": [
    {
      "tipo": "volume",
      "chave": "funcionarios",
      "rotulo": "Funcionários registrados",
      "ajuda": "Somando todas as filiais."
    },
    {
      "tipo": "volume",
      "chave": "sociosProLabore",
      "rotulo": "Sócios com pró-labore"
    },
    {
      "tipo": "volume",
      "chave": "rpa",
      "rotulo": "Autônomos pagos por RPA no mês"
    },
    {
      "tipo": "volume",
      "chave": "domesticos",
      "rotulo": "Empregados domésticos"
    },
    {
      "tipo": "volume",
      "chave": "parcelamentos",
      "rotulo": "Parcelamentos de tributos ativos",
      "ajuda": "Federal, estadual e municipal."
    },
    {
      "tipo": "volume",
      "chave": "competenciasAtrasadas",
      "rotulo": "Meses em atraso para regularizar",
      "ajuda": "Cobrado na implantação."
    },
    {
      "tipo": "marcador",
      "chave": "temICMS",
      "rotulo": "Vende mercadoria (tem ICMS)",
      "ajuda": "Comércio ou indústria."
    },
    {
      "tipo": "marcador",
      "chave": "temST",
      "rotulo": "Tem ICMS-ST, DIFAL ou antecipação",
      "ajuda": "Compra de outro estado ou produto com ST."
    },
    {
      "tipo": "marcador",
      "chave": "temIPI",
      "rotulo": "É indústria (tem IPI)"
    },
    {
      "tipo": "marcador",
      "chave": "prestaServico",
      "rotulo": "Presta serviço (emite NFS-e)"
    },
    {
      "tipo": "marcador",
      "chave": "tomaServicoComRetencao",
      "rotulo": "Contrata serviço com retenção",
      "ajuda": "ISS, IR, PIS/COFINS/CSLL ou INSS retidos."
    },
    {
      "tipo": "marcador",
      "chave": "temPonto",
      "rotulo": "O DP trata o ponto (horas extras, banco de horas)"
    },
    {
      "tipo": "marcador",
      "chave": "temVariaveis",
      "rotulo": "Folha com comissões, adicionais ou escalas"
    }
  ]
};

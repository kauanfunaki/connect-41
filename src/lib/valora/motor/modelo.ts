// GERADO por valora/consolidacao/exportar_modelo.py — não editar à mão.
// Catálogo modelo da 41: tempos dos questionários (Fiscal e DP, 23/09; Societário, 24/09; Contábil, 25/09) com as premissas da
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
    },
    {
      "codigo": "SOC",
      "nome": "Societário",
      "capacidadeHorasMes": 436.9,
      "custoMensal": 0,
      "fatorCalibracao": 0.9759
    },
    {
      "codigo": "CTB",
      "nome": "Contábil",
      "capacidadeHorasMes": 1354.5,
      "custoMensal": 0,
      "fatorCalibracao": 0.2938,
      "minutosSemMovimento": 50
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
    },
    {
      "id": "SOC-01",
      "setor": "SOC",
      "grupo": "Acompanhamento",
      "nome": "Controlar vencimentos de alvarás, licenças e certificados digitais",
      "frequencia": "anual",
      "tempoMin": {
        "MEI": 90.0,
        "SIMPLES": 90.0,
        "PRESUMIDO": 90.0,
        "REAL": 90.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "licencas"
      },
      "semMovimento": true
    },
    {
      "id": "SOC-02",
      "setor": "SOC",
      "grupo": "Acompanhamento",
      "nome": "Renovar alvará ou licença de funcionamento",
      "frequencia": "anual",
      "tempoMin": {
        "MEI": 90.0,
        "SIMPLES": 90.0,
        "PRESUMIDO": 90.0,
        "REAL": 90.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "licencas"
      },
      "semMovimento": true
    },
    {
      "id": "SOC-04",
      "setor": "SOC",
      "grupo": "Acompanhamento",
      "nome": "Emitir certidões (CND, certidão simplificada da Junta)",
      "frequencia": "trimestral",
      "tempoMin": {
        "MEI": 25.0,
        "SIMPLES": 25.0,
        "PRESUMIDO": 25.0,
        "REAL": 25.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "semMovimento": true
    },
    {
      "id": "SOC-05",
      "setor": "SOC",
      "grupo": "Acompanhamento",
      "nome": "Atualizar cadastros (Receita, SEFAZ, prefeitura)",
      "frequencia": "mensal",
      "tempoMin": {
        "MEI": 50.0,
        "SIMPLES": 50.0,
        "PRESUMIDO": 50.0,
        "REAL": 50.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 0.05
      }
    },
    {
      "id": "SOC-06",
      "setor": "SOC",
      "grupo": "Atendimento",
      "nome": "Atender o cliente (WhatsApp, e-mail, telefone, reunião)",
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
      }
    },
    {
      "id": "SOC-07",
      "setor": "SOC",
      "grupo": "Processos",
      "nome": "Abrir empresa (viabilidade, DBE, contrato, Junta, inscrições, alvará)",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 180,
        "SIMPLES": 180,
        "PRESUMIDO": 180,
        "REAL": 180
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "avulso": true
    },
    {
      "id": "SOC-08",
      "setor": "SOC",
      "grupo": "Processos",
      "nome": "Abrir MEI",
      "frequencia": "evento",
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
      "avulso": true
    },
    {
      "id": "SOC-09",
      "setor": "SOC",
      "grupo": "Processos",
      "nome": "Abrir filial",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 300,
        "SIMPLES": 300,
        "PRESUMIDO": 300,
        "REAL": 300
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "avulso": true
    },
    {
      "id": "SOC-10",
      "setor": "SOC",
      "grupo": "Processos",
      "nome": "Alteração contratual (endereço, sócios, capital, atividade)",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 210,
        "SIMPLES": 210,
        "PRESUMIDO": 210,
        "REAL": 210
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "avulso": true
    },
    {
      "id": "SOC-11",
      "setor": "SOC",
      "grupo": "Processos",
      "nome": "Transformação de tipo jurídico ou desenquadramento (ME/EPP)",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 210,
        "SIMPLES": 210,
        "PRESUMIDO": 210,
        "REAL": 210
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "avulso": true
    },
    {
      "id": "SOC-12",
      "setor": "SOC",
      "grupo": "Processos",
      "nome": "Baixar ou encerrar empresa",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 140,
        "SIMPLES": 140,
        "PRESUMIDO": 140,
        "REAL": 140
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "avulso": true
    },
    {
      "id": "SOC-13",
      "setor": "SOC",
      "grupo": "Processos",
      "nome": "Licenças específicas (Vigilância Sanitária, Bombeiros, ambiental)",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 32,
        "SIMPLES": 32,
        "PRESUMIDO": 32,
        "REAL": 32
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "avulso": true
    },
    {
      "id": "SOC-14",
      "setor": "SOC",
      "grupo": "Processos",
      "nome": "Atas, reuniões de sócios e registros de holding",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 90,
        "SIMPLES": 90,
        "PRESUMIDO": 90,
        "REAL": 90
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "avulso": true
    },
    {
      "id": "SOC-15",
      "setor": "SOC",
      "grupo": "Implantação",
      "nome": "Receber cliente vindo de outro escritório (procurações, acessos, documentos)",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 120.0,
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
      "id": "SOC-17",
      "setor": "SOC",
      "grupo": "Eventual",
      "nome": "Refazer processo por exigência ou indeferimento (Junta, prefeitura)",
      "frequencia": "evento",
      "tempoMin": {
        "MEI": 90,
        "SIMPLES": 90,
        "PRESUMIDO": 90,
        "REAL": 90
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "avulso": true
    },
    {
      "id": "SOC-P01",
      "setor": "SOC",
      "grupo": "Premissa",
      "nome": "Declaração anual do MEI (DASN-SIMEI)",
      "frequencia": "anual",
      "tempoMin": {
        "MEI": 15
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "semMovimento": true
    },
    {
      "id": "CTB-01",
      "setor": "CTB",
      "grupo": "Documentos",
      "nome": "Cobrar e receber extratos, comprovantes e relatórios do cliente",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 60.0,
        "PRESUMIDO": 240.0,
        "REAL": 240.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "CTB-02",
      "setor": "CTB",
      "grupo": "Lançamentos",
      "nome": "Importar extratos bancários e de cartão (OFX, planilha)",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 20.0,
        "PRESUMIDO": 20.0,
        "REAL": 20.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "contasBancarias"
      }
    },
    {
      "id": "CTB-03",
      "setor": "CTB",
      "grupo": "Lançamentos",
      "nome": "Classificar e lançar as movimentações bancárias",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 600.0,
        "PRESUMIDO": 960.0,
        "REAL": 720.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "movimentacoesBancarias",
        "fator": 0.0067
      }
    },
    {
      "id": "CTB-04",
      "setor": "CTB",
      "grupo": "Lançamentos",
      "nome": "Conciliar a conta bancária ou cartão e fechar o saldo",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 30.0,
        "PRESUMIDO": 30.0,
        "REAL": 30.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "contasBancarias"
      }
    },
    {
      "id": "CTB-05",
      "setor": "CTB",
      "grupo": "Lançamentos",
      "nome": "Integrar os módulos fiscal e folha na contabilidade e conferir",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 120.0,
        "PRESUMIDO": 120.0,
        "REAL": 120.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "CTB-06",
      "setor": "CTB",
      "grupo": "Lançamentos",
      "nome": "Lançamentos manuais (provisões, apropriações, depreciação)",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 60.0,
        "PRESUMIDO": 60.0,
        "REAL": 60.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "CTB-07",
      "setor": "CTB",
      "grupo": "Lançamentos",
      "nome": "Controlar empréstimos, financiamentos e aplicações",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 40.0,
        "PRESUMIDO": 40.0,
        "REAL": 40.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "contratosFinanceiros"
      }
    },
    {
      "id": "CTB-08",
      "setor": "CTB",
      "grupo": "Lançamentos",
      "nome": "Controlar o imobilizado e a depreciação",
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
      "id": "CTB-09",
      "setor": "CTB",
      "grupo": "Lançamentos",
      "nome": "Controlar estoque e custo (CMV)",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 10.0,
        "PRESUMIDO": 10.0,
        "REAL": 10.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "condicao": "temICMS"
    },
    {
      "id": "CTB-10",
      "setor": "CTB",
      "grupo": "Lançamentos",
      "nome": "Lançar operações entre empresas do mesmo grupo",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 5.0,
        "PRESUMIDO": 5.0,
        "REAL": 5.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "CTB-11",
      "setor": "CTB",
      "grupo": "Fechamento",
      "nome": "Conciliar contas patrimoniais (clientes, fornecedores, impostos, adiantamentos)",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 80.0,
        "PRESUMIDO": 320.0,
        "REAL": 960.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "CTB-12",
      "setor": "CTB",
      "grupo": "Fechamento",
      "nome": "Fechar o mês: balancete e análise de contas",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 80.0,
        "PRESUMIDO": 320.0,
        "REAL": 960.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "CTB-13",
      "setor": "CTB",
      "grupo": "Fechamento",
      "nome": "Apurar IRPJ/CSLL do Lucro Real (LALUR/LACS, estimativas, suspensão)",
      "frequencia": "trimestral",
      "tempoMin": {
        "REAL": 120.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "CTB-14",
      "setor": "CTB",
      "grupo": "Fechamento",
      "nome": "Controlar a distribuição de lucros",
      "frequencia": "anual",
      "tempoMin": {
        "SIMPLES": 60.0,
        "PRESUMIDO": 60.0,
        "REAL": 60.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "socios"
      }
    },
    {
      "id": "CTB-16",
      "setor": "CTB",
      "grupo": "Relatórios",
      "nome": "Preparar relatórios gerenciais (DRE, fluxo de caixa, indicadores)",
      "frequencia": "anual",
      "tempoMin": {
        "SIMPLES": 30.0,
        "PRESUMIDO": 120.0,
        "REAL": 120.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "CTB-17",
      "setor": "CTB",
      "grupo": "Relatórios",
      "nome": "Reunião de resultados com o cliente",
      "frequencia": "evento",
      "tempoMin": {
        "SIMPLES": 40.0,
        "PRESUMIDO": 40.0,
        "REAL": 40.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "avulso": true
    },
    {
      "id": "CTB-18",
      "setor": "CTB",
      "grupo": "Atendimento",
      "nome": "Atender o cliente (WhatsApp, e-mail, telefone, reunião)",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 15.0,
        "PRESUMIDO": 20.0,
        "REAL": 60.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "CTB-19",
      "setor": "CTB",
      "grupo": "Revisão",
      "nome": "Revisar o fechamento (sênior ou coordenação)",
      "frequencia": "mensal",
      "tempoMin": {
        "SIMPLES": 25.0,
        "PRESUMIDO": 160.0,
        "REAL": 480.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "CTB-20",
      "setor": "CTB",
      "grupo": "Anual",
      "nome": "Encerrar o exercício: balanço, DRE e demais demonstrações",
      "frequencia": "anual",
      "tempoMin": {
        "SIMPLES": 60.0,
        "PRESUMIDO": 60.0,
        "REAL": 60.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      }
    },
    {
      "id": "CTB-21",
      "setor": "CTB",
      "grupo": "Anual",
      "nome": "ECD: gerar, validar e transmitir",
      "frequencia": "anual",
      "tempoMin": {
        "SIMPLES": 90.0,
        "PRESUMIDO": 90.0,
        "REAL": 90.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "semMovimento": true
    },
    {
      "id": "CTB-22",
      "setor": "CTB",
      "grupo": "Anual",
      "nome": "ECF: gerar, validar e transmitir",
      "frequencia": "anual",
      "tempoMin": {
        "SIMPLES": 60.0,
        "PRESUMIDO": 60.0,
        "REAL": 60.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "semMovimento": true
    },
    {
      "id": "CTB-23",
      "setor": "CTB",
      "grupo": "Anual",
      "nome": "Informe de rendimentos de lucros aos sócios",
      "frequencia": "anual",
      "tempoMin": {
        "SIMPLES": 15.0,
        "PRESUMIDO": 15.0,
        "REAL": 15.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "socios"
      }
    },
    {
      "id": "CTB-24",
      "setor": "CTB",
      "grupo": "Eventual",
      "nome": "DECORE, declaração de faturamento ou relatório para banco",
      "frequencia": "evento",
      "tempoMin": {
        "SIMPLES": 20.0,
        "PRESUMIDO": 40.0,
        "REAL": 40.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "avulso": true
    },
    {
      "id": "CTB-25",
      "setor": "CTB",
      "grupo": "Eventual",
      "nome": "Refazer lançamentos por documento enviado fora do prazo",
      "frequencia": "evento",
      "tempoMin": {
        "SIMPLES": 15.0,
        "PRESUMIDO": 15.0,
        "REAL": 15.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "avulso": true
    },
    {
      "id": "CTB-27",
      "setor": "CTB",
      "grupo": "Implantação",
      "nome": "Implantar cliente novo (saldos iniciais, plano de contas, acessos)",
      "frequencia": "evento",
      "tempoMin": {
        "SIMPLES": 60.0,
        "PRESUMIDO": 60.0,
        "REAL": 60.0
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "implantacao": true
    },
    {
      "id": "CTB-28",
      "setor": "CTB",
      "grupo": "Implantação",
      "nome": "Regularizar contabilidade atrasada",
      "frequencia": "evento",
      "tempoMin": {
        "SIMPLES": 4800.0,
        "PRESUMIDO": 4800.0,
        "REAL": 4800.0
      },
      "quantidade": {
        "tipo": "volume",
        "campo": "competenciasAtrasadas"
      },
      "implantacao": true
    },
    {
      "id": "CTB-P01",
      "setor": "CTB",
      "grupo": "Premissa",
      "nome": "DEFIS: declaração anual do Simples",
      "frequencia": "anual",
      "tempoMin": {
        "SIMPLES": 30
      },
      "quantidade": {
        "tipo": "fixa",
        "valor": 1
      },
      "semMovimento": true
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
    },
    {
      "id": "SOC-C01",
      "setor": "SOC",
      "nome": "Cliente envia documentos ou informações fora do prazo",
      "pct": 30.0
    },
    {
      "id": "SOC-C02",
      "setor": "SOC",
      "nome": "Documentos desorganizados, incompletos, em papel ou foto",
      "pct": 15.0
    },
    {
      "id": "SOC-C03",
      "setor": "SOC",
      "nome": "Cliente pede muito atendimento (dúvidas, ligações, reuniões)",
      "pct": 13.0
    },
    {
      "id": "SOC-C04",
      "setor": "SOC",
      "nome": "Cliente com várias empresas ou filiais no mesmo grupo",
      "pct": 15.0
    },
    {
      "id": "SOC-C05",
      "setor": "SOC",
      "nome": "Períodos anteriores atrasados ou com erros herdados de outro contador",
      "pct": 10.0
    },
    {
      "id": "SOC-C06",
      "setor": "SOC",
      "nome": "Sociedade com muitos sócios ou sócios com outras empresas",
      "pct": 5.0
    },
    {
      "id": "SOC-C07",
      "setor": "SOC",
      "nome": "Holding ou grupo com várias empresas",
      "pct": 2.0
    },
    {
      "id": "SOC-C08",
      "setor": "SOC",
      "nome": "Atividade que exige licenças especiais (saúde, alimentos, ambiental)",
      "pct": 50.0
    },
    {
      "id": "SOC-C09",
      "setor": "SOC",
      "nome": "Município com processo não integrado à Junta Comercial",
      "pct": 50.0
    },
    {
      "id": "CTB-C01",
      "setor": "CTB",
      "nome": "Cliente envia documentos ou informações fora do prazo",
      "pct": 40.0
    },
    {
      "id": "CTB-C02",
      "setor": "CTB",
      "nome": "Documentos desorganizados, incompletos, em papel ou foto",
      "pct": 100.0
    },
    {
      "id": "CTB-C03",
      "setor": "CTB",
      "nome": "Cliente pede muito atendimento (dúvidas, ligações, reuniões)",
      "pct": 20.0
    },
    {
      "id": "CTB-C04",
      "setor": "CTB",
      "nome": "Cliente com várias empresas ou filiais no mesmo grupo",
      "pct": 30.0
    },
    {
      "id": "CTB-C05",
      "setor": "CTB",
      "nome": "Períodos anteriores atrasados ou com erros herdados de outro contador",
      "pct": 100.0
    },
    {
      "id": "CTB-C07",
      "setor": "CTB",
      "nome": "Indústria com apuração de custos",
      "pct": 5.0
    },
    {
      "id": "CTB-C08",
      "setor": "CTB",
      "nome": "Contabilidade exigida em padrão completo (auditoria, investidores)",
      "pct": 80.0
    },
    {
      "id": "CTB-C09",
      "setor": "CTB",
      "nome": "Cliente sem controle financeiro próprio (tudo sai do extrato)",
      "pct": 60.0
    },
    {
      "id": "CTB-C10",
      "setor": "CTB",
      "nome": "Muitos cartões, maquininhas ou meios de pagamento",
      "pct": 30.0
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
    },
    {
      "tipo": "volume",
      "chave": "licencas",
      "rotulo": "Alvarás e licenças que a empresa mantém",
      "ajuda": "Prefeitura, Bombeiros, Vigilância Sanitária, ambiental — cada uma renova uma vez por ano."
    },
    {
      "tipo": "volume",
      "chave": "contasBancarias",
      "rotulo": "Contas bancárias e cartões",
      "ajuda": "Cada conta e cada cartão empresarial."
    },
    {
      "tipo": "volume",
      "chave": "movimentacoesBancarias",
      "rotulo": "Movimentações bancárias por mês",
      "ajuda": "Somando todas as contas. Uma estimativa serve."
    },
    {
      "tipo": "volume",
      "chave": "contratosFinanceiros",
      "rotulo": "Empréstimos, financiamentos e aplicações",
      "ajuda": "Contratos ativos."
    },
    {
      "tipo": "volume",
      "chave": "socios",
      "rotulo": "Sócios",
      "ajuda": "Todos, com ou sem pró-labore."
    }
  ]
};

import { describe, expect, it } from 'vitest';
import {
  normalizarNomeEmpresa, normalizarNomePasta, REGEX_SUBPASTA_CONTRATO_PADRAO,
  semAcentoMaiusculo, similaridade,
} from './auditNormalizacao';

const regex = new RegExp(REGEX_SUBPASTA_CONTRATO_PADRAO);
const ehSubpastaDeContrato = (nome: string) => regex.test(semAcentoMaiusculo(nome));

describe('regex padrão da subpasta do contrato', () => {
  // As grafias encontradas em J:\ no levantamento de 01/10/2026.
  it.each([
    'CONTRATO DE PRESTAÇÃO DE SERVIÇOS',
    'CONTRATO DE SERVIÇOS',
    'CONTRATO PRESTAÇÃO DE SERVIÇOS',
    'CONTRATO DE PRESTAÇÃO DE SERVIÇO',
    'CONTRATO PRESTAÇÃO DE SERVIÇO',
    'CONTRATO SERVIÇOS',
    'CONTRATO P SERVIÇOS',
    'CONTRATO DE SERVIÇO',
    'CONTRATO PRESTAÇÃO SERVIÇOS',
    'CONTRATO DE PRESTAÇÃO',
    'CONTRATO DE HONORARIOS',
    'CONTRATO DE HONORÁRIOS',
    'CONTRATO DE SERVIÇOS INOVAXI',
    'CONTRATO DE SERVIÇOS RQS',
    'CONTRATOS DE SERVIÇOS',
    'CONTRATO DE PRESTAÇÃAO DE SERVIÇO',
    'CONTRATO DE PRESTAÇÃO DE SERVIÇOS CONTÁBEIS',
    'CONTRATO PRESTAÇAÕDE SERVIÇO',
    'CONTRATO P SERVIÇOS - BLINDAGEM',
    'CONTRATO PREST SERVIÇOS',
    'contrato de prestação de serviços',
    // Distrato (02/10/2026): as grafias achadas na rede.
    'DISTRATO DE PRESTAÇÃO DE SERVIÇOS',
    'DISTRATO PRESTAÇÃO DE SERVIÇOS',
    'DISTRATO PRESTAÇÃO SERVIÇOS CONTABEIS',
    'DISTRATO DE PRESTAÇÃO DE SERVIÇOS CONTABEIS',
    'DISTRATO BPO',
    'DISTRATO SOCIAL',
    'DISTRATO',
  ])('aceita "%s"', (nome) => {
    expect(ehSubpastaDeContrato(nome)).toBe(true);
  });

  // Casam com "CONTRAT" mas não são o contrato com a 41.
  it.each([
    'CONTRATO DE ALUGUEL',
    'CONTRATOS LOCAÇÃO',
    'CONTRATO COWORKING',
    'ALTERAÇAO CONTRATUAL',
    'MODELO CONTRATO SERVIÇOS',
    'CONTRATOS',
    'FISCAL',
  ])('recusa "%s"', (nome) => {
    expect(ehSubpastaDeContrato(nome)).toBe(false);
  });
});

describe('semAcentoMaiusculo', () => {
  it('tira acento, põe em maiúsculo e colapsa espaços, mantendo pontuação', () => {
    expect(semAcentoMaiusculo('  Ação  &  Cia. ')).toBe('ACAO & CIA.');
  });

  it('trata acento composto (NFD) igual ao pré-composto (NFC)', () => {
    expect(semAcentoMaiusculo('LOGI\u0301STICA')).toBe(semAcentoMaiusculo('LOGÍSTICA'));
  });
});

describe('normalizarNomePasta', () => {
  it('mantém caixa e acento, só unifica para NFC e tira espaço das pontas', () => {
    expect(normalizarNomePasta(' XPT LOGI\u0301STICA LTDA ')).toBe('XPT LOGÍSTICA LTDA');
  });
});

describe('normalizarNomeEmpresa', () => {
  it.each([
    ['BRIOFLEX LTDA', 'BRIOFLEX'],
    ['D&B CONSTRUTORA LTDA', 'D E B CONSTRUTORA'],
    ['D E B CONSTRUTORA LTDA', 'D E B CONSTRUTORA'],
    ['KW EXPRESS LOGISTICA (antiga MESTRE LUC BARBEARIA LTDA)', 'KW EXPRESS LOGISTICA'],
    ['LUNA SUSHI LTDA - (Antiga Alexandro)', 'LUNA SUSHI'],
    ['FERTLAB LTDA (antiga MEXILOG', 'FERTLAB'],
    ['XPT LOGÍSTICA LTDA - 12 FILIAL - CURITIBA-PR', 'XPT LOGISTICA 12 FILIAL CURITIBA PR'],
    ['COMÉRCIO DE PEÇAS S/A', 'COMERCIO DE PECAS'],
    ['EMPRESA EXEMPLO EIRELI - EPP', 'EMPRESA EXEMPLO'],
  ])('"%s" → "%s"', (entrada, esperado) => {
    expect(normalizarNomeEmpresa(entrada)).toBe(esperado);
  });

  it('empata pasta e razão social que só diferem em acento e sufixo', () => {
    expect(normalizarNomeEmpresa('ASSESSORIAL COMÉRCIO DE MATERIAIS LTDA'))
      .toBe(normalizarNomeEmpresa('ASSESSORIAL COMERCIO DE MATERIAIS'));
  });
});

describe('similaridade', () => {
  it('é 1 para nomes iguais e 0 para vazio', () => {
    expect(similaridade('BRIOFLEX', 'BRIOFLEX')).toBe(1);
    expect(similaridade('', '')).toBe(0);
    expect(similaridade('A', 'BRIOFLEX')).toBe(0);
  });

  it('é alta para erro de digitação', () => {
    const a = normalizarNomeEmpresa('ASSESSORIAL COMÉRCIO DE MATERIAS PARA ACABAMENTO LTDA');
    const b = normalizarNomeEmpresa('ASSESSORIAL COMERCIO DE MATERIAIS PARA ACABAMENTOS LTDA');
    expect(similaridade(a, b)).toBeGreaterThan(0.9);
  });

  it('também é alta para empresas DIFERENTES — por isso só sugere, nunca vincula sozinha', () => {
    const a = normalizarNomeEmpresa('VIV TRANSPORTES RODOVIARIOS DE CARGAS LTDA');
    const b = normalizarNomeEmpresa('TRANSVIV TRANSPORTES RODOVIÁRIOS DE CARGAS LTDA');
    expect(similaridade(a, b)).toBeGreaterThan(0.85);
  });

  it('é baixa para nomes sem relação', () => {
    expect(similaridade('BRIOFLEX', 'CARVONE TRANSPORTES')).toBeLessThan(0.3);
  });
});

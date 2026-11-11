import { describe, expect, it } from 'vitest';
import {
  classificarAditivo, palavras, pareceAditivo,
  type ArquivoParaClassificar,
} from './auditAditivosClassificador';

// Nomes reais do levantamento de 01/10/2026 na pasta de rede.
const SUB = 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS';

function arq(caminho: string, extra: Partial<ArquivoParaClassificar> = {}): ArquivoParaClassificar {
  const nome = caminho.split('/').pop()!;
  const ext  = nome.includes('.') ? nome.slice(nome.lastIndexOf('.')).toLowerCase() : '';
  return {
    nome,
    caminhoRelativo: `${SUB}/${caminho}`,
    ext,
    modificadoEm:    new Date('2026-03-24T13:56:43Z'),
    pdfAssinado:     ext === '.pdf' ? false : null,
    pdfMarca:        null,
    ...extra,
  };
}

const c = (caminho: string, extra?: Partial<ArquivoParaClassificar>) => classificarAditivo(arq(caminho, extra));

describe('palavras', () => {
  it('separa no sublinhado e tira acento', () => {
    expect(palavras('ADITIVO_ASSINADO')).toEqual(['ADITIVO', 'ASSINADO']);
    expect(palavras('Termo Aditivo 13º - A&Z')).toEqual(['TERMO', 'ADITIVO', '13º', 'A', 'Z']);
  });
});

describe('pareceAditivo', () => {
  it.each(['ADITIVO', 'ADITIVOS', 'ADTIVO', 'ADIVITO', 'ADITVO', 'ADITAMENTO'])('aceita %s', (p) => {
    expect(pareceAditivo(p)).toBe(true);
  });

  it.each(['ADICIONAL', 'ADMINISTRATIVO', 'ATIVOS', 'ADVOGADO', 'AD', 'TERMO'])('recusa %s', (p) => {
    expect(pareceAditivo(p)).toBe(false);
  });
});

describe('classificarAditivo — é aditivo?', () => {
  it.each([
    'BRIOFLEX LTDA - Termo Aditivo.docx',
    'BUNGA PET COM ATACADISTA LTDA - Termo Aditivo.pdf',
    'TERMO ADITIVO - BIOVEXARE THERAPEUTIC.docx',
    'Termo_Aditivo_K_L_FARMACIA_E_COSMETICOS_LTDA_51783920000164.docx',
    'ADITIVO_ASSINADO.pdf',
    'OTAVIO B. MATOS - Aditivo Contrato de Prestação de Serviço.pdf',
    // erros de digitação reais
    'RAFAEL ELIODÓRIO MATOS - Termo Adtivo.pdf',
    'ESCORIAN ASSESSORIA E CONSULTORIA - Termo Adivito.docx',
    'HR REPRESENTAÇÃO - TERMO ADITVO.pdf',
    'FAVV AMBIENTAL - Termpo Aditivo .pdf',
  ])('sim: "%s"', (caminho) => {
    expect(c(caminho).ehAditivo).toBe(true);
  });

  it.each([
    'TUP GESSOS INDUSTRIA - Termo de Transferência de Contador Assinado.pdf',
    'TERMO DE CONFIDENCIALIDADE.pdf',
    'Contrato de Prestação de Serviços - 2025.docx',
    'IZU IMÓVEIS - Contrato de Prestação de Serviços.docx',
    'TABELA ADICIONAL.XLSX',
    'BOLETO HONORÁRIOS.pdf',
  ])('não: "%s"', (caminho) => {
    expect(c(caminho).ehAditivo).toBe(false);
  });

  it('modelo nunca é aditivo de cliente — no nome ou na pasta', () => {
    expect(c('MODELO TERMO ADITIVO.docx')).toMatchObject({ ehAditivo: false, modelo: true });
    expect(c('MODELO/TERMO ADITIVO 13º - ANA LUCIA DE SEVA ROBVERT.docx')).toMatchObject({ ehAditivo: false, modelo: true });
    expect(c('BRIOFLEX LTDA - Termo Aditivo.docx').modelo).toBe(false);
  });
});

describe('classificarAditivo — 13º e honorário', () => {
  it.each([
    'Termo Aditivo 13º - A&Z TRANSPORTES E LOGISTICA.pdf',
    'Termo Aditivo 13.docx',
    'Termo Aditivo 13º/MQH BRASIL - Termo Aditivo.pdf',
    'Termo 13º/TERMO ADITIVO - AQX TRANSPORTES.pdf',
  ])('é 13º: "%s"', (caminho) => {
    expect(c(caminho).decimoTerceiro).toBe(true);
  });

  it('"FILIAL 13" não é 13º', () => {
    expect(c('XPT LOGISTICA FILIAL 13 - Termo Aditivo Ass.pdf').decimoTerceiro).toBe(false);
  });

  it('pode ser 13º e honorário ao mesmo tempo', () => {
    expect(c('AQAF TRANSPORTES -Termo Aditivo 13º e Honorario.pdf'))
      .toMatchObject({ ehAditivo: true, decimoTerceiro: true, honorario: true });
    expect(c('MQS REPRESENTAÇÃO - Termo Aditivo Honorário.docx'))
      .toMatchObject({ decimoTerceiro: false, honorario: true });
  });
});

describe('classificarAditivo — formato e assinatura', () => {
  it('Word é rascunho: assinatura não se aplica, mesmo com "assinado" no nome', () => {
    expect(c('BRIOFLEX LTDA - Termo Aditivo.docx')).toMatchObject({ formato: 'word', assinatura: 'nao_se_aplica' });
    expect(c('X - Termo Aditivo (assinado).docx').assinatura).toBe('nao_se_aplica');
  });

  it('PDF com assinatura embutida é digital, e vale mais que o nome', () => {
    expect(c('XPT LOGISTICA FILIAL 12 - Termo Aditivo Ass.pdf', { pdfAssinado: true, pdfMarca: 'icp' }))
      .toMatchObject({ formato: 'pdf', assinatura: 'digital', icp: true });
    expect(c('X - Termo Aditivo - Sem assinatura.pdf', { pdfAssinado: true }).assinatura).toBe('digital');
  });

  it('marca ICP só conta com assinatura embutida', () => {
    expect(c('X - Termo Aditivo.pdf', { pdfAssinado: true, pdfMarca: null }).icp).toBe(false);
    expect(c('X - Termo Aditivo.pdf', { pdfAssinado: false, pdfMarca: 'icp' }).icp).toBe(false);
  });

  it.each([
    'LEANDRO TRANSPORTES - Termo Aditivo Assinado.pdf',
    'XPT EXPRESS LTDA - Termo Aditivo Ass.pdf',
    'MQH BRASIL - Termo Aditivo (Assinado).pdf',
    'ADITIVO_ASSINADO.pdf',
  ])('PDF sem assinatura embutida e "ASS" no nome: pelo_nome — "%s"', (caminho) => {
    expect(c(caminho).assinatura).toBe('pelo_nome');
  });

  it('o nome dizendo "Sem assinatura" é declarada_sem', () => {
    expect(c('TERMO ADITIVO - ARTALUX - Sem assinatura.pdf').assinatura).toBe('declarada_sem');
  });

  it('PDF sem nenhum sinal é nenhuma (a maioria: o DOCX exportado)', () => {
    expect(c('AGROVIX LOGISTICA E TRANSPORTE LTDA - Termo Aditivo.pdf').assinatura).toBe('nenhuma');
  });

  it('foto do papel assinado segue a regra do nome', () => {
    expect(c('MQ INFORMATICA - Termo Aditivo (assinado).jpeg')).toMatchObject({ formato: 'imagem', assinatura: 'pelo_nome' });
    expect(c('X - Termo Aditivo.png')).toMatchObject({ formato: 'imagem', assinatura: 'nenhuma' });
  });

  it('outros formatos', () => {
    expect(c('Termo Aditivo.msg')).toMatchObject({ formato: 'outro', assinatura: 'nao_se_aplica' });
  });
});

describe('classificarAditivo — ano', () => {
  it('usa o ano escrito no nome quando houver', () => {
    expect(c('JUVVI TRANSPORTES -Termo Aditivo 12.02.2026.pdf', { modificadoEm: new Date('2025-06-01T12:00:00Z') }))
      .toMatchObject({ ano: 2026, anoFonte: 'nome' });
  });

  it('senão usa a data do arquivo no fuso de São Paulo', () => {
    // 01:00 UTC de 1º de janeiro ainda é 31/12 em São Paulo.
    expect(c('X - Termo Aditivo.pdf', { modificadoEm: new Date('2026-01-01T01:00:00Z') }))
      .toMatchObject({ ano: 2025, anoFonte: 'data_do_arquivo' });
    expect(c('X - Termo Aditivo.pdf', { modificadoEm: new Date('2026-01-01T04:00:00Z') }).ano).toBe(2026);
  });

  it('não confunde CNPJ com ano', () => {
    expect(c('Termo_Aditivo_K_L_FARMACIA_E_COSMETICOS_LTDA_51783920000164.docx').anoFonte).toBe('data_do_arquivo');
  });
});

describe('classificarAditivo — CNPJ e padrão do app', () => {
  it('lê o CNPJ do nome gerado pelo app', () => {
    expect(c('Termo_Aditivo_K_L_FARMACIA_E_COSMETICOS_LTDA_51783920000164.docx'))
      .toMatchObject({ cnpjNoNome: '51783920000164', nomePadraoDoApp: true });
  });

  it('PDF com o mesmo nome não é o arquivo do app, mas o CNPJ continua valendo', () => {
    expect(c('Termo_Aditivo_PRIMOR_CONSULTORIA_LTDA_63410297000183.pdf'))
      .toMatchObject({ cnpjNoNome: '63410297000183', nomePadraoDoApp: false });
  });

  it('ignora sequência de 14 dígitos que não é CNPJ válido', () => {
    expect(c('X - Termo Aditivo 11111111111111.pdf').cnpjNoNome).toBeNull();
    expect(c('BRIOFLEX LTDA - Termo Aditivo.docx').cnpjNoNome).toBeNull();
  });
});

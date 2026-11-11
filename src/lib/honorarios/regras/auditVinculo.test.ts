import { describe, expect, it } from 'vitest';
import {
  agruparPorNome, ehComecoDoNome, filialDaPasta, indexarEmpresas, indexarPastas, nomeBaseDaPasta,
  nomeSemSigla, ordemDoCnpj, sugerirEmpresas, sugerirPastas, vinculoAutomatico,
} from './auditVinculo';

const empresas = indexarEmpresas([
  { id: 'brioflex',   razaoSocial: 'BRIOFLEX LTDA',                              cnpj: '11.111.111/0001-11' },
  { id: 'cea',        razaoSocial: 'D E B CONSTRUTORA LTDA',                     cnpj: '22.222.222/0001-22' },
  // Matriz e filiais: mesma razão social no Domínio.
  { id: 'xpt-matriz', razaoSocial: 'XPT LOGISTICA LTDA',                         cnpj: '33.333.333/0001-33' },
  { id: 'xpt-12',     razaoSocial: 'XPT LOGISTICA LTDA',                         cnpj: '33.333.333/0012-33' },
  { id: 'xpt-15',     razaoSocial: 'XPT LOGISTICA LTDA',                         cnpj: '33.333.333/0015-33' },
  { id: 'viv',        razaoSocial: 'VIV TRANSPORTES RODOVIARIOS DE CARGAS LTDA', cnpj: '44.444.444/0001-44' },
]);
const porNome = agruparPorNome(empresas);

describe('ordemDoCnpj', () => {
  it('lê a ordem do estabelecimento', () => {
    expect(ordemDoCnpj('33.333.333/0012-33')).toBe(12);
    expect(ordemDoCnpj('33333333000133')).toBe(1);
    expect(ordemDoCnpj('123.456.789-00')).toBeNull();
  });
});

describe('filialDaPasta e nomeBaseDaPasta', () => {
  it.each([
    ['XPT LOGÍSTICA LTDA - 12 FILIAL - CURITIBA-PR',               12, 'XPT LOGISTICA'],
    ['Y UNO LOGÍSTICA LTDA - 02 FILIAL - SÃO MIGUEL DO OESTE-SC',  2,  'Y UNO LOGISTICA'],
    ['XPT LOGISTICA FILIAL 15',                                    15, 'XPT LOGISTICA'],
    // Caso real de 02/10/2026: traço entre o número e FILIAL (filiais 20, 21 e 22 da XPT).
    ['XPT LOGISTICA LTDA - 21 - FILIAL PARANAGUÁ',                 21, 'XPT LOGISTICA'],
    ['XPT LOGISTICA LTDA - 22 - FILIAL APIAÍ-SP',                  22, 'XPT LOGISTICA'],
    ['XPT LOGISTICA LTDA - 20 - FILIAL CURITIBA (REBOUÇAS)',       20, 'XPT LOGISTICA'],
    ['KW EXPRESS FILIAL 0002',                                     2,  'KW EXPRESS'],
    ['FLUXO TRANSPORTES LTDA - MATRIZ',                            1,  'FLUXO TRANSPORTES'],
    ['DOUGLAS RAFAEL TORVINI ENGENHARIA LTDA FILIAL',              null, 'DOUGLAS RAFAEL TORVINI ENGENHARIA'],
    ['BRIOFLEX LTDA',                                              null, 'BRIOFLEX'],
  ])('"%s" → filial %s, base "%s"', (pasta, filial, base) => {
    expect(filialDaPasta(pasta)).toBe(filial);
    expect(nomeBaseDaPasta(pasta)).toBe(base);
  });
});

describe('vinculoAutomatico', () => {
  it('vincula quando o nome normalizado bate com uma única empresa', () => {
    expect(vinculoAutomatico('BRIOFLEX LTDA', porNome)).toBe('brioflex');
    expect(vinculoAutomatico('D&B CONSTRUTORA LTDA', porNome)).toBe('cea');
  });

  it('não vincula quando a razão social se repete e a pasta não diz a filial', () => {
    expect(vinculoAutomatico('XPT LOGÍSTICA LTDA', porNome)).toBeNull();
  });

  it('vincula a filial pela ordem do CNPJ quando o nome-base bate', () => {
    expect(vinculoAutomatico('XPT LOGÍSTICA LTDA - 12 FILIAL - CURITIBA-PR', porNome)).toBe('xpt-12');
    expect(vinculoAutomatico('XPT LOGISTICA LTDA - 15 FILIAL - MAFRA-SC', porNome)).toBe('xpt-15');
  });

  it('não vincula filial cujo número não existe entre os CNPJs', () => {
    expect(vinculoAutomatico('XPT LOGÍSTICA LTDA - 14 FILIAL - MAFRA-SC', porNome)).toBeNull();
  });

  it('não vincula por nome apenas parecido', () => {
    expect(vinculoAutomatico('TRANSVIV TRANSPORTES RODOVIÁRIOS DE CARGAS LTDA', porNome)).toBeNull();
  });

  it('não vincula pasta que não é cliente', () => {
    expect(vinculoAutomatico('SCANNER', porNome)).toBeNull();
    expect(vinculoAutomatico('(sem nome)', porNome)).toBeNull();
  });
});

describe('sugerirEmpresas', () => {
  it('sugere a parecida, mas deixa a decisão para uma pessoa', () => {
    const s = sugerirEmpresas('TRANSVIV TRANSPORTES RODOVIÁRIOS DE CARGAS LTDA', empresas);
    expect(s[0].id).toBe('viv');
    expect(s[0].similaridade).toBeGreaterThan(0.85);
    expect(s[0].filialConfere).toBe(false);
  });

  it('em pasta de filial, põe primeiro a empresa com a mesma ordem no CNPJ', () => {
    const s = sugerirEmpresas('XPT LOGÍSTICA LTDA - 14 FILIAL - MAFRA-SC', empresas);
    expect(s).toHaveLength(3);
    expect(s.every((e) => e.id.startsWith('xpt-'))).toBe(true);
    expect(s.some((e) => e.filialConfere)).toBe(false);

    const s12 = sugerirEmpresas('XPT LOGÍSTICA LTDA - 12 FILIAL - CURITIBA-PR', empresas);
    expect(s12[0]).toMatchObject({ id: 'xpt-12', filialConfere: true });
  });

  it('respeita limite e similaridade mínima', () => {
    expect(sugerirEmpresas('BRIOFLEX LTDA', empresas, 1)).toHaveLength(1);
    expect(sugerirEmpresas('CERTIFICADOS', empresas)).toEqual([]);
    expect(sugerirEmpresas('', empresas)).toEqual([]);
  });
});

describe('sugerirPastas (empresa → pasta)', () => {
  const pastas = indexarPastas([
    'XPT LOGÍSTICA LTDA - 12 FILIAL - CURITIBA-PR',
    'XPT LOGÍSTICA LTDA - 15 FILIAL - MAFRA-SC',
    'XPT EXPRESS LTDA',
    'BRIOFLEX LTDA',
    'SCANNER',
  ]);
  const empresa = (id: string) => empresas.find((e) => e.id === id)!;

  it('põe primeiro a pasta da filial com a mesma ordem do CNPJ', () => {
    const s = sugerirPastas(empresa('xpt-15'), pastas);
    expect(s[0]).toMatchObject({ nomePasta: 'XPT LOGÍSTICA LTDA - 15 FILIAL - MAFRA-SC', filialConfere: true });
    expect(s.some((p) => p.nomePasta === 'SCANNER')).toBe(false);
  });

  it('sugere pelo nome quando não é filial', () => {
    expect(sugerirPastas(empresa('brioflex'), pastas)[0]).toMatchObject({ nomePasta: 'BRIOFLEX LTDA', filialConfere: false });
  });

  it('não sugere nada parecido de menos', () => {
    expect(sugerirPastas(empresa('cea'), pastas)).toEqual([]);
  });
});

describe('filial só desempata entre nomes praticamente iguais (caso real AQX × KW EXPRESS)', () => {
  const ajl = indexarEmpresas([
    { id: 'aqx-02', razaoSocial: 'AQX TRANSPORTES EXPRESS LTDA', cnpj: '72.519.364/0002-74' },
    { id: 'kw-01',  razaoSocial: 'KW EXPRESS TRANSPORTES LTDA',  cnpj: '55.555.555/0001-55' },
  ]);

  it('empresa → pasta: a pasta de mesmo nome vence a de outra empresa com o mesmo número de filial', () => {
    const s = sugerirPastas(ajl[0], indexarPastas([
      'KW EXPRESS TRANSPORTES LTDA - 02 FILIAL SP (baixada)',
      'AQX TRANSPORTES EXPRESS LTDA',
    ]));
    expect(s[0]).toMatchObject({ nomePasta: 'AQX TRANSPORTES EXPRESS LTDA' });
    expect(s.find((p) => p.nomePasta.startsWith('KW'))?.filialConfere).toBe(false);
  });

  it('pasta → empresa: idem', () => {
    const s = sugerirEmpresas('KW EXPRESS TRANSPORTES LTDA - 02 FILIAL SP', ajl);
    expect(s[0].id).toBe('kw-01');
    expect(s.find((e) => e.id === 'aqx-02')?.filialConfere ?? false).toBe(false);
  });
});

describe('pasta com razão social cortada e sigla na frente (caso real SINQAPEÇAS, 02/10/2026)', () => {
  const sindicato = indexarEmpresas([{
    id: 'sinqapecas',
    razaoSocial: 'SINDICATO DO COMERCIO VAREJISTA, ATACADISTA E DISTRIBUIDOR DE PECAS E ACESSORIOS PARA VEICULOS E COMERCIO VAREJISTA DE VEICULOS NO ESTADO DO PAR',
    cnpj: '85.274.103/0001-00',
  }])[0];
  const pasta = 'SINQAPEÇAS - SINDICATO DO COMERCIO VAREJISTA, ATACADISTA';

  it('tira a sigla da frente', () => {
    expect(nomeSemSigla(pasta)).toBe('SINDICATO DO COMERCIO VAREJISTA ATACADISTA');
    expect(nomeSemSigla('XPT LOGÍSTICA LTDA - 12 FILIAL - CURITIBA-PR')).toBeNull();
    expect(nomeSemSigla('AUTO SOCORRO SUL - GUINCHOS')).toBeNull();
    expect(nomeSemSigla('BRIOFLEX LTDA')).toBeNull();
  });

  it('nome cortado é o começo do nome inteiro (a última palavra pode estar cortada)', () => {
    expect(ehComecoDoNome('SINDICATO DO COMERCIO VAREJISTA ATACADISTA', sindicato.nomeNormalizado)).toBe(true);
    expect(ehComecoDoNome('VEICULOS NO ESTADO DO PAR', 'VEICULOS NO ESTADO DO PARANA')).toBe(true);
    // Curto demais para afirmar alguma coisa.
    expect(ehComecoDoNome('TRANSPORTES SAO', 'TRANSPORTES SAO JUDAS LTDA')).toBe(false);
    expect(ehComecoDoNome('BRIOFLEX COMERCIO', 'BRIOFLEX COMERCIO DE FERRO')).toBe(false);
  });

  it('a empresa passa a sugerir a pasta, e a pasta passa a sugerir a empresa', () => {
    const [s] = sugerirPastas(sindicato, indexarPastas([pasta, 'SINDICATO RURAL DE CURITIBA', 'FISCAL']));
    expect(s).toMatchObject({ nomePasta: pasta, similaridade: 0.9 });
    expect(sugerirEmpresas(pasta, [sindicato, ...empresas])[0].id).toBe('sinqapecas');
  });

  it('nome igual continua vencendo o nome cortado', () => {
    const [s] = sugerirPastas(empresas[5], indexarPastas([
      'VIV TRANSPORTES RODOVIARIOS DE CARGAS LTDA', 'VIV TRANSPORTES RODOVIARIOS',
    ]));
    expect(s.nomePasta).toBe('VIV TRANSPORTES RODOVIARIOS DE CARGAS LTDA');
  });
});

describe('filial com traço entre o número e FILIAL (caso real XPT 21 e 22, 02/10/2026)', () => {
  const xpt = indexarEmpresas([
    { id: 'xpt-01', razaoSocial: 'XPT LOGISTICA LTDA', cnpj: '49.306.158/0001-83' },
    { id: 'xpt-21', razaoSocial: 'XPT LOGISTICA LTDA', cnpj: '49.306.158/0021-27' },
    { id: 'xpt-22', razaoSocial: 'XPT LOGISTICA LTDA', cnpj: '49.306.158/0022-08' },
  ]);

  it('vincula automaticamente pela ordem do CNPJ', () => {
    const porNome = agruparPorNome(xpt);
    expect(vinculoAutomatico('XPT LOGISTICA LTDA - 21 - FILIAL PARANAGUÁ', porNome)).toBe('xpt-21');
    expect(vinculoAutomatico('XPT LOGISTICA LTDA - 22 - FILIAL APIAÍ-SP', porNome)).toBe('xpt-22');
  });

  it('e a filial certa vem primeiro na sugestão', () => {
    expect(sugerirEmpresas('XPT LOGISTICA LTDA - 22 - FILIAL APIAÍ-SP', xpt)[0]).toMatchObject({ id: 'xpt-22', filialConfere: true });
  });
});

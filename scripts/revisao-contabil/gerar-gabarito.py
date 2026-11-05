"""Gabarito do motor da Revisão contábil (05/11/2026).

Roda a suíte de testes do motor original (AudTool / Connect Revisão Contábil, Python) com um gravador:
cada chamada ao motor feita pelos testes fica registrada com a entrada e a saída exatas. Acrescenta
casos sintéticos de CSV, Excel e ZIP. O porte em TypeScript repete as chamadas e tem de dar o mesmo
resultado (`src/lib/revisao-contabil/motor/gabarito.test.ts`).

Só dados sintéticos: os testes do original não usam documento real, e os casos daqui são inventados.

Uso (Python 3.12+, sem instalar nada: as dependências vêm de vendor/python do original):
    python -I scripts/revisao-contabil/gerar-gabarito.py <raiz do AudTool> <saída .json.gz>
"""
import sys, io, json, gzip, base64, copy, zipfile, unittest, functools, datetime
from pathlib import Path

root = Path(sys.argv[1]).resolve()
saida = Path(sys.argv[2])
sys.path[:0] = [str(root / 'dist'), str(root / 'vendor' / 'python'), str(root / 'tests')]
import engine, adapter  # noqa: E402
from pathlib import PurePosixPath  # noqa: E402

# O original roda no Pyodide, que é POSIX: no Windows, `Path('/a.csv').is_absolute()` seria falso e
# o gabarito do ZIP com caminho absoluto sairia diferente do comportamento real.
engine.Path = PurePosixPath

registros = []
profundidade = [0]


def codificar(v):
    """JSON com marcas para o que o JSON não distingue: tupla, conjunto e data."""
    if isinstance(v, bool) or v is None or isinstance(v, (int, float, str)):
        return v
    if isinstance(v, datetime.date):
        return {'$date': v.isoformat()}
    if isinstance(v, tuple):
        return {'$tuple': [codificar(x) for x in v]}
    if isinstance(v, (set, frozenset)):
        return {'$set': sorted(codificar(x) for x in v)}
    if isinstance(v, list):
        return [codificar(x) for x in v]
    if isinstance(v, dict):
        if not all(isinstance(k, str) for k in v):
            return {'$dict': [[codificar(k), codificar(x)] for k, x in v.items()]}
        return {k: codificar(x) for k, x in v.items()}
    if isinstance(v, (bytes, bytearray)):
        return {'$bytes': base64.b64encode(bytes(v)).decode()}
    raise TypeError('não serializável: %r' % type(v))


def gravar(nome, fn):
    @functools.wraps(fn)
    def embrulho(*args, **kwargs):
        externo = profundidade[0] == 0
        entrada = codificar([copy.deepcopy(list(args)), copy.deepcopy(kwargs)]) if externo else None
        profundidade[0] += 1
        try:
            saida_ = fn(*args, **kwargs)
        except Exception as e:  # o porte tem de falhar igual
            profundidade[0] -= 1
            if externo:
                registros.append(dict(fn=nome, args=entrada[0], kwargs=entrada[1], error=str(e)))
            raise
        profundidade[0] -= 1
        if externo:
            registros.append(dict(fn=nome, args=entrada[0], kwargs=entrada[1], result=codificar(saida_)))
        return saida_
    return embrulho


# Funções puras do motor chamadas pelos testes ou pelo adapter. `pick` e `trial_tree` recebem ou
# devolvem funções e são conferidas por testes escritos à mão no lado TypeScript.
GRAVADAS = ['analyse', 'parse_pages', 'parse_ledger', 'parse_fiscal', 'parse_payments', 'csv_accounts', 'extract_file',
            'unpack', 'interpreted', 'result_nature', 'business_day', 'balance_group', 'ledger_split', 'holiday',
            'fifo_lots', 'account_label', 'under', 'period_months', 'payroll_due', 'month_label', 'manual_status',
            'manual_matrix', 'describe_entries', 'contrary_periods', 'brl', 'number', 'norm', 'identifier']
for nome in GRAVADAS:
    setattr(engine, nome, gravar(nome, getattr(engine, nome)))
# O adapter importou nomes do engine antes do embrulho: refaz a ligação.
for nome in ('extract_file', 'unpack', 'analyse', 'identifier', 'interpreted'):
    setattr(adapter, nome, getattr(engine, nome))


def handle_json_gravado(fn):
    @functools.wraps(fn)
    def embrulho(request_json):
        profundidade[0] += 1
        try:
            saida_ = fn(request_json)
        except Exception as e:
            profundidade[0] -= 1
            registros.append(dict(fn='handle_json', args=[request_json], kwargs={}, error=str(e)))
            raise
        profundidade[0] -= 1
        registros.append(dict(fn='handle_json', args=[request_json], kwargs={}, result=saida_))
        return saida_
    return embrulho


adapter.handle_json = handle_json_gravado(adapter.handle_json)

# 1) A suíte do original.
suite = unittest.defaultTestLoader.discover(str(root / 'tests'), pattern='test_*.py', top_level_dir=str(root / 'tests'))
resultado = unittest.TextTestRunner(stream=io.StringIO(), verbosity=0).run(suite)
if not resultado.wasSuccessful():
    sys.exit('A suíte do original falhou (%d falhas, %d erros): o gabarito não seria confiável.' % (len(resultado.failures), len(resultado.errors)))
da_suite = len(registros)


# 2) Arquivos sintéticos: CSV, Excel e ZIP, pelo mesmo caminho da importação.
def tentar(fn, *args):
    try:
        fn(*args)
    except Exception:
        pass


CABECALHO = 'codigo;classificacao;descricao;saldo_anterior;debito;credito;saldo_atual'
LINHAS = ['1;1;ATIVO;1.000,00D;500,00;200,00;1.300,00D', '2;1.1;ATIVO CIRCULANTE;1.000,00;500,00;200,00;1.300,00',
          '10;1.1.1.01.0001;CAIXA GERAL;(150,25);10,00;0,00;-140,25', '20;2;PASSIVO;800,00C;100,00;0,00;700,00C',
          '30;2.3;PATRIMÔNIO LÍQUIDO;0,00;0,00;0,00;0,00', 'xx;9;SEM VALOR;abc;1;2;3']
csvs = {
    'balancete.csv': (CABECALHO + '\n' + '\n'.join(LINHAS) + '\n').encode('utf-8'),
    'bom-crlf.csv': ('﻿' + CABECALHO + '\r\n' + '\r\n'.join(LINHAS) + '\r\n').encode('utf-8'),
    'cp1252.csv': (CABECALHO + '\n' + '\n'.join(LINHAS) + '\n').encode('cp1252'),
    'virgula.csv': ('CONTA,DESCRICAO,SALDO INICIAL,DEBITO,CREDITO,SALDO FINAL\n1.1,"CAIXA, BANCOS",100,"1.000,50",0,"1.100,50"\n2.1,"FORNECEDOR ""A""",0,0,10,10C\n').encode('utf-8'),
    'tab.txt': ('ID\tCLASSIFICACAO\tNOME\tSALDO_INICIAL\tDEBITO\tCREDITO\tSALDO_FINAL\n7\t1.1\tCAIXA\t1,00\t2,00\t0,50\t2,50\n\n8\t1.2\tOUTRO\t3,00\t0\t0\n9\t1.3\tA MAIS\t1\t1\t1\t1\textra\n').encode('utf-8'),
    'aspas-simples.csv': ("classificacao;descricao;saldo_anterior;debito;credito;saldo_atual\n'1.1';'CAIXA';'1,00';'0,00';'0,00';'1,00'\n'1.2';'BANCO';'2,00';'0,00';'0,00';'2,00'\n").encode('utf-8'),
    'espaco-inicial.csv': ('classificacao; descricao; saldo_anterior; debito; credito; saldo_atual\n1.1; CAIXA; 1,00; 0,00; 0,00; 1,00\n1.2; BANCO; 2,00; 0,00; 0,00; 2,00\n').encode('utf-8'),
    'uma-coluna.csv': 'apenas texto sem separador\noutra linha\n'.encode('utf-8'),
    'vazio.csv': b'',
    'texto.txt': 'Empresa: TESTE\nC.N.P.J.: 00.000.000/0001-91\nPeríodo: 01/01/2025 a 31/12/2025\nRECEITA BRUTA 1.000,00\nLUCRO BRUTO 400,00\n'.encode('utf-8'),
    'cabecalho-sem-linhas.csv': (CABECALHO + '\n').encode('utf-8'),
    'quebra-em-aspas.csv': ('classificacao;descricao;saldo_anterior;debito;credito;saldo_atual\n1.1;"CAIXA\nGERAL";1,00;0,00;0,00;1,00\n1.2;"BANCO ""X""";1,005;0,00;0,00;1,00\n').encode('utf-8'),
    'metade.csv': ('classificacao;descricao;saldo_anterior;debito;credito;saldo_atual\n1.1;CAIXA;0,005;0,015;0,025;1e2\n1.2;BANCO;1_000;0;0;1000\n').encode('utf-8'),
}
for nome, raw in csvs.items():
    tentar(engine.extract_file, nome, raw)

from openpyxl import Workbook  # noqa: E402


def xlsx(abas):
    wb = Workbook()
    wb.remove(wb.active)
    for titulo, linhas in abas:
        ws = wb.create_sheet(titulo)
        for linha in linhas:
            ws.append(linha)
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


planilhas = {
    'balancete.xlsx': xlsx([('Balancete', [['codigo', 'classificacao', 'descricao', 'saldo_anterior', 'debito', 'credito', 'saldo_atual'],
                                           [1, '1', 'ATIVO', 1000, 500.5, 200, 1300.5], [2, '1.1', 'CAIXA; GERAL', '1.000,00D', 0, 0, '1.000,00D'],
                                           [3, '2', 'PASSIVO "X"', -800.125, 0.125, 0, None], [4, '2.1', None, 0.005, 1.005, 2.675, True]])]),
    'duas-abas.xlsx': xlsx([('Notas', [['texto livre', None], [None, 'sem cabeçalho']]),
                            ('Saldos', [['CONTA', 'NOME', 'SALDO INICIAL', 'DEBITO', 'CREDITO', 'SALDO FINAL'], ['1.1', 'CAIXA', 10, 5, 2, 13]])]),
    'sem-cabecalho.xlsx': xlsx([('Plan1', [['a', 'b'], [1, 2], [datetime.datetime(2025, 1, 31, 0, 0), 3.5]])]),
}
for nome, raw in planilhas.items():
    tentar(engine.extract_file, nome, raw)
tentar(engine.extract_file, 'antigo.xls', b'nao e planilha')
tentar(engine.extract_file, 'imagem.png', b'\x89PNG')


def zipar(itens, **kw):
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED) as z:
        for info, dados in itens:
            z.writestr(info, dados)
    return b.getvalue()


def info(nome, flag=0):
    zi = zipfile.ZipInfo(nome, (2025, 1, 1, 0, 0, 0))
    zi.compress_type = zipfile.ZIP_DEFLATED
    zi.flag_bits |= flag
    return zi


zips = {
    'documentos.zip': zipar([(info('pasta/'), b''), (info('pasta/balancete.csv'), csvs['balancete.csv']), (info('texto.txt'), csvs['texto.txt']),
                             (info('planilha.xlsx'), planilhas['balancete.xlsx']), (info('foto.jpg'), b'jpg'), (info('LEIA.TXT'), b'maiusculo')]),
    'nada-util.zip': zipar([(info('a.doc'), b'doc')]),
    'travessia.zip': zipar([(info('../fora.csv'), b'x')]),
    'absoluto.zip': zipar([(info('/raiz.csv'), b'x')]),
    'senha.zip': zipar([(info('a.csv', flag=1), b'x')]),
    'muitos.zip': zipar([(info('a%03d.txt' % i), b'x') for i in range(101)]),
    'grande.zip': zipar([(info('zeros.csv'), b'0' * (25 * 1024 * 1024 + 1))]),
    'bomba.zip': zipar([(info('zeros.csv'), b'0' * (1024 * 1024))]),
    'vazio.zip': zipar([]),
}
for nome, raw in zips.items():
    tentar(engine.unpack, nome, raw)
tentar(engine.unpack, 'corrompido.zip', b'PK\x03\x04 isto nao e zip')
tentar(engine.unpack, 'balancete.csv', b'nao e zip')

# 3) Constantes que o porte tem de repetir.
CONSTANTES = {k: codificar(getattr(engine, k)) for k in [
    'VERSION', 'MONEY', 'LEDGER_SKIP', 'MAX_LEDGER_ENTRIES', 'MAX_LEDGER_ACCOUNTS', 'MONTHS_PT', 'MAX_PAYMENT_GUIDES', 'MAX_PAYMENT_ITEMS',
    'MONTH_NAMES', 'HOLIDAYS', 'RECURRING', 'PAYROLL', 'AGED_DAYS', 'AGED', 'NATURE_PARTS', 'PART_ORDER', 'LEDGER_LINES', 'SUPPLIER_ROWS',
    'FISCAL_LINES', 'FISCAL_DOCS', 'REGIME_NOTE', 'PAYMENT_LINES', 'PAYMENT_WINDOW', 'TAX_FAMILIES', 'TRIAL_LINES', 'THIRTEENTH_PROVISIONS',
    'CAPITAL', 'CAPITAL_ROWS', 'ADVANCES', 'MANUAL_SECTIONS', 'MANUAL', 'GROUP_NAMES', 'THIRTEENTH']}

for r in registros:  # os ZIPs grandes não precisam viajar inteiros: o resultado é o erro.
    if r['fn'] == 'unpack' and 'error' in r and r['args'][0] in ('grande.zip',):
        r['args'][1] = {'$bytes': base64.b64encode(zips['grande.zip']).decode()}

# Chamadas idênticas (o `pick` chama `under` milhares de vezes) entram uma vez.
vistos = set()
unicos = []
for r in registros:
    chave = json.dumps([r['fn'], r['args'], r['kwargs']], sort_keys=True, ensure_ascii=False)
    if chave not in vistos:
        vistos.add(chave)
        unicos.append(r)
registros = unicos

saida.parent.mkdir(parents=True, exist_ok=True)
with gzip.open(saida, 'wt', encoding='utf-8') as f:
    json.dump(dict(origem='ArchangelumC/ContabilAudTool ' + engine.VERSION, gerado=datetime.date.today().isoformat(),
                   constantes=CONSTANTES, chamadas=registros), f, ensure_ascii=False, separators=(',', ':'))
print('%d chamadas distintas (%d gravadas na suíte antes de tirar as repetidas); %s' % (len(registros), da_suite, saida))

"""Gabarito do leitor das relações fiscais de clientes e fornecedores (Fase 3b, 10/11/2026).

Gera planilhas .xlsx (openpyxl) e .xls (xlwt) INVENTADAS e grava o que o
`ler_relatorio_contrapartes` do Contábil Core devolve para cada uma, para o teste do porte
(`src/lib/contabil-core/cadastro/relatorioContrapartes.test.ts`) comparar campo a campo. Também
grava a validação de `ContraparteDadosCadastrais` para entradas variadas.

Cobre os layouts compacto e completo, os metadados (Empresa, C.N.P.J., Página, Emissão), Conta
Cliente/Conta Fornecedor, cabeçalho repetido entre páginas, documentos inválidos e com dígitos de
outras escritas, datas, horas, números, booleanos, células longas, tipos ambíguos e os erros.
Nenhum dado real: todos os nomes e documentos são inventados.

Uso, a partir da raiz do contabil-core (com openpyxl, xlrd e xlwt):
    python -I <connect>/scripts/contabil-core/gabarito_contrapartes.py gabarito <pasta>
    python -I <connect>/scripts/contabil-core/gabarito_contrapartes.py conferir <saida.json> <arquivo>...

O modo `conferir` roda o leitor original em arquivos locais (fora do git) para a conferência do
porte; a saída deve ficar fora do repositório.
"""
import datetime
import io
import json
import os
import struct
import sys
from pathlib import Path

# Valores fictícios só para a configuração carregar: nada aqui abre banco.
os.environ.setdefault("SECRET_KEY", "gabarito-local-sem-segredo-0123456789abcdef")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://gabarito:gabarito@127.0.0.1:1/gabarito")
sys.path.insert(0, os.getcwd())

import openpyxl  # noqa: E402
import xlwt  # noqa: E402
from pydantic import ValidationError  # noqa: E402
from xlwt.CompoundDoc import XlsDoc  # noqa: E402

from src.domain.contrapartes.relatorio import (  # noqa: E402
    RelatorioContrapartesError,
    ler_relatorio_contrapartes,
)
from src.schemas.contrapartes import ContraparteDadosCadastrais  # noqa: E402


# ─── O que o original devolve ────────────────────────────────────────────────

def ler(conteudo, nome):
    try:
        r = ler_relatorio_contrapartes(conteudo, nome)
    except RelatorioContrapartesError as e:
        return {"erro": {"motivo": e.details["motivo"], "mensagem": e.message}}
    except Exception as e:  # noqa: BLE001 - o original deixa escapar (ex.: CompDocError do xlrd)
        return {"excecao": type(e).__name__}
    return {
        "tipo": r.tipo,
        "planilha": r.planilha,
        "titulo": r.titulo,
        "empresa": r.empresa,
        "empresa_documento": r.empresa_documento,
        "campos_reconhecidos": list(r.campos_reconhecidos),
        "campos_ignorados": list(r.campos_ignorados),
        "linhas": [
            {
                "numero_linha": l.numero_linha,
                "documento": l.documento,
                "razao_social": l.razao_social,
                "nome_fantasia": l.nome_fantasia,
                "conta_numero": l.conta_numero,
                # Lista de pares: a ordem dos campos também é conferida.
                "dados_cadastrais": [[k, v] for k, v in l.dados_cadastrais.items()],
                "documento_valido": l.documento_valido,
                "erro_documento": l.erro_documento,
            }
            for l in r.linhas
        ],
    }


# ─── Layouts (os dos testes do original) ─────────────────────────────────────

CLIENTES_COMPACTO = {0: "Código", 3: "Conta", 7: "Conta Fornecedor", 9: "Nome", 13: "Razão Social",
                     16: "C.N.P.J./C.P.F./C.E.I./Outros/C.A.E.P.F."}
CLIENTES_COMPLETO = {
    0: "Código", 3: "Conta", 5: "Conta Fornecedor", 7: "Nome", 9: "Razão Social",
    11: "C.N.P.J./C.P.F./C.E.I./Outros/C.A.E.P.F.", 13: "UF", 17: "Endereço", 19: "Complemento",
    22: "Número", 24: "CEP", 26: "Insc. Estadual", 28: "Fax", 30: "Fone", 32: "DDD",
    34: "Agropecuário", 36: "Contribuinte ICMS", 38: "Tipo Insc.", 40: "Bairro",
    42: "Insc. Municipal", 44: "País", 46: "Varejista ou cons. final", 48: "Data cadastro",
    50: "Município",
}
FORNECEDORES_COMPACTO = {0: "Conta", 3: "Conta Cliente", 7: "Nome", 9: "Razão Social", 13: "CEP",
                         16: "C.N.P.J./C.P.F./C.E.I./C.A.E.P.F./Outros"}
FORNECEDORES_COMPLETO = {
    0: "Código", 3: "UF", 5: "Conta", 7: "Conta Cliente", 9: "Nome", 11: "Razão Social",
    13: "Endereço", 15: "Complemento", 17: "Número", 19: "CEP",
    21: "C.N.P.J./C.P.F./C.E.I./C.A.E.P.F./Outros", 23: "Insc. Estadual", 25: "Fone", 27: "DDD",
    29: "Fax", 31: "Agropecuário", 33: "Contribuinte ICMS", 35: "Tipo Insc.", 37: "Bairro",
    39: "Insc. Municipal", 41: "País", 43: "Data cadastro", 45: "Município",
}


def por_coluna(valores):
    if not valores:
        return []
    linha = [None] * (max(valores) + 1)
    for coluna, valor in valores.items():
        linha[coluna] = valor
    return linha


def metadados(titulo, cnpj="99.999.999/0000-99"):
    linhas = [
        ["Empresa:", None, "EMPRESA FICTÍCIA DE TESTES LTDA", None, None, None, "Página:", None, 1],
        ["C.N.P.J.:", None, cnpj, None, None, None, "Emissão:", None, "01/10/2026"],
        ["Hora:", None, "10:00"],
        [],
    ]
    if titulo is not None:
        linhas.append([titulo])
    return linhas


def relacao(titulo, cabecalhos, dados, *, cabecalho_linha=6, cnpj="99.999.999/0000-99", extra=None):
    linhas = metadados(titulo, cnpj)
    while len(linhas) < cabecalho_linha:
        linhas.append([])
    cab = dict(cabecalhos)
    if extra:
        cab.update(extra)
    linhas.append(por_coluna(cab))
    linhas.extend(por_coluna(d) for d in dados)
    return linhas


def xlsx(folhas):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for nome, linhas in folhas:
        ws = wb.create_sheet(nome)
        for linha in linhas:
            ws.append(linha)
    arquivo = io.BytesIO()
    wb.save(arquivo)
    return arquivo.getvalue()


ESTILO_DATA = xlwt.easyxf(num_format_str="DD/MM/YYYY")
ESTILO_DATAHORA = xlwt.easyxf(num_format_str="DD/MM/YYYY HH:MM:SS")


def livro_xls(folhas):
    wb = xlwt.Workbook(encoding="utf-8")
    for nome, linhas in folhas:
        ws = wb.add_sheet(nome)
        for i, linha in enumerate(linhas):
            for j, valor in enumerate(linha):
                if valor is None or valor == "":
                    continue
                if isinstance(valor, datetime.datetime):
                    ws.write(i, j, valor, ESTILO_DATAHORA)
                elif isinstance(valor, datetime.date):
                    ws.write(i, j, valor, ESTILO_DATA)
                else:
                    ws.write(i, j, valor)
    return wb


def xls(folhas):
    arquivo = io.BytesIO()
    livro_xls(folhas).save(arquivo)
    return arquivo.getvalue()


def xls_com_blanks_antes_do_bof(folhas):
    """Insere BLANKs antes do BOF da 1ª folha sem corrigir o ponteiro do BOUNDSHEET."""
    biff = bytearray(livro_xls(folhas).get_biff_data())
    posicao = 0
    bofs = []
    while posicao + 4 <= len(biff):
        registro, tamanho = struct.unpack_from("<HH", biff, posicao)
        if registro == 0x0809:
            bofs.append(posicao)
        posicao += 4 + tamanho
    blank = struct.pack("<HHHHH", 0x0201, 6, 0, 0, 0)
    malformado = biff[: bofs[1]] + blank * 3 + biff[bofs[1]:]
    arquivo = io.BytesIO()
    XlsDoc().save(arquivo, bytes(malformado))
    return arquivo.getvalue()


# ─── Casos ───────────────────────────────────────────────────────────────────

RC, RF = "RELAÇÃO DE CLIENTES", "RELAÇÃO DE FORNECEDORES"
ARABE = "".join(chr(0x0660 + int(c)) for c in "12345678901")  # 11 dígitos arábico-índicos
LARGO = "".join(chr(0xFF10 + int(c)) if c.isdigit() else c for c in "12.345.678/0001-95")


def casos():
    c = {}
    c["01-clientes-compacto.xlsx"] = xlsx([(RC, relacao(RC, CLIENTES_COMPACTO, [
        {0: 7, 3: 501, 9: "CLIENTE ALFA", 13: "CLIENTE ALFA COMÉRCIO FICTÍCIO LTDA", 16: "00.000.000/0000-00"},
        {0: 8, 3: 502, 7: 9001, 13: "CLIENTE BETA FICTÍCIA ME", 16: "111.111.111-11"},
    ], cabecalho_linha=12))])
    c["02-fornecedores-completo.xlsx"] = xlsx([(RF, relacao(RF, FORNECEDORES_COMPLETO, [
        {0: 12, 2: "NÃO DEVE SER MAPEADO", 3: "PR", 5: 1501.0, 7: 8888, 9: "FORNECEDOR BETA",
         11: "FORNECEDOR BETA SERVIÇOS FICTÍCIOS LTDA", 13: "RUA EXEMPLO", 15: "SALA 2", 17: 100,
         19: "00000000", 21: "11.111.111/1111-11", 23: "ISENTO", 25: 33334444, 27: 41, 29: 33335555.0,
         31: "N", 33: "S", 35: "CNPJ", 37: "CENTRO", 39: "  123  ", 41: "BRASIL",
         43: datetime.datetime(2024, 3, 5), 45: "CURITIBA"},
        {5: 1502, 11: "  FORNECEDOR GAMA FICTÍCIO  ", 21: "22.222.222/0001-22", 13: "   "},
    ], extra={2: "Observação particular", 47: "Coluna Nova"}))])
    c["03-clientes-completo.xls"] = xls([(RC, relacao(RC, CLIENTES_COMPLETO, [
        {0: 3, 3: 777, 7: "CLIENTE GAMA", 9: "CLIENTE GAMA INDÚSTRIA FICTÍCIA LTDA", 11: "222.222.222-22",
         13: "SC", 17: "AVENIDA TESTE", 24: "00000000", 30: 4833334444, 34: True, 36: False,
         48: datetime.date(2023, 12, 31), 50: "FLORIANÓPOLIS"},
        {0: 4.5, 3: 778.0, 9: "CLIENTE DELTA FICTÍCIA", 11: 12345678901.0, 46: "S",
         48: datetime.datetime(2023, 1, 2, 13, 45, 30)},
    ]))])
    c["04-fornecedores-compacto.xls"] = xls([(RF, relacao(RF, FORNECEDORES_COMPACTO, [
        {0: 909, 7: "FORNECEDOR DELTA", 9: "FORNECEDOR DELTA COMÉRCIO FICTÍCIO LTDA", 13: "00000000",
         16: "33.333.333/3333-33"},
        {0: "910", 3: 55, 9: "FORNECEDOR SEM DOCUMENTO"},
    ]))])
    c["05-boundsheet-com-blanks.xls"] = xls_com_blanks_antes_do_bof([(RF, relacao(RF, FORNECEDORES_COMPACTO, [
        {0: 1234, 7: "FORNECEDOR ÉPSILON", 9: "FORNECEDOR ÉPSILON FICTÍCIO LTDA", 16: "44.444.444/4444-44"},
    ]))])
    c["06-documentos.xlsx"] = xlsx([(RC, relacao(RC, CLIENTES_COMPACTO, [
        {3: 100, 13: "PESSOA FICTÍCIA", 16: "000.000.000-00"},
        {3: 101, 13: "DOCUMENTO CURTO", 16: "12345"},
        {3: 102, 13: "SEM DOCUMENTO", 16: ""},
        {3: 103, 13: "DOCUMENTO ARÁBICO", 16: ARABE},
        {3: 104, 13: "DOCUMENTO LARGO", 16: LARGO},
        {3: 105, 13: "DOCUMENTO NÚMERO", 16: 12345678901},
        {3: 106, 13: "DOCUMENTO LONGO", 16: "123.456.789/0001-234"},
        {3: 107, 13: "DOCUMENTO COM LETRAS", 16: "ABC12345678901XYZ"},
        {7: 77},
    ]))])
    # Cabeçalho repetido na página 2, depois da 30ª linha (nas primeiras 30 seria ambíguo).
    pagina1 = [{3: 200 + i, 13: f"CLIENTE FICTÍCIO {i:02d}", 16: f"{i:011d}"} for i in range(1, 31)]
    linhas = relacao(RC, CLIENTES_COMPACTO, pagina1)
    linhas += [[], ["Empresa:", None, "EMPRESA FICTÍCIA DE TESTES LTDA", None, None, None, "Página:", None, 2],
               [RC], por_coluna(CLIENTES_COMPACTO),
               por_coluna({3: 300, 13: "CLIENTE FICTÍCIO PÁGINA DOIS", 16: "99999999999"}),
               por_coluna({13: "Razão Social"}), por_coluna({13: "RAZAO   SOCIAL", 3: 1}), []]
    c["07-cabecalho-repetido.xlsx"] = xlsx([(RC, linhas)])
    c["08-datas-e-numeros.xlsx"] = xlsx([(RF, relacao(RF, FORNECEDORES_COMPLETO, [
        {0: 1e20, 5: "0501", 11: "FORNECEDOR A FICTÍCIO", 21: "10.000.000/0001-01",
         43: datetime.datetime(2024, 3, 5, 14, 30, 15, 123456), 31: True, 33: False},
        {0: 12.5, 5: "501.00", 11: "FORNECEDOR B FICTÍCIO", 21: "10.000.000/0001-02", 43: datetime.time(10, 30)},
        {0: -0.0, 5: 501.5, 11: "FORNECEDOR C FICTÍCIO", 21: "10.000.000/0001-03", 25: 0.1 + 0.2},
        {0: 1.5e-7, 5: 0, 11: "FORNECEDOR D FICTÍCIO", 21: "10.000.000/0001-04", 25: 123456789012345678},
        {5: -3, 11: "FORNECEDOR E FICTÍCIO", 21: "10.000.000/0001-05"},
        {5: 3000000000, 11: "FORNECEDOR F FICTÍCIO", 21: "10.000.000/0001-06"},
        {5: "５０１", 11: "FORNECEDOR G FICTÍCIO", 21: "10.000.000/0001-07"},
        {5: " 42 ", 11: "X", 21: "10.000.000/0001-08"},
        {5: "4.2", 11: "FORNECEDOR H FICTÍCIO", 21: "10.000.000/0001-09"},
        {5: 1.0e16, 11: "FORNECEDOR I FICTÍCIO", 21: "10.000.000/0001-10"},
    ]))])
    c["09-datas.xls"] = xls([(RF, relacao(RF, FORNECEDORES_COMPLETO, [
        {0: 1, 5: 610.0, 11: "FORNECEDOR XLS FICTÍCIO", 21: "20.000.000/0001-01",
         43: datetime.date(1999, 12, 31), 31: True, 33: 0.25},
        {0: 2, 5: 611, 11: "FORNECEDOR XLS DOIS", 21: "20.000.000/0001-02",
         43: datetime.datetime(2026, 11, 10, 8, 0, 1)},
    ]))])
    c["10-celula-longa.xlsx"] = xlsx([(RC, relacao(RC, CLIENTES_COMPLETO, [
        {3: 1, 9: "CLIENTE LONGO FICTÍCIO", 11: "30.000.000/0001-01", 17: "R" * 10_001},
    ]))])
    c["11-celula-no-limite.xlsx"] = xlsx([(RC, relacao(RC, CLIENTES_COMPLETO, [
        {3: 1, 9: "CLIENTE LIMITE FICTÍCIO", 11: "30.000.000/0001-02", 17: "  " + "é" * 10_000 + "  "},
        {3: 2, 9: "CLIENTE EMOJI FICTÍCIO", 11: "30.000.000/0001-03", 17: "\U0001F600" * 10_000},
    ]))])
    c["12-tipo-ambiguo.xlsx"] = xlsx([("RELATÓRIO FISCAL", relacao(RC, FORNECEDORES_COMPACTO, [
        {0: 100, 9: "EMPRESA FICTÍCIA", 16: "55.555.555/5555-55"},
    ]))])
    c["13-tipo-nao-identificado.xlsx"] = xlsx([("Planilha1", relacao(None, {0: "Conta", 1: "Razão Social", 2: "CPF/CNPJ"}, [
        {0: 1, 1: "EMPRESA FICTÍCIA", 2: "55.555.555/5555-55"},
    ]))])
    c["14-tipo-pelo-nome-da-folha.xlsx"] = xlsx([("Relação de Fornecedores", relacao(None, {0: "Conta", 1: "Razão Social", 2: "CNPJ/CPF"}, [
        {0: 1, 1: "EMPRESA FICTÍCIA", 2: "55.555.555/5555-55"},
    ]))])
    c["15-sem-cabecalho.xlsx"] = xlsx([(RC, relacao(RC, {0: "Nome", 1: "Conta"}, [{0: "CLIENTE FICTÍCIO", 1: 100}]))])
    c["16-dois-cabecalhos.xlsx"] = xlsx([(RC, relacao(RC, CLIENTES_COMPACTO, [CLIENTES_COMPACTO]))])
    c["17-coluna-duplicada.xlsx"] = xlsx([(RF, relacao(RF, FORNECEDORES_COMPACTO, [], extra={20: "Insc. Estadual", 21: "Inscrição Estadual"}))])
    linhas = relacao(RC, CLIENTES_COMPACTO, [{3: 501, 13: "CLIENTE FICTÍCIO LTDA", 16: "77.777.777/0001-77"}])
    linhas[1] = ["C.N.P.J.:", None, None, None, None, None, None, None, None, "Emissão:", None, "01/10/2026"]
    c["18-cnpj-ausente.xlsx"] = xlsx([(RC, linhas)])
    c["19-varias-folhas.xlsx"] = xlsx([
        ("Resumo", [["Resumo inventado"], ["Razão Social", "Nome"], [1, 2]]),
        (RF, relacao(RF, FORNECEDORES_COMPACTO, [{0: 5, 9: "FORNECEDOR FOLHA DOIS", 16: "66.666.666/0001-66"}],
                     cnpj=LARGO)),
        ("Vazia", []),
    ])
    c["20-cabecalhos-variantes.xlsx"] = xlsx([(RC, relacao(RC, {
        0: "CONTA", 1: "RAZÃO   SOCIAL", 2: "CNPJ / CPF", 3: "Munıcıpio", 4: "ＵＦ", 5: "Straße", 6: 7,
        7: True, 8: "Inscrição Municipal", 9: "Varejista ou consumidor final", 10: "Telefone", 11: "Conta Fornecedor",
    }, [
        {0: 1, 1: "CLIENTE VARIANTE FICTÍCIO", 2: "40.000.000/0001-01", 3: "LONDRINA", 4: "PR", 5: "X", 6: "Y",
         8: "ABC", 9: "N", 10: "4399999999", 11: 12},
    ]))])
    linhas = relacao(RF, FORNECEDORES_COMPACTO, [{0: 1, 9: "FORNECEDOR FICTÍCIO", 16: "50.000.000/0001-01"}])
    linhas[0] = ["Empresa:", None, None, "Página:", None, 1]
    linhas[1] = ["C.N.P.J.:", None, "", "Hora:", "10:00"]
    linhas[3] = ["c.n.p.j", "Emissão:", "11.111.111/0001-11"]
    linhas.insert(4, ["  C N P J  ", None, 12345678000195.0])
    linhas.insert(5, ["EMPRESA", 4242])
    c["21-metadados.xlsx"] = xlsx([(RF, linhas)])
    linhas = relacao(RF, FORNECEDORES_COMPACTO, [{0: 1, 9: "FORNECEDOR FICTÍCIO", 16: "50.000.000/0001-01"}], cnpj="12.345.678/0001-95")
    linhas[0] = ["Empresa:", None, "EMPRESA XLS FICTÍCIA", None, None, None, "Página:", None, 1.0]
    c["22-metadados.xls"] = xls([(RF, linhas)])
    c["23-cabecalho-longo.xlsx"] = xlsx([(RC, [["X" * 10_001]] + relacao(RC, CLIENTES_COMPACTO, []))])
    c["24-sem-linhas.xlsx"] = xlsx([(RC, relacao(RC, CLIENTES_COMPACTO, []))])
    c["25-cabecalho-fora-do-alcance.xlsx"] = xlsx([(RC, relacao(RC, CLIENTES_COMPACTO, [], cabecalho_linha=30))])
    c["26-cabecalho-na-30.xlsx"] = xlsx([(RC, relacao(RC, CLIENTES_COMPACTO, [{3: 1, 13: "CLIENTE NA 31", 16: "11111111111"}], cabecalho_linha=29))])
    c["32-titulo.xlsx"] = xlsx([("Planilha1", relacao("Relação de Clientes — por código", {0: "Conta", 1: "Razão Social", 2: "CPF/CNPJ"}, [
        {0: 1, 1: "CLIENTE COM TÍTULO", 2: "123.456.789-01"},
    ]))])
    c["27-extensao.csv"] = b"Conta;Razao Social\n1;X\n"
    c["28-vazio.xlsx"] = b""
    c["29-formato.xlsx"] = b"<html>nao e planilha</html>"
    c["30-xlsx-corrompido.xlsx"] = b"PK\x03\x04" + b"\x00" * 64
    c["31-ole-corrompido.xls"] = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 600
    return c


def casos_dados_cadastrais():
    return [
        {},
        {"endereco": "  Rua Fictícia  ", "municipio": "  "},
        {"uf": "PR"},
        {"uf": " PR "},
        {"uf": "PRR"},
        {"uf": "Ü̈"},
        {"uf": "\U0001F600\U0001F600"},
        {"uf": "\U0001F600\U0001F600\U0001F600"},
        {"cep": "  123  "},
        {"ddd": "123456"},
        {"codigo": "C" * 50, "bairro": "B" * 100},
        {"codigo": "C" * 51, "bairro": "B" * 101},
        {"campo_inventado": "x"},
        {"campo_inventado": "x", "uf": "PRR"},
        {"zeta": "1", "alfa": "2"},
        {"codigo": None, "pais": "BRASIL"},
        {"municipio": "M" * 101, "codigo": "C" * 51},
        {"varejista_consumidor_final": "N", "data_cadastro": "2024-03-05 00:00:00", "telefone": "4133334444"},
    ]


def dados_cadastrais(entrada):
    try:
        return {"ok": ContraparteDadosCadastrais.model_validate(entrada).model_dump()}
    except ValidationError as e:
        primeiro = e.errors()[0]
        return {"erro": ".".join(str(p) for p in primeiro.get("loc", ()))}


def main():
    modo = sys.argv[1]
    if modo == "gabarito":
        pasta = Path(sys.argv[2])
        pasta.mkdir(parents=True, exist_ok=True)
        for nome, conteudo in casos().items():
            base = "contrapartes-" + nome
            (pasta / base).write_bytes(conteudo)
            # O nome com que o leitor é chamado é o do arquivo (a extensão decide o formato).
            resultado = ler(conteudo, nome)
            (pasta / (base + ".json")).write_text(
                json.dumps(resultado, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
            )
            print(nome, resultado.get("erro", {}).get("motivo", "ok"))
        saida = [{"entrada": e, "saida": dados_cadastrais(e)} for e in casos_dados_cadastrais()]
        (pasta / "dados-cadastrais.json").write_text(
            json.dumps(saida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
        )
    elif modo == "conferir":
        resultado = {}
        for caminho in sys.argv[3:]:
            conteudo = Path(caminho).read_bytes()
            resultado[caminho] = ler(conteudo, Path(caminho).name)
        Path(sys.argv[2]).write_text(json.dumps(resultado, ensure_ascii=False), encoding="utf-8")
    else:
        raise SystemExit("modo: gabarito | conferir")


if __name__ == "__main__":
    main()

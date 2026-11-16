using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Xml;

namespace Assinador;

/// <summary>
/// As consultas do eSocial que o DP 2 usa para importar colaboradores, pelo
/// Pacote de Comunicação v1.6 (WSDL e XSD v1_0_0) e pelo Manual do
/// Desenvolvedor v1.16, 7.7 e 7.8:
/// - Consulta aos identificadores dos eventos do trabalhador (CPF + período de recepção);
/// - Solicitação de download dos eventos por Id (até 50 por pedido).
/// Só leitura: nada é enviado como evento.
/// </summary>
internal static class ClienteEsocial
{
    public const string ProducaoConsulta = "https://webservices.download.esocial.gov.br/servicos/empregador/dwlcirurgico/WsConsultarIdentificadoresEventos.svc";
    public const string ProducaoDownload = "https://webservices.download.esocial.gov.br/servicos/empregador/dwlcirurgico/WsSolicitarDownloadEventos.svc";
    public const string RestritaConsulta = "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/dwlcirurgico/WsConsultarIdentificadoresEventos.svc";
    public const string RestritaDownload = "https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/dwlcirurgico/WsSolicitarDownloadEventos.svc";

    private const string NsServicoConsulta = "http://www.esocial.gov.br/servicos/empregador/consulta/identificadores-eventos/v1_0_0";
    private const string NsServicoDownload = "http://www.esocial.gov.br/servicos/empregador/download/solicitacao/v1_0_0";
    private const string NsConsultaTrabalhador = "http://www.esocial.gov.br/schema/consulta/identificadores-eventos/trabalhador/v1_0_0";
    private const string NsDownloadPorId = "http://www.esocial.gov.br/schema/download/solicitacao/id/v1_0_0";

    /// <summary>"Cada empregador só poderá realizar uma consulta por vez" (MOD 7.7.7).</summary>
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> UmPorVez = new();

    public sealed record Identificador(string Id, string? NrRec);

    public sealed record RespostaDaConsulta(int CdResposta, string DescResposta, int? QtdeTotal, string? DhUltimoEvt, List<Identificador> Identificadores);

    public sealed record RespostaDoDownload(int CdResposta, string DescResposta, string Xml);

    public static string Raiz(string cnpj)
    {
        var d = Certificados.Digitos(cnpj);
        if (d.Length != 14) throw new ErroParaOConnect("CNPJ da empresa inválido.");
        return d[..8];
    }

    /// <summary>O XML da consulta, ainda sem assinatura (exposto para teste).</summary>
    internal static string XmlDaConsultaTrabalhador(string raiz, string cpf, DateTime dtIni, DateTime dtFim) =>
        $"<eSocial xmlns=\"{NsConsultaTrabalhador}\"><consultaIdentificadoresEvts>" +
        $"<ideEmpregador><tpInsc>1</tpInsc><nrInsc>{raiz}</nrInsc></ideEmpregador>" +
        $"<consultaEvtsTrabalhador><cpfTrab>{cpf}</cpfTrab><dtIni>{Data(dtIni)}</dtIni><dtFim>{Data(dtFim)}</dtFim></consultaEvtsTrabalhador>" +
        "</consultaIdentificadoresEvts></eSocial>";

    internal static string XmlDoDownloadPorId(string raiz, IEnumerable<string> ids) =>
        $"<eSocial xmlns=\"{NsDownloadPorId}\"><download>" +
        $"<ideEmpregador><tpInsc>1</tpInsc><nrInsc>{raiz}</nrInsc></ideEmpregador>" +
        $"<solicDownloadEvtsPorId>{string.Concat(ids.Select(i => $"<id>{WebUtility.HtmlEncode(i)}</id>"))}</solicDownloadEvtsPorId>" +
        "</download></eSocial>";

    private static string Data(DateTime d) => d.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture);

    internal static string Envelope(string nsServico, string metodo, string parametro, string xmlAssinado) =>
        "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" " +
        $"xmlns:v1=\"{nsServico}\"><soapenv:Header/><soapenv:Body>" +
        $"<v1:{metodo}><v1:{parametro}>{xmlAssinado}</v1:{parametro}></v1:{metodo}>" +
        "</soapenv:Body></soapenv:Envelope>";

    public static async Task<RespostaDaConsulta> ConsultarTrabalhador(X509Certificate2 cert, string cnpj, string cpf, DateTime dtIni, DateTime dtFim, bool restrita, CancellationToken ct)
    {
        cpf = Certificados.Digitos(cpf);
        if (cpf.Length != 11) throw new ErroParaOConnect("CPF inválido.");
        if (dtFim <= dtIni) throw new ErroParaOConnect("O fim do período precisa ser depois do início.");
        if ((dtFim - dtIni).TotalDays > 31) throw new ErroParaOConnect("O eSocial só consulta períodos de até 31 dias.");
        var limite = DateTime.Now.AddHours(-1);
        if (dtFim > limite) dtFim = limite;

        var raiz = Raiz(cnpj);
        var assinado = AssinaturaXml.Assinar(XmlDaConsultaTrabalhador(raiz, cpf, dtIni, dtFim), cert).DocumentElement!.OuterXml;
        var corpo = Envelope(NsServicoConsulta, "ConsultarIdentificadoresEventosTrabalhador", "consultaEventosTrabalhador", assinado);
        var resposta = await Chamar(cert, raiz, restrita ? RestritaConsulta : ProducaoConsulta,
            $"{NsServicoConsulta}/ServicoConsultarIdentificadoresEventos/ConsultarIdentificadoresEventosTrabalhador", corpo, ct);
        return LerConsulta(resposta);
    }

    public static async Task<RespostaDoDownload> BaixarPorId(X509Certificate2 cert, string cnpj, IReadOnlyCollection<string> ids, bool restrita, CancellationToken ct)
    {
        if (ids.Count == 0) throw new ErroParaOConnect("Nenhum evento para baixar.");
        if (ids.Count > 50) throw new ErroParaOConnect("O eSocial baixa no máximo 50 eventos por pedido.");
        var raiz = Raiz(cnpj);
        var assinado = AssinaturaXml.Assinar(XmlDoDownloadPorId(raiz, ids), cert).DocumentElement!.OuterXml;
        var corpo = Envelope(NsServicoDownload, "SolicitarDownloadEventosPorId", "solicitacao", assinado);
        var resposta = await Chamar(cert, raiz, restrita ? RestritaDownload : ProducaoDownload,
            $"{NsServicoDownload}/ServicoSolicitarDownloadEventos/SolicitarDownloadEventosPorId", corpo, ct);
        var doc = new XmlDocument();
        doc.LoadXml(resposta);
        var (cd, desc) = Status(doc);
        return new RespostaDoDownload(cd, desc, resposta);
    }

    private static async Task<string> Chamar(X509Certificate2 cert, string raiz, string url, string acao, string corpo, CancellationToken ct)
    {
        var trava = UmPorVez.GetOrAdd(raiz, _ => new SemaphoreSlim(1, 1));
        if (!await trava.WaitAsync(TimeSpan.Zero, ct))
            throw new ErroParaOConnect("Já há uma consulta desta empresa em andamento. O eSocial não aceita duas ao mesmo tempo.");
        try
        {
            using var handler = new HttpClientHandler { ClientCertificateOptions = ClientCertificateOption.Manual };
            handler.ClientCertificates.Add(cert);
            using var http = new HttpClient(handler) { Timeout = TimeSpan.FromMinutes(3) };
            using var pedido = new HttpRequestMessage(HttpMethod.Post, url) { Content = new StringContent(corpo, Encoding.UTF8, "text/xml") };
            pedido.Headers.Add("SOAPAction", $"\"{acao}\"");
            using var resposta = await http.SendAsync(pedido, ct);
            var texto = await resposta.Content.ReadAsStringAsync(ct);
            if (!resposta.IsSuccessStatusCode)
            {
                var falha = Falha(texto);
                throw new ErroParaOConnect(resposta.StatusCode == HttpStatusCode.Forbidden || resposta.StatusCode == HttpStatusCode.Unauthorized
                    ? "O eSocial recusou o certificado. Confira se é o certificado da empresa ou do escritório com procuração."
                    : $"O eSocial respondeu com erro ({(int)resposta.StatusCode}){(falha is null ? "" : $": {falha}")}.");
            }
            return texto;
        }
        catch (HttpRequestException e)
        {
            throw new ErroParaOConnect($"Não deu para falar com o eSocial ({e.Message}). Confira a internet e se o certificado está ligado.");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new ErroParaOConnect("O eSocial demorou demais para responder. Tente de novo mais tarde.");
        }
        finally
        {
            trava.Release();
        }
    }

    private static string? Falha(string soap)
    {
        try
        {
            var doc = new XmlDocument();
            doc.LoadXml(soap);
            return doc.GetElementsByTagName("faultstring").Item(0)?.InnerText?.Trim();
        }
        catch
        {
            return null;
        }
    }

    private static (int, string) Status(XmlDocument doc)
    {
        // O primeiro <status> é o da consulta inteira (cdResposta 200 = sucesso).
        var status = doc.GetElementsByTagName("status").Item(0);
        var cd = int.TryParse(status?["cdResposta"]?.InnerText ?? FilhoPorNome(status, "cdResposta"), out var n) ? n : 0;
        var desc = status?["descResposta"]?.InnerText ?? FilhoPorNome(status, "descResposta") ?? "";
        return (cd, desc.Trim());
    }

    private static string? FilhoPorNome(XmlNode? no, string nome) =>
        no?.ChildNodes.Cast<XmlNode>().FirstOrDefault(n => n.LocalName == nome)?.InnerText;

    internal static RespostaDaConsulta LerConsulta(string soap)
    {
        var doc = new XmlDocument();
        doc.LoadXml(soap);
        var (cd, desc) = Status(doc);
        var lista = new List<Identificador>();
        foreach (XmlNode n in doc.GetElementsByTagName("identificadorEvt"))
        {
            var id = FilhoPorNome(n, "id");
            if (!string.IsNullOrWhiteSpace(id)) lista.Add(new Identificador(id.Trim(), FilhoPorNome(n, "nrRec")?.Trim()));
        }
        var qtde = int.TryParse(doc.GetElementsByTagName("qtdeTotEvtsConsulta").Item(0)?.InnerText, out var q) ? q : (int?)null;
        var dh = doc.GetElementsByTagName("dhUltimoEvtRetornado").Item(0)?.InnerText;
        return new RespostaDaConsulta(cd, desc, qtde, dh, lista);
    }
}

/**
 * VIVA Eventos · recebe as candidaturas de sócio-operador e grava numa planilha.
 *
 * COMO USAR (uma vez):
 *  1. Crie uma planilha no Google Sheets (ex.: "Candidaturas - Operadores VIVA").
 *  2. Nela, menu Extensões > Apps Script.
 *  3. Apague o conteúdo padrão e cole TODO este arquivo.
 *  4. Clique em Implantar > Nova implantação > tipo "App da Web".
 *       - Executar como: Eu (sua conta)
 *       - Quem tem acesso: Qualquer pessoa
 *     Implantar e copie a URL (termina em /exec).
 *  5. Cole essa URL na constante SHEET_URL do arquivo config.js do site.
 *
 * Toda vez que alterar este script, faça "Implantar > Gerenciar implantações >
 * (editar) > Nova versão" para publicar a mudança na mesma URL.
 */

var SHEET_NAME = 'Candidaturas';
var TIMEZONE = 'America/Sao_Paulo';

var HEADERS = [
  'Data/Hora', 'Status', 'Classificação', 'Pontos', 'Composição sugerida',
  'Perfil', 'Histórico no mercado', 'Porta pra fora / dentro', 'Capital próprio',
  'Praça', 'Nome', 'WhatsApp', 'Página de origem'
];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    // Garante o cabeçalho (e atualiza se novas colunas forem adicionadas depois).
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);

    var agora = Utilities.formatDate(new Date(), TIMEZONE, 'dd/MM/yyyy HH:mm:ss');

    sheet.appendRow([
      agora,
      data.status || 'Completo',
      data.classificacao || '',
      data.pontos || 0,
      data.composicao || '',
      data.perfil || '',
      data.experiencia || '',
      data.papel || '',
      data.capital || '',
      data.praca || '',
      data.nome || '',
      data.whatsapp || '',
      data.origem || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Permite abrir a URL no navegador só para testar se está no ar.
function doGet() {
  return ContentService
    .createTextOutput('VIVA Eventos · endpoint de candidaturas ativo.')
    .setMimeType(ContentService.MimeType.TEXT);
}

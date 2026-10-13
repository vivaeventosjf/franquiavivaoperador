/* ============================================================
 * VIVA Eventos · Captação de OPERADORES para novas unidades
 * Edite só este arquivo para trocar contatos e integrações.
 * ============================================================ */

/* WhatsApp do time de expansão: 55 + DDD + número (só dígitos) */
const WHATS = '5532988677558';

/* Mensagem que já vem digitada quando a pessoa abre o WhatsApp */
const WHATS_MSG = 'Oi! Vim pela página de operadores da VIVA e quero entender como entrar como sócio-operador de uma nova unidade.';

/* Redes sociais */
const INSTAGRAM = 'https://www.instagram.com/vivaeventos/';
const YOUTUBE = 'https://www.youtube.com/@vivaeventos';
const FACEBOOK = 'https://www.facebook.com/vivaeventosoficial';

/* Páginas oficiais */
const DEPOIMENTOS_URL = 'https://depoimentos.vivaeventos.com.br/';
const SITE_URL = 'https://vivaeventos.com.br/';
const FRANQUIAS_URL = 'https://franquias.vivaeventos.com.br/';

/* Web App do Google Apps Script que grava as candidaturas na planilha.
   Deixe string vazia para desativar o envio (o formulário continua
   funcionando na tela, mas o lead não é gravado em lugar nenhum). */
const SHEET_URL = '';

/* Ponte com o Kommo (Netlify Function). O token do CRM fica nas variáveis de
   ambiente do Netlify, nunca aqui. Deixe vazio para desativar o envio.
   Em ambiente local sem Netlify CLI, isso simplesmente não grava nada. */
const CRM_URL = '/.netlify/functions/kommo';

/* ------------------------------------------------------------
 * Quais classes de lead marcam conversão na campanha
 * ------------------------------------------------------------
 * O formulário pontua a candidatura e dá uma classe (A, B, C ou D).
 * Só as classes listadas aqui disparam o evento "Lead" do Meta Pixel.
 * As demais disparam "LeadDesqualificado", que não serve de otimização
 * mas continua aparecendo no Gerenciador e permite montar público de
 * exclusão, para parar de pagar impressão para quem já se desqualificou.
 *
 * O lead entra no CRM e na planilha de qualquer jeito: isto muda apenas
 * o que a Meta aprende, nunca o que o time de expansão recebe.
 *
 * Como mexer:
 *   ['A','B','C']  padrão. Corta só o D, que é "fora do perfil".
 *   ['A','B']      aperta o corte, se o C estiver enchendo o funil.
 *   ['A','B','C','D','INVESTIDOR']  volta ao comportamento antigo.
 *
 * Use 'INVESTIDOR' para quem marca "quero investir, mas não quero operar":
 * essa pessoa não tem classe, e hoje fica de fora do corte.
 *
 * Atenção ao mexer: a Meta precisa de volume para aprender (a referência
 * dela é ~50 conversões por conjunto por semana). Apertar demais o corte
 * encarece o lead no curto prazo antes de melhorar a qualidade.
 */
const CLASSES_QUE_MARCAM_LEAD = ['A', 'B', 'C'];

/* Quantas praças ainda estão abertas (aparece no hero e no CTA final).
   Deixe 0 para esconder o contador de escassez. */
const PRACAS_ABERTAS = 50;

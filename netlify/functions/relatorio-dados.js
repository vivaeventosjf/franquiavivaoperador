/**
 * VIVA Eventos · dados do relatório de mídia.
 *
 *   GET /.netlify/functions/relatorio-dados?de=2026-09-05&ate=2026-09-24
 *
 * Devolve o JSON agregado que a página do relatório desenha. Sem parâmetros,
 * usa os últimos 30 dias.
 *
 * Os tokens do Meta e do Kommo ficam só aqui, no servidor. O navegador recebe
 * apenas números agregados, nunca dado de candidato.
 *
 * Cache em Netlify Blobs por 6 horas: sem ele, cada pessoa que abrisse a
 * página dispararia duas chamadas de API, e a da Meta tem limite de volume.
 * A coleta agendada (relatorio-coleta) mantém esse cache quente, então o
 * visitante normalmente não espera nada.
 *
 * Variáveis de ambiente (além das do Kommo, que a função kommo.js já usa):
 *   META_TOKEN           token de acesso com permissão ads_read
 *   META_AD_ACCOUNT_ID   id da conta de anúncios, com ou sem o prefixo act_
 *   META_API_VERSION     (opcional) padrão v23.0
 */

const { montarRelatorio, hojeBR, dataValida } = require('./lib/dados');

const VALIDADE_MS = 6 * 3600 * 1000;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return resposta(405, { ok: false, error: 'Use GET' });
  }

  const q = event.queryStringParameters || {};
  const de = dataValida(q.de) ? q.de : hojeBR(-30);
  const ate = dataValida(q.ate) ? q.ate : hojeBR(0);

  if (de > ate) {
    return resposta(400, { ok: false, error: 'A data inicial é depois da final' });
  }

  const chave = `relatorio-${de}-${ate}.json`;
  const semCache = q.recarregar === '1';

  if (!semCache) {
    const guardado = await lerCache(chave);
    if (guardado && Date.now() - new Date(guardado.gerado_em).getTime() < VALIDADE_MS) {
      return resposta(200, { ok: true, cache: true, dados: guardado });
    }
  }

  try {
    const dados = await montarRelatorio(de, ate);
    await gravarCache(chave, dados);
    return resposta(200, { ok: true, cache: false, dados: dados });
  } catch (err) {
    console.error('relatorio-dados:', err.message);

    /* Um cache vencido é melhor que uma página vazia: se a API de alguém
       estiver fora do ar, o relatório ainda abre, avisando a idade do dado. */
    const guardado = await lerCache(chave);
    if (guardado) {
      return resposta(200, { ok: true, cache: true, vencido: true, dados: guardado });
    }
    return resposta(502, { ok: false, error: err.message });
  }
};

/* ---------- cache ---------- *
 * O Blobs só existe quando a função roda no Netlify. Rodando localmente sem
 * ele, seguimos sem cache em vez de quebrar. */

async function armazem() {
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore('relatorios');
  } catch (err) {
    return null;
  }
}

async function lerCache(chave) {
  const loja = await armazem();
  if (!loja) return null;
  try {
    return await loja.get(chave, { type: 'json' });
  } catch (err) {
    return null;
  }
}

async function gravarCache(chave, dados) {
  const loja = await armazem();
  if (!loja) return;
  try {
    await loja.setJSON(chave, dados);
  } catch (err) {
    console.error('cache não gravado:', err.message);
  }
}

/* ---------- resposta ---------- */

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function resposta(codigo, corpo) {
  return {
    statusCode: codigo,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      /* O relatório não deve ser indexado nem preso em cache de navegador: a
         frescura vem do Blobs, controlada acima. */
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow'
    }, cors()),
    body: JSON.stringify(corpo)
  };
}

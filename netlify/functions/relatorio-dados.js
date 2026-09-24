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

  /* Diagnóstico de configuração. Responde apenas se a variável existe e
     quantos caracteres tem, nunca o valor: serve para descobrir se uma chave
     foi salva com nome errado ou ficou fora do contexto das funções. */
  if (q.checar === '1') {
    const nomes = ['META_TOKEN', 'META_AD_ACCOUNT_ID', 'META_API_VERSION',
      'KOMMO_SUBDOMAIN', 'KOMMO_TOKEN'];
    const situacao = {};
    nomes.forEach(function (n) {
      const v = process.env[n];
      situacao[n] = v ? { presente: true, caracteres: v.length } : { presente: false };
    });
    /* Qualquer chave que contenha META ou KOMMO, para revelar erro de digitação
       no nome. Só os nomes, nunca os valores. */
    situacao._chaves_parecidas = Object.keys(process.env)
      .filter(function (k) { return /meta|kommo|ads?_/i.test(k); }).sort();
    return resposta(200, { ok: true, configuracao: situacao });
  }

  /* Diagnóstico do token da Meta: diz quem é o token, quais permissões ele
     carrega e a quais contas de anúncio tem acesso. Sem isto, o erro (#200)
     é ambíguo entre "faltou a permissão no token" e "faltou dar a conta ao
     usuário de sistema", que se resolvem em telas diferentes. */
  if (q.checar === 'meta') {
    return await checarMeta(
      dataValida(q.de) ? q.de : hojeBR(-30),
      dataValida(q.ate) ? q.ate : hojeBR(0)
    );
  }

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

/* ---------- diagnóstico da Meta ---------- */

async function checarMeta(de, ate) {
  const token = process.env.META_TOKEN;
  const conta = process.env.META_AD_ACCOUNT_ID;
  if (!token) return resposta(200, { ok: false, error: 'META_TOKEN ausente' });

  const versao = process.env.META_API_VERSION || 'v23.0';
  const g = async function (caminho) {
    try {
      const r = await fetch(`https://graph.facebook.com/${versao}/${caminho}` +
        `${caminho.indexOf('?') >= 0 ? '&' : '?'}access_token=${encodeURIComponent(token)}`);
      const c = await r.json();
      return c.error ? { erro: c.error.message, codigo: c.error.code } : c;
    } catch (err) {
      return { erro: err.message };
    }
  };

  /* debug_token revela o tipo do token, o app dono e os escopos concedidos. */
  const debug = await g(`debug_token?input_token=${encodeURIComponent(token)}`);
  const contas = await g('me/adaccounts?fields=id,name,account_status&limit=50');

  const d = (debug && debug.data) || {};
  const lista = (contas && contas.data) || [];
  const act = conta && String(conta).startsWith('act_') ? conta : `act_${conta}`;

  return resposta(200, {
    ok: true,
    token: {
      tipo: d.type || 'desconhecido',
      valido: d.is_valid === true,
      expira_em: d.expires_at ? new Date(d.expires_at * 1000).toISOString() : 'nunca',
      escopos: d.scopes || [],
      tem_ads_read: Array.isArray(d.scopes) &&
        (d.scopes.indexOf('ads_read') >= 0 || d.scopes.indexOf('ads_management') >= 0),
      erro: debug && debug.erro
    },
    contas_visiveis: await comGasto(g, lista, de, ate),
    conta_procurada: act,
    conta_esta_na_lista: lista.some(function (c) { return c.id === act; }),
    erro_ao_listar: contas && contas.erro
  });
}

/* Gasto de cada conta no periodo: e o que revela qual delas tem as campanhas
   do relatorio, quando o portfolio tem varias contas parecidas. */
async function comGasto(g, lista, de, ate) {
  const intervalo = encodeURIComponent(JSON.stringify({ since: de, until: ate }));
  const fora = [];
  for (const c of lista.slice(0, 15)) {
    const r = await g(`${c.id}/insights?fields=spend&time_range=${intervalo}`);
    const linha = r && r.data && r.data[0];
    fora.push({
      id: c.id,
      nome: c.name,
      gasto_no_periodo: linha ? Number(linha.spend || 0) : 0,
      erro: r && r.erro
    });
  }
  return fora.sort(function (a, b) { return b.gasto_no_periodo - a.gasto_no_periodo; });
}

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

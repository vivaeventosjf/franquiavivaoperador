/**
 * VIVA Eventos · ponte entre o formulário da landing e o Kommo.
 *
 * O token do Kommo NUNCA vai para o navegador: ele fica nas variáveis de
 * ambiente do Netlify e só é usado aqui, no servidor.
 *
 * Cada resposta do formulário vira um campo personalizado do lead, para o time
 * conseguir filtrar e montar relatório. Os campos são criados sozinhos na
 * primeira candidatura que chegar; se a criação falhar (token sem permissão de
 * admin, por exemplo), o lead ainda entra e as respostas ficam na nota.
 *
 * Variáveis de ambiente (Netlify > Site settings > Environment variables):
 *   KOMMO_SUBDOMAIN   ex.: vivaeventos          (sem .kommo.com)
 *   KOMMO_TOKEN       token de longa duração da integração privada
 *   KOMMO_PIPELINE_ID (opcional) id do funil de destino
 *   KOMMO_STATUS_ID   (opcional) id da etapa de destino dentro do funil
 *   KOMMO_TAG         (opcional) etiqueta do lead. Padrão: "Landing operador"
 *   KOMMO_DEBUG       (temporária) com valor "1", libera
 *                     GET /.netlify/functions/kommo?funis=1, que lista os ids
 *                     de funil e de etapa. Apague depois de anotar.
 */

const TAG_PADRAO = 'Landing operador';

/* Cada item vira um campo personalizado no lead.
   chave  = campo do JSON que a landing envia
   nome   = como aparece no Kommo
   tipo   = tipo do campo na API do Kommo */
const CAMPOS = [
  { chave: 'status', nome: 'Status da candidatura', tipo: 'text' },
  { chave: 'classificacao', nome: 'Classificação do lead', tipo: 'text' },
  { chave: 'pontos', nome: 'Pontuação', tipo: 'numeric' },
  { chave: 'perfil', nome: 'Perfil declarado', tipo: 'text' },
  { chave: 'experiencia', nome: 'Histórico no mercado', tipo: 'text' },
  { chave: 'capital', nome: 'Capital próprio', tipo: 'text' },
  { chave: 'praca', nome: 'Praça pretendida', tipo: 'text' },
  { chave: 'origem', nome: 'Página de origem', tipo: 'text' }
];

/* Sobrevive entre invocações quentes da função: evita bater na API de campos
   a cada candidatura. */
let cacheCampos = null;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }
  const listando = event.httpMethod === 'GET' &&
    event.queryStringParameters &&
    event.queryStringParameters.funis === '1';

  if (event.httpMethod !== 'POST' && !listando) {
    return resposta(405, { ok: false, error: 'Use POST' });
  }

  const subdominio = process.env.KOMMO_SUBDOMAIN;
  const token = process.env.KOMMO_TOKEN;
  if (!subdominio || !token) {
    console.error('KOMMO_SUBDOMAIN ou KOMMO_TOKEN não configurados');
    // 200 de propósito: a landing não pode travar se o CRM estiver fora.
    return resposta(200, { ok: false, error: 'Integração não configurada' });
  }

  const base = `https://${subdominio}.kommo.com/api/v4`;
  const cabecalho = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  /* Ajuda para descobrir os ids de funil e etapa.
     Só responde com KOMMO_DEBUG=1 nas variáveis do Netlify. Depois de anotar
     os ids, apague a variável para fechar essa porta. */
  if (listando) {
    if (process.env.KOMMO_DEBUG !== '1') {
      return resposta(404, { ok: false, error: 'Não disponível' });
    }
    return await listarFunis(base, cabecalho);
  }

  let dados;
  try {
    dados = JSON.parse(event.body || '{}');
  } catch (err) {
    return resposta(400, { ok: false, error: 'JSON inválido' });
  }

  const nome = (dados.nome || '').trim() || 'Candidato sem nome';
  const telefone = (dados.whatsapp || '').trim();
  const praca = (dados.praca || '').trim();

  try {
    const idsCampos = await garantirCampos(base, cabecalho);

    const lead = {
      name: `Operador · ${nome}${praca ? ' · ' + praca : ''}`,
      _embedded: {
        tags: [{ name: process.env.KOMMO_TAG || TAG_PADRAO }],
        contacts: [
          {
            first_name: nome,
            custom_fields_values: telefone
              ? [{ field_code: 'PHONE', values: [{ value: telefone, enum_code: 'WORK' }] }]
              : undefined
          }
        ]
      }
    };

    const valores = montarValores(dados, idsCampos);
    if (valores.length) lead.custom_fields_values = valores;

    if (process.env.KOMMO_PIPELINE_ID) lead.pipeline_id = Number(process.env.KOMMO_PIPELINE_ID);
    if (process.env.KOMMO_STATUS_ID) lead.status_id = Number(process.env.KOMMO_STATUS_ID);

    const criacao = await fetch(`${base}/leads/complex`, {
      method: 'POST',
      headers: cabecalho,
      body: JSON.stringify([lead])
    });

    const corpo = await criacao.text();
    if (!criacao.ok) {
      console.error('Kommo recusou o lead:', criacao.status, corpo);
      return resposta(200, { ok: false, status: criacao.status, error: corpo.slice(0, 500) });
    }

    const criado = JSON.parse(corpo);
    const leadId = Array.isArray(criado) && criado[0] && criado[0].id;
    if (!leadId) {
      return resposta(200, { ok: true, aviso: 'Lead criado, mas sem id na resposta' });
    }

    // A nota repete as respostas em texto corrido: é o resumo que o vendedor lê
    // de relance na linha do tempo, sem abrir a aba de campos.
    const nota = await fetch(`${base}/leads/${leadId}/notes`, {
      method: 'POST',
      headers: cabecalho,
      body: JSON.stringify([{ note_type: 'common', params: { text: montarNota(dados) } }])
    });
    if (!nota.ok) {
      console.error('Nota não gravada:', nota.status, await nota.text());
    }

    return resposta(200, { ok: true, lead_id: leadId, campos: Object.keys(idsCampos).length });
  } catch (err) {
    console.error('Falha ao falar com o Kommo:', err);
    return resposta(200, { ok: false, error: String(err) });
  }
};

/* ============================================================
 * Funis e etapas
 * ============================================================ */
async function listarFunis(base, cabecalho) {
  try {
    const r = await fetch(`${base}/leads/pipelines`, { headers: cabecalho });
    if (!r.ok) {
      return resposta(200, { ok: false, status: r.status, error: (await r.text()).slice(0, 500) });
    }

    const dados = await r.json();
    const funis = ((dados._embedded && dados._embedded.pipelines) || []).map(function (f) {
      return {
        KOMMO_PIPELINE_ID: f.id,
        funil: f.name,
        principal: !!f.is_main,
        etapas: ((f._embedded && f._embedded.statuses) || []).map(function (s) {
          return { KOMMO_STATUS_ID: s.id, etapa: s.name };
        })
      };
    });

    return resposta(200, { ok: true, funis: funis });
  } catch (err) {
    return resposta(200, { ok: false, error: String(err) });
  }
}

/* ============================================================
 * Campos personalizados
 * ============================================================ */
async function garantirCampos(base, cabecalho) {
  if (cacheCampos) return cacheCampos;

  const mapa = {};

  try {
    const r = await fetch(`${base}/leads/custom_fields?limit=250`, { headers: cabecalho });
    if (r.ok) {
      const dados = await r.json();
      const lista = (dados._embedded && dados._embedded.custom_fields) || [];
      lista.forEach(function (campo) {
        const achado = CAMPOS.find(function (c) { return c.nome === campo.name; });
        if (achado) mapa[achado.chave] = campo.id;
      });
    } else if (r.status !== 204) {
      console.error('Não consegui listar os campos:', r.status);
    }
  } catch (err) {
    console.error('Erro ao listar campos:', err);
  }

  const faltando = CAMPOS.filter(function (c) { return !mapa[c.chave]; });

  if (faltando.length) {
    try {
      const r = await fetch(`${base}/leads/custom_fields`, {
        method: 'POST',
        headers: cabecalho,
        body: JSON.stringify(
          faltando.map(function (c) { return { name: c.nome, type: c.tipo }; })
        )
      });

      if (r.ok) {
        const dados = await r.json();
        const criados = (dados._embedded && dados._embedded.custom_fields) || [];
        criados.forEach(function (campo) {
          const achado = CAMPOS.find(function (c) { return c.nome === campo.name; });
          if (achado) mapa[achado.chave] = campo.id;
        });
      } else {
        // Sem permissão de admin, por exemplo. O lead continua entrando,
        // e as respostas ficam disponíveis na nota.
        console.error('Não consegui criar os campos:', r.status, await r.text());
      }
    } catch (err) {
      console.error('Erro ao criar campos:', err);
    }
  }

  cacheCampos = mapa;
  return mapa;
}

function montarValores(dados, idsCampos) {
  const valores = [];

  CAMPOS.forEach(function (campo) {
    const id = idsCampos[campo.chave];
    if (!id) return;

    let valor = dados[campo.chave];
    if (valor === undefined || valor === null || valor === '') return;

    if (campo.tipo === 'numeric') {
      valor = Number(valor);
      if (isNaN(valor)) return;
    } else {
      valor = String(valor).slice(0, 250);
    }

    valores.push({ field_id: id, values: [{ value: valor }] });
  });

  return valores;
}

/* ============================================================
 * Nota (resumo em texto)
 * ============================================================ */
function montarNota(d) {
  const linhas = [
    ['Status', d.status],
    ['Classificação', d.classificacao],
    ['Pontos', d.pontos],
    ['Perfil', d.perfil],
    ['Histórico no mercado', d.experiencia],
    ['Capital próprio', d.capital],
    ['Praça', d.praca],
    ['Nome', d.nome],
    ['WhatsApp', d.whatsapp],
    ['Origem', d.origem]
  ];

  return linhas
    .filter(function (l) { return l[1] !== undefined && l[1] !== null && l[1] !== ''; })
    .map(function (l) { return l[0] + ': ' + l[1]; })
    .join('\n');
}

/* ============================================================
 * HTTP
 * ============================================================ */
function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function resposta(statusCode, corpo) {
  return {
    statusCode,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors()),
    body: JSON.stringify(corpo)
  };
}

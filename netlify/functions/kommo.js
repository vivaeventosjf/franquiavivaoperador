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
 *   KOMMO_STATUS_ID   (opcional) id da etapa. Se não souber o número, use
 *                     KOMMO_STATUS_NAME
 *   KOMMO_STATUS_NAME (opcional) nome da etapa de destino, ex.: "NOVOS". A
 *                     função procura a etapa pelo nome dentro do funil e usa o
 *                     id dela. Ignora acentos e maiúsculas. Padrão: "NOVOS"
 *   KOMMO_TAG         (opcional) etiqueta do lead. Padrão: "Landing operador"
 *   KOMMO_ORIGEM      (opcional) opção do campo "Origem do lead". Precisa
 *                     existir na lista do Kommo. Padrão: "Tráfego"
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

  /* Derivados da praça e do WhatsApp, para preencher os campos que o time já
     usa no CRM. */
  { chave: 'cidade', nome: 'Cidade', tipo: 'text' },
  { chave: 'estado', nome: 'Estado', tipo: 'text' },
  { chave: 'telefone', nome: 'Telefone', tipo: 'text' },

  /* Campo de seleção. Nunca é criado pela função: sem as opções cadastradas
     um "select" novo nasceria vazio e inútil. Só é usado se já existir. */
  { chave: 'origem_lead', nome: 'Origem do lead', tipo: 'select', soExistente: true },

  /* Estes quatro já existem na conta da VIVA. A função procura por nome, então
     ela reaproveita os campos do time em vez de criar duplicados. */
  { chave: 'origem', nome: 'URL onde converteu', tipo: 'text' },
  { chave: 'utm_source', nome: 'UTM source', tipo: 'text' },
  { chave: 'utm_medium', nome: 'UTM medium', tipo: 'text' },
  { chave: 'utm_campaign', nome: 'UTM campaign', tipo: 'text' }
];

/* Sobrevivem entre invocações quentes da função: evitam bater na API a cada
   candidatura. */
let cacheCampos = null;
let cacheEtapa;

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
    /* O charset é explícito de propósito: sem ele, alguns servidores assumem
       latin-1 e acentos viram "?" no CRM. */
    'Content-Type': 'application/json; charset=utf-8'
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
    /* O sendBeacon do lead parcial manda um Blob, e o Netlify às vezes entrega
       esse corpo em base64. Decodificar como UTF-8 preserva a acentuação. */
    var cru = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : (event.body || '');
    dados = JSON.parse(cru || '{}');
  } catch (err) {
    return resposta(400, { ok: false, error: 'JSON inválido' });
  }

  const nome = (dados.nome || '').trim() || 'Candidato sem nome';
  const telefone = (dados.whatsapp || '').trim();
  const praca = (dados.praca || '').trim();

  /* Campos derivados: o formulário pede a praça em texto livre e o WhatsApp,
     e o CRM tem colunas próprias para cidade, estado, telefone e origem. */
  const local = separarLocal(praca);
  dados.cidade = dados.cidade || local.cidade;
  dados.estado = dados.estado || local.estado;
  dados.telefone = dados.telefone || telefone;
  dados.origem_lead = dados.origem_lead || process.env.KOMMO_ORIGEM || 'Tráfego';

  try {
    const idsCampos = await garantirCampos(base, cabecalho);

    const lead = {
      name: `Operador · ${nome}${praca ? ' · ' + praca : ''}`,
      _embedded: {
        tags: [{ name: process.env.KOMMO_TAG || TAG_PADRAO }],
        contacts: [montarContato(nome, telefone)]
      }
    };

    const valores = montarValores(dados, idsCampos);
    if (valores.length) lead.custom_fields_values = valores;

    const funilId = process.env.KOMMO_PIPELINE_ID
      ? Number(process.env.KOMMO_PIPELINE_ID)
      : null;
    if (funilId) lead.pipeline_id = funilId;

    const etapaId = await descobrirEtapa(base, cabecalho, funilId);
    if (etapaId) lead.status_id = etapaId;

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
    const primeiro = Array.isArray(criado) ? criado[0] : null;
    const leadId = primeiro && primeiro.id;
    if (!leadId) {
      return resposta(200, { ok: true, aviso: 'Lead criado, mas sem id na resposta' });
    }

    let contatoId = null;
    const contatos = (primeiro._embedded && primeiro._embedded.contacts) || [];
    if (contatos.length) contatoId = contatos[0].id;

    /* Se o Kommo não vinculou o contato junto com o lead, cria e vincula
       separadamente. Sem isso o card fica sem nome e sem telefone. */
    if (!contatoId) {
      contatoId = await criarContato(base, cabecalho, leadId, nome, telefone);
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

    return resposta(200, {
      ok: true,
      lead_id: leadId,
      contato_id: contatoId,
      campos: Object.keys(idsCampos).length
    });
  } catch (err) {
    console.error('Falha ao falar com o Kommo:', err);
    return resposta(200, { ok: false, error: String(err) });
  }
};

/* ============================================================
 * Cidade e estado
 * A pergunta do formulário é texto livre ("Em qual cidade você quer operar?"),
 * então aqui a gente tenta separar em duas colunas para o CRM.
 * ============================================================ */
const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE',
  'TO'
];

const ESTADOS = {
  ACRE: 'AC', ALAGOAS: 'AL', AMAPA: 'AP', AMAZONAS: 'AM', BAHIA: 'BA',
  CEARA: 'CE', 'DISTRITO FEDERAL': 'DF', 'ESPIRITO SANTO': 'ES', GOIAS: 'GO',
  MARANHAO: 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG', PARA: 'PA', PARAIBA: 'PB', PARANA: 'PR',
  PERNAMBUCO: 'PE', PIAUI: 'PI', 'RIO DE JANEIRO': 'RJ',
  'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', RONDONIA: 'RO',
  RORAIMA: 'RR', 'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', SERGIPE: 'SE',
  TOCANTINS: 'TO'
};

function separarLocal(praca) {
  const vazio = { cidade: '', estado: '' };
  if (!praca) return vazio;

  /* Separadores usuais: "Juiz de Fora, MG", "Juiz de Fora - MG",
     "Juiz de Fora / MG", "Juiz de Fora | MG". */
  const partes = String(praca).split(/[,\/|]|\s-\s/);

  if (partes.length > 1) {
    const fim = partes.pop().trim();
    const cidade = partes.join(', ').trim();
    const uf = paraUF(fim);
    if (uf) return { cidade: cidade, estado: uf };
    /* Não reconheceu o estado: devolve tudo como cidade, sem inventar. */
    return { cidade: String(praca).trim(), estado: '' };
  }

  /* Sem separador: tenta uma sigla solta no fim, como "Juiz de Fora MG". */
  const texto = String(praca).trim();
  const ultima = texto.split(/\s+/).pop();
  const uf = ultima && ultima.length === 2 ? paraUF(ultima) : '';

  if (uf) {
    return {
      cidade: texto.slice(0, texto.length - ultima.length).trim(),
      estado: uf
    };
  }

  return { cidade: texto, estado: '' };
}

function paraUF(texto) {
  const limpo = normalizar(texto).replace(/[^A-Z ]/g, '').trim();
  if (limpo.length === 2 && UFS.indexOf(limpo) !== -1) return limpo;
  return ESTADOS[limpo] || '';
}

/* ============================================================
 * Contato
 * ============================================================ */
function montarContato(nome, telefone) {
  /* O Kommo aceita "name" (nome completo) e "first_name". Mandar os dois evita
     depender de qual deles a versão da API prioriza. */
  const contato = { name: nome, first_name: nome };

  if (telefone) {
    contato.custom_fields_values = [
      { field_code: 'PHONE', values: [{ value: telefone, enum_code: 'WORK' }] }
    ];
  }

  return contato;
}

async function criarContato(base, cabecalho, leadId, nome, telefone) {
  try {
    const r = await fetch(`${base}/contacts`, {
      method: 'POST',
      headers: cabecalho,
      body: JSON.stringify([montarContato(nome, telefone)])
    });

    if (!r.ok) {
      console.error('Contato não criado:', r.status, await r.text());
      return null;
    }

    const dados = await r.json();
    const lista = (dados._embedded && dados._embedded.contacts) || [];
    const contatoId = lista[0] && lista[0].id;
    if (!contatoId) return null;

    const vinculo = await fetch(`${base}/leads/${leadId}/link`, {
      method: 'POST',
      headers: cabecalho,
      body: JSON.stringify([{ to_entity_id: contatoId, to_entity_type: 'contacts' }])
    });

    if (!vinculo.ok) {
      console.error('Contato não vinculado ao lead:', vinculo.status, await vinculo.text());
    }

    return contatoId;
  } catch (err) {
    console.error('Erro ao criar contato:', err);
    return null;
  }
}

/* ============================================================
 * Funis e etapas
 * ============================================================ */

/* Resolve a etapa de destino. Prioridade:
   1. KOMMO_STATUS_ID, se informado
   2. a etapa cujo nome bate com KOMMO_STATUS_NAME (padrão "NOVOS")
   3. nenhuma, e o Kommo usa a primeira etapa do funil */
async function descobrirEtapa(base, cabecalho, funilId) {
  if (process.env.KOMMO_STATUS_ID) return Number(process.env.KOMMO_STATUS_ID);
  if (cacheEtapa !== undefined) return cacheEtapa;
  if (!funilId) return (cacheEtapa = null);

  const alvo = normalizar(process.env.KOMMO_STATUS_NAME || 'NOVOS');

  try {
    const r = await fetch(`${base}/leads/pipelines/${funilId}`, { headers: cabecalho });
    if (!r.ok) {
      console.error('Não consegui ler o funil:', r.status);
      return (cacheEtapa = null);
    }

    const funil = await r.json();
    const etapas = (funil._embedded && funil._embedded.statuses) || [];

    const achada = etapas.find(function (e) {
      return normalizar(e.name).indexOf(alvo) !== -1;
    });

    if (!achada) {
      console.error('Etapa "' + alvo + '" não encontrada no funil ' + funilId);
      return (cacheEtapa = null);
    }

    console.log('Etapa de destino:', achada.name, achada.id);
    return (cacheEtapa = achada.id);
  } catch (err) {
    console.error('Erro ao procurar a etapa:', err);
    return (cacheEtapa = null);
  }
}

/* Compara nomes sem depender de acento, caixa ou numeração ("1 | NOVOS [LEAD]"). */
function normalizar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}
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
        /* Guarda o tipo que o campo realmente tem no Kommo. Campos antigos do
           time podem ser "multitext" (o formato de telefone e e-mail), que
           exige enum_code no valor. */
        if (achado) {
          mapa[achado.chave] = {
            id: campo.id,
            tipo: campo.type,
            enums: campo.enums || null
          };
        }
      });
    } else if (r.status !== 204) {
      console.error('Não consegui listar os campos:', r.status);
    }
  } catch (err) {
    console.error('Erro ao listar campos:', err);
  }

  const faltando = CAMPOS.filter(function (c) {
    return !mapa[c.chave] && !c.soExistente;
  });

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
          if (achado) mapa[achado.chave] = { id: campo.id, tipo: campo.type };
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
    const info = idsCampos[campo.chave];
    if (!info) return;

    let valor = dados[campo.chave];
    if (valor === undefined || valor === null || valor === '') return;

    if (campo.tipo === 'numeric') {
      valor = Number(valor);
      if (isNaN(valor)) return;
    } else {
      valor = String(valor).slice(0, 250);
    }

    let item;

    if (info.tipo === 'select' || info.tipo === 'radiobutton') {
      /* Seleção: o Kommo espera o id da opção, não o texto. */
      const opcao = (info.enums || []).find(function (e) {
        return normalizar(e.value) === normalizar(valor);
      });
      if (!opcao) {
        console.error('Opção "' + valor + '" não existe no campo ' + campo.nome);
        return;
      }
      item = { enum_id: opcao.id };
    } else if (info.tipo === 'multitext') {
      /* Campo do tipo telefone/e-mail exige o enum junto do valor. */
      item = { value: valor, enum_code: 'WORK' };
    } else {
      item = { value: valor };
    }

    valores.push({ field_id: info.id, values: [item] });
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
    ['Cidade', d.cidade],
    ['Estado', d.estado],
    ['Nome', d.nome],
    ['WhatsApp', d.whatsapp],
    ['URL onde converteu', d.origem],
    ['Veio de', d.referrer],
    ['utm_source', d.utm_source],
    ['utm_medium', d.utm_medium],
    ['utm_campaign', d.utm_campaign],
    ['utm_content', d.utm_content],
    ['utm_term', d.utm_term],
    ['gclid', d.gclid],
    ['fbclid', d.fbclid]
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
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors()),
    body: JSON.stringify(corpo)
  };
}

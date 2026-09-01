# VIVA Eventos · captação de sócios-operadores

Landing de recrutamento para as **novas unidades que já têm investidor definido**.
O ângulo da página é esse: o capital já está na mesa, o que falta é quem sabe
vender formatura. Por isso a promessa central é *investimento muito baixo +
mão de obra especializada*.

Público prioritário: **vendedor de empresa de formatura** e **vendedor de empresa
de fotografia**. Donos de formatura, de fotografia e fornecedores estratégicos
entram como público secundário; cerimonial, corporativo, produtora e vendedor de
fora do mercado são aceitos, mas classificados abaixo.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `index.html` | A landing inteira (uma página só). |
| `styles.css` | Todo o visual, incluindo o formulário. |
| `script.js` | Header, menu mobile, reveal, FAQ, links de contato e contador de praças. |
| `candidatura.js` | Formulário de 6 etapas + pontuação + classificação + envio. |
| `config.js` | **Único arquivo que precisa ser editado** para publicar. |
| `google-apps-script.gs` | Backend que grava as candidaturas numa planilha do Google. |
| `netlify/functions/kommo.js` | Ponte com o Kommo. Roda no servidor, guarda o token. |
| `netlify.toml` | Configuração de publicação e de funções no Netlify. |
| `assets/` | Logo VIVA vetorizada (SVG), PNGs e favicon. |

## Antes de publicar, edite `config.js`

```js
const WHATS = '5532988677558';   // <- WhatsApp do time de expansão (já preenchido)
const SHEET_URL = '';            // <- URL /exec do Apps Script (ver abaixo)
const CRM_URL = '/.netlify/functions/kommo';  // <- ponte com o Kommo
const PRACAS_ABERTAS = 50;       // <- praças disponíveis (0 esconde a escassez)
```

O WhatsApp já está preenchido com o número do time de expansão,
**(32) 98867-7558**. O `CRM_URL` aponta para a função do Kommo (ver adiante).
O `SHEET_URL` é opcional e serve como cópia de segurança em planilha.

## Receber as candidaturas numa planilha

Mesma integração da landing de formandos:

1. Crie uma planilha no Google Sheets.
2. Menu **Extensões → Apps Script**, cole o conteúdo de `google-apps-script.gs`.
3. **Implantar → Nova implantação → App da Web**
   (executar como você; acesso: qualquer pessoa).
4. Copie a URL que termina em `/exec` e cole em `SHEET_URL` no `config.js`.

Cada linha traz: data, status, classificação, pontos,
perfil, histórico no mercado, capital próprio, praça, nome, WhatsApp, URL onde
converteu, os cinco UTMs, gclid, fbclid e referrer.

Quem abandona o formulário depois de digitar o WhatsApp é gravado como
**"Parcial (abandonou)"** via `sendBeacon`. Como o WhatsApp é a **segunda**
pergunta, praticamente todo abandono vira lead resgatável.

Leads vindos do botão flutuante do WhatsApp entram com status
**"WhatsApp (contato direto)"**.

## Integração com o Kommo

O formulário manda cada candidatura para uma **Netlify Function**
(`netlify/functions/kommo.js`), que cria o lead no Kommo. O token do CRM fica nas
variáveis de ambiente do Netlify e **nunca chega ao navegador**. Se ele
estivesse no `config.js`, qualquer visitante poderia ler e escrever no CRM da
VIVA.

### Passo 1 · gerar o token no Kommo

1. No Kommo, vá em **Configurações → Integrações → Criar integração**.
2. Escolha **Integração privada**, dê um nome (ex.: "Landing operador").
3. Marque os escopos de **CRM** (leitura e escrita).
4. Gere um **token de longa duração** e copie.

### Passo 2 · configurar no Netlify

Em **Site settings → Environment variables**, crie:

| Variável | Obrigatória | O que é |
| --- | --- | --- |
| `KOMMO_SUBDOMAIN` | sim | Só o subdomínio, sem `.kommo.com`. Ex.: `vivaeventos` |
| `KOMMO_TOKEN` | sim | O token de longa duração do passo 1 |
| `KOMMO_PIPELINE_ID` | não | Id do funil de destino. Sem isso, cai no funil padrão |
| `KOMMO_STATUS_ID` | não | Id da etapa. Se não souber o número, use a variável abaixo |
| `KOMMO_STATUS_NAME` | não | Nome da etapa de destino. Padrão: `NOVOS` |
| `KOMMO_TAG` | não | Etiqueta do lead. Padrão: `Landing operador` |
| `KOMMO_DEBUG` | não | Temporária. Com `1`, libera a listagem de funis (abaixo) |

### Escolher o funil e a etapa

O id do **funil** aparece na barra de endereço do Kommo ao abrir o funil:
`.../leads/pipeline/1234567`. O número é o `KOMMO_PIPELINE_ID`.

O id da **etapa** não aparece na interface, e por isso a função aceita o **nome**
em `KOMMO_STATUS_NAME`. Ela lê as etapas do funil, acha a que bate com esse nome
e usa o id. A comparação ignora acento, caixa e a numeração do Kommo, então
`NOVOS` encontra `1 | NOVOS [LEAD]`. O padrão já é `NOVOS`, então na maioria dos
casos não precisa cadastrar nada.

Se a etapa não for encontrada, o lead entra na primeira etapa do funil e o aviso
fica no log de funções.

Se preferir cravar o número, a variável `KOMMO_DEBUG` com valor `1` libera
`KOMMO_DEBUG` com valor `1`, publique, e abra no navegador:

```
https://SEU-SITE.netlify.app/.netlify/functions/kommo?funis=1
```

que lista todos os funis e etapas já com os nomes das variáveis:

```json
{ "ok": true, "funis": [
  { "KOMMO_PIPELINE_ID": 1234567, "funil": "Expansão", "principal": true,
    "etapas": [ { "KOMMO_STATUS_ID": 7654321, "etapa": "Novo lead" } ] }
]}
```

Anote os dois números, cadastre nas variáveis e **apague a `KOMMO_DEBUG`**. Sem
ela a rota devolve 404, para a estrutura do CRM não ficar exposta.

Depois de salvar, rode um **novo deploy** para as variáveis valerem.

### O que chega no Kommo

Cada candidatura vira um **lead** chamado `Operador · Nome · Cidade`, com um
**contato** vinculado (nome e WhatsApp no campo de telefone) e a etiqueta
configurada.

As respostas do formulário entram de duas formas, de propósito:

**1. Em campos personalizados**, para o time filtrar e montar relatório:

| Campo no Kommo | Vem de |
| --- | --- |
| Status da candidatura | Completo / Parcial / WhatsApp direto |
| Classificação do lead | A, B, C, D ou Investidor |
| Pontuação | nota de 0 a 78 (campo numérico) |
| Perfil declarado | pergunta 4 |
| Histórico no mercado | pergunta 5 |
| Capital próprio | pergunta 6 |
| Praça pretendida | pergunta 3 |
| URL onde converteu | URL da landing, com a query string do anúncio |
| UTM source | `utm_source` da URL |
| UTM medium | `utm_medium` da URL |
| UTM campaign | `utm_campaign` da URL |

Esses campos são **criados sozinhos** na primeira candidatura que chegar: a
função consulta os campos existentes no Kommo, cria os que faltam e guarda os
ids em memória. Não precisa cadastrar nada na mão.

Como a busca é **pelo nome**, os campos que a conta da VIVA já tinha
(`URL onde converteu`, `UTM source`, `UTM medium`, `UTM campaign`) são
reaproveitados em vez de duplicados. Se alguém renomear um deles no Kommo, a
função deixa de encontrá-lo e cria outro com o nome antigo.

Se o token não tiver permissão de administrador, a criação falha em silêncio e o
lead entra assim mesmo, com as respostas na nota. O erro fica no log de funções
do Netlify.

**2. Como nota no lead**, que é o resumo que o vendedor lê de relance na linha do
tempo, sem abrir a aba de campos:

```
Status: Completo
Classificação: A · Prioridade máxima
Pontos: 72
Perfil: Vendedor(a) de empresa de formatura
Histórico no mercado: Mais de 5 anos, com carteira e reputação na minha praça
Capital próprio: De R$ 5 mil a R$ 15 mil
Praça: Juiz de Fora, MG
Nome: ...
WhatsApp: ...
Origem: https://...
```

### Rastreamento de origem (UTMs)

O Kommo não captura UTM sozinho: quem precisa ler os parâmetros da URL e mandar
junto é a landing. É o que `candidatura.js` faz.

Ao abrir a página, ele lê da query string e guarda na sessão do navegador:

`utm_source` · `utm_medium` · `utm_campaign` · `utm_content` · `utm_term` ·
`gclid` · `fbclid`

Guardar na sessão é o que garante que o dado sobreviva até o envio, já que o
formulário troca a URL para `#formulario` e `#obrigado` no meio do caminho.

Basta então marcar os anúncios normalmente:

```
https://vivaoperador.netlify.app/?utm_source=meta&utm_medium=cpc&utm_campaign=operador-set
```

Três dos parâmetros caem em campos próprios no Kommo (source, medium, campaign)
e **todos** aparecem na nota do lead, inclusive `utm_content`, `utm_term`,
`gclid`, `fbclid` e o referrer.

O campo `URL onde converteu` guarda a URL completa com a query string, então
mesmo um parâmetro que não tenha campo dedicado fica registrado ali.

### Os três tipos de lead que chegam

| Status | Quando |
| --- | --- |
| `Completo` | Terminou as 6 perguntas |
| `Parcial (abandonou)` | Saiu no meio, mas já tinha digitado o WhatsApp |
| `WhatsApp (contato direto)` | Veio pelo botão flutuante, respondeu nome, WhatsApp e perfil |

### Se o Kommo estiver fora do ar

A função sempre responde `200` e o envio é feito sem bloquear a interface. Uma
falha no CRM não trava nem atrasa o formulário para o candidato; o erro fica
registrado no log de funções do Netlify. Se o `SHEET_URL` também estiver
configurado, a planilha do Google funciona como cópia de segurança dos leads.

## O formulário (6 perguntas)

Enxuto de propósito: cada pergunta a mais custa conversão, então ficaram só as
que classificam o lead ou desenham a sociedade. O resto vai para a call de
alinhamento.

O formulário fica **fechado atrás de um botão** ("Começar minha candidatura").
Só depois do clique as perguntas aparecem. A seção fica limpa e o clique já é um
micro-compromisso.

**Os dados do lead vêm primeiro.** Nome, WhatsApp e praça são as três primeiras
perguntas, de propósito: mesmo quem abandona no meio já entrou na planilha como
lead parcial, com contato utilizável.

| # | Pergunta | Para que serve |
| --- | --- | --- |
| 1 | Primeiro, como a gente te chama? | Nome. |
| 2 | E o seu WhatsApp? | Canal de contato, capturado cedo de propósito. |
| 3 | Em qual cidade você quer operar? | Checagem no mapa de expansão. |
| 4 | Qual dessas frases descreve você hoje? | Separa as personas e vale o maior peso da nota. |
| 5 | Qual o seu histórico no mercado de formaturas? | Tempo de praça e regularidade de fechamento. |
| 6 | Quanto de capital próprio você tem? | Desenha a participação e tranquiliza quem tem pouco. |

Quem responde **"Quero investir, mas não quero operar"** na pergunta 4 pula a
pergunta de histórico no mercado e termina em **5 perguntas**, num fluxo curto
de investidor.

### URLs de etapa (para metas de conversão)

O formulário altera a URL via `history.pushState` em dois momentos, para você
conseguir criar metas no GA4, no Meta Ads ou no Netlify Analytics:

| URL | Quando dispara |
| --- | --- |
| `.../#formulario` | O visitante abriu o formulário (clicou no botão). |
| `.../#obrigado` | O visitante concluiu a candidatura. |

Abrir a página já com `#formulario` ou `#obrigado` na URL faz o formulário abrir
sozinho na pergunta 1, útil para links de anúncio que devem cair direto no
formulário. Cada troca de URL também empurra um `pageview_virtual` para o
`dataLayer`, e a conclusão dispara `Lead` no Meta Pixel.

### Botão flutuante do WhatsApp

O botão verde flutuante (e o CTA "Falar com o time de expansão") **não abre o
wa.me direto**. Primeiro sobe um modal curto pedindo **nome, WhatsApp e perfil**;
com isso o lead é gravado na planilha com status *"WhatsApp (contato direto)"* e
só então a conversa abre, já com nome e perfil na primeira mensagem.

Quem já concluiu o formulário completo não passa pelo modal, vai direto para a
conversa.

Perguntas que existiam nas versões anteriores e foram cortadas: composição da
renda, sócio complementar, "quando começar" e "como você entraria na operação".
Tempo de mercado e turmas por ano viraram a pergunta 5. Se o time de expansão
sentir falta de alguma, é só reinserir o objeto no array `QUESTIONS`.

### Como a nota funciona

Cada opção tem um peso em `candidatura.js`. Nota máxima possível: **78**
(40 perfil + 20 histórico + 18 capital).

| Faixa | Classificação | O que significa |
| --- | --- | --- |
| ≥ 56 | **A · Prioridade máxima** | Vendedor de formatura/fotografia, experiente, com praça consolidada. |
| 42–55 | **B · Alta** | Perfil bom, com um ou dois pontos a resolver. |
| 29–41 | **C · Média** | Perfil aceitável, exige mais conversa. |
| < 29 | **D · Fora do perfil** | Recebe uma tela final honesta, sem promessa de contato comercial. |
| n/a | **Investidor** | Fluxo de hunting, direcionado ao modelo não operador. |

Os pesos ficam todos no array `QUESTIONS`: é só alterar o campo `score` de cada
opção para recalibrar sem mexer no resto do código.

## Tela final

A função `composicao()` em `candidatura.js` decide o **texto de encerramento** que
o candidato lê depois de enviar: quem declarou capital a partir de R$ 15 mil vê
"Você chega com mais poder de negociação", quem marcou o fluxo de investidor vê
uma mensagem própria, e o restante vê "É exatamente a vaga que está aberta".

Isso é só copy de tela. Não vai para o CRM nem para a planilha, porque com uma
única variável de entrada (capital) o valor seria uma cópia do campo "Capital
próprio".

## Identidade visual

Mesma da landing de formandos, em versão escura:

- Laranja `#F47720` · Roxo `#3B1D64` · Roxo profundo `#170A27`
- Fontes **Lato** (300/400/700/900) e **Permanent Marker**
- Logotipo VIVA vetorizado (`assets/viva-wordmark.svg`)

## Rodar localmente

```bash
python -m http.server 8000
# abra http://localhost:8000/Operador/
```

## Números usados na página (confirmar com a VIVA)

Todos vieram dos canais oficiais (`franquias.vivaeventos.com.br`), mas valem uma
conferência antes de subir, porque a página os usa como argumento de venda:

- +10 mil eventos realizados · +300 cidades · 50 unidades na rede
- Mercado de formaturas de R$ 2,5 bilhões/ano
- Investimento padrão de uma unidade: R$ 160 mil a R$ 250 mil
  (taxa de R$ 60 mil + estrutura R$ 50–90 mil + giro R$ 50–100 mil)
- Ponto de equilíbrio entre 10 e 12 meses
- Rentabilidade acima de 15% sobre o capital investido
- 50 praças ainda disponíveis (`PRACAS_ABERTAS` no `config.js`)
- Selo de Excelência ABF, associação à ABF/Abeform/Abrape, Scale-Up Endeavor
- Depoimentos de Lúcio Medeiros (BH/Betim/Contagem) e Poliana Cabral (Ipatinga),
  reproduzidos do site oficial de franquias

A seção de números já traz um aviso de que os dados são institucionais e não
constituem promessa de rentabilidade, e o rodapé informa que a página não é
oferta pública de franquia. Vale o jurídico da VIVA revisar esses dois textos.

## Pontos que dependem de decisão da VIVA

- **Quanto é "muito baixo"**: a página promete investimento baixo sem cravar
  valor, e a pergunta 4 aceita "nada agora, entro só com trabalho". Se existir um
  piso real (ex.: R$ 15 mil), vale colocar no FAQ para não gerar frustração na
  call de alinhamento.
- **Remuneração do operador**: o FAQ afirma pró-labore pela função + participação
  nos lucros. Confirmar se é assim em todas as composições.
- **Transição do vendedor**: o FAQ orienta a respeitar contratos vigentes com o
  empregador atual. Se houver política formal da rede sobre isso, ela deve
  substituir o texto genérico.

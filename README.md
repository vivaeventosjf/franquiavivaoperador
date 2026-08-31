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
| `candidatura.js` | Formulário de 6 etapas + pontuação + composição societária + envio. |
| `config.js` | **Único arquivo que precisa ser editado** para publicar. |
| `google-apps-script.gs` | Backend que grava as candidaturas numa planilha do Google. |
| `assets/` | Logo VIVA vetorizada (SVG), PNGs e favicon. |

## Antes de publicar, edite `config.js`

```js
const WHATS = '5532988677558';   // <- WhatsApp do time de expansão (já preenchido)
const SHEET_URL = '';            // <- URL /exec do Apps Script (ver abaixo)
const CRM_URL = '';              // <- webhook do CRM, se houver
const PRACAS_ABERTAS = 50;       // <- praças disponíveis (0 esconde a escassez)
```

O WhatsApp já está preenchido com o número do time de expansão,
**(32) 98867-7558**. Enquanto `SHEET_URL` estiver vazio, o formulário funciona
normalmente na tela, mas a candidatura não é gravada em lugar nenhum.

## Receber as candidaturas numa planilha

Mesma integração da landing de formandos:

1. Crie uma planilha no Google Sheets.
2. Menu **Extensões → Apps Script**, cole o conteúdo de `google-apps-script.gs`.
3. **Implantar → Nova implantação → App da Web**
   (executar como você; acesso: qualquer pessoa).
4. Copie a URL que termina em `/exec` e cole em `SHEET_URL` no `config.js`.

Cada linha traz: data, status, classificação, pontos, composição societária
sugerida, perfil, histórico no mercado, capital próprio,
praça, nome, WhatsApp e página de origem.

Quem abandona o formulário depois de digitar o WhatsApp é gravado como
**"Parcial (abandonou)"** via `sendBeacon`. Como o WhatsApp é a **segunda**
pergunta, praticamente todo abandono vira lead resgatável.

Leads vindos do botão flutuante do WhatsApp entram com status
**"WhatsApp (contato direto)"**.

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

### Composição societária sugerida

A função `composicao()` em `candidatura.js` deduz, a partir do papel e do capital
declarados, em qual das combinações oficiais da expansão o candidato se encaixa.
Isso **não aparece para ele** na tela final (só o título e o texto de contexto),
mas vai gravado na planilha para o time de expansão:

- **Combinação 2**: quem faz vendas e pós-venda, com investidor completando o capital.
- **Combinação 3**: sócio de vendas + investidor + gerente de pós-venda
  *(a rota mais comum para o vendedor que a página quer captar)*.
- **Combinação 4**: sócio de pós-venda com capital próprio + gerente de vendas.
- **Combinação 5**: sócio de pós-venda + investidor + gerente de vendas.

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

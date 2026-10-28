// Agente de chat da Home (Claude + tool calling).
// Busca nas notas por ferramentas (RAG sem vetores: o próprio modelo decide o que
// buscar e o que ler) e executa ações na plataforma: criar notas, objetivos e hábitos.
// Roda no navegador com a chave do Claude do usuário (a mesma de Configurações).

import Anthropic from '@anthropic-ai/sdk'
import { notesApi, habitsApi } from './store'
import { getClaudeKey, getClaudeModel } from './ai'

const MAX_TOKENS = 64000 // streaming: sem risco de timeout, dá folga ao raciocínio
const MAX_TURNS = 12 // trava de segurança do laço de ferramentas
const SNIPPET = 280

/* ----------------- busca nas notas ----------------- */
const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const terms = (q) => fold(q).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1)

function countIn(hay, term) {
  let n = 0
  let i = hay.indexOf(term)
  while (i !== -1) {
    n++
    i = hay.indexOf(term, i + term.length)
  }
  return n
}

// trecho do conteúdo em volta da primeira ocorrência de algum termo
function snippetFor(content, ts) {
  const text = stripTags(content)
  const low = fold(text)
  let at = -1
  for (const t of ts) {
    const i = low.indexOf(t)
    if (i !== -1 && (at === -1 || i < at)) at = i
  }
  const start = Math.max(0, at === -1 ? 0 : at - 80)
  const out = text.slice(start, start + SNIPPET)
  return (start > 0 ? '…' : '') + out + (start + SNIPPET < text.length ? '…' : '')
}

const brief = (n) => ({
  id: n.id,
  title: n.title || '(sem título)',
  emoji: n.emoji || '',
  tags: n.tags || [],
  is_goal: !!n.is_goal,
  parent_id: n.parent_id || null,
  updated_at: n.updated_at,
  link: `/note/${n.id}`,
})

async function searchNotes({ query = '', tag, limit = 8 }) {
  const notes = await notesApi.list()
  const ts = terms(query)
  const wantTag = tag ? fold(tag) : null
  const scored = []
  for (const n of notes) {
    const tags = (n.tags || []).map(fold)
    if (wantTag && !tags.includes(wantTag)) continue
    const title = fold(n.title)
    const body = fold(stripTags(n.content))
    let score = 0
    for (const t of ts) {
      score += countIn(title, t) * 4 + tags.filter((x) => x.includes(t)).length * 3 + Math.min(countIn(body, t), 10)
    }
    if (ts.length && score === 0) continue
    scored.push({ n, score })
  }
  scored.sort((a, b) => b.score - a.score || (a.n.updated_at < b.n.updated_at ? 1 : -1))
  const top = scored.slice(0, Math.min(Math.max(1, limit), 20))
  return {
    total_matches: scored.length,
    results: top.map(({ n, score }) => ({ ...brief(n), score, snippet: snippetFor(n.content, ts) })),
  }
}

async function getNote({ id }) {
  const n = await notesApi.get(id)
  if (!n || n.is_agent) return { error: 'Nota não encontrada.' }
  const content = String(n.content || '')
  return {
    ...brief(n),
    progress: n.is_goal ? n.progress || 0 : undefined,
    done: n.is_goal ? !!n.done : undefined,
    content: content.length > 30000 ? content.slice(0, 30000) + '\n…(cortado)' : content,
  }
}

async function listNotes({ limit = 30, goals_only = false }) {
  const notes = await notesApi.list()
  const rows = (goals_only ? notes.filter((n) => n.is_goal) : notes).slice(0, Math.min(Math.max(1, limit), 100))
  return { total: notes.length, notes: rows.map((n) => ({ ...brief(n), progress: n.is_goal ? n.progress || 0 : undefined })) }
}

async function listTags() {
  const notes = await notesApi.list()
  const count = {}
  for (const n of notes) for (const t of n.tags || []) count[t] = (count[t] || 0) + 1
  return { tags: Object.entries(count).sort((a, b) => b[1] - a[1]).map(([tag, notes]) => ({ tag, notes })) }
}

const pad = (n) => String(n).padStart(2, '0')
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

async function listHabits() {
  const habits = await habitsApi.list()
  const today = new Date()
  const prefix = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-`
  return {
    habits: habits.map((h) => {
      const log = h.log || {}
      return {
        id: h.id,
        name: h.name,
        emoji: h.emoji,
        done_today: !!log[dayKey(today)],
        days_done_this_month: Object.keys(log).filter((k) => k.startsWith(prefix) && log[k]).length,
      }
    }),
  }
}

/* ----------------- ações ----------------- */
const cleanTags = (tags) =>
  Array.isArray(tags) ? [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 12) : []

async function createNote({ title, emoji, content = '', tags, parent_id }) {
  const n = await notesApi.create({
    title: title.trim(),
    emoji: emoji || '📄',
    content,
    tags: cleanTags(tags),
    parent_id: parent_id || null,
  })
  return { created: true, ...brief(n) }
}

async function createGoal({ title, emoji, content = '', tags, progress = 0 }) {
  const goals = (await notesApi.list()).filter((n) => n.is_goal)
  const n = await notesApi.create({
    is_goal: true,
    title: title.trim(),
    emoji: emoji || '🎯',
    content,
    tags: cleanTags(tags),
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    position: goals.length,
  })
  return { created: true, ...brief(n), progress: n.progress }
}

async function createHabit({ name, emoji, note_id }) {
  const habits = await habitsApi.list()
  const h = await habitsApi.create({
    name: name.trim(),
    emoji: emoji || '✅',
    note_id: note_id || null,
    position: habits.length,
  })
  return { created: true, id: h.id, name: h.name, emoji: h.emoji, link: '/habits' }
}

/* ----------------- definição das ferramentas ----------------- */
const str = { type: 'string' }
const tagsSchema = { type: 'array', items: { type: 'string' }, description: 'Tags curtas, sem #.' }

const TOOLS = [
  {
    name: 'search_notes',
    description:
      'Busca nas notas do usuário por palavras (título, tags e conteúdo, sem diferenciar acentos). Devolve as mais relevantes com um trecho. Use antes de responder qualquer pergunta sobre as notas; tente sinônimos se não achar.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Palavras-chave. Pode ser vazio para filtrar só por tag.' },
        tag: { type: 'string', description: 'Opcional: só notas com esta tag.' },
        limit: { type: 'integer', description: 'Máximo de resultados (1–20, padrão 8).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_note',
    description: 'Lê uma nota inteira (conteúdo em Markdown, tags, se é objetivo e o progresso).',
    input_schema: { type: 'object', properties: { id: str }, required: ['id'] },
  },
  {
    name: 'list_notes',
    description: 'Lista as notas mais recentes (sem conteúdo). Útil para visão geral ou para achar a nota-pai de uma subpágina.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: '1–100, padrão 30.' },
        goals_only: { type: 'boolean', description: 'Só objetivos.' },
      },
    },
  },
  {
    name: 'list_tags',
    description: 'Lista todas as tags usadas nas notas, com quantas notas cada uma tem.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_habits',
    description: 'Lista os hábitos do usuário, se foram feitos hoje e quantos dias no mês.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'create_note',
    description:
      'Cria uma nota (página). O conteúdo é Markdown e pode usar os blocos do editor descritos nas instruções. Use parent_id para criar como subpágina.',
    input_schema: {
      type: 'object',
      properties: {
        title: str,
        emoji: { type: 'string', description: 'Um único emoji que represente a nota.' },
        content: { type: 'string', description: 'Conteúdo em Markdown.' },
        tags: tagsSchema,
        parent_id: { type: 'string', description: 'Opcional: id da nota-pai.' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'create_goal',
    description: 'Cria um objetivo (uma nota marcada como objetivo, com progresso de 0 a 100). O conteúdo pode descrever o plano.',
    input_schema: {
      type: 'object',
      properties: {
        title: str,
        emoji: str,
        content: { type: 'string', description: 'Plano do objetivo em Markdown (passos como checklist).' },
        tags: tagsSchema,
        progress: { type: 'integer', description: '0–100, padrão 0.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_habit',
    description: 'Cria um hábito diário (aparece na página Hábitos, marcado dia a dia).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome curto do hábito.' },
        emoji: str,
        note_id: { type: 'string', description: 'Opcional: nota ligada ao hábito.' },
      },
      required: ['name'],
    },
  },
].map((t) => ({ ...t, eager_input_streaming: true }))

const RUN = {
  search_notes: searchNotes,
  get_note: getNote,
  list_notes: listNotes,
  list_tags: listTags,
  list_habits: listHabits,
  create_note: createNote,
  create_goal: createGoal,
  create_habit: createHabit,
}

// com eager_input_streaming a API não valida o input: confere aqui antes de executar
function validate(name, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'input não é um objeto'
  const tool = TOOLS.find((t) => t.name === name)
  if (!tool) return `ferramenta desconhecida: ${name}`
  const { properties = {}, required = [] } = tool.input_schema
  for (const k of required) if (input[k] === undefined) return `falta o campo "${k}"`
  for (const [k, v] of Object.entries(input)) {
    const p = properties[k]
    if (!p) continue
    if (p.type === 'string' && typeof v !== 'string') return `"${k}" deve ser texto`
    if (p.type === 'integer' && !Number.isInteger(v)) return `"${k}" deve ser inteiro`
    if (p.type === 'boolean' && typeof v !== 'boolean') return `"${k}" deve ser true/false`
    if (p.type === 'array' && !Array.isArray(v)) return `"${k}" deve ser lista`
  }
  if ((name === 'create_note' || name === 'create_goal') && !input.title.trim()) return 'título vazio'
  if (name === 'create_habit' && !input.name.trim()) return 'nome vazio'
  return null
}

/* ----------------- instruções ----------------- */
function systemPrompt({ userName, lang }) {
  return `Você é o assistente do Nova notes, o "segundo cérebro" pessoal de ${userName || 'quem está usando'}. Você conversa na tela inicial do app, consulta as notas dele com ferramentas e executa ações quando ele pede.

Responda no idioma do usuário (o app está em ${lang === 'en' ? 'inglês' : 'português'}). Seja direto e caloroso; respostas curtas, a não ser que o pedido peça mais.

# Como o app funciona
- Notas (páginas): cada uma tem título, um emoji, tags e conteúdo em Markdown. Notas podem ter subpáginas (parent_id) e aparecem em árvore na barra lateral. O editor é estilo Notion: digitar "/" abre os blocos.
- Objetivos: são notas marcadas como objetivo, com progresso de 0 a 100% e um estado de concluído. Ficam na página Objetivos, em cards.
- Hábitos: itens diários (nome + emoji) marcados dia a dia numa tabela do mês, na página Hábitos e no ícone de hábitos que orbita a Home. Um hábito pode estar ligado a uma nota.
- Agentes: prompts reutilizáveis que o usuário cria e roda dentro do editor com "/agente". Você não mexe neles.
- Também há busca (⌘K), gravação por voz que vira nota, compartilhamento de notas e lembretes.

# Consultando as notas
Para qualquer pergunta sobre o que o usuário escreveu, use as ferramentas antes de responder: search_notes (tente outras palavras ou sinônimos se não achar), list_tags, list_notes e get_note para ler a nota inteira. Baseie a resposta no que está nas notas e diga quando não encontrou algo, em vez de inventar. Ao citar uma nota, use um link Markdown para ela: [Título](/note/<id>).

# Criando conteúdo
Crie notas, objetivos ou hábitos quando o usuário pedir, sem pedir confirmação para pedidos claros; se faltar algo essencial, pergunte. Depois de criar, diga o que criou com o link. Dê títulos curtos, um emoji que combine e tags úteis (reaproveite as tags que já existem, veja list_tags).

Não escreva notas só com parágrafos de texto: use a estrutura do editor para deixar a nota útil e bonita.
- Markdown: títulos (#, ##, ###), **negrito**, *itálico*, listas, listas numeradas, citações (>), blocos de código, divisores (---).
- Checklist para tudo que pode ser concluído (tarefas, compras, passos): linhas "- [ ] item" (e "- [x] item" para feito).
- Tabelas Markdown para comparar, planejar ou organizar dados em colunas (cabeçalho + linha de ---).
- Link para outra nota: [Título](/note/<id>).
- Toggle (bloco recolhível), escrito como HTML numa linha só:
  <div data-type="toggle" data-title="Título do toggle" data-open="true" data-level="0"><div class="toggle-body"><p>Conteúdo</p><ul><li><p>item</p></li></ul></div></div>
  data-level 1, 2 ou 3 deixa o título do toggle no tamanho de um título #, ## ou ###. O corpo é HTML (<p>, <ul><li><p>…</p></li></ul>, <strong>).
- Marcador de progresso (grade de dias para acompanhar um hábito ou desafio), HTML numa linha só:
  <div data-type="progress-tracker" data-count="30" data-done="" data-label="Desafio de 30 dias"></div>
- Não crie lembretes nem imagens: eles dependem de agendamento e upload feitos pelo usuário no editor.

Hoje é ${new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`
}

/* ----------------- laço do agente ----------------- */
// history: Anthropic.Beta.BetaMessageParam[] — só cresce (append-only), o componente guarda entre turnos.
// on: { text(delta), toolStart({ id, name, input }), toolEnd({ id, name, ok, result }) }
export async function runAgent({ history, userText, userName, lang, on = {} }) {
  const key = getClaudeKey()
  if (!key) {
    const e = new Error('NO_KEY')
    e.code = 'NO_KEY'
    throw e
  }
  const model = getClaudeModel()
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })
  const system = systemPrompt({ userName, lang })
  const created = []

  history.push({ role: 'user', content: userText })

  let jsonRetries = 0
  let wroteText = false // texto de rodadas diferentes vira parágrafos separados
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let firstDelta = true
    const stream = client.beta.messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      system,
      tools: TOOLS,
      messages: history,
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' }, // instruções + ferramentas ficam em cache entre turnos
      // se o modelo recusar por política, a API refaz o pedido num modelo de reserva
      // (o Haiku 5.5 não tem fallback do lado do servidor)
      ...(model === 'claude-haiku-5-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
    })
    stream.on('text', (d) => {
      on.text?.(firstDelta && wroteText ? '\n\n' + d : d)
      firstDelta = false
      wroteText = true
    })

    let message
    try {
      message = await stream.finalMessage()
      jsonRetries = 0
    } catch (err) {
      // só repete quando o input de uma ferramenta não veio em JSON válido; erro da API sobe
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err
      continue
    }

    history.push({ role: 'assistant', content: message.content })

    if (message.stop_reason === 'refusal') {
      const e = new Error('REFUSAL')
      e.code = 'REFUSAL'
      throw e
    }
    if (message.stop_reason === 'pause_turn') continue

    const uses = message.content.filter((b) => b.type === 'tool_use')
    // input de ferramenta cortado no limite: nunca executa
    if (message.stop_reason === 'max_tokens' && uses.length) throw new Error('Resposta longa demais.')
    if (message.stop_reason !== 'tool_use' || !uses.length) return { created }

    // as ferramentas de um turno rodam juntas e voltam todas numa única mensagem
    const results = await Promise.all(
      uses.map(async (u) => {
        on.toolStart?.({ id: u.id, name: u.name, input: u.input })
        const problem = validate(u.name, u.input)
        if (problem) {
          on.toolEnd?.({ id: u.id, name: u.name, ok: false, result: { error: problem } })
          return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Input inválido: ${problem}` }
        }
        try {
          const result = await RUN[u.name](u.input)
          if (result?.created) created.push({ tool: u.name, ...result })
          on.toolEnd?.({ id: u.id, name: u.name, ok: !result?.error, result })
          return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(result), ...(result?.error ? { is_error: true } : {}) }
        } catch (e) {
          on.toolEnd?.({ id: u.id, name: u.name, ok: false, result: { error: e.message } })
          return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: `Falhou: ${e.message || 'erro'}` }
        }
      }),
    )
    history.push({ role: 'user', content: results })
  }
  return { created }
}

// mensagem amigável para os erros mais comuns
export function agentErrorMessage(e, t) {
  if (e?.code === 'NO_KEY') return t('chat.noKey')
  if (e?.code === 'REFUSAL') return t('chat.refusal')
  if (e instanceof Anthropic.AuthenticationError) return t('chat.badKey')
  if (e instanceof Anthropic.RateLimitError) return t('chat.rateLimit')
  if (e instanceof Anthropic.APIConnectionError) return t('chat.offline')
  if (e instanceof Anthropic.APIError) return e.message || t('chat.failed')
  return e?.message || t('chat.failed')
}

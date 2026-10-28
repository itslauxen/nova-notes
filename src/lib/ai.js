// Geração de texto e transcrição de voz.
// Provedores (chave do próprio usuário, chamada direto do navegador):
// Groq, Cerebras, Gemini e Claude (SDK oficial da Anthropic).
// Ordem para texto: o provedor escolhido primeiro, depois os outros que têm
// chave, e por último o proxy serverless /api/generate.
// Transcrição: Groq Whisper (chave do usuário) ou proxy /api/transcribe.

import Anthropic from '@anthropic-ai/sdk'

const GROQ_MODEL = 'llama-3.3-70b-versatile'
const GROQ_WHISPER = 'whisper-large-v3-turbo'
const CEREBRAS_MODEL = 'llama-3.3-70b'
const GEMINI_MODEL = 'gemini-2.5-flash'
const MAX_TOKENS = 3000 // saída mais longa
// Claude: o raciocínio (thinking) conta no max_tokens, então dá mais folga
const CLAUDE_MAX_TOKENS = 16000

// modelos do Claude oferecidos em Configurações (o primeiro é o padrão)
export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1' },
]

const GEMINI_STORAGE = 'nova-gemini-key'
const GROQ_STORAGE = 'nova-groq-key'
const CEREBRAS_STORAGE = 'nova-cerebras-key'
const CLAUDE_STORAGE = 'nova-claude-key'
const CLAUDE_MODEL_STORAGE = 'nova-claude-model'
const PROVIDER_STORAGE = 'nova-ai-provider' // 'groq' | 'cerebras' | 'gemini' | 'claude'

// instrução fixa: sem preâmbulos, só o conteúdo pedido, em Markdown bem formatado
const SYSTEM =
  'Você é um assistente de escrita dentro de um editor de notas estilo Notion. ' +
  'Escreva APENAS o que foi pedido, sem preâmbulos, saudações ou frases como "Claro! Aqui está...". ' +
  'Nunca comente o que vai fazer. Use Markdown bem formatado e aproveite os recursos quando ajudarem ' +
  'a organizar: títulos (#, ##), negrito, listas, citações (>) e blocos de código.\n' +
  'IMPORTANTE - use proativamente quando fizer sentido:\n' +
  '• Checkboxes (linhas "- [ ] ") para QUALQUER coisa acionável: listas de mercado/compras, tarefas, ' +
  'passos a executar, checklists, itens a revisar, metas. Prefira checkbox a bullet sempre que os itens ' +
  'puderem ser "concluídos".\n' +
  '• Tabelas Markdown (com | e cabeçalho separado por ---) para comparar opções, organizar dados, ' +
  'cronogramas, prós e contras, ou qualquer informação com colunas.\n' +
  'Não envolva a resposta inteira em bloco de código, a menos que seja código.'

export function getGeminiKey() {
  try { return localStorage.getItem(GEMINI_STORAGE) || '' } catch { return '' }
}
export function setGeminiKey(k) {
  try { k ? localStorage.setItem(GEMINI_STORAGE, k) : localStorage.removeItem(GEMINI_STORAGE) } catch {}
}
export function getGroqKey() {
  try { return localStorage.getItem(GROQ_STORAGE) || '' } catch { return '' }
}
export function setGroqKey(k) {
  try { k ? localStorage.setItem(GROQ_STORAGE, k) : localStorage.removeItem(GROQ_STORAGE) } catch {}
}
export function getCerebrasKey() {
  try { return localStorage.getItem(CEREBRAS_STORAGE) || '' } catch { return '' }
}
export function setCerebrasKey(k) {
  try { k ? localStorage.setItem(CEREBRAS_STORAGE, k) : localStorage.removeItem(CEREBRAS_STORAGE) } catch {}
}
export function getClaudeKey() {
  try { return localStorage.getItem(CLAUDE_STORAGE) || '' } catch { return '' }
}
export function setClaudeKey(k) {
  try { k ? localStorage.setItem(CLAUDE_STORAGE, k) : localStorage.removeItem(CLAUDE_STORAGE) } catch {}
}
export function getClaudeModel() {
  try {
    const m = localStorage.getItem(CLAUDE_MODEL_STORAGE)
    return CLAUDE_MODELS.some((x) => x.id === m) ? m : CLAUDE_MODELS[0].id
  } catch { return CLAUDE_MODELS[0].id }
}
export function setClaudeModel(m) {
  try { localStorage.setItem(CLAUDE_MODEL_STORAGE, m) } catch {}
}

// provedor preferido escolhido pelo usuário (padrão: groq)
export function getProvider() {
  try { return localStorage.getItem(PROVIDER_STORAGE) || 'groq' } catch { return 'groq' }
}
export function setProvider(p) {
  try { localStorage.setItem(PROVIDER_STORAGE, p) } catch {}
}

const QUOTA_MSG =
  'Limite de uso da IA atingido por enquanto. Os planos grátis resetam por minuto e por dia — tente de novo em alguns minutos.'

function parseJson(s) {
  try {
    const m = s.match(/\{[\s\S]*\}/)
    return m ? JSON.parse(m[0]) : null
  } catch {
    return null
  }
}

/* ----------------- Groq / Cerebras (OpenAI-compatible) ----------------- */
async function openaiStyleText(url, model, prompt, key, label) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt },
      ],
    }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(r.status === 429 ? QUOTA_MSG : data?.error?.message || `Erro na API do ${label}.`)
    err.status = r.status
    throw err
  }
  return (data.choices?.[0]?.message?.content || '').trim()
}
const groqText = (prompt, key) =>
  openaiStyleText('https://api.groq.com/openai/v1/chat/completions', GROQ_MODEL, prompt, key, 'Groq')
const cerebrasText = (prompt, key) =>
  openaiStyleText('https://api.cerebras.ai/v1/chat/completions', CEREBRAS_MODEL, prompt, key, 'Cerebras')

/* ----------------- Gemini ----------------- */
async function geminiText(prompt, key) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS },
      }),
    },
  )
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const err = new Error(r.status === 429 ? QUOTA_MSG : data?.error?.message || 'Erro na API do Gemini.')
    err.status = r.status
    throw err
  }
  return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim()
}

/* ----------------- Claude (SDK oficial da Anthropic) ----------------- */
async function claudeText(prompt, key) {
  const model = getClaudeModel()
  // a chave é do próprio usuário e fica no navegador dele (mesmo modelo dos outros provedores)
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })
  let res
  try {
    res = await client.beta.messages.create({
      model,
      max_tokens: CLAUDE_MAX_TOKENS,
      system: SYSTEM,
      // texto de nota: esforço médio basta (no Opus 5.5 e no Haiku 5.5 já é o padrão; aqui fica explícito)
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: prompt }],
      // se o modelo recusar por política, a API refaz o pedido num modelo de reserva na mesma chamada
      // (o Haiku 5.5 não tem fallback do lado do servidor)
      ...(model === 'claude-haiku-5-5'
        ? {}
        : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
    })
  } catch (e) {
    let msg = 'Erro na API do Claude.'
    if (e instanceof Anthropic.RateLimitError) msg = QUOTA_MSG
    else if (e instanceof Anthropic.AuthenticationError) msg = 'Chave do Claude inválida. Confira em Configurações.'
    else if (e instanceof Anthropic.PermissionDeniedError) msg = 'Sua chave do Claude não tem acesso a esse modelo.'
    else if (e instanceof Anthropic.APIError && e.message) msg = e.message
    const err = new Error(msg)
    err.status = e?.status
    throw err
  }
  if (res.stop_reason === 'refusal') {
    const err = new Error('O Claude recusou esse pedido.')
    err.status = 400
    throw err
  }
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
}

/* ----------------- cadeia de provedores ----------------- */
const keyFor = (p) =>
  p === 'groq' ? getGroqKey() : p === 'cerebras' ? getCerebrasKey() : p === 'claude' ? getClaudeKey() : getGeminiKey()
const callProvider = (p, prompt, key) =>
  p === 'groq' ? groqText(prompt, key)
  : p === 'cerebras' ? cerebrasText(prompt, key)
  : p === 'claude' ? claudeText(prompt, key)
  : geminiText(prompt, key)

// ordem: provedor escolhido primeiro, depois os outros como fallback
function providerOrder() {
  const sel = getProvider()
  const all = ['groq', 'cerebras', 'gemini', 'claude']
  return [sel, ...all.filter((p) => p !== sel)]
}

// texto: provedor preferido -> fallbacks com chave -> proxy serverless
export async function generateText(prompt) {
  const order = providerOrder()
  let lastErr
  for (const p of order) {
    const key = keyFor(p)
    if (!key) continue
    try {
      return await callProvider(p, prompt, key)
    } catch (e) {
      lastErr = e
    }
  }
  try {
    return await proxyText(prompt, getProvider())
  } catch (e) {
    throw lastErr || e
  }
}

async function proxyText(prompt, provider) {
  let res
  try {
    res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, provider }),
    })
  } catch {
    throw new Error('Configure uma chave de IA (Groq, Cerebras, Gemini ou Claude) em Configurações.')
  }
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    throw new Error('Configure uma chave de IA (Groq, Cerebras, Gemini ou Claude) em Configurações.')
  }
  const data = await res.json()
  if (!res.ok) {
    if (res.status === 429) throw new Error(QUOTA_MSG)
    throw new Error(data.error || 'Falha ao gerar texto.')
  }
  return data.text || ''
}

// Gera o conteúdo da nota. Se wantMeta, também pede título e emoji.
export async function generateNote(instruction, wantMeta) {
  if (wantMeta) {
    const p = `Você é um assistente de notas. Gere o conteúdo em Markdown a partir do pedido, além de um título curto (máx. 6 palavras) e um único emoji que represente a nota.\nResponda APENAS com JSON válido: {"emoji":"<emoji>","title":"<título>","content":"<markdown>"}.\nPedido: ${instruction}`
    const raw = await generateText(p)
    const parsed = parseJson(raw)
    if (parsed && parsed.content) return { content: parsed.content, title: parsed.title, emoji: parsed.emoji }
    return { content: raw }
  }
  const content = await generateText(instruction)
  return { content }
}

/* ----------------- transcrição de voz (Whisper via Groq) ----------------- */
export async function transcribe(blob) {
  const groqKey = getGroqKey()

  // 1) Groq direto (multipart)
  if (groqKey) {
    const form = new FormData()
    form.append('file', blob, 'audio.webm')
    form.append('model', GROQ_WHISPER)
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      if (r.status === 429) throw new Error(QUOTA_MSG)
      throw new Error(data?.error?.message || 'Falha ao transcrever o áudio.')
    }
    return (data.text || '').trim()
  }

  // 2) proxy serverless (base64)
  const b64 = await blobToBase64(blob)
  let res
  try {
    res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: b64, mime: blob.type || 'audio/webm' }),
    })
  } catch {
    throw new Error('Para usar voz, configure sua chave do Groq em Configurações.')
  }
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    throw new Error('Para usar voz, configure sua chave do Groq em Configurações.')
  }
  const data = await res.json()
  if (!res.ok) {
    if (res.status === 429) throw new Error(QUOTA_MSG)
    throw new Error(data.error || 'Falha ao transcrever o áudio.')
  }
  return (data.text || '').trim()
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

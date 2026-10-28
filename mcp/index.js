#!/usr/bin/env node
// MCP server para o Nova Notes: cria, edita, lista e busca páginas via Claude.
// Fala direto com o Supabase do Nova Notes autenticando com o SEU login
// (email/senha), então o RLS garante que só as SUAS notas são acessadas.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  NOVA_EMAIL,
  NOVA_PASSWORD,
  NOVA_APP_URL = 'https://novanotes.lauxen.dev',
} = process.env

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !NOVA_EMAIL || !NOVA_PASSWORD) {
  console.error(
    'Faltam variáveis de ambiente. Defina: SUPABASE_URL, SUPABASE_ANON_KEY, NOVA_EMAIL, NOVA_PASSWORD.',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
})

// login preguiçoso e memoizado — o servidor sobe rápido e só autentica no 1º uso
let userId = null
async function ensureAuth() {
  if (userId) return userId
  const { data, error } = await supabase.auth.signInWithPassword({
    email: NOVA_EMAIL,
    password: NOVA_PASSWORD,
  })
  if (error) throw new Error('Login no Nova Notes falhou: ' + error.message)
  userId = data.user.id
  return userId
}

const appUrl = NOVA_APP_URL.replace(/\/$/, '')
const link = (id) => `${appUrl}/note/${id}`
const nowIso = () => new Date().toISOString()
const ok = (obj) => ({
  content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }],
})
const fail = (msg) => ({ content: [{ type: 'text', text: 'Erro: ' + msg }], isError: true })

const server = new McpServer({ name: 'nova-notes', version: '0.1.0' })

// ---- listar ----
server.tool(
  'list_notes',
  'Lista as páginas (notas) do usuário no Nova Notes. Retorna id, título, emoji, tags e data de atualização.',
  {
    limit: z.number().int().min(1).max(100).optional().describe('quantas páginas (padrão 30)'),
    goals_only: z.boolean().optional().describe('apenas objetivos (is_goal)'),
  },
  async ({ limit = 30, goals_only = false }) => {
    try {
      await ensureAuth()
      let q = supabase
        .from('notes')
        .select('id,title,emoji,tags,is_goal,parent_id,updated_at')
        .eq('is_agent', false)
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (goals_only) q = q.eq('is_goal', true)
      const { data, error } = await q
      if (error) throw error
      return ok((data || []).map((n) => ({ ...n, url: link(n.id) })))
    } catch (e) {
      return fail(e.message)
    }
  },
)

// ---- buscar ----
server.tool(
  'search_notes',
  'Busca páginas por texto no título ou no conteúdo (Markdown).',
  {
    query: z.string().min(1).describe('texto a buscar'),
    limit: z.number().int().min(1).max(50).optional(),
  },
  async ({ query, limit = 20 }) => {
    try {
      await ensureAuth()
      const like = `%${query.replace(/[%,]/g, '')}%`
      const { data, error } = await supabase
        .from('notes')
        .select('id,title,emoji,updated_at')
        .eq('is_agent', false)
        .or(`title.ilike.${like},content.ilike.${like}`)
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return ok((data || []).map((n) => ({ ...n, url: link(n.id) })))
    } catch (e) {
      return fail(e.message)
    }
  },
)

// ---- ler ----
server.tool(
  'get_note',
  'Lê uma página completa (inclui o conteúdo em Markdown) pelo id.',
  { id: z.string().describe('id da página') },
  async ({ id }) => {
    try {
      await ensureAuth()
      const { data, error } = await supabase.from('notes').select('*').eq('id', id).single()
      if (error) throw error
      return ok({ ...data, url: link(data.id) })
    } catch (e) {
      return fail(e.message)
    }
  },
)

// ---- criar ----
server.tool(
  'create_note',
  'Cria uma nova página. O conteúdo é Markdown. Informe parent_id para criar uma subpágina aninhada.',
  {
    title: z.string().describe('título da página'),
    content: z.string().optional().describe('conteúdo em Markdown'),
    emoji: z.string().optional(),
    tags: z.array(z.string()).optional(),
    parent_id: z.string().optional().describe('id da página-mãe (subpágina)'),
    is_goal: z.boolean().optional().describe('marcar como objetivo'),
  },
  async ({ title, content = '', emoji = '📄', tags = [], parent_id = null, is_goal = false }) => {
    try {
      const uid = await ensureAuth()
      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: uid,
          title,
          content,
          emoji,
          tags,
          is_goal,
          is_agent: false,
          progress: 0,
          done: false,
          position: 0,
          parent_id,
        })
        .select()
        .single()
      if (error) throw error
      return ok({ id: data.id, title: data.title, url: link(data.id) })
    } catch (e) {
      return fail(e.message)
    }
  },
)

// ---- editar ----
server.tool(
  'update_note',
  'Atualiza campos de uma página (só os enviados). O conteúdo em Markdown SUBSTITUI o atual — use append_to_note para adicionar ao fim.',
  {
    id: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
    emoji: z.string().optional(),
    tags: z.array(z.string()).optional(),
    is_goal: z.boolean().optional(),
    done: z.boolean().optional(),
    parent_id: z.string().nullable().optional(),
  },
  async ({ id, ...patch }) => {
    try {
      await ensureAuth()
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
      if (!Object.keys(clean).length) return fail('nada para atualizar')
      const { data, error } = await supabase
        .from('notes')
        .update({ ...clean, updated_at: nowIso() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return ok({ id: data.id, title: data.title, url: link(data.id) })
    } catch (e) {
      return fail(e.message)
    }
  },
)

// ---- anexar ----
server.tool(
  'append_to_note',
  'Anexa um trecho de Markdown ao fim do conteúdo de uma página existente (sem apagar o resto).',
  { id: z.string(), content: z.string().describe('Markdown a acrescentar') },
  async ({ id, content }) => {
    try {
      await ensureAuth()
      const { data: cur, error: e1 } = await supabase
        .from('notes')
        .select('content')
        .eq('id', id)
        .single()
      if (e1) throw e1
      const merged = (cur.content || '').replace(/\s*$/, '') + '\n\n' + content + '\n'
      const { data, error } = await supabase
        .from('notes')
        .update({ content: merged, updated_at: nowIso() })
        .eq('id', id)
        .select('id,title')
        .single()
      if (error) throw error
      return ok({ id: data.id, title: data.title, url: link(data.id) })
    } catch (e) {
      return fail(e.message)
    }
  },
)

// ---- apagar ----
server.tool(
  'delete_note',
  'Apaga uma página permanentemente pelo id. Use com cuidado — não dá pra desfazer.',
  { id: z.string() },
  async ({ id }) => {
    try {
      await ensureAuth()
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (error) throw error
      return ok(`Página ${id} apagada.`)
    } catch (e) {
      return fail(e.message)
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('nova-notes MCP rodando (stdio).')

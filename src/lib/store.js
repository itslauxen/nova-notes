// Camada de dados única. Se o Supabase estiver configurado, usa a nuvem.
// Caso contrário, cai automaticamente para o localStorage do navegador,
// para o app rodar de imediato (mesma API nos dois casos).

import { supabase, isSupabaseConfigured } from './supabase'

const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  's' + Date.now() + Math.random().toString(16).slice(2)

const now = () => new Date().toISOString()

/* ----------------- backend local ----------------- */
const LS = {
  read(table) {
    try {
      return JSON.parse(localStorage.getItem('nova-' + table) || '[]')
    } catch {
      return []
    }
  },
  write(table, rows) {
    localStorage.setItem('nova-' + table, JSON.stringify(rows))
  },
}

const local = {
  async list(table, orderBy) {
    const rows = LS.read(table)
    rows.sort((a, b) => (a[orderBy] < b[orderBy] ? 1 : -1))
    return rows
  },
  async get(table, id) {
    return LS.read(table).find((r) => r.id === id) || null
  },
  async insert(table, data) {
    const rows = LS.read(table)
    const row = { id: uid(), created_at: now(), updated_at: now(), ...data }
    rows.unshift(row)
    LS.write(table, rows)
    return row
  },
  async update(table, id, patch) {
    const rows = LS.read(table)
    const i = rows.findIndex((r) => r.id === id)
    if (i === -1) return null
    rows[i] = { ...rows[i], ...patch, updated_at: now() }
    LS.write(table, rows)
    return rows[i]
  },
  async remove(table, id) {
    LS.write(table, LS.read(table).filter((r) => r.id !== id))
  },
}

/* ----------------- backend supabase ----------------- */
const cloud = {
  async list(table, orderBy) {
    const { data, error } = await supabase.from(table).select('*').order(orderBy, { ascending: false })
    if (error) throw error
    return data
  },
  async get(table, id) {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).single()
    if (error) throw error
    return data
  },
  async insert(table, data) {
    const { data: row, error } = await supabase.from(table).insert(data).select().single()
    if (error) throw error
    return row
  },
  async update(table, id, patch) {
    const { data, error } = await supabase
      .from(table)
      .update({ ...patch, updated_at: now() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },
  async remove(table, id) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
  },
}

const backend = isSupabaseConfigured ? cloud : local

// id do usuário logado (setado pelo AuthContext) — separa próprias x compartilhadas
let currentUserId = null
export function setCurrentUser(id) {
  currentUserId = id || null
}
const owned = (rows) =>
  isSupabaseConfigured ? rows.filter((n) => n.user_id === currentUserId) : rows
const shared = (rows) =>
  isSupabaseConfigured ? rows.filter((n) => n.user_id && n.user_id !== currentUserId) : []

/* ----------------- API pública ----------------- */
export const notesApi = {
  // minhas notas (exclui agentes e compartilhadas comigo)
  list: async () =>
    owned((await backend.list('notes', 'updated_at')).filter((n) => !n.is_agent)),
  // notas compartilhadas COMIGO (de outros usuários)
  listShared: async () =>
    shared((await backend.list('notes', 'updated_at')).filter((n) => !n.is_agent)),
  // objetivos são notas marcadas com is_goal = true, ordenados por position
  listGoals: async () =>
    owned(await backend.list('notes', 'updated_at'))
      .filter((n) => n.is_goal && !n.is_agent)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
  get: (id) => backend.get('notes', id),
  create: (data = {}) =>
    backend.insert('notes', {
      // título vazio: a interface mostra "Sem título"/"Untitled" no idioma atual
      title: '', content: '', emoji: '📄', tags: [],
      is_goal: false, is_agent: false, progress: 0, done: false, position: 0, parent_id: null, ...data,
    }),
  update: (id, patch) => backend.update('notes', id, patch),
  remove: (id) => backend.remove('notes', id),
}

// Agentes = notas com is_agent = true (título = nome, content = prompt em Markdown)
export const agentsApi = {
  list: async () =>
    owned((await backend.list('notes', 'updated_at')).filter((n) => n.is_agent)),
  listShared: async () =>
    shared((await backend.list('notes', 'updated_at')).filter((n) => n.is_agent)),
  create: (data = {}) =>
    // nome vazio: o card mostra o placeholder "Nome do agente"/"Agent name" no idioma atual
    notesApi.create({ is_agent: true, emoji: '🤖', title: '', ...data }),
  update: (id, patch) => backend.update('notes', id, patch),
  remove: (id) => backend.remove('notes', id),
}

// Lista de usuários (perfis) pra escolher com quem compartilhar
export const usersApi = {
  list: async () => {
    if (!isSupabaseConfigured) return []
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, name')
      .order('name', { nullsFirst: false })
    if (error) throw error
    return (data || []).filter((u) => u.id !== currentUserId)
  },
}

// Compartilhamento (só na nuvem)
export const sharesApi = {
  listFor: async (noteId) => {
    if (!isSupabaseConfigured) return []
    const { data, error } = await supabase
      .from('shares')
      .select('*')
      .eq('note_id', noteId)
      .order('created_at')
    if (error) throw error
    return data
  },
  share: async (noteId, email) => {
    const { data, error } = await supabase
      .from('shares')
      .insert({ note_id: noteId, shared_with_email: email.trim().toLowerCase() })
      .select()
      .single()
    if (error) throw error
    return data
  },
  unshare: async (id) => {
    const { error } = await supabase.from('shares').delete().eq('id', id)
    if (error) throw error
  },
}

export const habitsApi = {
  list: async () =>
    (await backend.list('habits', 'created_at')).sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.created_at < b.created_at ? -1 : 1),
    ),
  create: (data = {}) =>
    backend.insert('habits', { name: 'Novo hábito', emoji: '✅', note_id: null, log: {}, position: 0, ...data }),
  update: (id, patch) => backend.update('habits', id, patch),
  remove: (id) => backend.remove('habits', id),
}

// Lembretes (ligados a uma nota). Disparam push pela Edge Function.
export const remindersApi = {
  listForNote: async (noteId) => {
    if (!noteId) return []
    const rows = await backend.list('reminders', 'created_at')
    return owned(rows).filter((r) => r.note_id === noteId)
  },
  create: (data = {}) =>
    backend.insert('reminders', {
      note_id: null, text: '', kind: 'once', done: false, active: true, ...data,
    }),
  update: (id, patch) => backend.update('reminders', id, patch),
  remove: (id) => backend.remove('reminders', id),
}

export { isSupabaseConfigured }

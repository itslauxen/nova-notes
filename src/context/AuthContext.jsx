import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { setGeminiKey, setGroqKey, setCerebrasKey, setClaudeKey, setClaudeModel, setProvider } from '../lib/ai'
import { setCurrentUser } from '../lib/store'

const AuthContext = createContext(null)

// puxa as chaves/preferências de IA salvas na conta para o cache local (runtime)
function syncKeys(user) {
  const g = user?.user_metadata?.gemini_key
  if (g) setGeminiKey(g)
  const q = user?.user_metadata?.groq_key
  if (q) setGroqKey(q)
  const c = user?.user_metadata?.cerebras_key
  if (c) setCerebrasKey(c)
  const a = user?.user_metadata?.claude_key
  if (a) setClaudeKey(a)
  const am = user?.user_metadata?.claude_model
  if (am) setClaudeModel(am)
  const p = user?.user_metadata?.ai_provider
  if (p) setProvider(p)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setCurrentUser(data.session?.user?.id)
      syncKeys(data.session?.user)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      setCurrentUser(session?.user?.id)
      syncKeys(session?.user)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = {
    user,
    loading,
    // só exige login quando há Supabase configurado
    needsAuth: isSupabaseConfigured && !user,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password, name) =>
      supabase.auth.signUp({ email, password, options: { data: { name } } }),
    updateName: (name) => supabase.auth.updateUser({ data: { name } }),
    updateGeminiKey: (gemini_key) => supabase.auth.updateUser({ data: { gemini_key } }),
    updateGroqKey: (groq_key) => supabase.auth.updateUser({ data: { groq_key } }),
    updateCerebrasKey: (cerebras_key) => supabase.auth.updateUser({ data: { cerebras_key } }),
    updateClaudeKey: (claude_key) => supabase.auth.updateUser({ data: { claude_key } }),
    updateClaudeModel: (claude_model) => supabase.auth.updateUser({ data: { claude_model } }),
    updateAiProvider: (ai_provider) => supabase.auth.updateUser({ data: { ai_provider } }),
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}

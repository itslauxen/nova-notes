import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { detectLang, translate, LANGS } from '../lib/i18n'

const LanguageContext = createContext(null)
const STORAGE_KEY = 'nova-lang'

// Idioma inicial: preferência salva; se não houver (ex.: conta recém-criada
// neste dispositivo), cai no idioma do navegador.
function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && LANGS.some((l) => l.id === saved)) return saved
  } catch {}
  return detectLang()
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(load)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang) } catch {}
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo(
    () => ({
      lang,
      langs: LANGS,
      setLang: (l) => setLangState(l),
      t: (key, vars) => translate(lang, key, vars),
    }),
    [lang],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLang() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLang deve ser usado dentro de LanguageProvider')
  return ctx
}

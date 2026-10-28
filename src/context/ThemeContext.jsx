import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { applyPalette, buildPalette, FONTS } from '../theme/palette'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'nova-theme'

const defaults = {
  color: '#a855f7', // violeta matrix
  mode: 'dark',
  font: 'space',
}

function load() {
  try {
    // o app é só escuro: ignora um modo claro salvo de antes
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'), mode: 'dark' }
  } catch {
    return defaults
  }
}

export function ThemeProvider({ children }) {
  const [settings, setSettings] = useState(load)

  // aplica paleta sempre que cor/modo mudam
  useEffect(() => {
    applyPalette(buildPalette(settings.color, settings.mode))
    document.documentElement.dataset.mode = settings.mode
  }, [settings.color, settings.mode])

  // aplica fonte
  useEffect(() => {
    const font = FONTS.find((f) => f.id === settings.font) || FONTS[0]
    document.documentElement.style.setProperty('--font-ui', font.stack)
  }, [settings.font])

  // persiste
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const value = useMemo(
    () => ({
      settings,
      setColor: (color) => setSettings((s) => ({ ...s, color })),
      setMode: (mode) => setSettings((s) => ({ ...s, mode })),
      toggleMode: () => setSettings((s) => ({ ...s, mode: s.mode === 'dark' ? 'light' : 'dark' })),
      setFont: (font) => setSettings((s) => ({ ...s, font })),
    }),
    [settings],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme deve ser usado dentro de ThemeProvider')
  return ctx
}

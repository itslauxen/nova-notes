import { useEffect } from 'react'
import { useLang } from '../context/LanguageContext'

// Seletor de emojis simples (sem dependências). Clique escolhe; Esc/fora fecha.
const GROUPS = [
  { labelKey: 'emoji.frequent', items: '📄 📝 ✅ ⭐ 🎯 🔥 💡 🚀 📌 ❤️ 🎵 💪 🧠 📚 ☕'.split(' ') },
  { labelKey: 'emoji.faces', items: '😀 😄 😁 😊 🙂 😉 😍 🤩 😎 🤔 😅 😌 😴 😭 😡 🥳 🤯 🙃 😬 🥺 😇 🤓'.split(' ') },
  { labelKey: 'emoji.gestures', items: '👍 👎 👏 🙏 💪 🦾 🫶 ✌️ 🤞 👀 🧘 🏃 🚶 🏋️ 🚴 🧗 💃'.split(' ') },
  { labelKey: 'emoji.nature', items: '🌟 ✨ ⚡ 🌈 💧 🌊 🌱 🌳 🍃 🍁 🍀 🌸 🌙 ☀️ ⛅ ❄️ 🪐 🌍 🐾 🦋'.split(' ') },
  { labelKey: 'emoji.objects', items: '📖 ✏️ 🖊️ 📒 📓 💻 📱 ⌚ 🎧 📷 🔑 🔒 💰 🛒 🎁 🏆 🥇 ⏰ ⏳ 📅 🗓️ 📊 📈 📉 💼 🎒 🩺 💊'.split(' ') },
  { labelKey: 'emoji.food', items: '🍎 🍌 🥦 🥗 🍳 🍞 ☕ 🍵 🍫 🍪 🥤 🍕 🍣 🥑'.split(' ') },
  { labelKey: 'emoji.activities', items: '⚽ 🏀 🎮 👾 🎸 🎹 🎨 ✈️ 🚗 🏠 🎬 🎤 🎲 🧩'.split(' ') },
  { labelKey: 'emoji.symbols', items: '❤️ 🧡 💛 💚 💙 💜 🖤 ✅ ❌ ⚠️ ❗ ❓ 💯 ➕ ➖ ☑️ 🔵 🟢 🟣 🔴'.split(' ') },
]

export default function EmojiPicker({ onPick, onClose }) {
  const { t } = useLang()
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="emoji-backdrop" onClick={onClose} />
      <div className="emoji-picker">
        {GROUPS.map((g) => (
          <div className="emoji-group" key={g.labelKey}>
            <div className="emoji-group-label">{t(g.labelKey)}</div>
            <div className="emoji-grid">
              {g.items.map((e, i) => (
                <button key={g.labelKey + i} className="emoji-opt" onClick={() => onPick(e)}>{e}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

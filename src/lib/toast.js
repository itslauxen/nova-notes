// Toasts globais: qualquer parte do app chama toast('mensagem') e o <Toaster />
// (montado uma vez no main.jsx) mostra no topo da tela e tira sozinho.
// type: 'error' (padrão) | 'info'
export function toast(message, { type = 'error', duration = 5000 } = {}) {
  if (!message) return
  window.dispatchEvent(new CustomEvent('nova:toast', { detail: { message: String(message), type, duration } }))
}

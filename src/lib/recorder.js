// Gravação de voz com auto-parada por silêncio.
// Retorna { promise, stop }: a promise resolve com o Blob do áudio quando para
// (por silêncio, tempo máximo ou stop() manual). onLevel recebe a amplitude (0..1).
// onStream recebe o MediaStream aberto (ex.: pra desenhar uma waveform sem abrir outro microfone).
export function recordVoice({ onLevel, onStream, silenceMs = 2000, maxMs = 60000 } = {}) {
  let stopFn = () => {}
  const promise = new Promise((resolve, reject) => {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        onStream?.(stream)
        const mime =
          [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/aac',
          ].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || ''
        const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
        const chunks = []
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)

        const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        const srcNode = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        srcNode.connect(analyser)
        const buf = new Uint8Array(analyser.frequencyBinCount)

        let raf = 0
        let stopped = false
        const started = performance.now()
        let lastSound = started
        let spoke = false

        recorder.onstop = () => {
          cancelAnimationFrame(raf)
          stream.getTracks().forEach((t) => t.stop())
          try { audioCtx.close() } catch {}
          resolve(new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' }))
        }
        stopFn = () => {
          if (stopped) return
          stopped = true
          try { recorder.state !== 'inactive' && recorder.stop() } catch {}
        }

        const tick = () => {
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / buf.length)
          onLevel?.(Math.min(1, rms * 3.4))

          const now = performance.now()
          if (rms > 0.04) {
            lastSound = now
            spoke = true
          }
          if ((spoke && now - lastSound > silenceMs) || now - started > maxMs) {
            stopFn()
            return
          }
          raf = requestAnimationFrame(tick)
        }

        recorder.start()
        tick()
      })
      .catch(reject)
  })
  return { promise, stop: () => stopFn() }
}

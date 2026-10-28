// Waveform e MicrophoneWaveform do ElevenLabs UI (https://ui.elevenlabs.io/docs/components/waveform),
// copiados de github.com/elevenlabs/ui (apps/www/registry/elevenlabs-ui/ui/waveform.tsx).
// MIT License — Copyright (c) 2025 Eleven Labs Inc.
// Adaptações: JS em vez de TS, sem Tailwind/cn, e a prop `stream` no MicrophoneWaveform
// pra reaproveitar o microfone que o gravador do app já abriu (dois getUserMedia
// ao mesmo tempo podem silenciar um deles no iPhone).

import { useEffect, useRef, useState } from 'react'

export const Waveform = ({
  data = [],
  barWidth = 4,
  barHeight: baseBarHeight = 4,
  barGap = 2,
  barRadius = 2,
  barColor,
  fadeEdges = true,
  fadeWidth = 24,
  height = 128,
  onBarClick,
  className,
  style,
  ...props
}) => {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const heightStyle = typeof height === 'number' ? `${height}px` : height

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1

      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(dpr, dpr)
        renderWaveform()
      }
    })

    const renderWaveform = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const rect = canvas.getBoundingClientRect()
      ctx.clearRect(0, 0, rect.width, rect.height)

      const computedBarColor =
        barColor || getComputedStyle(canvas).getPropertyValue('--foreground') || '#000'

      const barCount = Math.floor(rect.width / (barWidth + barGap))
      const centerY = rect.height / 2

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * data.length)
        const value = data[dataIndex] || 0
        const barHeight = Math.max(baseBarHeight, value * rect.height * 0.8)
        const x = i * (barWidth + barGap)
        const y = centerY - barHeight / 2

        ctx.fillStyle = computedBarColor
        ctx.globalAlpha = 0.3 + value * 0.7

        if (barRadius > 0) {
          ctx.beginPath()
          ctx.roundRect(x, y, barWidth, barHeight, barRadius)
          ctx.fill()
        } else {
          ctx.fillRect(x, y, barWidth, barHeight)
        }
      }

      if (fadeEdges && fadeWidth > 0 && rect.width > 0) {
        const gradient = ctx.createLinearGradient(0, 0, rect.width, 0)
        const fadePercent = Math.min(0.2, fadeWidth / rect.width)

        gradient.addColorStop(0, 'rgba(255,255,255,1)')
        gradient.addColorStop(fadePercent, 'rgba(255,255,255,0)')
        gradient.addColorStop(1 - fadePercent, 'rgba(255,255,255,0)')
        gradient.addColorStop(1, 'rgba(255,255,255,1)')

        ctx.globalCompositeOperation = 'destination-out'
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, rect.width, rect.height)
        ctx.globalCompositeOperation = 'source-over'
      }

      ctx.globalAlpha = 1
    }

    resizeObserver.observe(container)
    renderWaveform()

    return () => resizeObserver.disconnect()
  }, [data, barWidth, baseBarHeight, barGap, barRadius, barColor, fadeEdges, fadeWidth])

  const handleClick = (e) => {
    if (!onBarClick) return

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = e.clientX - rect.left
    const barIndex = Math.floor(x / (barWidth + barGap))
    const dataIndex = Math.floor((barIndex * data.length) / Math.floor(rect.width / (barWidth + barGap)))

    if (dataIndex >= 0 && dataIndex < data.length) {
      onBarClick(dataIndex, data[dataIndex])
    }
  }

  return (
    <div
      className={className}
      ref={containerRef}
      style={{ position: 'relative', height: heightStyle, ...style }}
      {...props}
    >
      <canvas
        style={{ display: 'block', width: '100%', height: '100%' }}
        onClick={handleClick}
        ref={canvasRef}
      />
    </div>
  )
}

export const MicrophoneWaveform = ({
  active = false,
  processing = false,
  stream: externalStream = null,
  fftSize = 256,
  smoothingTimeConstant = 0.8,
  sensitivity = 1,
  onError,
  ...props
}) => {
  const [data, setData] = useState([])
  const analyserRef = useRef(null)
  const audioContextRef = useRef(null)
  const streamRef = useRef(null)
  const animationIdRef = useRef(null)
  const processingAnimationRef = useRef(null)
  const lastActiveDataRef = useRef([])
  const transitionProgressRef = useRef(0)

  useEffect(() => {
    if (processing && !active) {
      let time = 0
      transitionProgressRef.current = 0

      const animateProcessing = () => {
        time += 0.03
        transitionProgressRef.current = Math.min(1, transitionProgressRef.current + 0.02)

        const processingData = []
        const barCount = 45

        for (let i = 0; i < barCount; i++) {
          const normalizedPosition = (i - barCount / 2) / (barCount / 2)
          const centerWeight = 1 - Math.abs(normalizedPosition) * 0.4

          const wave1 = Math.sin(time * 1.5 + i * 0.15) * 0.25
          const wave2 = Math.sin(time * 0.8 - i * 0.1) * 0.2
          const wave3 = Math.cos(time * 2 + i * 0.05) * 0.15
          const combinedWave = wave1 + wave2 + wave3
          const processingValue = (0.2 + combinedWave) * centerWeight

          let finalValue = processingValue
          if (lastActiveDataRef.current.length > 0 && transitionProgressRef.current < 1) {
            const lastDataIndex = Math.floor((i / barCount) * lastActiveDataRef.current.length)
            const lastValue = lastActiveDataRef.current[lastDataIndex] || 0
            finalValue =
              lastValue * (1 - transitionProgressRef.current) + processingValue * transitionProgressRef.current
          }

          processingData.push(Math.max(0.05, Math.min(1, finalValue)))
        }

        setData(processingData)
        processingAnimationRef.current = requestAnimationFrame(animateProcessing)
      }

      animateProcessing()

      return () => {
        if (processingAnimationRef.current) {
          cancelAnimationFrame(processingAnimationRef.current)
        }
      }
    } else if (!active && !processing) {
      if (data.length > 0) {
        let fadeProgress = 0
        const fadeToIdle = () => {
          fadeProgress += 0.03
          if (fadeProgress < 1) {
            const fadedData = data.map((value) => value * (1 - fadeProgress))
            setData(fadedData)
            requestAnimationFrame(fadeToIdle)
          } else {
            setData([])
          }
        }
        fadeToIdle()
      }
      return
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing, active])

  useEffect(() => {
    // o stream externo pertence ao gravador: aqui só se lê dele, nunca se desliga
    const ownsStream = !externalStream
    const cleanup = () => {
      if (ownsStream && streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
    }

    if (!active) {
      cleanup()
      return
    }

    const setupMicrophone = async () => {
      try {
        const stream = externalStream || (await navigator.mediaDevices.getUserMedia({ audio: true }))
        streamRef.current = stream

        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = fftSize
        analyser.smoothingTimeConstant = smoothingTimeConstant

        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)

        audioContextRef.current = audioContext
        analyserRef.current = analyser

        const dataArray = new Uint8Array(analyser.frequencyBinCount)

        const updateData = () => {
          if (!analyserRef.current || !active) return

          analyserRef.current.getByteFrequencyData(dataArray)

          const startFreq = Math.floor(dataArray.length * 0.05)
          const endFreq = Math.floor(dataArray.length * 0.4)
          const relevantData = dataArray.slice(startFreq, endFreq)

          const halfLength = Math.floor(relevantData.length / 2)
          const normalizedData = []

          for (let i = halfLength - 1; i >= 0; i--) {
            const value = Math.min(1, (relevantData[i] / 255) * sensitivity)
            normalizedData.push(value)
          }

          for (let i = 0; i < halfLength; i++) {
            const value = Math.min(1, (relevantData[i] / 255) * sensitivity)
            normalizedData.push(value)
          }

          setData(normalizedData)
          lastActiveDataRef.current = normalizedData

          animationIdRef.current = requestAnimationFrame(updateData)
        }

        updateData()
      } catch (error) {
        onError?.(error)
      }
    }

    setupMicrophone()

    return cleanup
  }, [active, externalStream, fftSize, smoothingTimeConstant, sensitivity, onError])

  return <Waveform data={data} {...props} />
}

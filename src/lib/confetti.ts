// Efeito de confetes leve e de alta performance em Canvas puro sem dependências pesadas
export function launchConfetti() {
  if (typeof window === 'undefined') return

  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.inset = '0'
  canvas.style.width = '100vw'
  canvas.style.height = '100vh'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '999999'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    document.body.removeChild(canvas)
    return
  }

  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  ctx.scale(dpr, dpr)

  const colors = ['#16a34a', '#22c55e', '#4ade80', '#fbbf24', '#38bdf8', '#f43f5e', '#a855f7']
  const pieces: {
    x: number
    y: number
    w: number
    h: number
    color: string
    vx: number
    vy: number
    rot: number
    vRot: number
    opacity: number
  }[] = []

  for (let i = 0; i < 75; i++) {
    pieces.push({
      x: window.innerWidth * 0.5 + (Math.random() - 0.5) * 300,
      y: window.innerHeight * 0.4 + (Math.random() - 0.5) * 100,
      w: 8 + Math.random() * 8,
      h: 5 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 14,
      vy: -8 - Math.random() * 10,
      rot: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 15,
      opacity: 1,
    })
  }

  let frame = 0
  const maxFrames = 130

  function render() {
    frame++
    ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight)

    let alive = false
    for (const p of pieces) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.35 // gravidade
      p.vx *= 0.98 // resistência do ar
      p.rot += p.vRot
      if (frame > 70) {
        p.opacity = Math.max(0, p.opacity - 0.02)
      }

      if (p.opacity > 0 && p.y < window.innerHeight + 50) {
        alive = true
        ctx!.save()
        ctx!.translate(p.x, p.y)
        ctx!.rotate((p.rot * Math.PI) / 180)
        ctx!.fillStyle = p.color
        ctx!.globalAlpha = p.opacity
        ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx!.restore()
      }
    }

    if (alive && frame < maxFrames) {
      requestAnimationFrame(render)
    } else {
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas)
      }
    }
  }

  requestAnimationFrame(render)
}

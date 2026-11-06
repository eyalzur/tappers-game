import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const ROUND_SECONDS = 60
const SPAWN_INTERVAL_MS = 650
const MAX_ITEMS = 8
const MIN_LIFESPAN_MS = 1800
const MAX_LIFESPAN_MS = 3200
const SPEED = 60 // px per second
const FLASH_DURATION_MS = 260
const DROP_GRAVITY = 480 // px/s^2

const AVATAR_SIZE = 38
const AVATAR_SPEED = 320 // px per second — the travel time is the challenge
const PING_DURATION_MS = 400

// toughness tiers: size range, required contact time to pop, score value
const TIERS = [
  { tier: 1, minSize: 46, maxSize: 58, holdMs: 120, points: 1 },
  { tier: 2, minSize: 58, maxSize: 72, holdMs: 400, points: 2 },
  { tier: 3, minSize: 72, maxSize: 88, holdMs: 700, points: 3 },
]
const TIER_WEIGHTS = [0.55, 0.3, 0.15]

let nextId = 1
let nextParticleId = 1
let nextPingId = 1

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function pickTier() {
  const roll = Math.random()
  let acc = 0
  for (let i = 0; i < TIER_WEIGHTS.length; i++) {
    acc += TIER_WEIGHTS[i]
    if (roll <= acc) return TIERS[i]
  }
  return TIERS[0]
}

function burstParticles(item, now) {
  const cx = item.x + item.size / 2
  const cy = item.y + item.size / 2
  const particles = [
    {
      id: nextParticleId++,
      type: 'flash',
      x: cx,
      y: cy,
      size: item.size * 1.5,
      hue: item.hue,
      bornAt: now,
      life: FLASH_DURATION_MS,
    },
  ]
  const dropCount = 6 + item.tier * 3
  const baseSpeed = 90 + item.tier * 50
  for (let i = 0; i < dropCount; i++) {
    const angle = (Math.PI * 2 * i) / dropCount + randomBetween(-0.3, 0.3)
    const speed = randomBetween(baseSpeed * 0.6, baseSpeed * 1.3)
    particles.push({
      id: nextParticleId++,
      type: 'drop',
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      size: randomBetween(5, 8) + item.tier * 1.5,
      hue: item.hue,
      bornAt: now,
      life: randomBetween(500, 800),
      rotation: (angle * 180) / Math.PI,
    })
  }
  return particles
}

function makeItem(boundsWidth, boundsHeight) {
  const tier = pickTier()
  const size = randomBetween(tier.minSize, tier.maxSize)
  const angle = Math.random() * Math.PI * 2
  const speed = randomBetween(SPEED * 0.6, SPEED * 1.4)
  return {
    id: nextId++,
    x: randomBetween(0, Math.max(0, boundsWidth - size)),
    y: randomBetween(0, Math.max(0, boundsHeight - size)),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size,
    rotation: Math.random() * 360,
    spin: randomBetween(-120, 120),
    bornAt: performance.now(),
    lifespan: randomBetween(MIN_LIFESPAN_MS, MAX_LIFESPAN_MS),
    hue: Math.floor(randomBetween(0, 360)),
    tier: tier.tier,
    holdMs: tier.holdMs,
    points: tier.points,
  }
}

export default function App() {
  const [status, setStatus] = useState('idle') // idle | playing | over
  const [items, setItems] = useState([])
  const [particles, setParticles] = useState([])
  const [pings, setPings] = useState([])
  const [avatar, setAvatar] = useState({ x: 0, y: 0, rotation: 0 })
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS)
  const [missed, setMissed] = useState(0)

  const arenaRef = useRef(null)
  const itemsRef = useRef([])
  const particlesRef = useRef([])
  const pingsRef = useRef([])
  const avatarRef = useRef({ x: 0, y: 0, rotation: 0, targetX: null, targetY: null })
  const touchingRef = useRef(null) // { id, start }
  const rafRef = useRef(null)
  const lastSpawnRef = useRef(0)
  const lastFrameRef = useRef(0)
  const endAtRef = useRef(0)

  itemsRef.current = items
  particlesRef.current = particles
  pingsRef.current = pings

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }, [])

  const tick = useCallback((now) => {
    const bounds = arenaRef.current?.getBoundingClientRect()
    if (!bounds) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }
    const dt = lastFrameRef.current ? (now - lastFrameRef.current) / 1000 : 0
    lastFrameRef.current = now

    if (now - lastSpawnRef.current > SPAWN_INTERVAL_MS && itemsRef.current.length < MAX_ITEMS) {
      lastSpawnRef.current = now
      itemsRef.current = [...itemsRef.current, makeItem(bounds.width, bounds.height)]
    }

    // move + spin balloons
    itemsRef.current = itemsRef.current.map((item) => {
      let { x, y, vx, vy } = item
      x += vx * dt
      y += vy * dt
      if (x <= 0) { x = 0; vx = Math.abs(vx) }
      if (x + item.size >= bounds.width) { x = bounds.width - item.size; vx = -Math.abs(vx) }
      if (y <= 0) { y = 0; vy = Math.abs(vy) }
      if (y + item.size >= bounds.height) { y = bounds.height - item.size; vy = -Math.abs(vy) }
      return { ...item, x, y, vx, vy, rotation: item.rotation + item.spin * dt }
    })

    // move avatar toward its target at a finite speed
    const av = avatarRef.current
    if (av.targetX != null) {
      const dx = av.targetX - av.x
      const dy = av.targetY - av.y
      const dist = Math.hypot(dx, dy)
      const step = AVATAR_SPEED * dt
      if (dist <= step || dist === 0) {
        av.x = av.targetX
        av.y = av.targetY
        av.targetX = null
        av.targetY = null
      } else {
        av.x += (dx / dist) * step
        av.y += (dy / dist) * step
        av.rotation = (Math.atan2(dx, -dy) * 180) / Math.PI
      }
    }

    // find closest balloon the avatar is touching
    const avCx = av.x
    const avCy = av.y
    let closest = null
    let closestDist = Infinity
    for (const item of itemsRef.current) {
      const icx = item.x + item.size / 2
      const icy = item.y + item.size / 2
      const dist = Math.hypot(avCx - icx, avCy - icy)
      const touchRadius = AVATAR_SIZE * 0.32 + item.size * 0.38
      if (dist <= touchRadius && dist < closestDist) {
        closest = item
        closestDist = dist
      }
    }

    if (!closest) {
      touchingRef.current = null
    } else if (touchingRef.current?.id !== closest.id) {
      touchingRef.current = { id: closest.id, start: now }
    } else if (now - touchingRef.current.start >= closest.holdMs) {
      itemsRef.current = itemsRef.current.filter((i) => i.id !== closest.id)
      particlesRef.current = [...particlesRef.current, ...burstParticles(closest, now)]
      setScore((s) => s + closest.points)
      touchingRef.current = null
    }

    // expire items past lifespan
    let missedThisFrame = 0
    itemsRef.current = itemsRef.current.filter((item) => {
      const alive = now - item.bornAt < item.lifespan
      if (!alive) {
        missedThisFrame += 1
        if (touchingRef.current?.id === item.id) touchingRef.current = null
      }
      return alive
    })
    if (missedThisFrame > 0) setMissed((m) => m + missedThisFrame)

    // move + fade particles (water droplets fall with gravity, flash just fades)
    particlesRef.current = particlesRef.current
      .map((p) => {
        if (p.type !== 'drop') return p
        return { ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + DROP_GRAVITY * dt }
      })
      .filter((p) => now - p.bornAt < p.life)

    // age out tap pings
    pingsRef.current = pingsRef.current.filter((p) => now - p.bornAt < PING_DURATION_MS)

    setItems(itemsRef.current)
    setParticles(particlesRef.current)
    setPings(pingsRef.current)
    setAvatar({ x: av.x, y: av.y, rotation: av.rotation })

    const remainingMs = endAtRef.current - now
    if (remainingMs <= 0) {
      setTimeLeft(0)
      setStatus('over')
      stopLoop()
      return
    }
    setTimeLeft(Math.ceil(remainingMs / 1000))

    rafRef.current = requestAnimationFrame(tick)
  }, [stopLoop])

  const startGame = useCallback(() => {
    const bounds = arenaRef.current?.getBoundingClientRect()
    const startX = bounds ? bounds.width / 2 : 0
    const startY = bounds ? bounds.height / 2 : 0

    itemsRef.current = []
    particlesRef.current = []
    pingsRef.current = []
    touchingRef.current = null
    avatarRef.current = { x: startX, y: startY, rotation: 0, targetX: null, targetY: null }

    setItems([])
    setParticles([])
    setPings([])
    setAvatar({ x: startX, y: startY, rotation: 0 })
    setScore(0)
    setMissed(0)
    setTimeLeft(ROUND_SECONDS)
    lastSpawnRef.current = 0
    lastFrameRef.current = 0
    endAtRef.current = performance.now() + ROUND_SECONDS * 1000
    setStatus('playing')
  }, [])

  useEffect(() => {
    if (status !== 'playing') return
    stopLoop()
    rafRef.current = requestAnimationFrame(tick)
    return stopLoop
  }, [status, tick, stopLoop])

  const handleArenaPointerDown = useCallback((e) => {
    if (status !== 'playing') return
    const bounds = arenaRef.current.getBoundingClientRect()
    const x = e.clientX - bounds.left
    const y = e.clientY - bounds.top
    avatarRef.current.targetX = x
    avatarRef.current.targetY = y
    pingsRef.current = [...pingsRef.current, { id: nextPingId++, x, y, bornAt: performance.now() }]
    setPings(pingsRef.current)
  }, [status])

  return (
    <div className="app">
      <header className="hud">
        <div className="hud-stat">
          <span className="hud-icon">⭐</span>
          <span className="hud-value">{score}</span>
        </div>
        <div className="hud-stat hud-stat--time">
          <span className="hud-icon">⏱</span>
          <span className="hud-value">{timeLeft}s</span>
        </div>
        <div className="hud-stat">
          <span className="hud-icon">💥</span>
          <span className="hud-value">{missed}</span>
        </div>
      </header>
      <div className="time-bar-track">
        <div className="time-bar-fill" style={{ width: `${(timeLeft / ROUND_SECONDS) * 100}%` }} />
      </div>

      <div className="arena" ref={arenaRef} onPointerDown={handleArenaPointerDown}>
        {pings.map((p) => {
          const progress = Math.min(1, (performance.now() - p.bornAt) / PING_DURATION_MS)
          return (
            <div
              key={p.id}
              className="ping"
              style={{
                left: p.x,
                top: p.y,
                transform: `translate(-50%, -50%) scale(${0.3 + progress * 1.4})`,
                opacity: 1 - progress,
              }}
            />
          )
        })}

        {particles.map((p) => {
          if (p.type === 'flash') {
            const progress = Math.min(1, (performance.now() - p.bornAt) / p.life)
            const scale = 0.3 + progress * 1.3
            return (
              <div
                key={p.id}
                className="flash"
                style={{
                  width: p.size,
                  height: p.size,
                  left: p.x - p.size / 2,
                  top: p.y - p.size / 2,
                  transform: `scale(${scale})`,
                  opacity: 1 - progress,
                  '--hue': p.hue,
                }}
              />
            )
          }
          const progress = Math.min(1, (performance.now() - p.bornAt) / p.life)
          const stretch = 1 + Math.min(1.4, Math.hypot(p.vx, p.vy) / 180)
          return (
            <div
              key={p.id}
              className="drop"
              style={{
                width: p.size,
                height: p.size,
                left: p.x - p.size / 2,
                top: p.y - p.size / 2,
                transform: `rotate(${p.rotation}deg) scaleX(${stretch})`,
                opacity: 1 - progress * progress,
                '--hue': p.hue,
              }}
            />
          )
        })}

        {items.map((item) => {
          const ageMs = performance.now() - item.bornAt
          const lifeLeft = Math.max(0, 1 - ageMs / item.lifespan)
          const isTouched = touchingRef.current?.id === item.id
          const holdProgress = isTouched
            ? Math.min(1, (performance.now() - touchingRef.current.start) / item.holdMs)
            : 0
          const squish = isTouched ? 1 - holdProgress * 0.18 : 1
          return (
            <div
              key={item.id}
              className={`balloon${isTouched ? ' pressed' : ''}`}
              style={{
                width: item.size,
                height: item.size,
                transform: `translate(${item.x}px, ${item.y}px) rotate(${item.rotation}deg) scale(${squish})`,
                opacity: Math.min(1, lifeLeft + 0.2),
                '--hue': item.hue,
              }}
            />
          )
        })}

        {status === 'playing' && (
          <div
            className="avatar"
            style={{ transform: `translate(${avatar.x}px, ${avatar.y}px) translate(-50%, -50%) rotate(${avatar.rotation}deg)` }}
          />
        )}

        {status === 'idle' && (
          <div className="overlay">
            <div className="overlay-card">
              <div className="overlay-emoji">🎈</div>
              <h1>Tappers</h1>
              <p>Tap where you want to go — your arrow takes time to get there.</p>
              <p className="hint">Touch a balloon to pop it. Big ones need lingering contact.</p>
              <button className="primary" onClick={startGame}>Start</button>
            </div>
          </div>
        )}

        {status === 'over' && (
          <div className="overlay">
            <div className="overlay-card">
              <div className="overlay-emoji">💦</div>
              <h1>Time's up!</h1>
              <div className="result-row">
                <div className="result-stat">
                  <span className="result-value">{score}</span>
                  <span className="result-label">Score</span>
                </div>
                <div className="result-stat">
                  <span className="result-value">{missed}</span>
                  <span className="result-label">Missed</span>
                </div>
              </div>
              <button className="primary" onClick={startGame}>Play again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

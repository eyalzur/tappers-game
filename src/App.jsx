import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const ROUND_SECONDS = 60
const SPEED = 60 // px per second
const FLASH_DURATION_MS = 260
const DROP_GRAVITY = 480 // px/s^2

const PING_DURATION_MS = 400

// difficulty ramps up over the round — this is what makes it hard
const SPAWN_INTERVAL_START = 650
const SPAWN_INTERVAL_END = 220
const MAX_ITEMS_START = 8
const MAX_ITEMS_END = 16
const SPEED_MULT_END = 2.6
const BOMB_CHANCE_START = 0.05
const BOMB_CHANCE_END = 0.4

// balloons live shorter as the round goes on — less time to react late game
const MIN_LIFESPAN_START = 1800
const MIN_LIFESPAN_END = 1100
const MAX_LIFESPAN_START = 3200
const MAX_LIFESPAN_END = 2000

// the arrow is slow and heavy on purpose — out-running its own lag behind
// the finger, not fiddly hit detection, is the actual challenge
const AVATAR_CHASE_RATE_START = 3.2
const AVATAR_CHASE_RATE_END = 1.9
const AVATAR_HIT_RADIUS = 17
const TOUCH_SIZE_FACTOR = 0.45

const BOMB_PENALTY = 6
const STUN_MS_START = 650
const STUN_MS_END = 1000
const MISS_PENALTY = 1
const COMBO_WINDOW_MS = 750
const MAX_COMBO_MULT = 5

// size range + score value per balloon tier — pops in a single touch
const TIERS = [
  { tier: 1, minSize: 46, maxSize: 58, points: 1 },
  { tier: 2, minSize: 58, maxSize: 72, points: 2 },
  { tier: 3, minSize: 72, maxSize: 88, points: 3 },
]
const TIER_WEIGHTS = [0.55, 0.3, 0.15]

let nextId = 1
let nextParticleId = 1
let nextPingId = 1

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function lerp(a, b, t) {
  return a + (b - a) * t
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

function explodeBomb(item, now) {
  const cx = item.x + item.size / 2
  const cy = item.y + item.size / 2
  const particles = [
    { id: nextParticleId++, type: 'shock', x: cx, y: cy, size: item.size * 1.8, bornAt: now, life: 220 },
  ]
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10 + randomBetween(-0.3, 0.3)
    const speed = randomBetween(50, 130)
    particles.push({
      id: nextParticleId++,
      type: 'smoke',
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,
      size: randomBetween(8, 16),
      bornAt: now,
      life: randomBetween(500, 850),
    })
  }
  return particles
}

function makeItem(boundsWidth, boundsHeight, speedMult, bombChance, lifespanMin, lifespanMax) {
  const isBomb = Math.random() < bombChance
  const angle = Math.random() * Math.PI * 2
  if (isBomb) {
    const size = randomBetween(50, 66)
    const speed = randomBetween(SPEED * 0.5, SPEED * 1.0) * speedMult
    return {
      id: nextId++,
      type: 'bomb',
      x: randomBetween(0, Math.max(0, boundsWidth - size)),
      y: randomBetween(0, Math.max(0, boundsHeight - size)),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      rotation: Math.random() * 360,
      spin: randomBetween(-80, 80),
      bornAt: performance.now(),
      lifespan: randomBetween(lifespanMin, lifespanMax),
      points: -BOMB_PENALTY,
    }
  }
  const tier = pickTier()
  const size = randomBetween(tier.minSize, tier.maxSize)
  const speed = randomBetween(SPEED * 0.6, SPEED * 1.4) * speedMult
  return {
    id: nextId++,
    type: 'balloon',
    x: randomBetween(0, Math.max(0, boundsWidth - size)),
    y: randomBetween(0, Math.max(0, boundsHeight - size)),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size,
    rotation: Math.random() * 360,
    spin: randomBetween(-120, 120),
    bornAt: performance.now(),
    lifespan: randomBetween(lifespanMin, lifespanMax),
    hue: Math.floor(randomBetween(0, 360)),
    tier: tier.tier,
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
  const [combo, setCombo] = useState(1)

  const arenaRef = useRef(null)
  const itemsRef = useRef([])
  const particlesRef = useRef([])
  const pingsRef = useRef([])
  const avatarRef = useRef({ x: 0, y: 0, rotation: 0, targetX: null, targetY: null })
  const isDraggingRef = useRef(false)
  const lastPingAtRef = useRef(0)
  const rafRef = useRef(null)
  const lastSpawnRef = useRef(0)
  const lastFrameRef = useRef(0)
  const endAtRef = useRef(0)
  const roundStartRef = useRef(0)
  const comboCountRef = useRef(0)
  const lastPopAtRef = useRef(0)
  const stunnedUntilRef = useRef(0)

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

    const frac = Math.min(1, Math.max(0, (now - roundStartRef.current) / (ROUND_SECONDS * 1000)))
    const spawnInterval = lerp(SPAWN_INTERVAL_START, SPAWN_INTERVAL_END, frac)
    const maxItems = Math.round(lerp(MAX_ITEMS_START, MAX_ITEMS_END, frac))
    const speedMult = lerp(1, SPEED_MULT_END, frac)
    const bombChance = lerp(BOMB_CHANCE_START, BOMB_CHANCE_END, frac)
    const lifespanMin = lerp(MIN_LIFESPAN_START, MIN_LIFESPAN_END, frac)
    const lifespanMax = lerp(MAX_LIFESPAN_START, MAX_LIFESPAN_END, frac)
    const chaseRate = lerp(AVATAR_CHASE_RATE_START, AVATAR_CHASE_RATE_END, frac)
    const stunMs = lerp(STUN_MS_START, STUN_MS_END, frac)

    if (now - lastSpawnRef.current > spawnInterval && itemsRef.current.length < maxItems) {
      lastSpawnRef.current = now
      itemsRef.current = [
        ...itemsRef.current,
        makeItem(bounds.width, bounds.height, speedMult, bombChance, lifespanMin, lifespanMax),
      ]
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

    // chase the finger: avatar eases toward its target, always lagging a bit behind
    // (frozen while stunned from a bomb hit)
    const av = avatarRef.current
    const isStunned = now < stunnedUntilRef.current
    if (!isStunned && av.targetX != null) {
      const dx = av.targetX - av.x
      const dy = av.targetY - av.y
      const dist = Math.hypot(dx, dy)
      if (dist > 0.4) {
        av.rotation = (Math.atan2(dx, -dy) * 180) / Math.PI
        const t = 1 - Math.exp(-chaseRate * dt)
        av.x += dx * t
        av.y += dy * t
      } else {
        av.x = av.targetX
        av.y = av.targetY
      }
    }

    // pop every balloon/bomb the arrow is touching right now — one hit, no lingering needed
    const avCx = av.x
    const avCy = av.y
    const poppedBalloons = []
    const poppedBombs = []
    itemsRef.current = itemsRef.current.filter((item) => {
      const icx = item.x + item.size / 2
      const icy = item.y + item.size / 2
      const touchRadius = AVATAR_HIT_RADIUS + item.size * TOUCH_SIZE_FACTOR
      if (Math.hypot(avCx - icx, avCy - icy) <= touchRadius) {
        if (item.type === 'bomb') poppedBombs.push(item)
        else poppedBalloons.push(item)
        return false
      }
      return true
    })

    if (poppedBombs.length > 0) {
      for (const bomb of poppedBombs) {
        particlesRef.current = [...particlesRef.current, ...explodeBomb(bomb, now)]
      }
      stunnedUntilRef.current = now + stunMs
      comboCountRef.current = 0
      setScore((s) => Math.max(0, s - BOMB_PENALTY * poppedBombs.length))
    }

    if (poppedBalloons.length > 0) {
      let frameScoreDelta = 0
      for (const item of poppedBalloons) {
        comboCountRef.current = now - lastPopAtRef.current <= COMBO_WINDOW_MS ? comboCountRef.current + 1 : 1
        lastPopAtRef.current = now
        const multiplier = Math.min(MAX_COMBO_MULT, 1 + Math.floor(comboCountRef.current / 3))
        frameScoreDelta += item.points * multiplier
        particlesRef.current = [...particlesRef.current, ...burstParticles(item, now)]
      }
      setScore((s) => s + frameScoreDelta)
    }

    if (comboCountRef.current > 0 && now - lastPopAtRef.current > COMBO_WINDOW_MS) {
      comboCountRef.current = 0
    }
    setCombo(Math.min(MAX_COMBO_MULT, 1 + Math.floor(comboCountRef.current / 3)))

    // expire items past lifespan (bombs drift off harmlessly — only missed balloons count)
    let missedThisFrame = 0
    itemsRef.current = itemsRef.current.filter((item) => {
      const alive = now - item.bornAt < item.lifespan
      if (!alive && item.type === 'balloon') missedThisFrame += 1
      return alive
    })
    if (missedThisFrame > 0) {
      setMissed((m) => m + missedThisFrame)
      setScore((s) => Math.max(0, s - MISS_PENALTY * missedThisFrame))
    }

    // move + fade particles (water droplets + smoke fall/float with physics, flashes just fade)
    particlesRef.current = particlesRef.current
      .map((p) => {
        if (p.type === 'drop') {
          return { ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + DROP_GRAVITY * dt }
        }
        if (p.type === 'smoke') {
          return { ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vx: p.vx * 0.96, vy: p.vy * 0.96 }
        }
        return p
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
    isDraggingRef.current = false
    avatarRef.current = { x: startX, y: startY, rotation: 0, targetX: null, targetY: null }
    comboCountRef.current = 0
    lastPopAtRef.current = 0
    stunnedUntilRef.current = 0

    setItems([])
    setParticles([])
    setPings([])
    setAvatar({ x: startX, y: startY, rotation: 0 })
    setScore(0)
    setMissed(0)
    setCombo(1)
    setTimeLeft(ROUND_SECONDS)
    lastSpawnRef.current = 0
    lastFrameRef.current = 0
    roundStartRef.current = performance.now()
    endAtRef.current = roundStartRef.current + ROUND_SECONDS * 1000
    setStatus('playing')
  }, [])

  useEffect(() => {
    if (status !== 'playing') return
    stopLoop()
    rafRef.current = requestAnimationFrame(tick)
    return stopLoop
  }, [status, tick, stopLoop])

  const setTargetFromEvent = useCallback((e, { ping } = {}) => {
    const bounds = arenaRef.current.getBoundingClientRect()
    const x = e.clientX - bounds.left
    const y = e.clientY - bounds.top
    avatarRef.current.targetX = x
    avatarRef.current.targetY = y
    const now = performance.now()
    if (ping && now - lastPingAtRef.current > 70) {
      lastPingAtRef.current = now
      pingsRef.current = [...pingsRef.current, { id: nextPingId++, x, y, bornAt: now }]
      setPings(pingsRef.current)
    }
  }, [])

  const handlePointerDown = useCallback((e) => {
    if (status !== 'playing') return
    isDraggingRef.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setTargetFromEvent(e, { ping: true })
  }, [status, setTargetFromEvent])

  const handlePointerMove = useCallback((e) => {
    if (!isDraggingRef.current) return
    setTargetFromEvent(e, { ping: true })
  }, [setTargetFromEvent])

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

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
        <div className={`hud-stat hud-combo${combo > 1 ? ' hot' : ''}`}>
          <span className="hud-icon">🔥</span>
          <span className="hud-value">x{combo}</span>
        </div>
      </header>
      <div className="time-bar-track">
        <div className="time-bar-fill" style={{ width: `${(timeLeft / ROUND_SECONDS) * 100}%` }} />
      </div>

      <div
        className="arena"
        ref={arenaRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
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
          if (p.type === 'flash' || p.type === 'shock') {
            const progress = Math.min(1, (performance.now() - p.bornAt) / p.life)
            const scale = 0.3 + progress * 1.3
            return (
              <div
                key={p.id}
                className={p.type}
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
          if (p.type === 'smoke') {
            const progress = Math.min(1, (performance.now() - p.bornAt) / p.life)
            return (
              <div
                key={p.id}
                className="smoke"
                style={{
                  width: p.size,
                  height: p.size,
                  left: p.x - p.size / 2,
                  top: p.y - p.size / 2,
                  transform: `scale(${1 + progress * 0.8})`,
                  opacity: 1 - progress,
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
          return (
            <div
              key={item.id}
              className={item.type === 'bomb' ? 'bomb' : 'balloon'}
              style={{
                width: item.size,
                height: item.size,
                transform: `translate(${item.x}px, ${item.y}px) rotate(${item.rotation}deg)`,
                opacity: Math.min(1, lifeLeft + 0.2),
                '--hue': item.hue,
              }}
            />
          )
        })}

        {status === 'playing' && (
          <div
            className="avatar"
            style={{ transform: `translate(${avatar.x}px, ${avatar.y}px) rotate(${avatar.rotation}deg)` }}
          >
            <div className={`avatar-inner${performance.now() < stunnedUntilRef.current ? ' stunned' : ''}`}>
              <div className="avatar-fletch avatar-fletch-left" />
              <div className="avatar-fletch avatar-fletch-right" />
              <div className="avatar-shaft" />
              <div className="avatar-head" />
            </div>
          </div>
        )}

        {status === 'idle' && (
          <div className="overlay">
            <div className="overlay-card">
              <div className="overlay-emoji">🎈</div>
              <h1>Tappers</h1>
              <p>Swipe to steer your arrow — it's slow and heavy, so lead your swipes.</p>
              <p className="hint">Chain pops for combo points. Dodge the spiky bombs — they sting and stun!</p>
              <p className="hint">Letting one vanish costs you too. It only gets faster from here.</p>
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

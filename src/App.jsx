import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const ROUND_SECONDS = 60
const SPAWN_INTERVAL_MS = 650
const MAX_ITEMS = 8
const MIN_LIFESPAN_MS = 1800
const MAX_LIFESPAN_MS = 3200
const SPEED = 60 // px per second
const SPLASH_DURATION_MS = 550

// toughness tiers: size range, required hold time, score value
const TIERS = [
  { tier: 1, minSize: 46, maxSize: 58, holdMs: 90, points: 1 },
  { tier: 2, minSize: 58, maxSize: 72, holdMs: 380, points: 2 },
  { tier: 3, minSize: 72, maxSize: 88, holdMs: 680, points: 3 },
]
const TIER_WEIGHTS = [0.55, 0.3, 0.15]

let nextId = 1
let nextSplashId = 1

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
  const [splashes, setSplashes] = useState([])
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS)
  const [missed, setMissed] = useState(0)
  const [pressedId, setPressedId] = useState(null)

  const arenaRef = useRef(null)
  const itemsRef = useRef([])
  const splashesRef = useRef([])
  const pressingRef = useRef(null) // { id, start }
  const rafRef = useRef(null)
  const lastSpawnRef = useRef(0)
  const lastFrameRef = useRef(0)
  const endAtRef = useRef(0)

  itemsRef.current = items
  splashesRef.current = splashes

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

    // move + spin
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

    // resolve hold-to-pop
    const pressing = pressingRef.current
    if (pressing) {
      const pressedItem = itemsRef.current.find((i) => i.id === pressing.id)
      if (!pressedItem) {
        pressingRef.current = null
      } else if (now - pressing.start >= pressedItem.holdMs) {
        itemsRef.current = itemsRef.current.filter((i) => i.id !== pressedItem.id)
        splashesRef.current = [
          ...splashesRef.current,
          {
            id: nextSplashId++,
            x: pressedItem.x + pressedItem.size / 2,
            y: pressedItem.y + pressedItem.size / 2,
            size: pressedItem.size,
            hue: pressedItem.hue,
            bornAt: now,
          },
        ]
        setScore((s) => s + pressedItem.points)
        pressingRef.current = null
        setPressedId(null)
      }
    }

    // expire items past lifespan
    let missedThisFrame = 0
    itemsRef.current = itemsRef.current.filter((item) => {
      const alive = now - item.bornAt < item.lifespan
      if (!alive) {
        missedThisFrame += 1
        if (pressingRef.current?.id === item.id) {
          pressingRef.current = null
          setPressedId(null)
        }
      }
      return alive
    })
    if (missedThisFrame > 0) setMissed((m) => m + missedThisFrame)

    // age out splashes
    splashesRef.current = splashesRef.current.filter((s) => now - s.bornAt < SPLASH_DURATION_MS)

    setItems(itemsRef.current)
    setSplashes(splashesRef.current)

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
    itemsRef.current = []
    splashesRef.current = []
    pressingRef.current = null
    setItems([])
    setSplashes([])
    setPressedId(null)
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

  const beginPress = useCallback((e, item) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pressingRef.current = { id: item.id, start: performance.now() }
    setPressedId(item.id)
  }, [])

  const endPress = useCallback((e, item) => {
    if (pressingRef.current?.id === item.id) {
      pressingRef.current = null
      setPressedId(null)
    }
  }, [])

  return (
    <div className="app">
      <header className="hud">
        <div className="hud-stat">Score: {score}</div>
        <div className="hud-stat">Time: {timeLeft}s</div>
        <div className="hud-stat">Missed: {missed}</div>
      </header>

      <div className="arena" ref={arenaRef}>
        {splashes.map((s) => {
          const progress = Math.min(1, (performance.now() - s.bornAt) / SPLASH_DURATION_MS)
          const scale = 1 + progress * 1.6
          return (
            <div
              key={s.id}
              className="splash"
              style={{
                width: s.size,
                height: s.size,
                left: s.x - s.size / 2,
                top: s.y - s.size / 2,
                background: `radial-gradient(circle, hsla(${s.hue},90%,60%,0.85), hsla(${s.hue},90%,60%,0) 70%)`,
                transform: `scale(${scale})`,
                opacity: 1 - progress,
              }}
            />
          )
        })}

        {items.map((item) => {
          const ageMs = performance.now() - item.bornAt
          const lifeLeft = Math.max(0, 1 - ageMs / item.lifespan)
          const isPressed = pressedId === item.id
          const holdStart = pressingRef.current?.id === item.id ? pressingRef.current.start : null
          const holdProgress = holdStart ? Math.min(1, (performance.now() - holdStart) / item.holdMs) : 0
          const squish = isPressed ? 1 - holdProgress * 0.18 : 1
          return (
            <button
              key={item.id}
              className={`balloon${isPressed ? ' pressed' : ''}`}
              style={{
                width: item.size,
                height: item.size,
                transform: `translate(${item.x}px, ${item.y}px) rotate(${item.rotation}deg) scale(${squish})`,
                background: `radial-gradient(circle at 35% 30%, hsl(${item.hue} 95% 75%), hsl(${item.hue} 85% 50%))`,
                opacity: Math.min(1, lifeLeft + 0.2),
                boxShadow: isPressed
                  ? `0 0 0 4px hsla(${item.hue},90%,70%,0.9), 0 4px 14px rgba(0,0,0,0.4)`
                  : undefined,
              }}
              onPointerDown={(e) => beginPress(e, item)}
              onPointerUp={(e) => endPress(e, item)}
              onPointerLeave={(e) => endPress(e, item)}
              onPointerCancel={(e) => endPress(e, item)}
              aria-label={`balloon tier ${item.tier}`}
            />
          )
        })}

        {status === 'idle' && (
          <div className="overlay">
            <h1>Tappers</h1>
            <p>Pop balloons before they drift off.</p>
            <p>Big ones are tougher — press and hold.</p>
            <button className="primary" onClick={startGame}>Start</button>
          </div>
        )}

        {status === 'over' && (
          <div className="overlay">
            <h1>Time's up!</h1>
            <p>Score: {score}</p>
            <p>Missed: {missed}</p>
            <button className="primary" onClick={startGame}>Play again</button>
          </div>
        )}
      </div>
    </div>
  )
}

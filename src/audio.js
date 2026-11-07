let ctx = null
let masterGain = null
let musicGain = null
let sfxGain = null
let musicTimer = null
let musicStep = 0
let muted = false

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    masterGain = ctx.createGain()
    masterGain.gain.value = muted ? 0 : 1
    masterGain.connect(ctx.destination)
    musicGain = ctx.createGain()
    musicGain.gain.value = 0.16
    musicGain.connect(masterGain)
    sfxGain = ctx.createGain()
    sfxGain.gain.value = 0.5
    sfxGain.connect(masterGain)
  }
  return ctx
}

export function resumeAudio() {
  const c = getCtx()
  if (c.state === 'suspended') c.resume()
}

export function setMuted(value) {
  muted = value
  if (masterGain) masterGain.gain.value = value ? 0 : 1
}

function tone({ freq, duration, type = 'sine', gainStart = 0.3, gainEnd = 0.0001, delay = 0, freqEnd, filterFreq, bus = 'sfx' }) {
  const c = getCtx()
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration)
  const gain = c.createGain()
  gain.gain.setValueAtTime(gainStart, t0)
  gain.gain.exponentialRampToValueAtTime(gainEnd, t0 + duration)
  if (filterFreq) {
    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(filterFreq, t0)
    osc.connect(filter)
    filter.connect(gain)
  } else {
    osc.connect(gain)
  }
  gain.connect(bus === 'music' ? musicGain : sfxGain)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

export function playPop(tier = 1, comboMult = 1) {
  const base = 520 + tier * 70 + Math.min(comboMult, 5) * 40
  tone({ freq: base, freqEnd: base * 1.6, duration: 0.12, type: 'triangle', gainStart: 0.28 })
}

export function playSlowHit(stacked = false) {
  const startFreq = stacked ? 320 : 420
  tone({ freq: startFreq, freqEnd: startFreq * 0.3, duration: 0.4, type: 'sawtooth', gainStart: 0.35, filterFreq: 900 })
}

export function playMiss() {
  tone({ freq: 200, freqEnd: 140, duration: 0.12, type: 'sine', gainStart: 0.12 })
}

export function playStart() {
  tone({ freq: 440, freqEnd: 880, duration: 0.18, type: 'triangle', gainStart: 0.25 })
}

export function playGameOver() {
  ;[660, 550, 440, 330].forEach((f, i) => {
    tone({ freq: f, duration: 0.22, type: 'triangle', gainStart: 0.22, delay: i * 0.12 })
  })
}

const BASS_PATTERN = [55, 55, 61.7, 73.4]
const NOTE_DUR = 0.42

export function startMusic() {
  stopMusic()
  musicStep = 0
  const schedule = () => {
    const freq = BASS_PATTERN[musicStep % BASS_PATTERN.length]
    tone({ freq, duration: NOTE_DUR * 0.85, type: 'square', gainStart: 0.5, bus: 'music' })
    musicStep += 1
  }
  schedule()
  musicTimer = setInterval(schedule, NOTE_DUR * 1000)
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer)
  musicTimer = null
}

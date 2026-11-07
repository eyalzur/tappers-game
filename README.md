# Tappers

Swipe to steer a thin wooden arrow that's deliberately slow and heavy — it trails well behind your finger, so you have to lead your swipes and anticipate where a balloon is headed, Fruit-Ninja style. One touch pops any balloon it crosses, so a good lead swipe can chain several at once for a combo multiplier. Spiky balloons are mixed in: pop one and it costs points, breaks your combo, and halves your chase speed for 3 seconds (shown as a countdown badge). Popping another spiky one while that's still active stacks it — another 10% off speed and +1s on the clock. Letting a balloon vanish costs points too. Spawn rate, balloon speed, bomb frequency, and balloon lifespan all ramp up as the round goes on, and the arrow gets even heavier to steer.

Phase 1: single player. Planned: play against a robot, then real two-player.

Built as a React + Vite PWA, deployable to GitHub Pages, with React Native as the eventual native target.

## Dev

```
npm install
npm run dev
```

## Build / Deploy

```
npm run build      # outputs to dist/
npm run deploy      # manual publish to gh-pages branch (optional)
```

Pushing to `main` also deploys automatically via `.github/workflows/deploy.yml` to GitHub Pages.

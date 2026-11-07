# Tappers

Swipe to steer a thin wooden arrow that trails just behind your finger — the lag is the challenge. One touch pops any balloon it crosses, so a good swipe can chain several at once for a combo multiplier. Spiky bombs are mixed in: pop one and it costs points, breaks your combo, and stuns your arrow for a moment. Letting a balloon vanish costs points too. Spawn rate, balloon speed, bomb frequency, and balloon lifespan all ramp up as the round goes on — and the arrow's catch-up speed and touch window shrink right along with it, so the back half demands real precision.

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

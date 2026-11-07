# Tappers

Swipe to steer a thin wooden arrow that trails just behind your finger — the lag is the challenge. One touch pops any balloon it crosses, so a good swipe can chain several at once. Popping splashes colored water matching the balloon's color.

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

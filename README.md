# Tappers

Tap where you want to go — your arrow avatar takes time to travel there, which is the challenge. Touch a balloon with the arrow to pop it; small ones pop on contact, bigger ones need the arrow to linger. Popping splashes colored water matching the balloon's color.

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

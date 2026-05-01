# Nous Mnemos — Web App UI Kit

A click-thru, high-fidelity recreation of the Nous Mnemos dApp.

## Files
- `index.html` — the running prototype (multi-screen, router-less navigation)
- `App.jsx` — shell, nav, footer, page switcher
- `Landing.jsx` — hero, how-it-works, live feed, stats, final CTA
- `Chat.jsx` — split composer / preview with 5 states (empty, generating, response, success, error)
- `MyRecords.jsx` — owner's list with decrypt modal
- `RecordDetail.jsx` — public record view with proof panel
- `Components.jsx` — shared primitives (Button, Card, Badge, Avatar, Input, etc.)
- `Decor.jsx` — bubbles, clouds, meadow, lens-flare background layer

All data is mocked in `Components.jsx`'s `MOCK` export. No backend, no wallet — UI only.

`// TODO: connect to contract` comments mark the real integration points.

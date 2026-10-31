Reserved for Stage 5 (smart push notifications).

Plan: a `summary.js` here builds a small daily summary from `store/state.js`
(water total vs goal, supplements done, workout done, streak states) and syncs it
to a Cloudflare Worker when online. `sw.js` gets `push` / `notificationclick` handlers.
No other files need to change.

# TODO - Fix dashboard crash (Expo Router)

- [ ] Inspect current `app/dashboard.tsx` for unsafe JSON parsing, missing loading/error states, and unsafe calculations (followers/following/mutuals/not-follow-back/don’t-follow-back).
- [ ] Implement safe JSON parsing + schema normalization for AsyncStorage payloads (followers/following arrays, pendingRequests, processedAt).
- [ ] Prevent dashboard render until data + stats are ready (loading/error states).
- [ ] Fix all unsafe `useMemo`/derived computations by removing calculations that run when `data`/`stats` are null, or by using defensive fallbacks.
- [ ] Replace `computeStats(data)` with a defensive version that accepts partial/corrupted data and never throws.
- [ ] Ensure relationship calculations are correct:
  - [ ] followers count
  - [ ] following count
  - [ ] mutuals
  - [ ] not following back
  - [ ] don’t follow back
  - [ ] pending requests
- [ ] Add error boundary logic (in-screen fallback) so corrupted storage never crashes the app.
- [ ] Add safe optional chaining everywhere in the dashboard render.
- [x] Run TypeScript check + lint (or project test command) to ensure no build breaks.



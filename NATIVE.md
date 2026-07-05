# Peer — native builds (one codebase → iPhone, Android, Windows, macOS + PWA)

The web app in `src/` is the single source. `dist/` (from `npm run build`) is
what every shell wraps. The PWA (manifest + service worker) keeps working
unchanged; all native integration in `src/native.js` is feature-detected and
silently inert in a plain browser.

## Layout
- `capacitor.config.json` + `android/` + `ios/` — Capacitor mobile shells
  (appId `app.peer.study`, warm-ink background, dark status bar).
- `src-tauri/` — Tauri desktop shell (Windows/macOS/Linux), identifier
  `app.peer.study`, its own strict CSP, 1280×860 default window.
- `src/native.js` — status bar styling, deep links (`appUrlOpen` re-enters the
  SPA so Supabase OAuth/magic-link redirects land correctly), Android hardware
  back (history walk, minimize at root), and `hapticTap()` (used on badge
  earns). Badge sharing already uses `navigator.share`, which maps to the
  native share sheet inside the shells.

## Building (needs the platform toolchains — not installed on the dev machine)
Every code/config piece is committed; these commands are all that remain.

**Android** (Android Studio or SDK + JDK 21):
```sh
npm run build && npx cap sync android
npx cap open android    # or: cd android && ./gradlew assembleDebug
```
Release: set up a signing key in `android/`, `./gradlew bundleRelease`,
upload the .aab with the owner's Play account ($25).

**iOS** (macOS + Xcode):
```sh
npm run build && npx cap sync ios
npx cap open ios        # sign with the owner's Apple Developer team ($99/yr)
```

**Windows/macOS/Linux desktop** (Rust toolchain: https://rustup.rs):
```sh
npx tauri dev           # live dev shell against the Vite server
npx tauri build         # installer (.msi/.exe on Windows, .dmg/.app on macOS)
```

## Remaining native niceties (deliberate owner-dependent steps)
- **Icons/splash**: shells currently use template icons. Generate branded sets
  from a 1024×1024 PNG export of `public/icon.svg` with
  `npm i -D @capacitor/assets && npx capacitor-assets generate` (mobile) and
  `npx tauri icon <png>` (desktop).
- **Push notifications**: requires Firebase (FCM) + APNs credentials — wire
  `@capacitor/push-notifications` once those accounts exist (M13 reminders
  feature will drive the actual notification content).
- **Deep-link domains**: add the production domain to iOS Associated Domains +
  Android App Links (assetlinks.json) at launch time.
- **API endpoint**: native builds must point at the deployed API (Supabase
  edge functions) rather than the local dev proxy — flip when M13 hosting
  lands (`/api/*` calls are relative today; a `PEER_API_BASE` swap is the spot).

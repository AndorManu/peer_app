// Peer — native shell integration (Capacitor iOS/Android, Tauri desktop).
// Everything here is feature-detected and a silent no-op on the plain web,
// so the PWA keeps working unchanged from the same codebase.
import { Capacitor } from "@capacitor/core";

export const isNativeMobile = () => Capacitor.isNativePlatform();

// One-time shell setup: warm status bar, deep links, Android hardware back.
export async function initNativeShell() {
  if (!isNativeMobile()) return;

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: "#15120d" });
    }
  } catch { /* plugin unavailable */ }

  try {
    const { App } = await import("@capacitor/app");
    // Deep links: peer://... or https universal links land back in the app
    // (Supabase OAuth/magic-link redirects included — the SPA router is the
    // URL hash/session detection supabase-js already performs).
    App.addListener("appUrlOpen", ({ url }) => {
      try {
        const target = new URL(url);
        const next = target.hash || target.search
          ? `${window.location.origin}/${target.search}${target.hash}`
          : window.location.origin;
        window.location.href = next;
      } catch { /* malformed url — ignore */ }
    });
    // Android hardware back: walk browser history, minimize at the root.
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else App.minimizeApp();
    });
  } catch { /* plugin unavailable */ }
}

// A soft tap for small wins (badge earned, card graded). No-op on web.
export async function hapticTap(style = "LIGHT") {
  if (!isNativeMobile()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle[style] || ImpactStyle.Light });
  } catch { /* no haptics on this device */ }
}

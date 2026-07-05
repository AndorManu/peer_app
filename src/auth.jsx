// Peer — real authentication (Supabase Auth).
// Landing sign-in/sign-up panel: Google + Facebook OAuth, email with password
// or magic link, and local guest mode. Replaces the old fake demo-code flow.
// Social providers need owner-side configuration in the Supabase dashboard;
// until then the buttons surface a clear "not enabled yet" message.
import React, { useEffect, useState } from "react";
import { Loader2, Mail, Sparkles, FileText, CheckCircle2, Wand2 } from "lucide-react";
import { getSupabase } from "./supabase.js";

// Which OAuth providers are actually switched on server-side. Buttons for
// disabled providers hide entirely (no dead ends); the moment the owner
// enables one in the Supabase dashboard it appears with zero code changes.
function useEnabledProviders() {
  const [providers, setProviders] = useState({ google: false, facebook: false });
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const config = await (await fetch("/api/config")).json();
        if (!config.supabaseUrl || !config.supabaseAnonKey) return;
        const settings = await (await fetch(`${config.supabaseUrl}/auth/v1/settings`, {
          headers: { apikey: config.supabaseAnonKey },
        })).json();
        if (active) {
          setProviders({
            google: Boolean(settings.external?.google),
            facebook: Boolean(settings.external?.facebook),
          });
        }
      } catch { /* leave both hidden — email always works */ }
    })();
    return () => { active = false; };
  }, []);
  return providers;
}

// Map a Supabase session user to the app's account shape.
export function accountFromUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  const provider = user.app_metadata?.provider || "email";
  return {
    id: user.id,
    name: String(meta.full_name || meta.name || user.email?.split("@")[0] || "Learner").slice(0, 80),
    email: String(user.email || "").slice(0, 160),
    provider: ["google", "facebook", "email"].includes(provider) ? provider : "email",
    verified: true,
    createdAt: Date.parse(user.created_at) || Date.now(),
    lastLoginAt: Date.now(),
  };
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#1877F2" d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078V12h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.234 2.686.234v2.953H15.83c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.469h-2.796v8.385C19.612 22.954 24 17.99 24 12z" />
      <path fill="#fff" d="M16.671 15.469 17.203 12h-3.328V9.749c0-.949.465-1.874 1.956-1.874h1.513V4.922s-1.374-.234-2.686-.234c-2.741 0-4.533 1.66-4.533 4.668V12H7.078v3.469h3.047v8.385a12.09 12.09 0 0 0 3.75 0v-8.385h2.796z" />
    </svg>
  );
}

export function LandingAuthFlow({ continueAsGuest, PeerLogo }) {
  const providers = useEnabledProviders();
  const [mode, setMode] = useState("signin"); // signin | signup | magic | sent | confirm-sent
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function withClient(action, label) {
    setError("");
    setBusy(label);
    try {
      const client = await getSupabase();
      if (!client) throw new Error("Cloud accounts are unavailable right now. You can keep learning in guest mode.");
      await action(client);
    } catch (err) {
      setError(err?.message || "Something went wrong. Try again.");
    } finally {
      setBusy("");
    }
  }

  function signInWithProvider(provider) {
    withClient(async (client) => {
      const { error: oauthError } = await client.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (oauthError) {
        throw new Error(
          /not enabled|disabled|unsupported/i.test(oauthError.message)
            ? `${provider === "google" ? "Google" : "Facebook"} sign-in isn't switched on for this app yet — use email for now.`
            : oauthError.message,
        );
      }
      // success = browser navigates away to the provider
    }, provider);
  }

  function submitEmail(event) {
    event.preventDefault();
    const cleanEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (mode === "magic") {
      withClient(async (client) => {
        const { error: otpError } = await client.auth.signInWithOtp({
          email: cleanEmail,
          options: { emailRedirectTo: window.location.origin },
        });
        if (otpError) throw otpError;
        setMode("sent");
      }, "magic");
      return;
    }

    if (password.length < 8) {
      setError("Password needs at least 8 characters.");
      return;
    }

    if (mode === "signup") {
      withClient(async (client) => {
        const { data, error: signUpError } = await client.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { full_name: name.trim() || cleanEmail.split("@")[0] },
            emailRedirectTo: window.location.origin,
          },
        });
        if (signUpError) throw signUpError;
        // If confirmations are on, there's no session yet — tell them to check mail.
        if (!data.session) setMode("confirm-sent");
        // With a session, onAuthStateChange in App takes over.
      }, "signup");
      return;
    }

    withClient(async (client) => {
      const { error: signInError } = await client.auth.signInWithPassword({ email: cleanEmail, password });
      if (signInError) {
        throw new Error(/invalid login credentials/i.test(signInError.message)
          ? "Wrong email or password. If you're new, create an account first."
          : signInError.message);
      }
      // session event flows through onAuthStateChange in App
    }, "signin");
  }

  const emailBusy = busy === "signin" || busy === "signup" || busy === "magic";

  return (
    <section className="landing-shell">
      <div className="landing-hero">
        <div className="landing-brand">
          <PeerLogo size={30} />
          <span>peer</span>
        </div>
        <div className="landing-copy">
          <span className="landing-kicker">Your adaptive study partner</span>
          <h1>Learn like you have a patient study partner beside you.</h1>
          <p>
            Peer watches how you ask questions, what confuses you, what clicks, and which examples help.
            Then it adapts explanations, quizzes, documents, notes, and teach-back practice around your actual learning pattern.
          </p>
        </div>
        <div className="landing-points">
          <span><Sparkles size={15} /> Learns from feedback</span>
          <span><FileText size={15} /> Saves study materials</span>
          <span><CheckCircle2 size={15} /> Syncs across your devices</span>
        </div>
      </div>

      <div className="auth-panel">
        {(mode === "signin" || mode === "signup") && (
          <>
            <h2>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
            <p className="auth-note">
              {mode === "signup"
                ? "Your learning brain backs up automatically and follows you to any device."
                : "Sign in to pick up where you left off — on any device."}
            </p>

            {(providers.google || providers.facebook) && (
              <div className="auth-providers">
                {providers.google && (
                  <button type="button" onClick={() => signInWithProvider("google")} disabled={Boolean(busy)}>
                    {busy === "google" ? <Loader2 size={16} className="spin" /> : <GoogleMark />} Continue with Google
                  </button>
                )}
                {providers.facebook && (
                  <button type="button" onClick={() => signInWithProvider("facebook")} disabled={Boolean(busy)}>
                    {busy === "facebook" ? <Loader2 size={16} className="spin" /> : <FacebookMark />} Continue with Facebook
                  </button>
                )}
              </div>
            )}

            {(providers.google || providers.facebook) && (
              <div className="auth-divider" role="separator"><span>or use email</span></div>
            )}

            <form className="auth-form" onSubmit={submitEmail}>
              {mode === "signup" && (
                <label>
                  Name
                  <input value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="Your name" autoComplete="name" />
                </label>
              )}
              <label>
                Email
                <input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder="you@example.com" autoComplete="email" required />
              </label>
              <label>
                Password
                <input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} />
              </label>
              {error && <div className="auth-error" role="alert">{error}</div>}
              <button className="primary-button wide" type="submit" disabled={Boolean(busy)}>
                {emailBusy ? <Loader2 size={16} className="spin" /> : <Mail size={16} />}
                {mode === "signup" ? "Create account" : "Sign in"}
              </button>
              <button type="button" className="auth-secondary" onClick={() => { setMode("magic"); setError(""); }}>
                <Wand2 size={14} /> Email me a magic link instead
              </button>
            </form>

            <p className="auth-switch">
              {mode === "signup" ? (
                <>Already have an account? <button type="button" onClick={() => { setMode("signin"); setError(""); }}>Sign in</button></>
              ) : (
                <>New to Peer? <button type="button" onClick={() => { setMode("signup"); setError(""); }}>Create an account</button></>
              )}
            </p>

            <button type="button" className="auth-guest" onClick={continueAsGuest}>
              Skip for now — try Peer on this device
            </button>
          </>
        )}

        {mode === "magic" && (
          <>
            <h2>Magic link sign-in</h2>
            <p className="auth-note">No password needed — we'll email you a link that signs you straight in.</p>
            <form className="auth-form" onSubmit={submitEmail}>
              <label>
                Email
                <input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder="you@example.com" autoComplete="email" required />
              </label>
              {error && <div className="auth-error" role="alert">{error}</div>}
              <button className="primary-button wide" type="submit" disabled={Boolean(busy)}>
                {busy === "magic" ? <Loader2 size={16} className="spin" /> : <Wand2 size={16} />} Send magic link
              </button>
              <button type="button" className="auth-secondary" onClick={() => { setMode("signin"); setError(""); }}>Back to password sign-in</button>
            </form>
          </>
        )}

        {(mode === "sent" || mode === "confirm-sent") && (
          <>
            <h2>Check your email</h2>
            <p className="auth-note">
              {mode === "sent"
                ? <>We sent a magic sign-in link to <strong>{email.trim()}</strong>. Open it on this device and you're in.</>
                : <>Almost there — we sent a confirmation link to <strong>{email.trim()}</strong>. Click it, then sign in.</>}
            </p>
            <button type="button" className="auth-secondary" onClick={() => { setMode("signin"); setError(""); }}>Back to sign-in</button>
            <button type="button" className="auth-guest" onClick={continueAsGuest}>
              Keep learning as a guest meanwhile
            </button>
          </>
        )}
      </div>
    </section>
  );
}

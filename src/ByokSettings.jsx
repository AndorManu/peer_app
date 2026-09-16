// Settings → AI key. The key never leaves this browser except to the provider
// the learner picked; there is no Peer server in between on the hosted build.
import React, { useState } from "react";
import { BYOK_PROVIDERS, clearByok, getByok, setByok, testByok } from "./byok.js";

export function ByokSettings({ onSaved, compact = false }) {
  const existing = getByok();
  const [provider, setProvider] = useState(existing?.provider || "anthropic");
  const [key, setKey] = useState(existing?.key || "");
  const [model, setModel] = useState(existing?.model || BYOK_PROVIDERS[existing?.provider || "anthropic"].models[0].id);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState(existing ? { kind: "saved", text: "Key saved on this device." } : null);
  const [busy, setBusy] = useState(false);
  const p = BYOK_PROVIDERS[provider];

  function pickProvider(id) {
    setProvider(id);
    setModel(BYOK_PROVIDERS[id].models[0].id);
    setStatus(null);
  }

  async function save() {
    const trimmed = key.trim();
    if (!trimmed) { setStatus({ kind: "error", text: "Paste a key first." }); return; }
    setBusy(true);
    setStatus({ kind: "busy", text: "Checking the key with the provider…" });
    const result = await testByok({ provider, key: trimmed, model });
    setBusy(false);
    if (!result.ok) { setStatus({ kind: "error", text: result.error }); return; }
    setByok({ provider, key: trimmed, model });
    setStatus({ kind: "saved", text: "Key works and is saved on this device." });
    onSaved?.();
  }

  function forget() {
    clearByok();
    setKey("");
    setStatus({ kind: "saved", text: "Key removed from this device." });
  }

  return (
    <div className={`byok${compact ? " byok-compact" : ""}`}>
      {!compact && (
        <div className="settings-group">
          <h2 className="byok-h">Your own API key</h2>
          <p className="settings-danger-desc">
            Peer runs entirely in your browser. Your key is stored only on this device and is sent only to the provider you choose — there is no Peer server in between. You pay the provider directly; a study session costs cents.
          </p>
        </div>
      )}

      <div className="settings-group">
        <h2 className="byok-h">Provider</h2>
        <div className="segmented">
          {Object.entries(BYOK_PROVIDERS).map(([id, item]) => (
            <button key={id} type="button" className={provider === id ? "active" : ""} onClick={() => pickProvider(id)}>{item.label}</button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <h2 className="byok-h">API key</h2>
        <div className="byok-row">
          <input
            type={show ? "text" : "password"}
            className="byok-input"
            placeholder={p.keyHint}
            value={key}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => { setKey(e.target.value); setStatus(null); }}
          />
          <button type="button" onClick={() => setShow((v) => !v)}>{show ? "Hide" : "Show"}</button>
        </div>
        <p className="settings-danger-desc">
          Get one at <a href={p.consoleUrl} target="_blank" rel="noreferrer">{p.consoleUrl.replace("https://", "")}</a>. Set a small spending limit there if you like.
        </p>
      </div>

      <div className="settings-group">
        <h2 className="byok-h">Model</h2>
        <select className="byok-select" value={model} onChange={(e) => setModel(e.target.value)}>
          {p.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>

      <div className="byok-actions">
        <button type="button" className="primary-button" onClick={save} disabled={busy}>{busy ? "Checking…" : "Test and save"}</button>
        {existing && <button type="button" onClick={forget} disabled={busy}>Forget key</button>}
      </div>
      {status && <p className={`byok-status byok-${status.kind}`} role="status">{status.text}</p>}
    </div>
  );
}

// First-message prompt on the hosted build: same form, in a modal.
export function ByokPrompt({ onClose, onSaved }) {
  return (
    <div className="modal-backdrop confirm-backdrop" onClick={onClose}>
      <section className="confirm-dialog byok-dialog" role="dialog" aria-modal="true" aria-labelledby="byok-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="byok-title">Add your API key to start</h2>
        <p>Peer has no server. It talks to Anthropic or OpenAI straight from your browser with a key you own, and stores that key only on this device.</p>
        <ByokSettings compact onSaved={onSaved} />
        <div className="confirm-actions">
          <button type="button" onClick={onClose}>Not now</button>
        </div>
      </section>
    </div>
  );
}

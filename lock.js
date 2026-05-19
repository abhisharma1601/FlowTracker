/**
 * lock.js — Password gate. Runs before app.js.
 * Password is stored as a SHA-256 hash — never in plaintext.
 * The in-memory `unlocked` flag resets on every page refresh.
 */

const Lock = (() => {

  // SHA-256 hash of the password. Never store the raw password here.
  const PASSWORD_HASH = 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f';

  let unlocked = false; // in-memory only — resets on every refresh

  async function sha256(text) {
    const encoded = new TextEncoder().encode(text);
    const buffer = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function attempt(password) {
    const hash = await sha256(password);
    return hash === PASSWORD_HASH;
  }

  function shake(el) {
    el.classList.remove('lock-shake');
    void el.offsetWidth; // reflow to restart animation
    el.classList.add('lock-shake');
  }

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'lock-overlay';
    overlay.innerHTML = `
      <div class="lock-box">
        <div class="lock-icon">🔒</div>
        <h2 class="lock-title">Tracker</h2>
        <p class="lock-sub">Enter your password to continue</p>
        <div class="lock-field-wrap" id="lock-field-wrap">
          <input
            class="lock-input"
            id="lock-input"
            type="password"
            placeholder="Password"
            autocomplete="current-password"
            autofocus
          >
          <button class="lock-btn" id="lock-btn">→</button>
        </div>
        <p class="lock-error" id="lock-error"></p>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  function dismiss() {
    const overlay = document.getElementById('lock-overlay');
    if (!overlay) return;
    overlay.classList.add('lock-dismissed');
    setTimeout(() => overlay.remove(), 400);
  }

  function init() {
    buildOverlay();

    const input = document.getElementById('lock-input');
    const btn = document.getElementById('lock-btn');
    const error = document.getElementById('lock-error');
    const wrap = document.getElementById('lock-field-wrap');

    async function submit() {
      const val = input.value;
      if (!val) return;

      btn.textContent = '…';
      btn.disabled = true;

      const ok = await attempt(val);

      if (ok) {
        unlocked = true;
        error.textContent = '';
        dismiss();
      } else {
        error.textContent = 'Incorrect password. Try again.';
        input.value = '';
        shake(wrap);
        btn.textContent = '→';
        btn.disabled = false;
        input.focus();
      }
    }

    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

    // Auto-focus even if browser delayed it
    setTimeout(() => input?.focus(), 80);
  }

  return { init, isUnlocked: () => unlocked };
})();

document.addEventListener('DOMContentLoaded', () => Lock.init());

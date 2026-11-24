import {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  mapAuthError,
} from '../firebase.js';
import { escapeHtml } from '../utils.js';

let authMode = 'login'; // login | signup | reset
let busy = false;
let errorMsg = '';
let infoMsg = '';

function hasLocalLegacyData() {
  try {
    const raw = localStorage.getItem('taskflow_os_v1');
    if (!raw) return false;
    const p = JSON.parse(raw);
    return Boolean(
      p &&
        ((p.tasks && p.tasks.length > 0) ||
          (p.projects && p.projects.length > 0) ||
          (p.notes && p.notes.length > 0) ||
          (p.subjects && p.subjects.length > 0))
    );
  } catch {
    return false;
  }
}

export function renderAuthView(rootEl) {
  const localDetected = hasLocalLegacyData();

  rootEl.innerHTML = `
    <div class="auth-shell">
      <div class="auth-card card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
          <div class="tf-brand-logo" aria-hidden="true">TF</div>
          <div>
            <h1 style="font-size:20px;font-weight:700;line-height:1.2;">TASKFLOW</h1>
            <div style="font-size:13px;color:var(--text-muted);">Personal Productivity OS · Cloud Sync</div>
          </div>
        </div>

        <div class="segmented" role="tablist" style="width:100%;margin-bottom:18px;">
          <button type="button" class="segmented-btn ${authMode === 'login' ? 'active' : ''}" data-auth-mode="login" style="flex:1;">Sign In</button>
          <button type="button" class="segmented-btn ${authMode === 'signup' ? 'active' : ''}" data-auth-mode="signup" style="flex:1;">Sign Up</button>
          <button type="button" class="segmented-btn ${authMode === 'reset' ? 'active' : ''}" data-auth-mode="reset" style="flex:1;">Reset Password</button>
        </div>

        ${
          errorMsg
            ? `<div class="auth-alert auth-alert-error" role="alert">${escapeHtml(errorMsg)}</div>`
            : ''
        }
        ${
          infoMsg
            ? `<div class="auth-alert auth-alert-success" role="status">${escapeHtml(infoMsg)}</div>`
            : ''
        }

        <form id="tf-auth-form" novalidate>
          <div class="form-grid" style="grid-template-columns:1fr;">
            ${
              authMode === 'signup'
                ? `<div class="form-field">
                    <label class="form-label" for="auth-name">Full Name</label>
                    <input id="auth-name" class="input" type="text" autocomplete="name" placeholder="e.g., Harshal" ${busy ? 'disabled' : ''} />
                  </div>`
                : ''
            }
            <div class="form-field">
              <label class="form-label" for="auth-email">Email Address *</label>
              <input id="auth-email" class="input" type="email" autocomplete="email" required placeholder="you@example.com" ${busy ? 'disabled' : ''} />
            </div>
            ${
              authMode !== 'reset'
                ? `<div class="form-field">
                    <label class="form-label" for="auth-password">Password *</label>
                    <input id="auth-password" class="input" type="password" autocomplete="${authMode === 'signup' ? 'new-password' : 'current-password'}" required placeholder="${authMode === 'signup' ? 'At least 6 characters' : 'Enter your password'}" ${busy ? 'disabled' : ''} />
                  </div>`
                : ''
            }
            ${
              authMode === 'signup'
                ? `<div class="form-field">
                    <label class="form-label" for="auth-confirm">Confirm Password *</label>
                    <input id="auth-confirm" class="input" type="password" autocomplete="new-password" required placeholder="Re-enter password" ${busy ? 'disabled' : ''} />
                  </div>`
                : ''
            }

            <button type="submit" class="btn btn-primary" style="width:100%;margin-top:4px;" ${busy ? 'disabled' : ''}>
              ${
                busy
                  ? authMode === 'signup'
                    ? 'Creating account...'
                    : authMode === 'reset'
                    ? 'Sending reset link...'
                    : 'Signing in...'
                  : authMode === 'signup'
                  ? 'Create Account'
                  : authMode === 'reset'
                  ? 'Send Password Reset Email'
                  : 'Sign In to TASKFLOW'
              }
            </button>
          </div>
        </form>

        ${
          authMode !== 'reset'
            ? `<div style="margin:16px 0;display:flex;align-items:center;gap:10px;color:var(--text-muted);font-size:12px;">
                 <span style="flex:1;height:1px;background:var(--border-hairline);"></span>
                 <span>or</span>
                 <span style="flex:1;height:1px;background:var(--border-hairline);"></span>
               </div>
               <button type="button" id="auth-google-btn" class="btn btn-secondary" style="width:100%;" ${busy ? 'disabled' : ''}>
                 Continue with Google
               </button>`
            : ''
        }

        ${
          localDetected
            ? `<div style="margin-top:16px;padding:10px 12px;border-radius:8px;background:var(--bg-input);border:1px solid var(--border-hairline);font-size:12.5px;color:var(--text-secondary);">
                 Existing local workspace data detected on this browser. It is preserved safely and you can merge it into your account right after sign-in.
               </div>`
            : ''
        }
      </div>
    </div>
  `;

  rootEl.querySelectorAll('[data-auth-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (busy) return;
      authMode = btn.getAttribute('data-auth-mode');
      errorMsg = '';
      infoMsg = '';
      renderAuthView(rootEl);
    });
  });

  rootEl.querySelector('#tf-auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    errorMsg = '';
    infoMsg = '';

    const email = rootEl.querySelector('#auth-email').value.trim();
    const password = rootEl.querySelector('#auth-password')?.value || '';
    const confirm = rootEl.querySelector('#auth-confirm')?.value || '';
    const name = rootEl.querySelector('#auth-name')?.value.trim() || '';

    if (!email) {
      errorMsg = 'Please enter your email address.';
      renderAuthView(rootEl);
      return;
    }

    if (authMode === 'reset') {
      busy = true;
      renderAuthView(rootEl);
      try {
        await sendPasswordResetEmail(auth, email);
        infoMsg = `Password reset email sent to ${email}. Check your inbox and spam folder.`;
        authMode = 'login';
      } catch (err) {
        errorMsg = mapAuthError(err);
      } finally {
        busy = false;
        renderAuthView(rootEl);
      }
      return;
    }

    if (!password || password.length < 6) {
      errorMsg = 'Password must be at least 6 characters.';
      renderAuthView(rootEl);
      return;
    }

    if (authMode === 'signup' && password !== confirm) {
      errorMsg = 'Passwords do not match.';
      renderAuthView(rootEl);
      return;
    }

    busy = true;
    renderAuthView(rootEl);

    try {
      if (authMode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name && cred.user) {
          await updateProfile(cred.user, { displayName: name });
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      errorMsg = mapAuthError(err);
      busy = false;
      renderAuthView(rootEl);
    }
  });

  rootEl.querySelector('#auth-google-btn')?.addEventListener('click', async () => {
    if (busy) return;
    errorMsg = '';
    infoMsg = '';
    busy = true;
    renderAuthView(rootEl);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      errorMsg = mapAuthError(err);
      busy = false;
      renderAuthView(rootEl);
    }
  });
}

export function resetAuthUiState() {
  busy = false;
  errorMsg = '';
  infoMsg = '';
}

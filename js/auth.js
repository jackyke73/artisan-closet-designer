// Sign-in screen in front of the designer.
// DEMO ONLY: nothing leaves the browser and no account is created. Any email and any
// 6-digit code sign in. At launch the two marked spots call a real sign-in service
// (for example Shopify customer accounts, or an email-code service).

// Turn the sign-in screen on or off for the whole designer.
export const SIGN_IN_REQUIRED = true;

const USER_KEY = "artisan-closet-user";
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function currentUser() {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY) || "null");
    return u && typeof u.email === "string" && EMAIL.test(u.email) ? u : null; // ignore anything that isn't a saved sign-in
  } catch { return null; }
}
function save(user) {
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* private mode: signed in for this visit only */ }
}

let gate = null;
let sessionUser = null; // used when the browser won't keep anything

export function initAuth() {
  document.addEventListener("click", (e) => {
    const el = $("#account");
    if (el && !el.contains(e.target)) { const m = $(".acct-menu", el); if (m) m.hidden = true; }
  });
  const user = currentUser() || sessionUser;
  renderAccount(user);
  if (!SIGN_IN_REQUIRED || user) return;
  showGate();
}

function renderAccount(user) {
  const el = $("#account");
  if (!el) return;
  el.hidden = !user;
  if (!user) { el.innerHTML = ""; return; }
  el.innerHTML = `<button class="acct-btn" type="button" aria-haspopup="true" title="${esc(user.email)}"><i>${esc(user.email[0].toUpperCase())}</i><span>${esc(user.email)}</span></button>
    <div class="acct-menu" hidden><p>Signed in as<br><b>${esc(user.email)}</b></p><button type="button" class="btn ghost sm" data-signout>Sign out</button></div>`;
  const menu = $(".acct-menu", el);
  $(".acct-btn", el).onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  $("[data-signout]", el).onclick = () => {
    try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
    sessionUser = null;
    renderAccount(null);
    if (SIGN_IN_REQUIRED) showGate();
  };
  // fill in the send form for them
  const email = $('#sendForm [name="email"]');
  if (email && !email.value) email.value = user.email;
}

function showGate() {
  gate?.remove();
  gate = document.createElement("div");
  gate.className = "signin-gate";
  gate.innerHTML = `<div class="signin-card" role="dialog" aria-modal="true" aria-labelledby="signinTitle">
    <div class="signin-brand">artisan.<span>Closet Designer</span></div>
    <div class="signin-step" data-step="email">
      <h2 id="signinTitle">Sign in to design your closet</h2>
      <p>Your designs are saved to your account, so you can come back to them and send them to Artisan when you’re ready. New here? The same steps create your account.</p>
      <button type="button" class="btn ghost wide-btn" data-google>Continue with Google</button>
      <div class="or"><span>or use your email</span></div>
      <form data-form="email" novalidate>
        <label>Email<input name="email" type="email" autocomplete="email" placeholder="you@example.com" required></label>
        <p class="signin-err" hidden></p>
        <button class="btn primary wide-btn">Email me a sign-in code</button>
      </form>
    </div>
    <div class="signin-step" data-step="code" hidden>
      <h2>Check your email</h2>
      <p>We sent a 6-digit code to <b data-to></b>. It expires in 10 minutes.</p>
      <form data-form="code" novalidate>
        <label>Sign-in code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" required></label>
        <p class="signin-err" hidden></p>
        <button class="btn primary wide-btn">Sign in</button>
      </form>
      <p class="signin-links"><button type="button" class="link" data-back>Use a different email</button> · <button type="button" class="link" data-resend>Send a new code</button></p>
    </div>
    <p class="signin-demo">Demo sign-in: nothing is sent and no account is created. Any email and any 6-digit code work.</p>
  </div>`;
  document.body.append(gate);
  document.body.classList.add("gated");
  const step = (name) => gate.querySelectorAll(".signin-step").forEach((s) => (s.hidden = s.dataset.step !== name));
  const err = (form, msg) => { const p = $(".signin-err", form); p.hidden = !msg; p.textContent = msg || ""; };
  let email = "";

  const emailForm = $('[data-form="email"]', gate), codeForm = $('[data-form="code"]', gate);
  emailForm.onsubmit = (e) => {
    e.preventDefault();
    email = emailForm.email.value.trim();
    if (!EMAIL.test(email)) return err(emailForm, "Enter a valid email address.");
    err(emailForm, "");
    // LAUNCH: ask the sign-in service to email a code to `email` here.
    $("[data-to]", gate).textContent = email;
    step("code");
    codeForm.code.value = "";
    codeForm.code.focus();
  };
  codeForm.onsubmit = (e) => {
    e.preventDefault();
    const code = codeForm.code.value.replace(/\D/g, "");
    if (code.length !== 6) return err(codeForm, "Enter the 6 digits from the email.");
    err(codeForm, "");
    // LAUNCH: check the code with the sign-in service here.
    finish({ email, via: "email" });
  };
  $("[data-back]", gate).onclick = () => { step("email"); emailForm.email.focus(); };
  $("[data-resend]", gate).onclick = () => { err(codeForm, ""); codeForm.code.value = ""; $(".signin-err", codeForm).hidden = false; $(".signin-err", codeForm).textContent = `A new code was sent to ${email}.`; };
  $("[data-google]", gate).onclick = () => {
    // LAUNCH: open the Google sign-in window here. The demo asks for an email instead.
    step("email");
    err(emailForm, "Google sign-in is connected at launch. In this demo, enter any email.");
    emailForm.email.focus();
  };
  setTimeout(() => emailForm.email.focus(), 50);
}

function finish(user) {
  const u = { ...user, at: new Date().toISOString() };
  save(u);
  sessionUser = u;
  gate?.remove();
  gate = null;
  document.body.classList.remove("gated");
  renderAccount(u);
}

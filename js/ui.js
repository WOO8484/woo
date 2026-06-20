/* ══════════════════════════════════════════════
   Mr.woo v2.5.6  —  js/ui.js
   공통 UI 유틸리티
   ══════════════════════════════════════════════ */
'use strict';

/* ── 유틸 함수 ───────────────────────────────── */
function getAvatar(name) {
  return AVATARS[(name || 'A').charCodeAt(0) % AVATARS.length];
}
function genreCoverClass(g) {
  return 'cover-' + (['romance','fantasy','thriller','sf','historical','mystery'].includes(g) ? g : 'etc');
}
function escapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function stripHtmlTags(str) {
  return str.replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"');
}

/* ── TOAST ────────────────────────────────────── */
let _toastTimer;
function showToast(msg, type = '', duration = 2400) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast on' + (type === 'error' ? ' error' : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('on'), duration);
}

/* ── 탭 전환 ──────────────────────────────────── */
function switchTab(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('on'));
  document.getElementById('page-' + name)?.classList.add('active');
  document.getElementById('tab-'  + name)?.classList.add('on');
  document.getElementById('navAddBtn').style.display = (name === 'home' && isAdmin) ? 'flex' : 'none';
  if (name === 'home')    renderHome();
  if (name === 'shelf')   { renderGenreTabs(); renderShelf(); }
  if (name === 'profile') renderProfile();
}

/* ── 배치 렌더 (rAF 중복 방지) ────────────────── */
let _rafPending = false;
function batchRender() {
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => {
    _rafPending = false;
    renderHome();
    if (document.getElementById('page-shelf').classList.contains('active')) renderShelf();
  });
}

/* ── 앱 화면 전환 ─────────────────────────────── */
function showAuthScreen() {
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('authScreen').style.display    = 'flex';
  document.getElementById('mainNav').style.display       = 'none';
  document.getElementById('tabBar').style.display        = 'none';
}
function showApp() {
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('authScreen').style.display    = 'none';
  document.getElementById('mainNav').style.display       = 'flex';
  document.getElementById('tabBar').style.display        = 'flex';
  const name   = currentUser.displayName || currentUser.email.split('@')[0];
  const avatar = getAvatar(name);
  document.getElementById('navAvatar').textContent    = avatar;
  document.getElementById('menuName').textContent     = name;
  document.getElementById('menuEmail').textContent    = currentUser.email;
  document.getElementById('homeUserName').textContent = name;
  renderGenreTabs();
  loadSignupState(); // Firestore에서 가입 신청 상태 로드
  switchTab('home');
}

/* ── 유저 메뉴 ────────────────────────────────── */
function toggleUserMenu(e) {
  e.stopPropagation();
  document.getElementById('userMenu').classList.toggle('open');
}
function closeUserMenu() {
  document.getElementById('userMenu').classList.remove('open');
}
document.addEventListener('click', closeUserMenu);

/* ── Confirm 다이얼로그 ───────────────────────── */
function showConfirm(msg, onOk) {
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmOv').classList.add('on');
  document.getElementById('confirmOkBtn').onclick = () => { closeConfirm(); onOk(); };
}
function closeConfirm() {
  document.getElementById('confirmOv').classList.remove('on');
}

/* ── 읽기 설정 (localStorage) ────────────────── */
let vSettings = { fontSize:17, lineHeight:1.9, fontFamily:'system', theme:'light' };

(function loadSettings() {
  try {
    const s = localStorage.getItem('ns_settings');
    if (s) vSettings = { ...vSettings, ...JSON.parse(s) };
  } catch(e) {}
})();

function saveSettings() {
  localStorage.setItem('ns_settings', JSON.stringify(vSettings));
}
function applyViewerSettings() {
  const t  = THEMES[vSettings.theme] || THEMES.light;
  const vb = document.getElementById('vBody');
  if (vb) {
    vb.style.background = t.bg;
    vb.style.color      = t.ink;
  }
  const viewer = document.getElementById('viewer');
  if (viewer) viewer.style.background = t.bg;
  const vt = document.getElementById('vText');
  if (vt) {
    vt.style.fontSize   = vSettings.fontSize + 'px';
    vt.style.lineHeight = vSettings.lineHeight;
    vt.style.fontFamily = FONTS[vSettings.fontFamily] || FONTS.system;
    vt.style.textAlign  = 'left';
  }
  const prev = document.getElementById('previewText');
  if (prev) {
    prev.style.fontSize   = vSettings.fontSize + 'px';
    prev.style.fontFamily = FONTS[vSettings.fontFamily] || FONTS.system;
  }
}
function syncSettingsUI() {
  document.getElementById('fontSlider').value      = vSettings.fontSize;
  document.getElementById('fVal').textContent      = vSettings.fontSize;
  document.getElementById('fValBadge').textContent = vSettings.fontSize + 'px';
  document.getElementById('lhSlider').value        = vSettings.lineHeight * 100;
  document.getElementById('lhBadge').textContent   = vSettings.lineHeight;
  document.getElementById('lhVal').textContent     = vSettings.lineHeight;
  document.querySelectorAll('.theme-card').forEach(c => c.classList.toggle('on', c.id === 'theme-' + vSettings.theme));
  document.querySelectorAll('.font-btn').forEach(b => b.classList.toggle('on', b.dataset.font === vSettings.fontFamily));
  applyViewerSettings();
}
function chLh(d) {
  const v = Math.max(1.4, Math.min(2.6, parseFloat((vSettings.lineHeight + d).toFixed(1))));
  vSettings.lineHeight = v;
  document.getElementById('lhSlider').value    = v * 100;
  document.getElementById('lhBadge').textContent = v;
  document.getElementById('lhVal').textContent   = v;
  applyViewerSettings(); saveSettings();
}
function openSettings()  {
  syncSettingsUI();
  document.getElementById('setOv').classList.add('on');
  document.getElementById('setModal').classList.add('on');
}
function closeSettings() {
  document.getElementById('setOv').classList.remove('on');
  document.getElementById('setModal').classList.remove('on');
}
function setTheme(t) {
  vSettings.theme = t;
  document.querySelectorAll('.theme-card').forEach(c => c.classList.toggle('on', c.id === 'theme-' + t));
  applyViewerSettings(); saveSettings();
}
function setFont(f, el) {
  vSettings.fontFamily = f;
  document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  applyViewerSettings(); saveSettings();
}
function chFontSlider(v) { chFontApply(parseInt(v)); }
function chFont(d)        { chFontApply(Math.max(13, Math.min(26, vSettings.fontSize + d))); }
function chFontApply(v) {
  vSettings.fontSize = v;
  document.getElementById('fontSlider').value      = v;
  document.getElementById('fVal').textContent      = v;
  document.getElementById('fValBadge').textContent = v + 'px';
  applyViewerSettings(); saveSettings();
}
function chLineHeight(v) {
  vSettings.lineHeight = parseFloat((v / 100).toFixed(1));
  document.getElementById('lhBadge').textContent = vSettings.lineHeight;
  document.getElementById('lhVal').textContent   = vSettings.lineHeight;
  applyViewerSettings(); saveSettings();
}

/* ═══════════════════════════════════════════════
   이름 변경 (관리자·독자 모두 가능)
   Firebase Auth displayName + Firestore users 동기화
   ═══════════════════════════════════════════════ */
function openNameEdit() {
  const input = document.getElementById('nameEditInput');
  const name  = currentUser.displayName || currentUser.email.split('@')[0];
  input.value = name;
  document.getElementById('nameEditMsg').textContent = '';
  document.getElementById('nameEditOv').classList.add('on');
  setTimeout(() => input.focus(), 150);
}
function closeNameEdit() {
  document.getElementById('nameEditOv').classList.remove('on');
}
async function saveNameEdit() {
  const name = document.getElementById('nameEditInput').value.trim();
  const msg  = document.getElementById('nameEditMsg');
  if (!name) { msg.textContent = '이름을 입력해주세요'; return; }
  if (name.length > 20) { msg.textContent = '20자 이하로 입력해주세요'; return; }

  const okBtn = document.querySelector('#nameEditOv .confirm-ok');
  okBtn.disabled = true; okBtn.textContent = '저장 중...';

  try {
    // Firebase Auth displayName 업데이트 (compat SDK 방식)
    await auth.currentUser.updateProfile({ displayName: name });

    // Firestore users 문서 업데이트 (사용자 목록에 반영)
    await db.collection('users').doc(auth.currentUser.uid).set(
      { displayName: name },
      { merge: true }
    );

    // UI 즉시 반영
    document.getElementById('profileName').textContent  = name;
    document.getElementById('homeUserName').textContent = name;
    document.getElementById('navAvatar').textContent    = getAvatar(name);
    document.getElementById('menuName').textContent     = name;

    closeNameEdit();
    showToast('이름을 변경했어요 ✓');
  } catch(e) {
    console.error('saveNameEdit error:', e);
    msg.textContent = '변경에 실패했어요. 다시 시도해주세요';
  } finally {
    okBtn.disabled = false; okBtn.textContent = '저장';
  }
}

/* ── 가입 신청 ON/OFF (관리자) ───────────────── */
let _signupOpen = false;

// 앱 시작 시 Firestore에서 상태 로드
async function loadSignupState() {
  try {
    const doc = await db.collection('settings').doc('app').get();
    if (doc.exists) _signupOpen = doc.data().signupOpen || false;
  } catch(e) {
    _signupOpen = false;
  }
  applySignupState();
}

async function toggleSignupOpen() {
  _signupOpen = !_signupOpen;
  try {
    await db.collection('settings').doc('app').set({ signupOpen: _signupOpen }, { merge: true });
  } catch(e) {
    console.error('toggleSignupOpen save error:', e);
  }
  applySignupState();
}

function applySignupState() {
  // DOM이 없을 때 에러 방지 — optional chaining으로 처리
  const tabs = document.getElementById('authTabs');
  if (tabs) tabs.style.display = _signupOpen ? '' : 'none';

  if (!_signupOpen) {
    const sf = document.getElementById('signupForm');
    const lf = document.getElementById('loginForm');
    if (sf) sf.style.display = 'none';
    if (lf) lf.style.display = '';
    document.getElementById('tabLogin')?.classList.add('on');
    document.getElementById('tabSignup')?.classList.remove('on');
  }

  const btn   = document.getElementById('signupToggleBtn');
  const label = document.getElementById('signupToggleLabel');
  if (btn) {
    btn.textContent = _signupOpen ? '닫기' : '열기';
    btn.classList.toggle('open', _signupOpen);
  }
  if (label) label.textContent = _signupOpen ? '현재 열림 🟢' : '현재 닫힘 🔴';
}

function resetSettings() {
  vSettings = { fontSize:17, lineHeight:1.9, fontFamily:'system', theme:'light' };
  syncSettingsUI();
  localStorage.removeItem('ns_settings');
  showToast('설정 초기화했어요');
}

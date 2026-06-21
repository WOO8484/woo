/* ══════════════════════════════════════════════
   Mr.woo v2.9.4  —  js/ui.js
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
  const name   = currentUser.displayName || currentUser.email?.split('@')[0] || currentUser.uid;
  const avatar = getAvatar(name);
  document.getElementById('navAvatar').textContent    = avatar;
  document.getElementById('menuName').textContent     = name;
  document.getElementById('menuEmail').textContent    = currentUser.email || '';
  document.getElementById('homeUserName').textContent = name;
  renderGenreTabs();
  loadSignupState();
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

/* ═══════════════════════════════════════════════
   이름 변경 (관리자·독자 모두 가능)
   Firebase Auth displayName + Firestore users 동기화
   ═══════════════════════════════════════════════ */
function openNameEdit() {
  const input = document.getElementById('nameEditInput');
  const name  = currentUser.displayName || currentUser.email?.split('@')[0] || '';
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
    if (auth.currentUser) {
      await auth.currentUser.updateProfile({ displayName: name });
    }
    await db.collection('users').doc(currentUser.uid).set({ displayName: name }, { merge: true });
    currentUser.displayName = name;
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

/* ── 가입 신청 ON/OFF — 삭제됨 (관리자 페이지에서 직접 추가) ── */

/* ══════════════════════════════════════════════
   Mr.woo v2.8.0  —  js/auth.js
   ══════════════════════════════════════════════ */
'use strict';

/* ── Auth 상태 감지 ───────────────────────────── */
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      isAdmin = snap.exists && snap.data().role === 'admin';
      // 첫 로그인 비밀번호 변경 확인
      if (snap.exists && snap.data().passwordChanged === false) {
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('pwChangeScreen').style.display = 'flex';
        return;
      }
    } catch(e) { isAdmin = false; }
    await loadUserData();
    subscribeNovels();
    showApp();
  } else {
    currentUser = null;
    isAdmin     = false;
    if (_novelsUnsub) { _novelsUnsub(); _novelsUnsub = null; }
    showAuthScreen();
  }
});

/* ── 로그인 ───────────────────────────────────── */
async function doLogin() {
  const email = document.getElementById('authEmail').value.trim();
  const pw    = document.getElementById('authPw').value;
  const msg   = document.getElementById('authMsg');
  const btn   = document.getElementById('authBtn');
  if (!email || !pw) { msg.textContent = '이메일과 비밀번호를 입력해주세요'; msg.className = 'auth-msg err'; return; }
  btn.disabled = true; btn.textContent = '로그인 중...';
  msg.textContent = ''; msg.className = 'auth-msg';
  try {
    await auth.signInWithEmailAndPassword(email, pw);
  } catch(e) {
    const MAP = {
      'auth/user-not-found':    '등록되지 않은 이메일이에요',
      'auth/wrong-password':    '비밀번호가 올바르지 않아요',
      'auth/invalid-email':     '이메일 형식이 올바르지 않아요',
      'auth/too-many-requests': '로그인 시도가 너무 많아요. 잠시 후 다시 시도해주세요',
      'auth/invalid-credential':'이메일 또는 비밀번호가 올바르지 않아요',
    };
    msg.textContent = MAP[e.code] || '로그인에 실패했어요';
    msg.className   = 'auth-msg err';
  } finally {
    btn.disabled = false; btn.textContent = '로그인';
  }
}

/* ── 로그아웃 ─────────────────────────────────── */
async function doLogout() {
  closeUserMenu();
  try {
    if (_novelsUnsub) { _novelsUnsub(); _novelsUnsub = null; }
    novels = []; userDataCache = {};
    await auth.signOut();
    showToast('로그아웃 했어요');
  } catch(e) {
    showToast('로그아웃에 실패했어요', 'error');
  }
}

/* ── 비밀번호 표시/숨기기 ──────────────────────── */
function toggleEye() {
  const el = document.getElementById('authPw');
  el.type = el.type === 'password' ? 'text' : 'password';
}

/* ── 첫 로그인 비밀번호 변경 ──────────────────── */
async function submitPwChange() {
  const pw1 = document.getElementById('pwChangeNew').value;
  const pw2 = document.getElementById('pwChangeConfirm').value;
  const msg = document.getElementById('pwChangeMsg');
  const btn = document.getElementById('pwChangeBtn');

  if (pw1.length < 6) { msg.textContent = '비밀번호는 6자 이상이어야 해요'; return; }
  if (pw1 !== pw2)    { msg.textContent = '비밀번호가 일치하지 않아요'; return; }

  btn.disabled = true; btn.textContent = '변경 중...';
  msg.textContent = '';
  try {
    await auth.currentUser.updatePassword(pw1);
    await db.collection('users').doc(auth.currentUser.uid).update({ passwordChanged: true });
    document.getElementById('pwChangeScreen').style.display = 'none';
    await loadUserData();
    subscribeNovels();
    showApp();
    showToast('비밀번호가 변경됐어요 ✓');
  } catch(e) {
    msg.textContent = '변경에 실패했어요. 다시 로그인 후 시도해주세요';
  } finally {
    btn.disabled = false; btn.textContent = '변경 완료';
  }
}

/* ── 키보드 단축키 ────────────────────────────── */
document.getElementById('authEmail').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('authPw').focus(); });
document.getElementById('authPw').addEventListener('keydown',   e => { if (e.key === 'Enter') doLogin(); });

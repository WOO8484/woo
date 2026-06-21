/* ══════════════════════════════════════════════
   Mr.woo v2.8.1  —  js/auth.js
   ══════════════════════════════════════════════ */
'use strict';

/* ── 비밀번호 해시 (Salt 포함) ─────────────── */
async function hashPw(pw, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
function genSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
}

/* ── 세션 관리 ─────────────────────────────── */
function saveSession(userId) { sessionStorage.setItem('mr_uid', userId); }
function loadSession()       { return sessionStorage.getItem('mr_uid'); }
function clearSession()      { sessionStorage.removeItem('mr_uid'); }

/* ── 앱 초기화 ─────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {});

/* ── Auth 상태 감지 (관리자: Firebase Auth) ── */
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = { uid: user.uid, email: user.email, displayName: user.displayName, isFirebase: true };
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      isAdmin = snap.exists && snap.data().role === 'admin';
    } catch(e) { isAdmin = false; }
    await loadUserData();
    subscribeNovels();
    showApp();
  } else {
    // 일반 사용자 세션 확인
    const savedUid = loadSession();
    if (savedUid) {
      try {
        const snap = await db.collection('users').doc(savedUid).get();
        if (snap.exists && snap.data().type === 'local') {
          currentUser = { uid: savedUid, displayName: snap.data().displayName, isFirebase: false };
          isAdmin = false;
          await loadUserData();
          subscribeNovels();
          showApp();
          return;
        }
      } catch(e) {}
      clearSession();
    }
    if (currentUser) return;
    currentUser = null;
    isAdmin     = false;
    if (_novelsUnsub) { _novelsUnsub(); _novelsUnsub = null; }
    showAuthScreen();
  }
});

/* ── 로그인 ────────────────────────────────── */
async function doLogin() {
  const idVal = document.getElementById('authEmail').value.trim();
  const pw    = document.getElementById('authPw').value;
  const msg   = document.getElementById('authMsg');
  const btn   = document.getElementById('authBtn');

  if (!idVal || !pw) { msg.textContent = '아이디와 비밀번호를 입력해주세요'; msg.className = 'auth-msg err'; return; }

  btn.disabled = true; btn.textContent = '로그인 중...';
  msg.textContent = ''; msg.className = 'auth-msg';

  try {
    // 1) 일반 사용자 로그인 (Firestore)
    const snap = await db.collection('users')
      .where('username', '==', idVal)
      .where('type', '==', 'local')
      .limit(1).get();

    if (!snap.empty) {
      const userData = snap.docs[0].data();
      const hash = await hashPw(pw, userData.salt || '');
      if (hash !== userData.passwordHash) {
        msg.textContent = '아이디 또는 비밀번호가 올바르지 않아요';
        msg.className = 'auth-msg err'; return;
      }
      const uid = snap.docs[0].id;
      currentUser = { uid, displayName: userData.displayName, isFirebase: false };
      isAdmin = false;
      saveSession(uid);
      await loadUserData();
      subscribeNovels();
      showApp();
      return;
    }

    // 2) 관리자 로그인 (Firebase Auth) - 이메일 형식일 때
    if (idVal.includes('@')) {
      await auth.signInWithEmailAndPassword(idVal, pw);
      return;
    }

    msg.textContent = '아이디 또는 비밀번호가 올바르지 않아요';
    msg.className = 'auth-msg err';

  } catch(e) {
    const MAP = {
      'auth/wrong-password':    '비밀번호가 올바르지 않아요',
      'auth/invalid-email':     '이메일 형식이 올바르지 않아요',
      'auth/too-many-requests': '로그인 시도가 너무 많아요. 잠시 후 다시 시도해주세요',
      'auth/invalid-credential':'아이디 또는 비밀번호가 올바르지 않아요',
    };
    msg.textContent = MAP[e.code] || '로그인에 실패했어요';
    msg.className = 'auth-msg err';
  } finally {
    btn.disabled = false; btn.textContent = '로그인';
  }
}

/* ── 로그아웃 ──────────────────────────────── */
async function doLogout() {
  closeUserMenu();
  try {
    if (_novelsUnsub) { _novelsUnsub(); _novelsUnsub = null; }
    novels = []; userDataCache = {};
    clearSession();
    currentUser = null; isAdmin = false;
    if (auth.currentUser) await auth.signOut();
    else showAuthScreen();
    showToast('로그아웃 했어요');
  } catch(e) {
    showToast('로그아웃에 실패했어요', 'error');
  }
}

/* ── 비밀번호 표시/숨기기 ──────────────────── */
function toggleEye() {
  const el = document.getElementById('authPw');
  el.type = el.type === 'password' ? 'text' : 'password';
}

/* ── 키보드 단축키 ─────────────────────────── */
document.getElementById('authEmail').addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('authPw').focus(); });
document.getElementById('authPw').addEventListener('keydown',   e => { if (e.key==='Enter') doLogin(); });

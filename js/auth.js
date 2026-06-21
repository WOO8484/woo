/* ══════════════════════════════════════════════
   Mr.woo v2.9.4  —  js/auth.js
   인증: 구글 로그인 전용
   ══════════════════════════════════════════════ */
'use strict';

/* ── Auth 상태 감지 ────────────────────────── */
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    currentUser = null; isAdmin = false;
    if (_novelsUnsub) { _novelsUnsub(); _novelsUnsub = null; }
    showAuthScreen();
    return;
  }

  try {
    const snap = await db.collection('users').doc(user.uid).get();

    // 미승인 사용자 → 대기 화면
    if (!snap.exists) {
      // pending_users에 있는지 확인
      const pSnap = await db.collection('pending_users')
        .where('uid', '==', user.uid).limit(1).get();
      await auth.signOut();
      showPendingScreen(pSnap.empty ? 'notfound' : 'pending');
      return;
    }

    const data = snap.data();
    currentUser = {
      uid:         user.uid,
      email:       user.email,
      displayName: data.displayName || user.displayName || user.email.split('@')[0],
      photoURL:    user.photoURL,
    };
    isAdmin = data.role === 'admin';
  } catch(e) {
    console.error('auth state error:', e);
    await auth.signOut();
    showAuthScreen();
    return;
  }

  await loadUserData();
  subscribeNovels();
  showApp();
});

/* ── 구글 로그인 ───────────────────────────── */
async function doGoogleLogin() {
  const btn = document.getElementById('googleLoginBtn');
  btn.disabled = true; btn.textContent = '로그인 중...';
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Google로 로그인';
    if (e.code !== 'auth/popup-closed-by-user') {
      document.getElementById('authMsg').textContent = '로그인에 실패했어요. 다시 시도해주세요';
    }
  }
}

/* ── 구글 가입 신청 ────────────────────────── */
async function doGoogleSignup() {
  const btn = document.getElementById('googleSignupBtn');
  btn.disabled = true; btn.textContent = '진행 중...';
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result   = await auth.signInWithPopup(provider);
    const user     = result.user;

    // 이미 승인된 사용자면 바로 로그인
    const snap = await db.collection('users').doc(user.uid).get();
    if (snap.exists) return; // onAuthStateChanged가 처리

    // pending 중복 확인
    const pSnap = await db.collection('pending_users')
      .where('uid', '==', user.uid).limit(1).get();
    if (!pSnap.empty) {
      await auth.signOut();
      showPendingScreen('pending');
      return;
    }

    // pending_users에 저장
    await db.collection('pending_users').add({
      uid:         user.uid,
      email:       user.email,
      displayName: user.displayName || user.email.split('@')[0],
      photoURL:    user.photoURL || '',
      status:      'pending',
      requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    await auth.signOut();
    showPendingScreen('pending');
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Google로 가입 신청';
    if (e.code !== 'auth/popup-closed-by-user') {
      document.getElementById('authMsg').textContent = '오류가 발생했어요. 다시 시도해주세요';
    }
  }
}

/* ── 대기 화면 ─────────────────────────────── */
function showPendingScreen(type) {
  document.getElementById('loadingScreen').style.display = 'none';
  document.getElementById('authScreen').style.display    = 'none';
  const msg = type === 'pending'
    ? '가입 신청이 완료됐어요 😊<br>관리자 승인 후 로그인할 수 있어요'
    : '가입 신청 내역이 없어요.<br>가입 신청 후 관리자 승인을 기다려주세요';
  document.getElementById('pendingMsg').innerHTML = msg;
  document.getElementById('pendingScreen').style.display = 'flex';
}

/* ── 이메일 로그인 ─────────────────────────── */
async function doEmailLogin() {
  const email = document.getElementById('authEmail').value.trim();
  const pw    = document.getElementById('authPw').value;
  const msg   = document.getElementById('authMsg');
  const btn   = document.getElementById('emailLoginBtn');
  if (!email || !pw) { msg.textContent = '이메일과 비밀번호를 입력해주세요'; return; }
  btn.disabled = true; btn.textContent = '로그인 중...';
  msg.textContent = '';
  try {
    await auth.signInWithEmailAndPassword(email, pw);
  } catch(e) {
    const MAP = {
      'auth/user-not-found':    '등록되지 않은 이메일이에요',
      'auth/wrong-password':    '비밀번호가 올바르지 않아요',
      'auth/invalid-credential':'이메일 또는 비밀번호가 올바르지 않아요',
      'auth/too-many-requests': '로그인 시도가 너무 많아요. 잠시 후 다시 시도해주세요',
    };
    msg.textContent = MAP[e.code] || '로그인에 실패했어요';
  } finally {
    btn.disabled = false; btn.textContent = '이메일로 로그인';
  }
}

function toggleEye() {
  const el = document.getElementById('authPw');
  el.type = el.type === 'password' ? 'text' : 'password';
}

document.addEventListener('DOMContentLoaded', () => {
  const emailEl = document.getElementById('authEmail');
  const pwEl    = document.getElementById('authPw');
  if (emailEl) emailEl.addEventListener('keydown', e => { if (e.key==='Enter') pwEl?.focus(); });
  if (pwEl)    pwEl.addEventListener('keydown',    e => { if (e.key==='Enter') doEmailLogin(); });
});
async function doLogout() {
  closeUserMenu();
  try {
    if (_novelsUnsub) { _novelsUnsub(); _novelsUnsub = null; }
    novels = []; userDataCache = {};
    currentUser = null; isAdmin = false;
    await auth.signOut();
    showToast('로그아웃 했어요');
  } catch(e) {
    showToast('로그아웃에 실패했어요', 'error');
  }
}

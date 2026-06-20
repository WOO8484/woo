/* ══════════════════════════════════════════════
   NovelShelf v2.3.0  —  js/auth.js
   Firebase Auth, 로그인, 가입 신청
   ══════════════════════════════════════════════ */
'use strict';

/* ── Auth 상태 감지 ───────────────────────────── */
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    try {
      const snap = await db.collection('users').doc(user.uid).get();
      isAdmin = snap.exists && snap.data().role === 'admin';
    } catch(e) {
      isAdmin = false;
    }
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

/* ── 로그인 탭 전환 ───────────────────────────── */
function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('loginForm').style.display  = isLogin ? '' : 'none';
  document.getElementById('signupForm').style.display = isLogin ? 'none' : '';
  document.getElementById('tabLogin').classList.toggle('on',  isLogin);
  document.getElementById('tabSignup').classList.toggle('on', !isLogin);
  document.getElementById('authMsg').textContent   = '';
  document.getElementById('signupMsg').textContent = '';
}

/* ── 비밀번호 표시/숨기기 ──────────────────────── */
function toggleEye() {
  const el = document.getElementById('authPw');
  el.type = el.type === 'password' ? 'text' : 'password';
}
function toggleSignupEye() {
  const el = document.getElementById('signupPw');
  el.type = el.type === 'password' ? 'text' : 'password';
}

/* ── 로그인 ───────────────────────────────────── */
async function doLogin() {
  const email = document.getElementById('authEmail').value.trim();
  const pw    = document.getElementById('authPw').value;
  const msg   = document.getElementById('authMsg');
  const btn   = document.getElementById('authBtn');

  if (!email || !pw) {
    msg.textContent = '이메일과 비밀번호를 입력해주세요';
    msg.className   = 'auth-msg err';
    return;
  }

  btn.disabled = true; btn.textContent = '로그인 중...';
  msg.textContent = ''; msg.className = 'auth-msg';

  try {
    await auth.signInWithEmailAndPassword(email, pw);
    // onAuthStateChanged → showApp() 자동 호출
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
  if (_novelsUnsub) { _novelsUnsub(); _novelsUnsub = null; }
  novels = []; userDataCache = {};
  await auth.signOut();
  showToast('로그아웃 했어요');
}

/* ── 가입 신청 ────────────────────────────────────
   Cloud Functions 없이 동작.
   Firestore pending_users 컬렉션에 저장 →
   관리자가 승인 후 계정 생성 (admin.js 참고)
   ────────────────────────────────────────────── */
async function doSignupRequest() {
  const name   = document.getElementById('signupName').value.trim();
  const email  = document.getElementById('signupEmail').value.trim();
  const pw     = document.getElementById('signupPw').value;
  const reason = document.getElementById('signupReason').value.trim();
  const msg    = document.getElementById('signupMsg');
  const btn    = document.getElementById('signupBtn');

  // ── 입력값 검증 ──
  if (!name) {
    msg.textContent = '이름을 입력해주세요'; msg.className = 'auth-msg err'; return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    msg.textContent = '올바른 이메일을 입력해주세요'; msg.className = 'auth-msg err'; return;
  }
  if (pw.length < 6) {
    msg.textContent = '비밀번호는 6자 이상이어야 해요'; msg.className = 'auth-msg err'; return;
  }

  btn.disabled = true; btn.textContent = '신청 중...';
  msg.textContent = ''; msg.className = 'auth-msg';

  try {
    // ── 중복 신청 방지 ──
    const existing = await db.collection('pending_users')
      .where('email', '==', email)
      .where('status', '==', 'pending')
      .get();
    if (!existing.empty) {
      msg.textContent = '이미 가입 신청 중인 이메일이에요';
      msg.className   = 'auth-msg err';
      return;
    }

    // ── 비밀번호 해시 후 저장 (평문 저장 금지) ──
    const pwHash = await hashPassword(pw);

    await db.collection('pending_users').add({
      name,
      email,
      pwHash,    // 승인 시 Cloud Functions에서 계정 생성 후 즉시 삭제됨
      reason:    reason || '',
      status:    'pending',
      requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    msg.textContent = '가입 신청이 완료됐어요! 관리자 승인 후 로그인할 수 있어요 😊';
    msg.className   = 'auth-msg ok';
    document.getElementById('signupName').value   = '';
    document.getElementById('signupEmail').value  = '';
    document.getElementById('signupPw').value     = '';
    document.getElementById('signupReason').value = '';
  } catch(e) {
    console.error('signup error:', e);
    msg.textContent = '신청 중 오류가 발생했어요. 다시 시도해주세요';
    msg.className   = 'auth-msg err';
  } finally {
    btn.disabled = false; btn.textContent = '가입 신청하기';
  }
}

/* ── 키보드 단축키 ────────────────────────────── */
document.getElementById('authEmail').addEventListener('keydown',  e => { if (e.key === 'Enter') document.getElementById('authPw').focus(); });
document.getElementById('authPw').addEventListener('keydown',     e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('signupName').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('signupEmail').focus(); });
document.getElementById('signupEmail').addEventListener('keydown',e => { if (e.key === 'Enter') document.getElementById('signupPw').focus(); });
document.getElementById('signupPw').addEventListener('keydown',   e => { if (e.key === 'Enter') doSignupRequest(); });

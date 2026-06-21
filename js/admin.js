/* ══════════════════════════════════════════════
   Mr.woo v2.9.1  —  js/admin.js
   ══════════════════════════════════════════════ */
'use strict';

/* ── 이메일 로그인 ON/OFF ──────────────────── */
let _emailLoginOpen = false;

async function loadEmailLoginState() {
  try {
    const doc = await db.collection('settings').doc('app').get();
    _emailLoginOpen = doc.exists ? (doc.data().emailLoginOpen || false) : false;
  } catch(e) { _emailLoginOpen = false; }
  applyEmailLoginState();
}

async function toggleEmailLogin() {
  _emailLoginOpen = !_emailLoginOpen;
  try {
    await db.collection('settings').doc('app').set({ emailLoginOpen: _emailLoginOpen }, { merge: true });
  } catch(e) { console.error('toggleEmailLogin error:', e); }
  applyEmailLoginState();
}

function applyEmailLoginState() {
  const sec = document.getElementById('emailLoginSection');
  if (sec) sec.style.display = _emailLoginOpen ? '' : 'none';
  const btn   = document.getElementById('emailLoginToggleBtn');
  const label = document.getElementById('emailLoginToggleLabel');
  if (btn)   { btn.textContent = _emailLoginOpen ? '닫기' : '열기'; btn.classList.toggle('open', _emailLoginOpen); }
  if (label) { label.textContent = _emailLoginOpen ? '현재 열림 🟢' : '현재 닫힘 🔴'; }
}

/* ── 가입 신청 ON/OFF ──────────────────────── */
let _signupOpen = false;

async function loadSignupState() {
  try {
    const doc = await db.collection('settings').doc('app').get();
    _signupOpen     = doc.exists ? (doc.data().signupOpen     || false) : false;
    _emailLoginOpen = doc.exists ? (doc.data().emailLoginOpen || false) : false;
  } catch(e) { _signupOpen = false; _emailLoginOpen = false; }
  applySignupState();
  applyEmailLoginState();
}

async function toggleSignupOpen() {
  _signupOpen = !_signupOpen;
  try {
    await db.collection('settings').doc('app').set({ signupOpen: _signupOpen }, { merge: true });
  } catch(e) { console.error('toggleSignupOpen error:', e); }
  applySignupState();
}

function applySignupState() {
  const signupBtn = document.getElementById('googleSignupBtn');
  const signupSec = document.getElementById('signupSection');
  if (signupBtn) signupBtn.style.display = _signupOpen ? '' : 'none';
  if (signupSec) signupSec.style.display = _signupOpen ? '' : 'none';

  const btn   = document.getElementById('signupToggleBtn');
  const label = document.getElementById('signupToggleLabel');
  if (btn)   { btn.textContent = _signupOpen ? '닫기' : '열기'; btn.classList.toggle('open', _signupOpen); }
  if (label) { label.textContent = _signupOpen ? '현재 열림 🟢' : '현재 닫힘 🔴'; }
}

/* ── 가입 대기 목록 ────────────────────────── */
async function renderPendingList() {
  if (!isAdmin) return;
  try {
    const snap = await db.collection('pending_users')
      .where('status', '==', 'pending').get();
    const badge   = document.getElementById('pendingCountBadge');
    const list    = document.getElementById('pendingList');
    const section = document.getElementById('pendingSection');
    section.style.display = '';
    badge.textContent = snap.size;
    if (snap.empty) {
      list.innerHTML = '<div style="padding:16px;text-align:center;font-size:13px;color:var(--ink3)">대기 중인 신청이 없어요</div>';
      return;
    }
    const docs = [...snap.docs].sort((a,b) =>
      (a.data().requestedAt?.toMillis?.() || 0) - (b.data().requestedAt?.toMillis?.() || 0));
    list.innerHTML = docs.map(d => {
      const u    = d.data();
      const date = u.requestedAt?.toDate ? u.requestedAt.toDate().toLocaleDateString('ko-KR') : '';
      return `<div class="user-item">
        <div class="user-avatar">${getAvatar(u.displayName||u.email||'')}</div>
        <div class="user-info">
          <div class="user-name">${escapeHtml(u.displayName||'이름 없음')}</div>
          <div class="user-email">${escapeHtml(u.email||'')} · ${date}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
          <button class="add-user-btn" style="height:28px;font-size:11px;padding:0 10px"
            onclick="approvePending('${d.id}','${escapeHtml(u.displayName||'')}','${u.uid}','${escapeHtml(u.email||'')}','${escapeHtml(u.photoURL||'')}')">승인</button>
          <button class="user-del-btn" onclick="rejectPending('${d.id}','${escapeHtml(u.displayName||'')}')">거절</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) { console.error('renderPendingList error:', e); }
}

/* ── 승인 ──────────────────────────────────── */
async function approvePending(docId, name, uid, email, photoURL) {
  if (!isAdmin) return;
  try {
    // users 컬렉션에 추가
    await db.collection('users').doc(uid).set({
      email,
      displayName: name,
      photoURL:    photoURL || '',
      role:        'reader',
      createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
    });
    // pending 상태 업데이트
    await db.collection('pending_users').doc(docId).update({
      status:     'approved',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast(`${name}님을 승인했어요 ✅`);
    await Promise.all([renderPendingList(), renderUserList()]);
  } catch(e) {
    console.error('approvePending error:', e);
    showToast('승인에 실패했어요', 'error');
  }
}

/* ── 거절 ──────────────────────────────────── */
async function rejectPending(docId, name) {
  if (!isAdmin) return;
  try {
    await db.collection('pending_users').doc(docId).update({
      status:     'rejected',
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast(`${name}님 신청을 거절했어요`);
    await renderPendingList();
  } catch(e) {
    console.error('rejectPending error:', e);
    showToast('거절 처리에 실패했어요', 'error');
  }
}

/* ── 사용자 목록 ───────────────────────────── */
async function renderUserList() {
  if (!isAdmin) return;
  try {
    const snap  = await db.collection('users').get();
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    document.getElementById('userCountBadge').textContent = users.length;
    document.getElementById('userList').innerHTML = users.map(u => `
      <div class="user-item">
        <div class="user-avatar">${u.photoURL
          ? `<img src="${escapeHtml(u.photoURL)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
          : getAvatar(u.displayName||u.email||'')}</div>
        <div class="user-info">
          <div class="user-name">${escapeHtml(u.displayName||'이름 없음')}
            <span class="user-role-badge ${u.role==='admin'?'user-role-admin':'user-role-reader'}">
              ${u.role==='admin'?'관리자':'독자'}
            </span>
          </div>
          <div class="user-email">${escapeHtml(u.email||'')}</div>
        </div>
        ${u.role !== 'admin' ? `<button class="user-del-btn" onclick="deleteUser('${u.id}')">삭제</button>` : ''}
      </div>`).join('');
  } catch(e) { console.error('renderUserList error:', e); }
}

/* ── 사용자 삭제 ───────────────────────────── */
async function deleteUser(uid) {
  if (!isAdmin) return;
  showConfirm('이 사용자를 삭제할까요?', async () => {
    try {
      await db.collection('users').doc(uid).delete();
      showToast('사용자를 삭제했어요');
      await renderUserList();
    } catch(e) { showToast('사용자 삭제에 실패했어요', 'error'); }
  });
}

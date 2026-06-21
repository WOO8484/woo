/* ══════════════════════════════════════════════
   Mr.woo v2.8.2  —  js/admin.js
   ══════════════════════════════════════════════ */
'use strict';

/* ── 사용자 추가 ───────────────────────────── */
function openAddUser() {
  document.getElementById('addUserName').value     = '';
  document.getElementById('addUserUsername').value = '';
  document.getElementById('addUserPw').value       = '';
  document.getElementById('addUserMsg').textContent = '';
  document.getElementById('addUserOv').classList.add('on');
}
function closeAddUser() {
  document.getElementById('addUserOv').classList.remove('on');
}
async function submitAddUser() {
  const name     = document.getElementById('addUserName').value.trim();
  const username = document.getElementById('addUserUsername').value.trim();
  const pw       = document.getElementById('addUserPw').value;
  const msg      = document.getElementById('addUserMsg');
  const btn      = document.getElementById('addUserBtn');

  if (!name)            { msg.textContent = '이름을 입력해주세요'; return; }
  if (!username)        { msg.textContent = '아이디를 입력해주세요'; return; }
  if (pw.length < 4)   { msg.textContent = '비밀번호는 4자 이상이어야 해요'; return; }

  btn.disabled = true; btn.textContent = '생성 중...';
  msg.textContent = '';

  try {
    // 아이디 중복 확인
    const existing = await db.collection('users').where('username','==',username).get();
    if (!existing.empty) { msg.textContent = '이미 사용 중인 아이디예요'; return; }

    // Salt 생성 + 비밀번호 해시
    const salt = genSalt();
    const passwordHash = await hashPw(pw, salt);

    // Firestore 저장
    await db.collection('users').add({
      type:         'local',
      username,
      displayName:  name,
      passwordHash,
      salt,
      role:         'reader',
      createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
    });

    showToast(`${name}님 계정이 생성됐어요 ✅`);
    closeAddUser();
    await renderUserList();
  } catch(e) {
    console.error('submitAddUser error:', e);
    msg.textContent = '계정 생성에 실패했어요';
  } finally {
    btn.disabled = false; btn.textContent = '계정 생성';
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
        <div class="user-avatar">${getAvatar(u.displayName || u.username || '')}</div>
        <div class="user-info">
          <div class="user-name">${escapeHtml(u.displayName || '이름 없음')}
            <span class="user-role-badge ${u.role==='admin'?'user-role-admin':'user-role-reader'}">
              ${u.role==='admin'?'관리자':'독자'}
            </span>
          </div>
          <div class="user-email">${escapeHtml(u.username || u.email || '')}</div>
        </div>
        ${u.role !== 'admin' ? `<button class="user-del-btn" onclick="deleteUser('${u.id}')">삭제</button>` : ''}
      </div>`).join('');
  } catch(e) {
    console.error('renderUserList error:', e);
  }
}

/* ── 사용자 삭제 ───────────────────────────── */
async function deleteUser(uid) {
  if (!isAdmin) return;
  showConfirm('이 사용자를 삭제할까요?', async () => {
    try {
      await db.collection('users').doc(uid).delete();
      showToast('사용자를 삭제했어요');
      await renderUserList();
    } catch(e) {
      showToast('사용자 삭제에 실패했어요', 'error');
    }
  });
}

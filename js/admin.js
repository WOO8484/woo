/* ══════════════════════════════════════════════
   Mr.woo v2.8.0  —  js/admin.js
   ══════════════════════════════════════════════ */
'use strict';

/* ── 사용자 추가 폼 ────────────────────────── */
function openAddUser() {
  document.getElementById('addUserName').value  = '';
  document.getElementById('addUserEmail').value = '';
  document.getElementById('addUserPw').value    = '';
  document.getElementById('addUserMsg').textContent = '';
  document.getElementById('addUserOv').classList.add('on');
}
function closeAddUser() {
  document.getElementById('addUserOv').classList.remove('on');
}
async function submitAddUser() {
  const name  = document.getElementById('addUserName').value.trim();
  const email = document.getElementById('addUserEmail').value.trim();
  const pw    = document.getElementById('addUserPw').value;
  const msg   = document.getElementById('addUserMsg');
  const btn   = document.getElementById('addUserBtn');

  if (!name)  { msg.textContent = '이름을 입력해주세요'; return; }
  if (!email) { msg.textContent = '이메일을 입력해주세요'; return; }
  if (pw.length < 6) { msg.textContent = '임시 비밀번호는 6자 이상이어야 해요'; return; }

  btn.disabled = true; btn.textContent = '생성 중...';
  msg.textContent = '';
  try {
    const createUser = functions.httpsCallable('createUser');
    await createUser({ name, email, password: pw });
    showToast(`${name}님 계정이 생성됐어요 ✅`);
    closeAddUser();
    await renderUserList();
  } catch(e) {
    msg.textContent = e.message || '계정 생성에 실패했어요';
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
        <div class="user-avatar">${getAvatar(u.displayName || u.email || '')}</div>
        <div class="user-info">
          <div class="user-name">${escapeHtml(u.displayName || u.email?.split('@')[0] || '이름 없음')}
            <span class="user-role-badge ${u.role==='admin'?'user-role-admin':'user-role-reader'}">
              ${u.role==='admin'?'관리자':'독자'}
            </span>
          </div>
          <div class="user-email">${escapeHtml(u.email || '')}</div>
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
      const deleteUserFn = functions.httpsCallable('deleteUser');
      await deleteUserFn({ uid });
      showToast('사용자를 삭제했어요');
      await renderUserList();
    } catch(e) {
      showToast('사용자 삭제에 실패했어요', 'error');
    }
  });
}

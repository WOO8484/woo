'use strict';

async function renderPendingList() {
  if (!isAdmin) return;
  try {
    const snap = await db.collection('pending_users')
      .where('status', '==', 'pending')
      .get();

    const section = document.getElementById('pendingSection');
    const list    = document.getElementById('pendingList');
    const badge   = document.getElementById('pendingCountBadge');

    section.style.display = '';
    if (snap.empty) {
      badge.textContent = '0';
      list.innerHTML = '<div style="padding:16px;text-align:center;font-size:13px;color:var(--ink3)">대기 중인 가입 신청이 없어요</div>';
      return;
    }
    badge.textContent = snap.size;

    const sortedDocs = [...snap.docs].sort((a,b) => {
      const at = a.data().requestedAt?.toMillis?.() || 0;
      const bt = b.data().requestedAt?.toMillis?.() || 0;
      return at - bt;
    });
    list.innerHTML = sortedDocs.map(d => {
      const u    = d.data();
      const date = u.requestedAt?.toDate
        ? u.requestedAt.toDate().toLocaleDateString('ko-KR') : '';
      return `<div class="user-item">
        <div class="user-avatar">${getAvatar(u.name)}</div>
        <div class="user-info">
          <div class="user-name">${escapeHtml(u.name)}</div>
          <div class="user-email">${escapeHtml(u.email)}</div>
          ${u.reason ? `<div class="user-time">사유: ${escapeHtml(u.reason)}</div>` : ''}
          <div class="user-time">${date} 신청</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
          <button class="add-user-btn" style="height:28px;font-size:11px;padding:0 10px"
            onclick="approvePending('${d.id}','${escapeHtml(u.name)}')">승인</button>
          <button class="user-del-btn"
            onclick="rejectPending('${d.id}','${escapeHtml(u.name)}')">거절</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    console.error('renderPendingList error:', e);
  }
}

async function approvePending(docId, name) {
  if (!isAdmin) return;
  try {
    await db.collection('pending_users').doc(docId).update({
      status:     'approved',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast(`${name}님 승인됐어요. Firebase 콘솔에서 계정을 직접 생성해주세요 👤`);
    await Promise.all([renderPendingList(), renderUserList()]);
  } catch(e) {
    console.error('approvePending error:', e);
    showToast('승인 처리에 실패했어요', 'error');
  }
}

async function rejectPending(docId, name) {
  if (!isAdmin) return;
  try {
    await db.collection('pending_users').doc(docId).update({
      status:     'rejected',
      rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast(`${name}님 가입 신청을 거절했어요`);
    await renderPendingList();
  } catch(e) {
    console.error('rejectPending error:', e);
    showToast('거절 처리에 실패했어요', 'error');
  }
}

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

async function deleteUser(uid) {
  if (!isAdmin) return;
  showConfirm('이 사용자를 삭제할까요?', async () => {
    try {
      await db.collection('users').doc(uid).delete();
      showToast('사용자를 삭제했어요 (Firebase 콘솔에서 Auth 계정도 삭제해주세요)');
      await renderUserList();
    } catch(e) {
      showToast('사용자 삭제에 실패했어요', 'error');
    }
  });
}

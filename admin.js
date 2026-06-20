/* ══════════════════════════════════════════════
   NovelShelf v2.3.0  —  js/admin.js
   관리자 — 사용자 관리, 가입 승인/거절
   ══════════════════════════════════════════════ */
'use strict';

/* ═══════════════════════════════════════════════
   가입 대기 목록
   ═══════════════════════════════════════════════ */
async function renderPendingList() {
  if (!isAdmin) return;
  try {
    const snap = await db.collection('pending_users')
      .where('status', '==', 'pending')
      .orderBy('requestedAt', 'asc')
      .get();

    const section = document.getElementById('pendingSection');
    const list    = document.getElementById('pendingList');
    const badge   = document.getElementById('pendingCountBadge');

    if (snap.empty) { section.style.display = 'none'; return; }

    section.style.display = '';
    badge.textContent     = snap.size;

    list.innerHTML = snap.docs.map(d => {
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

/* ═══════════════════════════════════════════════
   가입 승인
   ─────────────────────────────────────────────
   현재 (Cloud Functions 미배포):
     pending_users 상태를 approved로 변경 +
     관리자에게 Firebase 콘솔에서 직접 계정 생성 안내

   Cloud Functions 배포 후:
     functions.httpsCallable('approveUser') 호출 →
     자동 계정 생성 + 비밀번호 재설정 링크 이메일 발송 +
     pending_users 문서 삭제
   ═══════════════════════════════════════════════ */
async function approvePending(docId, name) {
  if (!isAdmin) return;
  try {
    /* ── Cloud Functions 배포 후 아래 블록으로 교체 ──────────────
    const approveUser = functions.httpsCallable('approveUser');
    await approveUser({ docId });
    showToast(`${name}님 승인됐어요. 비밀번호 재설정 메일이 발송됐어요 ✅`);
    ──────────────────────────────────────────────────────────── */

    // ── 임시: 상태만 approved로 변경 ──
    await db.collection('pending_users').doc(docId).update({
      status:     'approved',
      approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast(`${name}님 승인됐어요. Firebase 콘솔에서 계정을 직접 생성해주세요 👤`);

    await renderPendingList();
    await renderUserList();
  } catch(e) {
    console.error('approvePending error:', e);
    showToast('승인 처리에 실패했어요', 'error');
  }
}

/* ═══════════════════════════════════════════════
   가입 거절
   ═══════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════
   사용자 목록
   ═══════════════════════════════════════════════ */
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
          <div class="user-name">${escapeHtml(u.displayName || '이름 없음')}
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

/* ═══════════════════════════════════════════════
   사용자 삭제
   Cloud Functions 배포 후 자동화 예정
   현재: Firestore users 문서만 삭제 (Auth 계정은 콘솔에서 수동)
   ═══════════════════════════════════════════════ */
async function deleteUser(uid) {
  if (!isAdmin) return;
  showConfirm('이 사용자를 삭제할까요?', async () => {
    try {
      /* ── Cloud Functions 배포 후 아래 블록으로 교체 ──────────────
      const deleteUserFn = functions.httpsCallable('deleteUser');
      await deleteUserFn({ uid });
      ──────────────────────────────────────────────────────────── */

      // ── 임시: Firestore 문서만 삭제 ──
      await db.collection('users').doc(uid).delete();
      showToast('사용자를 삭제했어요 (Firebase 콘솔에서 Auth 계정도 삭제해주세요)');
      await renderUserList();
    } catch(e) {
      showToast('사용자 삭제에 실패했어요', 'error');
    }
  });
}

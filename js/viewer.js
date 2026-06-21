/* ══════════════════════════════════════════════
   Mr.woo v2.7.2  —  js/viewer.js
   기본 뷰어 (스크롤)
   ══════════════════════════════════════════════ */
'use strict';

let _vNov = null;

/* ── 뷰어 열기 ─────────────────────────────── */
async function openViewer(id) {
  const nov = novels.find(x => x.id === id);
  if (!nov) return;

  if (!nov._text && nov.textUrl) {
    showToast('본문 불러오는 중...', '', 8000);
    try {
      const res = await fetch(nov.textUrl);
      nov._text = await res.text();
    } catch(e) {
      showToast('본문을 불러오지 못했어요', 'error'); return;
    }
  }
  if (!nov._text) { showToast('읽을 수 있는 파일이 없어요', 'error'); return; }

  _vNov = nov;
  document.getElementById('vTitle').textContent = nov.title;

  // 본문 렌더
  const paras = nov._text.split(/\n+/).filter(p => p.trim());
  document.getElementById('vBody').innerHTML = paras.map(p => `<p>${escapeHtml(p)}</p>`).join('');
  document.getElementById('vBody').scrollTop = 0;

  document.getElementById('mainNav').style.display = 'none';
  document.getElementById('tabBar').style.display  = 'none';
  document.getElementById('viewer').classList.add('open');
}

/* ── 뷰어 닫기 ─────────────────────────────── */
function closeViewer() {
  if (_vNov) {
    setNovelUserData(_vNov.id, { lastReadAt: new Date().toISOString() });
  }
  document.getElementById('viewer').classList.remove('open');
  document.getElementById('mainNav').style.display = 'flex';
  document.getElementById('tabBar').style.display  = 'flex';
  renderHome();
}

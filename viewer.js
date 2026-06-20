/* ══════════════════════════════════════════════
   NovelShelf v2.3.2  —  js/viewer.js
   소설 뷰어, 챕터 파싱, 읽기 설정
   ══════════════════════════════════════════════ */
'use strict';

/* ── 뷰어 상태 ────────────────────────────────── */
let curCh          = 0;
let _animDir       = 'next';
let _idleHandle    = null;
let _renderGen     = 0;
let _progressTimer = null;
let _ioObserver    = null; // Intersection Observer

/* ── 챕터 목록 페이지네이션 ────────────────────── */
const CH_PAGE = 100;
let chPage = 0;

/* ── Safari 안전 idle 헬퍼 ───────────────────────
   requestIdleCallback은 Safari에서 fallback이
   setTimeout이라 성능이 떨어짐.
   rAF 2중 체인으로 paint 이후 실행 보장.
   ─────────────────────────────────────────────── */
function safeIdle(cb, timeout = 400) {
  if ('requestIdleCallback' in window) {
    return requestIdleCallback(cb, { timeout });
  }
  // rAF → rAF → 실행 (Safari/iOS 최적화)
  let handle;
  const raf = requestAnimationFrame(() =>
    requestAnimationFrame(() => { cb(); handle = null; })
  );
  handle = raf;
  return handle;
}
function cancelSafeIdle(handle) {
  if ('cancelIdleCallback' in window) cancelIdleCallback(handle);
  else cancelAnimationFrame(handle);
}

/* ═══════════════════════════════════════════════
   챕터 파싱
   ═══════════════════════════════════════════════ */
function getChs(nov) {
  if (!_chsCache.has(nov.id)) _chsCache.set(nov.id, splitCh(nov.inlineText || ''));
  return _chsCache.get(nov.id);
}

function splitCh(txt) {
  const lines = txt.split('\n');
  const chs = []; let title = '', body = [];
  const isChLine = l => {
    const t = l.trim();
    if (!t || t.length > 80) return false;
    if (/^[\*\-=─━\s·.]{3,}$/.test(t)) return false;
    return /^(\d{1,4}[화장편권]|제\s*\d+\s*[화장편권]|\d{1,4}\.\s+\S)/.test(t) ||
           /^chapter\s*\d+/i.test(t) ||
           /^(프롤로그|에필로그|후기|작가의\s*말|외전|번외|챕터\s*\d+)/.test(t) ||
           /^[★◆■◇◈▶●○※]\s*.{1,20}$/.test(t);
  };
  for (const line of lines) {
    if (isChLine(line)) {
      if (title || body.join('').trim()) chs.push({ title: title || '본문', content: body.join('\n').trim() });
      title = line.trim(); body = [];
    } else body.push(line);
  }
  if (title || body.join('').trim()) chs.push({ title: title || '본문', content: body.join('\n').trim() });
  return chs.length ? chs : [{ title:'본문', content:txt }];
}

/* ═══════════════════════════════════════════════
   뷰어 열기 / 닫기
   ═══════════════════════════════════════════════ */
function openViewer(id) {
  const nov = novels.find(x => x.id === id); if (!nov) return;
  if (!nov.inlineText) { showToast('읽기 가능한 파일이 없어요'); return; }
  curId   = id;
  nov._chs = getChs(nov);
  const saved = getNovelUserData(id);
  curCh = Math.min(saved.ch || 0, nov._chs.length - 1);
  chPage = Math.floor(curCh / CH_PAGE);

  document.getElementById('viewer').style.display  = 'flex';
  document.getElementById('mainNav').style.display  = 'none';
  document.getElementById('tabBar').style.display   = 'none';
  applyViewerSettings();
  _animDir = 'next';
  renderCh();
}

function closeViewer() {
  clearTimeout(_progressTimer);
  if (_idleHandle)  { cancelSafeIdle(_idleHandle); _idleHandle = null; }
  if (_ioObserver)  { _ioObserver.disconnect(); _ioObserver = null; }
  setNovelUserData(curId, { ch: curCh });
  document.getElementById('viewer').style.display  = 'none';
  document.getElementById('mainNav').style.display = 'flex';
  document.getElementById('tabBar').style.display  = 'flex';
  renderHome();
}

/* ═══════════════════════════════════════════════
   챕터 렌더링
   ═══════════════════════════════════════════════ */
function renderCh() {
  const nov = novels.find(x => x.id === curId); if (!nov) return;
  const chs = getChs(nov); if (!chs?.length) return;

  // 이전 지연 렌더 취소
  if (_idleHandle) { cancelSafeIdle(_idleHandle); _idleHandle = null; }
  // 이전 IO Observer 해제
  if (_ioObserver) { _ioObserver.disconnect(); _ioObserver = null; }

  const gen = ++_renderGen;
  const ch  = chs[curCh];

  const vChTitle = document.getElementById('vChTitle');
  vChTitle.textContent   = ch.title;
  vChTitle.style.display = chs.length === 1 ? 'none' : '';

  const vText = document.getElementById('vText');
  // 문단 분리: 빈줄 2개 이상 또는 단일 줄바꿈 모두 처리
  const paras = ch.content.split(/\n{1,}/).filter(p => p.trim());
  const FIRST = 15; // 첫 렌더 문단 수 (12→15로 확대)
  const frag  = document.createDocumentFragment();

  if (paras.length) {
    paras.slice(0, FIRST).forEach(p => {
      const el = document.createElement('p'); el.textContent = p; frag.appendChild(el);
    });
  } else {
    const el = document.createElement('p');
    el.style.cssText = 'color:var(--ink3);font-style:italic';
    el.textContent = '(내용 없음)'; frag.appendChild(el);
  }
  vText.innerHTML = ''; vText.appendChild(frag);

  // ── Intersection Observer 기반 lazy rendering ──
  if (paras.length > FIRST) {
    const rest = paras.slice(FIRST);
    let rendered = false;

    // 센티넬 요소: vText 맨 아래 보이면 나머지 렌더
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'height:1px;margin-top:40px';
    vText.appendChild(sentinel);

    const renderRest = () => {
      if (rendered || gen !== _renderGen) return;
      rendered = true;
      if (_ioObserver) { _ioObserver.disconnect(); _ioObserver = null; }
      _idleHandle = safeIdle(() => {
        if (gen !== _renderGen) return;
        const BATCH = 30; // 한 번에 30문단씩
        let idx = 0;
        const renderBatch = () => {
          if (idx >= rest.length || gen !== _renderGen) { _idleHandle = null; return; }
          const rf = document.createDocumentFragment();
          rest.slice(idx, idx + BATCH).forEach(p => {
            const el = document.createElement('p'); el.textContent = p; rf.appendChild(el);
          });
          // sentinel 앞에 삽입
          vText.insertBefore(rf, sentinel);
          idx += BATCH;
          if (idx < rest.length) _idleHandle = safeIdle(renderBatch, 200);
          else { sentinel.remove(); _idleHandle = null; }
        };
        renderBatch();
      });
    };

    if ('IntersectionObserver' in window) {
      _ioObserver = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) renderRest();
      }, { rootMargin: '200px' });
      _ioObserver.observe(sentinel);
    } else {
      // IO 미지원 브라우저 fallback
      _idleHandle = safeIdle(renderRest, 400);
    }
  }

  const vPage = document.getElementById('vPage');
  vPage.classList.remove('anim-next','anim-prev');
  requestAnimationFrame(() => vPage.classList.add(_animDir === 'next' ? 'anim-next' : 'anim-prev'));

  // 진행률 저장 (챕터 이동 시에만 저장 — 800ms 디바운스)
  const total = chs.length;
  const pct   = total > 1 ? Math.min(99, Math.round((curCh / (total-1)) * 100)) : (getNovelUserData(curId).progress || 1);
  clearTimeout(_progressTimer);
  _progressTimer = setTimeout(() => {
    setNovelUserData(curId, { progress:pct, lastReadAt:new Date().toISOString(), ch:curCh });
  }, 800);
}

/* ═══════════════════════════════════════════════
   챕터 이동
   ═══════════════════════════════════════════════ */
function nextCh() {
  const nov = novels.find(x => x.id === curId);
  if (!nov?._chs || nov._chs.length === 1) return;
  if (curCh < nov._chs.length - 1) {
    _animDir = 'next'; curCh++; renderCh();
  } else {
    setNovelUserData(curId, { progress:100, lastReadAt:new Date().toISOString(), ch:0 });
    document.getElementById('completeMsg').textContent = `"${nov.title}"`;
    document.getElementById('completeOv').classList.add('on');
  }
}
function prevCh() {
  if (curCh > 0) { _animDir = 'prev'; curCh--; renderCh(); }
}
function closeComplete(exit) {
  document.getElementById('completeOv').classList.remove('on');
  if (exit) closeViewer();
  else { curCh = 0; _animDir = 'next'; renderCh(); }
}

/* ═══════════════════════════════════════════════
   뷰어 팝업
   ═══════════════════════════════════════════════ */
function openViewerPopup() {
  const nov = novels.find(x => x.id === curId); if (!nov) return;
  const total = nov._chs ? nov._chs.length : 1;
  document.getElementById('vpopupTitle').textContent = nov.title;
  document.getElementById('vpopupInfo').textContent  = `${curCh+1} / ${total} 페이지  ·  ${getNovelUserData(curId).progress||0}% 진행`;
  const sw = document.getElementById('vpopupSliderWrap');
  const sl = document.getElementById('vpopupSlider');
  if (total > 1) {
    sw.style.display = ''; sl.max = total - 1; sl.value = curCh;
    document.getElementById('vpopupSliderLabel').textContent = `${curCh+1} / ${total} 페이지`;
  } else sw.style.display = 'none';
  document.getElementById('vpopupOv').classList.add('on');
}
function closeViewerPopup() { document.getElementById('vpopupOv').classList.remove('on'); }
function onSliderInput(v) {
  const nov = novels.find(x => x.id === curId);
  if (nov?._chs) document.getElementById('vpopupSliderLabel').textContent = `${parseInt(v)+1} / ${nov._chs.length} 페이지`;
}
function onSliderChange(v) { curCh = parseInt(v); closeViewerPopup(); setTimeout(renderCh, 150); }

/* ═══════════════════════════════════════════════
   챕터 목록
   ═══════════════════════════════════════════════ */
function openChList() {
  const nov = novels.find(x => x.id === curId); if (!nov?._chs) return;
  chPage = Math.floor(curCh / CH_PAGE);
  document.getElementById('chListTitle').textContent = nov.title;
  renderChList();
  document.getElementById('chListOv').classList.add('on');
  document.getElementById('chListModal').classList.add('on');
}
function closeChList() {
  document.getElementById('chListOv').classList.remove('on');
  document.getElementById('chListModal').classList.remove('on');
}
function renderChList() {
  const nov = novels.find(x => x.id === curId); if (!nov?._chs) return;
  const total = nov._chs.length;
  const start = chPage * CH_PAGE;
  const end   = Math.min(start + CH_PAGE, total);
  const nav = total > CH_PAGE
    ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);margin-bottom:4px">
        <button onclick="chPageMove(-1)" style="padding:5px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg2);font-size:12px;cursor:pointer;${chPage===0?'opacity:.4':''}">◀</button>
        <span style="font-size:12px;color:var(--ink3)">${start+1}~${end} / ${total}</span>
        <button onclick="chPageMove(1)"  style="padding:5px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg2);font-size:12px;cursor:pointer;${end>=total?'opacity:.4':''}">▶</button>
      </div>` : '';
  document.getElementById('chList').innerHTML = nav + nov._chs.slice(start, end).map((ch, i) => {
    const idx = start + i;
    return `<div class="ch-item${idx===curCh?' active':''}" onclick="jumpCh(${idx})">
      <span class="ch-num">${idx+1}</span>
      <span class="ch-title">${escapeHtml(ch.title)}</span>
      ${idx < curCh ? '<span class="ch-check">✓</span>' : ''}
    </div>`;
  }).join('');
  setTimeout(() => document.querySelector('.ch-item.active')?.scrollIntoView({ block:'center' }), 100);
}
function chPageMove(d) {
  const nov = novels.find(x => x.id === curId); if (!nov?._chs) return;
  chPage = Math.max(0, Math.min(Math.ceil(nov._chs.length / CH_PAGE) - 1, chPage + d));
  renderChList();
}
function jumpCh(i) { curCh = i; closeChList(); renderCh(); }

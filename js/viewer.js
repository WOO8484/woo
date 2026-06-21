/* ══════════════════════════════════════════════
   Mr.woo v2.8.2  —  js/viewer.js
   ══════════════════════════════════════════════ */
'use strict';

/* ── 상태 ──────────────────────────────────── */
let _vNov          = null;
let _vChs          = [];
let _vCur          = 0;
let _vMode         = 'scroll'; // 'scroll' | 'page'
let _animDir       = 'next';
let _idleHandle    = null;
let _renderGen     = 0;
let _progressTimer = null;
let _ioObserver    = null;

/* ── 읽기 설정 ─────────────────────────────── */
const V_THEMES = {
  light:  { bg:'#ffffff', ink:'#2A2A2A' },
  sepia:  { bg:'#F4ECD8', ink:'#3D2B1A' },
  dark:   { bg:'#1C1C28', ink:'#C8C8D8' },
  amoled: { bg:'#000000', ink:'#E0E0E0' },
};
const V_FONTS = {
  system: "-apple-system,'Apple SD Gothic Neo',sans-serif",
  gothic: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
  serif:  "'Nanum Myeongjo','Georgia',serif",
  mono:   "'Courier New',monospace",
};
let vCfg = { fontSize:17, lineHeight:1.9, fontFamily:'system', theme:'light', mode:'scroll' };
(function loadVCfg() {
  try { const s = localStorage.getItem('v_cfg'); if (s) vCfg = { ...vCfg, ...JSON.parse(s) }; } catch(e) {}
  _vMode = vCfg.mode || 'scroll';
})();
function saveVCfg() { localStorage.setItem('v_cfg', JSON.stringify(vCfg)); }

/* ── 챕터 파싱 ─────────────────────────────── */
function getChs(nov) {
  if (!nov._chs) nov._chs = splitCh(nov._text || '');
  return nov._chs;
}
function splitCh(txt) {
  const lines = txt.split('\n');
  const chs = []; let title = '', body = [];
  const isChLine = l => {
    const t = l.trim();
    if (!t || t.length > 80) return false;
    if (/^[\*\-=─━\s·.]{3,}$/.test(t)) return false;
    return /^(\d{1,4}[화장편권]|제\s*\d+\s*[화장편권]|\d{1,4}\.\s+\S)/.test(t)
      || /^chapter\s*\d+/i.test(t)
      || /^(프롤로그|에필로그|후기|작가의\s*말|외전|번외|챕터\s*\d+)/.test(t)
      || /^[★◆■◇◈▶●○※]\s*.{1,20}$/.test(t);
  };
  for (const line of lines) {
    if (isChLine(line)) {
      if (title || body.join('').trim()) chs.push({ title: title||'본문', content: body.join('\n').trim() });
      title = line.trim(); body = [];
    } else body.push(line);
  }
  if (title || body.join('').trim()) chs.push({ title: title||'본문', content: body.join('\n').trim() });
  return chs.length ? chs : [{ title:'본문', content:txt }];
}

/* ── idle 헬퍼 ─────────────────────────────── */
function safeIdle(cb, t=400) {
  if ('requestIdleCallback' in window) return requestIdleCallback(cb, { timeout:t });
  let h; const r = requestAnimationFrame(() => requestAnimationFrame(() => { cb(); h=null; }));
  return (h=r);
}
function cancelSafeIdle(h) {
  if ('cancelIdleCallback' in window) cancelIdleCallback(h); else cancelAnimationFrame(h);
}

/* ── 뷰어 열기 ─────────────────────────────── */
async function openViewer(id) {
  const nov = novels.find(x => x.id === id); if (!nov) return;
  if (!nov._text && nov.textUrl) {
    showToast('본문 불러오는 중...', '', 8000);
    try { const res = await fetch(nov.textUrl); nov._text = await res.text(); }
    catch(e) { showToast('본문을 불러오지 못했어요', 'error'); return; }
  }
  if (!nov._text) { showToast('읽을 수 있는 파일이 없어요', 'error'); return; }

  _vNov = nov;
  _vChs = getChs(nov);
  const saved = getNovelUserData(id);
  _vCur = Math.min(saved.ch || 0, _vChs.length - 1);

  document.getElementById('mainNav').style.display = 'none';
  document.getElementById('tabBar').style.display  = 'none';
  document.getElementById('viewer').classList.add('open');
  applyVTheme();
  _animDir = 'next';
  renderVCh();
}

/* ── 뷰어 닫기 ─────────────────────────────── */
function closeViewer() {
  clearTimeout(_progressTimer);
  if (_idleHandle) { cancelSafeIdle(_idleHandle); _idleHandle = null; }
  if (_ioObserver) { _ioObserver.disconnect(); _ioObserver = null; }
  if (_vNov) {
    const total = _vChs.length;
    const pct = total > 1 ? Math.min(99, Math.round((_vCur/(total-1))*100)) : (getNovelUserData(_vNov.id).progress||1);
    setNovelUserData(_vNov.id, { ch:_vCur, progress:pct, lastReadAt:new Date().toISOString() });
  }
  document.getElementById('viewer').classList.remove('open');
  document.getElementById('mainNav').style.display = 'flex';
  document.getElementById('tabBar').style.display  = 'flex';
  renderHome();
}

/* ── 챕터 렌더링 ───────────────────────────── */
function renderVCh() {
  const ch = _vChs[_vCur];
  if (_idleHandle) { cancelSafeIdle(_idleHandle); _idleHandle = null; }
  if (_ioObserver) { _ioObserver.disconnect(); _ioObserver = null; }

  const gen = ++_renderGen;
  const vBody = document.getElementById('vBody');
  const paras = ch.content.split(/\n+/).filter(p => p.trim());
  const FIRST = 15;

  const frag = document.createDocumentFragment();
  paras.slice(0, FIRST).forEach(p => {
    const el = document.createElement('p'); el.textContent = p; frag.appendChild(el);
  });
  if (!paras.length) {
    const el = document.createElement('p');
    el.style.cssText = 'color:var(--ink3);font-style:italic';
    el.textContent = '(내용 없음)'; frag.appendChild(el);
  }
  vBody.innerHTML = ''; vBody.appendChild(frag);
  vBody.scrollTop = 0;

  // lazy rendering
  if (paras.length > FIRST) {
    const rest = paras.slice(FIRST);
    let rendered = false;
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'height:1px;margin-top:40px';
    vBody.appendChild(sentinel);
    const renderRest = () => {
      if (rendered || gen !== _renderGen) return;
      rendered = true;
      if (_ioObserver) { _ioObserver.disconnect(); _ioObserver = null; }
      _idleHandle = safeIdle(() => {
        if (gen !== _renderGen) return;
        let idx = 0;
        const BATCH = 30;
        const renderBatch = () => {
          if (idx >= rest.length || gen !== _renderGen) { _idleHandle = null; return; }
          const rf = document.createDocumentFragment();
          rest.slice(idx, idx+BATCH).forEach(p => {
            const el = document.createElement('p'); el.textContent = p; rf.appendChild(el);
          });
          vBody.insertBefore(rf, sentinel);
          idx += BATCH;
          if (idx < rest.length) _idleHandle = safeIdle(renderBatch, 200);
          else { sentinel.remove(); _idleHandle = null; }
        };
        renderBatch();
      });
    };
    if ('IntersectionObserver' in window) {
      _ioObserver = new IntersectionObserver(e => { if (e[0].isIntersecting) renderRest(); }, { rootMargin:'200px' });
      _ioObserver.observe(sentinel);
    } else {
      _idleHandle = safeIdle(renderRest, 400);
    }
  }

  // 페이지 모드: 좌우 탭 표시
  const tapL = document.getElementById('vTapLeft');
  const tapR = document.getElementById('vTapRight');
  const tapC = document.getElementById('vTapCenter');
  if (_vMode === 'page') {
    if (tapL) tapL.style.display = '';
    if (tapR) tapR.style.display = '';
    if (tapC) tapC.style.display = '';
  } else {
    if (tapL) tapL.style.display = 'none';
    if (tapR) tapR.style.display = 'none';
    if (tapC) tapC.style.display = '';
  }

  // 애니메이션
  const vPage = document.getElementById('vPage');
  if (vPage) {
    vPage.classList.remove('anim-next','anim-prev');
    requestAnimationFrame(() => vPage.classList.add(_animDir === 'next' ? 'anim-next' : 'anim-prev'));
  }

  // 진행률 저장
  const total = _vChs.length;
  const pct = total > 1 ? Math.min(99, Math.round((_vCur/(total-1))*100)) : (getNovelUserData(_vNov.id).progress||1);
  clearTimeout(_progressTimer);
  _progressTimer = setTimeout(() => {
    setNovelUserData(_vNov.id, { progress:pct, lastReadAt:new Date().toISOString(), ch:_vCur });
  }, 800);
}

/* ── 챕터 이동 ─────────────────────────────── */
function vPrev() { if (_vCur > 0) { _animDir='prev'; _vCur--; renderVCh(); } }
function vNext() {
  if (_vCur < _vChs.length-1) { _animDir='next'; _vCur++; renderVCh(); }
  else {
    setNovelUserData(_vNov.id, { progress:100, ch:0, lastReadAt:new Date().toISOString() });
    document.getElementById('completeMsg').textContent = `"${_vNov.title}"`;
    document.getElementById('completeOv').classList.add('on');
  }
}
function closeComplete(exit) {
  document.getElementById('completeOv').classList.remove('on');
  if (exit) closeViewer(); else { _vCur=0; _animDir='next'; renderVCh(); }
}

/* ── 뷰어 팝업 ─────────────────────────────── */
function openVPopup() {
  const total = _vChs.length;
  document.getElementById('vpopupTitle').textContent = _vNov?.title || '';
  const novTotalP = Math.round((_vNov?.totalChars||0)/500);
  const readP = total > 1 ? Math.round(novTotalP * (_vCur/(total-1))) : novTotalP;
  document.getElementById('vpopupInfo').textContent = `${_vCur+1} / ${total} 챕터  ·  ${readP}p / ${novTotalP}p`;
  const sw = document.getElementById('vpopupSliderWrap');
  const sl = document.getElementById('vpopupSlider');
  if (total > 1) { sw.style.display=''; sl.max=total-1; sl.value=_vCur; }
  else sw.style.display='none';
  document.getElementById('vpopupOv').classList.add('on');
}
function closeVPopup() { document.getElementById('vpopupOv').classList.remove('on'); }
function onSliderChange(v) { _vCur=parseInt(v); closeVPopup(); setTimeout(renderVCh,150); }

/* ── 읽기 설정 ─────────────────────────────── */
function applyVTheme() {
  const t = V_THEMES[vCfg.theme] || V_THEMES.light;
  const viewer = document.getElementById('viewer');
  const vBody  = document.getElementById('vBody');
  if (viewer) viewer.style.background = t.bg;
  if (vBody)  { vBody.style.background = t.bg; vBody.style.color = t.ink; }
  const vText = document.getElementById('vBody');
  if (vText) {
    vText.style.fontSize   = vCfg.fontSize + 'px';
    vText.style.lineHeight = vCfg.lineHeight;
    vText.style.fontFamily = V_FONTS[vCfg.fontFamily] || V_FONTS.system;
  }
  // 스크롤/페이지 모드
  _vMode = vCfg.mode || 'scroll';
  const vBody2 = document.getElementById('vBody');
  if (vBody2) vBody2.style.overflowY = _vMode === 'scroll' ? 'auto' : 'hidden';
}
function openVSettings() {
  syncVSettingsUI();
  document.getElementById('vSetOv').classList.add('on');
  document.getElementById('vSetModal').classList.add('on');
}
function closeVSettings() {
  document.getElementById('vSetOv').classList.remove('on');
  document.getElementById('vSetModal').classList.remove('on');
}
function syncVSettingsUI() {
  document.getElementById('vFontSlider').value      = vCfg.fontSize;
  document.getElementById('vFontVal').textContent   = vCfg.fontSize + 'px';
  document.getElementById('vLhSlider').value        = vCfg.lineHeight * 100;
  document.getElementById('vLhVal').textContent     = vCfg.lineHeight;
  document.querySelectorAll('.vtheme-btn').forEach(b => b.classList.toggle('on', b.dataset.theme === vCfg.theme));
  document.querySelectorAll('.vfont-btn').forEach(b => b.classList.toggle('on', b.dataset.font === vCfg.fontFamily));
  document.querySelectorAll('.vmode-btn').forEach(b => b.classList.toggle('on', b.dataset.mode === vCfg.mode));
}
function vSetTheme(t) { vCfg.theme=t; applyVTheme(); saveVCfg(); syncVSettingsUI(); }
function vSetFont(f)  { vCfg.fontFamily=f; applyVTheme(); saveVCfg(); syncVSettingsUI(); }
function vSetMode(m)  { vCfg.mode=m; _vMode=m; applyVTheme(); saveVCfg(); syncVSettingsUI(); }
function vChFont(d)   { vCfg.fontSize=Math.max(13,Math.min(26,vCfg.fontSize+d)); applyVTheme(); saveVCfg(); syncVSettingsUI(); }
function vChFontSlider(v) { vCfg.fontSize=parseInt(v); applyVTheme(); saveVCfg(); document.getElementById('vFontVal').textContent=v+'px'; }
function vChLh(d)     { vCfg.lineHeight=parseFloat(Math.max(1.4,Math.min(2.6,vCfg.lineHeight+d)).toFixed(1)); applyVTheme(); saveVCfg(); syncVSettingsUI(); }
function vChLhSlider(v) { vCfg.lineHeight=parseFloat((v/100).toFixed(1)); applyVTheme(); saveVCfg(); document.getElementById('vLhVal').textContent=vCfg.lineHeight; }
function vResetSettings() { vCfg={fontSize:17,lineHeight:1.9,fontFamily:'system',theme:'light',mode:'scroll'}; _vMode='scroll'; applyVTheme(); saveVCfg(); syncVSettingsUI(); showToast('설정 초기화했어요'); }

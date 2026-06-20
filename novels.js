/* ══════════════════════════════════════════════
   NovelShelf v2.3.2  —  js/novels.js
   소설 CRUD, 유저 데이터, 홈/서재 렌더링
   ══════════════════════════════════════════════ */
'use strict';

/* ═══════════════════════════════════════════════
   Firestore — 소설 목록 실시간 구독
   ═══════════════════════════════════════════════ */
function subscribeNovels() {
  if (_novelsUnsub) _novelsUnsub();
  _novelsUnsub = db.collection('novels')
    .orderBy('addedAt', 'desc')
    .onSnapshot(
      snap => {
        novels = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        novels.forEach(n => {
          if (n.addedAt?.toDate)    n.addedAt    = n.addedAt.toDate().toISOString();
          if (n.lastReadAt?.toDate) n.lastReadAt = n.lastReadAt.toDate().toISOString();
        });
        _chsCache.clear();
        batchRender();
      },
      err => {
        console.error('novels subscription error:', err);
        showToast('소설 목록을 불러오는 데 실패했어요', 'error');
      }
    );
}

/* ═══════════════════════════════════════════════
   Firestore — 유저 데이터 (진행률·즐겨찾기)
   ═══════════════════════════════════════════════ */
async function loadUserData() {
  if (!currentUser) return;
  try {
    const snap = await db.collection('userdata').doc(currentUser.uid)
      .collection('novels').get();
    userDataCache = {};
    snap.forEach(d => {
      const data = d.data();
      if (data.lastReadAt?.toDate) data.lastReadAt = data.lastReadAt.toDate().toISOString();
      userDataCache[d.id] = data;
    });
  } catch(e) {
    console.error('loadUserData error:', e);
  }
}

function getNovelUserData(id) {
  return userDataCache[id] || { progress:0, favorite:false, lastReadAt:null, ch:0 };
}

async function setNovelUserData(id, patch) {
  if (!currentUser) return;
  userDataCache[id] = { ...getNovelUserData(id), ...patch };
  try {
    const payload = { ...patch };
    if (payload.lastReadAt) {
      payload.lastReadAt = firebase.firestore.Timestamp.fromDate(new Date(payload.lastReadAt));
    }
    await db.collection('userdata').doc(currentUser.uid)
      .collection('novels').doc(id)
      .set(payload, { merge: true });
  } catch(e) {
    console.error('setNovelUserData error:', e);
  }
}

function getNovelsWithUserData() {
  return novels.map(n => ({ ...n, ...getNovelUserData(n.id) }));
}

/* ═══════════════════════════════════════════════
   HOME 렌더링
   ═══════════════════════════════════════════════ */
function renderHome() {
  document.getElementById('homeDate').textContent =
    new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'long' });

  const nlist   = getNovelsWithUserData();
  const total   = nlist.length;
  const reading = nlist.filter(n => n.progress > 0 && n.progress < 100).length;
  const done    = nlist.filter(n => n.progress >= 100).length;

  document.getElementById('homeStats').style.display  = '';
  document.getElementById('homeStreak').style.display = '';
  document.getElementById('homeEmpty').style.display  = 'none';
  document.getElementById('statTotal').textContent    = total;
  document.getElementById('statReading').textContent  = reading;
  document.getElementById('statDone').textContent     = done;
  document.getElementById('streakText').textContent   = done > 0 ? `완독 ${done}권 달성! 🔥` : '오늘 독서를 시작해보세요';
  document.getElementById('streakSub').textContent    = reading > 0 ? `${reading}권 읽는 중` : '';

  // 이어 읽기
  const inProg = [...nlist]
    .filter(n => n.lastReadAt && n.progress < 100)
    .sort((a,b) => new Date(b.lastReadAt) - new Date(a.lastReadAt))
    .slice(0, 5);
  document.getElementById('secContinue').style.display = inProg.length ? '' : 'none';
  document.getElementById('continueList').innerHTML = inProg.map(n => {
    const cc   = genreCoverClass(n.genre);
    const icon = GENRE_ICON[n.genre] || '📖';
    const cover = n.coverUrl
      ? `<img src="${escapeHtml(n.coverUrl)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.className='continue-thumb ${cc}';this.parentElement.innerHTML='<span style=font-size:20px>${icon}</span>'">`
      : `<span style="font-size:20px">${icon}</span>`;
    return `<div class="continue-card" onclick="openDetail('${n.id}')">
      <div class="continue-thumb ${n.coverUrl ? '' : cc}">${cover}</div>
      <div class="continue-info">
        <div class="continue-title">${escapeHtml(n.title)}</div>
        <div class="continue-author">${escapeHtml(n.author || '작자 미상')}</div>
        <div class="continue-bar"><div class="continue-fill" style="width:${n.progress}%"></div></div>
        <div class="continue-pct">${n.progress}% 진행</div>
      </div>
      <button class="continue-btn" onclick="event.stopPropagation();openViewer('${n.id}')">읽기</button>
    </div>`;
  }).join('');

  // 최근 추가
  const recent = [...nlist].sort((a,b) => new Date(b.addedAt) - new Date(a.addedAt)).slice(0, 6);
  document.getElementById('secRecent').style.display = '';
  document.getElementById('recentGrid').innerHTML = recent.map(n => {
    const cc   = genreCoverClass(n.genre);
    const icon = GENRE_ICON[n.genre] || '📖';
    const cover = n.coverUrl
      ? `<img src="${escapeHtml(n.coverUrl)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.className='recent-cover ${cc}';this.parentElement.innerHTML='<span class=recent-cover-icon>${icon}</span>'">`
      : `<span class="recent-cover-icon">${icon}</span>`;
    return `<div class="recent-card" onclick="openDetail('${n.id}')">
      <div class="recent-cover ${n.coverUrl ? '' : cc}">${cover}
        ${n.progress >= 100 ? '<div class="done-badge">완독</div>' : ''}
        ${n.progress > 0 && n.progress < 100 ? `<div class="pct-badge">${n.progress}%</div>` : ''}
        <button class="fav-btn" onclick="event.stopPropagation();toggleFav('${n.id}')">${n.favorite ? '⭐' : '☆'}</button>
      </div>
      <div class="recent-title">${escapeHtml(n.title)}</div>
      <div class="recent-author">${escapeHtml(n.author || '')}</div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════
   SHELF 렌더링
   ═══════════════════════════════════════════════ */
let shelfView      = 'grid';
let sortMode       = 'recent';
let filterMode     = 'all';
let selGenreFilter = 'all';

function renderGenreTabs() {
  const genres = ['all','romance','fantasy','thriller','sf','historical','mystery','etc'];
  const labels = { all:'전체', romance:'로맨스', fantasy:'판타지', thriller:'스릴러', sf:'SF', historical:'역사', mystery:'미스터리', etc:'기타' };
  document.getElementById('genreTabs').innerHTML = genres.map(g =>
    `<button class="genre-tab${g === selGenreFilter ? ' on' : ''}" onclick="setGenreFilter('${g}')">${labels[g]}</button>`
  ).join('');
}
function setGenreFilter(g) {
  selGenreFilter = g;
  document.querySelectorAll('.genre-tab').forEach((t,i) => {
    t.classList.toggle('on', ['all','romance','fantasy','thriller','sf','historical','mystery','etc'][i] === g);
  });
  renderShelf();
}
function setFilter(mode, el) {
  filterMode = mode;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
  renderShelf();
}
function toggleShelfView() {
  shelfView = shelfView === 'grid' ? 'list' : 'grid';
  document.getElementById('viewBtn').textContent = shelfView === 'grid' ? '⊞' : '☰';
  renderShelf();
}
function toggleSort() {
  const modes  = ['recent','title','progress','done'];
  const labels = { recent:'최근 추가', title:'제목순', progress:'진행률', done:'완독순' };
  sortMode = modes[(modes.indexOf(sortMode) + 1) % modes.length];
  document.getElementById('sortLabel').textContent = labels[sortMode];
  renderShelf();
}
let _shelfTimer = null;
function debounceShelf() {
  clearTimeout(_shelfTimer);
  _shelfTimer = setTimeout(renderShelf, 180);
}

function renderShelf() {
  const q = document.getElementById('shelfSearch').value.toLowerCase();
  let list = getNovelsWithUserData().filter(n => n.progress > 0 || n.favorite);
  if (selGenreFilter !== 'all') list = list.filter(n => n.genre === selGenreFilter);
  if (filterMode === 'favorite') list = list.filter(n => n.favorite);
  if (filterMode === 'inprog')   list = list.filter(n => n.progress > 0 && n.progress < 100);
  if (filterMode === 'done')     list = list.filter(n => n.progress >= 100);
  if (q) list = list.filter(n => (n.title + n.author + (n.tags||[]).join('')).toLowerCase().includes(q));
  if (sortMode === 'title')    list.sort((a,b) => a.title.localeCompare(b.title));
  if (sortMode === 'progress') list.sort((a,b) => b.progress - a.progress);
  if (sortMode === 'done')     list.sort((a,b) => (b.progress>=100?1:0) - (a.progress>=100?1:0));
  if (sortMode === 'recent')   list.sort((a,b) => new Date(b.addedAt) - new Date(a.addedAt));

  const grid = document.getElementById('shelfGrid');
  grid.className = shelfView === 'grid' ? 'shelf-grid' : 'shelf-grid list';

  if (!list.length) {
    grid.innerHTML = '<div class="shelf-empty">📭 아직 서재가 비어있어요<br><span style="font-size:11px">홈에서 책을 읽거나 즐겨찾기하면 여기에 추가돼요</span></div>';
    return;
  }

  const renderItem = n => {
    const cc   = genreCoverClass(n.genre);
    const icon = GENRE_ICON[n.genre] || '📖';
    if (shelfView === 'list') {
      const cover = n.coverUrl
        ? `<img src="${escapeHtml(n.coverUrl)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
        : '';
      return `<div class="shelf-list-card" onclick="openDetail('${n.id}')">
        <div class="shelf-list-thumb ${n.coverUrl ? '' : cc}">${cover || icon}</div>
        <div class="shelf-list-info">
          <div class="shelf-list-title">${escapeHtml(n.title)}</div>
          <div class="shelf-list-author">${escapeHtml(n.author||'작자 미상')} · ${GENRE_LABEL[n.genre]||'기타'}</div>
          <div class="shelf-list-bar"><div class="shelf-list-fill" style="width:${n.progress}%"></div></div>
          <div class="shelf-list-pct">${n.progress}%${n.progress>=100?' · 완독':''}</div>
        </div>
        <button class="shelf-list-remove-btn" onclick="event.stopPropagation();confirmShelfRemove('${n.id}')">제거</button>
      </div>`;
    }
    const cover = n.coverUrl
      ? `<img src="${escapeHtml(n.coverUrl)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.className='card-cover ${cc}';this.remove()">`
      : `<span class="card-cover-icon">${icon}</span>`;
    return `<div class="card" onclick="openDetail('${n.id}')">
      <div class="card-cover ${n.coverUrl ? '' : cc}">${cover}
        ${n.progress>=100 ? '<div class="done-badge">완독</div>' : ''}
        ${n.progress>0&&n.progress<100 ? `<div class="pct-badge">${n.progress}%</div>` : ''}
        <button class="fav-btn" onclick="event.stopPropagation();toggleFav('${n.id}')">${n.favorite?'⭐':'☆'}</button>
        <button class="shelf-remove-btn" onclick="event.stopPropagation();confirmShelfRemove('${n.id}')" title="제거">✕</button>
      </div>
      <div class="card-title">${escapeHtml(n.title)}</div>
      <div class="card-author">${escapeHtml(n.author||'')}</div>
    </div>`;
  };

  const CHUNK = 30;
  grid.innerHTML = list.slice(0, CHUNK).map(renderItem).join('');
  if (list.length > CHUNK) {
    const rest = list.slice(CHUNK);
    const loadMore = () => grid.insertAdjacentHTML('beforeend', rest.map(renderItem).join(''));
    'requestIdleCallback' in window ? requestIdleCallback(loadMore, { timeout:300 }) : setTimeout(loadMore, 50);
  }
}

/* ═══════════════════════════════════════════════
   즐겨찾기
   ═══════════════════════════════════════════════ */
async function toggleFav(id) {
  const newFav = !getNovelUserData(id).favorite;
  await setNovelUserData(id, { favorite: newFav });
  batchRender();
  showToast(newFav ? '⭐ 즐겨찾기 추가' : '즐겨찾기 해제');
}
async function toggleFavDetail() {
  if (!curId) return;
  const newFav = !getNovelUserData(curId).favorite;
  await setNovelUserData(curId, { favorite: newFav });
  document.getElementById('dFavBtn').textContent = newFav ? '⭐' : '☆';
  batchRender();
  showToast(newFav ? '⭐ 즐겨찾기 추가' : '즐겨찾기 해제');
}

/* ═══════════════════════════════════════════════
   DETAIL
   ═══════════════════════════════════════════════ */
function openDetail(id) {
  const _n = novels.find(x => x.id === id); if (!_n) return;
  const n  = { ..._n, ...getNovelUserData(id) };
  curId = id;
  document.getElementById('detail').style.display = 'block';
  const cc = genreCoverClass(n.genre);
  document.getElementById('dHeroBgColor').className = 'dhero-bg-color ' + cc;
  const coverEl = document.getElementById('dCover');
  coverEl.className = 'dcover ' + (n.coverUrl ? '' : cc);
  coverEl.innerHTML = n.coverUrl
    ? `<img src="${escapeHtml(n.coverUrl)}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.className='dcover ${cc}';this.parentElement.textContent='${GENRE_ICON[n.genre]||'📖'}'">` 
    : GENRE_ICON[n.genre] || '📖';
  document.getElementById('dTitle').textContent   = n.title;
  document.getElementById('dAuthor').textContent  = n.author || '작자 미상';
  document.getElementById('dMeta').textContent    = (GENRE_LABEL[n.genre]||'기타') + ' · ' + Math.round((n.totalChars||0)/500) + 'p';
  document.getElementById('dProgFill').style.width = n.progress + '%';
  document.getElementById('dProgText').textContent = n.progress > 0 ? n.progress + '% 진행 중' : '아직 읽지 않았어요';
  document.getElementById('dStatProg').textContent  = n.progress + '%';
  document.getElementById('dStatPages').textContent = Math.round((n.totalChars||0)/500) + 'p';
  document.getElementById('dSyn').textContent  = n.synopsis || '줄거리 없음';
  document.getElementById('dTags').innerHTML   = (n.tags && n.tags.length)
    ? n.tags.map(t => `<span class="dtag">#${escapeHtml(t)}</span>`).join('') : '태그 없음';
  document.getElementById('dDlBtn').style.display       = n.inlineText ? '' : 'none';
  document.getElementById('dDelBtn').style.display      = isAdmin ? '' : 'none';
  document.getElementById('dEditBtn').style.display     = isAdmin ? '' : 'none';
  document.getElementById('dShelfRemBtn').style.display = (n.progress > 0 || n.favorite) ? '' : 'none';
  document.getElementById('dReadBtn').textContent       = n.progress > 0 ? '이어 읽기' : '처음부터 읽기';
  document.getElementById('dFavBtn').textContent        = n.favorite ? '⭐' : '☆';
}
function closeDetail() { document.getElementById('detail').style.display = 'none'; }
function readFromDetail() { openViewer(curId); }

/* ═══════════════════════════════════════════════
   소설 추가 (관리자)
   ═══════════════════════════════════════════════ */
let selG          = null;
let curFile       = null;
let addCoverBase64 = '';
let naverSelectedBook = null;

function openAdd() {
  if (!isAdmin) { showToast('관리자만 소설을 추가할 수 있어요', 'error'); return; }
  document.getElementById('addModal').classList.add('on');
}
function closeAdd() {
  document.getElementById('addModal').classList.remove('on');
  ['addTitle','addAuthor','addSyn','addTags','naverSearchInput'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('fileName').style.display  = 'none';
  document.getElementById('fileDropIcon').textContent = '📄';
  document.getElementById('fileDropText').textContent = '탭하거나 파일을 여기에 끌어다 놓으세요';
  document.getElementById('fileDrop').classList.remove('has-file');
  document.getElementById('fileInput').value = '';
  document.getElementById('naverResults').innerHTML = '';
  ['titleFilledBadge','authorFilledBadge','synFilledBadge','coverAutoBadge','coverClearBtn']
    .forEach(id => { document.getElementById(id).style.display = 'none'; });
  const img = document.getElementById('coverPreviewImg');
  img.src = ''; img.style.display = 'none';
  document.getElementById('coverPreviewEmpty').style.display = '';
  document.getElementById('coverImgInput').value = '';
  document.querySelectorAll('#genreSel .genre-sel-btn').forEach(b => b.classList.remove('on'));
  selG = null; curFile = null; naverSelectedBook = null; addCoverBase64 = '';
  const btn = document.getElementById('addSaveBtn');
  btn.disabled = false; btn.textContent = '서재에 추가';
}
function selGenre(el) {
  selG = el.dataset.g;
  document.querySelectorAll('#genreSel .genre-sel-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
}

// 파일 처리
function onFileDrop(e) { applySelectedFile(e.dataTransfer.files[0]); }
function onFileSelect(input) { applySelectedFile(input.files[0]); }
// 글자수 제한 상수 (Firestore 1MB 제한 + iOS 메모리 고려)
const MAX_CHARS = 500_000; // 50만 글자 ≈ 약 500KB

function applySelectedFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['txt','text'].includes(ext) || (!file.type.startsWith('text/') && file.type !== '')) {
    showToast('TXT 파일만 업로드할 수 있어요', 'error'); return;
  }
  if (file.size > 20 * 1024 * 1024) { showToast('파일이 너무 커요 (최대 20MB)', 'error'); return; }
  curFile = file;
  const sizeStr = file.size > 1024*1024
    ? (file.size/1024/1024).toFixed(1)+'MB'
    : Math.round(file.size/1024)+'KB';
  document.getElementById('fileDropIcon').textContent = '✅';
  document.getElementById('fileDropText').textContent = '파일 선택됨';
  document.getElementById('fileName').textContent     = `${file.name}  (${sizeStr})`;
  document.getElementById('fileName').style.display   = 'block';
  document.getElementById('fileDrop').classList.add('has-file');
  const titleEl = document.getElementById('addTitle');
  if (!titleEl.value) titleEl.value = file.name.replace(/\.(txt|text)$/i,'').trim();
}

// 표지 업로드
function onCoverImgSelect(input) {
  const file = input.files[0]; if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('이미지 파일만 업로드할 수 있어요', 'error'); input.value=''; return; }
  if (file.size > 5 * 1024 * 1024) { showToast('이미지는 5MB 이하만 가능해요', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    addCoverBase64 = e.target.result;
    const img = document.getElementById('coverPreviewImg');
    img.src = addCoverBase64; img.style.display = '';
    document.getElementById('coverPreviewEmpty').style.display = 'none';
    document.getElementById('coverClearBtn').style.display     = '';
    document.getElementById('coverAutoBadge').style.display    = 'none';
  };
  reader.readAsDataURL(file);
}
function clearCoverPreview() {
  addCoverBase64 = '';
  if (naverSelectedBook) naverSelectedBook = { ...naverSelectedBook, coverUrl:'' };
  const img = document.getElementById('coverPreviewImg');
  img.src = ''; img.style.display = 'none';
  document.getElementById('coverPreviewEmpty').style.display = '';
  document.getElementById('coverClearBtn').style.display     = 'none';
  document.getElementById('coverAutoBadge').style.display    = 'none';
  document.getElementById('coverImgInput').value = '';
}

// 소설 저장
async function saveNovel() {
  if (!isAdmin) { showToast('관리자만 소설을 추가할 수 있어요', 'error'); return; }
  const title = document.getElementById('addTitle').value.trim();
  if (!title) { showToast('제목을 입력해주세요', 'error'); return; }

  const btn = document.getElementById('addSaveBtn');
  btn.disabled = true; btn.textContent = curFile ? '파일 읽는 중...' : '저장 중...';

  try {
    let inlineText = '';
    let totalChars = 0;
    if (curFile) {
      inlineText = await readTextFileAsync(curFile, pct => { btn.textContent = `읽는 중... ${pct}%`; });
      totalChars = inlineText.length;

      // ── 글자수 제한 (Firestore 1MB + iOS 메모리 보호) ──
      if (totalChars > MAX_CHARS) {
        showToast(`파일이 너무 커요 (최대 ${(MAX_CHARS/10000).toFixed(0)}만 글자, 현재 ${(totalChars/10000).toFixed(0)}만 글자)`, 'error');
        btn.disabled = false; btn.textContent = '서재에 추가';
        return;
      }
    }
    btn.textContent = '저장 중...';
    await db.collection('novels').add({
      title,
      author:    document.getElementById('addAuthor').value.trim() || '작자 미상',
      genre:     selG || 'etc',
      synopsis:  document.getElementById('addSyn').value.trim(),
      tags:      document.getElementById('addTags').value.split(',').map(t => t.trim()).filter(Boolean),
      coverUrl:  addCoverBase64,
      totalChars,
      inlineText,
      addedAt:   firebase.firestore.FieldValue.serverTimestamp(),
      addedBy:   currentUser.uid,
    });

    // ── splitCh 지연 실행 (UI 블로킹 방지) ──
    closeAdd();
    showToast('서재에 추가했어요 📚');
    const raf = cb => requestAnimationFrame(() => requestAnimationFrame(cb));
    raf(() => {
      const chCount = splitCh(inlineText).length;
      showToast(`서재에 추가했어요 📚  총 ${chCount}화`);
    });
  } catch(e) {
    console.error('saveNovel error:', e);
    showToast('저장에 실패했어요: ' + e.message, 'error');
    btn.disabled = false; btn.textContent = '서재에 추가';
  }
}

// UTF-8 → EUC-KR 폴백 파일 읽기
function readTextFileAsync(file, onProgress) {
  return new Promise((resolve, reject) => {
    const tryRead = (encoding, fallback) => {
      const reader = new FileReader();
      if (onProgress) reader.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded/e.total*100)); };
      reader.onload = e => {
        const text    = e.target.result || '';
        const garbled = (text.match(/\uFFFD/g)||[]).length / Math.max(text.length, 1);
        garbled > 0.005 && fallback ? tryRead(fallback, null) : resolve(text);
      };
      reader.onerror = () => reject(new Error('파일을 읽을 수 없어요'));
      reader.readAsText(file, encoding);
    };
    tryRead('UTF-8', 'EUC-KR');
  });
}

/* ═══════════════════════════════════════════════
   소설 수정 (관리자)
   ═══════════════════════════════════════════════ */
let selEditG       = null;
let editCoverBase64 = '';

function openEdit() {
  if (!isAdmin) { showToast('관리자만 수정할 수 있어요', 'error'); return; }
  const n = novels.find(x => x.id === curId); if (!n) return;
  document.getElementById('editTitle').value  = n.title   || '';
  document.getElementById('editAuthor').value = n.author  || '';
  document.getElementById('editSyn').value    = n.synopsis || '';
  document.getElementById('editTags').value   = (n.tags||[]).join(', ');
  selEditG = n.genre || null;
  document.querySelectorAll('#editGenreSel .genre-sel-btn').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.g === selEditG);
  });
  editCoverBase64 = n.coverUrl || '';
  const img = document.getElementById('editCoverImg');
  if (editCoverBase64) {
    img.src = editCoverBase64; img.style.display = '';
    document.getElementById('editCoverEmpty').style.display    = 'none';
    document.getElementById('editCoverClearBtn').style.display = '';
  } else {
    img.src = ''; img.style.display = 'none';
    document.getElementById('editCoverEmpty').style.display    = '';
    document.getElementById('editCoverClearBtn').style.display = 'none';
  }
  document.getElementById('editModal').classList.add('on');
}
function closeEdit() { document.getElementById('editModal').classList.remove('on'); }
function selEditGenre(btn) {
  selEditG = btn.dataset.g;
  document.querySelectorAll('#editGenreSel .genre-sel-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
}
function onEditCoverSelect(input) {
  const file = input.files[0]; if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('이미지 파일만 업로드할 수 있어요', 'error'); input.value=''; return; }
  if (file.size > 5 * 1024 * 1024) { showToast('이미지는 5MB 이하만 가능해요', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    editCoverBase64 = e.target.result;
    const img = document.getElementById('editCoverImg');
    img.src = editCoverBase64; img.style.display = '';
    document.getElementById('editCoverEmpty').style.display    = 'none';
    document.getElementById('editCoverClearBtn').style.display = '';
  };
  reader.readAsDataURL(file);
}
function clearEditCover() {
  editCoverBase64 = '';
  const img = document.getElementById('editCoverImg');
  img.src = ''; img.style.display = 'none';
  document.getElementById('editCoverEmpty').style.display    = '';
  document.getElementById('editCoverClearBtn').style.display = 'none';
  document.getElementById('editCoverInput').value = '';
}
async function saveEdit() {
  if (!isAdmin) { showToast('관리자만 수정할 수 있어요', 'error'); return; }
  const title = document.getElementById('editTitle').value.trim();
  if (!title) { showToast('제목을 입력해주세요', 'error'); return; }
  const btn = document.getElementById('editSaveBtn');
  btn.disabled = true; btn.textContent = '저장 중...';
  try {
    await db.collection('novels').doc(curId).update({
      title,
      author:   document.getElementById('editAuthor').value.trim() || '작자 미상',
      genre:    selEditG || 'etc',
      synopsis: document.getElementById('editSyn').value.trim(),
      tags:     document.getElementById('editTags').value.split(',').map(t => t.trim()).filter(Boolean),
      coverUrl: editCoverBase64,
    });
    _chsCache.delete(curId);
    closeEdit();
    openDetail(curId);
    showToast('수정했어요 ✓');
  } catch(e) {
    showToast('수정에 실패했어요', 'error');
  } finally {
    btn.disabled = false; btn.textContent = '수정 완료';
  }
}

/* ═══════════════════════════════════════════════
   소설 삭제 / 서재 제거
   ═══════════════════════════════════════════════ */
async function deleteNovel() {
  const n = novels.find(x => x.id === curId); if (!n) return;
  showConfirm(
    `"${n.title}"을(를) 전체 삭제할까요? 모든 유저에게서 사라져요.`,
    async () => {
      try {
        await db.collection('novels').doc(curId).delete();
        closeDetail();
        showToast('삭제했어요');
      } catch(e) { showToast('삭제에 실패했어요', 'error'); }
    }
  );
}
async function removeFromShelf() {
  await setNovelUserData(curId, { progress:0, favorite:false, lastReadAt:null, ch:0 });
  delete userDataCache[curId];
  closeDetail();
  batchRender();
  showToast('내 서재에서 제거했어요');
}
function confirmShelfRemove(id) {
  const n = novels.find(x => x.id === id); if (!n) return;
  curId = id;
  showConfirm(
    `"${n.title}"을(를) 내 서재에서 제거할까요? (읽기 기록도 초기화돼요)`,
    () => removeFromShelf()
  );
}

/* ═══════════════════════════════════════════════
   TXT 다운로드
   ═══════════════════════════════════════════════ */
function downloadNovel() {
  const n = novels.find(x => x.id === curId);
  if (!n || !n.inlineText) { showToast('다운로드할 텍스트가 없어요', 'error'); return; }
  const blob = new Blob([n.inlineText], { type:'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = (n.title || 'novel') + '.txt';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('다운로드 완료 📄');
}

/* ═══════════════════════════════════════════════
   네이버 책 검색
   ⚠️ 임시 방식 (v2.3.2) — API 키 클라이언트 노출
   PC 생기면 Cloud Functions 이전 예정
   ▶ 아래 두 줄에 본인 네이버 API 키를 입력하세요
   ═══════════════════════════════════════════════ */
const NAVER_CLIENT_ID     = "여기에_Client_ID_입력";
const NAVER_CLIENT_SECRET = "여기에_Client_Secret_입력";

async function callNaverBookAPI(q) {
  const apiUrl = `https://openapi.naver.com/v1/search/book.json?query=${encodeURIComponent(q)}&display=10&start=1`;
  const proxy  = `https://api.allorigins.win/get?url=${encodeURIComponent(apiUrl)}`;
  const res    = await fetch(proxy, {
    headers: {
      'X-Naver-Client-Id':     NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
    },
  });
  if (!res.ok) throw new Error('네트워크 오류');
  const data   = await res.json();
  const parsed = JSON.parse(data.contents);
  return (parsed.items || []).map(item => ({
    title:       item.title,
    author:      item.author,
    description: item.description,
    coverUrl:    item.image,
    publisher:   item.publisher,
    pubdate:     item.pubdate,
  }));
}

async function searchNaverBook() {
  const q   = document.getElementById('naverSearchInput').value.trim();
  if (!q) { showToast('검색어를 입력해주세요', 'error'); return; }
  const btn = document.getElementById('naverSearchBtn');
  btn.disabled = true; btn.textContent = '검색 중...';
  document.getElementById('naverResults').innerHTML = '<div class="naver-status">🔍 검색 중...</div>';
  try {
    const items = await callNaverBookAPI(q);
    renderNaverResults(items);
  } catch(e) {
    document.getElementById('naverResults').innerHTML = '<div class="naver-status err">검색 실패. 잠시 후 다시 시도해주세요.</div>';
    showToast('검색 중 오류가 발생했어요', 'error');
  } finally {
    btn.disabled = false; btn.textContent = '검색';
  }
}

function renderNaverResults(items) {
  const el = document.getElementById('naverResults');
  if (!items || !items.length) {
    el.innerHTML = '<div class="naver-status err">검색 결과가 없어요</div>';
    return;
  }
  el.innerHTML = items.map((item, i) => `
    <div class="naver-result-item" id="naverItem_${i}" data-idx="${i}">
      <div class="naver-result-cover">
        ${item.coverUrl ? `<img src="${escapeHtml(item.coverUrl)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='📚'">` : '📚'}
      </div>
      <div class="naver-result-info">
        <div class="naver-result-title">${escapeHtml(item.title)}</div>
        <div class="naver-result-author">${escapeHtml(item.author)} · ${escapeHtml(item.publisher||'')}</div>
        <div class="naver-result-desc">${escapeHtml(item.description||'')}</div>
      </div>
    </div>`).join('');
  items.forEach((item, i) => {
    document.getElementById(`naverItem_${i}`)?.addEventListener('click', () => selectNaverBook(i, item));
  });
}

function selectNaverBook(idx, item) {
  naverSelectedBook = item;
  document.querySelectorAll('.naver-result-item').forEach(el => el.classList.remove('selected'));
  document.getElementById(`naverItem_${idx}`)?.classList.add('selected');
  document.getElementById('addTitle').value  = stripHtmlTags(item.title  || '');
  document.getElementById('addAuthor').value = stripHtmlTags(item.author || '');
  document.getElementById('addSyn').value    = stripHtmlTags(item.description || '');
  document.getElementById('titleFilledBadge').style.display  = item.title       ? '' : 'none';
  document.getElementById('authorFilledBadge').style.display = item.author      ? '' : 'none';
  document.getElementById('synFilledBadge').style.display    = item.description ? '' : 'none';
  if (item.coverUrl) {
    addCoverBase64 = item.coverUrl;
    const img = document.getElementById('coverPreviewImg');
    img.src = item.coverUrl; img.style.display = '';
    document.getElementById('coverPreviewEmpty').style.display = 'none';
    document.getElementById('coverClearBtn').style.display     = '';
    document.getElementById('coverAutoBadge').style.display    = '';
  }
  showToast('메타정보를 불러왔어요 ✓');
}

/* ═══════════════════════════════════════════════
   프로필 렌더링
   ═══════════════════════════════════════════════ */
async function renderProfile() {
  if (!currentUser) return;
  const name = currentUser.displayName || currentUser.email.split('@')[0];
  document.getElementById('profileAvatar').textContent = getAvatar(name);
  document.getElementById('profileName').textContent   = name;
  document.getElementById('profileEmail').textContent  = currentUser.email;
  document.getElementById('profileRole').textContent   = isAdmin ? '관리자' : '독자';
  const plist   = getNovelsWithUserData();
  document.getElementById('pStatTotal').textContent   = plist.length;
  document.getElementById('pStatReading').textContent = plist.filter(n => n.progress > 0 && n.progress < 100).length;
  document.getElementById('pStatDone').textContent    = plist.filter(n => n.progress >= 100).length;
  document.getElementById('adminPanel').style.display = isAdmin ? 'block' : 'none';
  if (isAdmin) {
    await renderPendingList();
    await renderUserList();
  }
}

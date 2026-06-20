/* ══════════════════════════════════════════════
   NovelShelf v2.3.0  —  js/config.js
   Firebase 설정 및 앱 전역 상수
   ══════════════════════════════════════════════ */
'use strict';

/* ── Firebase 설정 ────────────────────────────
   Firebase 콘솔 → 프로젝트 설정 → 내 앱에서 복사
   ──────────────────────────────────────────── */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDhiJ80q4FtKUB5OLOoLpV4IYKrkU_cYTs",
  authDomain:        "novelshelf-a12bf.firebaseapp.com",
  projectId:         "novelshelf-a12bf",
  storageBucket:     "novelshelf-a12bf.firebasestorage.app",
  messagingSenderId: "403423678374",
  appId:             "1:403423678374:web:a3fadb7cbdfc7f763a8967",
};

/* ── Cloud Functions 리전 ─────────────────────
   배포 시 지정한 리전과 반드시 일치시킬 것
   Seoul: asia-northeast3 / 기본값: us-central1
   ──────────────────────────────────────────── */
const FUNCTIONS_REGION = 'asia-northeast3';

/* ── 앱 버전 ──────────────────────────────── */
const APP_VERSION = 'v2.3.0';

/* ── Firebase 초기화 ─────────────────────── */
firebase.initializeApp(FIREBASE_CONFIG);
const auth      = firebase.auth();
const db        = firebase.firestore();
const functions = firebase.app().functions(FUNCTIONS_REGION);

/* ── 앱 전역 상수 ────────────────────────── */
const GENRE_ICON = {
  romance:'💕', fantasy:'🔮', thriller:'🔪',
  sf:'🚀', historical:'📜', mystery:'🕵️', etc:'📖',
};
const GENRE_LABEL = {
  romance:'로맨스', fantasy:'판타지', thriller:'스릴러',
  sf:'SF', historical:'역사', mystery:'미스터리', etc:'기타',
};
const FONTS = {
  system: "-apple-system,'Apple SD Gothic Neo',sans-serif",
  gothic: "'Apple SD Gothic Neo','Noto Sans KR',sans-serif",
  serif:  "'Nanum Myeongjo','Georgia',serif",
  mono:   "'Courier New',monospace",
};
const THEMES = {
  light:  { bg:'#ffffff', ink:'#2A2A2A', bg2:'#F8F8FC' },
  sepia:  { bg:'#F4ECD8', ink:'#3D2B1A', bg2:'#EDE0C4' },
  dark:   { bg:'#1C1C28', ink:'#C8C8D8', bg2:'#252535' },
  amoled: { bg:'#000000', ink:'#E0E0E0', bg2:'#111111' },
};
const AVATARS = ['🐱','🐶','🐰','🐻','🦊','🐼','🐨','🐸','🐙','🦄','🐧','🦋','🐬','🦁','🐮','🐯'];

/* ── 앱 전역 상태 ────────────────────────── */
let novels        = [];      // Firestore 실시간 스냅샷
let userDataCache = {};      // { [novelId]: { progress, favorite, lastReadAt, ch } }
let currentUser   = null;    // Firebase auth user
let isAdmin       = false;
let _novelsUnsub  = null;    // Firestore 구독 해제 함수
let curId         = null;    // 현재 열린 소설 ID (novels.js, viewer.js 공유)
const _chsCache   = new Map(); // novelId → chapters[] (viewer.js 사용)

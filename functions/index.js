/* ══════════════════════════════════════════════
   Mr.woo — Cloud Functions
   배포: firebase deploy --only functions
   ══════════════════════════════════════════════ */
const functions = require('firebase-functions');
const admin     = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

/* ── 관리자 권한 확인 ── */
async function verifyAdmin(context) {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', '로그인이 필요해요');
  const snap = await db.collection('users').doc(context.auth.uid).get();
  if (!snap.exists || snap.data().role !== 'admin')
    throw new functions.https.HttpsError('permission-denied', '관리자 권한이 필요해요');
}

/* ── 사용자 생성 ── */
exports.createUser = functions.region('asia-northeast3').https.onCall(async (data, context) => {
  await verifyAdmin(context);
  const { name, email, password } = data;
  if (!name || !email || !password) throw new functions.https.HttpsError('invalid-argument', '모든 항목을 입력해주세요');

  // Firebase Auth 계정 생성
  const userRecord = await admin.auth().createUser({ email, password, displayName: name });

  // Firestore users 문서 생성
  await db.collection('users').doc(userRecord.uid).set({
    email,
    displayName:     name,
    role:            'reader',
    passwordChanged: false,  // 첫 로그인 시 비밀번호 변경 강제
    createdAt:       admin.firestore.FieldValue.serverTimestamp(),
  });

  return { uid: userRecord.uid };
});

/* ── 사용자 삭제 ── */
exports.deleteUser = functions.region('asia-northeast3').https.onCall(async (data, context) => {
  await verifyAdmin(context);
  const { uid } = data;
  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid가 필요해요');
  if (uid === context.auth.uid) throw new functions.https.HttpsError('failed-precondition', '본인 계정은 삭제할 수 없어요');

  await admin.auth().deleteUser(uid);
  await db.collection('users').doc(uid).delete();
  return { success: true };
});

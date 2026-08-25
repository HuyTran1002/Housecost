/**
 * MODULE XÁC THỰC & ĐỒNG BỘ CLOUD (FIREBASE AUTH & FIRESTORE)
 * -------------------------------------------------------------
 * Module này hoạt động hoàn toàn độc lập, cung cấp đầy đủ các hàm:
 * 1. Authenticate: registerWithEmail, loginWithEmail, getCurrentUser, logoutUser
 * 2. Cloud Backup & Restore: uploadLocalDataToCloud, downloadDataFromCloud
 * 3. Auto Restore flow: checkAndAutoRestoreOnLaunch (dùng khi vừa cài mới APK hoặc mở App)
 * 
 * Chú thích tiếng Việt chi tiết từng bước.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
  documentId,
} from 'firebase/firestore';
import {
  getTenantSyncData,
  getTenantDocId,
  applyTenantSyncData,
  getTenants,
  deleteTenant,
  getSettings,
  saveSettingsToStorage,
  clearAllLocalAppData,
  getPendingDeletions,
  addPendingDeletion,
  removePendingDeletion,
  clearPendingDeletions,
  addDeletedBillId,
  clearDeletedBillIds,
  removeDeletedBillId,
  getDeletionGracePeriodMs,
  getRestoredIds,
  purgeTenantHistory,
  purgeBillRecordFromLocal,
  type AppDataPackage,
} from '../utils/calculator';
import type { PendingDeletionRecord } from '../types/calculator';

// ==========================================
// CẤU HÌNH THỜI GIAN HẠN CHỜ XÓA (GRACE PERIOD)
// Được cấu hình động từ Cài Đặt (mặc định: 300s = 5 phút)
// ==========================================
export function getGracePeriodMs(): number {
  return getDeletionGracePeriodMs();
}

export function parseDeletedAt(deletedAt: any): number {
  if (!deletedAt) return Date.now();
  if (typeof deletedAt === 'number' && deletedAt > 0) return deletedAt;
  if (typeof deletedAt === 'string') {
    const num = Number(deletedAt);
    if (!isNaN(num) && num > 0) return num;
    const dateNum = new Date(deletedAt).getTime();
    if (!isNaN(dateNum) && dateNum > 0) return dateNum;
  }
  return Date.now();
}

// ==========================================
// CẤU HÌNH FIREBASE CHÍNH THỨC CỦA DỰ ÁN TINHTIENTRO
// (Lấy từ file .env local hoặc environment variables)
// ==========================================
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAPDqUNMVge4ofq_GT-k39iKHuZbut952g",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "tien-tro-4d4a3.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "tien-tro-4d4a3",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "tien-tro-4d4a3.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "832510360310",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:832510360310:web:d45742a17c4b581fd54ad7",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-W83LHSTBDH"
};

/**
 * Đọc cấu hình Firebase từ localStorage (nếu người dùng nhập riêng) hoặc dùng config mặc định
 */
export function getFirebaseConfig() {
  const custom = localStorage.getItem('housecost_firebase_config');
  if (custom) {
    try {
      return JSON.parse(custom);
    } catch (e) {
      console.error('Lỗi parse Firebase Config tùy chỉnh:', e);
    }
  }
  return DEFAULT_FIREBASE_CONFIG;
}

/**
 * Khởi tạo ứng dụng Firebase (Đảm bảo không khởi tạo lặp lại nhiều lần)
 */
function initFirebase() {
  const config = getFirebaseConfig();
  if (!getApps().length) {
    return initializeApp(config);
  } else {
    return getApp();
  }
}

// Khởi tạo các instance chính của Firebase
const app = initFirebase();
export const auth = getAuth(app);
export const db = getFirestore(app);

// Key lưu trữ vết khôi phục tự động ở địa phương
const AUTO_RESTORED_KEY = 'housecost_cloud_auto_restored_user';

// ==========================================
// SECTION 1: AUTHENTICATION (XÁC THỰC USER)
// ==========================================

/**
 * 1.1. Đăng ký tài khoản mới bằng Email & Mật khẩu
 * @param email Email của người dùng
 * @param password Mật khẩu (tối thiểu 6 ký tự)
 */
export async function registerWithEmail(email: string, password: string): Promise<{ success: boolean; user?: User; message: string }> {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    localStorage.setItem('housecost_user_email', userCredential.user.email || '');

    // Tự động gửi Email xác thực kích hoạt tài khoản
    try {
      await sendEmailVerification(userCredential.user);
    } catch (verErr) {
      console.error('Lỗi gửi email xác thực:', verErr);
    }

    return {
      success: true,
      user: userCredential.user,
      message: `🎉 Đăng ký thành công! 📩 Đã gửi link xác thực đến (${userCredential.user.email}). Vui lòng mở Gmail (kiểm tra cả mục "Thư rác" / Spam) bấm link xác thực để kích hoạt tài khoản.`,
    };
  } catch (error: any) {
    console.error('Lỗi đăng ký Firebase:', error);
    let errorMsg = 'Đăng ký thất bại!';
    if (error.code === 'auth/email-already-in-use') {
      errorMsg = 'Email này đã được đăng ký. Vui lòng chọn Đăng nhập!';
    } else if (error.code === 'auth/weak-password') {
      errorMsg = 'Mật khẩu quá yếu! Vui lòng nhập tối thiểu 6 ký tự.';
    } else if (error.code === 'auth/invalid-email') {
      errorMsg = 'Định dạng Email không hợp lệ!';
    } else {
      errorMsg = `Lỗi kết nối Firebase: ${error.message || error.code}`;
    }
    return { success: false, message: errorMsg };
  }
}

/**
 * 1.2. Đăng nhập tài khoản hiện có bằng Email & Mật khẩu
 * @param email Email đăng nhập
 * @param password Mật khẩu
 */
export async function loginWithEmail(email: string, password: string): Promise<{ success: boolean; user?: User; message: string }> {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
    localStorage.setItem('housecost_user_email', userCredential.user.email || '');
    return {
      success: true,
      user: userCredential.user,
      message: `🔑 Đăng nhập thành công với email (${userCredential.user.email})!`,
    };
  } catch (error: any) {
    console.error('Lỗi đăng nhập Firebase:', error);
    let errorMsg = 'Sai email hoặc mật khẩu!';
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      errorMsg = 'Email hoặc mật khẩu không chính xác!';
    } else if (error.code === 'auth/invalid-email') {
      errorMsg = 'Email không hợp lệ!';
    } else {
      errorMsg = `Lỗi đăng nhập: ${error.message || error.code}`;
    }
    return { success: false, message: errorMsg };
  }
}

/**
 * 1.3. Lấy thông tin User hiện đang đăng nhập (bao gồm trạng thái xác thực email)
 */
export function getCurrentUser(): User | null {
  return auth ? auth.currentUser : null;
}

/**
 * 1.5. Kiểm tra xem Email đã được xác thực hay chưa
 */
export async function checkIsEmailVerified(): Promise<{ verified: boolean; email: string | null }> {
  if (auth && auth.currentUser) {
    try {
      await auth.currentUser.reload();
    } catch (e) {
      console.error('Lỗi reload user status:', e);
    }
    return {
      verified: auth.currentUser.emailVerified,
      email: auth.currentUser.email,
    };
  }
  return { verified: false, email: null };
}

export async function sendVerificationEmail(): Promise<{ success: boolean; message: string }> {
  if (!auth || !auth.currentUser) return { success: false, message: 'Chưa đăng nhập!' };
  try {
    await sendEmailVerification(auth.currentUser);
    return {
      success: true,
      message: `📩 Đã gửi lại link xác thực đến ${auth.currentUser.email}. Vui lòng mở hòm thư Gmail bấm link xác thực!`,
    };
  } catch (error: any) {
    console.error('Lỗi gửi email xác thực:', error);
    return {
      success: false,
      message: `Gửi email xác thực thất bại: ${error.message || error.code}`,
    };
  }
}

/**
 * 1.6. Đăng xuất tài khoản & dọn sạch dữ liệu local để tránh rò rỉ sang tài khoản khác
 */
export async function logoutUser(): Promise<{ success: boolean; message: string }> {
  try {
    localStorage.removeItem('housecost_user_email');
    localStorage.removeItem(AUTO_RESTORED_KEY);
    clearAllLocalAppData();
    if (auth.currentUser) {
      await signOut(auth);
    }
    return { success: true, message: 'Đã đăng xuất tài khoản.' };
  } catch (error: any) {
    console.error('Lỗi đăng xuất:', error);
    return { success: false, message: 'Đã đăng xuất.' };
  }
}

// ==========================================
// SECTION 2: PER-TENANT CLOUD BACKUP & REALTIME SYNC
// ==========================================

function sanitizePayload<T>(payload: T): T {
  if (payload === undefined || payload === null) return payload;
  return JSON.parse(JSON.stringify(payload));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Hết thời gian kết nối Cloud (${Math.round(timeoutMs / 1000)}s). Kiểm tra lại kết nối mạng!`));
    }, timeoutMs);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * 2.0. ENGINES ĐỐI SOÁT & XÓA DỮ LIỆU THỪA TRÊN CLOUD NẾU KHÔNG KHỚP LOCAL SAU 5 PHÚT (HOẶC 24 GIỜ)
 */
export async function reconcileCloudWithLocal(): Promise<{ cleanedTenantsCount: number; cleanedBillsCount: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { cleanedTenantsCount: 0, cleanedBillsCount: 0 };
  }
  const user = getCurrentUser();
  if (!user) return { cleanedTenantsCount: 0, cleanedBillsCount: 0 };

  let cleanedTenantsCount = 0;
  let cleanedBillsCount = 0;

  try {
    const localTenants = getTenants();
    const localTenantIds = new Set(localTenants.map((t) => t.id));
    const localTenantNames = new Set(localTenants.map((t) => (t.name || '').trim().toLowerCase()));

    const pendingDeletions = getPendingDeletions();
    const pendingMap = new Map(pendingDeletions.map((p) => [p.id, p]));

    const now = Date.now();

    const colRef = collection(db, 'housecost_tenants');
    const docsMap = new Map<string, any>();

    try {
      const q = query(colRef, where('userId', '==', user.uid));
      const snap = await withTimeout(getDocs(q), 10000);
      snap.forEach((docSnap) => {
        docsMap.set(docSnap.id, docSnap.data());
      });
    } catch (e) {
      console.warn('Truy vấn userId trong reconcile thất bại:', e);
    }

    try {
      const qDocId = query(
        colRef,
        where(documentId(), '>=', `${user.uid}_`),
        where(documentId(), '<=', `${user.uid}_\uf8ff`)
      );
      const snapDocId = await withTimeout(getDocs(qDocId), 10000);
      snapDocId.forEach((docSnap) => {
        if (!docSnap.id.endsWith('_settings')) {
          docsMap.set(docSnap.id, docSnap.data());
        }
      });
    } catch (e) {
      console.warn('Truy vấn documentId range reconcile thất bại:', e);
    }

    for (const [docId, data] of docsMap.entries()) {
      if (!data || !data.tenant) continue;

      const tenantId = data.tenant.id;
      const tenantName = (data.tenant.name || '').trim().toLowerCase();
      const existsLocally = localTenantIds.has(tenantId) || localTenantNames.has(tenantName);

      const graceMs = getGracePeriodMs();

      const isPhantomTenant = tenantName === 'khách thuê' || tenantName === 'khach thue' || docId.endsWith('_Khach_Thue') || tenantId.startsWith('tenant_rec_single_');

      // 1. Kiểm tra đối soát Xóa Khách Thuê (Tenant deletion)
      // CHỈ xử lý xóa nếu mốc xóa type === 'tenant' đã thực sự được người dùng bấm Xóa Hồ Sơ
      if (!existsLocally) {
        if (isPhantomTenant) {
          try {
            await withTimeout(deleteDoc(doc(db, 'housecost_tenants', docId)), 10000);
            cleanedTenantsCount++;
            console.log(`[Reconcile] Đã tự động dọn dẹp Document ma trên Cloud: (${docId}).`);
          } catch (delErr) {
            console.error(`Lỗi dọn doc ma ${docId} trên Firestore:`, delErr);
          }
          continue;
        }

        let pending = pendingMap.get(tenantId);
        if (!pending) {
          pending = pendingDeletions.find((p) => p.type === 'tenant' && (p.id === tenantId || p.tenantName?.trim().toLowerCase() === tenantName));
        }

        if (pending && pending.type === 'tenant') {
          const dTime = parseDeletedAt(pending.deletedAt);
          const elapsed = dTime > 0 ? now - dTime : graceMs + 1;
          if (elapsed >= graceMs) {
            // Đã hết hạn -> Xóa vĩnh viễn document này khỏi Cloud Firestore
            try {
              await withTimeout(deleteDoc(doc(db, 'housecost_tenants', docId)), 10000);
              cleanedTenantsCount++;
              removePendingDeletion(pending.id);
              purgeTenantHistory(pending.tenantName, pending.docId || docId, pending.id);
              console.log(`[Reconcile] Đã xóa vĩnh viễn trên Cloud tenant: ${data.tenant.name} (${docId}).`);
            } catch (delErr) {
              console.error(`Lỗi xóa doc ${docId} trên Firestore:`, delErr);
            }
            continue; // Document này đã bị xóa vĩnh viễn khỏi Cloud
          }
          // Còn trong hạn chờ -> KHÔNG nạp lại vào local (vẫn đang chờ xóa)
        } else {
          // Kiểm tra thêm: Nếu Cloud document chính nó có pendingDeletions type=tenant -> ĐỪNG nạp lại
          const cloudDocPending: any[] = data.pendingDeletions || [];
          const cloudHasTenantPending = cloudDocPending.some(
            (cp: any) => cp.type === 'tenant' && (cp.id === tenantId || cp.tenantName?.trim().toLowerCase() === tenantName)
          );
          if (!cloudHasTenantPending) {
            // Không có vết xóa nào -> Nạp lại khách vào local (máy này chưa từng có hồ sơ này)
            applyTenantSyncData(data as any, false);
          }
          // Nếu cloudHasTenantPending = true -> Bỏ qua, không tạo lại "Khách thuê" thừa
        }
      }

      // 2. Kiểm tra đối soát Xóa Hóa Đơn (Bill deletions) áp dụng cho TẤT CẢ các document trên Cloud
      let docModified = false;
      let combinedHistory = data.combinedHistory || [];
      let singleHistory = data.singleHistory || [];

      const initialCombinedLen = combinedHistory.length;
      const initialSingleLen = singleHistory.length;

      // Tập hợp các ID đang thực sự bị xóa ở local (chưa bị bấm Khôi Phục)
      const localPendingList = getPendingDeletions();
      const cloudPendingList: PendingDeletionRecord[] = data.pendingDeletions || [];

      const pMap = new Map<string, PendingDeletionRecord>();
      cloudPendingList.forEach((p) => { if (p.id) pMap.set(p.id, p); });
      localPendingList.forEach((p) => { if (p.id) pMap.set(p.id, p); });

      // Chỉ giữ lại mốc xóa nếu chưa quá hạn chờ và local vẫn còn lưu mốc xóa này
      const activePendingDeletions: PendingDeletionRecord[] = Array.from(pMap.values()).filter((p: any) => {
        if (!p.id) return false;

        const dTime = parseDeletedAt(p.deletedAt);
        const elapsed = Math.max(0, now - dTime);
        // 1. Quá hạn chờ -> TIÊU HỦY VĨNH VIỄN mốc xóa này khỏi Cloud & Local!
        if (elapsed >= graceMs) {
          cleanedBillsCount++;
          if (p.type === 'tenant') {
            purgeTenantHistory(p.tenantName, p.docId, p.id);
          } else if (p.type === 'combinedBill' || p.type === 'singleBill') {
            purgeBillRecordFromLocal(p.id);
          }
          removePendingDeletion(p.id);
          removeDeletedBillId(p.id);
          return false;
        }

        return true;
      });

      const pendingTenantNames = new Set(
        activePendingDeletions
          .filter((p: any) => p.type === 'tenant')
          .map((p: any) => (p.tenantName || '').trim().toLowerCase())
          .filter(Boolean)
      );
      const pendingRooms = new Set<string>();
      activePendingDeletions.forEach((p: any) => {
        if (p.type === 'tenant' && p.tenantData && Array.isArray(p.tenantData.rooms)) {
          p.tenantData.rooms.forEach((r: any) => {
            if (r.roomName) pendingRooms.add(r.roomName.trim().toLowerCase());
          });
        }
      });

      // Dọn dẹp combinedHistory đối với các hóa đơn đang bị xóa chờ
      combinedHistory = combinedHistory.filter((item: any) => {
        if (!item) return false;
        if (item.id) {
          const pending = activePendingDeletions.find((p) => p.id === item.id);
          if (pending) {
            const dTime = parseDeletedAt(pending.deletedAt);
            const cTime = item.createdAt ? new Date(item.createdAt).getTime() : 0;

            // Nếu hóa đơn mới được tính lại SAU thời điểm tạo vết xóa cũ -> Hóa đơn mới hợp lệ, HỦY MỐC XÓA CŨ!
            if (cTime > 0 && dTime > 0 && cTime > dTime) {
              removePendingDeletion(pending.id);
              removeDeletedBillId(pending.id);
              const pIdx = activePendingDeletions.findIndex((p) => p.id === item.id);
              if (pIdx >= 0) activePendingDeletions.splice(pIdx, 1);
              return true; // GIỮ LẠI HÓA ĐƠN MỚI TÍNH!
            }
            return false;
          }
        }

        const tName = (item.tenantName || '').trim().toLowerCase();
        if (tName && pendingTenantNames.has(tName)) return false;

        return true;
      });

      // Dọn dẹp singleHistory đối với các hóa đơn đang bị xóa chờ
      singleHistory = singleHistory.filter((item: any) => {
        if (!item) return false;
        if (item.id) {
          const pending = activePendingDeletions.find((p) => p.id === item.id);
          if (pending) {
            const dTime = parseDeletedAt(pending.deletedAt);
            const cTime = item.createdAt ? new Date(item.createdAt).getTime() : 0;

            // Nếu hóa đơn mới được tính lại SAU thời điểm tạo vết xóa cũ -> Hóa đơn mới hợp lệ, HỦY MỐC XÓA CŨ!
            if (cTime > 0 && dTime > 0 && cTime > dTime) {
              removePendingDeletion(pending.id);
              removeDeletedBillId(pending.id);
              const pIdx = activePendingDeletions.findIndex((p) => p.id === item.id);
              if (pIdx >= 0) activePendingDeletions.splice(pIdx, 1);
              return true; // GIỮ LẠI HÓA ĐƠN MỚI TÍNH!
            }
            return false;
          }
        }

        const rName = (item.input?.roomName || '').trim().toLowerCase();
        if (rName && pendingRooms.has(rName)) return false;

        return true;
      });

      // Bổ sung vết xóa khách thuê (nếu khách này đang trong hạn chờ xóa)
      if (!existsLocally) {
        const tenantPending = localPendingList.find((p) => p.type === 'tenant' && (p.id === tenantId || p.tenantName?.trim().toLowerCase() === tenantName));
        if (tenantPending && !activePendingDeletions.some((p) => p.id === tenantPending.id)) {
          activePendingDeletions.push(tenantPending);
        }
      }

      const cloudPendingIds = new Set((data.pendingDeletions || []).map((p: any) => p.id));
      const pendingChanged =
        activePendingDeletions.some((p) => !cloudPendingIds.has(p.id)) ||
        (data.pendingDeletions || []).length !== activePendingDeletions.length;

      if (
        combinedHistory.length !== initialCombinedLen ||
        singleHistory.length !== initialSingleLen ||
        pendingChanged
      ) {
        docModified = true;
      }

      if (docModified) {
        const updatedPayload = sanitizePayload({
          ...data,
          userId: user.uid,
          userEmail: user.email,
          combinedHistory,
          singleHistory,
          pendingDeletions: activePendingDeletions,
          updatedAt: new Date().toISOString(),
        });
        await withTimeout(setDoc(doc(db, 'housecost_tenants', docId), updatedPayload), 15000);
      }
    }

    // Chổi quét rác cuối cùng: Đảm bảo MỌI lệnh xóa (hồ sơ/hóa đơn) đã quá 5 phút đều bị dọn sạch khỏi bộ nhớ máy
    // (Bảo vệ trường hợp Cloud Document đã bị xóa bởi máy khác khiến vòng lặp ở trên bị bỏ qua)
    getPendingDeletions().forEach((p) => {
      const dTime = parseDeletedAt(p.deletedAt);
      if (dTime > 0 && now - dTime >= getGracePeriodMs()) {
        if (p.type === 'tenant') {
          purgeTenantHistory(p.tenantName, p.docId, p.id);
        } else if (p.type === 'combinedBill' || p.type === 'singleBill') {
          purgeBillRecordFromLocal(p.id);
        }
        removePendingDeletion(p.id);
        removeDeletedBillId(p.id);
      }
    });
  } catch (err) {
    console.error('Lỗi trong đối soát 5p/24h reconcileCloudWithLocal:', err);
  }

  return { cleanedTenantsCount, cleanedBillsCount };
}

let isSyncingPendingFlag = false;

export async function syncPendingDeletionsToCloud(): Promise<boolean> {
  if (isSyncingPendingFlag) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  const user = getCurrentUser();
  if (!user) return false;

  isSyncingPendingFlag = true;
  try {
    const colRef = collection(db, 'housecost_tenants');
    const q = query(colRef, where('userId', '==', user.uid));
    const snap = await withTimeout(getDocs(q), 10000).catch(() => null);

    if (!snap) return false;

    const localPendingList = getPendingDeletions();
    const restoredSet = new Set(getRestoredIds().map((r) => r.trim().toLowerCase()));
    const updatePromises: Promise<any>[] = [];

    for (const dSnap of snap.docs) {
      const dData = dSnap.data();
      if (!dData || !dData.tenant) continue;

      const tId = dData.tenant.id;
      const tDocId = dSnap.id;
      const tName = (dData.tenant.name || '').trim().toLowerCase();

      const cloudPending = dData.pendingDeletions || [];
      const pMap = new Map<string, any>();
      cloudPending.forEach((p: any) => {
        if (p.id) pMap.set(p.id, p);
      });

      localPendingList.forEach((p) => {
        const isMatch = p.id === tId || (p.docId && tDocId.includes(p.docId)) || (p.tenantName && p.tenantName.trim().toLowerCase() === tName);
        if (isMatch) {
          pMap.set(p.id, p);
        }
      });

      for (const [pId, pRecord] of Array.from(pMap.entries())) {
        const pIdLower = pId.trim().toLowerCase();
        const pDocLower = (pRecord.docId || '').trim().toLowerCase();
        if (restoredSet.has(pIdLower) || (pDocLower && restoredSet.has(pDocLower))) {
          pMap.delete(pId);
        }
      }

      const updatedPendingArray = Array.from(pMap.values());
      const currentCloudPendingArray = cloudPending;

      if (JSON.stringify(updatedPendingArray) !== JSON.stringify(currentCloudPendingArray)) {
        const cleanPayload = sanitizePayload({
          ...dData,
          userId: user.uid,
          userEmail: user.email,
          pendingDeletions: updatedPendingArray,
          updatedAt: new Date().toISOString(),
        });
        updatePromises.push(withTimeout(setDoc(doc(db, 'housecost_tenants', dSnap.id), cleanPayload), 10000));
      }
    }

    await Promise.all(updatePromises);
    return true;
  } catch (e) {
    console.error('Lỗi đẩy đồng bộ mốc xóa lên Cloud:', e);
    return false;
  } finally {
    isSyncingPendingFlag = false;
  }
}

export async function syncTenantToCloud(tenantId: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  const user = getCurrentUser();
  if (!user) {
    console.warn('[Sync Warning] Chưa đăng nhập Firebase User, không thể đồng bộ lên Cloud.');
    return false;
  }

  const tenantSyncData = getTenantSyncData(tenantId);
  if (!tenantSyncData) {
    // Nếu khách đã bị xóa ở local -> Đẩy đồng bộ mốc xóa (PendingDeletions) lên Cloud ngay lập tức!
    syncPendingDeletionsToCloud().catch(() => null);
    return false;
  }

  const cleanName = getTenantDocId(tenantSyncData.tenant);
  const tenantDocId = `${user.uid}_${cleanName}`;
  const tenantDocRef = doc(db, 'housecost_tenants', tenantDocId);

  try {
    let mergedSingleHistory = tenantSyncData.singleHistory || [];
    let mergedCombinedHistory = tenantSyncData.combinedHistory || [];
    let mergedPendingDeletions = tenantSyncData.pendingDeletions || [];

    const existingSnap = await withTimeout(getDoc(tenantDocRef), 8000).catch(() => null);
    if (existingSnap && existingSnap.exists()) {
      const cloudData = existingSnap.data();

      // Tập hợp danh sách ID hóa đơn đang CÓ HÓA ĐƠN HOẠT ĐỘNG VỪA ĐƯỢC TÍNH MỚI
      const activeBillIds = new Set<string>();
      (tenantSyncData.combinedHistory || []).forEach((c) => {
        if (c.id) activeBillIds.add(c.id);
        const cMonth = (c.monthYear || '').trim().toLowerCase();
        const cleanM = cMonth.replace(/[^a-z0-9]/g, '_');
        (c.roomItems || []).forEach((r) => {
          const rKey = (r.roomName || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_');
          activeBillIds.add(`single_${rKey}_${cleanM}`);
        });
      });
      (tenantSyncData.singleHistory || []).forEach((s) => {
        if (s.id) activeBillIds.add(s.id);
      });

      // Hợp nhất vết xóa chờ (pendingDeletions) giữa Cloud và Local (chỉ giữ vết xóa mà local thực sự còn lưu VÀ KHÔNG TRÙNG HÓA ĐƠN MỚI)
      const localPendingList = getPendingDeletions();
      const localPendingIds = new Set(localPendingList.map((p) => p.id));
      const cloudPending = cloudData.pendingDeletions || [];
      
      const pMap = new Map<string, any>();
      cloudPending.forEach((p: any) => pMap.set(p.id, p));
      localPendingList.forEach((p: any) => pMap.set(p.id, p));

      mergedPendingDeletions = Array.from(pMap.values()).filter((p: any) => p.id && localPendingIds.has(p.id) && !activeBillIds.has(p.id));

      // Hợp nhất Combined History (Bảo toàn dữ liệu trên Cloud trong suốt 5 phút hạn chờ)
      const cloudCombined = cloudData.combinedHistory || [];
      const combinedMap = new Map<string, any>();
      cloudCombined.forEach((item: any) => {
        if (item.id) combinedMap.set(item.id, item);
      });
      (tenantSyncData.combinedHistory || []).forEach((item: any) => {
        if (item.id) combinedMap.set(item.id, item);
      });

      // Hợp nhất Single History (Bảo toàn dữ liệu trên Cloud trong suốt 5 phút hạn chờ)
      const cloudSingle = cloudData.singleHistory || [];
      const singleMap = new Map<string, any>();
      cloudSingle.forEach((item: any) => {
        if (item.id) singleMap.set(item.id, item);
      });
      (tenantSyncData.singleHistory || []).forEach((item: any) => {
        if (item.id) singleMap.set(item.id, item);
      });

      mergedCombinedHistory = Array.from(combinedMap.values());
      mergedSingleHistory = Array.from(singleMap.values());
    }

    const cleanPayload = sanitizePayload({
      userId: user.uid,
      userEmail: user.email,
      tenantName: tenantSyncData.tenant.name,
      tenant: tenantSyncData.tenant,
      draftReadings: tenantSyncData.draftReadings || [],
      singleHistory: mergedSingleHistory,
      combinedHistory: mergedCombinedHistory,
      pendingDeletions: mergedPendingDeletions,
      updatedAt: new Date().toISOString(),
    });

    await withTimeout(setDoc(tenantDocRef, cleanPayload), 15000);
    return true;
  } catch (e: any) {
    console.error(`Lỗi đồng bộ khách ${cleanName} lên Cloud:`, e);
    return false;
  }
}

export async function deleteTenantFromCloud(tenantId: string): Promise<boolean> {
  const user = getCurrentUser();
  if (!user) return false;

  try {
    const pendingDeletions = getPendingDeletions();
    const pendingRecord = pendingDeletions.find(
      (p) => p.id === tenantId || (p.type === 'tenant' && (p.id === tenantId || p.docId === tenantId))
    );

    const colRef = collection(db, 'housecost_tenants');
    const q = query(colRef, where('userId', '==', user.uid));
    const snap = await withTimeout(getDocs(q), 10000).catch(() => null);

    if (snap) {
      for (const dSnap of snap.docs) {
        const dData = dSnap.data();
        if (dData && dData.tenant) {
          const tId = dData.tenant.id;
          const tName = (dData.tenant.name || '').trim().toLowerCase();
          const matchId = tId === tenantId || (pendingRecord && pendingRecord.id === tId);
          const matchName = pendingRecord?.tenantName && pendingRecord.tenantName.trim().toLowerCase() === tName;

          if (matchId || matchName) {
            const cloudPending = dData.pendingDeletions || [];
            const pMap = new Map<string, any>();
            cloudPending.forEach((p: any) => pMap.set(p.id, p));

            const tombstone: PendingDeletionRecord = {
              id: tId,
              type: 'tenant',
              deletedAt: Date.now(),
              tenantName: dData.tenant.name,
              docId: dSnap.id,
            };
            pMap.set(tombstone.id, tombstone);

            const updatedPayload = sanitizePayload({
              ...dData,
              userId: user.uid,
              userEmail: user.email,
              pendingDeletions: Array.from(pMap.values()),
              updatedAt: new Date().toISOString(),
            });

            await withTimeout(setDoc(doc(db, 'housecost_tenants', dSnap.id), updatedPayload), 15000);
          }
        }
      }
    }
  } catch (err) {
    console.error('Lỗi đẩy mốc xóa khách thuê lên Cloud:', err);
  }

  await reconcileCloudWithLocal();
  return true;
}

export async function syncSettingsToCloud(settings?: any): Promise<boolean> {
  const user = getCurrentUser();
  if (!user) return false;
  const currentSettings = settings || getSettings();
  try {
    const settingsDocRef = doc(db, 'housecost_tenants', `${user.uid}_settings`);
    const cleanPayload = sanitizePayload({
      userId: user.uid,
      userEmail: user.email,
      settings: currentSettings,
      updatedAt: new Date().toISOString(),
    });
    await withTimeout(setDoc(settingsDocRef, cleanPayload), 15000);
    return true;
  } catch (e) {
    console.error('Lỗi lưu đơn giá lên Cloud:', e);
    return false;
  }
}

export async function uploadLocalDataToCloud(): Promise<{ success: boolean; message: string; updatedAt?: string }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, message: '⚠️ Thiết bị đang ngoại tuyến (Mất mạng kết nối).' };
  }
  const user = getCurrentUser();
  if (!user) {
    return { success: false, message: '⚠️ Bạn cần Đăng Nhập trước khi tải dữ liệu lên Cloud!' };
  }

  const nowIso = new Date().toISOString();
  isUploadingToCloud = true;

  try {
    // 1. Chạy đối soát dọn dẹp các mục thừa trên Cloud nếu đã hết thời gian hạn chờ (5p / 24h)
    const recon = await reconcileCloudWithLocal();

    // 2. Tải toàn bộ khách thuê hiện có (hoặc đang chờ xóa) ở local lên Cloud
    const tenants = getTenants();
    const tenantIds = new Set(tenants.map((t) => t.id));
    const pendingDeletions = getPendingDeletions();
    pendingDeletions.forEach((p) => {
      if (p.type === 'tenant' && p.id) {
        tenantIds.add(p.id);
      }
    });

    const results = await Promise.all(Array.from(tenantIds).map((id) => syncTenantToCloud(id)));
    const successCount = results.filter(Boolean).length;
    await syncSettingsToCloud();

    let extraMsg = '';
    if (recon.cleanedTenantsCount > 0 || recon.cleanedBillsCount > 0) {
      extraMsg = ` 🗑️ Đã xóa ${recon.cleanedTenantsCount} khách và ${recon.cleanedBillsCount} hóa đơn thừa trên Cloud do hết hạn chờ.`;
    }

    return {
      success: true,
      updatedAt: nowIso,
      message: `☁️ Đã sao lưu thành công ${successCount}/${tenants.length} file lên Cloud!${extraMsg}`,
    };
  } catch (error: any) {
    console.error('Lỗi tổng khi upload local -> cloud:', error);
    return { success: false, message: `⚠️ Lỗi sao lưu: ${error.message}` };
  } finally {
    isUploadingToCloud = false;
  }
}

export let isUploadingToCloud = false;
let isRestoringFromCloud = false;

/**
 * 2.5. downloadDataFromCloud()
 * Lấy dữ liệu tất cả các bản ghi người thuê từ Cloud theo userId đăng nhập,
 * và hợp nhất vào bộ nhớ máy. Khi thực hiện khôi phục thủ công (isManualUserAction = true), dọn sạch danh sách xóa chờ local.
 */
export async function downloadDataFromCloud(
  clearBeforeRestore: boolean = false,
  isManualUserAction: boolean = true
): Promise<{ success: boolean; message: string; restoredData?: AppDataPackage }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, message: '⚠️ Thiết bị đang ngoại tuyến (Mất mạng kết nối).' };
  }
  const user = getCurrentUser();
  if (!user) {
    return { success: false, message: '⚠️ Bạn cần Đăng Nhập trước khi khôi phục dữ liệu từ Cloud!' };
  }

  isRestoringFromCloud = true;

  try {
    // 0. Chạy đối soát tiêu hủy vĩnh viễn tất cả dữ liệu/hồ sơ đã quá hạn 5 phút trước khi nạp dữ liệu
    await reconcileCloudWithLocal().catch((e) => console.warn('Lỗi reconcile trước restore:', e));

    let count = 0;

    const colRef = collection(db, 'housecost_tenants');
    const docsMap = new Map<string, any>();

    // 1. Quét theo query userId == user.uid
    try {
      const q = query(colRef, where('userId', '==', user.uid));
      const snap = await withTimeout(getDocs(q), 10000);
      snap.forEach((docSnap) => {
        docsMap.set(docSnap.id, docSnap.data());
      });
    } catch (e) {
      console.warn('Truy vấn userId thất bại:', e);
    }

    // 2. Quét theo prefix documentId (bắt đầu bằng user.uid_)
    try {
      const qDocId = query(
        colRef,
        where(documentId(), '>=', `${user.uid}_`),
        where(documentId(), '<=', `${user.uid}_\uf8ff`)
      );
      const snapDocId = await withTimeout(getDocs(qDocId), 10000);
      snapDocId.forEach((docSnap) => {
        if (!docSnap.id.endsWith('_settings')) {
          docsMap.set(docSnap.id, docSnap.data());
        }
      });
    } catch (e) {
      console.warn('Truy vấn documentId prefix thất bại:', e);
    }

    // 3. Quét trực tiếp các document theo danh sách mốc xóa ngầm local (pendingDeletions) để không bỏ sót các khách đã bị xóa (như Mai)
    const localPendingForRestore = getPendingDeletions();
    for (const p of localPendingForRestore) {
      let rawDocId = p.docId;
      if (!rawDocId && p.tenantName) {
        const cleanName = p.tenantName
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9_\-]/g, '_')
          .replace(/_+/g, '_');
        rawDocId = cleanName;
      }
      if (rawDocId) {
        const fullDocId = rawDocId.startsWith(`${user.uid}_`) ? rawDocId : `${user.uid}_${rawDocId}`;
        if (!docsMap.has(fullDocId)) {
          try {
            const dSnap = await withTimeout(getDoc(doc(db, 'housecost_tenants', fullDocId)), 5000);
            if (dSnap && dSnap.exists()) {
              docsMap.set(dSnap.id, dSnap.data());
            }
          } catch (e) {}
        }
      }
    }

    // 3. Quét thêm từ danh sách khách thuê local phòng trường hợp mạng mobile bị chậm
    const localTenantsForRestore = getTenants();
    for (const t of localTenantsForRestore) {
      const dId = `${user.uid}_${getTenantDocId(t)}`;
      if (!docsMap.has(dId)) {
        try {
          const dSnap = await withTimeout(getDoc(doc(db, 'housecost_tenants', dId)), 5000);
          if (dSnap && dSnap.exists()) {
            docsMap.set(dSnap.id, dSnap.data());
          }
        } catch (e) {}
      }
    }

    // Cảnh báo an toàn: Nếu không tìm thấy dữ liệu nào trên Cloud (hoặc mạng bị ngắt/lỗi), KHÔNG ĐƯỢC XÓA dữ liệu local hiện tại!
    if (docsMap.size === 0) {
      return {
        success: false,
        message: '⚠️ Không kết nối được với Cloud hoặc không tìm thấy dữ liệu sao lưu nào. Dữ liệu trên máy của bạn (bao gồm hàng chờ xóa) vẫn được giữ nguyên 100%!',
      };
    }

    // 3. Nếu khôi phục thủ công VÀ ĐÃ LẤY ĐƯỢC DỮ LIỆU CLOUD THÀNH CÔNG: Gỡ bỏ mảng pendingDeletions trên tất cả các Cloud document đồng loạt
    if (isManualUserAction) {
      clearPendingDeletions();
      clearDeletedBillIds();

      const updatePromises: Promise<any>[] = [];
      for (const [docId, data] of docsMap.entries()) {
        const originalPending = data.pendingDeletions || [];
        
        // Tự động khôi phục dữ liệu hóa đơn từ hàng chờ ngược trở lại lịch sử trước khi dọn sạch hàng chờ
        originalPending.forEach((pCloud: any) => {
          if (pCloud.type === 'combinedBill' && pCloud.billData) {
            if (!data.combinedHistory) data.combinedHistory = [];
            const exists = data.combinedHistory.some((c: any) => c.id === pCloud.billData.id);
            if (!exists) data.combinedHistory.unshift(pCloud.billData);
          }
          if (pCloud.type === 'singleBill' && pCloud.billData) {
            if (!data.singleHistory) data.singleHistory = [];
            const exists = data.singleHistory.some((s: any) => s.id === pCloud.billData.id);
            if (!exists) data.singleHistory.unshift(pCloud.billData);
          }
          if (pCloud.singleBillData && Array.isArray(pCloud.singleBillData)) {
            if (!data.singleHistory) data.singleHistory = [];
            pCloud.singleBillData.forEach((sData: any) => {
              const exists = data.singleHistory.some((s: any) => s.id === sData.id);
              if (!exists) data.singleHistory.unshift(sData);
            });
          }
        });

        data.pendingDeletions = [];
        const cleanPayload = sanitizePayload({
          ...data,
          userId: user.uid,
          userEmail: user.email,
          pendingDeletions: [],
          updatedAt: new Date().toISOString(),
        });
        updatePromises.push(
          withTimeout(setDoc(doc(db, 'housecost_tenants', docId), cleanPayload), 10000).catch((err) => {
            console.error(`Lỗi gỡ mốc xóa trên doc ${docId}:`, err);
            return null;
          })
        );
      }
      await Promise.all(updatePromises);
    }

    if (clearBeforeRestore) {
      clearAllLocalAppData();
    }

    // 4. Nạp dữ liệu hoàn toàn sạch vào local storage
    for (const data of docsMap.values()) {
      if (data && data.tenant) {
        data.pendingDeletions = [];
        applyTenantSyncData(data as any, isManualUserAction);
        count++;
      }
      if (data && data.settings) {
        saveSettingsToStorage(data.settings);
      }
    }

    localStorage.setItem(AUTO_RESTORED_KEY, user.uid);

    return {
      success: true,
      message: `🎉 Khôi phục thành công ${count} file người thuê từ Cloud Firebase!`,
    };
  } catch (error: any) {
    console.error('Lỗi tải dữ liệu từ Firestore:', error);
    return {
      success: false,
      message: `❌ Không thể tải dữ liệu từ Cloud: ${error.message || 'Kiểm tra lại kết nối Firebase'}`,
    };
  } finally {
    setTimeout(() => {
      isRestoringFromCloud = false;
    }, 2000);
  }
}

export function subscribeToRealtimeSync(onDataUpdated: () => void): () => void {
  let innerUnsubscribe: (() => void) | null = null;

  const authUnsubscribe = onAuthStateChanged(auth, (user) => {
    if (innerUnsubscribe) {
      innerUnsubscribe();
      innerUnsubscribe = null;
    }

    if (user) {
      const colRef = collection(db, 'housecost_tenants');
      const q = query(colRef, where('userId', '==', user.uid));

      // Đếm ngầm định kỳ mỗi 30s để tự động xóa đối soát khi app đang bật trên màn hình
      const intervalTimer = setInterval(() => {
        reconcileCloudWithLocal();
      }, 30000);

      innerUnsubscribe = onSnapshot(
        q,
        (snap) => {
          if (isRestoringFromCloud || isUploadingToCloud) return; // Nếu đang tải lên/Khôi Phục Từ Cloud, tạm bỏ qua snapshot Realtime
          let updated = false;

          snap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            if (data && data.tenant) {
              const tId = data.tenant.id;
              const tName = (data.tenant.name || '').trim().toLowerCase();

              const cloudPendingDeletions: any[] = data.pendingDeletions || [];

              // 1. Tự động nạp hợp nhất thẻ xóa từ Cloud vào Local (bảo toàn mốc thời gian xóa gốc)
              const cloudPendingIds = new Set(cloudPendingDeletions.map((p) => p.id));
              if (Array.isArray(cloudPendingDeletions) && cloudPendingDeletions.length > 0) {
                const restoredIds = new Set(getRestoredIds());

                cloudPendingDeletions.forEach((cp: any) => {
                  if (cp.id && cp.type) {
                    const cpIdLower = cp.id.trim().toLowerCase();
                    const isExplicitlyRestored = restoredIds.has(cp.id) || restoredIds.has(cpIdLower);

                    // Chỉ gỡ bỏ/chặn nạp lại nếu người dùng TRÊN MÁY NÀY vừa bấm nút Khôi Phục!
                    if (!isExplicitlyRestored) {
                      addDeletedBillId(cp.id);
                      const originalTime = parseDeletedAt(cp.deletedAt);
                      addPendingDeletion(cp.id, cp.type, cp.tenantName, cp.docId, originalTime, cp.tenantData, cp.billData, cp.singleBillData);
                    }
                  }
                });
              }

              // 2. Gỡ bỏ mốc xóa Local nếu Cloud đã Hoàn Tác (Cloud mới hơn và không còn chứa mốc xóa đó nữa)
              const cloudUpdatedAtTime = data.updatedAt ? new Date(data.updatedAt).getTime() : 0;
              if (cloudUpdatedAtTime > 0) {
                const localPendingList = getPendingDeletions();
                localPendingList.forEach((lp) => {
                  const belongsToThisDoc =
                    lp.id === tId ||
                    (lp.docId && docSnap.id.endsWith(`_${lp.docId}`)) ||
                    (lp.tenantName && lp.tenantName.trim().toLowerCase() === tName);
                  if (belongsToThisDoc) {
                    // Nếu Cloud mới hơn Local, VÀ Cloud KHÔNG CÓ mốc xóa này -> Nghĩa là thiết bị khác đã Hoàn tác!
                    if (cloudUpdatedAtTime > lp.deletedAt && !cloudPendingIds.has(lp.id)) {
                      removePendingDeletion(lp.id);
                      removeDeletedBillId(lp.id);
                    }
                  }
                });
              }

              const latestLocalPending = getPendingDeletions().filter((p) => p.type === 'tenant');
              const latestPendingTenantIds = new Set(latestLocalPending.map((p) => p.id));
              const latestPendingTenantNames = new Set(latestLocalPending.map((p) => (p.tenantName || '').trim().toLowerCase()));

              const isPendingDelete = latestPendingTenantIds.has(tId) || latestPendingTenantNames.has(tName);

              // Kiểm tra thêm: Nếu Cloud document chính nó có pendingDeletions type=tenant -> KHÔNG nạp lại (dù local pending có hay không)
              const cloudHasTenantTombstone = cloudPendingDeletions.some(
                (cp: any) => cp.type === 'tenant' && (cp.id === tId || (cp.tenantName || '').trim().toLowerCase() === tName)
              );

              if (isPendingDelete || cloudHasTenantTombstone) {
                // Khách này đang trong trạng thái chờ xóa -> CHỈ gỡ khỏi local nếu khách đó thực sự còn đang có trong danh sách local!
                const currentTenants = getTenants();
                const isCurrentlyActive = currentTenants.some((t) => t.id === tId || (t.name || '').trim().toLowerCase() === tName);
                if (isCurrentlyActive) {
                  deleteTenant(tId, false);
                  updated = true;
                }
              } else if (
                data.tenant.name &&
                !data.tenant.name.startsWith('tenant-') &&
                tName !== 'khách thuê' &&
                tName !== 'khach thue' &&
                !docSnap.id.endsWith('_Khach_Thue') &&
                !tId.startsWith('tenant_rec_single_')
              ) {
                // Guard an toàn: Chỉ nạp lại khách thuê nếu có tên hợp lệ (tránh tạo ra 'Khách thuê' ma)
                applyTenantSyncData(data as any, false);
                updated = true;
              }
            }
            if (data && data.settings) {
              saveSettingsToStorage(data.settings);
              updated = true;
            }
          });



          snap.docChanges().forEach((change) => {
            if (change.type === 'removed') {
              const data = change.doc.data();
              if (data && data.tenant && data.tenant.id) {
                const tId = data.tenant.id;
                const tName = data.tenant.name;
                const tDocId = change.doc.id;
                deleteTenant(tId, false);
                purgeTenantHistory(tName, tDocId, tId);
                updated = true;
              }
            }
          });

          if (updated) {
            onDataUpdated();
          }
        },
        (err) => {
          console.error('Lỗi lắng nghe Firestore realtime:', err);
        }
      );

      const oldUnsub = innerUnsubscribe;
      innerUnsubscribe = () => {
        clearInterval(intervalTimer);
        if (oldUnsub) oldUnsub();
      };
    }
  });

  return () => {
    authUnsubscribe();
    if (innerUnsubscribe) {
      innerUnsubscribe();
    }
  };
}


const LAST_24H_BACKUP_KEY = 'housecost_last_24h_auto_backup';

// ==========================================
// SECTION 3: LUỒNG XỬ LÝ KHỞI CHẠY (APP LAUNCH / CÀI ĐẠT LẠI APK)
// ==========================================

/**
 * 3.1. checkAndAutoRestoreOnLaunch()
 * Khi ứng dụng khởi chạy, tự động kiểm tra xem user hiện tại đã đăng nhập chưa và tự động khôi phục dữ liệu.
 */
export function checkAndAutoRestoreOnLaunch(onRestored: () => void): () => void {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (user) {
      const lastRestoredUser = localStorage.getItem(AUTO_RESTORED_KEY);
      const localTenants = localStorage.getItem('housecost_tenants');
      const isLocalDataEmpty = !localTenants || localTenants === '[]';
      const hasPendingDeletions = getPendingDeletions().length > 0;

      // Không bao giờ tự động đè/khôi phục khi máy đang có các mục xóa chờ trong hạn 5p/24h!
      if ((lastRestoredUser !== user.uid || isLocalDataEmpty) && !hasPendingDeletions) {
        const res = await downloadDataFromCloud(true, false);
        if (res.success) {
          onRestored();
        }
      }
      checkAndAutoBackup24h();
    }
  });

  return unsubscribe;
}

/**
 * 3.2. checkAndAutoBackup24h()
 * Tự động kiểm tra: Nếu User đã đăng nhập và đã trôi qua 24 tiếng kể từ lần sao lưu trước,
 * ứng dụng sẽ tự động lưu ngầm dữ liệu mới nhất lên Cloud Firestore.
 */
export async function checkAndAutoBackup24h(): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;

  const lastBackupStr = localStorage.getItem(LAST_24H_BACKUP_KEY);
  const now = Date.now();
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  if (!lastBackupStr || now - parseInt(lastBackupStr, 10) >= TWENTY_FOUR_HOURS_MS) {
    const res = await uploadLocalDataToCloud();
    if (res.success) {
      localStorage.setItem(LAST_24H_BACKUP_KEY, now.toString());
    }
  }
}

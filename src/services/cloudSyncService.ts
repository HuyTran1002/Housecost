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
  setDoc,
  getDoc,
} from 'firebase/firestore';
import { exportAllDataPackage, importAllDataPackage, type AppDataPackage } from '../utils/calculator';

// ==========================================
// CẤU HÌNH FIREBASE CHÍNH THỨC CỦA DỰ ÁN TINHTIENTRO
// (Lấy từ file .env local hoặc environment variables)
// ==========================================
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ""
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
export function getCurrentUser(): { uid: string; email: string | null; emailVerified: boolean } | null {
  if (auth.currentUser) {
    return {
      uid: auth.currentUser.uid,
      email: auth.currentUser.email,
      emailVerified: auth.currentUser.emailVerified,
    };
  }
  return null;
}

/**
 * 1.4. Gửi lại Email xác thực cho User hiện tại
 */
export async function sendVerificationEmail(): Promise<{ success: boolean; message: string }> {
  if (!auth.currentUser) return { success: false, message: 'Chưa đăng nhập!' };
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
 * 1.5. Kiểm tra xem Email đã được xác thực hay chưa (Tự động làm mới từ máy chủ Firebase)
 */
export async function checkIsEmailVerified(): Promise<{ verified: boolean; email: string | null }> {
  if (auth.currentUser) {
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

/**
 * 1.6. Đăng xuất tài khoản
 */
export async function logoutUser(): Promise<{ success: boolean; message: string }> {
  try {
    localStorage.removeItem('housecost_user_email');
    localStorage.removeItem(AUTO_RESTORED_KEY);
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
// SECTION 2: CLOUD BACKUP & RESTORE
// ==========================================

/**
 * 2.1. uploadLocalDataToCloud()
 * Lấy toàn bộ JSON dữ liệu tiền trọ từ LocalStorage, gắn thêm userId và updatedAt,
 * sau đó đẩy lên Cloud Database (Firebase Firestore collection: "housecost_backups").
 */
export async function uploadLocalDataToCloud(): Promise<{ success: boolean; message: string; updatedAt?: string }> {
  const user = getCurrentUser();
  if (!user) {
    return { success: false, message: '⚠️ Bạn cần Đăng Nhập trước khi tải dữ liệu lên Cloud!' };
  }

  const localPackage: AppDataPackage = exportAllDataPackage();
  const nowIso = new Date().toISOString();

  try {
    const cloudPayload = {
      userId: user.uid,
      userEmail: user.email,
      updatedAt: nowIso,
      updatedAtClient: Date.now(),
      data: localPackage,
    };

    const userDocRef = doc(db, 'housecost_backups', user.uid);
    await setDoc(userDocRef, cloudPayload, { merge: true });

    return {
      success: true,
      updatedAt: nowIso,
      message: `☁️ Đã đồng bộ thành công dữ liệu lên Cloud Firebase lúc ${new Date(nowIso).toLocaleTimeString('vi-VN')}!`,
    };
  } catch (error: any) {
    console.error('Lỗi đẩy dữ liệu lên Firestore:', error);
    return {
      success: false,
      message: `❌ Không thể tải dữ liệu lên Cloud: ${error.message || 'Lỗi kết nối Firebase'}`,
    };
  }
}

/**
 * 2.2. downloadDataFromCloud()
 * Lấy dữ liệu tiền trọ mới nhất từ Cloud theo userId đăng nhập,
 * sau đó ghi đè/cập nhật lại vào Local Storage để App hiển thị lại đúng các phòng/hóa đơn cũ.
 */
export async function downloadDataFromCloud(): Promise<{ success: boolean; message: string; restoredData?: AppDataPackage }> {
  const user = getCurrentUser();
  if (!user) {
    return { success: false, message: '⚠️ Bạn cần Đăng Nhập trước khi khôi phục dữ liệu từ Cloud!' };
  }

  try {
    const userDocRef = doc(db, 'housecost_backups', user.uid);
    const docSnap = await getDoc(userDocRef);

    if (!docSnap.exists()) {
      return {
        success: false,
        message: '⚠️ Chưa tìm thấy bản sao lưu nào của tài khoản này trên Cloud.',
      };
    }

    const cloudPayload = docSnap.data();
    if (!cloudPayload || !cloudPayload.data) {
      return {
        success: false,
        message: 'Dữ liệu trên Cloud bị trống hoặc không đúng định dạng!',
      };
    }

    const pkg: AppDataPackage = cloudPayload.data;
    const ok = importAllDataPackage(pkg);
    if (!ok) {
      return { success: false, message: 'Lỗi ghi dữ liệu khôi phục vào bộ nhớ ứng dụng!' };
    }

    localStorage.setItem(AUTO_RESTORED_KEY, user.uid);

    return {
      success: true,
      restoredData: pkg,
      message: `🎉 Khôi phục dữ liệu từ Cloud Firebase thành công! (Số khách thuê: ${pkg.tenants?.length || 0})`,
    };
  } catch (error: any) {
    console.error('Lỗi tải dữ liệu từ Firestore:', error);
    return {
      success: false,
      message: `❌ Không thể tải dữ liệu từ Cloud: ${error.message || 'Kiểm tra lại kết nối Firebase'}`,
    };
  }
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

      if (lastRestoredUser !== user.uid || isLocalDataEmpty) {
        const res = await downloadDataFromCloud();
        if (res.success) {
          onRestored();
        }
      }
      // Tự động kiểm tra sao lưu 24 tiếng sau khi khởi chạy
      checkAndAutoBackup24h();
    }
  });

  return unsubscribe;
}

/**
 * 3.2. checkAndAutoBackup24h()
 * Tự động kiểm tra: Nếu User đã đăng nhập và đã trôi qua 24 tiếng (86.400.000 ms) kể từ lần sao lưu tự động trước đó,
 * ứng dụng sẽ tự động tải ngầm toàn bộ dữ liệu tiền trọ mới nhất lên Cloud Firestore.
 */
export async function checkAndAutoBackup24h(): Promise<void> {
  const user = getCurrentUser();
  if (!user) return; // Nếu chưa đăng nhập thì bỏ qua

  const lastBackupStr = localStorage.getItem(LAST_24H_BACKUP_KEY);
  const now = Date.now();
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000; // 86.400.000 ms = 24 tiếng

  if (!lastBackupStr || now - parseInt(lastBackupStr, 10) >= TWENTY_FOUR_HOURS_MS) {
    console.log('⏳ Phát hiện quá 24h kể từ lần tự động sao lưu trước. Đang tự động lưu ngầm dữ liệu lên Cloud...');
    const res = await uploadLocalDataToCloud();
    if (res.success) {
      localStorage.setItem(LAST_24H_BACKUP_KEY, now.toString());
      console.log('✅ Tự động sao lưu 24h ngầm lên Cloud thành công!');
    }
  }
}

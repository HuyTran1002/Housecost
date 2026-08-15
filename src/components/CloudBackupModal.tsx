import React, { useState, useEffect, useRef } from 'react';
import { X, Cloud, CloudUpload, FileJson, CheckCircle2, ShieldCheck, Mail, LogOut, RefreshCw, Loader2, Lock, UserPlus, LogIn, AlertTriangle, Send } from 'lucide-react';
import { exportAllDataPackage, importAllDataPackage, type AppDataPackage } from '../utils/calculator';
import {
  auth,
  registerWithEmail,
  loginWithEmail,
  logoutUser,
  uploadLocalDataToCloud,
  downloadDataFromCloud,
  getCurrentUser,
  sendVerificationEmail,
  checkIsEmailVerified,
} from '../services/cloudSyncService';
import { onAuthStateChanged } from 'firebase/auth';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

interface CloudBackupModalProps {
  onClose: () => void;
  onDataRestored: () => void;
}

export const CloudBackupModal: React.FC<CloudBackupModalProps> = ({ onClose, onDataRestored }) => {
  const [currentUser, setCurrentUser] = useState<{ uid: string; email: string | null; emailVerified?: boolean } | null>(getCurrentUser());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Chế độ Auth: 'login' (Đăng nhập) hoặc 'register' (Đăng ký)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Theo dõi trạng thái đăng nhập & tự động kiểm tra xác thực email
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      setCurrentUser(getCurrentUser());
    });
    return () => unsubscribe();
  }, []);

  // Gửi lại email xác thực
  const handleSendVerificationEmail = async () => {
    try {
      setIsLoading(true);
      setStatusMsg({ type: 'info', text: '⏳ Đang gửi email xác thực đến hòm thư của bạn...' });
      const res = await sendVerificationEmail();
      if (res.success) {
        setStatusMsg({ type: 'success', text: res.message });
      } else {
        setStatusMsg({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'Không thể gửi email xác thực.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Kiểm tra lại trạng thái bấm link email xác thực
  const handleCheckVerification = async () => {
    try {
      setIsLoading(true);
      const res = await checkIsEmailVerified();
      setCurrentUser(getCurrentUser());
      if (res.verified) {
        setStatusMsg({ type: 'success', text: '🎉 Email của bạn ĐÃ ĐƯỢC XÁC THỰC thành công!' });
      } else {
        setStatusMsg({ type: 'error', text: '⚠️ Email vẫn CHƯA ĐƯỢC BẤM XÁC THỰC. Vui lòng mở Gmail kiểm tra link kích hoạt!' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // 1. Xử lý Đăng Ký Tài Khoản
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput) {
      setStatusMsg({ type: 'error', text: 'Vui lòng nhập đầy đủ Email và Mật khẩu!' });
      return;
    }
    try {
      setIsLoading(true);
      setStatusMsg({ type: 'info', text: '⏳ Đang khởi tạo tài khoản & gửi email xác thực...' });
      const res = await registerWithEmail(emailInput, passwordInput);
      if (res.success) {
        setStatusMsg({ type: 'success', text: res.message });
        setPasswordInput('');
        setCurrentUser(getCurrentUser());
      } else {
        setStatusMsg({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'Không thể kết nối máy chủ Cloud!' });
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Xử lý Đăng Nhập
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput) {
      setStatusMsg({ type: 'error', text: 'Vui lòng nhập đầy đủ Email và Mật khẩu!' });
      return;
    }
    try {
      setIsLoading(true);
      setStatusMsg({ type: 'info', text: '🔑 Đang xác thực tài khoản Cloud...' });
      const res = await loginWithEmail(emailInput, passwordInput);
      if (res.success) {
        setStatusMsg({ type: 'success', text: res.message });
        setPasswordInput('');
        setCurrentUser(getCurrentUser());

        // Kiểm tra xác thực email
        const verCheck = await checkIsEmailVerified();
        if (!verCheck.verified) {
          setStatusMsg({
            type: 'error',
            text: '⚠️ Email của bạn CHƯA ĐƯỢC XÁC THỰC. Vui lòng mở Gmail bấm link kích hoạt!',
          });
        } else {
          // Tự động khôi phục dữ liệu ngay khi vừa đăng nhập nếu máy chưa có dữ liệu local
          const localTenants = localStorage.getItem('housecost_tenants');
          if (!localTenants || localTenants === '[]') {
            setStatusMsg({ type: 'info', text: '🔄 Đang tự động tải dữ liệu phòng trọ từ Cloud...' });
            const restoreRes = await downloadDataFromCloud();
            if (restoreRes.success) {
              onDataRestored();
              setStatusMsg({ type: 'success', text: `🎉 Đã tự động khôi phục toàn bộ phòng/hóa đơn cũ từ Cloud!` });
            }
          }
        }
      } else {
        setStatusMsg({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'Đăng nhập thất bại. Kiểm tra lại thông tin!' });
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Xử lý Đăng Xuất
  const handleLogout = async () => {
    try {
      setIsLoading(true);
      const res = await logoutUser();
      if (res.success) {
        setStatusMsg({ type: 'info', text: res.message });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Đồng Bộ Lên Cloud (uploadLocalDataToCloud)
  const handleUploadToCloud = async () => {
    try {
      setIsLoading(true);

      // Bắt buộc xác thực email trước khi đồng bộ
      const verCheck = await checkIsEmailVerified();
      if (!verCheck.verified) {
        setStatusMsg({
          type: 'error',
          text: '⚠️ Email của bạn chưa bấm link xác thực trong Gmail. Vui lòng mở Gmail xác thực trước khi đồng bộ!',
        });
        return;
      }

      setStatusMsg({ type: 'info', text: '⏳ Đang sao lưu toàn bộ phòng trọ & hóa đơn lên Cloud...' });
      const res = await uploadLocalDataToCloud();
      if (res.success) {
        setStatusMsg({ type: 'success', text: res.message });
      } else {
        setStatusMsg({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'Không thể tải dữ liệu lên Cloud.' });
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Khôi Phục Từ Cloud (downloadDataFromCloud)
  const handleDownloadFromCloud = async () => {
    try {
      setIsLoading(true);

      // Bắt buộc xác thực email trước khi khôi phục
      const verCheck = await checkIsEmailVerified();
      if (!verCheck.verified) {
        setStatusMsg({
          type: 'error',
          text: '⚠️ Email của bạn chưa bấm link xác thực trong Gmail. Vui lòng mở Gmail xác thực trước khi khôi phục!',
        });
        return;
      }

      setStatusMsg({ type: 'info', text: '⏳ Đang lấy dữ liệu mới nhất từ Cloud...' });
      const res = await downloadDataFromCloud();
      if (res.success) {
        onDataRestored();
        setStatusMsg({ type: 'success', text: res.message });
      } else {
        setStatusMsg({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: 'Không thể khôi phục dữ liệu từ Cloud.' });
    } finally {
      setIsLoading(false);
    }
  };



  // 7. Xuất file dự phòng (.json) thủ công
  const handleExportJsonFile = async () => {
    try {
      const pkg = exportAllDataPackage();
      const jsonStr = JSON.stringify(pkg, null, 2);
      const dateClean = new Date().toISOString().split('T')[0];
      const fileName = `TinhTienTro_Backup_${dateClean}.json`;

      if (Capacitor.isNativePlatform()) {
        const base64Data = btoa(unescape(encodeURIComponent(jsonStr)));
        try {
          await Filesystem.writeFile({
            path: `Download/${fileName}`,
            data: base64Data,
            directory: Directory.ExternalStorage,
            recursive: true,
          });
          setStatusMsg({
            type: 'success',
            text: `📁 Đã lưu file vào thư mục "Tải về" (Download/${fileName}) của điện thoại!`,
          });
          return;
        } catch (e1) {
          await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Documents,
            recursive: true,
          });
          setStatusMsg({
            type: 'success',
            text: `📁 Đã lưu file vào thư mục "Tài liệu" (Documents/${fileName}) của điện thoại!`,
          });
          return;
        }
      }

      // Trình duyệt Web fallback
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      setStatusMsg({ type: 'success', text: `📁 Đã tải file sao lưu (${fileName}) về máy!` });
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Không thể xuất file sao lưu. Thử lại!' });
    }
  };

  // 8. Nhập file dự phòng (.json) từ máy
  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const pkg: AppDataPackage = JSON.parse(text);
        const ok = importAllDataPackage(pkg);
        if (ok) {
          onDataRestored();
          setStatusMsg({
            type: 'success',
            text: `🎉 Đã nạp dữ liệu thành công từ file ${file.name}!`,
          });
        } else {
          setStatusMsg({ type: 'error', text: 'Cấu trúc file backup không hợp lệ!' });
        }
      } catch (err) {
        setStatusMsg({ type: 'error', text: 'Không đọc được file JSON hợp lệ!' });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 350 }}>
      <div className="modal-content" style={{ overflowY: 'auto', maxHeight: '94%', maxWidth: '440px', width: '95%', padding: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cloud size={20} /> Xác Thực & Đồng Bộ Cloud
          </h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Thông báo trạng thái */}
        {statusMsg && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8rem',
              marginBottom: '12px',
              background:
                statusMsg.type === 'success'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : statusMsg.type === 'error'
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'rgba(59, 130, 246, 0.15)',
              border: `1px solid ${
                statusMsg.type === 'success'
                  ? 'rgba(16, 185, 129, 0.4)'
                  : statusMsg.type === 'error'
                  ? 'rgba(239, 68, 68, 0.4)'
                  : 'rgba(59, 130, 246, 0.4)'
              }`,
              color:
                statusMsg.type === 'success'
                  ? '#34d399'
                  : statusMsg.type === 'error'
                  ? '#f87171'
                  : '#60a5fa',
            }}
          >
            {statusMsg.text}
          </div>
        )}

        {/* THẺ TÀI KHOẢN & ĐỒNG BỘ CLOUD FIREBASE */}
        <div
          className="card"
          style={{
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(37, 99, 235, 0.12) 100%)',
            border: '1px solid rgba(59, 130, 246, 0.35)',
            padding: '12px',
            marginBottom: '12px',
          }}
        >
          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={16} color="#06b6d4" /> Máy Chủ Cloud Firebase
          </div>

          {currentUser ? (
            /* TRẠNG THÁI 1: ĐÃ ĐĂNG NHẬP */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: 'var(--radius-sm)' }}>
                <Mail size={18} color="#06b6d4" />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Tài khoản Cloud:</div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#38bdf8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentUser.email}
                  </div>
                </div>
                {currentUser.emailVerified ? (
                  <span style={{ fontSize: '0.7rem', color: '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(16,185,129,0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                    <CheckCircle2 size={13} color="#10b981" /> Đã xác thực
                  </span>
                ) : (
                  <span style={{ fontSize: '0.7rem', color: '#fbbf24', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(245,158,11,0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                    <AlertTriangle size={13} color="#f59e0b" /> Chưa xác thực
                  </span>
                )}
              </div>

              {/* BẢNG CẢNH BÁO NẾU CHƯA XÁC THỰC EMAIL */}
              {!currentUser.emailVerified && (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle size={14} color="#f59e0b" /> Email chưa kích hoạt link!
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    Vui lòng mở Gmail (<strong>{currentUser.email}</strong>) bấm vào link xác thực để kích hoạt tài khoản.<br />
                    <span style={{ color: '#fbbf24', fontSize: '0.7rem' }}>💡 <b>Lưu ý:</b> Hãy kiểm tra cả mục <b>"Thư rác" (Spam)</b> hoặc <b>"Quảng cáo"</b> nếu không thấy ở Hộp thư đến.</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ flex: 1, padding: '4px 8px', fontSize: '0.7rem', borderColor: 'rgba(245,158,11,0.5)', color: '#fbbf24' }}
                      onClick={handleSendVerificationEmail}
                      disabled={isLoading}
                    >
                      <Send size={11} /> Gửi lại link
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ flex: 1, padding: '4px 8px', fontSize: '0.7rem', borderColor: 'rgba(59,130,246,0.5)', color: '#60a5fa' }}
                      onClick={handleCheckVerification}
                      disabled={isLoading}
                    >
                      <RefreshCw size={11} /> Kiểm tra lại
                    </button>
                  </div>
                </div>
              )}

              {/* NÚT THAO TÁC ĐỒNG BỘ CLOUD */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ flex: 1, padding: '11px 8px', fontSize: '0.8rem', gap: '6px', fontWeight: 800, background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}
                  onClick={handleUploadToCloud}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 size={16} className="spin" /> : <CloudUpload size={16} />} ☁️ Đồng Bộ Lên Cloud
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: 1, padding: '11px 8px', fontSize: '0.8rem', gap: '6px', borderColor: 'rgba(6,182,212,0.4)', color: 'var(--accent-cyan)', fontWeight: 800 }}
                  onClick={handleDownloadFromCloud}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} 🔄 Khôi Phục Từ Cloud
                </button>
              </div>

              <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '0.73rem', color: '#34d399', textAlign: 'left', lineHeight: '1.4' }}>
                ✨ <b>Tự Động Khôi Phục:</b> Khi bạn xóa APK và cài lại, chỉ cần đăng nhập email <b>{currentUser.email}</b>, toàn bộ phòng trọ & hóa đơn sẽ tự động được tải lại ngay lập tức!
              </div>

              <button
                type="button"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  marginTop: '4px',
                }}
                onClick={handleLogout}
                disabled={isLoading}
              >
                <LogOut size={13} /> Đăng xuất tài khoản ({currentUser.email})
              </button>
            </div>
          ) : (
            /* TRẠNG THÁI 2: CHƯA ĐĂNG NHẬP (FORM ĐĂNG NHẬP / ĐĂNG KÝ) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* TAB CHỌN ĐĂNG NHẬP HAY ĐĂNG KÝ */}
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.25)', padding: '3px', borderRadius: 'var(--radius-sm)' }}>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    borderRadius: '4px',
                    border: 'none',
                    background: authMode === 'login' ? 'var(--accent-blue)' : 'transparent',
                    color: authMode === 'login' ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                  onClick={() => {
                    setAuthMode('login');
                    setStatusMsg(null);
                  }}
                >
                  <LogIn size={13} /> Đăng Nhập
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    borderRadius: '4px',
                    border: 'none',
                    background: authMode === 'register' ? 'var(--accent-cyan)' : 'transparent',
                    color: authMode === 'register' ? '#000' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                  }}
                  onClick={() => {
                    setAuthMode('register');
                    setStatusMsg(null);
                  }}
                >
                  <UserPlus size={13} /> Đăng Ký Mới
                </button>
              </div>

              {/* FORM NHẬP EMAIL VÀ PASSWORD */}
              <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Mail size={12} /> Email đăng nhập:
                  </label>
                  <input
                    type="email"
                    required
                    className="form-input"
                    placeholder="ví dụ: chutro@gmail.com"
                    style={{ fontSize: '0.82rem', padding: '8px 10px' }}
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Lock size={12} /> Mật khẩu:
                  </label>
                  <input
                    type="password"
                    required
                    className="form-input"
                    placeholder="Mật khẩu (tối thiểu 6 ký tự)"
                    style={{ fontSize: '0.82rem', padding: '8px 10px' }}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  style={{
                    padding: '11px',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    marginTop: '4px',
                    background: authMode === 'login' ? 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)' : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 size={16} className="spin" />
                  ) : authMode === 'login' ? (
                    <>🔑 Đăng Nhập Tài Khoản Cloud</>
                  ) : (
                    <>✨ Tạo Tài Khoản Cloud Mới</>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* THẺ XUẤT NẠP FILE (.JSON) DỰ PHÒNG THỦ CÔNG */}
        <div className="card" style={{ padding: '12px', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileJson size={16} color="#f59e0b" /> Sao Lưu Dự Phòng Thủ Công (File .json)
          </div>
          <p style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Xuất/Nạp file dữ liệu dự phòng trực tiếp trên bộ nhớ thiết bị.
          </p>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ flex: 1, padding: '8px 6px', fontSize: '0.76rem', gap: '4px', color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.4)' }}
              onClick={handleExportJsonFile}
            >
              <FileJson size={14} /> Xuất File Backup
            </button>

            <button
              type="button"
              className="btn-secondary"
              style={{ flex: 1, padding: '8px 6px', fontSize: '0.76rem', gap: '4px', color: '#a78bfa', borderColor: 'rgba(139, 92, 246, 0.4)' }}
              onClick={() => fileInputRef.current?.click()}
            >
              <RefreshCw size={14} /> Nạp Dữ Liệu Từ File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportJsonFile}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

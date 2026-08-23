import { useState, useEffect } from 'react';
import type { Settings, BillInput, CalculationResult, Tenant, CombinedBillRecord } from './types/calculator';
import { getSettings, saveSettingsToStorage, getTenants, getDraftReading, getDefaultBillingMonth } from './utils/calculator';
import { checkAndAutoRestoreOnLaunch, checkAndAutoBackup24h, subscribeToRealtimeSync, syncSettingsToCloud, reconcileCloudWithLocal } from './services/cloudSyncService';
import { MobileSimulator } from './components/MobileSimulator';
import { BillReceiptModal } from './components/BillReceiptModal';
import { SettingsModal } from './components/SettingsModal';
import { BillHistoryModal } from './components/BillHistoryModal';
import { CombinedBillModal } from './components/CombinedBillModal';
import { TenantManagerModal } from './components/TenantManagerModal';
import { TenantCalculatorWizard } from './components/TenantCalculatorWizard';
import { CloudBackupModal } from './components/CloudBackupModal';
import { Settings as SettingsIcon, History, Calculator, UserPlus, Home, ArrowRight, Sparkles, Cloud } from 'lucide-react';
import './index.css';

export function App() {
  const [settings, setSettings] = useState<Settings>(getSettings());
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [showTenantManager, setShowTenantManager] = useState<boolean>(false);
  const [showCloudBackup, setShowCloudBackup] = useState<boolean>(false);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  // Track if active receipt modal was opened from History modal
  const [openedFromHistory, setOpenedFromHistory] = useState<boolean>(false);

  const [activeReceipt, setActiveReceipt] = useState<{
    input: BillInput;
    result: CalculationResult;
  } | null>(null);

  const [activeCombinedReceipt, setActiveCombinedReceipt] = useState<{
    tenantName: string;
    monthYear: string;
    roomItems: { roomName: string; input: BillInput; result: CalculationResult }[];
  } | null>(null);

  // ĐĂNG KÝ LẮNG NGHE ĐỒNG BỘ CLOUD THỜI GIAN THỰC (REALTIME ONSNAPSHOT)
  useEffect(() => {
    const unsubscribeSync = subscribeToRealtimeSync(() => {
      const freshTenants = getTenants();
      setTenants(freshTenants);
      setSettings(getSettings());
      setSelectedTenant((prev) => {
        if (!prev) return null;
        const matching = freshTenants.find((t) => t.id === prev.id || (t.name && prev.name && t.name.trim().toLowerCase() === prev.name.trim().toLowerCase()));
        return matching || null;
      });
    });
    return () => {
      if (unsubscribeSync) unsubscribeSync();
    };
  }, []);

  // KIỂM TRA & TỰ ĐỘNG KHÔI PHỤC DỮ LIỆU TỪ CLOUD KHI ỨNG DỤNG KHỞI CHẠY (HOẶC VỪA CÀI LẠI APK)
  useEffect(() => {
    const unsubscribe = checkAndAutoRestoreOnLaunch(() => {
      const freshTenants = getTenants();
      setTenants(freshTenants);
      setSettings(getSettings());
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // TỰ ĐỘNG KIỂM TRA SAO LƯU 24H MỖI KHỞI CHẠY HOẶC MỞ LẠI APP TRÊN ĐIỆN THOẠI
  useEffect(() => {
    const handleMobileReSync = () => {
      checkAndAutoBackup24h();
    };
    // Đã mở app ban đầu -> check ngay
    checkAndAutoBackup24h();

    window.addEventListener('focus', handleMobileReSync);
    window.addEventListener('pageshow', handleMobileReSync);
    document.addEventListener('visibilitychange', handleMobileReSync);
    return () => {
      window.removeEventListener('focus', handleMobileReSync);
      window.removeEventListener('pageshow', handleMobileReSync);
      document.removeEventListener('visibilitychange', handleMobileReSync);
    };
  }, []);

  // TỰ ĐỘNG CHẠY ĐỐI SOÁT XÓA VĨNH VIỄN 5 PHÚT MỖI 30 GIÂY VỚI CLOUD FIRESTORE
  useEffect(() => {
    const runReconcile = async () => {
      const res = await reconcileCloudWithLocal();
      if (res && (res.cleanedTenantsCount > 0 || res.cleanedBillsCount > 0)) {
        const freshTenants = getTenants();
        setTenants(freshTenants);
        setSettings(getSettings());
        window.dispatchEvent(new Event('storage'));
      }
    };
    runReconcile();
    const interval = setInterval(runReconcile, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    saveSettingsToStorage(newSettings);
    syncSettingsToCloud(newSettings);
  };

  const handleSelectCombinedHistoryRecord = (record: CombinedBillRecord) => {
    setOpenedFromHistory(true);
    setActiveCombinedReceipt({
      tenantName: record.tenantName,
      monthYear: record.monthYear,
      roomItems: record.roomItems,
    });
    // Giữ nguyên showHistory = true để khi tắt bill chi tiết chủ nhà vẫn ở lại màn hình Lịch sử xem khách khác
  };

  return (
    <MobileSimulator>
      {/* App Mobile Header */}
      <header className="app-header">
        <div className="app-header-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calculator color="#3b82f6" size={20} />
          <span>Tính Tiền Trọ</span>
          <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(59,130,246,0.18)', color: '#60a5fa', fontWeight: 700 }}>v1.5</span>
        </div>
        <div className="app-header-actions">
          <button
            className="icon-btn"
            style={{ color: 'var(--accent-cyan)' }}
            onClick={() => setShowCloudBackup(true)}
            title="Sao lưu Google Cloud"
          >
            <Cloud size={16} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowHistory(true)}
            title="Lịch sử hóa đơn"
          >
            <History size={16} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowSettings(true)}
            title="Cài đặt đơn giá"
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-content">
        {selectedTenant ? (
          /* MÀN HÌNH TÍNH TIỀN THEO KHÁCH THUÊ (TUẦN TỰ 1 MÀN HÌNH ZERO-SCROLL) */
          <TenantCalculatorWizard
            key={selectedTenant.id}
            tenant={selectedTenant}
            settings={settings}
            onBack={() => setSelectedTenant(null)}
            onCompleteSingle={(input, result) => {
              setOpenedFromHistory(false);
              setActiveReceipt({ input, result });
            }}
            onCompleteCombined={(tenantName, monthYear, roomItems) => {
              setOpenedFromHistory(false);
              setActiveCombinedReceipt({ tenantName, monthYear, roomItems });
            }}
          />
        ) : (
          /* MÀN HÌNH UI ĐẦU: DANH SÁCH KHÁCH THUÊ ĐỂ CHỌN TÍNH TIỀN */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 4px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  👤 Chọn Khách Thuê
                </h2>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Nhấn vào tên khách để nhập số điện nước
                </p>
              </div>

              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '6px 10px', fontSize: '0.75rem', color: 'var(--accent-cyan)', borderColor: 'rgba(6,182,212,0.4)' }}
                onClick={() => setShowTenantManager(true)}
              >
                <UserPlus size={13} /> Đăng ký khách
              </button>
            </div>

            {/* Danh sách thẻ Khách Thuê */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {tenants.length === 0 ? (
                <div
                  className="card"
                  style={{
                    textAlign: 'center',
                    padding: '32px 16px',
                    background: 'rgba(22, 27, 34, 0.7)',
                    border: '1px dashed rgba(59, 130, 246, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '12px',
                  }}
                >
                  <UserPlus size={42} color="#3b82f6" style={{ opacity: 0.6 }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Chưa Có Khách Thuê Nào
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '260px' }}>
                    Ứng dụng của bạn đã sạch 100%. Bấm nút bên dưới để bắt đầu đăng ký khách thuê đầu tiên.
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '10px 18px', fontSize: '0.86rem', marginTop: '6px' }}
                    onClick={() => setShowTenantManager(true)}
                  >
                    <UserPlus size={16} /> + Đăng ký khách ngay
                  </button>
                </div>
              ) : (
                tenants.map((tenant) => {
                  const currentMonth = getDefaultBillingMonth(10);
                  const hasDraft = (tenant.rooms || []).some((r) => !!getDraftReading(r.roomName, currentMonth));
                  return (
                    <div
                      key={tenant.id}
                      className="card"
                      style={{
                        cursor: 'pointer',
                        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.12) 0%, rgba(6, 182, 212, 0.12) 100%)',
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                        padding: '12px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.2s ease',
                      }}
                      onClick={() => setSelectedTenant(tenant)}
                    >
                      <div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span>👤 Khách: {tenant.name}</span>
                          {tenant.rooms.length > 1 && (
                            <span className="card-badge badge-electric" style={{ fontSize: '0.65rem' }}>
                              Cộng gộp {tenant.rooms.length} phòng
                            </span>
                          )}
                          {hasDraft && (
                            <span
                              className="card-badge"
                              style={{
                                background: 'rgba(245, 158, 11, 0.2)',
                                color: '#fbbf24',
                                border: '1px solid rgba(245, 158, 11, 0.4)',
                                fontSize: '0.65rem',
                              }}
                            >
                              📝 Có số tạm
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)', marginTop: '3px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Home size={12} /> {tenant.rooms.map((r) => `${r.roomName}`).join(' & ')}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-blue)', fontWeight: 800, fontSize: '0.85rem' }}>
                        <span>Bắt đầu</span>
                        <ArrowRight size={16} />
                      </div>
                    </div>
                  );
                })
              )}

              {tenants.length > 0 && (
                <div style={{ padding: '10px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border-color)', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <Sparkles size={14} color="#f59e0b" style={{ display: 'inline', marginRight: '4px' }} />
                  Nhấn <strong>"+ Đăng ký khách"</strong> để thêm người thuê mới hoặc phòng mới.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="footer-note">
          ⚡ Điện: {settings.electricityRate.toLocaleString('vi-VN')}đ/ký | 💧 Nước ≤{settings.waterTier1Limit} khối: {settings.waterTier1Rate.toLocaleString('vi-VN')}đ
        </div>
      </main>

      {/* Modals */}
      {showTenantManager && (
        <TenantManagerModal
          onClose={() => setShowTenantManager(false)}
          onSelectTenantToCalculate={(tenant) => {
            setSelectedTenant(tenant);
            setShowTenantManager(false);
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showCloudBackup && (
        <CloudBackupModal
          onClose={() => setShowCloudBackup(false)}
          onDataRestored={() => {
            setTenants(getTenants());
            setSettings(getSettings());
          }}
        />
      )}

      {showHistory && (
        <BillHistoryModal
          onClose={() => setShowHistory(false)}
          onSelectCombinedRecord={handleSelectCombinedHistoryRecord}
        />
      )}

      {/* Bill Receipt Modals luôn được render sau cùng để hiển thị lên TRÊN CÙNG */}
      {activeCombinedReceipt && (
        <CombinedBillModal
          tenantName={activeCombinedReceipt.tenantName}
          monthYear={activeCombinedReceipt.monthYear}
          roomItems={activeCombinedReceipt.roomItems}
          onClose={() => {
            setActiveCombinedReceipt(null);
            if (!openedFromHistory) {
              setSelectedTenant(null);
            }
          }}
        />
      )}

      {activeReceipt && (
        <BillReceiptModal
          input={activeReceipt.input}
          result={activeReceipt.result}
          settings={settings}
          onClose={() => {
            setActiveReceipt(null);
            if (!openedFromHistory) {
              setSelectedTenant(null);
            }
          }}
        />
      )}
    </MobileSimulator>
  );
}

export default App;

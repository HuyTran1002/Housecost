import React, { useState, useEffect } from 'react';
import type { CombinedBillRecord } from '../types/calculator';
import { X, Trash2, Calendar, ArrowRight, History, Layers, Search } from 'lucide-react';
import { getCombinedBillHistory, deleteCombinedBillRecord, clearAllBillHistory, formatVND, getTenants } from '../utils/calculator';
import { syncTenantToCloud, reconcileCloudWithLocal, subscribeToRealtimeSync } from '../services/cloudSyncService';

interface BillHistoryModalProps {
  onClose: () => void;
  onSelectCombinedRecord?: (record: CombinedBillRecord) => void;
}

export const BillHistoryModal: React.FC<BillHistoryModalProps> = ({
  onClose,
  onSelectCombinedRecord,
}) => {
  const [combinedHistory, setCombinedHistory] = useState<CombinedBillRecord[]>([]);

  // Unique month options - Danh sách các tháng có trong lịch sử
  const uniqueMonths = Array.from(
    new Set(combinedHistory.map((r) => r.monthYear))
  ).filter(Boolean);

  // Search & Filter state - Mặc định ưu tiên chọn tháng vừa mới tính tiền gần nhất trong lịch sử
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('all');

  useEffect(() => {
    const refreshHistory = () => {
      setCombinedHistory(getCombinedBillHistory());
    };
    refreshHistory();

    const unsubscribeSync = subscribeToRealtimeSync(refreshHistory);
    window.addEventListener('storage', refreshHistory);
    return () => {
      if (unsubscribeSync) unsubscribeSync();
      window.removeEventListener('storage', refreshHistory);
    };
  }, []);

  const handleDeleteCombined = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Bạn có chắc muốn xóa hóa đơn này khỏi máy? (Lưu ý: Dữ liệu sẽ được tạm bảo lưu 5 phút trên Cloud trước khi xóa vĩnh viễn)')) {
      const targetRecord = combinedHistory.find((r) => r.id === id);
      const updated = deleteCombinedBillRecord(id);
      setCombinedHistory(updated);

      const months = Array.from(new Set(updated.map((r) => r.monthYear))).filter(Boolean);
      if (selectedMonthFilter !== 'all' && !months.includes(selectedMonthFilter)) {
        setSelectedMonthFilter('all');
      }

      // Đẩy mốc xóa ngầm lên Cloud ngay tức thì để thiết bị khác nhận biết lập tức
      const tenants = getTenants();
      const tenant = tenants.find(
        (t) => (t.name || '').trim().toLowerCase() === (targetRecord?.tenantName || '').trim().toLowerCase()
      );
      if (tenant) {
        syncTenantToCloud(tenant.id);
      } else {
        reconcileCloudWithLocal();
      }
    }
  };

  const handleClearAll = () => {
    if (confirm('⚠️ Bạn có chắc muốn XÓA LỊCH SỬ HÓA ĐƠN TRÊN MÁY NÀY? (Dữ liệu gốc trên Cloud vẫn được bảo toàn)')) {
      clearAllBillHistory();
      setCombinedHistory([]);
      setSelectedMonthFilter('all');
    }
  };

  const query = searchQuery.trim().toLowerCase();

  // Filter combined bills
  const filteredCombined = combinedHistory.filter((rec) => {
    const matchMonth = selectedMonthFilter === 'all' || rec.monthYear === selectedMonthFilter;
    if (!matchMonth) return false;

    if (!query) return true;

    const matchTenant = rec.tenantName.toLowerCase().includes(query);
    const matchRoom = rec.roomItems.some((item) => item.roomName.toLowerCase().includes(query));
    const matchMonthStr = rec.monthYear.toLowerCase().includes(query);

    return matchTenant || matchRoom || matchMonthStr;
  });

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '430px', maxHeight: '94%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexShrink: 0 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-purple)' }}>
            <History size={18} color="#8b5cf6" /> Lịch Sử Hóa Đơn ({filteredCombined.length})
          </h2>
          <button className="icon-btn" onClick={onClose} title="Đóng">
            <X size={16} />
          </button>
        </div>

        {/* Thanh Tìm kiếm & Lọc Theo Kỳ Tháng */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            marginBottom: '8px',
            background: 'rgba(0,0,0,0.3)',
            padding: '8px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            flexShrink: 0,
          }}
        >
          {/* Ô Tìm kiếm Tên phòng / Khách thuê */}
          <div className="input-wrapper">
            <Search className="input-icon" size={14} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '28px', fontSize: '0.8rem', height: '32px' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo Khách thuê hoặc Tên phòng (Phòng 1...)..."
            />
          </div>

          {/* Lọc Theo Tháng */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Calendar size={12} /> Kỳ tháng:
            </span>
            <select
              className="form-input"
              style={{ padding: '3px 6px', fontSize: '0.75rem', height: '28px', cursor: 'pointer', flex: 1, fontWeight: 700, color: 'var(--accent-cyan)' }}
              value={selectedMonthFilter}
              onChange={(e) => setSelectedMonthFilter(e.target.value)}
            >
              {uniqueMonths.map((m, idx) => (
                <option key={idx} value={m}>{m}</option>
              ))}
              <option value="all">-- Tất cả các tháng --</option>
            </select>
          </div>
        </div>

        {/* DANH SÁCH HÓA ĐƠN KHÁCH THUÊ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', flex: 1, paddingRight: '2px' }}>
          {filteredCombined.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--text-muted)' }}>
              <Layers size={36} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p style={{ fontSize: '0.82rem' }}>Không tìm thấy hóa đơn nào trong tháng này.</p>
            </div>
          ) : (
            filteredCombined.map((rec) => (
              <div
                key={rec.id}
                className="card"
                style={{
                  cursor: 'pointer',
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(16, 185, 129, 0.1) 100%)',
                  border: '1px solid rgba(139, 92, 246, 0.3)',
                  padding: '10px 12px',
                }}
                onClick={() => {
                  if (onSelectCombinedRecord) onSelectCombinedRecord(rec);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.85rem', color: 'var(--accent-purple)', fontWeight: 800 }}>
                      👤 KHÁCH: {rec.tenantName.toUpperCase()} • {rec.monthYear}
                    </span>
                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--accent-emerald)', marginTop: '2px' }}>
                      {formatVND(rec.grandTotal)}
                    </div>
                  </div>

                  <button
                    className="icon-btn"
                    style={{ color: 'var(--accent-rose)', border: 'none', background: 'transparent', width: '28px', height: '28px' }}
                    onClick={(e) => handleDeleteCombined(rec.id, e)}
                    title="Xóa bản ghi này"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Chi tiết chỉ số Điện Nước Cũ Mới của từng phòng */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid var(--border-color)' }}>
                  {rec.roomItems.map((item, idx) => (
                    <div key={idx} style={{ fontSize: '0.85rem', color: '#e2e8f0', background: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: '6px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--accent-cyan)', marginBottom: '3px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>🏠 {item.roomName}</span>
                        <span style={{ color: 'var(--accent-emerald)' }}>{formatVND(item.result.totalAmount)}</span>
                      </div>
                      <div>⚡ Điện ➔ Đã sử dụng <strong>{item.result.electricity.used} ký</strong> ({formatVND(item.result.electricity.cost)})</div>
                      <div>💧 Nước ➔ Đã sử dụng <strong>{item.result.water.totalUsed} khối</strong> ({formatVND(item.result.water.totalCost)})</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Calendar size={11} /> Ngày lập: {new Date(rec.createdAt).toLocaleDateString('vi-VN')}
                  </span>
                  <span style={{ color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 800 }}>
                    Xem Bill Chi Tiết <ArrowRight size={11} />
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Nút xóa toàn bộ lịch sử nhỏ gọn dưới đáy Modal (Cách xa dấu X) */}
        {combinedHistory.length > 0 && (
          <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', flexShrink: 0 }}>
            <button
              type="button"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '0.68rem',
                cursor: 'pointer',
                opacity: 0.6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
              onClick={handleClearAll}
              title="Xóa toàn bộ lịch sử hóa đơn cũ"
            >
              <Trash2 size={11} color="#f43f5e" /> Xóa tất cả lịch sử hóa đơn cũ
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

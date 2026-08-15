import React, { useState, useRef } from 'react';
import type { BillInput, CalculationResult } from '../types/calculator';
import { X, Home, Layers, Loader2, Download, Share2 } from 'lucide-react';
import { formatVND, formatNumber } from '../utils/calculator';
import { toPng } from 'html-to-image';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

interface CombinedBillModalProps {
  tenantName: string;
  monthYear: string;
  roomItems: {
    roomName: string;
    input: BillInput;
    result: CalculationResult;
  }[];
  onClose: () => void;
}

export const CombinedBillModal: React.FC<CombinedBillModalProps> = ({
  tenantName,
  monthYear,
  roomItems,
  onClose,
}) => {
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const grandTotal = roomItems.reduce((sum, r) => sum + r.result.totalAmount, 0);

  // LƯU HÓA ĐƠN CỘNG GỘP VÀO BỘ SỰ TẬP / THƯ VIỆN ĐIỆN THOẠI
  const handleSaveToGallery = async () => {
    if (!cardRef.current) return;
    try {
      setIsExporting(true);
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#161b22',
        style: {
          overflow: 'visible',
          maxHeight: 'none',
        },
      });

      const nameClean = tenantName.replace(/\s+/g, '_');
      const monthClean = monthYear.replace(/\s+/g, '_').replace(/\//g, '-');
      const fileName = `HoaDon_CongGop_${nameClean}_${monthClean}.png`;

      // 1. Native Capacitor Filesystem cho Android APK (Lưu thẳng vào Pictures/Gallery)
      if (Capacitor.isNativePlatform()) {
        try {
          const base64Data = dataUrl.split(',')[1];
          await Filesystem.writeFile({
            path: `Pictures/${fileName}`,
            data: base64Data,
            directory: Directory.ExternalStorage,
            recursive: true,
          });
          alert(`✅ Đã tự động lưu ảnh vào Thư viện / Bộ sưu tập ảnh của máy!`);
          return;
        } catch (nativeErr) {
          console.error('Lỗi Filesystem native:', nativeErr);
          try {
            const base64Data = dataUrl.split(',')[1];
            await Filesystem.writeFile({
              path: fileName,
              data: base64Data,
              directory: Directory.Documents,
              recursive: true,
            });
            alert(`✅ Đã lưu ảnh vào thư mục Tài liệu (Documents/${fileName})`);
            return;
          } catch (e2) {
            console.error('Fallback Filesystem error:', e2);
          }
        }
      }

      // 2. Web Browser fallback
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }, 1500);
      alert(`✅ Đã tải file ảnh hóa đơn về máy! (${fileName})`);
    } catch (err) {
      console.error('Lỗi lưu hình ảnh hóa đơn cộng gộp:', err);
      alert('Không thể lưu file ảnh. Vui lòng thử lại!');
    } finally {
      setIsExporting(false);
    }
  };

  // CHIA SẺ ẢNH HÓA ĐƠN CỘNG GỘP QUA NATIVE MENU ANDROID (ZALO, MESSENGER...)
  const handleShareImage = async () => {
    if (!cardRef.current) return;
    try {
      setIsSharing(true);
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#161b22',
        style: {
          overflow: 'visible',
          maxHeight: 'none',
        },
      });

      const nameClean = tenantName.replace(/\s+/g, '_');
      const monthClean = monthYear.replace(/\s+/g, '_').replace(/\//g, '-');
      const fileName = `HoaDon_CongGop_${nameClean}_${monthClean}.png`;

      // 1. Chạy trên điện thoại Android APK Native -> Mở thẳng Menu ứng dụng Native (Zalo, Messenger, WhatsApp...)
      if (Capacitor.isNativePlatform()) {
        const base64Data = dataUrl.split(',')[1];
        const savedFile = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache,
          recursive: true,
        });

        await Share.share({
          title: `Hóa đơn cộng gộp ${tenantName}`,
          text: `Hóa đơn tiền trọ cộng gộp ${tenantName} - ${monthYear}`,
          url: savedFile.uri,
          dialogTitle: 'Chia sẻ hóa đơn cộng gộp qua',
        });
        return;
      }

      // 2. Trình duyệt Web fallback
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Hóa đơn cộng gộp ${tenantName}`,
          text: `Hóa đơn tiền trọ cộng gộp ${tenantName} - ${monthYear}`,
        });
      } else {
        await handleSaveToGallery();
        alert('✅ Đã lưu ảnh Hóa đơn cộng gộp vào Thư viện ảnh của máy! Bạn có thể mở Zalo / Messenger và chọn ảnh vừa lưu để gửi cho khách.');
      }
    } catch (err) {
      console.error('Lỗi chia sẻ ảnh cộng gộp:', err);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }}>
      <div className="modal-content" style={{ overflow: 'hidden', maxWidth: '430px', maxHeight: '94%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexShrink: 0 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={18} /> Hóa Đơn Cộng Gộp ({roomItems.length} Phòng)
          </h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Khung cuộn hỗ trợ giao diện xem trên màn hình nhỏ */}
        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '2px', borderRadius: '16px' }}>
          {/* Thẻ Hóa đơn cộng gộp xuất ảnh PNG */}
          <div
            ref={cardRef}
            className="card"
            style={{
              background: 'linear-gradient(135deg, #1c152b 0%, #11202e 100%)',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              padding: '14px',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {/* Header tổng */}
            <div style={{ textAlign: 'center', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--accent-purple)', fontWeight: 800 }}>
                KHÁCH THUÊ: {tenantName.toUpperCase()} • {monthYear}
              </span>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--accent-emerald)', marginTop: '2px' }}>
                {formatVND(grandTotal)}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                (Đã cộng gộp {roomItems.length} phòng)
              </div>
            </div>

            {/* Danh sách từng phòng */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {roomItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    fontSize: '0.86rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Home size={14} color="#8b5cf6" /> {item.roomName}
                    </span>
                    <strong style={{ color: 'var(--accent-emerald)', fontSize: '0.95rem' }}>{formatVND(item.result.totalAmount)}</strong>
                  </div>

                  <div style={{ fontSize: '0.82rem', color: '#e2e8f0', display: 'flex', flexDirection: 'column', gap: '3px', paddingTop: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>🏠 Tiền phòng:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{formatVND(item.result.rentAmount)}</strong>
                    </div>

                    {/* Điện */}
                    <div style={{ paddingTop: '4px', borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
                      <div style={{ color: '#e2e8f0', fontSize: '0.82rem' }}>
                        ⚡ Điện: <strong>{formatNumber(item.input.electricityOld)}</strong> ➔ <strong>{formatNumber(item.input.electricityNew)}</strong> (Dùng <strong>{formatNumber(item.result.electricity.used)} ký</strong>)
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1px', paddingLeft: '14px' }}>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>↳ Thành tiền điện:</span>
                        <strong style={{ color: '#fbbf24', fontSize: '0.88rem' }}>{formatVND(item.result.electricity.cost)}</strong>
                      </div>
                    </div>

                    {/* Nước */}
                    <div style={{ paddingTop: '4px', borderTop: '1px dashed rgba(255,255,255,0.08)' }}>
                      <div style={{ color: '#e2e8f0', fontSize: '0.82rem' }}>
                        💧 Nước: <strong>{formatNumber(item.input.waterOld)}</strong> ➔ <strong>{formatNumber(item.input.waterNew)}</strong> (Dùng <strong>{formatNumber(item.result.water.totalUsed)} khối</strong>)
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1px', paddingLeft: '14px' }}>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>↳ Thành tiền nước:</span>
                        <strong style={{ color: '#38bdf8', fontSize: '0.88rem' }}>{formatVND(item.result.water.totalCost)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Nút hành động: 1. Lưu hình ảnh | 2. Chia sẻ ảnh qua Zalo / Messenger */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexShrink: 0 }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ flex: 1, padding: '10px 8px', background: 'rgba(139, 92, 246, 0.15)', borderColor: 'rgba(139, 92, 246, 0.4)', color: '#c084fc' }}
            onClick={handleSaveToGallery}
            disabled={isExporting || isSharing}
          >
            {isExporting ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
            {isExporting ? 'Đang lưu...' : 'Lưu hình ảnh'}
          </button>

          <button
            type="button"
            className="btn-primary"
            style={{ flex: 1.2, padding: '10px 8px', background: 'linear-gradient(135deg, #06b6d4 0%, #2563eb 100%)', fontSize: '0.82rem' }}
            onClick={handleShareImage}
            disabled={isExporting || isSharing}
          >
            {isSharing ? <Loader2 size={14} className="spin" /> : <Share2 size={14} />}
            {isSharing ? 'Đang mở...' : 'Chia sẻ ảnh (Zalo...)'}
          </button>
        </div>
      </div>
    </div>
  );
};

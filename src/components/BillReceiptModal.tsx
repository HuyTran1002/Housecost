import React, { useState, useRef } from 'react';
import type { BillInput, CalculationResult, Settings } from '../types/calculator';
import { X, Download, Share2, Zap, Droplets, Home, Loader2 } from 'lucide-react';
import { formatVND, formatNumber } from '../utils/calculator';
import { toPng } from 'html-to-image';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

interface BillReceiptModalProps {
  input: BillInput;
  result: CalculationResult;
  settings: Settings;
  onClose: () => void;
}

export const BillReceiptModal: React.FC<BillReceiptModalProps> = ({
  input,
  result,
  settings,
  onClose,
}) => {
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // LƯU ẢNH TRỰC TIẾP VÀO BỘ SỰ TẬP / THƯ VIỆN ĐIỆN THOẠI
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

      const roomClean = (input.roomName || 'HoaDon').replace(/\s+/g, '_');
      const monthClean = (input.monthYear || 'Thang').replace(/\s+/g, '_').replace(/\//g, '-');
      const fileName = `HoaDon_${roomClean}_${monthClean}.png`;

      // 1. Nếu đang chạy trên ứng dụng điện thoại (Capacitor Android APK) -> Lưu thẳng vào Thư viện ảnh (Pictures)
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
          console.error('Lỗi Filesystem ExternalStorage:', nativeErr);
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

      // 2. Trình duyệt máy tính / Web fallback
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
      console.error('Lỗi lưu hình ảnh hóa đơn:', err);
      alert('Không thể lưu file ảnh. Vui lòng thử lại!');
    } finally {
      setIsExporting(false);
    }
  };

  // CHIA SẺ ẢNH HÓA ĐƠN TRỰC TIẾP QUA NATIVE MENU ANDROID (ZALO, MESSENGER...)
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

      const roomClean = (input.roomName || 'HoaDon').replace(/\s+/g, '_');
      const monthClean = (input.monthYear || 'Thang').replace(/\s+/g, '_').replace(/\//g, '-');
      const fileName = `HoaDon_${roomClean}_${monthClean}.png`;

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
          title: `Hóa đơn ${input.roomName || ''}`,
          text: `Hóa đơn tiền trọ ${input.roomName || ''} - ${input.monthYear || ''}`,
          url: savedFile.uri,
          dialogTitle: 'Chia sẻ hóa đơn qua',
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
          title: `Hóa đơn ${input.roomName || ''}`,
          text: `Hóa đơn tiền trọ ${input.roomName || ''} - ${input.monthYear || ''}`,
        });
      } else {
        await handleSaveToGallery();
        alert('✅ Đã lưu ảnh Hóa đơn vào Thư viện ảnh của máy! Bạn có thể mở Zalo / Messenger và chọn ảnh vừa lưu để gửi cho khách.');
      }
    } catch (err) {
      console.error('Lỗi chia sẻ ảnh:', err);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }}>
      <div className="modal-content" style={{ overflowY: 'auto', maxHeight: '94%', width: '95%', maxWidth: '430px', padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
            🧾 Hóa Đơn Chi Tiết
          </h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Thẻ Hóa đơn xuất Ảnh PNG */}
        <div
          ref={cardRef}
          className="card"
          style={{
            background: 'linear-gradient(135deg, #13231f 0%, #11202e 100%)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            padding: '12px',
            borderRadius: '16px',
          }}
        >
          <div style={{ textAlign: 'center', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--accent-cyan)', fontWeight: 800 }}>
              {input.roomName ? `${input.roomName.toUpperCase()} • ` : ''}{input.monthYear}
            </span>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--accent-emerald)', marginTop: '2px' }}>
              {formatVND(result.totalAmount)}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', fontSize: '0.86rem' }}>
            {/* Tiền nhà */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                <Home size={14} color="#3b82f6" style={{ flexShrink: 0 }} /> Tiền thuê nhà:
              </span>
              <strong style={{ color: 'var(--text-primary)', flexShrink: 0 }}>{formatVND(result.rentAmount)}</strong>
            </div>

            {/* Tiền điện */}
            <div style={{ background: 'rgba(0,0,0,0.25)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Zap size={14} color="#f59e0b" style={{ flexShrink: 0 }} />
                <span>Điện: <strong>{formatNumber(input.electricityOld)}</strong> ➔ <strong>{formatNumber(input.electricityNew)}</strong> (Dùng <strong>{formatNumber(result.electricity.used)} ký</strong>)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px', paddingLeft: '18px' }}>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>↳ Thành tiền điện:</span>
                <strong style={{ color: '#fbbf24', fontSize: '0.92rem' }}>{formatVND(result.electricity.cost)}</strong>
              </div>
            </div>

            {/* Tiền nước */}
            <div style={{ background: 'rgba(0,0,0,0.25)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Droplets size={14} color="#06b6d4" style={{ flexShrink: 0 }} />
                <span>Nước: <strong>{formatNumber(input.waterOld)}</strong> ➔ <strong>{formatNumber(input.waterNew)}</strong> (Dùng <strong>{formatNumber(result.water.totalUsed)} khối</strong>)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px', paddingLeft: '18px' }}>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>↳ Thành tiền nước:</span>
                <strong style={{ color: '#38bdf8', fontSize: '0.92rem' }}>{formatVND(result.water.totalCost)}</strong>
              </div>
            </div>

            {result.water.totalUsed > 0 && (
              <div style={{ fontSize: '0.7rem', background: 'rgba(0,0,0,0.3)', padding: '5px 8px', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>
                • 5 khối đầu ({formatNumber(settings.waterTier1Rate)}đ): {formatVND(result.water.tier1Cost)}
                {result.water.tier2Used > 0 && (
                  <> | Còn lại {result.water.tier2Used} khối ({formatNumber(settings.waterTier2Rate)}đ): {formatVND(result.water.tier2Cost)}</>
                )}
              </div>
            )}

            {input.notes && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic', borderTop: '1px dashed var(--border-color)', paddingTop: '4px' }}>
                📝 Ghi chú: {input.notes}
              </div>
            )}
          </div>
        </div>

        {/* Nút hành động: 1. Lưu hình ảnh vào Bộ sưu tập | 2. Chia sẻ ảnh qua Zalo / Messenger */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ flex: 1, padding: '10px 8px', background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#34d399' }}
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

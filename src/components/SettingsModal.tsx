import React, { useState } from 'react';
import type { Settings } from '../types/calculator';
import { X, Save, RotateCcw, Zap, Droplets, Clock } from 'lucide-react';
import { DEFAULT_SETTINGS, formatVND, formatNumber, formatInputNumber, parseFormattedNumber, formatDurationSeconds } from '../utils/calculator';

interface SettingsModalProps {
  settings: Settings;
  onSave: (newSettings: Settings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ settings, onSave, onClose }) => {
  const [formData, setFormData] = useState<{ [K in keyof Settings]: string }>({
    electricityRate: settings.electricityRate ? formatNumber(settings.electricityRate) : '',
    waterTier1Limit: settings.waterTier1Limit ? formatNumber(settings.waterTier1Limit) : '',
    waterTier1Rate: settings.waterTier1Rate ? formatNumber(settings.waterTier1Rate) : '',
    waterTier2Rate: settings.waterTier2Rate ? formatNumber(settings.waterTier2Rate) : '',
    deletionGracePeriodSeconds: settings.deletionGracePeriodSeconds ? formatNumber(settings.deletionGracePeriodSeconds) : '300',
  });

  const handleChange = (field: keyof Settings, rawValue: string) => {
    const formatted = formatInputNumber(rawValue);
    setFormData((prev) => ({ ...prev, [field]: formatted }));
  };

  const handleReset = () => {
    setFormData({
      electricityRate: formatNumber(DEFAULT_SETTINGS.electricityRate),
      waterTier1Limit: formatNumber(DEFAULT_SETTINGS.waterTier1Limit),
      waterTier1Rate: formatNumber(DEFAULT_SETTINGS.waterTier1Rate),
      waterTier2Rate: formatNumber(DEFAULT_SETTINGS.waterTier2Rate),
      deletionGracePeriodSeconds: formatNumber(DEFAULT_SETTINGS.deletionGracePeriodSeconds || 300),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      electricityRate: parseFormattedNumber(formData.electricityRate || ''),
      waterTier1Limit: parseFormattedNumber(formData.waterTier1Limit || ''),
      waterTier1Rate: parseFormattedNumber(formData.waterTier1Rate || ''),
      waterTier2Rate: parseFormattedNumber(formData.waterTier2Rate || ''),
      deletionGracePeriodSeconds: parseFormattedNumber(formData.deletionGracePeriodSeconds || '') || 300,
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '430px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>⚙️ Cài đặt Đơn giá Điện Nước</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Đơn giá Điện */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Zap size={18} color="#f59e0b" /> Đơn giá Điện
              </span>
              <span className="card-badge badge-electric">1 Giá cố định</span>
            </div>
            <div className="form-group">
              <label className="form-label">Đơn giá điện (VNĐ / 1 ký)</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  style={{ textAlign: 'left' }}
                  value={formData.electricityRate}
                  onChange={(e) => handleChange('electricityRate', e.target.value)}
                  placeholder="3.000"
                />
                <span className="input-unit">đ/ký</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Mặc định: {formatVND(DEFAULT_SETTINGS.electricityRate)} / 1 ký điện
              </p>
            </div>
          </div>

          {/* Đơn giá Nước */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Droplets size={18} color="#06b6d4" /> Đơn giá Nước (2 Bậc)
              </span>
              <span className="card-badge badge-water">Tính theo khối</span>
            </div>

            <div className="form-group">
              <label className="form-label">Hạn mức Bậc 1 (Số khối đầu tiên)</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  style={{ textAlign: 'left' }}
                  value={formData.waterTier1Limit}
                  onChange={(e) => handleChange('waterTier1Limit', e.target.value)}
                  placeholder="5"
                />
                <span className="input-unit">khối</span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Đơn giá Bậc 1 (Tối đa {formData.waterTier1Limit || '5'} khối đầu)</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  style={{ textAlign: 'left' }}
                  value={formData.waterTier1Rate}
                  onChange={(e) => handleChange('waterTier1Rate', e.target.value)}
                  placeholder="11.000"
                />
                <span className="input-unit">đ/khối</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Mặc định: {formatVND(DEFAULT_SETTINGS.waterTier1Rate)} / khối
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Đơn giá Bậc 2 (Các khối tiếp theo {`>`} {formData.waterTier1Limit || '5'} khối)</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  style={{ textAlign: 'left' }}
                  value={formData.waterTier2Rate}
                  onChange={(e) => handleChange('waterTier2Rate', e.target.value)}
                  placeholder="14.000"
                />
                <span className="input-unit">đ/khối</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Mặc định: {formatVND(DEFAULT_SETTINGS.waterTier2Rate)} / khối
              </p>
            </div>
          </div>

          {/* Cấu hình Thời gian bảo lưu Hàng chờ xóa */}
          <div className="card" style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
            <div className="card-header">
              <span className="card-title" style={{ color: '#f59e0b', fontSize: '0.86rem' }}>
                <Clock size={16} color="#f59e0b" /> Thời gian Hàng chờ Xóa (Cloud Auto-Purge)
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Nhập thời gian đếm ngược (Đơn vị: GIÂY)</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  style={{ textAlign: 'left' }}
                  value={formData.deletionGracePeriodSeconds}
                  onChange={(e) => handleChange('deletionGracePeriodSeconds', e.target.value)}
                  placeholder="300"
                />
                <span className="input-unit">giây</span>
              </div>

              {/* Tự động hiển thị dạng giờ / phút / giây */}
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fbbf24', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                ⏱️ Tự động quy đổi: {formatDurationSeconds(parseFormattedNumber(formData.deletionGracePeriodSeconds || ''))}
              </div>

              {/* Nút bấm chọn nhanh Preset */}
              <div style={{ display: 'flex', gap: '5px', marginTop: '8px', flexWrap: 'wrap' }}>
                {[
                  { label: '⚡ 30s (Test nhanh)', val: 30 },
                  { label: '⏱️ 5 phút (300s)', val: 300 },
                  { label: '🕒 1 giờ (3600s)', val: 3600 },
                  { label: '📅 24 giờ (86400s)', val: 86400 },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      borderRadius: '4px',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      background: parseFormattedNumber(formData.deletionGracePeriodSeconds || '') === item.val ? '#f59e0b' : 'rgba(0,0,0,0.3)',
                      color: parseFormattedNumber(formData.deletionGracePeriodSeconds || '') === item.val ? '#000' : '#fbbf24',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleChange('deletionGracePeriodSeconds', item.val.toString())}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={handleReset}>
              <RotateCcw size={16} /> Mặc định
            </button>
            <button type="submit" className="btn-primary" style={{ flex: 2 }}>
              <Save size={16} /> Lưu Cài đặt
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import type { Settings } from '../types/calculator';
import { X, Save, RotateCcw, Zap, Droplets } from 'lucide-react';
import { DEFAULT_SETTINGS, formatVND, formatNumber, formatInputNumber, parseFormattedNumber } from '../utils/calculator';

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
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      electricityRate: parseFormattedNumber(formData.electricityRate),
      waterTier1Limit: parseFormattedNumber(formData.waterTier1Limit),
      waterTier1Rate: parseFormattedNumber(formData.waterTier1Rate),
      waterTier2Rate: parseFormattedNumber(formData.waterTier2Rate),
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

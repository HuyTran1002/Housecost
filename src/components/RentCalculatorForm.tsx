import React, { useState, useEffect } from 'react';
import type { BillInput, Settings } from '../types/calculator';
import { Home, Zap, Droplets, Calculator, FileText, Calendar, AlertCircle, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { calculateBill, formatVND, formatNumber, getPreviousReading, formatMonthDisplay } from '../utils/calculator';

interface RentCalculatorFormProps {
  settings: Settings;
  onCalculate: (input: BillInput) => void;
  initialInput?: BillInput;
  lastBillNewIndices?: { electricityNew: number; waterNew: number; rentAmount?: number };
}

export const RentCalculatorForm: React.FC<RentCalculatorFormProps> = ({
  settings,
  onCalculate,
  initialInput,
  lastBillNewIndices,
}) => {
  const currentMonthYear = `Tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}`;

  // Wizard Step state: 1 or 2
  const [step, setStep] = useState<1 | 2>(1);

  const [roomName, setRoomName] = useState<string>('Phòng 1');
  const [monthYear, setMonthYear] = useState<string>(currentMonthYear);
  const [rentAmount, setRentAmount] = useState<string>('3000000');

  const [electricityOld, setElectricityOld] = useState<string>('');
  const [electricityNew, setElectricityNew] = useState<string>('');

  const [waterOld, setWaterOld] = useState<string>('');
  const [waterNew, setWaterNew] = useState<string>('');

  const [notes, setNotes] = useState<string>('');

  // Update form fields when initialInput changes or roomName changes
  useEffect(() => {
    if (initialInput) {
      setRoomName(initialInput.roomName || 'Phòng 1');
      setMonthYear(initialInput.monthYear || currentMonthYear);
      setRentAmount(initialInput.rentAmount?.toString() || '3000000');
      setElectricityOld(initialInput.electricityOld ? initialInput.electricityOld.toString() : '');
      setElectricityNew(initialInput.electricityNew ? initialInput.electricityNew.toString() : '');
      setWaterOld(initialInput.waterOld ? initialInput.waterOld.toString() : '');
      setWaterNew(initialInput.waterNew ? initialInput.waterNew.toString() : '');
      setNotes(initialInput.notes || '');
    } else if (lastBillNewIndices) {
      if (lastBillNewIndices.electricityNew) {
        setElectricityOld(lastBillNewIndices.electricityNew.toString());
        setElectricityNew('');
      }
      if (lastBillNewIndices.waterNew) {
        setWaterOld(lastBillNewIndices.waterNew.toString());
        setWaterNew('');
      }
      if (lastBillNewIndices.rentAmount) {
        setRentAmount(lastBillNewIndices.rentAmount.toString());
      }
    } else {
      const prev = getPreviousReading(roomName);
      if (prev) {
        setElectricityOld(prev.electricityOld ? prev.electricityOld.toString() : '');
        setElectricityNew('');
        setWaterOld(prev.waterOld ? prev.waterOld.toString() : '');
        setWaterNew('');
      }
    }
  }, [initialInput, roomName]);

  const handleCleanInput = (setter: React.Dispatch<React.SetStateAction<string>>, rawValue: string) => {
    let clean = rawValue;
    if (clean.length > 1 && clean.startsWith('0')) {
      clean = clean.replace(/^0+/, '');
    }
    setter(clean);
  };

  // Convert inputs to numbers
  const numRent = parseInt(rentAmount, 10) || 0;
  const numElecOld = parseInt(electricityOld, 10) || 0;
  const numElecNew = parseInt(electricityNew, 10) || 0;
  const numWaterOld = parseInt(waterOld, 10) || 0;
  const numWaterNew = parseInt(waterNew, 10) || 0;

  // Validation
  const elecError = numElecNew > 0 && numElecNew < numElecOld ? 'Số mới < số cũ' : '';
  const waterError = numWaterNew > 0 && numWaterNew < numWaterOld ? 'Số mới < số cũ' : '';

  const liveInput: BillInput = {
    roomName,
    monthYear,
    rentAmount: numRent,
    electricityOld: numElecOld,
    electricityNew: numElecNew,
    waterOld: numWaterOld,
    waterNew: numWaterNew,
    notes,
  };

  const liveResult = calculateBill(liveInput, settings);

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) {
      alert('Vui lòng nhập tên phòng!');
      return;
    }
    setStep(2);
  };

  const handleFinalCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    if (elecError || waterError) {
      alert('Vui lòng kiểm tra lại chỉ số điện nước (Số mới không được nhỏ hơn số cũ)');
      return;
    }
    onCalculate(liveInput);
  };

  return (
    <div className="card shadow-lg" style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '12px' }}>
      {/* Wizard Progress Bar */}
      <div className="wizard-progress">
        <div
          className={`wizard-step-item ${step === 1 ? 'active' : 'completed'}`}
          onClick={() => setStep(1)}
        >
          <div className="step-badge">{step > 1 ? <CheckCircle2 size={13} /> : '1'}</div>
          <span>Tên Phòng & Tiền Thuê</span>
        </div>
        <div className="wizard-step-divider" />
        <div className={`wizard-step-item ${step === 2 ? 'active' : ''}`}>
          <div className="step-badge">2</div>
          <span>Chỉ Số Điện Nước</span>
        </div>
      </div>

      {/* BƯỚC 1: TÊN PHÒNG & TIỀN THUÊ NHÀ */}
      {step === 1 && (
        <form onSubmit={handleNextStep} className="step-content">
          <div className="input-grid-2">
            <div className="form-group">
              <label className="form-label">Tên Phòng / Căn Hộ</label>
              <div className="input-wrapper">
                <Home className="input-icon" size={16} />
                <input
                  type="text"
                  className="form-input"
                  style={{ textAlign: 'left' }}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Ví dụ: Phòng 101"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--accent-cyan)', textAlign: 'center', width: '100%', display: 'block' }}>📅 Kỳ Tính Tiền / Tháng (Lịch)</label>
              <div
                className="input-wrapper"
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '9px 12px',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', pointerEvents: 'none' }}>
                  <Calendar size={16} color="var(--accent-cyan)" />
                  <span style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                    {formatMonthDisplay(monthYear)}
                  </span>
                </div>
                <input
                  type="month"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer',
                    zIndex: 10,
                  }}
                  value={monthYear.startsWith('Tháng') ? new Date().toISOString().slice(0, 7) : monthYear}
                  onChange={(e) => setMonthYear(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch (err) {}
                  }}
                  required
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Home size={16} color="#3b82f6" /> Giá Thuê Phòng
              </span>
              <span className="card-badge badge-electric">Chi phí cố định</span>
            </div>

            <div className="form-group">
              <label className="form-label">Số tiền thuê nhà tháng này</label>
              <div className="input-wrapper">
                <span style={{ position: 'absolute', left: '10px', fontWeight: 800, color: 'var(--accent-emerald)' }}>₫</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  style={{ paddingLeft: '28px', fontSize: '1rem', fontWeight: 800, textAlign: 'left' }}
                  value={rentAmount}
                  onChange={(e) => handleCleanInput(setRentAmount, e.target.value)}
                  placeholder="Nhập tiền thuê nhà"
                  required
                />
                <span className="input-unit">VNĐ</span>
              </div>
              {numRent > 0 && (
                <div style={{ fontSize: '0.8rem', color: 'var(--accent-emerald)', marginTop: '4px', fontWeight: 700, textAlign: 'right' }}>
                  ➔ {formatVND(numRent)}
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border-color)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            💡 Nhấn <strong>"Tiếp tục"</strong> để nhập số điện & số nước mới/cũ.
          </div>

          <div className="wizard-bottom-actions">
            <button type="submit" className="btn-primary">
              Tiếp Tục Sang Số Điện Nước <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}

      {/* BƯỚC 2: NHẬP SỐ ĐIỆN & SỐ NƯỚC */}
      {step === 2 && (
        <form onSubmit={handleFinalCalculate} className="step-content">
          {/* Tóm tắt tiền nhà bước 1 */}
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.78rem',
              flexShrink: 0,
            }}
          >
            <span>
              🏠 <strong>{roomName || 'Phòng trọ'}</strong> ({monthYear})
            </span>
            <span style={{ fontWeight: 800, color: 'var(--accent-blue)' }}>
              {formatVND(numRent)}
            </span>
          </div>

          {/* Chỉ số Điện */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Zap size={16} color="#f59e0b" /> Số ĐIỆN ({formatNumber(settings.electricityRate)}đ/ký)
              </span>
            </div>

            <div className="input-grid-2">
              <div className="form-group">
                <label className="form-label">Số CŨ</label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="form-input"
                    style={{ paddingLeft: '10px', textAlign: 'left' }}
                    value={electricityOld}
                    onChange={(e) => handleCleanInput(setElectricityOld, e.target.value)}
                    placeholder="Nhập số cũ"
                    required
                  />
                  <span className="input-unit">ký</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Số MỚI</label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="form-input"
                    style={{ paddingLeft: '10px', textAlign: 'left' }}
                    value={electricityNew}
                    onChange={(e) => handleCleanInput(setElectricityNew, e.target.value)}
                    placeholder="Nhập số mới"
                    required
                  />
                  <span className="input-unit">ký</span>
                </div>
              </div>
            </div>

            {elecError ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-rose)', fontSize: '0.7rem', marginTop: '4px' }}>
                <AlertCircle size={12} /> {elecError}
              </div>
            ) : (
              <div className="usage-result">
                <span>Đã sử dụng: <strong className="usage-value">{formatNumber(liveResult.electricity.used)} ký</strong></span>
                <span className="cost-value">{formatVND(liveResult.electricity.cost)}</span>
              </div>
            )}
          </div>

          {/* Chỉ số Nước */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Droplets size={16} color="#06b6d4" /> Số NƯỚC (Bậc 1: {formatNumber(settings.waterTier1Rate)}đ | Bậc 2: {formatNumber(settings.waterTier2Rate)}đ)
              </span>
            </div>

            <div className="input-grid-2">
              <div className="form-group">
                <label className="form-label">Số CŨ</label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="form-input"
                    style={{ paddingLeft: '10px', textAlign: 'left' }}
                    value={waterOld}
                    onChange={(e) => handleCleanInput(setWaterOld, e.target.value)}
                    placeholder="Nhập số cũ"
                    required
                  />
                  <span className="input-unit">khối</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Số MỚI</label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="form-input"
                    style={{ paddingLeft: '10px', textAlign: 'left' }}
                    value={waterNew}
                    onChange={(e) => handleCleanInput(setWaterNew, e.target.value)}
                    placeholder="Nhập số mới"
                    required
                  />
                  <span className="input-unit">khối</span>
                </div>
              </div>
            </div>

            {waterError ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-rose)', fontSize: '0.7rem', marginTop: '4px' }}>
                <AlertCircle size={12} /> {waterError}
              </div>
            ) : (
              <div>
                <div className="usage-result">
                  <span>Đã sử dụng: <strong className="usage-value">{formatNumber(liveResult.water.totalUsed)} khối</strong></span>
                  <span className="cost-value">{formatVND(liveResult.water.totalCost)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Ghi chú thêm */}
          <div className="form-group">
            <label className="form-label">Ghi chú (Tùy chọn)</label>
            <div className="input-wrapper">
              <FileText className="input-icon" size={16} />
              <input
                type="text"
                className="form-input"
                style={{ textAlign: 'left' }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ví dụ: Đã trừ tiền cọc..."
              />
            </div>
          </div>

          {/* Thống kê Tổng tiền xem trước */}
          <div className="total-box shadow-glow">
            <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>TỔNG TIỀN THANH TOÁN:</span>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.5px' }}>
              {formatVND(liveResult.totalAmount)}
            </span>
          </div>

          <div className="wizard-bottom-actions">
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setStep(1)}>
              <ArrowLeft size={16} /> Quay Lại
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: 2 }}
              disabled={!!elecError || !!waterError}
            >
              <Calculator size={16} /> Xem Hóa Đơn & Xuất Ảnh
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

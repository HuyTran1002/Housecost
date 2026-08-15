import React, { useState } from 'react';
import type { Tenant, Settings, BillInput, CalculationResult } from '../types/calculator';
import { Home, Calculator, Calendar, ArrowRight, ArrowLeft, Zap, Droplets } from 'lucide-react';
import { calculateBill, formatVND, formatNumber, saveCombinedBillRecord, saveBillRecord, getPreviousReading, formatMonthDisplay, formatInputNumber, parseFormattedNumber, getDefaultBillingMonth } from '../utils/calculator';

interface TenantCalculatorWizardProps {
  tenant: Tenant;
  settings: Settings;
  onBack: () => void;
  onCompleteSingle: (input: BillInput, result: CalculationResult) => void;
  onCompleteCombined: (
    tenantName: string,
    monthYear: string,
    roomItems: { roomName: string; input: BillInput; result: CalculationResult }[]
  ) => void;
}

export const TenantCalculatorWizard: React.FC<TenantCalculatorWizardProps> = ({
  tenant,
  settings,
  onBack,
  onCompleteSingle,
  onCompleteCombined,
}) => {
  // Lấy kỳ tháng tính tiền mặc định theo ngày máy hệ thống thực tế (Tức thì 0ms)
  const currentDefaultMonth = getDefaultBillingMonth(10);

  // Nếu người dùng chủ động bấm chọn tháng khác trên lịch -> lưu vào overrideMonthYear
  const [overrideMonthYear, setOverrideMonthYear] = useState<string | null>(null);

  // Tháng sử dụng chính thức = Tháng người dùng chọn || Tháng tự động theo ngày hệ thống
  const monthYear = overrideMonthYear || currentDefaultMonth;

  const [currentRoomIndex, setCurrentRoomIndex] = useState<number>(0);

  // Store inputs for each room of this tenant (default to empty string '' if no history)
  const [roomInputs, setRoomInputs] = useState<
    {
      roomName: string;
      rentAmount: string;
      electricityOld: string;
      electricityNew: string;
      waterOld: string;
      waterNew: string;
      notes: string;
    }[]
  >(() => {
    return tenant.rooms.map((r) => {
      const prev = getPreviousReading(r.roomName, currentDefaultMonth);
      return {
        roomName: r.roomName,
        rentAmount: r.defaultRent ? r.defaultRent.toString() : '',
        electricityOld: prev && prev.electricityOld ? formatNumber(prev.electricityOld) : '',
        electricityNew: '',
        waterOld: prev && prev.waterOld ? formatNumber(prev.waterOld) : '',
        waterNew: '',
        notes: '',
      };
    });
  });

  // Tự động làm mới dữ liệu khi đổi khách thuê hoặc khi kỳ tháng thay đổi
  React.useEffect(() => {
    setOverrideMonthYear(null);
    setCurrentRoomIndex(0);
    setRoomInputs(
      tenant.rooms.map((r) => {
        const prev = getPreviousReading(r.roomName, currentDefaultMonth);
        return {
          roomName: r.roomName,
          rentAmount: r.defaultRent ? r.defaultRent.toString() : '',
          electricityOld: prev && prev.electricityOld ? formatNumber(prev.electricityOld) : '',
          electricityNew: '',
          waterOld: prev && prev.waterOld ? formatNumber(prev.waterOld) : '',
          waterNew: '',
          notes: '',
        };
      })
    );
  }, [tenant, currentDefaultMonth]);

  const activeRoom = roomInputs[currentRoomIndex];
  const totalRooms = roomInputs.length;

  const handleMonthYearChange = (newMonth: string) => {
    setOverrideMonthYear(newMonth);
    // Khi chọn kỳ tháng mới trên lịch, tự tra cứu lịch sử tháng trước của newMonth
    setRoomInputs((prevInputs) =>
      prevInputs.map((roomInput) => {
        const prev = getPreviousReading(roomInput.roomName, newMonth);
        return {
          ...roomInput,
          electricityOld: prev && prev.electricityOld ? formatNumber(prev.electricityOld) : '',
          electricityNew: '',
          waterOld: prev && prev.waterOld ? formatNumber(prev.waterOld) : '',
          waterNew: '',
        };
      })
    );
  };

  const handleInputChange = (field: string, rawValue: string) => {
    const formattedValue = formatInputNumber(rawValue);
    setRoomInputs((prev) =>
      prev.map((item, i) => (i === currentRoomIndex ? { ...item, [field]: formattedValue } : item))
    );
  };

  const numRent = parseFormattedNumber(activeRoom.rentAmount);
  const numElecOld = parseFormattedNumber(activeRoom.electricityOld);
  const numElecNew = parseFormattedNumber(activeRoom.electricityNew);
  const numWaterOld = parseFormattedNumber(activeRoom.waterOld);
  const numWaterNew = parseFormattedNumber(activeRoom.waterNew);

  const elecError = numElecNew > 0 && numElecNew < numElecOld ? 'Số mới < số cũ' : '';
  const waterError = numWaterNew > 0 && numWaterNew < numWaterOld ? 'Số mới < số cũ' : '';

  const activeInput: BillInput = {
    roomName: activeRoom.roomName,
    monthYear: formatMonthDisplay(monthYear),
    rentAmount: numRent,
    electricityOld: numElecOld,
    electricityNew: numElecNew,
    waterOld: numWaterOld,
    waterNew: numWaterNew,
    notes: activeRoom.notes,
  };

  const activeResult = calculateBill(activeInput, settings);

  const handleNextRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (elecError || waterError) return;
    if (currentRoomIndex < totalRooms - 1) {
      setCurrentRoomIndex(currentRoomIndex + 1);
    }
  };

  const handleFinishAllRooms = (e: React.FormEvent) => {
    e.preventDefault();
    if (elecError || waterError) return;

    const formattedMonthStr = formatMonthDisplay(monthYear);

    const roomItems = roomInputs.map((rInput) => {
      const inp: BillInput = {
        roomName: rInput.roomName,
        monthYear: formattedMonthStr,
        rentAmount: parseFormattedNumber(rInput.rentAmount),
        electricityOld: parseFormattedNumber(rInput.electricityOld),
        electricityNew: parseFormattedNumber(rInput.electricityNew),
        waterOld: parseFormattedNumber(rInput.waterOld),
        waterNew: parseFormattedNumber(rInput.waterNew),
        notes: rInput.notes,
      };
      const res = calculateBill(inp, settings);
      // Lưu bản ghi phòng đơn
      saveBillRecord(inp, res, settings);
      return {
        roomName: rInput.roomName,
        input: inp,
        result: res,
      };
    });

    // Bất kể khách có 1 phòng hay nhiều phòng, LUÔN LUÔN lưu vào Lịch Sử Khách Thuê (Combined History)
    saveCombinedBillRecord(tenant.name, formattedMonthStr, roomItems);

    if (totalRooms === 1) {
      onCompleteSingle(roomItems[0].input, roomItems[0].result);
    } else {
      onCompleteCombined(tenant.name, formattedMonthStr, roomItems);
    }
  };

  return (
    <div style={{ padding: '4px' }}>
      {/* Thanh tiến trình phòng */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
          background: 'var(--bg-card)',
          padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="icon-btn" onClick={onBack} title="Trở lại">
            <ArrowLeft size={16} />
          </button>
          <div>
            <span style={{ fontSize: '0.82rem', color: 'var(--accent-purple)', fontWeight: 800 }}>
              KHÁCH: {tenant.name.toUpperCase()}
            </span>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {activeRoom.roomName} ({currentRoomIndex + 1}/{totalRooms})
            </div>
          </div>
        </div>

        {totalRooms > 1 && (
          <div style={{ display: 'flex', gap: '4px' }}>
            {roomInputs.map((_, idx) => (
              <button
                key={idx}
                type="button"
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  border: 'none',
                  background: idx === currentRoomIndex ? 'var(--gradient-brand)' : 'rgba(255,255,255,0.1)',
                  color: idx === currentRoomIndex ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
                onClick={() => setCurrentRoomIndex(idx)}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={currentRoomIndex < totalRooms - 1 ? handleNextRoom : handleFinishAllRooms}
        style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
      >
        {/* Form nhập liệu của phòng hiện tại */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Kỳ tháng & Tiền nhà cố định */}
          <div className="card" style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="form-group" style={{ marginBottom: 0, textAlign: 'center' }}>
              <label className="form-label" style={{ justifyContent: 'center', textAlign: 'center', width: '100%', fontSize: '0.84rem', color: 'var(--accent-cyan)', fontWeight: 800 }}>
                📅 Kỳ tính tiền (Tháng/Năm)
              </label>
              <div
                className="input-wrapper"
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  const input = e.currentTarget.querySelector('input');
                  if (input) {
                    try {
                      input.showPicker?.();
                    } catch (err) {}
                  }
                }}
              >
                <Calendar className="input-icon" size={14} />
                <input
                  type="month"
                  className="form-input"
                  style={{
                    paddingLeft: '28px',
                    paddingRight: '12px',
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    textAlign: 'center',
                    cursor: 'pointer',
                    color: 'var(--accent-cyan)',
                  }}
                  value={monthYear}
                  onChange={(e) => handleMonthYearChange(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker?.();
                    } catch (err) {}
                  }}
                  required
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                🔒 Tiền nhà cố định
              </label>
              <div className="input-wrapper" title="Tiền thuê nhà cố định. Chỉnh sửa trong mục Đăng ký khách.">
                <Home className="input-icon" size={14} color="#3b82f6" />
                <input
                  type="text"
                  className="form-input"
                  style={{
                    paddingLeft: '28px',
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    textAlign: 'left',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--accent-emerald)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    cursor: 'not-allowed',
                  }}
                  value={activeRoom.rentAmount ? formatVND(parseInt(activeRoom.rentAmount, 10) || 0) : '0 đ'}
                  readOnly
                  tabIndex={-1}
                />
              </div>
            </div>
          </div>

          {/* Điện */}
          <div className="card" style={{ padding: '8px 10px' }}>
            <div className="card-header" style={{ marginBottom: '4px' }}>
              <span className="card-title" style={{ fontSize: '0.8rem' }}>
                <Zap size={14} color="#f59e0b" /> Số ĐIỆN ({formatNumber(settings.electricityRate)}đ)
              </span>
            </div>
            <div className="input-grid-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Số CŨ</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  style={{ paddingLeft: '8px', textAlign: 'left' }}
                  value={activeRoom.electricityOld}
                  onChange={(e) => handleInputChange('electricityOld', e.target.value)}
                  placeholder="Nhập số cũ"
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Số MỚI</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  style={{ paddingLeft: '8px', textAlign: 'left' }}
                  value={activeRoom.electricityNew}
                  onChange={(e) => handleInputChange('electricityNew', e.target.value)}
                  placeholder="Nhập số mới"
                  required
                />
              </div>
            </div>
            <div className="usage-result" style={{ marginTop: '4px' }}>
              <span>Đã sử dụng: <strong>{activeResult.electricity.used} ký</strong></span>
              <span className="cost-value">{formatVND(activeResult.electricity.cost)}</span>
            </div>
          </div>

          {/* Nước */}
          <div className="card" style={{ padding: '8px 10px' }}>
            <div className="card-header" style={{ marginBottom: '4px' }}>
              <span className="card-title" style={{ fontSize: '0.8rem' }}>
                <Droplets size={14} color="#06b6d4" /> Số NƯỚC (Bậc 1: {formatNumber(settings.waterTier1Rate)}đ)
              </span>
            </div>
            <div className="input-grid-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Số CŨ</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  style={{ paddingLeft: '8px', textAlign: 'left' }}
                  value={activeRoom.waterOld}
                  onChange={(e) => handleInputChange('waterOld', e.target.value)}
                  placeholder="Nhập số cũ"
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Số MỚI</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  style={{ paddingLeft: '8px', textAlign: 'left' }}
                  value={activeRoom.waterNew}
                  onChange={(e) => handleInputChange('waterNew', e.target.value)}
                  placeholder="Nhập số mới"
                  required
                />
              </div>
            </div>
            <div className="usage-result" style={{ marginTop: '4px' }}>
              <span>Đã sử dụng: <strong>{activeResult.water.totalUsed} khối</strong></span>
              <span className="cost-value">{formatVND(activeResult.water.totalCost)}</span>
            </div>
          </div>
        </div>

        {/* Nút hành động CỐ ĐỊNH Ở ĐÁY MÀN HÌNH */}
        <div
          style={{
            padding: '8px 10px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            marginTop: '4px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.88rem', color: '#e2e8f0', fontWeight: 700 }}>
              Thành tiền {activeRoom.roomName}:
            </span>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
              {formatVND(activeResult.totalAmount)}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {currentRoomIndex > 0 && (
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 1, padding: '8px' }}
                onClick={() => setCurrentRoomIndex(currentRoomIndex - 1)}
              >
                <ArrowLeft size={14} /> Phòng trước
              </button>
            )}

            {currentRoomIndex < totalRooms - 1 ? (
              <button type="submit" className="btn-primary" style={{ flex: 2, padding: '10px' }}>
                Phòng tiếp theo ({currentRoomIndex + 2}/{totalRooms}) <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="submit"
                className="btn-primary"
                style={{ flex: 2, padding: '10px', background: 'var(--gradient-brand)' }}
              >
                <Calculator size={16} /> HOÀN TẤT & XEM HÓA ĐƠN
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

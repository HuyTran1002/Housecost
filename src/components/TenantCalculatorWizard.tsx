import React, { useState, useEffect } from 'react';
import type { Tenant, Settings, BillInput, CalculationResult } from '../types/calculator';
import { Home, Calculator, Calendar, ArrowRight, ArrowLeft, Zap, Droplets, Clock, Trash2 } from 'lucide-react';
import {
  calculateBill,
  formatVND,
  formatNumber,
  saveCombinedBillRecord,
  saveBillRecord,
  getPreviousReading,
  getDraftReading,
  saveDraftReading,
  deleteDraftReading,
  formatMonthDisplay,
  formatInputNumber,
  parseFormattedNumber,
  getDefaultBillingMonth,
} from '../utils/calculator';
import { syncTenantToCloud } from '../services/cloudSyncService';

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
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Helper nạp dữ liệu khởi tạo của các phòng (Ưu tiên nạp từ số tạm draft nếu có)
  const createRoomInputs = (targetMonth: string) => {
    return tenant.rooms.map((r) => {
      const prev = getPreviousReading(r.roomName, targetMonth);
      const draft = getDraftReading(r.roomName, targetMonth);

      return {
        roomName: r.roomName,
        rentAmount: draft?.rentAmount !== undefined ? draft.rentAmount.toString() : (r.defaultRent ? r.defaultRent.toString() : ''),
        electricityOld: draft?.electricityOld !== undefined ? formatNumber(draft.electricityOld) : (prev && prev.electricityOld ? formatNumber(prev.electricityOld) : ''),
        electricityNew: draft?.electricityNew !== undefined && draft?.electricityNew > 0 ? formatNumber(draft.electricityNew) : '',
        waterOld: draft?.waterOld !== undefined ? formatNumber(draft.waterOld) : (prev && prev.waterOld ? formatNumber(prev.waterOld) : ''),
        waterNew: draft?.waterNew !== undefined && draft?.waterNew > 0 ? formatNumber(draft.waterNew) : '',
        notes: draft?.notes || '',
        updatedAt: draft?.updatedAt || null,
      };
    });
  };

  const [roomInputs, setRoomInputs] = useState(createRoomInputs(currentDefaultMonth));

  // Chỉ reset về tháng mặc định khi chuyển sang Khách Thuê khác (tenant.id đổi)
  useEffect(() => {
    setOverrideMonthYear(null);
    setCurrentRoomIndex(0);
  }, [tenant.id]);

  // Nạp dữ liệu phòng theo đúng tháng đang chọn (Bảo tồn kỳ tháng khi đồng bộ Cloud)
  useEffect(() => {
    setRoomInputs(createRoomInputs(monthYear));
  }, [tenant.id, monthYear]);

  const activeRoom = roomInputs[currentRoomIndex];
  const totalRooms = roomInputs.length;

  const handleMonthYearChange = (newMonth: string) => {
    setOverrideMonthYear(newMonth);
  };

  const syncTimerRef = React.useRef<any>(null);

  const handleInputChange = (field: string, rawValue: string) => {
    const formattedValue = formatInputNumber(rawValue);

    setRoomInputs((prev) =>
      prev.map((item, i) => {
        if (i !== currentRoomIndex) return item;
        const newItem = { ...item, [field]: formattedValue };

        // Tự động lưu nháp (Gmail-style) hoặc tự động xóa nháp khi các ô mới bị xóa về trống/0
        const formattedMonthStr = formatMonthDisplay(monthYear);
        const numElecOldVal = parseFormattedNumber(newItem.electricityOld);
        const numElecNewVal = parseFormattedNumber(newItem.electricityNew);
        const numWaterOldVal = parseFormattedNumber(newItem.waterOld);
        const numWaterNewVal = parseFormattedNumber(newItem.waterNew);
        const rentVal = parseFormattedNumber(newItem.rentAmount);

        const hasNewInput =
          numElecNewVal > 0 ||
          numWaterNewVal > 0 ||
          numElecOldVal > 0 ||
          numWaterOldVal > 0 ||
          (newItem.notes && newItem.notes.trim() !== '');

        if (hasNewInput) {
          const updatedDraft = saveDraftReading({
            roomName: newItem.roomName,
            monthYear: formattedMonthStr,
            rentAmount: rentVal,
            electricityOld: numElecOldVal,
            electricityNew: numElecNewVal,
            waterOld: numWaterOldVal,
            waterNew: numWaterNewVal,
            notes: newItem.notes,
          });
          newItem.updatedAt = updatedDraft.updatedAt;
        } else {
          deleteDraftReading(newItem.roomName, formattedMonthStr);
          newItem.updatedAt = null;
        }

        return newItem;
      })
    );

    // Debounce 600ms tự động đồng bộ nháp ngầm lên Cloud
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTenantToCloud(tenant.id);
    }, 600);
  };

  // Xóa số tạm của phòng hiện tại
  const handleDeleteDraft = () => {
    const formattedMonthStr = formatMonthDisplay(monthYear);
    const room = roomInputs[currentRoomIndex];
    deleteDraftReading(room.roomName, formattedMonthStr);
    syncTenantToCloud(tenant.id);

    // Reset về chỉ số cũ mặc định
    const prev = getPreviousReading(room.roomName, monthYear);
    setRoomInputs((prevInputs) =>
      prevInputs.map((item, i) =>
        i === currentRoomIndex
          ? {
              ...item,
              electricityOld: prev && prev.electricityOld ? formatNumber(prev.electricityOld) : '',
              electricityNew: '',
              waterOld: prev && prev.waterOld ? formatNumber(prev.waterOld) : '',
              waterNew: '',
              notes: '',
              updatedAt: null,
            }
          : item
      )
    );

    setToastMsg(`🗑️ Đã xóa số tạm phòng ${room.roomName}`);
    setTimeout(() => setToastMsg(null), 3000);
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

    // Kiểm tra xem đã có đủ chỉ số điện và nước chưa
    const incompleteRooms = roomInputs.filter((r) => {
      const eNew = parseFormattedNumber(r.electricityNew);
      const wNew = parseFormattedNumber(r.waterNew);
      return eNew <= 0 || wNew <= 0;
    });

    if (incompleteRooms.length > 0) {
      const roomNamesStr = incompleteRooms.map((r) => r.roomName).join(', ');
      alert(
        `⚠️ Bạn chưa nhập đủ chỉ số điện và nước mới cho: ${roomNamesStr}.\n\n💡 Bạn có thể bấm nút "💾 Lưu số tạm" để lưu lại các số đã nhập và tiếp tục ghi sau, hoặc nhập đủ chỉ số mới để hoàn tất tính hóa đơn!`
      );
      return;
    }

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
      saveBillRecord(inp, res, settings);
      return {
        roomName: rInput.roomName,
        input: inp,
        result: res,
      };
    });

    saveCombinedBillRecord(tenant.name, formattedMonthStr, roomItems);

    // Đẩy hóa đơn chính thức lên Cloud
    syncTenantToCloud(tenant.id);

    if (totalRooms === 1) {
      onCompleteSingle(roomItems[0].input, roomItems[0].result);
    } else {
      onCompleteCombined(tenant.name, formattedMonthStr, roomItems);
    }
  };

  return (
    <div style={{ padding: '4px' }}>
      {/* Toast thông báo lưu số tạm */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'rgba(16, 185, 129, 0.95)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '20px',
            fontWeight: 800,
            fontSize: '0.8rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {toastMsg}
        </div>
      )}

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
            {roomInputs.map((r, idx) => {
              const hasDraft = !!getDraftReading(r.roomName, monthYear);
              return (
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
                    position: 'relative',
                    background: idx === currentRoomIndex ? 'var(--gradient-brand)' : 'rgba(255,255,255,0.1)',
                    color: idx === currentRoomIndex ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setCurrentRoomIndex(idx)}
                >
                  {idx + 1}
                  {hasDraft && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '-2px',
                        right: '-2px',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#f59e0b',
                        border: '1px solid #000',
                      }}
                      title="Có số tạm đã lưu"
                    />
                  )}
                </button>
              );
            })}
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
                  placeholder="Ghi số điện mới"
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
                <Droplets size={14} color="#06b6d4" /> Số NƯỚC (Bậc 1: {formatNumber(settings.waterTier1Rate)}đ | Bậc 2: {formatNumber(settings.waterTier2Rate)}đ)
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
                  placeholder="Ghi số nước mới"
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
          {/* TRẠNG THÁI TỰ ĐỘNG LƯU NHÁP KIỂU GMAIL */}
          {activeRoom.updatedAt ? (
            <div
              style={{
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.72rem',
                color: '#10b981',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                <Clock size={12} color="#10b981" />
                <span>
                  ⚡ <b>Đã tự động lưu nháp:</b> {new Date(activeRoom.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <button
                type="button"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent-rose)',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                }}
                onClick={handleDeleteDraft}
                title="Xóa bản nháp phòng này"
              >
                <Trash2 size={11} /> Xóa nháp
              </button>
            </div>
          ) : (
            <div
              style={{
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px dashed var(--border-color)',
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              💡 <span>Ứng dụng tự động lưu nháp khi gõ. Bấm Back hay chuyển app không sợ mất số.</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.88rem', color: '#e2e8f0', fontWeight: 700 }}>
              Thành tiền {activeRoom.roomName}:
            </span>
            <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
              {formatVND(activeResult.totalAmount)}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            {currentRoomIndex > 0 ? (
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 1, padding: '9px 6px', fontSize: '0.78rem' }}
                onClick={() => setCurrentRoomIndex(currentRoomIndex - 1)}
              >
                <ArrowLeft size={14} /> Trước
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 1, padding: '9px 6px', fontSize: '0.78rem' }}
                onClick={onBack}
              >
                <ArrowLeft size={14} /> Quay lại
              </button>
            )}

            {currentRoomIndex < totalRooms - 1 ? (
              <button type="submit" className="btn-primary" style={{ flex: 1.5, padding: '9px 6px', fontSize: '0.8rem' }}>
                Phòng tiếp ({currentRoomIndex + 2}/{totalRooms}) <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="submit"
                className="btn-primary"
                style={{ flex: 2, padding: '9px 6px', fontSize: '0.8rem', background: 'var(--gradient-brand)' }}
              >
                <Calculator size={15} /> HOÀN TẤT & XEM HÓA ĐƠN
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

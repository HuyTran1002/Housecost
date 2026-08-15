import type { BillInput, CalculationResult, Settings, BillRecord, CombinedBillRecord, Tenant } from '../types/calculator';

export const SETTINGS_KEY = 'housecost_settings';
export const HISTORY_KEY = 'housecost_history';
export const COMBINED_HISTORY_KEY = 'housecost_combined_history';
export const TENANTS_KEY = 'housecost_tenants';

export const DEFAULT_SETTINGS: Settings = {
  electricityRate: 3000,
  waterTier1Limit: 5,
  waterTier1Rate: 11000,
  waterTier2Rate: 14000,
};

export function getSettings(): Settings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Lỗi đọc cài đặt:', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettingsToStorage(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Lỗi lưu cài đặt:', e);
  }
}

export function calculateBill(input: BillInput, settings: Settings): CalculationResult {
  const electricityUsed = Math.max(0, input.electricityNew - input.electricityOld);
  const electricityCost = electricityUsed * settings.electricityRate;

  const waterTotalUsed = Math.max(0, input.waterNew - input.waterOld);
  
  let waterTier1Used = 0;
  let waterTier2Used = 0;

  if (waterTotalUsed > 0) {
    if (waterTotalUsed <= settings.waterTier1Limit) {
      waterTier1Used = waterTotalUsed;
      waterTier2Used = 0;
    } else {
      waterTier1Used = settings.waterTier1Limit;
      waterTier2Used = waterTotalUsed - settings.waterTier1Limit;
    }
  }

  const waterTier1Cost = waterTier1Used * settings.waterTier1Rate;
  const waterTier2Cost = waterTier2Used * settings.waterTier2Rate;
  const waterTotalCost = waterTier1Cost + waterTier2Cost;

  const totalAmount = input.rentAmount + electricityCost + waterTotalCost;

  return {
    rentAmount: input.rentAmount,
    electricity: {
      used: electricityUsed,
      cost: electricityCost,
    },
    water: {
      totalUsed: waterTotalUsed,
      tier1Used: waterTier1Used,
      tier1Cost: waterTier1Cost,
      tier2Used: waterTier2Used,
      tier2Cost: waterTier2Cost,
      totalCost: waterTotalCost,
    },
    totalAmount,
  };
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('vi-VN').format(num);
}

export function formatInputNumber(rawValue: string): string {
  if (!rawValue) return '';
  const digitsOnly = rawValue.replace(/\D/g, '');
  if (!digitsOnly) return '';
  const num = parseInt(digitsOnly, 10);
  if (isNaN(num)) return '';
  return new Intl.NumberFormat('vi-VN').format(num);
}

export function parseFormattedNumber(formattedStr: string): number {
  if (!formattedStr) return 0;
  const digitsOnly = formattedStr.replace(/\D/g, '');
  return parseInt(digitsOnly, 10) || 0;
}

// Tính kỳ tháng mặc định dựa trên ngày chốt sổ (Hết ngày 10 mới tính tháng mới):
// Từ ngày 1 đến ngày 10 hàng tháng (<= 10) -> Mặc định chọn tháng cũ (tháng trước)
// Từ ngày 11 trở đi (> 10) -> Mặc định chọn tháng hiện tại
export function getDefaultBillingMonth(cutoffDay: number = 10): string {
  const now = new Date();
  let targetYear = now.getFullYear();
  let targetMonth = now.getMonth(); // 0-indexed (0 = Thg 1, 7 = Thg 8)

  if (now.getDate() <= cutoffDay) {
    targetMonth -= 1;
    if (targetMonth < 0) {
      targetMonth = 11;
      targetYear -= 1;
    }
  }

  const mStr = (targetMonth + 1).toString().padStart(2, '0');
  return `${targetYear}-${mStr}`;
}

// Format YYYY-MM sang Tháng MM/YYYY (Ví dụ 2026-08 -> Tháng 08/2026)
export function formatMonthDisplay(monthStr: string): string {
  if (!monthStr) return '';
  if (monthStr.startsWith('Tháng ')) return monthStr;
  const parts = monthStr.split('-');
  if (parts.length === 2) {
    return `Tháng ${parts[1]}/${parts[0]}`;
  }
  return monthStr;
}

// Tự động tính chuỗi các định dạng của tháng ngay trước đó
export function getPreviousMonthKeys(monthStr: string): string[] {
  if (!monthStr) return [];
  
  let year = new Date().getFullYear();
  let month = new Date().getMonth() + 1;

  if (monthStr.includes('-')) {
    const parts = monthStr.split('-');
    year = parseInt(parts[0], 10) || year;
    month = parseInt(parts[1], 10) || month;
  } else {
    const match = monthStr.match(/Tháng\s*(\d+)[\/\-](\d+)/i);
    if (match) {
      month = parseInt(match[1], 10) || month;
      year = parseInt(match[2], 10) || year;
    }
  }

  // Lùi 1 tháng
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear = year - 1;
  }

  const mm = prevMonth < 10 ? `0${prevMonth}` : `${prevMonth}`;
  const m = `${prevMonth}`;

  return [
    `${prevYear}-${mm}`,
    `Tháng ${mm}/${prevYear}`,
    `Tháng ${m}/${prevYear}`,
  ];
}

// Tìm chỉ số điện nước mới nhất của phòng từ hóa đơn tháng ngay trước đó (hoặc bản ghi gần nhất của CHÍNH PHÒNG ĐÓ)
export function getPreviousReading(roomName: string, selectedMonthYear?: string): { electricityOld: number; waterOld: number } | null {
  if (!roomName || !roomName.trim()) return null;
  const targetRoom = roomName.trim().toLowerCase();

  const prevKeys = selectedMonthYear ? getPreviousMonthKeys(selectedMonthYear) : [];

  // BƯỚC 1: Ưu tiên tìm trong Lịch sử phòng đơn (Single History) đúng kỳ tháng trước (prevKeys)
  const singleHistory = getBillHistory();
  if (prevKeys.length > 0) {
    for (const record of singleHistory) {
      const recRoom = (record.input?.roomName || '').trim().toLowerCase();
      const recMonth = (record.input?.monthYear || '').trim().toLowerCase();
      if (recRoom === targetRoom && prevKeys.some((k) => k.toLowerCase() === recMonth)) {
        return {
          electricityOld: record.input.electricityNew || 0,
          waterOld: record.input.waterNew || 0,
        };
      }
    }
  }

  // BƯỚC 2: Ưu tiên tìm trong Lịch sử hóa đơn gộp (Combined History) đúng kỳ tháng trước (prevKeys)
  const combinedHistory = getCombinedBillHistory();
  if (prevKeys.length > 0) {
    for (const record of combinedHistory) {
      const recMonth = (record.monthYear || '').trim().toLowerCase();
      if (prevKeys.some((k) => k.toLowerCase() === recMonth)) {
        for (const item of record.roomItems || []) {
          const itemRoom = (item.roomName || item.input?.roomName || '').trim().toLowerCase();
          if (itemRoom === targetRoom) {
            return {
              electricityOld: item.input.electricityNew || 0,
              waterOld: item.input.waterNew || 0,
            };
          }
        }
      }
    }
  }

  // BƯỚC 3: Nếu không thấy trong tháng ngay trước, tìm bản ghi MỚI NHẤT của ĐÚNG PHÒNG ĐÓ trong Single History
  for (const record of singleHistory) {
    const recRoom = (record.input?.roomName || '').trim().toLowerCase();
    if (recRoom === targetRoom) {
      return {
        electricityOld: record.input.electricityNew || 0,
        waterOld: record.input.waterNew || 0,
      };
    }
  }

  // BƯỚC 4: Tìm bản ghi MỚI NHẤT của ĐÚNG PHÒNG ĐÓ trong Combined History
  for (const record of combinedHistory) {
    for (const item of record.roomItems || []) {
      const itemRoom = (item.roomName || item.input?.roomName || '').trim().toLowerCase();
      if (itemRoom === targetRoom) {
        return {
          electricityOld: item.input.electricityNew || 0,
          waterOld: item.input.waterNew || 0,
        };
      }
    }
  }

  // Nếu phòng chưa từng có lịch sử lưu trước đó -> Trả về null để các ô nhập điện nước cũ ĐỂ TRỐNG rỗng 100%!
  return null;
}

// LỊCH SỬ HÓA ĐƠN ĐƠN (Single room)
export function getBillHistory(): BillRecord[] {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Lỗi đọc lịch sử:', e);
  }
  return [];
}

export function saveBillRecord(input: BillInput, result: CalculationResult, settings: Settings): BillRecord {
  const history = getBillHistory();

  const roomKey = (input.roomName || '').trim().toLowerCase();
  const monthKey = (input.monthYear || '').trim().toLowerCase();

  const existingIndex = history.findIndex(
    (item) =>
      (item.input.roomName || '').trim().toLowerCase() === roomKey &&
      (item.input.monthYear || '').trim().toLowerCase() === monthKey
  );

  const newRecord: BillRecord = {
    id: existingIndex >= 0 ? history[existingIndex].id : `bill-${Date.now()}`,
    createdAt: new Date().toISOString(),
    input,
    settingsSnapshot: settings,
    result,
  };

  if (existingIndex >= 0) {
    history[existingIndex] = newRecord;
  } else {
    history.unshift(newRecord);
  }

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Lỗi lưu lịch sử:', e);
  }

  return newRecord;
}

export function deleteBillRecord(id: string): BillRecord[] {
  const history = getBillHistory().filter((item) => item.id !== id);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Lỗi xóa lịch sử:', e);
  }
  return history;
}

// LỊCH SỬ HÓA ĐƠN CỘNG GỘP (Combined)
export function getCombinedBillHistory(): CombinedBillRecord[] {
  try {
    const saved = localStorage.getItem(COMBINED_HISTORY_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Lỗi đọc lịch sử hóa đơn gộp:', e);
  }
  return [];
}

export function saveCombinedBillRecord(
  tenantName: string,
  monthYear: string,
  roomItems: { roomName: string; input: BillInput; result: CalculationResult }[]
): CombinedBillRecord {
  const history = getCombinedBillHistory();

  const grandTotal = roomItems.reduce((acc, curr) => acc + curr.result.totalAmount, 0);

  const tenantKey = tenantName.trim().toLowerCase();
  const monthKey = monthYear.trim().toLowerCase();

  const existingIndex = history.findIndex(
    (item) =>
      item.tenantName.trim().toLowerCase() === tenantKey &&
      item.monthYear.trim().toLowerCase() === monthKey
  );

  const newRecord: CombinedBillRecord = {
    id: existingIndex >= 0 ? history[existingIndex].id : `combined-${Date.now()}`,
    createdAt: new Date().toISOString(),
    tenantName,
    monthYear,
    roomItems,
    grandTotal,
  };

  if (existingIndex >= 0) {
    history[existingIndex] = newRecord;
  } else {
    history.unshift(newRecord);
  }

  try {
    localStorage.setItem(COMBINED_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Lỗi lưu lịch sử hóa đơn gộp:', e);
  }

  return newRecord;
}

export function deleteCombinedBillRecord(id: string): CombinedBillRecord[] {
  const combinedList = getCombinedBillHistory();
  const targetRecord = combinedList.find((item) => item.id === id);

  const updatedCombined = combinedList.filter((item) => item.id !== id);
  try {
    localStorage.setItem(COMBINED_HISTORY_KEY, JSON.stringify(updatedCombined));
  } catch (e) {
    console.error('Lỗi xóa lịch sử hóa đơn gộp:', e);
  }

  // Xóa đồng bộ các bản ghi phòng đơn lẻ tương ứng trong singleHistory để không bị sót dữ liệu cũ
  if (targetRecord && Array.isArray(targetRecord.roomItems)) {
    const singleList = getBillHistory();
    const roomNamesToDelete = targetRecord.roomItems.map((r) => (r.roomName || '').trim().toLowerCase());
    const monthToDelete = (targetRecord.monthYear || '').trim().toLowerCase();

    const updatedSingle = singleList.filter((rec) => {
      const recRoom = (rec.input?.roomName || '').trim().toLowerCase();
      const recMonth = (rec.input?.monthYear || '').trim().toLowerCase();
      const matchRoom = roomNamesToDelete.includes(recRoom);
      const matchMonth = recMonth === monthToDelete;
      return !(matchRoom && matchMonth);
    });

    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedSingle));
    } catch (e) {
      console.error('Lỗi dọn lịch sử phòng đơn:', e);
    }
  }

  return updatedCombined;
}

export function clearAllBillHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(COMBINED_HISTORY_KEY);
  } catch (e) {
    console.error('Lỗi xóa toàn bộ lịch sử:', e);
  }
}

// KHÁCH THUÊ (Tenants)
export function getTenants(): Tenant[] {
  try {
    const saved = localStorage.getItem(TENANTS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Lỗi đọc khách thuê:', e);
  }
  // Mặc định trả về mảng rỗng [] khi vừa mới cài ứng dụng (Sạch dữ liệu 100%)
  return [];
}

export function saveTenant(tenant: Tenant): Tenant[] {
  const tenants = getTenants();
  const index = tenants.findIndex((t) => t.id === tenant.id);
  if (index >= 0) {
    tenants[index] = tenant;
  } else {
    tenants.unshift(tenant);
  }
  try {
    localStorage.setItem(TENANTS_KEY, JSON.stringify(tenants));
  } catch (e) {
    console.error('Lỗi lưu khách thuê:', e);
  }
  return tenants;
}

export function deleteTenant(id: string): Tenant[] {
  const tenants = getTenants().filter((t) => t.id !== id);
  try {
    localStorage.setItem(TENANTS_KEY, JSON.stringify(tenants));
  } catch (e) {
    console.error('Lỗi xóa khách thuê:', e);
  }
  return tenants;
}

export interface AppDataPackage {
  tenants: Tenant[];
  settings: Settings;
  history?: BillRecord[];
  combinedHistory: CombinedBillRecord[];
  exportedAt: string;
}

export function exportAllDataPackage(): AppDataPackage {
  return {
    tenants: getTenants(),
    settings: getSettings(),
    history: getBillHistory(),
    combinedHistory: getCombinedBillHistory(),
    exportedAt: new Date().toISOString(),
  };
}

export function importAllDataPackage(pkg: AppDataPackage): boolean {
  try {
    if (Array.isArray(pkg.tenants)) {
      localStorage.setItem(TENANTS_KEY, JSON.stringify(pkg.tenants));
    }
    if (pkg.settings && typeof pkg.settings.electricityRate === 'number') {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(pkg.settings));
    }
    if (Array.isArray(pkg.history)) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(pkg.history));
    }
    if (Array.isArray(pkg.combinedHistory)) {
      localStorage.setItem(COMBINED_HISTORY_KEY, JSON.stringify(pkg.combinedHistory));
    }
    return true;
  } catch (e) {
    console.error('Lỗi nạp dữ liệu:', e);
    return false;
  }
}

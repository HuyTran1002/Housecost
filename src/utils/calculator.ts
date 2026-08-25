import type { BillInput, CalculationResult, Settings, BillRecord, CombinedBillRecord, Tenant, TenantRoom, DraftReading, TenantSyncData, PendingDeletionRecord } from '../types/calculator';

export const SETTINGS_KEY = 'housecost_settings';
export const HISTORY_KEY = 'housecost_history';
export const COMBINED_HISTORY_KEY = 'housecost_combined_history';
export const TENANTS_KEY = 'housecost_tenants';
export const DRAFT_READINGS_KEY = 'housecost_draft_readings';
export const PENDING_DELETIONS_KEY = 'housecost_pending_deletions';

export const DEFAULT_SETTINGS: Settings = {
  electricityRate: 3000,
  waterTier1Limit: 5,
  waterTier1Rate: 11000,
  waterTier2Rate: 14000,
  deletionGracePeriodSeconds: 300,
};

export function getDeletionGracePeriodMs(): number {
  try {
    const settings = getSettings();
    if (settings.deletionGracePeriodSeconds && settings.deletionGracePeriodSeconds > 0) {
      return settings.deletionGracePeriodSeconds * 1000;
    }
  } catch (e) {}
  return 5 * 60 * 1000; // Mặc định 300s = 5 phút
}

export function formatDurationSeconds(totalSec: number): string {
  if (!totalSec || totalSec <= 0) return '0 giây';
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} giờ`);
  if (mins > 0) parts.push(`${mins} phút`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs} giây`);

  return parts.join(' ');
}

export function getSettings(): Settings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
      };
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
  const elecNew = typeof input.electricityNew === 'number' ? input.electricityNew : (parseInt(String(input.electricityNew || 0).replace(/\D/g, ''), 10) || 0);
  const elecOld = typeof input.electricityOld === 'number' ? input.electricityOld : (parseInt(String(input.electricityOld || 0).replace(/\D/g, ''), 10) || 0);
  const waterNew = typeof input.waterNew === 'number' ? input.waterNew : (parseInt(String(input.waterNew || 0).replace(/\D/g, ''), 10) || 0);
  const waterOld = typeof input.waterOld === 'number' ? input.waterOld : (parseInt(String(input.waterOld || 0).replace(/\D/g, ''), 10) || 0);
  const rent = typeof input.rentAmount === 'number' ? input.rentAmount : (parseInt(String(input.rentAmount || 0).replace(/\D/g, ''), 10) || 0);

  const electricityUsed = Math.max(0, elecNew - elecOld);
  const electricityCost = electricityUsed * settings.electricityRate;

  const waterTotalUsed = Math.max(0, waterNew - waterOld);
  
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

  const totalAmount = rent + electricityCost + waterTotalCost;

  return {
    rentAmount: rent,
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
// Tìm chỉ số điện nước mới của DUY NHẤT tháng ngay trước đó để làm chỉ số cũ cho tháng hiện tại
export function getPreviousReading(roomName: string, selectedMonthYear?: string): { electricityOld: number; waterOld: number } | null {
  if (!roomName || !roomName.trim() || !selectedMonthYear) return null;
  const targetRoom = roomName.trim().toLowerCase();

  // Nếu phòng này thuộc hồ sơ đang nằm trong hàng chờ xóa pendingDeletions -> Bỏ qua chỉ số cũ
  const pendingDeletions = getPendingDeletions();
  const pendingTenantNames = new Set(
    pendingDeletions.filter((p) => p.type === 'tenant').map((p) => (p.tenantName || '').trim().toLowerCase()).filter(Boolean)
  );
  const pendingRooms = new Set<string>();
  pendingDeletions.forEach((p) => {
    if (p.type === 'tenant' && p.tenantData && Array.isArray(p.tenantData.rooms)) {
      p.tenantData.rooms.forEach((r) => {
        if (r.roomName) pendingRooms.add(r.roomName.trim().toLowerCase());
      });
    }
  });

  if (pendingRooms.has(targetRoom)) return null;

  const prevKeys = getPreviousMonthKeys(selectedMonthYear);
  if (prevKeys.length === 0) return null;

  const isMatchingMonth = (mStr: string) => {
    if (!mStr) return false;
    const cleanM = (mStr || '').trim().toLowerCase();
    const normM = normalizeMonthKey(cleanM).toLowerCase();
    return prevKeys.some((k) => k.toLowerCase() === cleanM || k.toLowerCase() === normM);
  };

  const candidates: { electricityNew: number; waterNew: number; time: number; priority: number }[] = [];

  // BƯỚC 1: Ưu tiên cao nhất Hóa Đơn Gộp (Combined History)
  const combinedHistory = getCombinedBillHistory();
  for (const record of combinedHistory) {
    const recTenant = (record.tenantName || '').trim().toLowerCase();
    if (recTenant && pendingTenantNames.has(recTenant)) continue;

    if (isMatchingMonth(record.monthYear || '')) {
      for (const item of record.roomItems || []) {
        const itemRoom = (item.roomName || item.input?.roomName || '').trim().toLowerCase();
        if (itemRoom === targetRoom) {
          candidates.push({
            electricityNew: item.input.electricityNew || 0,
            waterNew: item.input.waterNew || 0,
            time: new Date(record.createdAt || 0).getTime(),
            priority: 3,
          });
        }
      }
    }
  }

  // BƯỚC 2: Số Tạm Nháp (Draft Readings)
  const drafts = getDraftReadings();
  for (const draft of drafts) {
    const dRoom = (draft.roomName || '').trim().toLowerCase();
    if (dRoom === targetRoom && isMatchingMonth(draft.monthYear)) {
      const elecVal = draft.electricityNew !== undefined && draft.electricityNew > 0 ? draft.electricityNew : draft.electricityOld;
      const waterVal = draft.waterNew !== undefined && draft.waterNew > 0 ? draft.waterNew : draft.waterOld;
      if (elecVal !== undefined || waterVal !== undefined) {
        candidates.push({
          electricityNew: elecVal || 0,
          waterNew: waterVal || 0,
          time: new Date(draft.updatedAt || 0).getTime(),
          priority: 2,
        });
      }
    }
  }

  // BƯỚC 3: Hóa Đơn Đơn (Single History)
  const singleHistory = getBillHistory();
  for (const record of singleHistory) {
    const recRoom = (record.input?.roomName || '').trim().toLowerCase();
    if (recRoom === targetRoom && isMatchingMonth(record.input?.monthYear || '')) {
      candidates.push({
        electricityNew: record.input.electricityNew || 0,
        waterNew: record.input.waterNew || 0,
        time: new Date(record.createdAt || 0).getTime(),
        priority: 1,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Lấy bản ghi có độ ưu tiên cao nhất và thời gian khởi tạo mới nhất
  candidates.sort((a, b) => b.priority - a.priority || b.time - a.time);
  const best = candidates[0];

  return {
    electricityOld: best.electricityNew,
    waterOld: best.waterNew,
  };
}

// ==========================================
// QUẢN LÝ SỐ TẠM (DRAFT READINGS)
// ==========================================

export function getDraftReadings(): DraftReading[] {
  try {
    const saved = localStorage.getItem(DRAFT_READINGS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Lỗi đọc số tạm:', e);
  }
  return [];
}

export function normalizeMonthKey(monthStr: string): string {
  if (!monthStr) return '';
  const trimmed = monthStr.trim();
  if (trimmed.startsWith('Tháng ')) {
    const match = trimmed.match(/Tháng\s*(\d+)[\/\-](\d+)/i);
    if (match) {
      const m = parseInt(match[1], 10).toString().padStart(2, '0');
      return `${match[2]}-${m}`;
    }
  }
  return trimmed;
}

export function getDraftReading(roomName: string, monthYear: string): DraftReading | null {
  if (!roomName || !roomName.trim()) return null;
  const targetRoom = roomName.trim().toLowerCase();
  const targetMonth = normalizeMonthKey(monthYear).toLowerCase();

  const drafts = getDraftReadings();
  const found = drafts.find((d) => {
    const rMatch = (d.roomName || '').trim().toLowerCase() === targetRoom;
    const mMatch = normalizeMonthKey(d.monthYear).toLowerCase() === targetMonth;
    return rMatch && mMatch;
  });

  if (found) {
    const hasMeaningfulDraft =
      (found.electricityNew !== undefined && found.electricityNew > 0) ||
      (found.waterNew !== undefined && found.waterNew > 0) ||
      (found.electricityOld !== undefined && found.electricityOld > 0) ||
      (found.waterOld !== undefined && found.waterOld > 0) ||
      (found.notes !== undefined && found.notes.trim() !== '');

    if (!hasMeaningfulDraft) {
      deleteDraftReading(roomName, monthYear);
      return null;
    }
  }

  return found || null;
}

export function saveDraftReading(draftInput: {
  roomName: string;
  monthYear: string;
  rentAmount?: number;
  electricityOld?: number;
  electricityNew?: number;
  waterOld?: number;
  waterNew?: number;
  notes?: string;
}): DraftReading {
  const drafts = getDraftReadings();
  const roomKey = (draftInput.roomName || '').trim().toLowerCase();
  const monthKey = normalizeMonthKey(draftInput.monthYear).toLowerCase();

  const existingIndex = drafts.findIndex(
    (item) =>
      (item.roomName || '').trim().toLowerCase() === roomKey &&
      normalizeMonthKey(item.monthYear).toLowerCase() === monthKey
  );

  const existing = existingIndex >= 0 ? drafts[existingIndex] : null;

  const updatedDraft: DraftReading = {
    roomName: draftInput.roomName,
    monthYear: draftInput.monthYear,
    rentAmount: draftInput.rentAmount !== undefined ? draftInput.rentAmount : existing?.rentAmount,
    electricityOld: draftInput.electricityOld !== undefined ? draftInput.electricityOld : existing?.electricityOld,
    electricityNew: draftInput.electricityNew !== undefined ? draftInput.electricityNew : existing?.electricityNew,
    waterOld: draftInput.waterOld !== undefined ? draftInput.waterOld : existing?.waterOld,
    waterNew: draftInput.waterNew !== undefined ? draftInput.waterNew : existing?.waterNew,
    notes: draftInput.notes !== undefined ? draftInput.notes : existing?.notes,
    updatedAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    drafts[existingIndex] = updatedDraft;
  } else {
    drafts.unshift(updatedDraft);
  }

  try {
    localStorage.setItem(DRAFT_READINGS_KEY, JSON.stringify(drafts));
  } catch (e) {
    console.error('Lỗi lưu số tạm:', e);
  }

  return updatedDraft;
}

export function deleteDraftReading(roomName: string, monthYear?: string): DraftReading[] {
  const targetRoom = (roomName || '').trim().toLowerCase();
  const targetMonth = monthYear ? normalizeMonthKey(monthYear).toLowerCase() : '';

  const drafts = getDraftReadings().filter((item) => {
    const rMatch = (item.roomName || '').trim().toLowerCase() === targetRoom;
    if (!monthYear) return !rMatch;
    const mMatch = normalizeMonthKey(item.monthYear).toLowerCase() === targetMonth;
    return !(rMatch && mMatch);
  });

  try {
    localStorage.setItem(DRAFT_READINGS_KEY, JSON.stringify(drafts));
  } catch (e) {
    console.error('Lỗi xóa số tạm:', e);
  }

  return drafts;
}

export function clearAllDraftReadings(): void {
  try {
    localStorage.removeItem(DRAFT_READINGS_KEY);
  } catch (e) {
    console.error('Lỗi xóa toàn bộ số tạm:', e);
  }
}

export function removeDeletedBillId(id: string): void {
  try {
    const list = getDeletedBillIds().filter((item) => item !== id);
    localStorage.setItem(DELETED_BILL_IDS_KEY, JSON.stringify(list));
  } catch (e) {}
}

// LỊCH SỬ HÓA ĐƠN ĐƠN (Single room)
export function getBillHistory(): BillRecord[] {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) {
      const records: BillRecord[] = JSON.parse(saved);
      const pendingDeletions = getPendingDeletions();
      const deletedBillIds = new Set(getDeletedBillIds());

      const pendingIds = new Set(pendingDeletions.map((p) => p.id));

      const pendingRooms = new Set<string>();
      pendingDeletions.forEach((p) => {
        if (p.type === 'tenant' && p.tenantData && Array.isArray(p.tenantData.rooms)) {
          p.tenantData.rooms.forEach((r) => {
            if (r.roomName) pendingRooms.add(r.roomName.trim().toLowerCase());
          });
        }
      });

      return records.filter((rec) => {
        if (!rec || !rec.id) return false;
        if (deletedBillIds.has(rec.id) || pendingIds.has(rec.id)) return false;
        const roomNameLower = (rec.input?.roomName || '').trim().toLowerCase();
        if (roomNameLower && pendingRooms.has(roomNameLower)) return false;
        return true;
      });
    }
  } catch (e) {
    console.error('Lỗi đọc lịch sử:', e);
  }
  return [];
}

export function saveBillRecord(input: BillInput, result: CalculationResult, settings: Settings): BillRecord {
  const history = getBillHistory();

  const roomKey = (input.roomName || '').trim().toLowerCase();
  const monthKey = normalizeMonthKey(input.monthYear || '').trim().toLowerCase();

  const cleanRoom = roomKey.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_');
  const cleanMonth = monthKey.replace(/[^a-z0-9]/g, '_');
  const deterministicId = `single_${cleanRoom}_${cleanMonth}`;

  const existingIndex = history.findIndex(
    (item) =>
      (item.input.roomName || '').trim().toLowerCase() === roomKey &&
      normalizeMonthKey(item.input.monthYear || '').trim().toLowerCase() === monthKey
  );

  const newRecord: BillRecord = {
    id: deterministicId,
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
    // Tự động làm sạch số tạm và vết xóa của hóa đơn này
    deleteDraftReading(input.roomName, input.monthYear);
    removeDeletedBillId(deterministicId);
    removePendingDeletion(deterministicId);
  } catch (e) {
    console.error('Lỗi lưu lịch sử:', e);
  }

  return newRecord;
}

function triggerAutoCloudPendingSync(): void {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine) {
    setTimeout(() => {
      import('../services/cloudSyncService').then((m) => {
        m.syncPendingDeletionsToCloud().catch(() => null);
      });
    }, 150);
  }
}

export function deleteBillRecord(id: string): BillRecord[] {
  const history = getBillHistory();
  const targetRecord = history.find((item) => item.id === id);
  const updatedHistory = history.filter((item) => item.id !== id);

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
    addDeletedBillId(id);
    addPendingDeletion(id, 'singleBill', targetRecord?.input?.roomName, undefined, undefined, undefined, targetRecord);
    triggerAutoCloudPendingSync();

    // Nếu xóa hóa đơn phòng đơn lẻ -> Tự động loại bỏ phòng đó khỏi Hóa Đơn Gộp tương ứng (nếu có)
    if (targetRecord && targetRecord.input) {
      const targetRoom = (targetRecord.input.roomName || '').trim().toLowerCase();
      const targetMonth = normalizeMonthKey(targetRecord.input.monthYear || '').trim().toLowerCase();

      const combinedList = getCombinedBillHistory();
      let combinedModified = false;

      const updatedCombined = combinedList.filter((cRecord) => {
        const cMonth = normalizeMonthKey(cRecord.monthYear || '').trim().toLowerCase();
        if (cMonth !== targetMonth) return true;

        if (cRecord.roomItems && Array.isArray(cRecord.roomItems)) {
          const newItems = cRecord.roomItems.filter(
            (r) => (r.roomName || '').trim().toLowerCase() !== targetRoom
          );

          if (newItems.length !== cRecord.roomItems.length) {
            combinedModified = true;
            if (newItems.length === 0) {
              // Hóa đơn gộp không còn phòng nào -> Xóa luôn Hóa đơn gộp
              addDeletedBillId(cRecord.id);
              addPendingDeletion(cRecord.id, 'combinedBill', cRecord.tenantName, undefined, undefined, undefined, cRecord);
              return false;
            } else {
              // Cập nhật lại phòng còn lại và tổng tiền mới
              cRecord.roomItems = newItems;
              cRecord.grandTotal = newItems.reduce((acc, curr) => acc + (curr.result?.totalAmount || 0), 0);
            }
          }
        }
        return true;
      });

      if (combinedModified) {
        localStorage.setItem(COMBINED_HISTORY_KEY, JSON.stringify(updatedCombined));
      }
    }
  } catch (e) {
    console.error('Lỗi xóa lịch sử:', e);
  }
  return updatedHistory;
}

// LỊCH SỬ HÓA ĐƠN CỘNG GỘP (Combined)
export function getCombinedBillHistory(): CombinedBillRecord[] {
  try {
    const saved = localStorage.getItem(COMBINED_HISTORY_KEY);
    if (saved) {
      const records: CombinedBillRecord[] = JSON.parse(saved);
      const pendingDeletions = getPendingDeletions();
      const deletedBillIds = new Set(getDeletedBillIds());

      const pendingIds = new Set(pendingDeletions.map((p) => p.id));
      const pendingTenantNames = new Set(
        pendingDeletions
          .filter((p) => p.type === 'tenant')
          .map((p) => (p.tenantName || '').trim().toLowerCase())
          .filter(Boolean)
      );

      return records.filter((rec) => {
        if (!rec || !rec.id) return false;
        if (deletedBillIds.has(rec.id) || pendingIds.has(rec.id)) return false;
        const tenantNameLower = (rec.tenantName || '').trim().toLowerCase();
        if (pendingTenantNames.has(tenantNameLower)) return false;
        return true;
      });
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
  const monthKey = normalizeMonthKey(monthYear).trim().toLowerCase();

  const cleanTenant = tenantKey.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_');
  const cleanMonth = monthKey.replace(/[^a-z0-9]/g, '_');
  const deterministicId = `combined_${cleanTenant}_${cleanMonth}`;

  const existingIndex = history.findIndex(
    (item) =>
      item.tenantName.trim().toLowerCase() === tenantKey &&
      normalizeMonthKey(item.monthYear).trim().toLowerCase() === monthKey
  );

  const newRecord: CombinedBillRecord = {
    id: deterministicId,
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
    // Tự động làm sạch số tạm và vết xóa của hóa đơn gộp này VÀ tất cả các phòng đơn lẻ trong hóa đơn gộp
    roomItems.forEach((r) => {
      deleteDraftReading(r.roomName, monthYear);
      const rKey = (r.roomName || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_');
      const singleId = `single_${rKey}_${cleanMonth}`;
      removeDeletedBillId(singleId);
      removePendingDeletion(singleId);
    });

    removeDeletedBillId(deterministicId);
    removePendingDeletion(deterministicId);
  } catch (e) {
    console.error('Lỗi lưu lịch sử hóa đơn gộp:', e);
  }

  return newRecord;
}

const DELETED_BILL_IDS_KEY = 'housecost_deleted_bill_ids';

export function getDeletedBillIds(): string[] {
  try {
    const data = localStorage.getItem(DELETED_BILL_IDS_KEY);
    const rawList: string[] = data ? JSON.parse(data) : [];
    const restoredSet = new Set(getRestoredIds().map((r) => r.trim().toLowerCase()));

    return rawList.filter((id) => {
      const lower = id.trim().toLowerCase();
      if (restoredSet.has(lower)) return false;
      for (const r of restoredSet) {
        if (r.length >= 3 && (lower.includes(r) || r.includes(lower))) return false;
      }
      return true;
    });
  } catch (e) {
    return [];
  }
}

export function addDeletedBillId(id: string): void {
  try {
    const list = getDeletedBillIds();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem(DELETED_BILL_IDS_KEY, JSON.stringify(list));
    }
  } catch (e) {}
}

export function clearDeletedBillIds(): void {
  try {
    localStorage.removeItem(DELETED_BILL_IDS_KEY);
  } catch (e) {}
}

export function getPendingDeletions(): PendingDeletionRecord[] {
  try {
    const data = localStorage.getItem(PENDING_DELETIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

export function addPendingDeletion(
  id: string,
  type: 'tenant' | 'combinedBill' | 'singleBill',
  tenantName?: string,
  docId?: string,
  deletedAt?: number,
  tenantData?: Tenant,
  billData?: any,
  singleBillData?: any[]
): PendingDeletionRecord[] {
  try {
    const restoredIds = getRestoredIds();
    const rawId = (id || '').trim().toLowerCase();
    const rawDocId = (docId || '').trim().toLowerCase();

    // CẢNH BÁO AN TOÀN: Chỉ chặn nếu ĐÚNG ID hoặc DocID này vừa được bấm Hoàn Tác/Khôi phục
    const isBlocked = restoredIds.some((rId) => {
      const rLower = rId.trim().toLowerCase();
      if (rLower === rawId || (rawDocId && rLower === rawDocId)) return true;
      return false;
    });

    if (isBlocked) {
      return getPendingDeletions();
    }

    let resolvedTenantName = tenantName;
    if (type === 'tenant') {
      if (!resolvedTenantName || resolvedTenantName.startsWith('tenant-')) {
        const localTenants = getTenants();
        const found = localTenants.find((t) => t.id === id || (docId && docId.includes(t.id)));
        if (found && found.name && !found.name.startsWith('tenant-')) {
          resolvedTenantName = found.name;
        }
      }
    }

    const list = getPendingDeletions();
    const existingIndex = list.findIndex((item) => {
      if (item.id === id) return true;
      if (type === 'tenant' && item.type === 'tenant' && docId && item.docId === docId) return true;
      return false;
    });

    const existing = existingIndex >= 0 ? list[existingIndex] : null;

    let finalTenantName = resolvedTenantName;
    if (!finalTenantName || finalTenantName.startsWith('tenant-')) {
      if (existing && existing.tenantName && !existing.tenantName.startsWith('tenant-')) {
        finalTenantName = existing.tenantName;
      }
    }

    let finalDocId = docId;
    if (!finalDocId || finalDocId.startsWith('tenant-')) {
      if (existing && existing.docId && !existing.docId.startsWith('tenant-')) {
        finalDocId = existing.docId;
      }
    }

    const finalTenantData = tenantData || (existing ? existing.tenantData : undefined);
    const finalBillData = billData || (existing ? existing.billData : undefined);
    const finalSingleBillData = singleBillData || (existing ? existing.singleBillData : undefined);

    const newRecord: PendingDeletionRecord = {
      id,
      type,
      deletedAt: deletedAt || (existing && existing.deletedAt ? existing.deletedAt : Date.now()),
      tenantName: finalTenantName,
      docId: finalDocId,
      tenantData: finalTenantData,
      billData: finalBillData,
      singleBillData: finalSingleBillData,
    };
    if (existingIndex >= 0) {
      list[existingIndex] = newRecord;
    } else {
      list.push(newRecord);
    }
    localStorage.setItem(PENDING_DELETIONS_KEY, JSON.stringify(list));
    return list;
  } catch (e) {
    return getPendingDeletions();
  }
}

export function removePendingDeletion(id: string): PendingDeletionRecord[] {
  try {
    const rawId = (id || '').trim().toLowerCase();
    let monthSuffix = '';
    if (id.startsWith('combined_')) {
      const raw = id.replace(/^combined_/, '');
      const parts = raw.split('_');
      if (parts.length >= 2) {
        monthSuffix = `_${parts[parts.length - 2]}_${parts[parts.length - 1]}`;
      }
    }

    const list = getPendingDeletions().filter((item) => {
      const itemId = (item.id || '').trim().toLowerCase();
      const itemDocId = (item.docId || '').trim().toLowerCase();

      // 1. Khớp chính xác ID hoặc DocId
      if (itemId === rawId || itemDocId === rawId) return false;
      if (rawId && itemId && (rawId.includes(itemId) || itemId.includes(rawId))) return false;
      if (rawId && itemDocId && (rawId.includes(itemDocId) || itemDocId.includes(rawId))) return false;

      // 2. Nếu xóa hóa đơn gộp -> xóa kèm các hóa đơn phòng đơn lẻ thuộc hóa đơn gộp đó
      if (monthSuffix && item.type === 'singleBill' && item.id.endsWith(monthSuffix)) return false;

      return true;
    });

    localStorage.setItem(PENDING_DELETIONS_KEY, JSON.stringify(list));
    return list;
  } catch (e) {
    return getPendingDeletions();
  }
}

export function purgeTenantHistory(tenantName?: string, docId?: string, tenantId?: string): void {
  try {
    const nameLower = (tenantName || '').trim().toLowerCase();
    const docLower = (docId || '').trim().toLowerCase();
    const idLower = (tenantId || '').trim().toLowerCase();

    if (!nameLower && !docLower && !idLower) return;

    // Thu thập toàn bộ danh sách tên phòng thuộc khách thuê bị tiêu hủy
    const targetRoomNames = new Set<string>();

    // 0. Quét phòng từ pendingDeletions
    const pendingList = getPendingDeletions();
    pendingList.forEach((p) => {
      if (p.type === 'tenant') {
        const pName = (p.tenantName || '').trim().toLowerCase();
        const pDoc = (p.docId || '').trim().toLowerCase();
        const pId = (p.id || '').trim().toLowerCase();

        if ((nameLower && pName === nameLower) || (docLower && pDoc === docLower) || (idLower && pId === idLower)) {
          if (p.tenantData && Array.isArray(p.tenantData.rooms)) {
            p.tenantData.rooms.forEach((r) => {
              if (r.roomName) targetRoomNames.add(r.roomName.trim().toLowerCase());
            });
          }
        }
      }
    });

    // 1. Dọn dẹp trực tiếp dữ liệu thô Combined History từ localStorage & thu thập danh sách phòng
    const rawCombined = localStorage.getItem(COMBINED_HISTORY_KEY);
    if (rawCombined) {
      const combinedHistory: CombinedBillRecord[] = JSON.parse(rawCombined);
      combinedHistory.forEach((c) => {
        const cTenant = (c.tenantName || '').trim().toLowerCase();
        const cDoc = getTenantDocId({ name: c.tenantName || '', id: '' }).toLowerCase();

        if ((nameLower && cTenant === nameLower) || (docLower && (cDoc === docLower || cDoc.includes(docLower) || docLower.includes(cDoc)))) {
          if (Array.isArray(c.roomItems)) {
            c.roomItems.forEach((r) => {
              if (r.roomName) targetRoomNames.add(r.roomName.trim().toLowerCase());
            });
          }
        }
      });

      const updatedCombined = combinedHistory.filter((c) => {
        const cTenant = (c.tenantName || '').trim().toLowerCase();
        const cDoc = getTenantDocId({ name: c.tenantName || '', id: '' }).toLowerCase();

        if (nameLower && cTenant === nameLower) return false;
        if (docLower && (cDoc === docLower || cDoc.includes(docLower) || docLower.includes(cDoc))) return false;
        return true;
      });
      localStorage.setItem(COMBINED_HISTORY_KEY, JSON.stringify(updatedCombined));
    }

    // 2. Dọn dẹp trực tiếp dữ liệu thô Single History từ localStorage theo Tên Khách, ID và Tên Phòng
    const rawSingle = localStorage.getItem(HISTORY_KEY);
    if (rawSingle) {
      const singleHistory: BillRecord[] = JSON.parse(rawSingle);
      const updatedSingle = singleHistory.filter((s) => {
        if (!s) return false;
        const sRoom = (s.input?.roomName || '').trim().toLowerCase();

        if (idLower && s.id && s.id.toLowerCase().includes(idLower)) return false;
        if (sRoom && targetRoomNames.has(sRoom)) return false;
        return true;
      });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedSingle));
    }

    // 3. Dọn dẹp trực tiếp dữ liệu thô Số Tạm (Draft Readings) theo Tên Phòng
    const rawDrafts = localStorage.getItem(DRAFT_READINGS_KEY);
    if (rawDrafts && targetRoomNames.size > 0) {
      const drafts: DraftReading[] = JSON.parse(rawDrafts);
      const updatedDrafts = drafts.filter((d) => {
        if (!d) return false;
        const dRoom = (d.roomName || '').trim().toLowerCase();
        if (dRoom && targetRoomNames.has(dRoom)) return false;
        return true;
      });
      localStorage.setItem(DRAFT_READINGS_KEY, JSON.stringify(updatedDrafts));
    }

    // 4. Đảm bảo TENANTS_KEY cũng được dọn sạch hoàn toàn khỏi dữ liệu thô
    const rawTenants = localStorage.getItem(TENANTS_KEY);
    if (rawTenants) {
      const tenantsList: Tenant[] = JSON.parse(rawTenants);
      const updatedTenants = tenantsList.filter((t) => {
        const tName = (t.name || '').trim().toLowerCase();
        const tDoc = getTenantDocId(t).toLowerCase();
        if (idLower && t.id.toLowerCase() === idLower) return false;
        if (nameLower && tName === nameLower) return false;
        if (docLower && (tDoc === docLower || tDoc.includes(docLower) || docLower.includes(tDoc))) return false;
        return true;
      });
      localStorage.setItem(TENANTS_KEY, JSON.stringify(updatedTenants));
    }

    if (typeof window !== 'undefined') window.dispatchEvent(new Event('localDataChanged'));
  } catch (e) {
    console.error('Lỗi dọn sạch lịch sử khách thuê:', e);
  }
}

export function purgeBillRecordFromLocal(billId: string): void {
  try {
    if (!billId) return;
    const rawId = billId.trim().toLowerCase();

    // 1. Purge from raw Combined History
    const rawCombined = localStorage.getItem(COMBINED_HISTORY_KEY);
    if (rawCombined) {
      const combinedHistory: CombinedBillRecord[] = JSON.parse(rawCombined);
      const updatedCombined = combinedHistory.filter((c) => (c.id || '').trim().toLowerCase() !== rawId);
      localStorage.setItem(COMBINED_HISTORY_KEY, JSON.stringify(updatedCombined));
    }

    // 2. Purge from raw Single History
    const rawSingle = localStorage.getItem(HISTORY_KEY);
    if (rawSingle) {
      const singleHistory: BillRecord[] = JSON.parse(rawSingle);
      const updatedSingle = singleHistory.filter((s) => (s.id || '').trim().toLowerCase() !== rawId);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedSingle));
    }

    if (typeof window !== 'undefined') window.dispatchEvent(new Event('localDataChanged'));
  } catch (e) {
    console.error('Lỗi dọn sạch hóa đơn khỏi local:', e);
  }
}

export function clearPendingDeletions(): void {
  try {
    localStorage.removeItem(PENDING_DELETIONS_KEY);
  } catch (e) {}
}

export const RESTORED_IDS_KEY = 'housecost_restored_ids';

export function getRestoredIds(): string[] {
  try {
    const data = localStorage.getItem(RESTORED_IDS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

export function addRestoredId(id: string): void {
  try {
    const list = getRestoredIds();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem(RESTORED_IDS_KEY, JSON.stringify(list));
    }
  } catch (e) {}
}

export function removeRestoredId(id: string): void {
  try {
    const rawId = (id || '').trim().toLowerCase();
    if (!rawId) return;
    const list = getRestoredIds().filter((item) => {
      const itemLower = (item || '').trim().toLowerCase();
      if (itemLower === rawId) return false;
      if (rawId.length >= 3 && itemLower.length >= 3 && (rawId.includes(itemLower) || itemLower.includes(rawId))) return false;
      return true;
    });
    localStorage.setItem(RESTORED_IDS_KEY, JSON.stringify(list));
  } catch (e) {}
}

export function clearRestoredIds(): void {
  try {
    localStorage.removeItem(RESTORED_IDS_KEY);
  } catch (e) {}
}

export function undoPendingDeletion(id: string): void {
  try {
    const rawId = (id || '').trim().toLowerCase();
    const pendingList = getPendingDeletions();
    const targetPending = pendingList.find((p) => {
      const pId = (p.id || '').trim().toLowerCase();
      const pDocId = (p.docId || '').trim().toLowerCase();
      return pId === rawId || pDocId === rawId || (rawId && pId.includes(rawId)) || (rawId && pDocId.includes(rawId));
    });

    // 1. Thêm chỉ định danh ID/DocID cụ thể vào Restored IDs
    if (targetPending) {
      if (targetPending.id) addRestoredId(targetPending.id);
      if (targetPending.docId) addRestoredId(targetPending.docId);
    }
    addRestoredId(id);

    // 2. Gỡ chỉ mục này khỏi mảng pendingDeletions & deletedBillIds ở local
    removePendingDeletion(id);
    if (targetPending) {
      if (targetPending.id) {
        removePendingDeletion(targetPending.id);
        removeDeletedBillId(targetPending.id);
      }
      if (targetPending.docId) {
        removePendingDeletion(targetPending.docId);
        removeDeletedBillId(targetPending.docId);
      }
    }
    removeDeletedBillId(id);

    // 3. NẾU HOÀN TÁC HÓA ĐƠN GỘP HOẶC ĐƠN LẺ: Phục hồi duy nhất Hóa Đơn đó vào history
    if (targetPending && (targetPending.type === 'combinedBill' || targetPending.type === 'singleBill' || id.startsWith('combined_') || id.startsWith('single_') || id.startsWith('bill_'))) {
      // 3.1 Nạp lại Hóa đơn gộp vào COMBINED_HISTORY_KEY
      if (targetPending.billData && (targetPending.type === 'combinedBill' || targetPending.billData.grandTotal !== undefined)) {
        const rawCombined = localStorage.getItem(COMBINED_HISTORY_KEY);
        let currentCombined: CombinedBillRecord[] = rawCombined ? JSON.parse(rawCombined) : [];
        const exists = currentCombined.some((c) => c.id === targetPending.billData.id);
        if (!exists) {
          currentCombined.unshift(targetPending.billData);
          localStorage.setItem(COMBINED_HISTORY_KEY, JSON.stringify(currentCombined));
        }
      }

      // 3.2 Nạp lại Hóa đơn đơn lẻ vào HISTORY_KEY
      if (targetPending.billData && (targetPending.type === 'singleBill' || targetPending.billData.input)) {
        const rawSingle = localStorage.getItem(HISTORY_KEY);
        let currentSingle: BillRecord[] = rawSingle ? JSON.parse(rawSingle) : [];
        const exists = currentSingle.some((s) => s.id === targetPending.billData.id);
        if (!exists) {
          currentSingle.unshift(targetPending.billData);
          localStorage.setItem(HISTORY_KEY, JSON.stringify(currentSingle));
        }
      }

      // 3.3 Nếu có danh sách singleBillData kèm theo (hóa đơn phòng đơn của bill gộp)
      if (Array.isArray(targetPending.singleBillData) && targetPending.singleBillData.length > 0) {
        const rawSingle = localStorage.getItem(HISTORY_KEY);
        let currentSingle: BillRecord[] = rawSingle ? JSON.parse(rawSingle) : [];
        targetPending.singleBillData.forEach((sRec) => {
          if (!currentSingle.some((s) => s.id === sRec.id)) {
            currentSingle.unshift(sRec);
          }
          if (sRec.id) {
            removePendingDeletion(sRec.id);
            removeDeletedBillId(sRec.id);
            addRestoredId(sRec.id);
          }
        });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(currentSingle));
      }

      // 3.4 Nếu là combinedBill -> dọn sạch luôn các mốc singleBill theo monthSuffix
      if (targetPending.type === 'combinedBill' || id.startsWith('combined_')) {
        const rawCombinedId = targetPending.id || id;
        const raw = rawCombinedId.replace(/^combined_/, '');
        const parts = raw.split('_');
        if (parts.length >= 2) {
          const monthSuffix = `_${parts[parts.length - 2]}_${parts[parts.length - 1]}`;
          getPendingDeletions().forEach((p) => {
            if (p.type === 'singleBill' && p.id.endsWith(monthSuffix)) {
              removePendingDeletion(p.id);
              removeDeletedBillId(p.id);
              if (p.id) addRestoredId(p.id);
            }
          });
        }
      }
    }

    // 4. NẾU HOÀN TÁC KHÁCH THUÊ: Chỉ phục hồi Hồ sơ khách thuê vào housecost_tenants (Không đụng đến bill)
    if (targetPending && (targetPending.type === 'tenant' || id.startsWith('tenant-'))) {
      const rawSavedTenants = localStorage.getItem(TENANTS_KEY);
      let currentTenants: Tenant[] = rawSavedTenants ? JSON.parse(rawSavedTenants) : [];
      const targetNameLower = (targetPending.tenantName || '').trim().toLowerCase();

      const existingIndex = currentTenants.findIndex((t) => {
        if (t.id === id || (targetPending.id && t.id === targetPending.id)) return true;
        if (targetNameLower && (t.name || '').trim().toLowerCase() === targetNameLower) return true;
        return false;
      });

      if (existingIndex < 0) {
        let restoredTenant: Tenant | undefined = targetPending.tenantData;

        if (!restoredTenant) {
          const tenantName = targetPending.tenantName || 'Khách thuê';
          const tId = targetPending.id && targetPending.id.startsWith('tenant-') ? targetPending.id : (id.startsWith('tenant-') ? id : `tenant-${Date.now()}`);
          const combined = getCombinedBillHistory();
          const foundC = combined.find((c) => (c.tenantName || '').trim().toLowerCase() === targetNameLower);
          const rooms = foundC && foundC.roomItems ? foundC.roomItems.map((r) => ({ roomName: r.roomName, defaultRent: r.result?.rentAmount || 0 })) : [{ roomName: 'Phòng 101', defaultRent: 0 }];

          restoredTenant = {
            id: tId,
            name: tenantName,
            rooms,
          };
        }

        currentTenants.push(restoredTenant);
        localStorage.setItem(TENANTS_KEY, JSON.stringify(currentTenants));
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('localDataChanged'));
      }
    }

    getTenants(); // Trigger auto-recovery
    triggerAutoCloudPendingSync();
  } catch (e) {
    console.error('Lỗi hoàn tác xóa:', e);
  }
}

export function deleteCombinedBillRecord(id: string): CombinedBillRecord[] {
  const combinedList = getCombinedBillHistory();
  const targetRecord = combinedList.find((item) => item.id === id);
  const tenantName = targetRecord?.tenantName;
  const docId = tenantName ? getTenantDocId({ name: tenantName, id: '' }) : undefined;

  removeRestoredId(id);

  let deletedSingles: BillRecord[] = [];
  const updatedCombined = combinedList.filter((item) => item.id !== id);

  // Xóa đồng bộ các bản ghi phòng đơn lẻ VÀ SỐ TẠM tương ứng
  if (targetRecord && Array.isArray(targetRecord.roomItems)) {
    const monthToDelete = targetRecord.monthYear;
    const roomNamesToDelete = targetRecord.roomItems.map((r) => (r.roomName || '').trim().toLowerCase());
    const normMonthToDelete = (monthToDelete || '').trim().toLowerCase();

    // 1. Xóa sạch các bản ghi số tạm nháp của các phòng trong tháng này
    const cleanMonth = normalizeMonthKey(monthToDelete).toLowerCase().replace(/[^a-z0-9]/g, '_');
    targetRecord.roomItems.forEach((r) => {
      deleteDraftReading(r.roomName, monthToDelete);
      const rKey = (r.roomName || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_');
      const singleId = `single_${rKey}_${cleanMonth}`;
      addDeletedBillId(singleId);
    });

    // 2. Xóa các hóa đơn phòng đơn tương ứng
    const singleList = getBillHistory();
    const updatedSingle = singleList.filter((rec) => {
      const recRoom = (rec.input?.roomName || '').trim().toLowerCase();
      const recMonth = (rec.input?.monthYear || '').trim().toLowerCase();
      const matchRoom = roomNamesToDelete.includes(recRoom);
      const matchMonth = recMonth === normMonthToDelete || normalizeMonthKey(recMonth).toLowerCase() === normalizeMonthKey(normMonthToDelete).toLowerCase();
      if (matchRoom && matchMonth) {
        deletedSingles.push(rec);
        addDeletedBillId(rec.id);
      }
      return !(matchRoom && matchMonth);
    });

    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedSingle));
    } catch (e) {
      console.error('Lỗi dọn lịch sử phòng đơn:', e);
    }
  }

  try {
    localStorage.setItem(COMBINED_HISTORY_KEY, JSON.stringify(updatedCombined));
    addDeletedBillId(id);
    addPendingDeletion(id, 'combinedBill', tenantName, docId, undefined, undefined, targetRecord, deletedSingles);
  } catch (e) {
    console.error('Lỗi xóa lịch sử hóa đơn gộp:', e);
  }

  triggerAutoCloudPendingSync();
  return updatedCombined;
}

export function clearAllBillHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(COMBINED_HISTORY_KEY);
    localStorage.removeItem(DRAFT_READINGS_KEY);
  } catch (e) {
    console.error('Lỗi xóa toàn bộ lịch sử:', e);
  }
}

export function clearAllLocalAppData(): void {
  try {
    localStorage.removeItem(TENANTS_KEY);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(COMBINED_HISTORY_KEY);
    localStorage.removeItem(DRAFT_READINGS_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(DELETED_BILL_IDS_KEY);
    localStorage.removeItem(PENDING_DELETIONS_KEY);
    localStorage.removeItem(RESTORED_IDS_KEY);
    localStorage.removeItem('housecost_last_24h_auto_backup');
    localStorage.removeItem('housecost_auto_restored_user');
  } catch (e) {
    console.error('Lỗi xóa dữ liệu local:', e);
  }
}

// KHÁCH THUÊ (Tenants)
export function getTenants(): Tenant[] {
  let tenants: Tenant[] = [];
  try {
    const saved = localStorage.getItem(TENANTS_KEY);
    if (saved) {
      tenants = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Lỗi đọc khách thuê:', e);
  }

  const pendingDeletions = getPendingDeletions();
  const pendingTenantNames = new Set<string>();
  const pendingTenantIds = new Set<string>();
  const pendingDocIds = new Set<string>();

  pendingDeletions.forEach((p) => {
    if (p.type === 'tenant' || (p.id && p.id.startsWith('tenant-'))) {
      if (p.id) pendingTenantIds.add(p.id);
      if (p.tenantName) pendingTenantNames.add(p.tenantName.trim().toLowerCase());
      if (p.docId) pendingDocIds.add(p.docId.trim().toLowerCase());
    }
  });

  // Lọc bỏ 100% tất cả các khách thuê đang nằm trong mốc xóa pendingDeletions
  tenants = tenants.filter((t) => {
    if (!t || !t.id) return false;
    const tName = (t.name || '').trim().toLowerCase();
    const tDoc = getTenantDocId(t).toLowerCase();

    if (pendingTenantIds.has(t.id)) return false;
    if (tName && pendingTenantNames.has(tName)) return false;
    if (tDoc && (pendingDocIds.has(tDoc) || pendingDocIds.has(t.id.toLowerCase()))) return false;
    return true;
  });

  // TỰ ĐỘNG KHÔI PHỤC HỒ SƠ KHÁCH THUÊ TỪ LỊCH SỬ HÓA ĐƠN NẾU HỒ SƠ BỊ RỖNG HOẶC THIẾU
  try {
    const existingTenantNames = new Set(tenants.map((t) => (t.name || '').trim().toLowerCase()));
    let recovered = false;

    // Phục hồi từ Lịch sử Hóa đơn gộp (Combined History) đối với hồ sơ khách thuê hợp lệ chưa từng bị xóa
    const combinedHistory = getCombinedBillHistory();
    combinedHistory.forEach((record) => {
      const name = (record.tenantName || '').trim();
      const lowerName = name.toLowerCase();
      const docId = getTenantDocId({ name, id: '' }).toLowerCase();

      if (
        name &&
        lowerName !== 'khách thuê' &&
        lowerName !== 'khach thue' &&
        !existingTenantNames.has(lowerName) &&
        !pendingTenantNames.has(lowerName) &&
        !pendingDocIds.has(docId)
      ) {
        const rooms: TenantRoom[] = (record.roomItems || []).map((r) => ({
          roomName: r.roomName,
          defaultRent: r.input?.rentAmount || 0,
        }));
        if (rooms.length > 0) {
          const newTenant: Tenant = {
            id: `tenant_rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name,
            rooms,
          };
          tenants.push(newTenant);
          existingTenantNames.add(lowerName);
          recovered = true;
        }
      }
    });

    if (recovered) {
      localStorage.setItem(TENANTS_KEY, JSON.stringify(tenants));
    }
  } catch (err) {
    console.error('Lỗi tự động phục hồi khách thuê từ lịch sử:', err);
  }

  return tenants;
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
    // Nếu lưu lại tenant trùng id/tên, xóa khỏi pending deletion nếu có
    removePendingDeletion(tenant.id);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('localDataChanged'));
  } catch (e) {
    console.error('Lỗi lưu khách thuê:', e);
  }
  return tenants;
}

export function deleteTenant(id: string, createPending: boolean = true): Tenant[] {
  const tenants = getTenants();
  const targetTenant = tenants.find((t) => t.id === id);
  const updated = tenants.filter((t) => t.id !== id);
  try {
    localStorage.setItem(TENANTS_KEY, JSON.stringify(updated));
    if (targetTenant && Array.isArray(targetTenant.rooms)) {
      targetTenant.rooms.forEach((r) => {
        deleteDraftReading(r.roomName);
      });
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('localDataChanged'));
    if (targetTenant) {
      removeRestoredId(id);
      if (targetTenant.name) removeRestoredId(targetTenant.name);
      removeRestoredId(getTenantDocId(targetTenant));
    }
    if (createPending) {
      const existingPending = getPendingDeletions().find((p) => p.id === id || (p.docId && p.docId.includes(id)));
      const resolvedName = targetTenant?.name || existingPending?.tenantName;
      const docId = targetTenant ? getTenantDocId(targetTenant) : (existingPending?.docId || id);
      addPendingDeletion(id, 'tenant', resolvedName, docId, undefined, targetTenant);
    }
    triggerAutoCloudPendingSync();
  } catch (e) {
    console.error('Lỗi xóa khách thuê:', e);
  }
  return updated;
}

export interface AppDataPackage {
  tenants: Tenant[];
  settings: Settings;
  history?: BillRecord[];
  combinedHistory: CombinedBillRecord[];
  draftReadings?: DraftReading[];
  exportedAt: string;
}

export function exportAllDataPackage(): AppDataPackage {
  return {
    tenants: getTenants(),
    settings: getSettings(),
    history: getBillHistory(),
    combinedHistory: getCombinedBillHistory(),
    draftReadings: getDraftReadings(),
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
    if (Array.isArray(pkg.draftReadings)) {
      localStorage.setItem(DRAFT_READINGS_KEY, JSON.stringify(pkg.draftReadings));
    }
    return true;
  } catch (e) {
    console.error('Lỗi nạp dữ liệu:', e);
    return false;
  }
}

// ==========================================
// ĐỒNG BỘ THEO TỪNG KHÁCH THUÊ ĐỘC LẬP (PER-TENANT SYNC ENGINE)
// ==========================================

export function getTenantDocId(tenant: Tenant | { name: string; id: string }): string {
  if (!tenant || !tenant.name) return tenant?.id || 'Khach_Khong_Ten';
  const cleanName = tenant.name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_');
  return cleanName || tenant.id || 'Khach';
}

export function getTenantSyncData(tenantId: string): TenantSyncData | null {
  const tenants = getTenants();
  let tenant = tenants.find((t) => t.id === tenantId);

  // Nếu khách thuê đã bị xóa (đang trong hàng chờ), lấy dữ liệu từ hàng chờ
  if (!tenant) {
    const pending = getPendingDeletions().find(p => p.type === 'tenant' && p.id === tenantId);
    if (pending && pending.tenantData) {
      tenant = pending.tenantData;
    }
  }

  if (!tenant) return null;

  const roomNames = (tenant.rooms || []).map((r) => r.roomName.trim().toLowerCase());
  const tenantName = (tenant.name || '').trim().toLowerCase();

  const allDrafts = getDraftReadings();
  const tenantDrafts = allDrafts.filter((d) => roomNames.includes((d.roomName || '').trim().toLowerCase()));

  const allSingle = getBillHistory();
  const tenantSingle = allSingle.filter((s) => roomNames.includes((s.input?.roomName || '').trim().toLowerCase()));

  const allCombined = getCombinedBillHistory();
  const tenantCombined = allCombined.filter((c) => {
    if (c.tenantName && c.tenantName.trim().toLowerCase() === tenantName) return true;
    if (c.roomItems && Array.isArray(c.roomItems)) {
      return c.roomItems.some((r) => roomNames.includes((r.roomName || '').trim().toLowerCase()));
    }
    return false;
  });

  const pendingDeletions = getPendingDeletions();

  return {
    tenant,
    draftReadings: tenantDrafts,
    combinedHistory: tenantCombined,
    singleHistory: tenantSingle,
    pendingDeletions,
    updatedAt: new Date().toISOString(),
  };
}

export function applyTenantSyncData(syncData: TenantSyncData, isManualRestore: boolean = false): void {
  if (!syncData || !syncData.tenant || !syncData.tenant.id) return;
  // Guard an toàn: Không nạp dữ liệu nếu tên khách thuê không hợp lệ (rỗng, ID tự sinh, hoặc tên ma 'Khách Thuê')
  const tenantNameRaw = (syncData.tenant.name || '').trim().toLowerCase();
  if (
    !tenantNameRaw ||
    tenantNameRaw.startsWith('tenant-') ||
    tenantNameRaw === 'khách thuê' ||
    tenantNameRaw === 'khach thue' ||
    syncData.tenant.id.startsWith('tenant_rec_single_')
  ) {
    return;
  }

  // Nếu người dùng chủ động bấm Khôi Phục Từ Cloud -> Hủy bỏ hoàn toàn các vết xóa chờ
  if (isManualRestore) {
    clearPendingDeletions();
    clearDeletedBillIds();
    syncData.pendingDeletions = [];
  } else {
    // Nạp đồng bộ các vết xóa chờ (pendingDeletions) từ Cloud sang local để các máy cùng nhận diện
    if (Array.isArray(syncData.pendingDeletions) && syncData.pendingDeletions.length > 0) {
      syncData.pendingDeletions.forEach((pCloud) => {
        addPendingDeletion(pCloud.id, pCloud.type, pCloud.tenantName, pCloud.docId, pCloud.deletedAt, pCloud.tenantData, pCloud.billData, pCloud.singleBillData);
      });
    }
  }

  const tenant = syncData.tenant;
  const tenantNameKey = (tenant.name || '').trim().toLowerCase();
  const roomNamesKeys = (tenant.rooms || []).map((r) => (r.roomName || '').trim().toLowerCase());
  const settings = getSettings();
  const targetDocId = getTenantDocId(tenant);

  // 1. Cập nhật Khách Thuê vào TENANTS_KEY (Tuyệt đối không đè/nạp lại nếu khách đang trong trạng thái xóa chờ)
  const pendingDeletions = getPendingDeletions();
  const isPendingDelete = pendingDeletions.some(
    (p) =>
      p.type === 'tenant' &&
      (p.id === tenant.id ||
        (p.docId && p.docId === targetDocId) ||
        (p.tenantName && p.tenantName.trim().toLowerCase() === tenantNameKey))
  );

  const localTenants = getTenants();
  const idx = localTenants.findIndex(
    (t) => t.id === tenant.id || (t.name && tenant.name && t.name.trim().toLowerCase() === tenantNameKey)
  );

  if (idx >= 0) {
    if (isPendingDelete) {
      localTenants.splice(idx, 1);
    } else {
      localTenants[idx] = tenant;
    }
  } else {
    if (!isPendingDelete) {
      localTenants.unshift(tenant);
    }
  }
  localStorage.setItem(TENANTS_KEY, JSON.stringify(localTenants));

  if (isPendingDelete) return;

  // 2. Hợp nhất & Đồng bộ Số Tạm (Draft Readings) đa thiết bị chuẩn xác 100%
  const localDrafts = getDraftReadings();
  const cloudDrafts = syncData.draftReadings || [];
  const tenantRoomNames = new Set((tenant.rooms || []).map((r) => (r.roomName || '').trim().toLowerCase()));

  // Tạo map các số tạm đến từ Cloud đối với khách thuê này
  const cloudDraftMap = new Map<string, DraftReading>();
  cloudDrafts.forEach((cD) => {
    const key = `${(cD.roomName || '').trim().toLowerCase()}_${normalizeMonthKey(cD.monthYear || '').toLowerCase()}`;
    cloudDraftMap.set(key, cD);
  });

  // Mốc thời gian cập nhật gói đồng bộ Cloud
  const cloudSyncTime = (syncData as any).updatedAt ? new Date((syncData as any).updatedAt).getTime() : Date.now();

  const mergedDrafts: DraftReading[] = [];

  // 2.1 Xử lý mảng số tạm đang lưu ở Local
  localDrafts.forEach((d) => {
    const rName = (d.roomName || '').trim().toLowerCase();
    if (!tenantRoomNames.has(rName)) {
      // Số tạm này thuộc về Khách Thuê KHÁC -> Giữ nguyên ở local
      mergedDrafts.push(d);
    } else {
      // Số tạm này thuộc về Khách Thuê ĐANG ĐƯỢC ĐỒNG BỘ
      const key = `${rName}_${normalizeMonthKey(d.monthYear || '').toLowerCase()}`;
      const cD = cloudDraftMap.get(key);
      if (cD) {
        // Cloud cũng có số tạm cho phòng này -> So sánh timestamp updatedAt lấy cái mới hơn
        const cloudTime = cD.updatedAt ? new Date(cD.updatedAt).getTime() : 0;
        const localTime = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
        if (cloudTime >= localTime || isManualRestore) {
          mergedDrafts.push(cD);
        } else {
          mergedDrafts.push(d);
        }
        cloudDraftMap.delete(key); // Đã xử lý xong key này
      } else {
        // Cloud KHÔNG CÓ số tạm cho phòng này (do Máy khác đã xóa nháp hoặc đã hoàn tất tính bill)
        const localTime = d.updatedAt ? new Date(d.updatedAt).getTime() : 0;
        if (localTime > cloudSyncTime && !isManualRestore) {
          // Local gõ mới sau thời điểm Cloud sync -> Giữ lại
          mergedDrafts.push(d);
        } else {
          // Máy khác đã xóa nháp này trên Cloud -> Local đồng bộ XÓA THEO luôn!
          console.log(`[DraftSync] Tự động gỡ số tạm local phòng ${d.roomName} (${d.monthYear}) theo thiết bị khác.`);
        }
      }
    }
  });

  // 2.2 Bổ sung các số tạm mới từ Cloud mà Local chưa có
  cloudDraftMap.forEach((cD) => {
    mergedDrafts.push(cD);
  });

  localStorage.setItem(DRAFT_READINGS_KEY, JSON.stringify(mergedDrafts));

  // Gỡ bỏ vết xóa cũ ở local CHỈ KHI người dùng bấm nút Khôi Phục Thủ Công
  if (isManualRestore) {
    (syncData.combinedHistory || []).forEach((cItem) => {
      if (cItem.id) {
        removeDeletedBillId(cItem.id);
        removePendingDeletion(cItem.id);
      }
    });
    (syncData.singleHistory || []).forEach((sItem) => {
      if (sItem.id) {
        removeDeletedBillId(sItem.id);
        removePendingDeletion(sItem.id);
      }
    });
  }

  // 3. Lọc bỏ các hóa đơn thực sự bị xóa
  const deletedBillIds = new Set(getDeletedBillIds());
  const pendingBillIds = new Set(
    getPendingDeletions()
      .filter((p) => p.type === 'combinedBill' || p.type === 'singleBill')
      .map((p) => p.id)
  );

  // Tự động tính toán lại toàn bộ chi phí/tổng tiền cho Hóa Đơn Gộp
  const recalculatedCombined = (syncData.combinedHistory || []).map((record) => {
    if (!record.roomItems || !Array.isArray(record.roomItems)) return record;
    const roomItems = record.roomItems.map((item) => {
      const result = calculateBill(item.input, settings);
      return {
        ...item,
        result,
      };
    });
    const grandTotal = roomItems.reduce((acc, curr) => acc + curr.result.totalAmount, 0);
    return {
      ...record,
      roomItems,
      grandTotal,
    };
  });

  const cleanRecalculatedCombined = recalculatedCombined.filter(
    (item) => !deletedBillIds.has(item.id) && !pendingBillIds.has(item.id)
  );

  // Lọc ra các hóa đơn gộp thuộc về các khách khác (không thuộc khách thuê đang đồng bộ)
  const localCombined = getCombinedBillHistory().filter(
    (item) => !deletedBillIds.has(item.id) && !pendingBillIds.has(item.id)
  );

  const nonTenantCombined = localCombined.filter((c) => {
    const cTenant = (c.tenantName || '').trim().toLowerCase();
    // Loại bỏ toàn bộ hóa đơn của KHÁCH NÀY khỏi local (Cloud đã là nguồn chân lý)
    if (cTenant === tenantNameKey) return false;
    if (c.roomItems && Array.isArray(c.roomItems)) {
      return !c.roomItems.some((r) => roomNamesKeys.includes((r.roomName || '').trim().toLowerCase()));
    }
    return true;
  });

  // Kiểm tra xem Cloud có gửi về dữ liệu hóa đơn nào không (không phải local cache)
  // Nếu Cloud rỗng mà local có -> Tôn trọng Cloud: hóa đơn đã bị xóa trên Cloud, không resurrected nữa!
  const updatedCombined = [...nonTenantCombined, ...cleanRecalculatedCombined].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  localStorage.setItem(COMBINED_HISTORY_KEY, JSON.stringify(updatedCombined));

  const recalculatedSingle = (syncData.singleHistory || []).map((record) => {
    if (!record.input) return record;
    const result = calculateBill(record.input, settings);
    return { ...record, result };
  });

  const cleanRecalculatedSingle = recalculatedSingle.filter(
    (item: BillRecord) => !deletedBillIds.has(item.id) && !pendingBillIds.has(item.id)
  );

  const localSingle = getBillHistory().filter(
    (item: BillRecord) => !deletedBillIds.has(item.id) && !pendingBillIds.has(item.id)
  );

  // Loại bỏ toàn bộ hóa đơn đơn lẻ của KHÁCH NÀY khỏi local (Cloud đã là nguồn chân lý)
  const nonTenantSingle = localSingle.filter((s: BillRecord) => {
    const sRoom = (s.input?.roomName || '').trim().toLowerCase();
    return !roomNamesKeys.includes(sRoom);
  });

  const updatedSingle = [...nonTenantSingle, ...cleanRecalculatedSingle].sort(
    (a: BillRecord, b: BillRecord) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedSingle));
}

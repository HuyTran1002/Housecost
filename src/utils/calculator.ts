import type { BillInput, CalculationResult, Settings, BillRecord, CombinedBillRecord, Tenant, DraftReading, TenantSyncData, PendingDeletionRecord } from '../types/calculator';

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

export function deleteDraftReading(roomName: string, monthYear: string): DraftReading[] {
  const targetRoom = (roomName || '').trim().toLowerCase();
  const targetMonth = normalizeMonthKey(monthYear).toLowerCase();

  const drafts = getDraftReadings().filter((item) => {
    const rMatch = (item.roomName || '').trim().toLowerCase() === targetRoom;
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

export function deleteBillRecord(id: string): BillRecord[] {
  const history = getBillHistory();
  const targetRecord = history.find((item) => item.id === id);
  const updatedHistory = history.filter((item) => item.id !== id);

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
    addDeletedBillId(id);
    addPendingDeletion(id, 'singleBill', targetRecord?.input?.roomName);

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
              addPendingDeletion(cRecord.id, 'combinedBill', cRecord.tenantName);
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
    return data ? JSON.parse(data) : [];
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
  deletedAt?: number
): PendingDeletionRecord[] {
  try {
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

    const newRecord: PendingDeletionRecord = {
      id,
      type,
      deletedAt: deletedAt || (existing && existing.deletedAt ? existing.deletedAt : Date.now()),
      tenantName: finalTenantName,
      docId: finalDocId,
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
    let monthSuffix = '';
    if (id.startsWith('combined_')) {
      const raw = id.replace(/^combined_/, '');
      const parts = raw.split('_');
      if (parts.length >= 2) {
        monthSuffix = `_${parts[parts.length - 2]}_${parts[parts.length - 1]}`;
      }
    }

    const list = getPendingDeletions().filter((item) => {
      if (item.id === id || item.docId === id) return false;
      if (monthSuffix && item.type === 'singleBill' && item.id.endsWith(monthSuffix)) return false;
      return true;
    });

    localStorage.setItem(PENDING_DELETIONS_KEY, JSON.stringify(list));
    return list;
  } catch (e) {
    return getPendingDeletions();
  }
}

export function clearPendingDeletions(): void {
  try {
    localStorage.removeItem(PENDING_DELETIONS_KEY);
  } catch (e) {}
}

export function deleteCombinedBillRecord(id: string): CombinedBillRecord[] {
  const combinedList = getCombinedBillHistory();
  const targetRecord = combinedList.find((item) => item.id === id);
  const tenantName = targetRecord?.tenantName;
  const docId = tenantName ? getTenantDocId({ name: tenantName, id: '' }) : undefined;

  const updatedCombined = combinedList.filter((item) => item.id !== id);
  try {
    localStorage.setItem(COMBINED_HISTORY_KEY, JSON.stringify(updatedCombined));
    addDeletedBillId(id);
    addPendingDeletion(id, 'combinedBill', tenantName, docId);
  } catch (e) {
    console.error('Lỗi xóa lịch sử hóa đơn gộp:', e);
  }

  // Xóa đồng bộ các bản ghi phòng đơn lẻ VÀ SỐ TẠM tương ứng
  if (targetRecord && Array.isArray(targetRecord.roomItems)) {
    const monthToDelete = targetRecord.monthYear;
    const roomNamesToDelete = targetRecord.roomItems.map((r) => (r.roomName || '').trim().toLowerCase());
    const normMonthToDelete = (monthToDelete || '').trim().toLowerCase();

    // 1. Xóa sạch các bản ghi số tạm nháp của các phòng trong tháng này VÀ bổ sung mốc xóa cho phòng đơn lẻ
    const cleanMonth = normalizeMonthKey(monthToDelete).toLowerCase().replace(/[^a-z0-9]/g, '_');
    targetRecord.roomItems.forEach((r) => {
      deleteDraftReading(r.roomName, monthToDelete);
      const rKey = (r.roomName || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_');
      const singleId = `single_${rKey}_${cleanMonth}`;
      addDeletedBillId(singleId);
      addPendingDeletion(singleId, 'singleBill');
    });

    // 2. Xóa các hóa đơn phòng đơn tương ứng
    const singleList = getBillHistory();
    const updatedSingle = singleList.filter((rec) => {
      const recRoom = (rec.input?.roomName || '').trim().toLowerCase();
      const recMonth = (rec.input?.monthYear || '').trim().toLowerCase();
      const matchRoom = roomNamesToDelete.includes(recRoom);
      const matchMonth = recMonth === normMonthToDelete || normalizeMonthKey(recMonth).toLowerCase() === normalizeMonthKey(normMonthToDelete).toLowerCase();
      if (matchRoom && matchMonth) {
        addDeletedBillId(rec.id);
        addPendingDeletion(rec.id, 'singleBill');
      }
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
    localStorage.removeItem('housecost_last_24h_auto_backup');
    localStorage.removeItem('housecost_auto_restored_user');
  } catch (e) {
    console.error('Lỗi xóa dữ liệu local:', e);
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
    // Nếu lưu lại tenant trùng id/tên, xóa khỏi pending deletion nếu có
    removePendingDeletion(tenant.id);
  } catch (e) {
    console.error('Lỗi lưu khách thuê:', e);
  }
  return tenants;
}

export function deleteTenant(id: string): Tenant[] {
  const tenants = getTenants();
  const targetTenant = tenants.find((t) => t.id === id);
  const updated = tenants.filter((t) => t.id !== id);
  try {
    localStorage.setItem(TENANTS_KEY, JSON.stringify(updated));
    const existingPending = getPendingDeletions().find((p) => p.id === id || (p.docId && p.docId.includes(id)));
    const resolvedName = targetTenant?.name || existingPending?.tenantName;
    const docId = targetTenant ? getTenantDocId(targetTenant) : (existingPending?.docId || id);
    addPendingDeletion(id, 'tenant', resolvedName, docId);
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
  const tenant = tenants.find((t) => t.id === tenantId);
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

  // Nếu người dùng chủ động bấm Khôi Phục Từ Cloud -> Hủy bỏ hoàn toàn các vết xóa chờ
  if (isManualRestore) {
    clearPendingDeletions();
    clearDeletedBillIds();
    syncData.pendingDeletions = [];
  } else {
    // Nạp đồng bộ các vết xóa chờ (pendingDeletions) từ Cloud sang local để các máy cùng nhận diện
    if (Array.isArray(syncData.pendingDeletions) && syncData.pendingDeletions.length > 0) {
      syncData.pendingDeletions.forEach((pCloud) => {
        addPendingDeletion(pCloud.id, pCloud.type, pCloud.tenantName, pCloud.docId);
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
    if (cTenant === tenantNameKey) return false;
    if (c.roomItems && Array.isArray(c.roomItems)) {
      return !c.roomItems.some((r) => roomNamesKeys.includes((r.roomName || '').trim().toLowerCase()));
    }
    return true;
  });

  const updatedCombined = [...nonTenantCombined, ...cleanRecalculatedCombined].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  localStorage.setItem(COMBINED_HISTORY_KEY, JSON.stringify(updatedCombined));

  // 4. Tự động tính toán lại toàn bộ chi phí cho Hóa Đơn Đơn
  const recalculatedSingle = (syncData.singleHistory || []).map((record) => {
    if (!record.input) return record;
    const result = calculateBill(record.input, settings);
    return {
      ...record,
      result,
    };
  });

  const cleanRecalculatedSingle = recalculatedSingle.filter(
    (item) => !deletedBillIds.has(item.id) && !pendingBillIds.has(item.id)
  );

  const localSingle = getBillHistory().filter(
    (item) => !deletedBillIds.has(item.id) && !pendingBillIds.has(item.id)
  );

  const nonTenantSingle = localSingle.filter((s) => {
    const sRoom = (s.input?.roomName || '').trim().toLowerCase();
    return !roomNamesKeys.includes(sRoom);
  });

  const updatedSingle = [...nonTenantSingle, ...cleanRecalculatedSingle].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedSingle));
}


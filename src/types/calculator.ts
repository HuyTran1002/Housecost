export interface Settings {
  electricityRate: number; // VNĐ / kWh (mặc định 3000)
  waterTier1Limit: number; // m³ đầu tiên (mặc định 5)
  waterTier1Rate: number; // VNĐ / m³ (mặc định 11000)
  waterTier2Rate: number; // VNĐ / m³ (mặc định 14000)
  deletionGracePeriodSeconds?: number; // Thời gian đếm ngược xóa hàng chờ bảo lưu (đơn vị: Giây, mặc định 300s = 5 phút)
}

export interface BillInput {
  roomName: string;
  monthYear: string;
  rentAmount: number; // VNĐ
  electricityOld: number;
  electricityNew: number;
  waterOld: number;
  waterNew: number;
  notes?: string;
}

export interface WaterBreakdown {
  totalUsed: number;
  tier1Used: number;
  tier1Cost: number;
  tier2Used: number;
  tier2Cost: number;
  totalCost: number;
}

export interface ElectricityBreakdown {
  used: number;
  cost: number;
}

export interface CalculationResult {
  rentAmount: number;
  electricity: ElectricityBreakdown;
  water: WaterBreakdown;
  totalAmount: number;
}

export interface BillRecord {
  id: string;
  createdAt: string; // ISO string
  input: BillInput;
  settingsSnapshot: Settings;
  result: CalculationResult;
}

// Khách thuê đăng ký nhiều phòng
export interface TenantRoom {
  roomName: string;
  defaultRent: number;
}

export interface Tenant {
  id: string;
  name: string; // e.g. "Huy"
  phone?: string;
  rooms: TenantRoom[];
}

// Hóa đơn cộng gộp lưu trong lịch sử
export interface CombinedBillRecord {
  id: string;
  createdAt: string;
  tenantName: string;
  monthYear: string;
  roomItems: {
    roomName: string;
    input: BillInput;
    result: CalculationResult;
  }[];
  grandTotal: number;
}

// Bản ghi số tạm (số điện / số nước mới chưa tính tiền)
export interface DraftReading {
  roomName: string;
  monthYear: string; // YYYY-MM hoặc Tháng MM/YYYY
  rentAmount?: number;
  electricityOld?: number;
  electricityNew?: number;
  waterOld?: number;
  waterNew?: number;
  notes?: string;
  updatedAt: string; // ISO String timestamp
}

// Gói dữ liệu đồng bộ độc lập cho 1 Khách Thuê trên Cloud Firestore
export interface TenantSyncData {
  tenant: Tenant;
  draftReadings: DraftReading[];
  combinedHistory: CombinedBillRecord[];
  singleHistory: BillRecord[];
  pendingDeletions?: PendingDeletionRecord[];
  updatedAt: string;
}


// Bản ghi theo dõi mục đã xóa ở local chờ hết hạn (grace period 5 phút / 24h) để xóa trên Cloud
export interface PendingDeletionRecord {
  id: string; // Document ID hoặc Tenant ID / Bill ID
  type: 'tenant' | 'combinedBill' | 'singleBill';
  deletedAt: number; // Timestamp (Date.now()) lúc xóa ở local
  tenantName?: string;
  docId?: string;
}



export interface Settings {
  electricityRate: number; // VNĐ / kWh (mặc định 3000)
  waterTier1Limit: number; // m³ đầu tiên (mặc định 5)
  waterTier1Rate: number; // VNĐ / m³ (mặc định 11000)
  waterTier2Rate: number; // VNĐ / m³ (mặc định 14000)
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

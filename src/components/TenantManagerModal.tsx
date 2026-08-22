import React, { useState, useEffect } from 'react';
import type { Tenant, TenantRoom } from '../types/calculator';
import { X, Plus, Trash2, UserPlus, Users, Home, Save, Edit3 } from 'lucide-react';
import { getTenants, saveTenant, deleteTenant, formatInputNumber, parseFormattedNumber, formatNumber } from '../utils/calculator';
import { syncTenantToCloud, deleteTenantFromCloud } from '../services/cloudSyncService';

interface TenantManagerModalProps {
  onClose: () => void;
  onSelectTenantToCalculate?: (tenant: Tenant) => void;
}

interface FormRoomState {
  roomName: string;
  defaultRent: string;
}

export const TenantManagerModal: React.FC<TenantManagerModalProps> = ({
  onClose,
  onSelectTenantToCalculate,
}) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);

  // Form state for adding/editing tenant (defaultRent as string for 100% clean typing & backspace)
  const [tenantName, setTenantName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [rooms, setRooms] = useState<FormRoomState[]>([
    { roomName: 'Phòng 1', defaultRent: '' },
  ]);

  useEffect(() => {
    setTenants(getTenants());
  }, []);

  const handleStartAdd = () => {
    setEditingTenantId(null);
    setTenantName('');
    setPhone('');
    setRooms([{ roomName: 'Phòng 1', defaultRent: '' }]);
    setIsAdding(true);
  };

  const handleStartEdit = (tenant: Tenant, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTenantId(tenant.id);
    setTenantName(tenant.name);
    setPhone(tenant.phone || '');
    setRooms(
      tenant.rooms.map((r) => ({
        roomName: r.roomName,
        defaultRent: r.defaultRent ? formatNumber(r.defaultRent) : '',
      }))
    );
    setIsAdding(true);
  };

  const handleAddRoom = () => {
    setRooms((prev) => [...prev, { roomName: `Phòng ${prev.length + 1}`, defaultRent: '' }]);
  };

  const handleRemoveRoom = (index: number) => {
    if (rooms.length === 1) return;
    setRooms((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRoomNameChange = (index: number, value: string) => {
    setRooms((prev) =>
      prev.map((r, i) => (i === index ? { ...r, roomName: value } : r))
    );
  };

  const handleRoomRentChange = (index: number, rawValue: string) => {
    const formatted = formatInputNumber(rawValue);
    setRooms((prev) =>
      prev.map((r, i) => (i === index ? { ...r, defaultRent: formatted } : r))
    );
  };

  const handleSaveTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantName.trim()) return;

    // 1. Kiểm tra trùng lặp tên phòng ngay trong form hiện tại
    const roomNameSet = new Set<string>();
    for (const r of rooms) {
      const cleanR = r.roomName.trim().toLowerCase();
      if (!cleanR) continue;
      if (roomNameSet.has(cleanR)) {
        alert(`⚠️ Tên phòng "${r.roomName.trim()}" bị nhập trùng lặp nhiều lần trong danh sách! Vui lòng kiểm tra lại.`);
        return;
      }
      roomNameSet.add(cleanR);
    }

    // 2. Kiểm tra trùng lặp phòng với các Khách Thuê KHÁC trong hệ thống
    const otherTenants = tenants.filter((t) => t.id !== editingTenantId);
    for (const r of rooms) {
      const cleanR = r.roomName.trim().toLowerCase();
      if (!cleanR) continue;

      const conflictingTenant = otherTenants.find((t) =>
        (t.rooms || []).some((tr) => (tr.roomName || '').trim().toLowerCase() === cleanR)
      );

      if (conflictingTenant) {
        alert(`⚠️ Tên phòng "${r.roomName.trim()}" đã thuộc về khách thuê [${conflictingTenant.name}]!\nMột phòng chỉ thuộc về 1 khách thuê duy nhất.`);
        return;
      }
    }

    const formattedRooms: TenantRoom[] = rooms.map((r) => ({
      roomName: r.roomName.trim() || 'Phòng trọ',
      defaultRent: parseFormattedNumber(r.defaultRent),
    }));

    const newTenant: Tenant = {
      id: editingTenantId || `tenant-${Date.now()}`,
      name: tenantName.trim(),
      phone: phone.trim(),
      rooms: formattedRooms,
    };

    const updated = saveTenant(newTenant);
    syncTenantToCloud(newTenant.id);

    setTenants(updated);
    setIsAdding(false);
    setEditingTenantId(null);
    setTenantName('');
    setPhone('');
    setRooms([{ roomName: 'Phòng 1', defaultRent: '' }]);
  };

  const handleDeleteTenant = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Bạn có chắc muốn xóa khách thuê này?')) {
      const updated = deleteTenant(id);
      deleteTenantFromCloud(id);
      setTenants(updated);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '380px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-cyan)' }}>
            <Users size={18} /> Đăng Ký Khách & Giá Phòng
          </h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {!isAdding ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Danh sách khách thuê đã đăng ký:
              </span>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.75rem', color: 'var(--accent-cyan)', borderColor: 'rgba(6,182,212,0.4)' }}
                onClick={handleStartAdd}
              >
                <UserPlus size={13} /> Thêm khách mới
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '320px', overflowY: 'auto' }}>
              {tenants.map((tenant) => (
                <div
                  key={tenant.id}
                  className="card"
                  style={{
                    cursor: 'pointer',
                    background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(37, 99, 235, 0.1) 100%)',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    padding: '10px 12px',
                  }}
                  onClick={() => {
                    if (onSelectTenantToCalculate) {
                      onSelectTenantToCalculate(tenant);
                      onClose();
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        👤 {tenant.name}
                      </strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', marginTop: '2px', fontWeight: 600 }}>
                        {tenant.rooms.length} phòng: {tenant.rooms.map((r) => `${r.roomName} (${(r.defaultRent / 1000000).toFixed(1)}tr)`).join(', ')}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#fbbf24', borderColor: 'rgba(245,158,11,0.4)' }}
                        onClick={(e) => handleStartEdit(tenant, e)}
                        title="Chỉnh sửa thông tin khách thuê & giá phòng"
                      >
                        <Edit3 size={13} /> Sửa
                      </button>

                      <button
                        className="icon-btn"
                        style={{ color: 'var(--accent-rose)', border: 'none', background: 'transparent', width: '26px', height: '26px' }}
                        onClick={(e) => handleDeleteTenant(tenant.id, e)}
                        title="Xóa khách này"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* Form Đăng ký / Chỉnh sửa Khách & Giá Thuê Phòng */
          <form onSubmit={handleSaveTenant} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="card">
              <div className="form-group">
                <label className="form-label">{editingTenantId ? 'Chỉnh Sửa Tên Khách Thuê' : 'Tên Khách Thuê Mới'}</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '12px', textAlign: 'left' }}
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder="Ví dụ: Anh Huy, Chị Mai..."
                  required
                />
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  <Home size={15} color="#06b6d4" /> Đăng ký Phòng & Giá thuê ({rooms.length})
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                  onClick={handleAddRoom}
                >
                  <Plus size={12} /> Thêm phòng
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {rooms.map((room, idx) => (
                  <div key={idx} className="input-grid-2" style={{ alignItems: 'center' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.68rem', marginBottom: '2px' }}>Tên phòng</label>
                      <input
                        type="text"
                        className="form-input"
                        style={{ paddingLeft: '8px', fontSize: '0.8rem', textAlign: 'left' }}
                        value={room.roomName}
                        onChange={(e) => handleRoomNameChange(idx, e.target.value)}
                        placeholder={`Phòng ${idx + 1}`}
                        required
                      />
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.68rem', marginBottom: '2px' }}>Giá thuê cố định (VNĐ)</label>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="form-input"
                          style={{ paddingLeft: '8px', paddingRight: '4px', fontSize: '0.8rem', textAlign: 'left' }}
                          value={room.defaultRent}
                          onChange={(e) => handleRoomRentChange(idx, e.target.value)}
                          placeholder="Nhập giá phòng"
                          required
                        />
                        {rooms.length > 1 && (
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ color: 'var(--accent-rose)', border: 'none', background: 'transparent', width: '22px', height: '22px', flexShrink: 0 }}
                            onClick={() => handleRemoveRoom(idx)}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  setIsAdding(false);
                  setEditingTenantId(null);
                }}
              >
                Hủy
              </button>
              <button type="submit" className="btn-primary" style={{ flex: 1.5 }}>
                <Save size={15} /> {editingTenantId ? 'Cập Nhật' : 'Lưu Đăng Ký'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

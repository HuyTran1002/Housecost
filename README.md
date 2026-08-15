# 🏠 Ứng Dụng Tính Tiền Thuê Nhà (House Rent Calculator)

Ứng dụng tính tiền phòng trọ, điện nước chuyên nghiệp, hỗ trợ **Giả lập giao diện Điện thoại (Mobile Simulator)** trên trình duyệt web và **đóng gói ra file APK Android** cài trực tiếp lên điện thoại.

---

## ⚡ Công Thức Tính Tiền Tự Động

1. **Tiền Thuê Nhà**: Giá phòng cố định (VNĐ).
2. **Tiền Điện**:
   - `Số điện tiêu thụ = Số điện mới - Số điện cũ`
   - `Thành tiền điện = Số điện tiêu thụ × Đơn giá điện (Mặc định 3.000đ/kWh)`
3. **Tiền Nước (Tính 2 Bậc)**:
   - `Số nước tiêu thụ = Số nước mới - Số nước cũ`
   - **Bậc 1 (≤ 5 m³ đầu)**: `Số m³ (tối đa 5) × 11.000đ/m³`
   - **Bậc 2 (> 5 m³ tiếp theo)**: `(Số m³ - 5) × 14.000đ/m³`
4. **Cài Đặt Linh Hoạt**: Đơn giá điện và 2 bậc nước có thể thay đổi tùy chỉnh trong mục **⚙️ Cài đặt**.

---

## 📱 1. Hướng Dẫn Chạy & Test Giả Lập UI Trực Tiếp Trên Máy Tính

1. Mở terminal tại thư mục dự án:
   ```bash
   npm run dev
   ```
2. Mở đường dẫn hiển thị (ví dụ: `http://localhost:5173`) trong trình duyệt.
3. Giao diện có sẵn **Khung Giả Lập Điện Thoại (Mobile Simulator)** giúp bạn trải nghiệm đúng như đang cầm điện thoại Android/iOS.
4. Thử nghiệm nhập số điện cũ/mới, số nước cũ/mới, bấm **"Tính tiền & Xuất bill"** để nhận kết quả và thử nút **"Sao chép tin nhắn Zalo"**.

---

## 📦 2. Hướng Dẫn Đóng Gói Ra File APK Cài Đặt Trên Điện Thoại Android

Dự án đã được tích hợp sẵn **Capacitor framework**. Để build thành file `.apk`:

### Bước 1: Build bản xuất bản trang web
```bash
npm run build
```

### Bước 2: Thêm nền tảng Android (chỉ cần chạy lần đầu)
```bash
npx cap add android
```

### Bước 3: Đồng bộ mã nguồn sang ứng dụng Android
```bash
npx cap sync android
```

### Bước 4: Mở dự án trong Android Studio để xuất APK
```bash
npx cap open android
```
- Trong **Android Studio**, chọn thanh menu: **Build ➔ Build Bundle(s) / APK(s) ➔ Build APK(s)**.
- Android Studio sẽ tạo ra file **`app-debug.apk`** (hoặc `app-release.apk`).
- Copy file APK này vào điện thoại Android của bạn và cài đặt!

---

## ✨ Tính Năng Nổi Bật
- **Lưu lịch sử hóa đơn**: Tự động gợi ý chỉ số điện/nước cũ cho kỳ tính tiếp theo.
- **Sao chép hóa đơn Zalo**: Chỉ với 1 click để gửi nội dung tính tiền đẹp mắt cho người thuê.
- **Tùy chỉnh đơn giá**: Thay đổi giá điện, giá nước 2 bậc theo từng thời điểm.

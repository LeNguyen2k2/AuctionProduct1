# IIS Setup IP Guide

## 🎯 Mục tiêu
Giúp Node.js chạy qua IIS (với iisnode) vẫn lấy được **IP thật của client**, không bị hiển thị "N/A".

---

## ⚙️ Bước 1: Bật ARR (Application Request Routing)

1. Mở **IIS Manager**
2. Chọn **server** ở trên cùng (VD: `NGUYEN`)
3. Mở **Application Request Routing Cache**
4. Trong panel bên phải → chọn **Server Proxy Settings**
5. Tick ✅ **Enable proxy**
6. Nhấn **Apply**

---

## ⚙️ Bước 2: Cho phép server variable

1. Trong **IIS Manager**, chọn **server cấp cao nhất**
2. Mở **Configuration Editor**
3. Ở phần trên cùng, chọn:
   ```
   system.webServer → rewrite → allowedServerVariables
   ```
4. Bấm dấu **…** bên phải dòng `Collection`
5. Bấm **Add**
6. Nhập:
   ```
   Name: HTTP_X_FORWARDED_FOR
   Entry Type: Local
   ```
7. Nhấn **OK**, rồi **Apply** (góc phải)
8. (Khuyến nghị) Chạy `iisreset` để áp dụng thay đổi

---

## ⚙️ Bước 3: Chỉnh lại URL Rewrite rule

1. Mở site **daugia1** → chọn **URL Rewrite**
2. Chọn rule **ReverseProxyInboundR** → nhấn **Edit**
3. Cuộn xuống phần **Action**:
   ```
   Action type: Rewrite
   Rewrite URL: http://localhost:8989/{R:1}
   Append query string: ✔
   ```
4. Mở phần **Conditions** → nhấn **Add…**
   ```
   Condition input: {HTTP_X_FORWARDED_FOR}
   Check if input string: Does Not Match the Pattern
   Pattern: .*
   ```
   → Nhấn **OK** để lưu
5. Quay lại bảng **Actions (bên phải)** → chọn **View Server Variables**
   - Nhấn **Add…**
   - Nhập `HTTP_X_FORWARDED_FOR`
   - Nhấn **OK**

---

## ✅ Kết quả mong đợi
- Node.js nhận đúng IP client qua header `x-forwarded-for`
- Không còn hiển thị `IP: N/A`
- IIS reverse proxy vẫn hoạt động bình thường

---

## 🧠 Ghi chú
Nếu vẫn thấy `N/A`, kiểm tra:
- `ARR` có bật proxy chưa  
- `HTTP_X_FORWARDED_FOR` có nằm trong danh sách server variables  
- Rule có phần Conditions như hướng dẫn trên

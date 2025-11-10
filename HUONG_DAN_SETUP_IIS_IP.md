# HƯỚNG DẪN SETUP IIS ĐỂ LẤY IP CLIENT

## 📋 Mục lục
1. [Vấn đề](#vấn-đề)
2. [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
3. [Các bước cài đặt](#các-bước-cài-đặt)
4. [Cấu hình code](#cấu-hình-code)
5. [Kiểm tra kết quả](#kiểm-tra-kết-quả)
6. [Troubleshooting](#troubleshooting)

---

## 🔴 Vấn đề

Khi chạy Node.js trực tiếp, có thể lấy IP client qua `req.socket.remoteAddress`. 

**Nhưng khi chạy qua IIS/iisnode:**
- IIS sử dụng **Named Pipe** (`\\.\pipe\xxx`) thay vì TCP socket
- `req.socket.remoteAddress` trả về `undefined` hoặc `localhost`
- Không thể lấy IP client bằng cách thông thường

**Giải pháp:** Sử dụng IIS URL Rewrite Module để forward IP client vào HTTP header `X-Forwarded-For`

---

## ✅ Yêu cầu hệ thống

### 1. IIS Features
Bật các tính năng sau trong Windows Features:

```
☑️ Internet Information Services
  ☑️ Web Management Tools
    ☑️ IIS Management Console
  ☑️ World Wide Web Services
    ☑️ Application Development Features
      ☑️ WebSocket Protocol
    ☑️ Common HTTP Features
      ☑️ Default Document
      ☑️ Static Content
    ☑️ Health and Diagnostics
      ☑️ HTTP Logging
```

### 2. Cài đặt IIS Modules

#### a) **URL Rewrite Module** (BẮT BUỘC)
- Download: https://www.iis.net/downloads/microsoft/url-rewrite
- Hoặc: https://www.microsoft.com/en-us/download/details.aspx?id=47337
- Install và khởi động lại IIS

#### b) **Application Request Routing (ARR)** (BẮT BUỘC)
- Download: https://www.iis.net/downloads/microsoft/application-request-routing
- Hoặc: https://www.microsoft.com/en-us/download/details.aspx?id=47333
- Install và khởi động lại IIS

#### c) **iisnode**
- Download: https://github.com/Azure/iisnode/releases
- Chọn phiên bản phù hợp (x64 hoặc x86)
- Install

### 3. Node.js Packages
```bash
npm install express mssql socket.io cors multer
```

---

## 🛠️ Các bước cài đặt

### BƯỚC 1: Cấu hình ARR (Application Request Routing)

1. Mở **IIS Manager**
2. Chọn **Server name** (root level, không phải site)
3. Double-click **Application Request Routing Cache**
4. Click **Server Proxy Settings** ở panel bên phải
5. **☑️ Enable proxy**
6. **☑️ Preserve host header in request** (QUAN TRỌNG!)
7. Click **Apply**

![ARR Settings](https://i.imgur.com/example1.png)

---

### BƯỚC 1.5: Thêm Server Variable HTTP_X_FORWARDED_FOR (QUAN TRỌNG!)

**Cách 1: Thêm tại Server Level**

1. Vẫn ở **IIS Manager** → chọn **Server name** (root level)
2. Double-click **URL Rewrite**
3. Click **View Server Variables** ở panel bên phải
4. Click **Add...**
5. Nhập: `HTTP_X_FORWARDED_FOR`
6. Click **OK**

**Cách 2: Thêm trong URL Rewrite Rule của Site**

1. Mở **IIS Manager** → chọn **Site của bạn** (ví dụ: daugia1 hoặc AuctionProduct)
2. Double-click **URL Rewrite**
3. Chọn rule **ReverseProxyInboundR** (hoặc rule chính bạn đang dùng)
4. Click **Edit** ở panel bên phải
5. Trong phần **Actions** → click **View Server Variables** (ở góc phải)
6. Click **Add...**
7. Nhập:
   - **Server variable name:** `HTTP_X_FORWARDED_FOR`
   - **Value:** `{REMOTE_ADDR}`
   - **☑️ Replace existing value**
8. Click **OK**
9. Click **Apply** để lưu rule

**Kiểm tra:**
- Sau khi thêm, bạn sẽ thấy `HTTP_X_FORWARDED_FOR` xuất hiện trong danh sách **Allowed Server Variables**
- Rule sẽ tự động set giá trị `{REMOTE_ADDR}` (IP client thực) vào header `X-Forwarded-For`

---

### BƯỚC 2: Tạo file web.config

Tạo file `web.config` trong thư mục root của website:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <!-- IISNode Configuration -->
    <handlers>
      <add name="iisnode" path="server.js" verb="*" modules="iisnode" />
    </handlers>

    <iisnode 
      node_env="production"
      nodeProcessCountPerApplication="1"
      maxConcurrentRequestsPerProcess="1024"
      maxNamedPipeConnectionRetry="100"
      namedPipeConnectionRetryDelay="250"
      watchedFiles="web.config;*.js"
      loggingEnabled="true"
      logDirectory="iisnode"
      debuggingEnabled="false"
      devErrorsEnabled="false"
    />

    <!-- URL Rewrite Rules -->
    <rewrite>
      <!-- ⚠️ QUAN TRỌNG: Clear để tránh duplicate entry -->
      <allowedServerVariables>
        <clear />
        <add name="HTTP_X_FORWARDED_FOR" />
      </allowedServerVariables>

      <rules>
        <!-- Rule 1: Socket.IO WebSocket Support + IP Forwarding -->
        <rule name="SocketIO" patternSyntax="ECMAScript" stopProcessing="true">
          <match url="socket.io.+"/>
          <conditions logicalGrouping="MatchAll" trackAllCaptures="false" />
          <serverVariables>
            <!-- 🔑 ĐÂY LÀ PHẦN QUAN TRỌNG: Forward IP client -->
            <set name="HTTP_X_FORWARDED_FOR" value="{REMOTE_ADDR}" />
          </serverVariables>
          <action type="Rewrite" url="server.js"/>
        </rule>

        <!-- Rule 2: Node Inspector Debugger (optional) -->
        <rule name="NodeInspector" patternSyntax="ECMAScript" stopProcessing="true">
          <match url="^server.js\/debug[\/]?" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_FOR" value="{REMOTE_ADDR}" />
          </serverVariables>
          <action type="Rewrite" url="node_modules/node-inspector/bin/inspector.js"/>
        </rule>

        <!-- Rule 3: Tất cả requests khác -->
        <rule name="DynamicContent">
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="True"/>
          </conditions>
          <serverVariables>
            <set name="HTTP_X_FORWARDED_FOR" value="{REMOTE_ADDR}" />
          </serverVariables>
          <action type="Rewrite" url="server.js"/>
        </rule>

        <!-- Rule 4: Static Files -->
        <rule name="StaticContent">
          <action type="Rewrite" url="public{REQUEST_URI}"/>
        </rule>
      </rules>
    </rewrite>

    <!-- Security Settings -->
    <security>
      <requestFiltering>
        <hiddenSegments>
          <remove segment="bin"/>
        </hiddenSegments>
      </requestFiltering>
    </security>

    <!-- HTTP Errors -->
    <httpErrors existingResponse="PassThrough" />

    <!-- Default Document -->
    <defaultDocument enabled="true">
      <files>
        <add value="public/index.html" />
      </files>
    </defaultDocument>

    <!-- Static Content -->
    <staticContent>
      <mimeMap fileExtension=".json" mimeType="application/json" />
      <mimeMap fileExtension=".woff" mimeType="application/font-woff" />
      <mimeMap fileExtension=".woff2" mimeType="application/font-woff2" />
    </staticContent>

  </system.webServer>
</configuration>
```

---

### BƯỚC 2.5: Cấu hình URL Rewrite Rule nếu dùng Reverse Proxy (Tùy chọn)

**Nếu bạn đang dùng Reverse Proxy Rule (ví dụ: ReverseProxyInboundR):**

1. Mở **IIS Manager** → chọn **Site của bạn**
2. Double-click **URL Rewrite**
3. Chọn rule **ReverseProxyInboundR** → click **Edit**
4. Kiểm tra cấu hình:

   **Action:**
   ```
   Action type: Rewrite
   Rewrite URL: http://localhost:8989/{R:1}
   ☑️ Append query string
   ☑️ Log rewritten URL
   ```

5. **Thêm Condition** (để đảm bảo header được tạo đúng):
   - Click **Add Condition...**
   - **Condition input:** `{HTTP_X_FORWARDED_FOR}`
   - **Check if input string:** `Does Not Match the Pattern`
   - **Pattern:** `.*`
   - Click **OK**
   
   *(Mục đích: Đảm bảo luôn tạo header mới nếu chưa có)*

6. **Thêm Server Variable:**
   - Ở phần **Action** → click **View Server Variables**
   - Click **Add...**
   - **Server variable name:** `HTTP_X_FORWARDED_FOR`
   - **Value:** `{REMOTE_ADDR}`
   - **☑️ Replace existing value**
   - Click **OK**

7. Click **Apply** để lưu

**Lưu ý:** 
- Nếu dùng Reverse Proxy thì KHÔNG cần file web.config phức tạp
- Nhưng nếu dùng iisnode trực tiếp thì CẦN web.config như ở Bước 2

---

### BƯỚC 3: Cấu hình Node.js/Express

#### File `server.js`:

```javascript
const express = require('express');
const app = express();

// 🔑 BẮT BUỘC: Enable trust proxy để Express đọc X-Forwarded-For header
app.set('trust proxy', true);

// Middleware để log IP
app.use((req, res, next) => {
  console.log('Client IP:', req.ip);
  console.log('X-Forwarded-For:', req.headers['x-forwarded-for']);
  next();
});

// Hàm lấy IP client
function getClientIP(req) {
  // Ưu tiên X-Forwarded-For (do IIS forward)
  let clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim();
  
  // Fallback: req.ip (Express tự động parse từ X-Forwarded-For nếu trust proxy = true)
  if (!clientIP || clientIP === '::1' || clientIP === 'localhost') {
    clientIP = req.ip;
  }
  
  // Fallback cuối cùng
  if (!clientIP || clientIP === '::1' || clientIP === 'localhost') {
    clientIP = req.socket.remoteAddress;
  }
  
  // Loại bỏ ::ffff: prefix (IPv6-mapped IPv4)
  if (clientIP?.startsWith('::ffff:')) {
    clientIP = clientIP.substring(7);
  }
  
  return clientIP || 'N/A';
}

// Example API endpoint
app.post('/api/place-bid/:id', async (req, res) => {
  const clientIP = getClientIP(req);
  console.log('Bid from IP:', clientIP);
  
  // Lưu IP vào database
  const query = `
    INSERT INTO Daugia (MaProduct, TenNguoiDauGia, GiaHienTai, Note, IP, CreatedAt)
    VALUES (@MaProduct, @TenNguoiDauGia, @GiaHienTai, @Note, @IP, GETDATE())
  `;
  
  // ... execute query với @IP = clientIP
  
  res.json({ success: true, ip: clientIP });
});

// Test endpoint
app.get('/test-ip', (req, res) => {
  const clientIP = getClientIP(req);
  res.send(`
    <h1>IP Detection Test</h1>
    <p><strong>Your IP:</strong> ${clientIP}</p>
    <p><strong>req.ip:</strong> ${req.ip}</p>
    <p><strong>X-Forwarded-For:</strong> ${req.headers['x-forwarded-for'] || 'N/A'}</p>
    <p><strong>req.socket.remoteAddress:</strong> ${req.socket.remoteAddress || 'N/A'}</p>
  `);
});

const PORT = process.env.PORT || 8989;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

---

### BƯỚC 4: Setup IIS Site

1. Mở **IIS Manager**
2. Right-click **Sites** → **Add Website**
3. Cấu hình:
   ```
   Site name: AuctionProduct
   Physical path: D:\AuctionProduct1-main
   Binding: 
     - Type: http
     - IP address: All Unassigned (hoặc chọn IP cụ thể)
     - Port: 8989
     - Hostname: (để trống hoặc nhập domain)
   ```
4. Click **OK**

#### Cấu hình Application Pool:
1. Click vào **Application Pools**
2. Tìm pool của site (thường cùng tên)
3. Right-click → **Advanced Settings**
4. Đặt:
   ```
   .NET CLR Version: No Managed Code
   Enable 32-Bit Applications: False (nếu dùng Node.js 64-bit)
   Identity: ApplicationPoolIdentity
   ```

---

### BƯỚC 5: Cấp quyền cho thư mục

1. Right-click thư mục `D:\AuctionProduct1-main`
2. **Properties** → **Security** → **Edit**
3. Click **Add**
4. Nhập: `IIS_IUSRS` và `IUSR`
5. Click **Check Names** → **OK**
6. Cấp quyền:
   ```
   ☑️ Read & Execute
   ☑️ List folder contents
   ☑️ Read
   ☑️ Write (nếu cần upload file)
   ```

---

## 🧪 Kiểm tra kết quả

### Test 1: Truy cập test endpoint
```
http://192.168.10.67:8989/test-ip
```

**Kết quả mong đợi:**
```
IP Detection Test
Your IP: 192.168.10.17
req.ip: 192.168.10.17
X-Forwarded-For: 192.168.10.17
req.socket.remoteAddress: \\.\pipe\xxx (hoặc undefined)
```

### Test 2: Kiểm tra database
```sql
-- Thực hiện 1 bid từ client
-- Sau đó query:
SELECT TOP 10 
    TenNguoiDauGia, 
    GiaHienTai, 
    IP, 
    CreatedAt 
FROM Daugia 
ORDER BY CreatedAt DESC
```

**Kết quả mong đợi:**
```
TenNguoiDauGia | GiaHienTai | IP              | CreatedAt
---------------|------------|-----------------|------------------
Nguyễn         | 30000000   | 192.168.10.17   | 2025-01-15 10:30
```

### Test 3: Kiểm tra IIS Logs
```
C:\inetpub\logs\LogFiles\W3SVC1\
```

Tìm dòng có pattern:
```
192.168.10.17 GET /socket.io/... 200 0 0 15
```

---

## 🐛 Troubleshooting

### Lỗi 1: IP vẫn là localhost hoặc undefined

**Nguyên nhân:**
- Chưa enable ARR
- Chưa set `trust proxy` trong Express
- Chưa add `HTTP_X_FORWARDED_FOR` vào allowedServerVariables

**Giải pháp:**
1. Kiểm tra ARR đã enable chưa:
   ```
   IIS Manager → Server Level → Application Request Routing Cache 
   → Server Proxy Settings → ☑️ Enable proxy
   ```

2. Kiểm tra web.config có đầy đủ:
   ```xml
   <allowedServerVariables>
     <clear />
     <add name="HTTP_X_FORWARDED_FOR" />
   </allowedServerVariables>
   ```

3. Kiểm tra Express code:
   ```javascript
   app.set('trust proxy', true);
   ```

---

### Lỗi 2: Cannot add duplicate collection entry of type 'add'

**Nguyên nhân:**
- `HTTP_X_FORWARDED_FOR` đã được define ở server level (applicationHost.config)
- web.config cố gắng add lại → duplicate

**Giải pháp:**
Thêm `<clear />` TRƯỚC khi add:
```xml
<allowedServerVariables>
  <clear />
  <add name="HTTP_X_FORWARDED_FOR" />
</allowedServerVariables>
```

---

### Lỗi 3: 500.52 - URL Rewrite Module Error

**Nguyên nhân:**
- Server variable bị lock ở server level

**Giải pháp:**
1. Mở `C:\Windows\System32\inetsrv\config\applicationHost.config`
2. Tìm section `<rewrite>`
3. Đảm bảo có:
   ```xml
   <rewrite>
     <allowedServerVariables>
       <add name="HTTP_X_FORWARDED_FOR" />
     </allowedServerVariables>
   </rewrite>
   ```

4. Hoặc unlock bằng PowerShell (Run as Admin):
   ```powershell
   cd C:\Windows\System32\inetsrv
   .\appcmd.exe unlock config -section:system.webServer/rewrite/allowedServerVariables
   ```

---

### Lỗi 4: Socket.io không hoạt động

**Nguyên nhân:**
- WebSocket Protocol chưa được enable
- URL Rewrite rule cho socket.io chưa đúng

**Giải pháp:**
1. Enable WebSocket trong Windows Features:
   ```
   Control Panel → Programs → Turn Windows features on or off
   → Internet Information Services 
   → World Wide Web Services 
   → Application Development Features
   → ☑️ WebSocket Protocol
   ```

2. Restart IIS:
   ```cmd
   iisreset
   ```

3. Kiểm tra rule SocketIO trong web.config:
   ```xml
   <rule name="SocketIO" patternSyntax="ECMAScript" stopProcessing="true">
     <match url="socket.io.+"/>
     <serverVariables>
       <set name="HTTP_X_FORWARDED_FOR" value="{REMOTE_ADDR}" />
     </serverVariables>
     <action type="Rewrite" url="server.js"/>
   </rule>
   ```

---

### Lỗi 5: IP hiển thị ::1 hoặc ::ffff:192.168.10.17

**Nguyên nhân:**
- IPv6 format

**Giải pháp:**
Thêm code xử lý IPv6:
```javascript
function getClientIP(req) {
  let clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
  
  // Remove IPv6 prefix
  if (clientIP?.startsWith('::ffff:')) {
    clientIP = clientIP.substring(7);
  }
  
  // Convert ::1 (localhost) to 127.0.0.1
  if (clientIP === '::1') {
    clientIP = '127.0.0.1';
  }
  
  return clientIP;
}
```

---

## 📊 Kiến trúc tổng quan

```
[Client Browser]
      ↓ (HTTP Request với IP: 192.168.10.17)
      ↓
[IIS - Port 8989]
      ↓ (URL Rewrite: Add X-Forwarded-For: 192.168.10.17)
      ↓
[iisnode via Named Pipe]
      ↓
[Node.js/Express]
      ↓ (req.headers['x-forwarded-for'] = '192.168.10.17')
      ↓ (trust proxy = true → req.ip = '192.168.10.17')
      ↓
[Database: Save IP]
```

---

## 📝 Checklist tổng hợp

### Phase 1: Cài đặt modules
- [ ] Cài IIS với WebSocket Protocol
- [ ] Cài URL Rewrite Module
- [ ] Cài Application Request Routing (ARR)
- [ ] Cài iisnode

### Phase 2: Cấu hình ARR
- [ ] Enable ARR Proxy với preserveHostHeader
- [ ] Thêm Server Variable `HTTP_X_FORWARDED_FOR` (tại Server level hoặc Site level)
- [ ] Verify Server Variable xuất hiện trong danh sách Allowed Server Variables

### Phase 3: Cấu hình URL Rewrite
- [ ] Tạo web.config với allowedServerVariables
- [ ] Add `<clear />` để tránh duplicate
- [ ] Set server variables trong rewrite rules: `<set name="HTTP_X_FORWARDED_FOR" value="{REMOTE_ADDR}" />`
- [ ] (Nếu dùng Reverse Proxy) Thêm Condition: `{HTTP_X_FORWARDED_FOR}` Does Not Match `.*`
- [ ] (Nếu dùng Reverse Proxy) Thêm Server Variable trong Action với value `{REMOTE_ADDR}`

### Phase 4: Cấu hình Node.js
- [ ] Enable `trust proxy` trong Express: `app.set('trust proxy', true);`
- [ ] Implement getClientIP() function để đọc từ `req.headers['x-forwarded-for']`
- [ ] Test với endpoint /test-ip

### Phase 5: Permissions & Testing
- [ ] Cấp quyền cho IIS_IUSRS và IUSR
- [ ] Test endpoint /test-ip → verify IP hiển thị đúng
- [ ] Thực hiện bid → verify IP trong database
- [ ] Check IIS logs để xác nhận IP được ghi đúng

---

## ✅ Kết luận

Sau khi hoàn thành các bước trên:
- ✅ IIS có thể lấy IP client qua X-Forwarded-For header
- ✅ Node.js/Express đọc được IP từ `req.headers['x-forwarded-for']`
- ✅ IP được lưu chính xác vào database
- ✅ Hệ thống hoạt động ổn định với IIS/iisnode

**Lưu ý quan trọng:**
1. Luôn dùng `<clear />` trong allowedServerVariables để tránh duplicate
2. Phải enable `trust proxy` trong Express
3. ARR module BẮT BUỘC phải có
4. WebSocket Protocol cần enable cho Socket.io

---

**Tác giả:** AuctionProduct Team  
**Ngày cập nhật:** 15/01/2025  
**Phiên bản:** 1.0

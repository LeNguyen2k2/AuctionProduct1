# ⚙️ HƯỚNG DẪN SETUP IIS ĐỂ LẤY IP CLIENT

## 🔍 Vấn đề
Khi chạy Node.js trực tiếp, có thể lấy IP client qua `req.socket.remoteAddress`.

❌ Nhưng khi chạy qua **IIS/iisnode**:
- IIS dùng Named Pipe (`\\.\pipe\...`) thay vì TCP.
- `req.socket.remoteAddress` trả về `undefined` hoặc `localhost`.
- Không lấy được IP thật.

✅ **Giải pháp:** Dùng **URL Rewrite + ARR** để forward IP client vào header `X-Forwarded-For`.

---

## ⚙️ Cài đặt cần thiết

### 1. Bật IIS Features
```
Internet Information Services
 ├─ Web Management Tools → IIS Management Console
 ├─ World Wide Web Services
 │  ├─ Application Development Features → WebSocket Protocol
 │  ├─ Common HTTP Features → Default Document, Static Content
 │  └─ Health and Diagnostics → HTTP Logging
```

### 2. Cài đặt các module
| Module | Bắt buộc | Link tải |
|---------|-----------|----------|
| URL Rewrite | ✅ | [iis.net/downloads/url-rewrite](https://www.iis.net/downloads/microsoft/url-rewrite) |
| Application Request Routing (ARR) | ✅ | [iis.net/downloads/arr](https://www.iis.net/downloads/microsoft/application-request-routing) |
| iisnode | ✅ | [github.com/Azure/iisnode](https://github.com/Azure/iisnode/releases) |

---

## 🛠️ Cấu hình IIS

### 1. Bật ARR Proxy
- Mở **IIS Manager** → chọn **Server name**
- Vào **Application Request Routing Cache**
- Click **Server Proxy Settings**
- ✅ Enable Proxy  
- ✅ Preserve Host Header  
- Apply → OK

---

### 2. Thêm biến `HTTP_X_FORWARDED_FOR`
**Tại Server Level (khuyến nghị):**
1. Mở **IIS Manager** → chọn **Server name**
2. Mở **Configuration Editor**
3. Chọn:
   ```
   Section: system.webServer/rewrite/allowedServerVariables
   ```
4. Click `...` ở Collection → Add
5. Nhập:
   ```
   Name: HTTP_X_FORWARDED_FOR
   Entry Type: Local
   ```
6. Apply → OK

---

## 📁 web.config (ví dụ)
```xml
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="server.js" verb="*" modules="iisnode" />
    </handlers>

    <iisnode node_env="production" loggingEnabled="true" />

    <rewrite>
      <allowedServerVariables>
        <clear />
        <add name="HTTP_X_FORWARDED_FOR" />
      </allowedServerVariables>

      <rules>
        <rule name="DynamicContent">
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="True"/>
          </conditions>
          <serverVariables>
            <set name="HTTP_X_FORWARDED_FOR" value="{REMOTE_ADDR}" />
          </serverVariables>
          <action type="Rewrite" url="server.js"/>
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

---

## 🧩 Code Node.js
```js
app.set('trust proxy', true);

function getClientIP(req) {
  let ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip;
}

app.get('/test-ip', (req, res) => {
  res.send({ ip: getClientIP(req) });
});
```

---

## ✅ Kiểm tra kết quả
Truy cập từ máy khác:  
```
http://<server-ip>:<port>/test-ip
```
Nếu cấu hình đúng → hiển thị IP thật của client.  
Nếu hiển thị `N/A` → kiểm tra lại bước thêm `HTTP_X_FORWARDED_FOR` tại server level.

---

## ⚠️ Troubleshooting nhanh
| Lỗi | Nguyên nhân | Giải pháp |
|------|--------------|-----------|
| 500.52 URL Rewrite Error | `allowedServerVariables` bị lock | Mở PowerShell (Admin):<br>`appcmd unlock config -section:system.webServer/rewrite/allowedServerVariables` |
| IP = ::1 hoặc ::ffff:... | IPv6 format | Dùng hàm `getClientIP()` (đã có xử lý) |
| Socket.io lỗi | Chưa bật WebSocket Protocol | Bật lại trong Windows Features |

---

## 📝 Checklist
- [x] IIS + WebSocket Protocol  
- [x] URL Rewrite + ARR  
- [x] Cho phép `HTTP_X_FORWARDED_FOR`  
- [x] web.config có `<set name="HTTP_X_FORWARDED_FOR" value="{REMOTE_ADDR}" />`  
- [x] Express bật `trust proxy`  

---

**Tác giả:** Nguyen 
**Phiên bản:** 1.0  
**Cập nhật:** 10/11/2025

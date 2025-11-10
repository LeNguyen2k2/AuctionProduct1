
const express = require('express');
// const { sso } = require('node-expose-sspi'); // TẮT WINDOWS AUTH TẠM THỜI
const sql = require('mssql');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./dbconfig');
const ExcelJS = require('exceljs');

const app = express();

// Trust proxy - QUAN TRỌNG cho IIS/iisnode
app.set('trust proxy', true);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Middleware log IP để debug
app.use((req, res, next) => {
  if (req.path === '/test-ip' || req.path === '/api/get-client-ip') {
    console.log('=== IP Debug ===');
    console.log('req.ip:', req.ip);
    console.log('req.ips:', req.ips);
    console.log('req.socket.remoteAddress:', req.socket?.remoteAddress);
    console.log('req.connection:', req.connection);
    console.log('req.headers[x-forwarded-for]:', req.headers['x-forwarded-for']);
    console.log('req.headers[x-real-ip]:', req.headers['x-real-ip']);
    console.log('req.headers[x-client-ip]:', req.headers['x-client-ip']);
    console.log('All headers:', JSON.stringify(req.headers, null, 2));
    console.log('iisnode headers:', Object.keys(req.headers).filter(k => k.startsWith('x-iisnode')));
    console.log('================');
  }
  next();
});

// TẮT WINDOWS AUTHENTICATION TẠM THỜI
// app.use(sso.auth());

// Xử lý favicon.ico để tránh lỗi 404
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No Content
});

// API test: trả về thông tin user đăng nhập (TẠM THỜI TRẢ VỀ MOCK DATA)
app.get('/api/whoami', (req, res) => {
  res.json({
    authenticated: false,
    message: 'Windows Authentication is temporarily disabled'
  });
});

// --- SOCKET.IO ---
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

// Gửi socket.io client
app.get('/socket.io.js', (req, res) => {
  res.sendFile(require.resolve('socket.io-client/dist/socket.io.js'));
});

// ensure uploads folder exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Tạo pool toàn cục, tái sử dụng cho mọi truy vấn
let poolPromise;
function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config);
  }
  return poolPromise;
}

// Kiểm tra kết nối khi khởi động
getPool().then(() => {
  console.log('✅ Connected to SQL Server');
}).catch(err => {
  console.error('❌ DB Connection Error:', err.message || err);
});

// multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const safe = Date.now() + '_' + file.originalname.replace(/\s+/g, '_');
    cb(null, safe);
  }
});
const upload = multer({ storage });

// ========== API QUẢN LÝ THỜI GIAN ĐẤU GIÁ ==========

// Biến lưu thời gian đấu giá (có thể lưu vào DB nếu cần)
let auctionTimes = {
  startTime: null,
  endTime: null
};

// ========== API QUẢN LÝ TOKEN ==========

// Tạo token cho client
app.post('/api/create-token', async (req, res) => {
  try {
    const { nickname } = req.body;
    
    if (!nickname) {
      return res.status(400).json({ 
        success: false, 
        message: 'Nickname is required' 
      });
    }
    
    // Tạo token đơn giản từ timestamp và random number
    const token = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('✅ Token created for:', nickname);
    
    res.json({ 
      success: true, 
      token: token,
      message: 'Token created successfully' 
    });
    
  } catch (err) {
    console.error('Error creating token:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating token: ' + err.message 
    });
  }
});

// API lấy IP client từ server
app.get('/api/get-client-ip', (req, res) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIP = req.headers['x-real-ip'];
  const socketIP = req.socket.remoteAddress;
  const expressIP = req.ip;
  
  let clientIP = 'unknown';
  if (forwardedFor) {
    clientIP = forwardedFor.split(',')[0].trim();
  } else if (realIP) {
    clientIP = realIP;
  } else if (socketIP) {
    clientIP = socketIP;
  } else if (expressIP) {
    clientIP = expressIP;
  }
  
  // Normalize IP (xóa ::ffff: prefix nếu có)
  const normalizedIP = clientIP.replace(/^::ffff:/, '');
  
  res.json({ 
    serverIP: normalizedIP,
    rawIP: clientIP,
    sources: {
      'x-forwarded-for': forwardedFor || null,
      'x-real-ip': realIP || null,
      'socket.remoteAddress': socketIP || null,
      'express req.ip': expressIP || null
    },
    headers: req.headers
  });
});

// API test IP - Trang HTML để xem IP của bạn
app.get('/test-ip', (req, res) => {
  // Lấy IP từ nhiều nguồn
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIP = req.headers['x-real-ip'];
  const socketIP = req.socket?.remoteAddress;
  const expressIP = req.ip;
  
  // Ưu tiên x-forwarded-for (từ IIS/proxy)
  let clientIP = 'Unavailable (IIS/iisnode via named pipe)';
  let detectedFrom = 'N/A';
  
  if (forwardedFor) {
    clientIP = forwardedFor.split(',')[0].trim();
    detectedFrom = 'X-Forwarded-For header';
  } else if (realIP) {
    clientIP = realIP;
    detectedFrom = 'X-Real-IP header';
  } else if (socketIP) {
    clientIP = socketIP;
    detectedFrom = 'Socket Remote Address';
  } else if (expressIP) {
    clientIP = expressIP;
    detectedFrom = 'Express req.ip';
  }
  
  const normalizedIP = String(clientIP).replace(/^::ffff:/, '');
  const isLocalhost = clientIP.includes('localhost') || clientIP.includes('Unavailable');
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>IP Test - Auction System</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          max-width: 800px; 
          margin: 50px auto; 
          padding: 20px;
          background: #f5f5f5;
        }
        .card {
          background: white;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 { color: #333; margin-top: 0; }
        .ip-display {
          background: #007bff;
          color: white;
          padding: 20px;
          border-radius: 5px;
          font-size: 24px;
          text-align: center;
          margin: 20px 0;
          font-weight: bold;
        }
        .info {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
          margin: 10px 0;
        }
        .label {
          font-weight: bold;
          color: #555;
        }
        pre {
          background: #f8f9fa;
          padding: 10px;
          border-radius: 5px;
          overflow-x: auto;
        }
        .btn {
          background: #28a745;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
          margin: 10px 5px;
        }
        .btn:hover {
          background: #218838;
        }
        .btn-secondary {
          background: #6c757d;
        }
        .btn-secondary:hover {
          background: #5a6268;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🌐 IP Address Test</h1>
        
        <div class="ip-display" style="background: ${isLocalhost ? '#dc3545' : '#007bff'};">
          ${normalizedIP}
        </div>
        
        ${isLocalhost ? `
        <div class="info" style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px;">
          <div class="label" style="color: #856404;">⚠️ Lưu ý về IP Detection:</div>
          <div style="color: #856404; margin-top: 10px;">
            <strong>Vấn đề:</strong> IIS + iisnode sử dụng named pipe, không thể lấy IP từ Node.js<br>
            <strong>Giải pháp:</strong>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>Cài đặt <strong>Application Request Routing (ARR)</strong> module cho IIS</li>
              <li>Download: <a href="https://www.iis.net/downloads/microsoft/application-request-routing" target="_blank">IIS ARR</a></li>
              <li>Sau khi cài, IIS sẽ tự động thêm X-Forwarded-For header</li>
            </ul>
            <strong>Tạm thời:</strong> Hệ thống sẽ lưu IP là "unknown" khi đấu giá
          </div>
        </div>
        ` : `
        <div class="info" style="background: #d4edda; border-left: 4px solid #28a745;">
          <div class="label" style="color: #155724;">✅ IP Detected Successfully!</div>
          <div style="color: #155724; margin-top: 5px;">Source: ${detectedFrom}</div>
        </div>
        `}
        
        <div class="info">
          <div class="label">Raw IP (from server):</div>
          <div>${clientIP}</div>
        </div>
        
        <div class="info">
          <div class="label">Connection Info:</div>
          <div>Socket Remote: ${socketIP || 'N/A'}</div>
          <div>Express IP: ${expressIP || 'N/A'}</div>
          <div>X-Forwarded-For: ${forwardedFor || 'N/A'}</div>
          <div>X-Real-IP: ${realIP || 'N/A'}</div>
        </div>
        
        <div class="info">
          <div class="label">Request Headers:</div>
          <pre>${JSON.stringify(req.headers, null, 2)}</pre>
        </div>
        
        <div style="margin-top: 20px; text-align: center;">
          <button class="btn" onclick="location.reload()">🔄 Refresh</button>
          <button class="btn btn-secondary" onclick="location.href='/'">🏠 Home</button>
          <button class="btn btn-secondary" onclick="testAPI()">🧪 Test API</button>
        </div>
        
        <div id="apiResult" style="margin-top: 20px;"></div>
      </div>
      
      <script>
        async function testAPI() {
          try {
            const res = await fetch('/api/get-client-ip');
            const data = await res.json();
            document.getElementById('apiResult').innerHTML = 
              '<div class="info"><div class="label">API Response:</div><pre>' + 
              JSON.stringify(data, null, 2) + '</pre></div>';
          } catch (err) {
            document.getElementById('apiResult').innerHTML = 
              '<div class="info" style="background: #f8d7da; color: #721c24;">Error: ' + err.message + '</div>';
          }
        }
        
        console.log('Your IP:', '${normalizedIP}');
        console.log('Raw IP:', '${clientIP}');
      </script>
    </body>
    </html>
  `);
});

// Lấy thời gian đấu giá hiện tại
app.get('/api/auction-time', (req, res) => {
  res.json(auctionTimes);
});

// Cập nhật thời gian đấu giá (Admin)
app.post('/api/auction-time', (req, res) => {
  const { startTime, endTime } = req.body;
  
  if (!startTime || !endTime) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin thời gian' });
  }
  
  if (new Date(startTime) >= new Date(endTime)) {
    return res.status(400).json({ success: false, message: 'Thời gian bắt đầu phải trước thời gian kết thúc' });
  }
  
  auctionTimes.startTime = startTime;
  auctionTimes.endTime = endTime;
  
  // Broadcast thời gian mới đến tất cả clients
  io.emit('auctionTimeUpdated', auctionTimes);
  
  res.json({ success: true, message: 'Cập nhật thời gian thành công', data: auctionTimes });
});

// Reset thời gian về null
app.post('/api/auction-time/reset', async (req, res) => {
  auctionTimes.startTime = null;
  auctionTimes.endTime = null;
  
  // Broadcast reset đến tất cả clients
  io.emit('auctionTimeUpdated', auctionTimes);
  
  res.json({ success: true, message: 'Đã reset thời gian đấu giá' });
});

// ========== API SẢN PHẨM ==========

// API: get products
app.get('/api/products', async (req, res) => {
  try {
    const pool = await getPool();
    // JOIN với bảng Daugia để lấy IP của đấu giá mới nhất
    const result = await pool.request().query(`
      SELECT 
        p.*,
        d.IP as LastBidIP
      FROM Product p
      LEFT JOIN (
        SELECT MaProduct, IP, ROW_NUMBER() OVER (PARTITION BY MaProduct ORDER BY CreatedAt DESC) as rn
        FROM Daugia
      ) d ON p.MaProduct = d.MaProduct AND d.rn = 1
      ORDER BY p.MaProduct
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching products');
  }
});

// API: get all bids (for admin)
app.get('/api/daugia', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT TOP 50 * FROM Daugia ORDER BY CreatedAt DESC');
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching bids');
  }
});

// API: lấy danh sách đấu giá theo sản phẩm
app.get('/api/bid-details/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const pool = await getPool();
    const result = await pool.request()
      .input('productId', sql.Int, productId)
      .query('SELECT ID, TenNguoiDauGia, GiaHienTai, IP, Note, CreatedAt FROM Daugia WHERE MaProduct = @productId ORDER BY CreatedAt DESC');
    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching bid details:', err);
    res.status(500).json({ error: 'Error fetching bid details', message: err.message });
  }
});

// Cập nhật API PUT /api/products/:id
app.put('/api/products/:id', upload.array('hinhAnh', 4), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { tenProduct, giaKhoiDiem, giaHienTai, tenNguoiDauGia, moTa } = req.body;
    
    console.log('📝 Updating product:', id);
    console.log('Request body:', req.body);
    console.log('Files uploaded:', req.files ? req.files.length : 0);
    
    const pool = await getPool();
    
    let hinhAnh = null;
    if (req.files && req.files.length > 0) {
      hinhAnh = req.files.map(f => '/uploads/' + f.filename).join(',');
    } else {
      // Nếu không upload ảnh mới, giữ nguyên ảnh cũ
      const q = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT HinhAnh FROM Product WHERE MaProduct=@id');
      hinhAnh = q.recordset.length ? q.recordset[0].HinhAnh : null;
    }
    
    // Xử lý giá hiện tại và người đấu giá
    const giaHienTaiValue = giaHienTai && giaHienTai.trim() !== '' ? parseFloat(giaHienTai) : null;
    const tenNguoiDauGiaValue = tenNguoiDauGia && tenNguoiDauGia.trim() !== '' ? tenNguoiDauGia : null;
    
    // Cập nhật sản phẩm
    const request = pool.request()
      .input('tenProduct', sql.NVarChar, tenProduct)
      .input('giaKhoiDiem', sql.Float, parseFloat(giaKhoiDiem))
      .input('moTa', sql.NVarChar, moTa)
      .input('hinhAnh', sql.NVarChar, hinhAnh)
      .input('id', sql.Int, id);
    
    if (giaHienTaiValue !== null) {
      request.input('giaHienTai', sql.Float, giaHienTaiValue);
    }
    
    if (tenNguoiDauGiaValue !== null) {
      request.input('tenNguoiDauGia', sql.NVarChar, tenNguoiDauGiaValue);
    }
    
    let query = 'UPDATE Product SET TenProduct=@tenProduct, GiaKhoiDiem=@giaKhoiDiem, MoTa=@moTa, HinhAnh=@hinhAnh';
    
    if (giaHienTaiValue !== null) {
      query += ', GiaHienTai=@giaHienTai';
    }
    
    if (tenNguoiDauGiaValue !== null) {
      query += ', TenNguoiDauGia=@tenNguoiDauGia';
    }
    
    query += ' WHERE MaProduct=@id';
    
    await request.query(query);
    
    console.log('✅ Product updated successfully:', id);
    
    io.emit('productsChanged');
    res.json({ message: 'Product updated successfully' });
    
  } catch (err) {
    console.error('❌ Error updating product:', err);
    console.error('Error stack:', err.stack);
    res.status(500).json({ message: 'Error updating product: ' + err.message });
  }
});

// Thêm API GET /api/products/:id để lấy thông tin chi tiết 1 sản phẩm
app.get('/api/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await getPool();
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Product WHERE MaProduct=@id');
    
    if (!result.recordset.length) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json(result.recordset[0]);
    
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({ message: 'Error fetching product: ' + err.message });
  }
});

// API: add product (admin) - handles file upload
app.post('/api/products', upload.array('hinhAnh', 4), async (req, res) => {
  try {
    const { tenProduct, giaKhoiDiem, moTa } = req.body;
    let hinhAnh = null;
    if (req.files && req.files.length > 0) {
      hinhAnh = req.files.map(f => '/uploads/' + f.filename).join(',');
    }
    const pool = await getPool();
    await pool.request()
      .input('tenProduct', sql.NVarChar, tenProduct)
      .input('giaKhoiDiem', sql.Float, parseFloat(giaKhoiDiem))
      .input('hinhAnh', sql.NVarChar, hinhAnh)
      .input('moTa', sql.NVarChar, moTa)
      .query('INSERT INTO Product (TenProduct, GiaKhoiDiem, GiaHienTai, TenNguoiDauGia, HinhAnh, MoTa) VALUES (@tenProduct, @giaKhoiDiem, @giaKhoiDiem, NULL, @hinhAnh, @moTa)');
    io.emit('productsChanged');
    res.json({ message: 'Product added' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error adding product');
  }
});

// API: delete product (admin)
app.delete('/api/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await getPool();
    // get image name to delete
    const q = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT HinhAnh FROM Product WHERE MaProduct=@id');
    if (q.recordset.length) {
      const img = q.recordset[0].HinhAnh;
      if (img) {
        // Hỗ trợ nhiều ảnh, xóa từng file nếu tồn tại
        const imgArr = img.split(',').map(s => s.trim()).filter(Boolean);
        for (const imgPath of imgArr) {
          const p = path.join(__dirname, 'public', imgPath.startsWith('/') ? imgPath.slice(1) : imgPath);
          if (fs.existsSync(p)) {
            try { fs.unlinkSync(p); } catch(e) { /* Bỏ qua lỗi nếu file không tồn tại */ }
          }
        }
      }
    }
    // Xóa tất cả các bản ghi liên quan trong bảng Daugia trước
    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM Daugia WHERE MaProduct=@id');
    // Sau đó mới xóa sản phẩm
    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM Product WHERE MaProduct=@id');
    io.emit('productsChanged');
    res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error deleting product');
  }
});

// ========== API ĐẤU GIÁ ==========

// API lấy chi tiết đấu giá kèm thông tin sản phẩm và tất cả người đấu giá
app.get('/api/bid-detail/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await getPool();
    
    // Lấy thông tin sản phẩm
    const prodQ = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT MaProduct, TenProduct, GiaKhoiDiem, GiaHienTai, TenNguoiDauGia, HinhAnh, GhiChu, MoTa FROM Product WHERE MaProduct = @id');
    
    if (!prodQ.recordset.length) return res.status(404).send('Product not found');
    const product = prodQ.recordset[0];
    
    // Lấy tất cả lượt đấu giá với IP (mới nhất lên đầu)
    const bidsQ = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT TenNguoiDauGia, GiaHienTai, Note, CreatedAt, IP FROM Daugia WHERE MaProduct = @id ORDER BY CreatedAt DESC');
    
    res.json({
      product,
      bids: bidsQ.recordset
    });
  } catch(err) {
    console.error(err);
    res.status(500).send('Error fetching bid details');
  }
});

// API: Lấy lịch sử đấu giá với phân trang và filter
app.get('/api/bid-history', async (req, res) => {
  try {
    console.log('=== BID HISTORY API CALLED ===');
    const pool = await getPool();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const productId = req.query.productId ? parseInt(req.query.productId) : null;
    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;
    
    console.log('Bid history request:', { page, limit, productId, fromDate, toDate });
    
    // Build WHERE clause with parameters
    let whereConditions = [];
    const request = pool.request();
    
    if (productId) {
      whereConditions.push('d.MaProduct = @productId');
      request.input('productId', sql.Int, productId);
    }
    if (fromDate) {
      whereConditions.push('d.CreatedAt >= @fromDate');
      request.input('fromDate', sql.DateTime, fromDate);
    }
    if (toDate) {
      whereConditions.push('d.CreatedAt <= @toDate');
      request.input('toDate', sql.DateTime, toDate + ' 23:59:59');
    }
    
    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as Total FROM Daugia d ${whereClause}`;
    console.log('Count query:', countQuery);
    const countResult = await request.query(countQuery);
    const total = countResult.recordset[0].Total;
    console.log('Total bids:', total);
    
    // Get paginated data with better SQL syntax
    let dataQuery;
    if (offset > 0) {
      dataQuery = `
        SELECT 
          p.TenProduct as ProductName,
          d.TenNguoiDauGia as Username,
          d.GiaHienTai as Price,
          d.IP,
          d.CreatedAt as CreateTime
        FROM Daugia d
        INNER JOIN Product p ON d.MaProduct = p.MaProduct
        ${whereClause}
        ORDER BY d.CreatedAt DESC
        OFFSET ${offset} ROWS
        FETCH NEXT ${limit} ROWS ONLY
      `;
    } else {
      dataQuery = `
        SELECT TOP ${limit}
          p.TenProduct as ProductName,
          d.TenNguoiDauGia as Username,
          d.GiaHienTai as Price,
          d.IP,
          d.CreatedAt as CreateTime
        FROM Daugia d
        INNER JOIN Product p ON d.MaProduct = p.MaProduct
        ${whereClause}
        ORDER BY d.CreatedAt DESC
      `;
    }
    
    console.log('Data query:', dataQuery);
    const dataResult = await request.query(dataQuery);
    console.log('Bid history results:', dataResult.recordset.length, 'records');
    
    res.json({
      bids: dataResult.recordset,
      total: total,
      page: page,
      limit: limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch(err) {
    console.error('Error in bid-history API:', err);
    res.status(500).json({ error: 'Error fetching bid history', details: err.message });
  }
});

// API: export to Excel
app.get('/api/export-excel', async (req, res) => {
  try {
    const pool = await getPool();
    
    // Lấy dữ liệu sản phẩm và đấu giá
    const productsResult = await pool.request().query(`
      SELECT 
        p.MaProduct,
        p.TenProduct,
        p.GiaKhoiDiem,
        p.GiaHienTai,
        p.TenNguoiDauGia,
        p.MoTa,
        d.IP as LastBidIP,
        d.CreatedAt as LastBidTime
      FROM Product p
      LEFT JOIN (
        SELECT MaProduct, IP, CreatedAt, ROW_NUMBER() OVER (PARTITION BY MaProduct ORDER BY CreatedAt DESC) as rn
        FROM Daugia
      ) d ON p.MaProduct = d.MaProduct AND d.rn = 1
      ORDER BY p.MaProduct
    `);
    
    const bidHistoryResult = await pool.request().query(`
      SELECT 
        d.MaProduct,
        p.TenProduct,
        d.TenNguoiDauGia,
        d.GiaHienTai,
        d.IP,
        d.Note,
        d.CreatedAt
      FROM Daugia d
      LEFT JOIN Product p ON d.MaProduct = p.MaProduct
      ORDER BY d.CreatedAt DESC
    `);
    
    // Tạo workbook mới
    const workbook = new ExcelJS.Workbook();
    
    // Sheet 1: Danh sách sản phẩm
    const productSheet = workbook.addWorksheet('Danh Sách Sản Phẩm');
    
    productSheet.columns = [
      { header: 'Mã SP', key: 'MaProduct', width: 10 },
      { header: 'Tên Sản Phẩm', key: 'TenProduct', width: 30 },
      { header: 'Giá Khởi Điểm', key: 'GiaKhoiDiem', width: 15 },
      { header: 'Giá Hiện Tại', key: 'GiaHienTai', width: 15 },
      { header: 'Người Đấu Giá', key: 'TenNguoiDauGia', width: 20 },
      { header: 'IP Address', key: 'LastBidIP', width: 18 },
      { header: 'Thời Gian Đấu Cuối', key: 'LastBidTime', width: 20 },
      { header: 'Mô Tả', key: 'MoTa', width: 40 }
    ];
    
    // Thêm dữ liệu
    productsResult.recordset.forEach(row => {
      productSheet.addRow({
        MaProduct: row.MaProduct,
        TenProduct: row.TenProduct,
        GiaKhoiDiem: row.GiaKhoiDiem,
        GiaHienTai: row.GiaHienTai || 'Chưa có',
        TenNguoiDauGia: row.TenNguoiDauGia || 'Chưa có',
        LastBidIP: row.LastBidIP || 'N/A',
        LastBidTime: row.LastBidTime ? new Date(row.LastBidTime).toLocaleString('vi-VN') : 'N/A',
        MoTa: row.MoTa || ''
      });
    });
    
    // Style cho header
    productSheet.getRow(1).font = { bold: true };
    productSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4CAF50' }
    };
    
    // Sheet 2: Lịch sử đấu giá
    const historySheet = workbook.addWorksheet('Lịch Sử Đấu Giá');
    
    historySheet.columns = [
      { header: 'Mã SP', key: 'MaProduct', width: 10 },
      { header: 'Sản Phẩm', key: 'TenProduct', width: 30 },
      { header: 'Người Đấu Giá', key: 'TenNguoiDauGia', width: 20 },
      { header: 'Giá Đấu', key: 'GiaHienTai', width: 15 },
      { header: 'IP Address', key: 'IP', width: 18 },
      { header: 'Ghi Chú', key: 'Note', width: 30 },
      { header: 'Thời Gian', key: 'CreatedAt', width: 20 }
    ];
    
    bidHistoryResult.recordset.forEach(row => {
      historySheet.addRow({
        MaProduct: row.MaProduct,
        TenProduct: row.TenProduct,
        TenNguoiDauGia: row.TenNguoiDauGia,
        GiaHienTai: row.GiaHienTai,
        IP: row.IP || 'N/A',
        Note: row.Note || '',
        CreatedAt: new Date(row.CreatedAt).toLocaleString('vi-VN')
      });
    });
    
    // Style cho header
    historySheet.getRow(1).font = { bold: true };
    historySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2196F3' }
    };
    
    // Gửi file về client
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=ThongKeAuction.xlsx');
    
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (err) {
    console.error('Error exporting Excel:', err);
    res.status(500).send('Error exporting to Excel');
  }
});

// API: place bid
app.post('/api/bid', async (req, res) => {
  try {
    const { maProduct, tenNguoiDauGia, giaHienTai } = req.body;
    const pid = parseInt(maProduct);
    const bid = parseFloat(giaHienTai);
    
    if (!pid || !tenNguoiDauGia || !bid) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing fields' 
      });
    }

    // Always get pool before using it
    const pool = await getPool();
    
    // get current price and start price
    const r = await pool.request()
      .input('pid', sql.Int, pid)
      .query('SELECT GiaHienTai, GiaKhoiDiem, TenProduct FROM Product WHERE MaProduct=@pid');
    
    if (!r.recordset.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    const row = r.recordset[0];
    const current = row.GiaHienTai != null ? parseFloat(row.GiaHienTai) : parseFloat(row.GiaKhoiDiem);
    const tenProduct = row.TenProduct || 'Sản phẩm';

    if (bid <= current) {
      return res.json({ 
        success: false, 
        message: 'Bid must be greater than current price' 
      });
    }

    // Lấy IP từ request headers (hỗ trợ cả proxy và direct connection)
    let clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || 
                   req.headers['x-real-ip'] || 
                   req.socket?.remoteAddress ||
                   req.ip ||
                   'unknown';
    
    // Normalize IPv6-mapped IPv4
    clientIP = clientIP.replace(/^::ffff:/, '');
    
    // Note: With IIS/iisnode, IP may be "unknown" - need ARR module
    console.log('💰 Place-bid from IP:', clientIP, 'User:', tenNguoiDauGia, 'Amount:', bid);

    // insert into Daugia
    await pool.request()
      .input('pid', sql.Int, pid)
      .input('tenNguoiDauGia', sql.NVarChar, tenNguoiDauGia)
      .input('bid', sql.Float, bid)
      .input('clientIP', sql.NVarChar, clientIP)
      .query("INSERT INTO Daugia (MaProduct, TenNguoiDauGia, GiaHienTai, Note, IP) VALUES (@pid, @tenNguoiDauGia, @bid, N'Đấu giá', @clientIP)");

    // update product current price and last bidder and append note
    // get existing note
    const notesQ = await pool.request()
      .input('pid', sql.Int, pid)
      .query('SELECT GhiChu FROM Product WHERE MaProduct=@pid');
    
    let notes = notesQ.recordset.length ? (notesQ.recordset[0].GhiChu || '') : '';
    const newNote = notes ? (notes + ', ' + tenNguoiDauGia) : tenNguoiDauGia;
    
    await pool.request()
      .input('bid', sql.Float, bid)
      .input('tenNguoiDauGia', sql.NVarChar, tenNguoiDauGia)
      .input('newNote', sql.NVarChar, newNote)
      .input('pid', sql.Int, pid)
      .query('UPDATE Product SET GiaHienTai=@bid, TenNguoiDauGia=@tenNguoiDauGia, GhiChu=@newNote WHERE MaProduct=@pid');

    // Emit both events for backward compatibility
    io.emit('productsChanged');
    io.emit('newBid', { 
      productId: pid, 
      bidder: tenNguoiDauGia,
      tenNguoiDauGia: tenNguoiDauGia,
      amount: bid,
      giaHienTai: bid,
      tenProduct: tenProduct,
      ip: clientIP
    });
    
    console.log('📢 Emitted newBid event to all clients');
    
    res.json({ success: true, message: 'Bid successful' });
    
  } catch (err) {
    console.error('Error placing bid:', err);
    // TRẢ VỀ JSON THAY VÌ TEXT
    res.status(500).json({ 
      success: false, 
      message: 'Error placing bid: ' + err.message 
    });
  }
});

// API mới: place bid với token (dùng cho client)
app.post('/api/place-bid/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { giaDauGia, note } = req.body;
    const token = req.headers['x-client-token'];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token is required' 
      });
    }
    
    if (!giaDauGia) {
      return res.status(400).json({ 
        success: false, 
        message: 'Giá đấu giá is required' 
      });
    }
    
    const bid = parseFloat(giaDauGia);
    
    // Lấy nickname từ request body
    let tenNguoiDauGia = req.body.nickname || 'Anonymous';
    
    const pool = await getPool();
    
    // Lấy thông tin sản phẩm
    const productResult = await pool.request()
      .input('pid', sql.Int, productId)
      .query('SELECT GiaHienTai, GiaKhoiDiem, TenProduct FROM Product WHERE MaProduct=@pid');
    
    if (!productResult.recordset.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'Sản phẩm không tồn tại' 
      });
    }
    
    const product = productResult.recordset[0];
    const currentPrice = product.GiaHienTai != null 
      ? parseFloat(product.GiaHienTai) 
      : parseFloat(product.GiaKhoiDiem);
    
    if (bid <= currentPrice) {
      return res.json({ 
        success: false, 
        message: `Giá đấu giá phải lớn hơn giá hiện tại (${currentPrice.toLocaleString()} VNĐ)` 
      });
    }
    
    // Lấy IP từ x-forwarded-for header (được set bởi IIS URL Rewrite)
    let clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || 'N/A';
    
    console.log('💰 Place-bid from IP:', clientIP, 'User:', tenNguoiDauGia, 'Amount:', bid);
    
    // Lưu vào bảng Daugia
    await pool.request()
      .input('pid', sql.Int, productId)
      .input('tenNguoiDauGia', sql.NVarChar, tenNguoiDauGia)
      .input('bid', sql.Float, bid)
      .input('note', sql.NVarChar, note || 'Đấu giá')
      .input('clientIP', sql.NVarChar, clientIP)
      .query("INSERT INTO Daugia (MaProduct, TenNguoiDauGia, GiaHienTai, Note, IP) VALUES (@pid, @tenNguoiDauGia, @bid, @note, @clientIP)");
    
    // Cập nhật giá hiện tại và người đấu giá trong bảng Product
    const notesQuery = await pool.request()
      .input('pid', sql.Int, productId)
      .query('SELECT GhiChu FROM Product WHERE MaProduct=@pid');
    
    let existingNotes = notesQuery.recordset.length ? (notesQuery.recordset[0].GhiChu || '') : '';
    const newNote = existingNotes ? (existingNotes + ', ' + tenNguoiDauGia) : tenNguoiDauGia;
    
    await pool.request()
      .input('bid', sql.Float, bid)
      .input('tenNguoiDauGia', sql.NVarChar, tenNguoiDauGia)
      .input('newNote', sql.NVarChar, newNote)
      .input('pid', sql.Int, productId)
      .query('UPDATE Product SET GiaHienTai=@bid, TenNguoiDauGia=@tenNguoiDauGia, GhiChu=@newNote WHERE MaProduct=@pid');
    
    // Broadcast thay đổi đến tất cả clients
    io.emit('productsChanged');
    
    res.json({ 
      success: true, 
      message: 'Đấu giá thành công!',
      data: {
        productId: productId,
        newPrice: bid,
        bidder: tenNguoiDauGia
      }
    });
    
  } catch (err) {
    console.error('Error placing bid:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Lỗi khi đấu giá: ' + err.message 
    });
  }
});

// API xuất thống kê đấu giá ra Excel
app.get('/api/export-auction-stats', async (req, res) => {
  try {
    const pool = await getPool();
    
    // Lấy dữ liệu thống kê
    const result = await pool.request().query(`
      SELECT 
        p.MaProduct,
        p.TenProduct,
        p.GiaKhoiDiem,
        p.GiaHienTai,
        p.TenNguoiDauGia,
        p.GhiChu,
        (SELECT COUNT(*) FROM Daugia WHERE MaProduct = p.MaProduct) as SoLuotDauGia,
        (SELECT TOP 1 IP FROM Daugia WHERE MaProduct = p.MaProduct ORDER BY CreatedAt DESC) as IPCuoiCung,
        (SELECT TOP 1 CreatedAt FROM Daugia WHERE MaProduct = p.MaProduct ORDER BY CreatedAt DESC) as ThoiGianCuoiCung
      FROM Product p
      ORDER BY p.MaProduct
    `);
    
    // Lấy chi tiết lịch sử đấu giá
    const historyResult = await pool.request().query(`
      SELECT 
        d.MaProduct,
        p.TenProduct,
        d.TenNguoiDauGia,
        d.GiaHienTai,
        d.IP,
        d.CreatedAt,
        d.Note
      FROM Daugia d
      INNER JOIN Product p ON d.MaProduct = p.MaProduct
      ORDER BY d.MaProduct, d.CreatedAt DESC
    `);
    
    // Tạo workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'E.SUN BANK Đồng Nai';
    workbook.created = new Date();
    
    // ===== SHEET 1: TỔNG QUAN =====
    const summarySheet = workbook.addWorksheet('Tổng Quan', {
      properties: { tabColor: { argb: 'FF4CAF50' } }
    });
    
    // Header
    summarySheet.columns = [
      { header: 'Mã SP', key: 'ma', width: 10 },
      { header: 'Tên Sản Phẩm', key: 'ten', width: 30 },
      { header: 'Giá Khởi Điểm', key: 'giaKhoiDiem', width: 15 },
      { header: 'Giá Hiện Tại', key: 'giaHienTai', width: 15 },
      { header: 'Người Đấu Giá', key: 'nguoiDauGia', width: 20 },
      { header: 'Số Lượt Đấu', key: 'soLuot', width: 12 },
      { header: 'IP Cuối Cùng', key: 'ip', width: 15 },
      { header: 'Thời Gian Cuối', key: 'thoiGian', width: 20 },
      { header: 'Ghi Chú', key: 'ghiChu', width: 25 }
    ];
    
    // Style header
    summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4CAF50' }
    };
    summarySheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    summarySheet.getRow(1).height = 25;
    
    // Thêm dữ liệu
    let tongGiaKhoiDiem = 0;
    let tongGiaHienTai = 0;
    
    result.recordset.forEach(row => {
      tongGiaKhoiDiem += row.GiaKhoiDiem || 0;
      tongGiaHienTai += row.GiaHienTai || row.GiaKhoiDiem || 0;
      
      summarySheet.addRow({
        ma: row.MaProduct,
        ten: row.TenProduct,
        giaKhoiDiem: row.GiaKhoiDiem,
        giaHienTai: row.GiaHienTai || row.GiaKhoiDiem,
        nguoiDauGia: row.TenNguoiDauGia || 'Chưa có',
        soLuot: row.SoLuotDauGia,
        ip: row.IPCuoiCung || 'N/A',
        thoiGian: row.ThoiGianCuoiCung ? new Date(row.ThoiGianCuoiCung).toLocaleString('vi-VN') : 'N/A',
        ghiChu: row.GhiChu || ''
      });
    });
    
    // Format số tiền
    summarySheet.getColumn('giaKhoiDiem').numFmt = '#,##0';
    summarySheet.getColumn('giaHienTai').numFmt = '#,##0';
    
    // Thêm dòng tổng
    const totalRow = summarySheet.addRow({
      ma: '',
      ten: 'TỔNG CỘNG',
      giaKhoiDiem: tongGiaKhoiDiem,
      giaHienTai: tongGiaHienTai,
      nguoiDauGia: '',
      soLuot: '',
      ip: '',
      thoiGian: '',
      ghiChu: ''
    });
    
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFEB3B' }
    };
    
    // Border cho tất cả cells
    summarySheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });
    
    // ===== SHEET 2: LỊCH SỬ ĐẤU GIÁ =====
    const historySheet = workbook.addWorksheet('Lịch Sử Đấu Giá', {
      properties: { tabColor: { argb: 'FF2196F3' } }
    });
    
    historySheet.columns = [
      { header: 'Mã SP', key: 'ma', width: 10 },
      { header: 'Tên Sản Phẩm', key: 'ten', width: 30 },
      { header: 'Người Đấu Giá', key: 'nguoi', width: 20 },
      { header: 'Giá Đấu', key: 'gia', width: 15 },
      { header: 'IP Address', key: 'ip', width: 15 },
      { header: 'Thời Gian', key: 'thoiGian', width: 20 },
      { header: 'Ghi Chú', key: 'note', width: 25 }
    ];
    
    // Style header
    historySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    historySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2196F3' }
    };
    historySheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    historySheet.getRow(1).height = 25;
    
    // Thêm dữ liệu
    historyResult.recordset.forEach(row => {
      historySheet.addRow({
        ma: row.MaProduct,
        ten: row.TenProduct,
        nguoi: row.TenNguoiDauGia,
        gia: row.GiaHienTai,
        ip: row.IP || 'N/A',
        thoiGian: new Date(row.CreatedAt).toLocaleString('vi-VN'),
        note: row.Note || ''
      });
    });
    
    // Format số tiền
    historySheet.getColumn('gia').numFmt = '#,##0';
    
    // Border
    historySheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });
    
    // ===== SHEET 3: THỐNG KÊ THEO SẢN PHẨM =====
    const statsSheet = workbook.addWorksheet('Thống Kê Chi Tiết', {
      properties: { tabColor: { argb: 'FFFF9800' } }
    });
    
    statsSheet.columns = [
      { header: 'Tên Sản Phẩm', key: 'ten', width: 30 },
      { header: 'Giá Khởi Điểm', key: 'giaKhoiDiem', width: 15 },
      { header: 'Giá Cao Nhất', key: 'giaCaoNhat', width: 15 },
      { header: 'Tăng Giá', key: 'tangGia', width: 15 },
      { header: '% Tăng', key: 'phanTram', width: 12 },
      { header: 'Số Lượt Đấu', key: 'soLuot', width: 12 },
      { header: 'Người Thắng', key: 'nguoiThang', width: 20 }
    ];
    
    // Style header
    statsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    statsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF9800' }
    };
    statsSheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    statsSheet.getRow(1).height = 25;
    
    // Thêm dữ liệu
    result.recordset.forEach(row => {
      const giaKhoiDiem = row.GiaKhoiDiem || 0;
      const giaHienTai = row.GiaHienTai || giaKhoiDiem;
      const tangGia = giaHienTai - giaKhoiDiem;
      const phanTram = giaKhoiDiem > 0 ? ((tangGia / giaKhoiDiem) * 100).toFixed(2) : 0;
      
      statsSheet.addRow({
        ten: row.TenProduct,
        giaKhoiDiem: giaKhoiDiem,
        giaCaoNhat: giaHienTai,
        tangGia: tangGia,
        phanTram: phanTram + '%',
        soLuot: row.SoLuotDauGia,
        nguoiThang: row.TenNguoiDauGia || 'Chưa có'
      });
    });
    
    // Format số tiền
    statsSheet.getColumn('giaKhoiDiem').numFmt = '#,##0';
    statsSheet.getColumn('giaCaoNhat').numFmt = '#,##0';
    statsSheet.getColumn('tangGia').numFmt = '#,##0';
    
    // Border
    statsSheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });
    
    // Gửi file Excel về client
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ThongKeDauGia.xlsx"');
    
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (err) {
    console.error('Error exporting auction stats:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error exporting auction stats: ' + err.message 
    });
  }
});

// serve admin page route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'admin.html'));
});

// ========== SOCKET.IO ==========

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // GỬI THỜI GIAN HIỆN TẠI CHO CLIENT MỚI KẾT NỐI
  socket.emit('auctionTimeUpdated', auctionTimes);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT} (LAN)`));

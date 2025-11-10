
// Hàm format datetime (tránh lệch timezone)
function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  
  // SQL Server trả về datetime không có timezone, nên cần parse thủ công
  // Format: "2025-11-09T18:32:26.070Z" hoặc "2025-11-09 18:32:26.070"
  const dateOnly = dateStr.replace(' ', 'T').split('.')[0];
  
  // Parse thành các phần
  const [datePart, timePart] = dateOnly.split('T');
  const [year, month, day] = datePart.split('-');
  const [hours, minutes, seconds] = timePart.split(':');
  
  // Trả về format: HH:mm:ss dd/MM/yyyy
  return `${hours}:${minutes}:${seconds} ${day}/${month}/${year}`;
}

// Debounce để tránh load nhiều lần
let loadProductsTimeout = null;
function debounceLoadProducts() {
  if (loadProductsTimeout) {
    clearTimeout(loadProductsTimeout);
  }
  loadProductsTimeout = setTimeout(() => {
    loadProducts();
  }, 300);
}

// ========== BIẾN TOÀN CỤC ==========
let socket;
let socketInitialized = false;

// ========== LOAD SẢN PHẨM ==========
let isLoadingProducts = false; // Thêm flag để tránh load duplicate

async function loadProducts(){
  // Tránh load nhiều lần cùng lúc
  if (isLoadingProducts) {
    console.log('⏳ Already loading products, skipping...');
    return;
  }
  
  isLoadingProducts = true;
  
  try {
    const res = await fetch('/api/products');
    const products = await res.json();
    const section = document.getElementById('products');
    
  // Clear existing products
    section.innerHTML = '';
    
    // Lấy thời gian đấu giá
    const timeRes = await fetch('/api/auction-time');
    const timeData = await timeRes.json();
    console.log('⏰ Auction time data:', timeData);
    const startTime = timeData.startTime ? new Date(timeData.startTime) : null;
    const endTime = timeData.endTime ? new Date(timeData.endTime) : null;
    const now = new Date();
    console.log('Start:', startTime, 'End:', endTime, 'Now:', now);
    
    // Kiểm tra trạng thái đấu giá
    let auctionStatus = 'not-set'; // not-set, not-started, active, ended
    let disableBidBtn = true;
    let btnMessage = 'Đấu giá';
    
    if (!startTime || !endTime) {
      auctionStatus = 'not-set';
      disableBidBtn = true;
      btnMessage = 'Chưa mở';
    } else if (now < startTime) {
      auctionStatus = 'not-started';
      disableBidBtn = true;
      btnMessage = 'Chưa bắt đầu';
    } else if (now >= startTime && now <= endTime) {
      auctionStatus = 'active';
      disableBidBtn = false;
      btnMessage = 'Đấu giá';
    } else {
      auctionStatus = 'ended';
      disableBidBtn = true;
      btnMessage = 'Đã kết thúc';
    }

    products.forEach(p => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.productId = p.MaProduct; // Thêm data attribute để tránh duplicate
      
      // Xử lý nhiều ảnh
      let imgs = [];
      if (p.HinhAnh && p.HinhAnh.includes(',')) {
        imgs = p.HinhAnh.split(',').map(s => s.trim()).filter(Boolean);
      } else if (p.HinhAnh) {
        imgs = [p.HinhAnh];
      } else {
        imgs = ['/uploads/placeholder.png'];
      }
      
      const imgEl = document.createElement('img');
      imgEl.src = imgs[0] || '/uploads/placeholder.png';
      imgEl.onerror = function() {
        this.onerror = null;
        this.src = '/uploads/placeholder.png';
      };
      
      const h3 = document.createElement('h3');
      h3.textContent = p.TenProduct || 'Sản phẩm';
      
      const pStart = document.createElement('p');
      pStart.innerHTML = `<b>Giá khởi điểm:</b> <span class="value">${p.GiaKhoiDiem != null ? Number(p.GiaKhoiDiem).toLocaleString() : 'N/A'}</span>`;
      
      const pCurrent = document.createElement('p');
      pCurrent.innerHTML = `<b>Giá hiện tại:</b> <span class="value">${p.GiaHienTai != null ? Number(p.GiaHienTai).toLocaleString() : Number(p.GiaKhoiDiem).toLocaleString()}</span>`;
      
      const pBidder = document.createElement('p');
      pBidder.innerHTML = `<b>Người đấu giá:</b> <span class="value">${p.TenNguoiDauGia || 'Chưa có'}</span>`;
      
      // Tạo div chứa 2 nút
      const cardButtons = document.createElement('div');
      cardButtons.className = 'card-buttons';
      
      const btnBid = document.createElement('button');
      btnBid.textContent = btnMessage;
      btnBid.dataset.id = p.MaProduct;
      btnBid.dataset.name = p.TenProduct || 'Sản phẩm';
      btnBid.dataset.current = p.GiaHienTai || p.GiaKhoiDiem;
      btnBid.dataset.start = p.GiaKhoiDiem;
      
      // Disable nút nếu không trong thời gian đấu giá
      if (disableBidBtn) {
        btnBid.disabled = true;
        btnBid.style.opacity = '0.5';
        btnBid.style.cursor = 'not-allowed';
        btnBid.title = btnMessage;
      } else {
        btnBid.addEventListener('click', openBidModal);
      }
      
      const btnDetail = document.createElement('button');
      btnDetail.textContent = 'Chi tiết';
      btnDetail.dataset.id = p.MaProduct;
      btnDetail.onclick = openDetail;
      
      cardButtons.appendChild(btnBid);
      cardButtons.appendChild(btnDetail);
      
      card.appendChild(imgEl);
      card.appendChild(h3);
      card.appendChild(pStart);
      card.appendChild(pCurrent);
      card.appendChild(pBidder);
      card.appendChild(cardButtons);
      section.appendChild(card);
    });
    
    // Cập nhật tổng giá trị
    const total = products.reduce((sum, p) => sum + (p.GiaHienTai || p.GiaKhoiDiem || 0), 0);
    const totalEl = document.getElementById('totalPrice');
    if (totalEl) {
      totalEl.textContent = 'Tổng Giá Hiện Tại: ' + total.toLocaleString() + ' VNĐ';
    }

    // Sau khi render xong, nếu có yêu cầu cuộn tới sản phẩm đã đấu giá thì thực hiện
    try {
      const scrollTargetId = localStorage.getItem('scrollTargetProductId');
      if (scrollTargetId) {
        const targetCard = document.querySelector(`.card[data-product-id="${scrollTargetId}"]`);
        if (targetCard) {
          targetCard.scrollIntoView({ behavior: 'instant', block: 'center' });
          // Thêm hiệu ứng highlight ngắn để người dùng nhận biết
          targetCard.classList.add('flash-highlight');
          setTimeout(() => targetCard.classList.remove('flash-highlight'), 1600);
        }
        localStorage.removeItem('scrollTargetProductId');
      }
    } catch (_) { /* ignore */ }
  } catch (err) {
    console.error('Error loading products:', err);
  } finally {
    isLoadingProducts = false; // Reset flag
  }
}

// ========== KHỞI TẠO SOCKET.IO (CHỈ 1 LẦN) ==========
// (Removed duplicate - see initSocketConnection below)

// Hàm load thời gian từ server
async function loadAuctionTime() {
  try {
    const res = await fetch('/api/auction-time');
    const data = await res.json();
    
    console.log('🕒 Loading auction time:', data);
    
    if (data.startTime && data.endTime) {
      localStorage.setItem('auctionStartTime', data.startTime);
      localStorage.setItem('auctionEndTime', data.endTime);
      updateCountdownTimer(data.endTime);
      console.log('✅ Auction time loaded successfully');
    } else {
      // Không có thời gian đấu giá, ẩn countdown
      console.log('⚠️ No auction time set');
      localStorage.removeItem('auctionStartTime');
      localStorage.removeItem('auctionEndTime');
      const timer = document.getElementById('countdownTimer');
      if (timer) {
        timer.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Error loading auction time:', err);
    const timer = document.getElementById('countdownTimer');
    if (timer) {
      timer.style.display = 'none';
    }
  }
}

// Hàm cập nhật countdown timer
function updateCountdownTimer(endTimeStr) {
  if (!endTimeStr) {
    const timer = document.getElementById('countdownTimer');
    if (timer) {
      timer.style.display = 'none';
    }
    return;
  }

  const timer = document.getElementById('countdownTimer');
  if (timer) {
    timer.style.display = 'flex';
  }

  function update() {
    const endTime = new Date(endTimeStr);
    const now = new Date();
    const diff = endTime - now;

    if (diff <= 0) {
      document.getElementById('cdDays').textContent = '00';
      document.getElementById('cdHours').textContent = '00';
      document.getElementById('cdMinutes').textContent = '00';
      document.getElementById('cdSeconds').textContent = '00';
      
      // Disable tất cả nút đấu giá
      document.querySelectorAll('.card-buttons button:first-child').forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
      });
      
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    document.getElementById('cdDays').textContent = String(days).padStart(2, '0');
    document.getElementById('cdHours').textContent = String(hours).padStart(2, '0');
    document.getElementById('cdMinutes').textContent = String(minutes).padStart(2, '0');
    document.getElementById('cdSeconds').textContent = String(seconds).padStart(2, '0');

    setTimeout(update, 1000);
  }
  
  update();
}

function openBidModal(e){
  const btn = e.currentTarget;
  if (btn.disabled) return;
  
  // Kiểm tra thời gian đấu giá
  const startTimeStr = localStorage.getItem('auctionStartTime');
  const endTimeStr = localStorage.getItem('auctionEndTime');
  
  if (startTimeStr && endTimeStr) {
    const startTime = new Date(startTimeStr);
    const endTime = new Date(endTimeStr);
    const now = new Date();
    
    if (now < startTime) {
      alert('⏰ Đấu giá chưa bắt đầu!');
      return;
    }
    
    if (now >= endTime) {
      alert('⏰ Đã hết thời gian đấu giá!');
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
      return;
    }
  } else {
    alert('⚠️ Chưa thiết lập thời gian đấu giá!');
    return;
  }
  
  const id = btn.dataset.id;
  const tenProduct = btn.dataset.name;
  const current = parseFloat(btn.dataset.current);
  const start = parseFloat(btn.dataset.start);
  const modal = document.getElementById('bidModal');

  modal.style.display = 'block';
  modal.dataset.id = id;
  modal.dataset.current = current;
  modal.dataset.start = start;

  document.getElementById('modalTitle').textContent = 'Đấu giá sản phẩm: ' + tenProduct;
  document.getElementById('bidName').value='';
  document.getElementById('bidAmount').value='';
}

document.getElementById('bidCancel').onclick = ()=> {
  document.getElementById('bidModal').style.display = 'none';
};

// --- SOCKET.IO ---
// Đã được xử lý trong initSocket()

// Khởi tạo Socket.IO connection (chỉ 1 lần)
function initSocketConnection() {
  if (socket) {
    console.log('⚠️ Socket already initialized, skipping...');
    return;
  }
  
  console.log('🔌 Initializing Socket.IO connection...');
  socket = io();
  
  socket.on('connect', () => {
    console.log('✅ Connected to server, Socket ID:', socket.id);
  });
  
  socket.on('productsChanged', () => {
    console.log('📢 Products changed event received, reloading...');
    loadProducts();
  });
  
  socket.on('newBid', (data) => {
    console.log('💰 New bid event received:', data);
    loadProducts();
    
    // Hiển thị toast notification
    if (data && data.tenNguoiDauGia && data.giaHienTai && data.tenProduct) {
      showToast(
        '💰 Đấu giá mới!',
        `<strong class="toast-highlight">${data.tenNguoiDauGia}</strong> vừa đấu giá <strong class="toast-price">${Number(data.giaHienTai).toLocaleString()} VNĐ</strong> cho "${data.tenProduct}"`
      );
    }
  });
  
  socket.on('auctionTimeUpdated', (data) => {
    console.log('⏰ Auction time updated event received:', data);
    if (data.startTime && data.endTime) {
      localStorage.setItem('auctionStartTime', data.startTime);
      localStorage.setItem('auctionEndTime', data.endTime);
      updateCountdownTimer(data.endTime);
    } else {
      localStorage.removeItem('auctionStartTime');
      localStorage.removeItem('auctionEndTime');
      const timer = document.getElementById('countdownTimer');
      if (timer) {
        timer.style.display = 'none';
      }
    }
    loadProducts();
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Disconnected from server');
  });
  
  console.log('✅ Socket.IO event listeners attached');
}

// Load khi trang vừa mở
document.addEventListener('DOMContentLoaded', async function() {
  console.log('🚀 Page loaded, initializing...');
  
  // Load thời gian đấu giá
  await loadAuctionTime();
  
  // Load products lần đầu
  await loadProducts();
  
  // Khởi tạo Socket.IO
  initSocketConnection();
  
  // Gắn event listener cho nút OK và Hủy trong modal đấu giá
  const bidOkBtn = document.getElementById('bidOk');
  const bidCancelBtn = document.getElementById('bidCancel');
  
  if (bidOkBtn) {
    bidOkBtn.addEventListener('click', submitBid);
  }
  
  if (bidCancelBtn) {
    bidCancelBtn.addEventListener('click', closeBid);
  }
  
  // Khởi tạo image zoom modal
  initImageZoom();
  
  // Thêm format số tiền cho input bidAmount
  const bidAmountInput = document.getElementById('bidAmount');
  if (bidAmountInput) {
    bidAmountInput.addEventListener('input', function(e) {
      // Lấy giá trị và loại bỏ tất cả ký tự không phải số
      let value = e.target.value.replace(/\D/g, '');
      
      // Nếu có giá trị, format với dấu phân cách hàng nghìn
      if (value) {
        e.target.value = parseInt(value).toLocaleString('en-US');
      } else {
        e.target.value = '';
      }
    });
    
    // Lưu giá trị thực khi focus out để dễ parse
    bidAmountInput.addEventListener('blur', function(e) {
      const value = e.target.value.replace(/\D/g, '');
      e.target.dataset.rawValue = value;
    });
  }

  // Chuẩn hoá nhập tên người đấu giá: "dd" hoặc "dđ" => "đ" (giữ nguyên phần còn lại)
  const bidNameInput = document.getElementById('bidName');
  if (bidNameInput) {
    bidNameInput.addEventListener('input', function(e) {
      let v = e.target.value;
      // Thay các tổ hợp sai thành đúng theo kiểu gõ Telex
      v = v
        .replace(/dđ/g, 'đ')
        .replace(/dd/g, 'đ')
        .replace(/DĐ/g, 'Đ')
        .replace(/DD/g, 'Đ');
      e.target.value = v;
    });
  }
});

async function submitBid(){
  const modal = document.getElementById('bidModal');
  const id = modal.dataset.id;
  const name = document.getElementById('bidName').value.trim();
  const amountInput = document.getElementById('bidAmount');
  // Lấy giá trị thực từ input, loại bỏ dấu phân cách
  const amount = parseFloat(amountInput.value.replace(/,/g, ''));
  const current = parseFloat(modal.dataset.current);

  if(!name){
    alert('Vui lòng nhập tên!');
    return;
  }
  
  if(!amount || amount <= current){
    alert('Giá đấu phải lớn hơn giá hiện tại!');
    return;
  }

  try {
    const res = await fetch('/api/bid', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        maProduct: id,
        tenNguoiDauGia: name,
        giaHienTai: amount
      })
    });
    
    const result = await res.json();
    
    if (result.success) {
      alert('✅ Đấu giá thành công!');
      // Lưu lại sản phẩm vừa đấu giá để khôi phục vị trí cuộn sau khi trang cập nhật/reload
      try { localStorage.setItem('scrollTargetProductId', id); } catch (_) {}
      closeBid();
      // Không cần gọi loadProducts() ở đây vì Socket.IO sẽ tự động cập nhật
    } else {
      alert('❌ ' + (result.message || 'Đấu giá thất bại!'));
    }
  } catch (err) {
    console.error('Error submitting bid:', err);
    alert('❌ Lỗi khi đấu giá!');
  }
}

function closeBid(){
  document.getElementById('bidModal').style.display='none';
}

// Biến lưu trữ danh sách ảnh và index hiện tại cho zoom modal
let zoomImages = [];
let currentZoomIndex = 0;

// Hàm mở modal phóng to ảnh
function openImageZoom(imageSrc, allImages = []) {
  const zoomModal = document.getElementById('imageZoomModal');
  const zoomedImage = document.getElementById('zoomedImage');
  const prevBtn = document.getElementById('zoomPrevBtn');
  const nextBtn = document.getElementById('zoomNextBtn');
  const indicator = document.getElementById('zoomIndicator');
  
  if (!zoomModal || !zoomedImage) return;
  
  // Lưu danh sách ảnh
  zoomImages = allImages.length > 0 ? allImages : [imageSrc];
  currentZoomIndex = zoomImages.indexOf(imageSrc);
  
  // Hiển thị ảnh đầu tiên
  zoomedImage.src = imageSrc;
  
  // Cập nhật indicator
  if (indicator) {
    indicator.textContent = `${currentZoomIndex + 1}/${zoomImages.length}`;
  }
  
  // Hiển thị nút prev/next nếu có nhiều ảnh
  if (prevBtn && nextBtn) {
    prevBtn.style.display = zoomImages.length > 1 ? 'flex' : 'none';
    nextBtn.style.display = zoomImages.length > 1 ? 'flex' : 'none';
  }
  
  zoomModal.classList.add('active');
  zoomModal.style.display = 'flex';
  
  // Ngăn scroll body khi modal mở
  document.body.style.overflow = 'hidden';
}

// Hàm đóng modal phóng to ảnh
function closeImageZoom() {
  const zoomModal = document.getElementById('imageZoomModal');
  if (!zoomModal) return;
  
  zoomModal.classList.remove('active');
  zoomModal.style.display = 'none';
  
  // Cho phép scroll lại
  document.body.style.overflow = 'auto';
}

// Hàm chuyển ảnh trước
function prevImage() {
  if (zoomImages.length <= 1) return;
  
  currentZoomIndex = (currentZoomIndex - 1 + zoomImages.length) % zoomImages.length;
  document.getElementById('zoomedImage').src = zoomImages[currentZoomIndex];
  document.getElementById('zoomIndicator').textContent = `${currentZoomIndex + 1}/${zoomImages.length}`;
}

// Hàm chuyển ảnh sau
function nextImage() {
  if (zoomImages.length <= 1) return;
  
  currentZoomIndex = (currentZoomIndex + 1) % zoomImages.length;
  document.getElementById('zoomedImage').src = zoomImages[currentZoomIndex];
  document.getElementById('zoomIndicator').textContent = `${currentZoomIndex + 1}/${zoomImages.length}`;
}

// Khởi tạo sự kiện cho modal phóng to ảnh
function initImageZoom() {
  const zoomModal = document.getElementById('imageZoomModal');
  
  if (!zoomModal) return;
  
  // Click vào modal để đóng
  zoomModal.addEventListener('click', closeImageZoom);
  
  // Ngăn click vào container đóng modal (nhưng cho phép click ảnh đóng)
  const container = document.querySelector('.zoom-image-container');
  if (container) {
    container.addEventListener('click', function(e) {
      // Chỉ đóng nếu click vào ảnh, không đóng nếu click vào nút
      if (e.target.id === 'zoomedImage') {
        closeImageZoom();
      }
    });
  }
  
  // Nhấn ESC để đóng
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const modal = document.getElementById('imageZoomModal');
      if (modal && (modal.style.display === 'flex' || modal.classList.contains('active'))) {
        closeImageZoom();
      }
    }
  });
  
  // Nút prev
  const prevBtn = document.getElementById('zoomPrevBtn');
  if (prevBtn) {
    prevBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      prevImage();
    });
  }
  
  // Nút next
  const nextBtn = document.getElementById('zoomNextBtn');
  if (nextBtn) {
    nextBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      nextImage();
    });
  }
}

function openDetail(e){
  const btn = e.currentTarget;
  const id = btn.dataset.id;
  const modal = document.getElementById('detailModal');
  modal.style.display = 'block';

  const tbody = document.querySelector('#detailTable tbody');
  tbody.innerHTML = '';

  document.getElementById('detailImg').src = '';
  document.getElementById('detailTen').textContent = '';
  document.getElementById('detailGiaKhoiDiem').textContent = '';
  document.getElementById('detailGiaHienTai').textContent = '';
  document.getElementById('detailMoTa').textContent = '';
  document.getElementById('detailImgSlider').innerHTML = '';

  fetch(`/api/bid-detail/${id}`)
    .then(async res => {
      if (!res.ok) {
        const text = await res.text();
        throw new Error('API error: ' + res.status + ' ' + text);
      }
      return res.json();
    })
    .then(data => {
      // Đảm bảo luôn set class cho tiêu đề modal
      document.getElementById('modalAuctionTitleText').className = 'modal-auction-title modal-auction-title-black';
      if(!data || !data.product){
        document.getElementById('modalAuctionProductName').textContent = '';
        tbody.innerHTML = `<tr><td colspan="3">Không tìm thấy sản phẩm</td></tr>`;
        document.getElementById('detailTen').textContent = '';
        document.getElementById('detailGiaKhoiDiem').textContent = '';
        document.getElementById('detailGiaHienTai').textContent = '';
        document.getElementById('detailMoTa').textContent = '';
        document.getElementById('detailImg').src = '/uploads/placeholder.png';
        document.getElementById('detailImgSlider').innerHTML = '';
        return;
      }
      const p = data.product;
      document.getElementById('modalAuctionProductName').textContent = p.TenProduct || '';
      // Hỗ trợ nhiều ảnh, phân tách bằng dấu phẩy nếu có
      let imgs = [];
      if (p.HinhAnh && p.HinhAnh.includes(',')) {
        imgs = p.HinhAnh.split(',').map(s => s.trim()).filter(Boolean);
      } else if (p.HinhAnh) {
        imgs = [p.HinhAnh];
      } else {
        imgs = ['/uploads/placeholder.png'];
      }
      let currentImg = 0;
      function showImg(idx) {
  // Hiển thị mô tả nhiều dòng
  const moTaEl = document.getElementById('detailMoTa');
  moTaEl.innerHTML = (p.MoTa || '').replace(/\n/g, '<br>');
  moTaEl.style.fontFamily = document.getElementById('detailTen').style.fontFamily;
  moTaEl.style.fontSize = document.getElementById('detailTen').style.fontSize;
  moTaEl.style.fontWeight = document.getElementById('detailTen').style.fontWeight;
  document.getElementById('detailGiaKhoiDiem').textContent = p.GiaKhoiDiem != null ? Number(p.GiaKhoiDiem).toLocaleString() + ' VNĐ' : '';
  document.getElementById('detailGiaHienTai').textContent = p.GiaHienTai != null ? Number(p.GiaHienTai).toLocaleString() + ' VNĐ' : '';
        const imgEl = document.getElementById('detailImg');
        imgEl.onerror = function() {
          this.onerror = null;
          this.src = '/uploads/placeholder.png';
        };
        imgEl.onload = function() {
          this.style.display = 'block';
        };
        imgEl.src = imgs[idx] || '/uploads/placeholder.png';
        // highlight thumb
        document.querySelectorAll('#detailImgSlider img').forEach((el,i)=>{
          el.classList.toggle('active',i===idx);
        });
      }
      // render slider
      const slider = document.getElementById('detailImgSlider');
      slider.innerHTML = '';
      imgs.forEach((src,i)=>{
        const im = document.createElement('img');
        im.src = src;
        im.onclick = ()=>{ currentImg=i; showImg(i); };
        im.ondblclick = ()=>{ openImageZoom(imgs[i], imgs); };
        if(i===0) im.classList.add('active');
        slider.appendChild(im);
      });
      showImg(0);

      // Thêm sự kiện click để phóng to ảnh
      const imgEl = document.getElementById('detailImg');
      imgEl.onclick = function() {
        openImageZoom(imgs[currentImg], imgs);
      };

  document.getElementById('detailTen').textContent = p.TenProduct || '';

  // Đảm bảo luôn hiển thị lại mô tả, giá, tên sản phẩm nếu có

      const bids = data.bids || [];
      if(bids.length === 0){
        tbody.innerHTML = `<tr><td colspan="3">Chưa có lượt đấu giá nào</td></tr>`;
      } else {
        bids.forEach(d => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${d.TenNguoiDauGia || '-'}</td>
            <td>${d.GiaHienTai != null ? Number(d.GiaHienTai).toLocaleString() : '-'}</td>
            <td>${formatDateTime(d.CreatedAt)}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    })
    .catch(err => {
  alert('Lỗi khi tải chi tiết sản phẩm: ' + err);
  console.error('Chi tiết lỗi:', err);
      document.getElementById('modalAuctionTitleText').className = 'modal-auction-title modal-auction-title-black';
      document.getElementById('modalAuctionProductName').textContent = '';
      tbody.innerHTML = `<tr><td colspan="3">Lỗi khi tải dữ liệu</td></tr>`;
    });
}

// đóng modal chi tiết
document.getElementById('detailClose').onclick = () => {
  document.getElementById('detailModal').style.display = 'none';
};

// Hiển thị modal Sửa
function openEditModal() {
  document.getElementById('editModal').style.display = 'flex';
}

// Ẩn modal Sửa
function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
}

// Gắn sự kiện cho các nút Sửa (class edit-btn) nếu có
const editBtns = document.querySelectorAll('.edit-btn');
if (editBtns && editBtns.length > 0) {
  editBtns.forEach(btn => {
    btn.addEventListener('click', openEditModal);
  });
}

// Gắn sự kiện cho nút đóng trong modal nếu có
const closeEditBtn = document.querySelector('#editModal .detail-close-btn');
if (closeEditBtn) {
  closeEditBtn.addEventListener('click', closeEditModal);
}

// ========== TOAST NOTIFICATION ==========
function showToast(title, message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  // Tạo toast element
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  toast.innerHTML = `
    <div class="toast-icon">🔔</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;
  
  container.appendChild(toast);
  
  // Tự động xóa sau 5 giây
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 5000);
}

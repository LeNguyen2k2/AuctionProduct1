
// ========== BIẾN TOÀN CỤC ==========
let currentPage = 1;
const socket = io();

// ========== QUẢN LÝ THỜI GIAN ĐẤU GIÁ ==========

async function loadCurrentTime() {
  try {
    const res = await fetch('/api/auction-time');
    const data = await res.json();
    
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    const currentStartTime = document.getElementById('currentStartTime');
    const currentEndTime = document.getElementById('currentEndTime');
    
    if (data.startTime) {
      startTimeInput.value = formatDateTimeForInput(data.startTime);
      currentStartTime.textContent = formatDateTime(data.startTime);
    } else {
      currentStartTime.textContent = 'Chưa thiết lập';
    }
    
    if (data.endTime) {
      endTimeInput.value = formatDateTimeForInput(data.endTime);
      currentEndTime.textContent = formatDateTime(data.endTime);
    } else {
      currentEndTime.textContent = 'Chưa thiết lập';
    }
    
    updateAuctionStatus(data.startTime, data.endTime);
  } catch (err) {
    console.error('Error loading auction time:', err);
  }
}

function formatDateTime(dateTimeStr) {
  if (!dateTimeStr) return 'Chưa thiết lập';
  const date = new Date(dateTimeStr);
  return date.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatDateTimeForInput(dateTimeStr) {
  if (!dateTimeStr) return '';
  const date = new Date(dateTimeStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function updateAuctionStatus(startTime, endTime) {
  const statusEl = document.getElementById('auctionStatus');
  if (!statusEl) return;
  
  const now = new Date();
  const start = startTime ? new Date(startTime) : null;
  const end = endTime ? new Date(endTime) : null;
  
  if (!start || !end) {
    statusEl.textContent = 'Chưa thiết lập';
    statusEl.className = 'status-badge status-not-set';
  } else if (now < start) {
    statusEl.textContent = 'Chưa bắt đầu';
    statusEl.className = 'status-badge status-not-started';
  } else if (now >= start && now <= end) {
    statusEl.textContent = 'Đang diễn ra';
    statusEl.className = 'status-badge status-active';
  } else {
    statusEl.textContent = 'Đã kết thúc';
    statusEl.className = 'status-badge status-ended';
  }
}

async function saveAuctionTime() {
  const startTimeInput = document.getElementById('startTime');
  const endTimeInput = document.getElementById('endTime');
  
  if (!startTimeInput || !endTimeInput) {
    alert('❌ Không tìm thấy input thời gian!');
    return;
  }
  
  const startTime = startTimeInput.value;
  const endTime = endTimeInput.value;
  
  if (!startTime || !endTime) {
    alert('⚠️ Vui lòng chọn đầy đủ thời gian bắt đầu và kết thúc!');
    return;
  }
  
  if (new Date(startTime) >= new Date(endTime)) {
    alert('⚠️ Thời gian bắt đầu phải trước thời gian kết thúc!');
    return;
  }
  
  try {
    const res = await fetch('/api/auction-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime, endTime })
    });
    
    if (res.ok) {
      alert('✅ Đã lưu thời gian đấu giá thành công!');
      await loadCurrentTime();
    } else {
      const error = await res.text();
      alert('❌ Lỗi: ' + error);
    }
  } catch (err) {
    console.error('Error saving auction time:', err);
    alert('❌ Lỗi khi lưu thời gian!');
  }
}

async function resetAuctionTime() {
  if (!confirm('⚠️ Bạn có chắc muốn reset thời gian đấu giá về mặc định?')) {
    return;
  }
  
  try {
    const res = await fetch('/api/auction-time/reset', {
      method: 'POST'
    });
    
    if (res.ok) {
      alert('✅ Đã reset thời gian thành công!');
      
      const startTimeInput = document.getElementById('startTime');
      const endTimeInput = document.getElementById('endTime');
      if (startTimeInput) startTimeInput.value = '';
      if (endTimeInput) endTimeInput.value = '';
      
      await loadCurrentTime();
    } else {
      const error = await res.text();
      alert('❌ Lỗi: ' + error);
    }
  } catch (err) {
    console.error('Error resetting auction time:', err);
    alert('❌ Lỗi khi reset thời gian!');
  }
}

// ========== QUẢN LÝ TABS ==========

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  if (!tabBtns || tabBtns.length === 0) {
    console.warn('No tab buttons found');
    return;
  }
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      const targetTab = this.dataset.tab;
      
      // Remove active class
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(content => {
        content.style.display = 'none';
      });
      
      // Add active class
      this.classList.add('active');
      
      // Show target content
      const targetContent = document.getElementById(targetTab);
      if (targetContent) {
        targetContent.style.display = 'block';
      }
      
      // Load data for specific tabs
      if (targetTab === 'historyTab') {
        console.log('History tab clicked, initializing...');
        initHistoryTab();
      }
    });
  });
  
  // Activate first tab
  if (tabBtns[0]) {
    tabBtns[0].classList.add('active');
  }
  if (tabContents[0]) {
    tabContents[0].style.display = 'block';
  }
}

// ========== QUẢN LÝ SẢN PHẨM ==========

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    const products = await res.json();
    
    const tbody = document.querySelector('#tbl tbody');
    if (!tbody) {
      console.error('Table body not found');
      return;
    }
    
    tbody.innerHTML = '';
    
    if (!products || products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#999;">Chưa có sản phẩm nào</td></tr>';
      return;
    }
    
    products.forEach(p => {
      const tr = document.createElement('tr');
      
      let imgHTML = '<span style="color:#999;">N/A</span>';
      if (p.HinhAnh) {
        const firstImg = p.HinhAnh.split(',')[0].trim();
        imgHTML = `<img src="${firstImg}" alt="${p.TenProduct}" style="width:60px;height:60px;object-fit:cover;border-radius:5px;box-shadow:0 2px 4px rgba(0,0,0,0.1);" onerror="this.src='/uploads/placeholder.png'">`;
      }
      
      let ipHTML = '<span style="color:#999;">N/A</span>';
      if (p.LastBidIP) {
        ipHTML = `<span style="background:#e3f2fd;padding:4px 8px;border-radius:4px;font-size:12px;color:#1976d2;">${p.LastBidIP}</span>`;
      }
      
      tr.innerHTML = `
        <td style="text-align:center;">${p.MaProduct}</td>
        <td><strong>${p.TenProduct || '-'}</strong></td>
        <td style="text-align:right;">${p.GiaKhoiDiem != null ? Number(p.GiaKhoiDiem).toLocaleString() + ' VNĐ' : '-'}</td>
        <td style="text-align:right;color:#d32f2f;font-weight:bold;">${p.GiaHienTai != null ? Number(p.GiaHienTai).toLocaleString() + ' VNĐ' : '-'}</td>
        <td>${p.TenNguoiDauGia || '<span style="color:#999;">N/A</span>'}</td>
        <td style="text-align:center;">${ipHTML}</td>
        <td style="text-align:center;">${imgHTML}</td>
        <td style="text-align:center;">
          <button class="btn-edit" data-id="${p.MaProduct}" style="background:#2196F3;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;margin-right:5px;">✏️ Sửa</button>
          <button class="btn-delete" data-id="${p.MaProduct}" style="background:#f44336;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">🗑️ Xóa</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    
    attachProductButtons();
    
  } catch (err) {
    console.error('Error loading products:', err);
    const tbody = document.querySelector('#tbl tbody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:#f44336;">Lỗi khi tải dữ liệu</td></tr>';
    }
  }
}

function attachProductButtons() {
  const editBtns = document.querySelectorAll('.btn-edit');
  editBtns.forEach(btn => {
    btn.addEventListener('click', openEditModal);
  });
  
  const deleteBtns = document.querySelectorAll('.btn-delete');
  deleteBtns.forEach(btn => {
    btn.addEventListener('click', deleteProduct);
  });
}

async function openEditModal(e) {
  const id = e.currentTarget.dataset.id;
  const modal = document.getElementById('editModal');
  
  if (!modal) {
    console.error('Edit modal not found');
    return;
  }
  
  try {
    const res = await fetch(`/api/products/${id}`);
    const product = await res.json();
    
    const editId = document.getElementById('editId');
    const editTen = document.getElementById('editTen');
    const editGiaKhoiDiem = document.getElementById('editGiaKhoiDiem');
    const editGiaHienTai = document.getElementById('editGiaHienTai');
    const editNguoiDauGia = document.getElementById('editNguoiDauGia');
    const editMoTa = document.getElementById('editMoTa');
    
    if (editId) editId.value = product.MaProduct;
    if (editTen) editTen.value = product.TenProduct;
    if (editGiaKhoiDiem) editGiaKhoiDiem.value = product.GiaKhoiDiem;
    if (editGiaHienTai) editGiaHienTai.value = product.GiaHienTai || '';
    if (editNguoiDauGia) editNguoiDauGia.value = product.TenNguoiDauGia || '';
    if (editMoTa) editMoTa.value = product.MoTa || '';
    
    // Hiển thị ảnh
    const imgSlider = document.getElementById('editImgSlider');
    const editImg = document.getElementById('editImg');
    
    if (imgSlider && editImg) {
      imgSlider.innerHTML = '';
      
      let imgs = [];
      if (product.HinhAnh && product.HinhAnh.includes(',')) {
        imgs = product.HinhAnh.split(',').map(s => s.trim()).filter(Boolean);
      } else if (product.HinhAnh) {
        imgs = [product.HinhAnh];
      } else {
        imgs = ['/uploads/placeholder.png'];
      }
      
      imgs.forEach((src, i) => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = product.TenProduct;
        img.onclick = () => {
          editImg.src = src;
          imgSlider.querySelectorAll('img').forEach(el => el.classList.remove('active'));
          img.classList.add('active');
        };
        if (i === 0) img.classList.add('active');
        imgSlider.appendChild(img);
      });
      
      editImg.src = imgs[0] || '/uploads/placeholder.png';
    }
    
    modal.style.display = 'flex';
    
  } catch (err) {
    console.error('Error loading product:', err);
    alert('Lỗi khi tải thông tin sản phẩm');
  }
}

// Đóng modal sửa
function initEditModalClose() {
  const closeBtn = document.getElementById('editClose');
  const modal = document.getElementById('editModal');
  
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', function() {
      modal.style.display = 'none';
    });
  }
}

// Cập nhật sản phẩm
async function updateProduct(e) {
  e.preventDefault();
  
  const id = document.getElementById('editId').value;
  const formData = new FormData(document.getElementById('formEdit'));
  
  try {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      body: formData
    });
    
    if (res.ok) {
      alert('✅ Cập nhật sản phẩm thành công!');
      document.getElementById('editModal').style.display = 'none';
      await loadProducts();
    } else {
      const error = await res.text();
      alert('❌ Lỗi: ' + error);
    }
  } catch (err) {
    console.error('Error updating product:', err);
    alert('❌ Lỗi khi cập nhật sản phẩm!');
  }
}

// Xóa sản phẩm
async function deleteProduct(e) {
  const id = e.currentTarget.dataset.id;
  
  if (!confirm('⚠️ Bạn có chắc muốn xóa sản phẩm này?')) {
    return;
  }
  
  try {
    const res = await fetch(`/api/products/${id}`, {
      method: 'DELETE'
    });
    
    if (res.ok) {
      alert('✅ Xóa sản phẩm thành công!');
      await loadProducts();
    } else {
      const error = await res.text();
      alert('❌ Lỗi: ' + error);
    }
  } catch (err) {
    console.error('Error deleting product:', err);
    alert('❌ Lỗi khi xóa sản phẩm!');
  }
}

// ========== FORM THÊM SẢN PHẨM ==========

function initAddProductForm() {
  const addForm = document.getElementById('formAdd');
  if (addForm) {
    addForm.addEventListener('submit', addProduct);
  }
  
  // Initialize image preview
  initImagePreview();
  
  // Initialize drag and drop
  initDragAndDrop();
}

// Image preview functionality
function initImagePreview() {
  const fileInput = document.getElementById('addHinhAnh');
  if (!fileInput) return;
  
  fileInput.addEventListener('change', function(e) {
    handleImageSelect(e.target.files);
  });
}

function handleImageSelect(files) {
  const previewContainer = document.getElementById('imagePreview');
  if (!previewContainer) return;
  
  previewContainer.innerHTML = '';
  
  if (files.length > 4) {
    alert('⚠️ Chỉ được chọn tối đa 4 ảnh!');
    return;
  }
  
  Array.from(files).forEach((file, index) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      
      reader.onload = function(e) {
        const previewItem = document.createElement('div');
        previewItem.className = 'image-preview-item';
        previewItem.innerHTML = `
          <img src="${e.target.result}" alt="Preview ${index + 1}">
          <button type="button" class="remove-image" onclick="removePreviewImage(${index})" title="Xóa ảnh">×</button>
        `;
        previewContainer.appendChild(previewItem);
      };
      
      reader.readAsDataURL(file);
    }
  });
}

function removePreviewImage(index) {
  const fileInput = document.getElementById('addHinhAnh');
  if (!fileInput) return;
  
  const dt = new DataTransfer();
  const files = fileInput.files;
  
  for (let i = 0; i < files.length; i++) {
    if (i !== index) {
      dt.items.add(files[i]);
    }
  }
  
  fileInput.files = dt.files;
  handleImageSelect(fileInput.files);
}

// Drag and drop functionality
function initDragAndDrop() {
  const uploadArea = document.querySelector('.file-upload-area');
  if (!uploadArea) return;
  
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, preventDefaults, false);
  });
  
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  ['dragenter', 'dragover'].forEach(eventName => {
    uploadArea.addEventListener(eventName, () => {
      uploadArea.classList.add('dragover');
    }, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, () => {
      uploadArea.classList.remove('dragover');
    }, false);
  });
  
  uploadArea.addEventListener('drop', function(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    const fileInput = document.getElementById('addHinhAnh');
    if (fileInput) {
      fileInput.files = files;
      handleImageSelect(files);
    }
  }, false);
}

async function addProduct(e) {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  
  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      body: formData
    });
    
    if (res.ok) {
      alert('✅ Thêm sản phẩm thành công!');
      e.target.reset();
      
      // Clear image preview
      const previewContainer = document.getElementById('imagePreview');
      if (previewContainer) {
        previewContainer.innerHTML = '';
      }
      
      await loadProducts();
    } else {
      const error = await res.text();
      alert('❌ Lỗi: ' + error);
    }
  } catch (err) {
    console.error('Error adding product:', err);
    alert('❌ Lỗi khi thêm sản phẩm!');
  }
}

// ========== FORM SỬA SẢN PHẨM ==========

function initEditProductForm() {
  const editForm = document.getElementById('formEdit');
  if (editForm) {
    editForm.addEventListener('submit', updateProduct);
  }
  
  // Initialize edit image preview
  initEditImagePreview();
}

// Edit image preview functionality
function initEditImagePreview() {
  const fileInput = document.getElementById('editHinhAnh');
  if (!fileInput) return;
  
  fileInput.addEventListener('change', function(e) {
    handleEditImageSelect(e.target.files);
  });
}

function handleEditImageSelect(files) {
  const previewContainer = document.getElementById('editImagePreview');
  if (!previewContainer) return;
  
  previewContainer.innerHTML = '';
  
  if (files.length > 4) {
    alert('⚠️ Chỉ được chọn tối đa 4 ảnh!');
    return;
  }
  
  if (files.length === 0) return;
  
  Array.from(files).forEach((file, index) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      
      reader.onload = function(e) {
        const previewItem = document.createElement('div');
        previewItem.className = 'image-preview-item';
        previewItem.innerHTML = `
          <img src="${e.target.result}" alt="Preview ${index + 1}">
          <button type="button" class="remove-image" onclick="removeEditPreviewImage(${index})" title="Xóa ảnh">×</button>
        `;
        previewContainer.appendChild(previewItem);
      };
      
      reader.readAsDataURL(file);
    }
  });
}

function removeEditPreviewImage(index) {
  const fileInput = document.getElementById('editHinhAnh');
  if (!fileInput) return;
  
  const dt = new DataTransfer();
  const files = fileInput.files;
  
  for (let i = 0; i < files.length; i++) {
    if (i !== index) {
      dt.items.add(files[i]);
    }
  }
  
  fileInput.files = dt.files;
  handleEditImageSelect(fileInput.files);
}

// Update product
async function updateProduct(e) {
  e.preventDefault();
  
  const id = document.getElementById('editId').value;
  const formData = new FormData(e.target);
  
  // Log để debug
  console.log('Updating product:', id);
  for (let pair of formData.entries()) {
    console.log(pair[0], pair[1]);
  }
  
  try {
    const res = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      body: formData
    });
    
    if (res.ok) {
      alert('✅ Cập nhật sản phẩm thành công!');
      
      // Close modal
      const modal = document.getElementById('editModal');
      if (modal) {
        modal.style.display = 'none';
      }
      
      // Clear preview
      const previewContainer = document.getElementById('editImagePreview');
      if (previewContainer) {
        previewContainer.innerHTML = '';
      }
      
      // Reset file input
      const fileInput = document.getElementById('editHinhAnh');
      if (fileInput) {
        fileInput.value = '';
      }
      
      // Reload products
      await loadProducts();
    } else {
      const error = await res.text();
      alert('❌ Lỗi: ' + error);
    }
  } catch (err) {
    console.error('Error updating product:', err);
    alert('❌ Lỗi khi cập nhật sản phẩm!');
  }
}

// ========== KHỞI TẠO KHI TRANG TẢI ==========
// (Removed duplicate - see main DOMContentLoaded at bottom)

// ===== HISTORY TAB =====
let currentHistoryPage = 1;
const historyPerPage = 20;
let historyTabInitialized = false;

function initHistoryTab() {
  console.log('=== INIT HISTORY TAB ===');
  
  if (historyTabInitialized) {
    console.log('History tab already initialized, just loading data...');
    loadBidHistory();
    return;
  }
  
  // Pagination buttons
  const prevPageBtn = document.getElementById('btnPrevPage');
  const nextPageBtn = document.getElementById('btnNextPage');
  
  console.log('Pagination buttons:', { prevPageBtn, nextPageBtn });
  
  if (prevPageBtn) {
    prevPageBtn.addEventListener('click', () => {
      if (currentHistoryPage > 1) {
        currentHistoryPage--;
        loadBidHistory();
      }
    });
  }
  
  if (nextPageBtn) {
    nextPageBtn.addEventListener('click', () => {
      currentHistoryPage++;
      loadBidHistory();
    });
  }
  
  historyTabInitialized = true;
  
  // Load initial data
  console.log('Calling loadBidHistory()...');
  loadBidHistory();
}

async function loadBidHistory() {
  console.log('=== LOAD BID HISTORY START ===');
  try {
    const params = new URLSearchParams({
      page: currentHistoryPage,
      limit: historyPerPage
    });
    
    console.log('Fetching bid history with params:', params.toString());
    
    const response = await fetch(`/api/bid-history?${params}`);
    console.log('Response status:', response.status, response.statusText);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Bid history data received:', data);
    
    renderBidHistory(data.bids);
    updateHistoryPagination(data.total);
  } catch (error) {
    console.error('Error loading bid history:', error);
    const tbody = document.querySelector('#historyTable tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#f00;">Lỗi tải dữ liệu: ' + error.message + '</td></tr>';
  }
}

function renderBidHistory(bids) {
  console.log('=== RENDER BID HISTORY ===');
  console.log('Bids to render:', bids);
  
  const tbody = document.querySelector('#historyTable tbody');
  console.log('Table tbody element:', tbody);
  
  if (!tbody) {
    console.error('ERROR: historyTable tbody not found!');
    return;
  }
  
  if (!bids || bids.length === 0) {
    console.log('No bids to display');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#999;">Chưa có lịch sử đấu giá</td></tr>';
    return;
  }
  
  console.log('Rendering', bids.length, 'bids');
  
  tbody.innerHTML = bids.map((bid, index) => {
    const rowNumber = (currentHistoryPage - 1) * historyPerPage + index + 1;
    const productName = bid.ProductName || 'N/A';
    const username = bid.Username || '<span style="color:#999;">Chưa có</span>';
    const price = bid.Price ? Number(bid.Price).toLocaleString('vi-VN') + ' đ' : '<span style="color:#999;">N/A</span>';
    const ip = bid.IP || '<span style="color:#999;">N/A</span>';
    
    // Fix timezone issue - SQL Server returns local time without timezone
    let createTime = 'N/A';
    if (bid.CreateTime) {
      try {
        // Parse the datetime string as-is (assume it's already in Vietnam timezone)
        const dateStr = bid.CreateTime.replace('T', ' ').split('.')[0]; // Remove milliseconds
        const [datePart, timePart] = dateStr.split(' ');
        const [year, month, day] = datePart.split('-');
        const [hour, min, sec] = timePart.split(':');
        
        // Format as HH:mm:ss DD/MM/YYYY
        createTime = `${hour}:${min}:${sec} ${day}/${month}/${year}`;
      } catch (e) {
        console.error('Error parsing date:', bid.CreateTime, e);
        createTime = bid.CreateTime;
      }
    }
    
    return `
      <tr>
        <td style="text-align:center;font-weight:600;">${rowNumber}</td>
        <td style="text-align:left;"><strong>${productName}</strong></td>
        <td style="text-align:left;">${username}</td>
        <td style="text-align:right;color:#27ae60;font-weight:bold;">${price}</td>
        <td style="text-align:center;"><span class="ip-badge">${ip}</span></td>
        <td style="text-align:center;font-size:13px;">${createTime}</td>
      </tr>
    `;
  }).join('');
  
  console.log('Render complete! Table HTML updated');
}

function updateHistoryPagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / historyPerPage));
  
  const pageInfo = document.getElementById('pageInfo');
  const prevBtn = document.getElementById('btnPrevPage');
  const nextBtn = document.getElementById('btnNextPage');
  
  if (pageInfo) pageInfo.textContent = `Trang ${currentHistoryPage} / ${totalPages}`;
  if (prevBtn) prevBtn.disabled = currentHistoryPage <= 1;
  if (nextBtn) nextBtn.disabled = currentHistoryPage >= totalPages;
}

// ===== EXPORT EXCEL =====
function initExportExcel() {
  const exportBtn = document.getElementById('exportExcelBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportBidHistory);
  }
}

async function exportBidHistory() {
  try {
    const response = await fetch('/api/export-excel');
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thong-ke-dau-gia-${new Date().getTime()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    alert('✅ Xuất file Excel thành công!');
  } catch (err) {
    console.error('Error exporting Excel:', err);
    alert('❌ Lỗi khi xuất file Excel!');
  }
}

// ===== SOCKET.IO =====
function initSocketIO() {
  // Lắng nghe sự kiện thay đổi sản phẩm
  socket.on('productsChanged', function() {
    loadProducts();
  });

  // Lắng nghe sự kiện đấu giá mới
  socket.on('newBid', function(data) {
    console.log('New bid received:', data);
    loadProducts();
    loadBidHistory();
  });

  // Lắng nghe sự kiện cập nhật thời gian đấu giá
  socket.on('auctionTimeUpdated', function(data) {
    console.log('Auction time updated:', data);
    loadCurrentTime();
  });
}

// ========== TIME MANAGEMENT ==========
function initTimeManagement() {
  console.log('🔧 Initializing time management...');
  
  const saveBtn = document.getElementById('saveTimeBtn');
  const resetBtn = document.getElementById('resetTimeBtn');
  
  console.log('Save button:', saveBtn);
  console.log('Reset button:', resetBtn);
  
  if (saveBtn) {
    saveBtn.addEventListener('click', saveAuctionTime);
    console.log('✅ Save button listener attached');
  } else {
    console.error('❌ Save button not found!');
  }
  
  if (resetBtn) {
    resetBtn.addEventListener('click', resetAuctionTime);
    console.log('✅ Reset button listener attached');
  } else {
    console.error('❌ Reset button not found!');
  }
}

// ========== MODAL ==========
function initModal() {
  const modal = document.getElementById('editModal');
  const closeBtn = document.getElementById('editClose');
  
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      
      // Clear preview when closing
      const previewContainer = document.getElementById('editImagePreview');
      if (previewContainer) {
        previewContainer.innerHTML = '';
      }
      
      // Reset file input
      const fileInput = document.getElementById('editHinhAnh');
      if (fileInput) {
        fileInput.value = '';
      }
    });
  }
  
  // Close when clicking outside modal
  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
      
      // Clear preview when closing
      const previewContainer = document.getElementById('editImagePreview');
      if (previewContainer) {
        previewContainer.innerHTML = '';
      }
      
      // Reset file input
      const fileInput = document.getElementById('editHinhAnh');
      if (fileInput) {
        fileInput.value = '';
      }
    }
  });
}

// ========== KHỞI TẠO KHI TRANG LOAD ==========

document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Admin page initializing...');
  
  // Load thời gian đấu giá
  loadCurrentTime();
  
  // Load danh sách sản phẩm
  loadProducts();
  
  // Khởi tạo tabs
  initTabs();
  
  // Khởi tạo form thêm sản phẩm
  initAddProductForm();
  
  // Khởi tạo form sửa sản phẩm
  initEditProductForm();
  
  // Khởi tạo nút đóng modal
  initEditModalClose();
  
  // Khởi tạo modal
  initModal();
  
  // Khởi tạo quản lý thời gian (buttons)
  initTimeManagement();
  
  // Khởi tạo nút xuất Excel
  initExportExcel();
  
  // Khởi tạo Socket.IO
  initSocketIO();
  
  // Cập nhật trạng thái mỗi phút
  setInterval(() => {
    loadCurrentTime();
  }, 60000);
  
  console.log('✅ Admin page initialized successfully');
});

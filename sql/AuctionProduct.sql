-- AuctionProduct.sql
CREATE DATABASE AuctionProduct;
GO
USE AuctionProduct;
GO

CREATE TABLE Product (
    MaProduct INT IDENTITY(1,1) PRIMARY KEY,
    TenProduct NVARCHAR(100),
    GiaKhoiDiem DECIMAL(18,2),
    GiaHienTai DECIMAL(18,2) NULL,
    TenNguoiDauGia NVARCHAR(100) NULL,
    HinhAnh NVARCHAR(255),
    GhiChu NVARCHAR(1000),
    MoTa NVARCHAR(MAX) NULL
);

CREATE TABLE Daugia (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    MaProduct INT FOREIGN KEY REFERENCES Product(MaProduct),
    TenNguoiDauGia NVARCHAR(100),
    GiaHienTai DECIMAL(18,2),
    Note NVARCHAR(255),
    IP NVARCHAR(45) NULL,
    CreatedAt DATETIME DEFAULT GETDATE()
);

-- sample data (không có hình ảnh, sẽ thêm sau qua admin)
INSERT INTO Product (TenProduct, GiaKhoiDiem, GiaHienTai, TenNguoiDauGia, HinhAnh, GhiChu, MoTa)
VALUES (N'Điện thoại Mẫu', 1000000, NULL, NULL, NULL, N'Chưa có ai', N'Điện thoại thông minh cao cấp'),
       (N'Laptop Mẫu', 20000000, NULL, NULL, NULL, N'Chưa có ai', N'Laptop hiệu năng cao phù hợp cho công việc và giải trí');

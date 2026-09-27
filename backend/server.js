const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded images statically
app.use('/uploads', express.static(uploadsDir));

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only images (jpg, jpeg, png, webp, gif) are allowed!'));
  }
});

// Admin Authentication Middleware (simple password check in request headers)
const adminAuth = (req, res, next) => {
  const adminPassword = req.headers['x-admin-password'];
  if (adminPassword === 'admin123') { // Simple default password for owner
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid Admin Password' });
  }
};

// ==========================================
// PRODUCTS ENDPOINTS
// ==========================================

// Get all products (with stock details nested)
app.get('/api/products', async (req, res) => {
  try {
    const products = await db.getProducts();
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await db.getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create product (Admin only)
// Uses multer upload.single('image') to handle image uploads
app.post('/api/products', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category, stockData } = req.body;
    
    if (!name || !price || !category) {
      return res.status(400).json({ error: 'Name, price, and category are required' });
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    
    // Create product
    const productId = await db.createProduct(name, description, parseFloat(price), category, imageUrl);

    // Save stock data if provided
    // stockData should be a stringified JSON array: [{"color": "Red", "size": "M", "quantity": 10}, ...]
    if (stockData) {
      const parsedStock = JSON.parse(stockData);
      if (Array.isArray(parsedStock)) {
        for (let item of parsedStock) {
          if (item.color && item.size) {
            await db.updateStockItem(productId, item.color, item.size, parseInt(item.quantity) || 0);
          }
        }
      }
    }

    const createdProduct = await db.getProductById(productId);
    res.status(201).json(createdProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product (Admin only)
app.put('/api/products/:id', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, category, stockData } = req.body;

    if (!name || !price || !category) {
      return res.status(400).json({ error: 'Name, price, and category are required' });
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    
    // Update main product details
    await db.updateProduct(id, name, description, parseFloat(price), category, imageUrl);

    // Update stock details if provided
    if (stockData) {
      const parsedStock = JSON.parse(stockData);
      if (Array.isArray(parsedStock)) {
        // Option to fully overwrite or update stock
        // For simplicity, we upsert the given items. Admin can also remove stock items via separate endpoint or we overwrite.
        // Let's clear old stock and insert new stock to prevent orphaned variations if they were deleted
        const existingStock = await db.getStockByProduct(id);
        const newStockKeys = new Set(parsedStock.map(item => `${item.color.trim().toLowerCase()}-${item.size.trim().toLowerCase()}`));
        
        // Remove existing items that aren't in the new list
        for (let oldItem of existingStock) {
          const key = `${oldItem.color.trim().toLowerCase()}-${oldItem.size.trim().toLowerCase()}`;
          if (!newStockKeys.has(key)) {
            await db.removeStockItem(id, oldItem.color, oldItem.size);
          }
        }

        // Upsert new list
        for (let item of parsedStock) {
          if (item.color && item.size) {
            await db.updateStockItem(id, item.color, item.size, parseInt(item.quantity) || 0);
          }
        }
      }
    }

    const updatedProduct = await db.getProductById(id);
    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete product (Admin only)
app.delete('/api/products/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const product = await db.getProductById(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Optional: Delete the image file from server if it exists
    if (product.image_url) {
      const absolutePath = path.join(__dirname, product.image_url);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    }

    await db.deleteProduct(id);
    res.json({ message: 'Product and associated stock deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// STOCK ENDPOINTS
// ==========================================

// Quick updates to stock level (Admin only)
app.put('/api/products/:id/stock', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { color, size, quantity } = req.body;

    if (!color || !size || quantity === undefined) {
      return res.status(400).json({ error: 'Color, size, and quantity are required' });
    }

    await db.updateStockItem(id, color, size, parseInt(quantity));
    const updatedProduct = await db.getProductById(id);
    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// ORDERS ENDPOINTS
// ==========================================

// Create an order (Checkout)
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, customerPhone, customerAddress, paymentMethod, totalAmount, items, paymentRef } = req.body;

    if (!customerName || !customerPhone || !customerAddress || !paymentMethod || !totalAmount || !items) {
      return res.status(400).json({ error: 'All customer and order details are required' });
    }

    // Verify stock availability before placing order
    const orderItems = typeof items === 'string' ? JSON.parse(items) : items;
    for (let item of orderItems) {
      const product = await db.getProductById(item.product_id);
      if (!product) {
        return res.status(400).json({ error: `Product ${item.name} does not exist.` });
      }
      const stockItem = product.stock.find(
        s => s.color.toLowerCase() === item.color.toLowerCase() && s.size.toLowerCase() === item.size.toLowerCase()
      );
      if (!stockItem || stockItem.quantity < item.quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock for ${product.name} (Color: ${item.color}, Size: ${item.size}). Available: ${stockItem ? stockItem.quantity : 0}` 
        });
      }
    }

    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items);
    
    // Set default payment status based on method
    let paymentStatus = 'Pending';
    if (paymentMethod === 'CARD' || (paymentMethod === 'UPI' && paymentRef)) {
      paymentStatus = 'Paid'; // Mock payment validation
    }

    const orderId = await db.createOrder(
      customerName, 
      customerPhone, 
      customerAddress, 
      paymentMethod, 
      parseFloat(totalAmount), 
      itemsJson, 
      paymentRef || null
    );

    res.status(201).json({ 
      message: 'Order placed successfully', 
      orderId: orderId,
      paymentStatus: paymentStatus
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all orders (Admin only)
app.get('/api/orders', adminAuth, async (req, res) => {
  try {
    const orders = await db.getOrders();
    // Parse order items JSON string for convenience
    const formattedOrders = orders.map(order => ({
      ...order,
      items: JSON.parse(order.items)
    }));
    res.json(formattedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update order status (Admin only)
app.put('/api/orders/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { orderStatus, paymentStatus } = req.body;

    if (!orderStatus || !paymentStatus) {
      return res.status(400).json({ error: 'OrderStatus and PaymentStatus are required' });
    }

    await db.updateOrderStatus(id, orderStatus, paymentStatus);
    res.json({ message: 'Order status updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const db = require('./database');
const otpService = require('./otpService');

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
// USER AUTHENTICATION & OTP ENDPOINTS
// ==========================================

// Send OTP to phone number & email for verification
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { phone, email } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }

    const cleanPhone = phone.toString().trim().replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number' });
    }

    // Check if phone number is already registered
    const existingUser = await db.getUserByEmailOrPhone(cleanPhone);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this mobile number already exists. Please sign in.' });
    }

    // Check if email is already registered
    if (email && email.trim()) {
      const existingEmail = await db.getUserByEmail(email.trim());
      if (existingEmail) {
        return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
      }
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await db.saveOtp(cleanPhone, otp, 5); // 5 minutes validity

    // Dispatch OTP via SMS (Fast2SMS / Twilio) and Email (Nodemailer)
    const delivery = await otpService.dispatchOtp({ phone: cleanPhone, email: email ? email.trim() : null, otp });

    if (!delivery.smsSent && !delivery.emailSent) {
      console.log(`\n------------------------------------------------------------`);
      console.log(`[SMS/EMAIL DELIVERY FAILED]`);
      if (delivery.smsError) console.log(`[FAST2SMS REASON]: ${delivery.smsError}`);
      console.log(`[SERVER TERMINAL ONLY - FOR OWNER/DEBUGGING]: OTP is >>> ${otp} <<<`);
      console.log(`------------------------------------------------------------\n`);

      const userFriendlyError = delivery.smsError
        ? `Fast2SMS Notice: ${delivery.smsError}`
        : 'Could not deliver SMS or Email. Please check your SMS gateway settings.';

      return res.status(400).json({
        error: userFriendlyError,
        smsSent: false,
        emailSent: false
      });
    }

    let successChannels = [];
    if (delivery.smsSent) successChannels.push(`SMS (+91 ${cleanPhone})`);
    if (delivery.emailSent) successChannels.push(`Email (${email})`);

    res.json({
      message: `OTP sent successfully to your ${successChannels.join(' and ')}!`,
      phone: cleanPhone,
      email: email || '',
      smsSent: delivery.smsSent,
      emailSent: delivery.emailSent
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ error: 'Phone number and OTP are required' });
    }

    const cleanPhone = phone.toString().trim().replace(/\D/g, '').slice(-10);
    const record = await db.getOtp(cleanPhone);

    if (!record) {
      return res.status(400).json({ error: 'No active OTP found. Please request a new OTP.' });
    }

    if (Date.now() > record.expires_at) {
      await db.deleteOtp(cleanPhone);
      return res.status(400).json({ error: 'OTP has expired. Please request a new OTP.' });
    }

    if (record.otp !== otp.toString().trim()) {
      return res.status(400).json({ error: 'Incorrect OTP. Please enter the 6-digit code sent to your phone.' });
    }

    res.json({
      verified: true,
      message: 'Mobile number verified successfully'
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// Register a new customer (requires verified OTP)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, phone, password, otp } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Name, email, mobile number, and password are required' });
    }

    const cleanPhone = phone.toString().trim().replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
    }

    if (!otp) {
      return res.status(400).json({ error: 'Mobile verification required: Please enter the OTP sent to your phone.' });
    }

    // Verify OTP from database
    const otpRecord = await db.getOtp(cleanPhone);
    if (!otpRecord) {
      return res.status(400).json({ error: 'No OTP requested or OTP has expired. Please request a new OTP.' });
    }
    if (Date.now() > otpRecord.expires_at) {
      await db.deleteOtp(cleanPhone);
      return res.status(400).json({ error: 'OTP has expired. Please request a new OTP.' });
    }
    if (otpRecord.otp !== otp.toString().trim()) {
      return res.status(400).json({ error: 'Invalid OTP. Please enter the correct 6-digit code.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Check if user with this email already exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
    }

    // Check if phone number is already registered
    const existingPhone = await db.getUserByEmailOrPhone(cleanPhone);
    if (existingPhone) {
      return res.status(409).json({ error: 'An account with this phone number is already registered.' });
    }

    const newUser = await db.createUser(name, email, cleanPhone, password);
    // Delete used OTP
    await db.deleteOtp(cleanPhone);

    res.status(201).json({
      message: 'Account created and mobile number verified successfully',
      user: newUser
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// Login customer
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, email, password } = req.body;
    const loginId = (identifier || email || '').trim();

    if (!loginId || !password) {
      return res.status(400).json({ error: 'Email/Phone and password are required' });
    }

    const user = await db.getUserByEmailOrPhone(loginId);
    if (!user) {
      return res.status(401).json({ error: 'No account found with this email or phone' });
    }

    const isValid = db.verifyPassword(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        role: user.role || 'customer'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login. Please try again.' });
  }
});

// Get all users (Admin only)
app.get('/api/auth/users', adminAuth, async (req, res) => {
  try {
    const users = await db.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    let parsedStock = [];
    if (stockData) {
      try {
        parsedStock = typeof stockData === 'string' ? JSON.parse(stockData) : stockData;
      } catch (err) {
        console.warn('Could not parse stockData:', err.message);
      }
    }
    
    // If no stock variations provided, add default variation so garment can be purchased
    if (!Array.isArray(parsedStock) || parsedStock.length === 0) {
      parsedStock = [
        { color: 'Standard', size: 'M', quantity: 15 },
        { color: 'Standard', size: 'L', quantity: 15 }
      ];
    }

    for (let item of parsedStock) {
      if (item && item.color && item.size) {
        await db.updateStockItem(productId, item.color, item.size, parseInt(item.quantity) || 0);
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
      let parsedStock = [];
      try {
        parsedStock = typeof stockData === 'string' ? JSON.parse(stockData) : stockData;
      } catch (err) {
        console.warn('Could not parse stockData:', err.message);
      }

      if (Array.isArray(parsedStock) && parsedStock.length > 0) {
        const existingStock = await db.getStockByProduct(id);
        const newStockKeys = new Set(parsedStock.map(item => `${(item.color || '').trim().toLowerCase()}-${(item.size || '').trim().toLowerCase()}`));
        
        // Remove existing items that aren't in the new list
        for (let oldItem of existingStock) {
          const key = `${oldItem.color.trim().toLowerCase()}-${oldItem.size.trim().toLowerCase()}`;
          if (!newStockKeys.has(key)) {
            await db.removeStockItem(id, oldItem.color, oldItem.size);
          }
        }

        // Upsert new list
        for (let item of parsedStock) {
          if (item && item.color && item.size) {
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

// ==========================================
// PER-USER CART & USER ORDERS ENDPOINTS
// ==========================================

// Get isolated cart for a specific user
app.get('/api/cart', async (req, res) => {
  try {
    const { userId, email } = req.query;
    if (!userId && !email) {
      return res.json({ items: [] });
    }
    const items = await db.getUserCart(userId ? parseInt(userId, 10) : null, email);
    res.json({ items: items || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save / sync isolated cart for a specific user
app.post('/api/cart', async (req, res) => {
  try {
    const { userId, email, items } = req.body;
    if (!userId && !email) {
      return res.status(400).json({ error: 'User ID or Email is required' });
    }
    await db.saveUserCart(userId ? parseInt(userId, 10) : null, email, items || []);
    res.json({ success: true, message: 'Cart updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear cart for a specific user
app.delete('/api/cart', async (req, res) => {
  try {
    const { userId, email } = req.query;
    if (!userId && !email) {
      return res.status(400).json({ error: 'User ID or Email is required' });
    }
    await db.clearUserCart(userId ? parseInt(userId, 10) : null, email);
    res.json({ success: true, message: 'Cart cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get or create wallet for specific user
app.get('/api/wallet', async (req, res) => {
  try {
    const { userId, email } = req.query;
    if (!userId && !email) {
      return res.status(400).json({ error: 'User ID or Email is required' });
    }
    const wallet = await db.getOrCreateWallet(userId ? parseInt(userId, 10) : null, email);
    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit a Wallet Top-up Request (requires admin verification of real payment)
app.post('/api/wallet/request-topup', async (req, res) => {
  try {
    const { userId, email, amount, paymentMethod, paymentRef, customerName } = req.body;
    if (!userId && !email) {
      return res.status(400).json({ error: 'User ID or Email is required' });
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid amount greater than 0.' });
    }
    if (!paymentRef || !paymentRef.trim()) {
      return res.status(400).json({ error: 'UPI Transaction / Reference Number (UTR) is required.' });
    }

    const request = await db.createTopupRequest(
      userId ? parseInt(userId, 10) : null,
      email,
      numAmount,
      paymentMethod || 'UPI',
      paymentRef.trim(),
      customerName || null
    );

    res.json({
      success: true,
      message: 'Top-up request submitted! Your wallet balance will be credited as soon as store admin verifies your transaction.',
      request
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get customer's own top-up requests
app.get('/api/wallet/my-requests', async (req, res) => {
  try {
    const { userId, email } = req.query;
    if (!userId && !email) {
      return res.status(400).json({ error: 'User ID or Email is required' });
    }
    const requests = await db.getUserTopupRequests(userId ? parseInt(userId, 10) : null, email);
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all wallet top-up requests
app.get('/api/admin/wallet-requests', adminAuth, async (req, res) => {
  try {
    const requests = await db.getTopupRequests();
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Approve a wallet top-up request (Credits real wallet funds)
app.post('/api/admin/wallet-requests/:id/approve', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.approveTopupRequest(id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Reject a fake or unverified top-up request
app.post('/api/admin/wallet-requests/:id/reject', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const result = await db.rejectTopupRequest(id, reason || 'Payment not verified in bank account');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user orders (order history for specific account)
app.get('/api/user/orders', async (req, res) => {
  try {
    const { userId, email } = req.query;
    if (!userId && !email) {
      return res.status(400).json({ error: 'User ID or Email is required' });
    }
    const orders = await db.getUserOrders(userId ? parseInt(userId, 10) : null, email);
    const formattedOrders = orders.map(order => ({
      ...order,
      items: typeof order.items === 'string' ? JSON.parse(order.items) : order.items
    }));
    res.json(formattedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create an order (Checkout)
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, customerPhone, customerAddress, customerEmail, userId, paymentMethod, totalAmount, items, paymentRef, walletUsed } = req.body;

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

    const result = await db.createOrder(
      customerName, 
      customerPhone, 
      customerAddress, 
      paymentMethod, 
      parseFloat(totalAmount), 
      itemsJson, 
      paymentRef || null,
      userId ? parseInt(userId, 10) : null,
      customerEmail || null,
      parseFloat(walletUsed) || 0
    );

    res.status(201).json({ 
      message: 'Order placed successfully', 
      orderId: result.orderId,
      cashbackEarned: result.cashbackEarned,
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

// Serve frontend static build if present
const frontendDist = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      return res.sendFile(path.join(frontendDist, 'index.html'));
    }
    next();
  });
}

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

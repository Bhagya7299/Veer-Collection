const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const dbPath = path.resolve(__dirname, 'veer_collection.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Password hashing utility using Node.js crypto
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === key;
}

// Initialize database schema
db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'customer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Phone OTPs table
  db.run(`
    CREATE TABLE IF NOT EXISTS phone_otps (
      phone TEXT PRIMARY KEY,
      otp TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed demo customer if not exists
  db.get('SELECT id FROM users WHERE email = ?', ['customer@veer.com'], (err, row) => {
    if (!err && !row) {
      const demoHash = hashPassword('veer1234');
      db.run(
        'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        ['Veer Member', 'customer@veer.com', '9827332721', demoHash, 'customer']
      );
    }
  });

  // Products table
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Stock table (for track of color, size and quantity)
  db.run(`
    CREATE TABLE IF NOT EXISTS stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      color TEXT NOT NULL,
      size TEXT NOT NULL,
      quantity INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(product_id, color, size)
    )
  `);

  // Orders table
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_address TEXT NOT NULL,
      customer_email TEXT,
      user_id INTEGER,
      payment_method TEXT NOT NULL,
      payment_status TEXT DEFAULT 'Pending',
      order_status TEXT DEFAULT 'Received',
      total_amount REAL NOT NULL,
      items TEXT NOT NULL, -- JSON array of items: [{product_id, name, price, color, size, quantity}]
      payment_ref TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: ensure user_id and customer_email columns exist in existing orders table
  db.run(`ALTER TABLE orders ADD COLUMN user_id INTEGER`, () => {});
  db.run(`ALTER TABLE orders ADD COLUMN customer_email TEXT`, () => {});
  db.run(`ALTER TABLE orders ADD COLUMN wallet_used REAL DEFAULT 0`, () => {});

  // Isolated User Carts table (Unique cart for every user/email)
  db.run(`
    CREATE TABLE IF NOT EXISTS user_carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT UNIQUE NOT NULL,
      items TEXT NOT NULL DEFAULT '[]',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Customer Wallets table (Private wallet for every user/email)
  db.run(`
    CREATE TABLE IF NOT EXISTS user_wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT UNIQUE NOT NULL,
      balance REAL NOT NULL DEFAULT 0.0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Customer Wallet Transactions & Cashbacks table
  db.run(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL, -- 'credit' or 'debit'
      description TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Customer Wallet Top-Up Requests (Requires Owner Approval / Verification)
  db.run(`
    CREATE TABLE IF NOT EXISTS wallet_topup_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT NOT NULL,
      customer_name TEXT,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'UPI',
      payment_ref TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      admin_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate existing table if customer_name column does not exist
  db.all("PRAGMA table_info(wallet_topup_requests)", (err, columns) => {
    if (!err && columns && !columns.some(col => col.name === 'customer_name')) {
      db.run("ALTER TABLE wallet_topup_requests ADD COLUMN customer_name TEXT");
    }
  });
});

// Helper functions using Promises
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Database Operations API
const dbOperations = {
  // Products
  async getProducts() {
    // Get all products, and also join stock to find all colors/sizes available
    const products = await dbAll('SELECT * FROM products ORDER BY created_at DESC');
    for (let product of products) {
      product.stock = await dbAll('SELECT color, size, quantity FROM stock WHERE product_id = ?', [product.id]);
    }
    return products;
  },

  async getProductById(id) {
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [id]);
    if (product) {
      product.stock = await dbAll('SELECT color, size, quantity FROM stock WHERE product_id = ?', [id]);
    }
    return product;
  },

  async createProduct(name, description, price, category, image_url) {
    const result = await dbRun(
      'INSERT INTO products (name, description, price, category, image_url) VALUES (?, ?, ?, ?, ?)',
      [name, description, price, category, image_url]
    );
    return result.lastID;
  },

  async updateProduct(id, name, description, price, category, image_url) {
    await dbRun(
      'UPDATE products SET name = ?, description = ?, price = ?, category = ?, image_url = COALESCE(?, image_url) WHERE id = ?',
      [name, description, price, category, image_url, id]
    );
    return id;
  },

  async deleteProduct(id) {
    await dbRun('DELETE FROM products WHERE id = ?', [id]);
    await dbRun('DELETE FROM stock WHERE product_id = ?', [id]);
    return id;
  },

  // Stock
  async getStockByProduct(productId) {
    return await dbAll('SELECT * FROM stock WHERE product_id = ?', [productId]);
  },

  async updateStockItem(productId, color, size, quantity) {
    // Upsert stock record
    return await dbRun(`
      INSERT INTO stock (product_id, color, size, quantity)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(product_id, color, size) DO UPDATE SET quantity = excluded.quantity
    `, [productId, color.trim(), size.trim(), quantity]);
  },

  async removeStockItem(productId, color, size) {
    return await dbRun(
      'DELETE FROM stock WHERE product_id = ? AND color = ? AND size = ?',
      [productId, color, size]
    );
  },

  // Orders
  async createOrder(customer_name, customer_phone, customer_address, payment_method, total_amount, items, payment_ref, user_id = null, customer_email = null, wallet_used = 0) {
    const cleanEmail = customer_email ? customer_email.toLowerCase().trim() : null;
    const finalWalletUsed = parseFloat(wallet_used) || 0;

    const result = await dbRun(
      `INSERT INTO orders (customer_name, customer_phone, customer_address, payment_method, total_amount, items, payment_ref, user_id, customer_email, wallet_used) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer_name, customer_phone, customer_address, payment_method, total_amount, items, payment_ref, user_id || null, cleanEmail, finalWalletUsed]
    );

    const orderId = result.lastID;

    // Deduct stock for each item in the order
    const orderItems = JSON.parse(items);
    for (let item of orderItems) {
      await dbRun(
        `UPDATE stock 
         SET quantity = MAX(0, quantity - ?) 
         WHERE product_id = ? AND LOWER(color) = LOWER(?) AND LOWER(size) = LOWER(?)`,
        [item.quantity, item.product_id, item.color.trim(), item.size.trim()]
      );
    }

    // Automatically clear persistent user cart if associated with user
    if (cleanEmail || user_id) {
      await this.clearUserCart(user_id, cleanEmail).catch(() => {});
    }

    // Process Wallet Usage
    if (finalWalletUsed > 0 && (cleanEmail || user_id)) {
      await this.debitWallet(user_id, cleanEmail, finalWalletUsed, `Redeemed on Order #${orderId}`).catch(err => {
        console.error('Wallet debit error:', err.message);
      });
    }

    // Award 5% Instant Cashback on Order Total to User Wallet
    let cashbackEarned = 0;
    if (total_amount > 0 && (cleanEmail || user_id)) {
      cashbackEarned = Math.round(total_amount * 0.05);
      if (cashbackEarned > 0) {
        await this.creditWallet(user_id, cleanEmail, cashbackEarned, `🎁 5% Cashback on Order #${orderId}`).catch(err => {
          console.error('Cashback credit error:', err.message);
        });
      }
    }

    return { orderId, cashbackEarned };
  },

  async getOrders() {
    return await dbAll('SELECT * FROM orders ORDER BY created_at DESC');
  },

  async getUserOrders(userId, email) {
    if (!userId && !email) return [];
    const cleanEmail = email ? email.toLowerCase().trim() : null;
    return await dbAll(
      `SELECT * FROM orders 
       WHERE (customer_email = ? OR (user_id IS NOT NULL AND user_id = ?)) 
       ORDER BY created_at DESC`,
      [cleanEmail, userId || -1]
    );
  },

  async updateOrderStatus(orderId, orderStatus, paymentStatus) {
    return await dbRun(
      'UPDATE orders SET order_status = ?, payment_status = ? WHERE id = ?',
      [orderStatus, paymentStatus, orderId]
    );
  },

  // Per-User Cart Database Operations
  async getUserCart(userId, email) {
    if (!userId && !email) return [];
    let row;
    if (email) {
      row = await dbGet('SELECT items FROM user_carts WHERE email = ?', [email.toLowerCase().trim()]);
    }
    if (!row && userId) {
      row = await dbGet('SELECT items FROM user_carts WHERE user_id = ?', [userId]);
    }
    if (row && row.items) {
      try {
        return JSON.parse(row.items);
      } catch (e) {
        return [];
      }
    }
    return [];
  },

  async saveUserCart(userId, email, items) {
    if (!email && !userId) return false;
    const cleanEmail = email ? email.toLowerCase().trim() : `user_${userId}@veer.local`;
    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items || []);

    return await dbRun(`
      INSERT INTO user_carts (user_id, email, items, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(email) DO UPDATE SET 
        items = excluded.items,
        user_id = COALESCE(excluded.user_id, user_carts.user_id),
        updated_at = CURRENT_TIMESTAMP
    `, [userId || null, cleanEmail, itemsJson]);
  },

  async clearUserCart(userId, email) {
    if (email) {
      return await dbRun('UPDATE user_carts SET items = "[]", updated_at = CURRENT_TIMESTAMP WHERE email = ?', [email.toLowerCase().trim()]);
    } else if (userId) {
      return await dbRun('UPDATE user_carts SET items = "[]", updated_at = CURRENT_TIMESTAMP WHERE user_id = ?', [userId]);
    }
  },

  // Per-User Wallet & Cashback Operations
  async getOrCreateWallet(userId, email) {
    if (!email && !userId) return { balance: 0, transactions: [] };
    const cleanEmail = email ? email.toLowerCase().trim() : `user_${userId}@veer.local`;

    let wallet = await dbGet('SELECT * FROM user_wallets WHERE email = ?', [cleanEmail]);
    if (!wallet && userId) {
      wallet = await dbGet('SELECT * FROM user_wallets WHERE user_id = ?', [userId]);
    }

    if (!wallet) {
      // New account wallet starts at ₹0
      const initialBalance = 0.0;
      const res = await dbRun(
        'INSERT INTO user_wallets (user_id, email, balance) VALUES (?, ?, ?)',
        [userId || null, cleanEmail, initialBalance]
      );
      wallet = {
        id: res.lastID,
        user_id: userId || null,
        email: cleanEmail,
        balance: initialBalance
      };
    }

    const transactions = await dbAll(
      'SELECT * FROM wallet_transactions WHERE email = ? ORDER BY created_at DESC',
      [cleanEmail]
    );

    return {
      balance: wallet.balance,
      transactions: transactions || []
    };
  },

  async topupWallet(userId, email, amount, paymentMethod = 'UPI', paymentRef = '') {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Please enter a valid top-up amount.');
    }
    const cleanEmail = email ? email.toLowerCase().trim() : `user_${userId}@veer.local`;
    const desc = paymentRef 
      ? `Added Money via ${paymentMethod} (Ref: ${paymentRef})`
      : `Added Money via ${paymentMethod}`;

    await this.creditWallet(userId, cleanEmail, numAmount, desc);
    return await this.getOrCreateWallet(userId, cleanEmail);
  },

  // Top-Up Request Operations (Strict Verification Flow)
  async createTopupRequest(userId, email, amount, paymentMethod = 'UPI', paymentRef = '', customerName = null) {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Please enter a valid top-up amount.');
    }
    if (!paymentRef || !paymentRef.trim()) {
      throw new Error('UPI Transaction / Reference Number (UTR) is required for verification.');
    }
    const cleanEmail = email ? email.toLowerCase().trim() : `user_${userId}@veer.local`;

    // Resolve name from registered user if not explicitly passed
    let resolvedName = customerName ? customerName.trim() : null;
    if (!resolvedName && email) {
      const user = await this.getUserByEmail(email);
      if (user && user.name) resolvedName = user.name;
    }

    const res = await dbRun(
      `INSERT INTO wallet_topup_requests (user_id, email, customer_name, amount, payment_method, payment_ref, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
      [userId || null, cleanEmail, resolvedName, numAmount, paymentMethod, paymentRef.trim()]
    );

    return {
      id: res.lastID,
      userId,
      email: cleanEmail,
      customerName: resolvedName,
      amount: numAmount,
      paymentMethod,
      paymentRef: paymentRef.trim(),
      status: 'Pending'
    };
  },

  async getTopupRequests(status = null) {
    const query = `
      SELECT 
        w.*,
        COALESCE(w.customer_name, u.name, 'Customer') AS customer_name
      FROM wallet_topup_requests w
      LEFT JOIN users u ON (w.user_id = u.id OR LOWER(w.email) = LOWER(u.email))
      ${status ? 'WHERE w.status = ?' : ''}
      ORDER BY w.created_at DESC
    `;
    return status ? await dbAll(query, [status]) : await dbAll(query);
  },

  async getUserTopupRequests(userId, email) {
    if (!userId && !email) return [];
    const cleanEmail = email ? email.toLowerCase().trim() : null;
    return await dbAll(`
      SELECT 
        w.*,
        COALESCE(w.customer_name, u.name, 'Customer') AS customer_name
      FROM wallet_topup_requests w
      LEFT JOIN users u ON (w.user_id = u.id OR LOWER(w.email) = LOWER(u.email))
      WHERE w.email = ? OR w.user_id = ? 
      ORDER BY w.created_at DESC
    `, [cleanEmail, userId || -1]);
  },

  async approveTopupRequest(requestId) {
    const req = await dbGet('SELECT * FROM wallet_topup_requests WHERE id = ?', [requestId]);
    if (!req) {
      throw new Error('Top-up request not found.');
    }
    if (req.status === 'Approved') {
      return { message: 'Already approved', req };
    }

    // Credit user's wallet now that owner verified real payment
    await this.creditWallet(
      req.user_id,
      req.email,
      req.amount,
      `Top-Up via ${req.payment_method} (Ref: ${req.payment_ref}) - Verified by Store Owner`
    );

    // Update status
    await dbRun(
      'UPDATE wallet_topup_requests SET status = "Approved", updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [requestId]
    );

    return { success: true, message: `Approved top-up of ₹${req.amount} for ${req.email}` };
  },

  async rejectTopupRequest(requestId, adminNotes = 'Payment not received / Invalid UTR') {
    const req = await dbGet('SELECT * FROM wallet_topup_requests WHERE id = ?', [requestId]);
    if (!req) {
      throw new Error('Top-up request not found.');
    }

    await dbRun(
      'UPDATE wallet_topup_requests SET status = "Rejected", admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [adminNotes, requestId]
    );

    return { success: true, message: `Rejected top-up request #${requestId}` };
  },

  async creditWallet(userId, email, amount, description) {
    if (!amount || amount <= 0) return false;
    const cleanEmail = email ? email.toLowerCase().trim() : `user_${userId}@veer.local`;

    await this.getOrCreateWallet(userId, cleanEmail);

    await dbRun(
      'UPDATE user_wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?',
      [amount, cleanEmail]
    );

    await dbRun(
      'INSERT INTO wallet_transactions (user_id, email, amount, type, description) VALUES (?, ?, ?, ?, ?)',
      [userId || null, cleanEmail, amount, 'credit', description]
    );

    const updated = await dbGet('SELECT balance FROM user_wallets WHERE email = ?', [cleanEmail]);
    return updated ? updated.balance : 0;
  },

  async debitWallet(userId, email, amount, description) {
    if (!amount || amount <= 0) return false;
    const cleanEmail = email ? email.toLowerCase().trim() : `user_${userId}@veer.local`;

    const wallet = await this.getOrCreateWallet(userId, cleanEmail);
    if (wallet.balance < amount) {
      throw new Error(`Insufficient wallet balance. Available: ₹${wallet.balance}`);
    }

    await dbRun(
      'UPDATE user_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?',
      [amount, cleanEmail]
    );

    await dbRun(
      'INSERT INTO wallet_transactions (user_id, email, amount, type, description) VALUES (?, ?, ?, ?, ?)',
      [userId || null, cleanEmail, amount, 'debit', description]
    );

    const updated = await dbGet('SELECT balance FROM user_wallets WHERE email = ?', [cleanEmail]);
    return updated ? updated.balance : 0;
  },

  // Users & Authentication
  async createUser(name, email, phone, password, role = 'customer') {
    const passwordHash = hashPassword(password);
    const result = await dbRun(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.trim().toLowerCase(), phone ? phone.trim() : null, passwordHash, role]
    );
    return {
      id: result.lastID,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : '',
      role
    };
  },

  async getUserByEmail(email) {
    return await dbGet('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
  },

  async getUserByEmailOrPhone(identifier) {
    const clean = identifier.trim().toLowerCase();
    return await dbGet(
      'SELECT * FROM users WHERE LOWER(email) = ? OR phone = ?',
      [clean, identifier.trim()]
    );
  },

  async getUserById(id) {
    return await dbGet('SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?', [id]);
  },

  async getAllUsers() {
    return await dbAll('SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at DESC');
  },

  verifyPassword(password, hash) {
    return verifyPassword(password, hash);
  },

  // Phone OTP Operations
  async saveOtp(phone, otp, expiryMinutes = 5) {
    const cleanPhone = phone.trim().replace(/\D/g, '').slice(-10);
    const expiresAt = Date.now() + (expiryMinutes * 60 * 1000);
    return await dbRun(`
      INSERT INTO phone_otps (phone, otp, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET otp = excluded.otp, expires_at = excluded.expires_at, created_at = CURRENT_TIMESTAMP
    `, [cleanPhone, otp, expiresAt]);
  },

  async getOtp(phone) {
    const cleanPhone = phone.trim().replace(/\D/g, '').slice(-10);
    return await dbGet('SELECT * FROM phone_otps WHERE phone = ?', [cleanPhone]);
  },

  async deleteOtp(phone) {
    const cleanPhone = phone.trim().replace(/\D/g, '').slice(-10);
    return await dbRun('DELETE FROM phone_otps WHERE phone = ?', [cleanPhone]);
  }
};

module.exports = dbOperations;

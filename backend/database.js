const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'veer_collection.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Initialize database schema
db.serialize(() => {
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
      payment_method TEXT NOT NULL,
      payment_status TEXT DEFAULT 'Pending',
      order_status TEXT DEFAULT 'Received',
      total_amount REAL NOT NULL,
      items TEXT NOT NULL, -- JSON array of items: [{product_id, name, price, color, size, quantity}]
      payment_ref TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
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
  async createOrder(customer_name, customer_phone, customer_address, payment_method, total_amount, items, payment_ref) {
    // items should be stringified JSON
    const result = await dbRun(
      `INSERT INTO orders (customer_name, customer_phone, customer_address, payment_method, total_amount, items, payment_ref) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customer_name, customer_phone, customer_address, payment_method, total_amount, items, payment_ref]
    );

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

    return result.lastID;
  },

  async getOrders() {
    return await dbAll('SELECT * FROM orders ORDER BY created_at DESC');
  },

  async updateOrderStatus(orderId, orderStatus, paymentStatus) {
    return await dbRun(
      'UPDATE orders SET order_status = ?, payment_status = ? WHERE id = ?',
      [orderStatus, paymentStatus, orderId]
    );
  }
};

module.exports = dbOperations;

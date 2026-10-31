const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'veer_collection.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Update existing categories to new standardized sections
  db.run("UPDATE products SET category = 'Upper Wear' WHERE category IN ('Shirts', 'T-Shirts')");
  db.run("UPDATE products SET category = 'Bottom Wear' WHERE category = 'Pants'");

  // Helper function to insert product and stock
  function insertIfMissing(name, description, price, category, stockList, imageUrl = null) {
    db.get('SELECT id FROM products WHERE name = ?', [name], (err, row) => {
      if (!err && !row) {
        db.run(
          'INSERT INTO products (name, description, price, category, image_url) VALUES (?, ?, ?, ?, ?)',
          [name, description, price, category, imageUrl],
          function (err2) {
            if (!err2) {
              const productId = this.lastID;
              console.log(`Added: ${name} (ID: ${productId}, Category: ${category})`);
              const stmt = db.prepare('INSERT OR REPLACE INTO stock (product_id, color, size, quantity) VALUES (?, ?, ?, ?)');
              stockList.forEach(s => {
                stmt.run(productId, s.color, s.size, s.quantity);
              });
              stmt.finalize();
            }
          }
        );
      } else if (row) {
        // Ensure category is updated
        db.run('UPDATE products SET category = ? WHERE id = ?', [category, row.id]);
      }
    });
  }

  // 1. Upper Wear Additions
  insertIfMissing(
    'Heavyweight Oversized Down Shoulder Tee',
    'Streetwear drop-shoulder relaxed silhouette crafted from 240 GSM heavy combed cotton. Preshrunk fabric with ribbed crew neck collar.',
    999,
    'Upper Wear',
    [
      { color: 'Charcoal', size: 'M', quantity: 15 },
      { color: 'Charcoal', size: 'L', quantity: 20 },
      { color: 'Charcoal', size: 'XL', quantity: 12 },
      { color: 'Beige', size: 'M', quantity: 18 },
      { color: 'Beige', size: 'L', quantity: 15 },
      { color: 'Black', size: 'M', quantity: 20 },
      { color: 'Black', size: 'L', quantity: 25 }
    ]
  );

  insertIfMissing(
    'Classic Pique Cotton Polo T-Shirt',
    'Heritage double-knit pique cotton polo featuring crisp collar, 2-button placket, and tailored sleeve cuffs. Perfect for smart casual luxury.',
    1199,
    'Upper Wear',
    [
      { color: 'Forest Green', size: 'M', quantity: 15 },
      { color: 'Forest Green', size: 'L', quantity: 18 },
      { color: 'Navy Blue', size: 'M', quantity: 20 },
      { color: 'Navy Blue', size: 'L', quantity: 22 },
      { color: 'White', size: 'M', quantity: 16 },
      { color: 'White', size: 'L', quantity: 18 }
    ]
  );

  // 2. Bottom Wear Additions
  insertIfMissing(
    'Baggy Fit Streetwear Denim / Baggie Cargo',
    'Wide-leg baggy fit denim cargo trousers with utility pockets, reinforced stitch lines, and heavy-duty brass hardware. Authentic street fashion.',
    1499,
    'Bottom Wear',
    [
      { color: 'Denim Blue', size: '30', quantity: 12 },
      { color: 'Denim Blue', size: '32', quantity: 18 },
      { color: 'Denim Blue', size: '34', quantity: 15 },
      { color: 'Black', size: '30', quantity: 15 },
      { color: 'Black', size: '32', quantity: 20 },
      { color: 'Black', size: '34', quantity: 16 }
    ]
  );

  insertIfMissing(
    'Royal Tailored Formal Trousers',
    'Wrinkle-resistant wool-blend formal dress trousers with expandable flex-waistband, French fly, and sharp permanent crease. Executive styling.',
    1299,
    'Bottom Wear',
    [
      { color: 'Charcoal Grey', size: '30', quantity: 15 },
      { color: 'Charcoal Grey', size: '32', quantity: 20 },
      { color: 'Charcoal Grey', size: '34', quantity: 18 },
      { color: 'Charcoal Grey', size: '36', quantity: 10 },
      { color: 'Jet Black', size: '30', quantity: 15 },
      { color: 'Jet Black', size: '32', quantity: 22 },
      { color: 'Jet Black', size: '34', quantity: 18 },
      { color: 'Navy Blue', size: '32', quantity: 15 },
      { color: 'Navy Blue', size: '34', quantity: 15 }
    ]
  );

  insertIfMissing(
    'Cotton Rich Everyday Comfort Lowers / Trackpants',
    'Ultra-soft breathable French terry cotton lowers with deep zippered side pockets, elasticated drawstring waistband, and tapered ankle cuffs.',
    899,
    'Bottom Wear',
    [
      { color: 'Melange Grey', size: 'M', quantity: 20 },
      { color: 'Melange Grey', size: 'L', quantity: 25 },
      { color: 'Melange Grey', size: 'XL', quantity: 15 },
      { color: 'Black', size: 'M', quantity: 25 },
      { color: 'Black', size: 'L', quantity: 30 },
      { color: 'Black', size: 'XL', quantity: 20 },
      { color: 'Navy Blue', size: 'M', quantity: 15 },
      { color: 'Navy Blue', size: 'L', quantity: 20 }
    ]
  );

  // 3. Under Garments Additions
  insertIfMissing(
    'Pure Combed Cotton Trunk Underwear (Pack of 2)',
    'Zero-friction breathable stretch combed cotton trunks with anti-roll jacquard microfiber waistband. Moisture-wicking daily comfort.',
    499,
    'Under Garments',
    [
      { color: 'Navy Blue', size: 'M', quantity: 30 },
      { color: 'Navy Blue', size: 'L', quantity: 40 },
      { color: 'Navy Blue', size: 'XL', quantity: 25 },
      { color: 'Charcoal', size: 'M', quantity: 25 },
      { color: 'Charcoal', size: 'L', quantity: 35 },
      { color: 'Charcoal', size: 'XL', quantity: 20 }
    ]
  );

  insertIfMissing(
    'Ribbed 100% Cotton Gym & Daily Vest (Pack of 2)',
    'Classic 1x1 rib knitted contoured inner vest in pure combed cotton. Extra long cut to stay tucked in with reinforced armholes and neck binding.',
    349,
    'Under Garments',
    [
      { color: 'White', size: 'M', quantity: 40 },
      { color: 'White', size: 'L', quantity: 50 },
      { color: 'White', size: 'XL', quantity: 30 },
      { color: 'Black', size: 'M', quantity: 30 },
      { color: 'Black', size: 'L', quantity: 35 },
      { color: 'Black', size: 'XL', quantity: 20 }
    ]
  );

  insertIfMissing(
    'Cushioned Bamboo Cotton Ankle Socks (Pack of 3)',
    'Anti-odor, thermo-regulating organic bamboo cotton ankle socks with terry cushion footbed and seamless hand-linked toe closure.',
    349,
    'Under Garments',
    [
      { color: 'Black', size: 'Free Size', quantity: 45 },
      { color: 'White', size: 'Free Size', quantity: 45 },
      { color: 'Grey', size: 'Free Size', quantity: 35 }
    ]
  );

  insertIfMissing(
    'Pure Egyptian Cotton Hankey Set (Pack of 6)',
    'Ultra-soft premium 100% Egyptian cotton gentlemans handkerchief set with subtle satin corded borders. Generous 45cm x 45cm size.',
    299,
    'Under Garments',
    [
      { color: 'White', size: 'Standard', quantity: 60 }
    ]
  );
});

setTimeout(() => {
  db.all('SELECT id, name, category, price FROM products ORDER BY category, id', (err, rows) => {
    console.log('\n--- Current Catalog in DB ---');
    console.table(rows);
    db.close();
  });
}, 1000);


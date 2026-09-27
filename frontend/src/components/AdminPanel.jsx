import React, { useState, useEffect } from 'react';
import { Plus, Package, Edit, Trash2, ShoppingBag, DollarSign, List, Layers, Shield, RefreshCw } from 'lucide-react';

export default function AdminPanel({ products, orders, onRefreshData, API_BASE_URL }) {
  const [adminPassword, setAdminPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState('stock'); // stock, products, orders

  // Form states for adding/editing product
  const [editProductId, setEditProductId] = useState(null);
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodCategory, setProdCategory] = useState('Shirts');
  const [prodImage, setProdImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  
  // Variations builder state
  const [variations, setVariations] = useState([]);
  const [tempColor, setTempColor] = useState('');
  const [tempSize, setTempSize] = useState('M');
  const [tempQty, setTempQty] = useState('10');

  useEffect(() => {
    // Check if password already stored in sessionStorage
    const storedPass = sessionStorage.getItem('admin_pass');
    if (storedPass === 'admin123') {
      setIsAuthenticated(true);
      setAdminPassword('admin123');
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (adminPassword === 'admin123') {
      setIsAuthenticated(true);
      sessionStorage.setItem('admin_pass', 'admin123');
      setAuthError('');
    } else {
      setAuthError('Incorrect Password. Please try again.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('admin_pass');
    setAdminPassword('');
  };

  // Add variation to list
  const addVariation = () => {
    if (!tempColor.trim() || !tempSize.trim()) {
      alert('Color and size are required');
      return;
    }
    const color = tempColor.trim();
    const size = tempSize.trim();
    const quantity = parseInt(tempQty) || 0;

    // Check duplicates
    if (variations.some(v => v.color.toLowerCase() === color.toLowerCase() && v.size.toLowerCase() === size.toLowerCase())) {
      alert('Variation already added!');
      return;
    }

    setVariations([...variations, { color, size, quantity }]);
    setTempColor('');
  };

  // Remove variation from list
  const removeVariation = (index) => {
    setVariations(variations.filter((_, idx) => idx !== index));
  };

  // Handle image select
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProdImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  // Submit product creation or update
  const handleSubmitProduct = async (e) => {
    e.preventDefault();
    if (!prodName || !prodPrice || !prodCategory) {
      alert('Product Name, Price, and Category are required');
      return;
    }

    const formData = new FormData();
    formData.append('name', prodName);
    formData.append('description', prodDesc);
    formData.append('price', prodPrice);
    formData.append('category', prodCategory);
    if (prodImage) {
      formData.append('image', prodImage);
    }
    formData.append('stockData', JSON.stringify(variations));

    const url = editProductId 
      ? `${API_BASE_URL}/api/products/${editProductId}`
      : `${API_BASE_URL}/api/products`;

    const method = editProductId ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method: method,
        headers: {
          'x-admin-password': adminPassword
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save product');
      }

      alert(editProductId ? 'Product updated successfully!' : 'Product added successfully!');
      resetProductForm();
      onRefreshData();
    } catch (error) {
      alert(error.message);
    }
  };

  const resetProductForm = () => {
    setEditProductId(null);
    setProdName('');
    setProdDesc('');
    setProdPrice('');
    setProdCategory('Shirts');
    setProdImage(null);
    setPreviewUrl('');
    setVariations([]);
  };

  // Set up product edit state
  const startEditProduct = (product) => {
    setEditProductId(product.id);
    setProdName(product.name);
    setProdDesc(product.description || '');
    setProdPrice(product.price.toString());
    setProdCategory(product.category);
    setPreviewUrl(product.image_url ? `${API_BASE_URL}${product.image_url}` : '');
    setVariations(product.stock || []);
    setActiveTab('products'); // Switch view to form
  };

  // Delete product
  const handleDeleteProduct = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product? All stock variations will be permanently removed.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${id}`, {
        method: 'DELETE',
        headers: {
          'x-admin-password': adminPassword
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete product');
      }

      alert('Product deleted successfully');
      onRefreshData();
    } catch (error) {
      alert(error.message);
    }
  };

  // Update specific stock level inline (Fast daily stock updates)
  const handleUpdateStockQty = async (productId, color, size, newQty) => {
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty < 0) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${productId}/stock`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword
        },
        body: JSON.stringify({ color, size, quantity: qty })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update stock');
      }

      onRefreshData();
    } catch (error) {
      alert(error.message);
    }
  };

  // Update order status
  const handleUpdateOrderStatus = async (orderId, orderStatus, paymentStatus) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword
        },
        body: JSON.stringify({ orderStatus, paymentStatus })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update order');
      }

      alert('Order status updated successfully');
      onRefreshData();
    } catch (error) {
      alert(error.message);
    }
  };

  // Render Login panel if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="container" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <Shield size={48} color="var(--accent-gold)" style={{ marginBottom: '1rem' }} />
            <h2 className="font-serif">Owner Admin Login</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Access stock adjustments, listings, and client orders.
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Passcode</label>
              <input
                type="password"
                required
                placeholder="Enter passcode (default: admin123)"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="form-control"
              />
            </div>

            {authError && (
              <p style={{ color: '#e74c3c', fontSize: '0.85rem', marginBottom: '1rem', fontWeight: 500 }}>
                {authError}
              </p>
            )}

            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Authenticate
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      {/* Admin Sidebar */}
      <aside className="admin-sidebar">
        <div style={{ padding: '0 1rem 2rem 1rem', borderBottom: '1px solid var(--border-light)', marginBottom: '1.5rem' }}>
          <h3 className="font-serif" style={{ fontSize: '1.4rem' }}>Veer Admin</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Inventory & Orders Management</span>
        </div>

        <button 
          onClick={() => setActiveTab('stock')} 
          className={`admin-menu-item ${activeTab === 'stock' ? 'active' : ''}`}
        >
          <RefreshCw size={18} />
          <span>Daily Stock Updates</span>
        </button>

        <button 
          onClick={() => setActiveTab('products')} 
          className={`admin-menu-item ${activeTab === 'products' ? 'active' : ''}`}
        >
          <Layers size={18} />
          <span>Garment Listings</span>
        </button>

        <button 
          onClick={() => setActiveTab('orders')} 
          className={`admin-menu-item ${activeTab === 'orders' ? 'active' : ''}`}
        >
          <Package size={18} />
          <span>Orders List</span>
          {orders.filter(o => o.order_status === 'Received').length > 0 && (
            <span style={{ marginLeft: 'auto', background: '#e74c3c', color: 'white', fontSize: '0.7rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '10px' }}>
              {orders.filter(o => o.order_status === 'Received').length}
            </span>
          )}
        </button>

        <button 
          onClick={handleLogout} 
          className="admin-menu-item" 
          style={{ marginTop: '5rem', color: '#e74c3c' }}
        >
          <Shield size={18} />
          <span>Exit Dashboard</span>
        </button>
      </aside>

      {/* Admin Main Workspace */}
      <main className="admin-main">
        
        {/* ======================================================== */}
        {/* TAB 1: DAILY STOCK UPDATES */}
        {/* ======================================================== */}
        {activeTab === 'stock' && (
          <div className="animate-fade-in">
            <div className="admin-header-row">
              <div>
                <h2 className="font-serif" style={{ fontSize: '2rem' }}>Daily Stock Adjustments</h2>
                <p style={{ color: 'var(--text-muted)' }}>Quickly update available quantities for clothes, colors, and sizes.</p>
              </div>
              <button onClick={onRefreshData} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem' }}>
                <RefreshCw size={16} /> Sync Data
              </button>
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Garment Name</th>
                      <th>Category</th>
                      <th>Color Variation</th>
                      <th>Size</th>
                      <th style={{ width: '180px' }}>Stock Quantity</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                          No products found. Add products in the 'Garment Listings' tab to setup stock tracking.
                        </td>
                      </tr>
                    ) : (
                      products.flatMap(product => {
                        const stockItems = product.stock || [];
                        if (stockItems.length === 0) {
                          return [
                            <tr key={`${product.id}-no-stock`}>
                              <td>{product.name}</td>
                              <td><span className="badge badge-gold">{product.category}</span></td>
                              <td colSpan="4" style={{ color: '#e74c3c', fontSize: '0.85rem' }}>
                                No variations configured. Edit product to configure colors and sizes.
                              </td>
                            </tr>
                          ];
                        }
                        
                        return stockItems.map((item, idx) => (
                          <tr key={`${product.id}-${item.color}-${item.size}-${idx}`}>
                            {idx === 0 ? (
                              <td rowSpan={stockItems.length} style={{ fontWeight: 600 }}>{product.name}</td>
                            ) : null}
                            {idx === 0 ? (
                              <td rowSpan={stockItems.length}><span className="badge badge-gold">{product.category}</span></td>
                            ) : null}
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="color-dot" style={{ backgroundColor: item.color.toLowerCase() }} />
                                {item.color}
                              </div>
                            </td>
                            <td><strong>{item.size}</strong></td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <button 
                                  onClick={() => handleUpdateStockQty(product.id, item.color, item.size, item.quantity - 1)}
                                  className="quantity-btn"
                                  style={{ border: '1px solid var(--border-light)', borderRadius: '4px' }}
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => handleUpdateStockQty(product.id, item.color, item.size, e.target.value)}
                                  className="form-control"
                                  style={{ width: '60px', padding: '0.3rem', textAlign: 'center' }}
                                />
                                <button 
                                  onClick={() => handleUpdateStockQty(product.id, item.color, item.size, item.quantity + 1)}
                                  className="quantity-btn"
                                  style={{ border: '1px solid var(--border-light)', borderRadius: '4px' }}
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td>
                              {item.quantity <= 0 ? (
                                <span className="badge badge-danger">Out of Stock</span>
                              ) : item.quantity <= 5 ? (
                                <span className="badge badge-gold">Low Stock</span>
                              ) : (
                                <span className="badge badge-success">In Stock</span>
                              )}
                            </td>
                          </tr>
                        ));
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: PRODUCT LISTINGS & CREATION */}
        {/* ======================================================== */}
        {activeTab === 'products' && (
          <div className="animate-fade-in">
            <div className="admin-header-row">
              <div>
                <h2 className="font-serif" style={{ fontSize: '2rem' }}>
                  {editProductId ? 'Edit Garment Listing' : 'Garment Listings'}
                </h2>
                <p style={{ color: 'var(--text-muted)' }}>
                  {editProductId ? 'Update attributes and variation quantities.' : 'Create, update, and manage your shop products catalog.'}
                </p>
              </div>
              {editProductId && (
                <button onClick={resetProductForm} className="btn-secondary">Cancel Edit</button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem', alignItems: 'flex-start' }}>
              {/* Product Form */}
              <div className="glass-panel" style={{ padding: '2rem' }}>
                <h3 className="font-serif" style={{ fontSize: '1.4rem', marginBottom: '1.5rem' }}>
                  {editProductId ? 'Edit Product Form' : 'Add New Product'}
                </h3>
                
                <form onSubmit={handleSubmitProduct}>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Product Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g., Slim Fit Cotton Linen Shirt"
                        value={prodName}
                        onChange={(e) => setProdName(e.target.value)}
                        className="form-control"
                      />
                    </div>

                    <div className="form-group" style={{ maxWidth: '180px' }}>
                      <label>Price (₹)</label>
                      <input
                        type="number"
                        required
                        placeholder="Price"
                        value={prodPrice}
                        onChange={(e) => setProdPrice(e.target.value)}
                        className="form-control"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Category</label>
                      <select 
                        value={prodCategory} 
                        onChange={(e) => setProdCategory(e.target.value)} 
                        className="form-control"
                      >
                        <option value="Shirts">Shirts</option>
                        <option value="T-Shirts">T-Shirts</option>
                        <option value="Pants">Pants</option>
                        <option value="Others">Others</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Garment Image Picture</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="form-control"
                        style={{ padding: '0.5rem' }}
                      />
                    </div>
                  </div>

                  {previewUrl && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Image Preview</label>
                      <img 
                        src={previewUrl} 
                        alt="Product Preview" 
                        style={{ height: '120px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border-light)' }} 
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      rows="3"
                      placeholder="Garment composition details, weave, care instructions..."
                      value={prodDesc}
                      onChange={(e) => setProdDesc(e.target.value)}
                      className="form-control"
                      style={{ resize: 'none' }}
                    />
                  </div>

                  {/* Stock Variations Editor */}
                  <div style={{ marginTop: '2rem', padding: '1.5rem', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.01)' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-main)' }}>Stock Variations Builder</h4>
                    
                    <div className="form-row" style={{ alignItems: 'flex-end', marginBottom: '1.25rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Color (e.g. Navy, White, Olive)</label>
                        <input
                          type="text"
                          placeholder="Color"
                          value={tempColor}
                          onChange={(e) => setTempColor(e.target.value)}
                          className="form-control"
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0, maxWidth: '100px' }}>
                        <label>Size</label>
                        <select 
                          value={tempSize} 
                          onChange={(e) => setTempSize(e.target.value)} 
                          className="form-control"
                        >
                          <option value="S">S</option>
                          <option value="M">M</option>
                          <option value="L">L</option>
                          <option value="XL">XL</option>
                          <option value="XXL">XXL</option>
                        </select>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0, maxWidth: '100px' }}>
                        <label>Qty</label>
                        <input
                          type="number"
                          placeholder="10"
                          value={tempQty}
                          onChange={(e) => setTempQty(e.target.value)}
                          className="form-control"
                        />
                      </div>

                      <button 
                        type="button" 
                        onClick={addVariation} 
                        className="btn-secondary" 
                        style={{ padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <Plus size={16} /> Add Var
                      </button>
                    </div>

                    {/* Variations Preview List */}
                    <div style={{ marginTop: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Configured Variations ({variations.length})</label>
                      {variations.length === 0 ? (
                        <p style={{ fontStyle: 'italic', fontSize: '0.85rem', color: 'var(--text-muted)' }}>No variations added yet. Add colors/sizes above.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {variations.map((v, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.9rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  <span className="color-dot" style={{ backgroundColor: v.color.toLowerCase() }} />
                                  <span>{v.color}</span>
                                </div>
                                <div>Size: <strong>{v.size}</strong></div>
                                <div>Qty: <strong>{v.quantity}</strong></div>
                              </div>
                              <button 
                                type="button" 
                                onClick={() => removeVariation(idx)} 
                                style={{ color: '#e74c3c', fontSize: '0.8rem' }}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: '2rem', padding: '1rem' }}>
                    {editProductId ? 'Save Product Changes' : 'Publish Product to Store'}
                  </button>
                </form>
              </div>

              {/* Products List Sidebar */}
              <div className="glass-panel" style={{ padding: '1.5rem', maxHeight: '80vh', overflowY: 'auto' }}>
                <h3 className="font-serif" style={{ fontSize: '1.4rem', marginBottom: '1.5rem' }}>Garment Catalog ({products.length})</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {products.map(prod => (
                    <div key={prod.id} style={{ display: 'flex', gap: '1rem', padding: '1rem', border: '1px solid var(--border-light)', borderRadius: '12px', background: 'rgba(255,255,255,0.01)' }}>
                      <div style={{ width: '60px', height: '80px', borderRadius: '6px', overflow: 'hidden', background: '#1a1a22', flexShrink: 0 }}>
                        {prod.image_url ? (
                          <img src={`${API_BASE_URL}${prod.image_url}`} alt={prod.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Package size={20} /></div>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prod.name}</h4>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>{prod.category}</div>
                        <div style={{ fontWeight: 700, color: 'var(--accent-gold)', fontSize: '0.95rem' }}>₹{prod.price.toLocaleString('en-IN')}</div>
                        
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                          <button 
                            onClick={() => startEditProduct(prod)} 
                            style={{ fontSize: '0.8rem', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <Edit size={12} /> Edit
                          </button>
                          <button 
                            onClick={() => handleDeleteProduct(prod.id)} 
                            style={{ fontSize: '0.8rem', color: '#e74c3c', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: CUSTOMER ORDERS LIST */}
        {/* ======================================================== */}
        {activeTab === 'orders' && (
          <div className="animate-fade-in">
            <div className="admin-header-row">
              <div>
                <h2 className="font-serif" style={{ fontSize: '2rem' }}>Customer Orders Dashboard</h2>
                <p style={{ color: 'var(--text-muted)' }}>Manage payments, verify QR details, and process shipping statuses.</p>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Order Details</th>
                      <th>Shipping Address</th>
                      <th>Apparel Purchased</th>
                      <th>Method & Total</th>
                      <th>Order Status</th>
                      <th>Payment Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
                          No customer orders placed yet.
                        </td>
                      </tr>
                    ) : (
                      orders.map(order => (
                        <tr key={order.id}>
                          <td>
                            <div><strong>Order ID:</strong> #{order.id}</div>
                            <div style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}><strong>Name:</strong> {order.customer_name}</div>
                            <div style={{ fontSize: '0.9rem' }}><strong>Phone:</strong> {order.customer_phone}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                              {new Date(order.created_at).toLocaleString('en-IN')}
                            </div>
                          </td>
                          <td>
                            <p style={{ fontSize: '0.85rem', maxWidth: '200px', wordBreak: 'break-word', lineHeight: '1.4' }}>
                              {order.customer_address}
                            </p>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              {order.items.map((item, idx) => (
                                <div key={idx} style={{ fontSize: '0.85rem' }}>
                                  • {item.name} ({item.color} | {item.size}) x <strong>{item.quantity}</strong>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--accent-gold)', marginBottom: '0.25rem' }}>
                              ₹{order.total_amount.toLocaleString('en-IN')}
                            </div>
                            <span className="badge badge-gold" style={{ fontSize: '0.7rem' }}>
                              {order.payment_method === 'COD' ? 'Cash on Delivery' : 'UPI Payment'}
                            </span>
                            {order.payment_ref && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                <strong>Ref:</strong> {order.payment_ref}
                              </div>
                            )}
                          </td>
                          <td>
                            <select
                              value={order.order_status}
                              onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value, order.payment_status)}
                              className="form-control"
                              style={{ width: 'auto', padding: '0.4rem', fontSize: '0.85rem' }}
                            >
                              <option value="Received">Received</option>
                              <option value="Processing">Processing</option>
                              <option value="Shipped">Shipped</option>
                              <option value="Delivered">Delivered</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                          </td>
                          <td>
                            <select
                              value={order.payment_status}
                              onChange={(e) => handleUpdateOrderStatus(order.id, order.order_status, e.target.value)}
                              className="form-control"
                              style={{ 
                                width: 'auto', 
                                padding: '0.4rem', 
                                fontSize: '0.85rem',
                                color: order.payment_status === 'Paid' ? '#2ecc71' : '#e74c3c'
                              }}
                            >
                              <option value="Pending">Pending</option>
                              <option value="Paid">Paid</option>
                            </select>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

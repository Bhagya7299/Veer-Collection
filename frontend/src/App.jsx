import React, { useState, useEffect } from 'react';
import { ShoppingBag, Lock, Home, RefreshCw } from 'lucide-react';
import CustomerView from './components/CustomerView';
import AdminPanel from './components/AdminPanel';
import Cart from './components/Cart';

const API_BASE_URL = 'http://localhost:5001';

export default function App() {
  const [view, setView] = useState('home'); // home, admin
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Products
      const prodRes = await fetch(`${API_BASE_URL}/api/products`);
      if (prodRes.ok) {
        const prodData = await prodRes.json();
        setProducts(prodData);
      }

      // Fetch Orders (only if authenticated)
      const adminPass = sessionStorage.getItem('admin_pass');
      if (adminPass === 'admin123') {
        const ordRes = await fetch(`${API_BASE_URL}/api/orders`, {
          headers: {
            'x-admin-password': adminPass
          }
        });
        if (ordRes.ok) {
          const ordData = await ordRes.json();
          setOrders(ordData);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Load cart from localStorage
    const savedCart = localStorage.getItem('veer_cart');
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Save cart to local storage whenever it changes
  const saveCart = (newCart) => {
    setCart(newCart);
    localStorage.setItem('veer_cart', JSON.stringify(newCart));
  };

  // Add item to cart
  const handleAddToCart = (newItem) => {
    const existingIndex = cart.findIndex(
      item => 
        item.product_id === newItem.product_id && 
        item.color.toLowerCase() === newItem.color.toLowerCase() && 
        item.size.toLowerCase() === newItem.size.toLowerCase()
    );

    if (existingIndex > -1) {
      const updatedCart = [...cart];
      updatedCart[existingIndex].quantity += newItem.quantity;
      saveCart(updatedCart);
    } else {
      saveCart([...cart, newItem]);
    }
    setCartOpen(true); // Auto-open cart drawer
  };

  // Update item quantity
  const handleUpdateCartQty = (index, newQty) => {
    if (newQty <= 0) return;
    const updatedCart = [...cart];
    updatedCart[index].quantity = newQty;
    saveCart(updatedCart);
  };

  // Remove item from cart
  const handleRemoveCartItem = (index) => {
    const updatedCart = cart.filter((_, idx) => idx !== index);
    saveCart(updatedCart);
  };

  // Clear cart
  const handleClearCart = () => {
    saveCart([]);
  };

  // Total cart items count
  const cartItemsCount = cart.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <div className="app-container">
      {/* Premium Header Nav */}
      <header className="header">
        <div className="container header-container">
          <a href="#" className="logo" onClick={(e) => { e.preventDefault(); setView('home'); }}>
            VEER <span>Collection</span>
          </a>

          <nav className="nav-links">
            <button 
              onClick={() => setView('home')} 
              className={`nav-link ${view === 'home' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Home size={16} /> Catalog
            </button>
            
            <button 
              onClick={() => setView('admin')} 
              className={`nav-link ${view === 'admin' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Lock size={16} /> Owner Portal
            </button>
          </nav>

          <div className="header-actions">
            <button onClick={fetchData} className="nav-link" title="Reload Stock & Inventory" style={{ padding: '0.5rem' }}>
              <RefreshCw size={18} />
            </button>

            {view !== 'admin' && (
              <button onClick={() => setCartOpen(true)} className="cart-icon-btn" title="View Cart">
                <ShoppingBag size={22} />
                {cartItemsCount > 0 && <span className="cart-badge">{cartItemsCount}</span>}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {loading && products.length === 0 ? (
          <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-gold)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: 'var(--text-muted)' }}>Loading garments catalog...</p>
            <style>{`
              @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
          </div>
        ) : (
          <>
            {view === 'home' ? (
              <CustomerView 
                products={products} 
                onAddToCart={handleAddToCart}
                API_BASE_URL={API_BASE_URL}
                openCart={() => setCartOpen(true)}
              />
            ) : (
              <AdminPanel 
                products={products}
                orders={orders}
                onRefreshData={fetchData}
                API_BASE_URL={API_BASE_URL}
              />
            )}
          </>
        )}
      </main>

      {/* Cart Drawer Panel */}
      <Cart 
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        cartItems={cart}
        onUpdateQuantity={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
        API_BASE_URL={API_BASE_URL}
      />

      {/* Footer Section */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <h4 className="logo" style={{ marginBottom: '1rem', fontSize: '1.4rem' }}>VEER <span>Collection</span></h4>
              <p style={{ lineHeight: '1.6', fontSize: '0.85rem' }}>
                Your destination for trendsetting garments, shirts, t-shirts, pants, and premium clothing. Experience quality clothing.
              </p>
            </div>
            
            <div>
              <h4 className="footer-title">Shop Collection</h4>
              <ul className="footer-links">
                <li><a href="#shop-section" onClick={() => setView('home')}>Shirts</a></li>
                <li><a href="#shop-section" onClick={() => setView('home')}>T-Shirts</a></li>
                <li><a href="#shop-section" onClick={() => setView('home')}>Pants</a></li>
                <li><a href="#shop-section" onClick={() => setView('home')}>Accessories</a></li>
              </ul>
            </div>

            <div>
              <h4 className="footer-title">Payment Options</h4>
              <ul className="footer-links" style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <li>• Cash on Delivery (COD)</li>
                <li>• Scan & Pay (Direct UPI QR)</li>
                <li>• Instant Verification</li>
              </ul>
            </div>

            <div>
              <h4 className="footer-title">Store Operations</h4>
              <ul className="footer-links" style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <li><strong>Hours:</strong> 10:00 AM - 9:00 PM</li>
                <li><strong>Location:</strong> Veer Collection, Apparel Market</li>
                <li><strong>Contact:</strong> +91 98765 43210</li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} Veer Collection. All Rights Reserved. Crafted with Gold Elegance.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { Search, ShoppingBag, X, Check, Eye } from 'lucide-react';

// Color mapping helper for CSS styling
const getColorHex = (name) => {
  if (!name) return '#a0a0a0';
  const clean = name.trim().toLowerCase();
  const map = {
    'navy blue': '#1e3a8a',
    'navy': '#1e3a8a',
    'royal blue': '#2563eb',
    'sky blue': '#38bdf8',
    'blue': '#3b82f6',
    'white': '#ffffff',
    'off white': '#f8fafc',
    'cream': '#fef3c7',
    'black': '#111116',
    'charcoal': '#27272a',
    'grey': '#71717a',
    'gray': '#71717a',
    'light grey': '#d4d4d8',
    'red': '#ef4444',
    'maroon': '#881337',
    'wine': '#4c0519',
    'burgundy': '#800020',
    'green': '#22c55e',
    'olive': '#65a30d',
    'olive green': '#65a30d',
    'dark green': '#14532d',
    'forest green': '#166534',
    'yellow': '#eab308',
    'mustard': '#ca8a04',
    'gold': '#d4af37',
    'orange': '#f97316',
    'pink': '#ec4899',
    'purple': '#a855f7',
    'brown': '#78350f',
    'beige': '#e7d8c9',
    'khaki': '#a39274',
    'tan': '#d2b48c',
    'standard': '#d4af37'
  };
  return map[clean] || clean;
};

export default function CustomerView({ products, onAddToCart, API_BASE_URL, openCart }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColorFilter, setSelectedColorFilter] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  // Product Detail Modal States
  const [chosenColor, setChosenColor] = useState('');
  const [chosenSize, setChosenSize] = useState('');
  const [addedText, setAddedText] = useState(false);

  // Extract all unique colors for filter
  const allUniqueColors = useMemo(() => {
    const colors = new Set();
    products.forEach(p => {
      p.stock?.forEach(s => {
        if (s.quantity > 0) colors.add(s.color.trim());
      });
    });
    return Array.from(colors);
  }, [products]);

  // Categories list
  const categories = ['All', 'Shirts', 'T-Shirts', 'Pants', 'Others'];

  // Normalize category for robust matching
  const normalizeCategory = (cat) => (cat || '').toLowerCase().replace(/[\s-]/g, '');

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = selectedCategory === 'All' || 
        normalizeCategory(p.category) === normalizeCategory(selectedCategory);
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.description?.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesColor = selectedColorFilter === 'All';
      if (!matchesColor) {
        matchesColor = p.stock?.some(s => s.color.trim().toLowerCase() === selectedColorFilter.toLowerCase() && s.quantity > 0);
      }

      return matchesCategory && matchesSearch && matchesColor;
    });
  }, [products, selectedCategory, searchQuery, selectedColorFilter]);

  // Handle open modal details
  const openProductModal = (product) => {
    setSelectedProduct(product);
    // Auto-select first color & size that are available in stock
    const availableStock = product.stock?.find(s => s.quantity > 0);
    if (availableStock) {
      setChosenColor(availableStock.color);
      setChosenSize(availableStock.size);
    } else if (product.stock?.length > 0) {
      setChosenColor(product.stock[0].color);
      setChosenSize(product.stock[0].size);
    } else {
      setChosenColor('');
      setChosenSize('');
    }
  };

  // Quick add to cart directly from card
  const handleQuickAddToCart = (e, product) => {
    e.stopPropagation();
    const available = product.stock?.find(s => s.quantity > 0) || product.stock?.[0];
    onAddToCart({
      product_id: product.id,
      name: product.name,
      price: product.price,
      image_url: product.image_url,
      color: available ? available.color : 'Standard',
      size: available ? available.size : 'M',
      quantity: 1
    });
  };

  // Get available sizes for the chosen color of the selected product
  const availableSizesForColor = useMemo(() => {
    if (!selectedProduct || !chosenColor) return [];
    return selectedProduct.stock
      ?.filter(s => s.color.trim().toLowerCase() === chosenColor.trim().toLowerCase())
      .map(s => ({ size: s.size, quantity: s.quantity })) || [];
  }, [selectedProduct, chosenColor]);

  // Check if current selection is in stock
  const currentStockQuantity = useMemo(() => {
    if (!selectedProduct || !chosenColor || !chosenSize) return 0;
    const match = selectedProduct.stock?.find(
      s => s.color.trim().toLowerCase() === chosenColor.trim().toLowerCase() && 
           s.size.trim().toLowerCase() === chosenSize.trim().toLowerCase()
    );
    return match ? match.quantity : 0;
  }, [selectedProduct, chosenColor, chosenSize]);

  // Add to cart helper in modal
  const handleAddToCartClick = () => {
    if (!selectedProduct) return;
    if (!chosenColor || !chosenSize) {
      alert('Please select a color and size.');
      return;
    }

    onAddToCart({
      product_id: selectedProduct.id,
      name: selectedProduct.name,
      price: selectedProduct.price,
      image_url: selectedProduct.image_url,
      color: chosenColor,
      size: chosenSize,
      quantity: 1
    });

    setAddedText(true);
    setTimeout(() => {
      setAddedText(false);
      setSelectedProduct(null);
    }, 450);
  };

  return (
    <div className="animate-fade-in">
      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <div className="hero-grid">
            <div className="hero-content">
              <span className="badge badge-gold" style={{ marginBottom: '1rem', display: 'inline-block' }}>Autumn/Winter Collection 2026</span>
              <h1 className="font-serif">Veer <br /><span>Collection</span></h1>
              <p>
                Experience premium craftsmanship. Explore our exclusive range of shirts, t-shirts, pants, and garments tailored to perfection.
              </p>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <a href="#shop-section" className="btn-primary">
                  <ShoppingBag size={18} /> Shop Collection
                </a>
              </div>
            </div>
            
            <div className="hero-showcase">
              {products.length > 0 && products[0].image_url ? (
                <img src={`${API_BASE_URL}${products[0].image_url}`} alt="Veer Collection Hero" />
              ) : (
                <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #16161a 0%, #0a0a0c 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShoppingBag size={80} color="#333" />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main Shop Section */}
      <section id="shop-section" style={{ padding: '5rem 0' }}>
        <div className="container">
          <div style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div>
              <h2 className="font-serif" style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Our Garments</h2>
              <p style={{ color: 'var(--text-muted)' }}>Browse our daily-updated premium collections.</p>
            </div>

            {/* Search and Filters */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', width: '100%', maxWidth: '600px' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search shirts, pants, styles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>

              {/* Color filter */}
              <select 
                value={selectedColorFilter} 
                onChange={(e) => setSelectedColorFilter(e.target.value)} 
                className="form-control"
                style={{ width: 'auto', minWidth: '150px' }}
              >
                <option value="All">All Colors</option>
                {allUniqueColors.map(color => (
                  <option key={color} value={color}>{color}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Categories Tab */}
          <div className="category-tabs">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`category-tab ${selectedCategory === cat ? 'active' : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Products Grid */}
          {filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '5rem 0', border: '1px dashed var(--border-light)', borderRadius: '16px' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>No garments found matching your criteria.</p>
            </div>
          ) : (
            <div className="products-grid">
              {filteredProducts.map(product => {
                // Calculate if out of stock
                const totalStock = product.stock?.reduce((acc, curr) => acc + curr.quantity, 0) || 0;
                
                return (
                  <div key={product.id} className="glass-card product-card" onClick={() => openProductModal(product)}>
                    <div className="product-image-container">
                      {product.image_url ? (
                        <img src={`${API_BASE_URL}${product.image_url}`} alt={product.name} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#121216' }}>
                          <ShoppingBag size={48} color="#333" />
                        </div>
                      )}
                      {totalStock === 0 && (
                        <span className="badge badge-danger" style={{ position: 'absolute', top: '1rem', left: '1rem' }}>Sold Out</span>
                      )}
                    </div>
                    
                    <div className="product-info">
                      <span className="product-category">{product.category}</span>
                      <h3 className="product-title">{product.name}</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: '2', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {product.description || 'No description available.'}
                      </p>

                      <div className="product-meta-row">
                        <span className="product-price">₹{product.price.toLocaleString('en-IN')}</span>
                        
                        {/* Display color dots */}
                        <div className="color-indicator-dots">
                          {Array.from(new Set(product.stock?.map(s => s.color.trim()))).slice(0, 4).map((color, idx) => (
                            <span 
                              key={idx} 
                              className="color-dot" 
                              style={{ 
                                backgroundColor: getColorHex(color),
                                border: '1px solid rgba(255, 255, 255, 0.4)'
                              }} 
                              title={color}
                            />
                          ))}
                          {new Set(product.stock?.map(s => s.color)).size > 4 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>+</span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openProductModal(product);
                          }}
                          className="btn-secondary" 
                          style={{ flex: 1, padding: '0.65rem 0.4rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                        >
                          <Eye size={15} /> Details
                        </button>
                        <button 
                          type="button"
                          disabled={totalStock === 0}
                          onClick={(e) => handleQuickAddToCart(e, product)}
                          className="btn-primary" 
                          style={{ flex: 1.3, padding: '0.65rem 0.4rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                        >
                          <ShoppingBag size={15} /> Add to Cart
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Product Details Modal */}
      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedProduct(null)}>
              <X size={20} />
            </button>

            <div className="product-detail-grid">
              {/* Product Image */}
              <div className="product-detail-image">
                {selectedProduct.image_url ? (
                  <img src={`${API_BASE_URL}${selectedProduct.image_url}`} alt={selectedProduct.name} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#121216' }}>
                    <ShoppingBag size={80} color="#333" />
                  </div>
                )}
              </div>

              {/* Product Details & Purchase Controls */}
              <div className="product-detail-info">
                <span className="badge badge-gold" style={{ alignSelf: 'flex-start' }}>{selectedProduct.category}</span>
                <h2 className="font-serif" style={{ fontSize: '2rem', marginTop: '0.75rem' }}>{selectedProduct.name}</h2>
                <span className="product-detail-price">₹{selectedProduct.price.toLocaleString('en-IN')}</span>
                
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '2rem' }}>
                  {selectedProduct.description || 'Elevate your daily wear with this carefully crafted garment from Veer Collection.'}
                </p>

                {/* Variation selectors */}
                {selectedProduct.stock && selectedProduct.stock.length > 0 ? (
                  <>
                    {/* Color selector */}
                    <div className="variation-selector-group">
                      <h4 className="product-variation-title">Select Color: <span style={{ color: 'var(--accent-gold)' }}>{chosenColor}</span></h4>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {Array.from(new Set(selectedProduct.stock.map(s => s.color.trim()))).map((color) => {
                          const isSelected = chosenColor.toLowerCase() === color.toLowerCase();
                          const hex = getColorHex(color);
                          return (
                            <button
                              key={color}
                              type="button"
                              onClick={() => {
                                setChosenColor(color);
                                const matches = selectedProduct.stock.filter(
                                  s => s.color.trim().toLowerCase() === color.trim().toLowerCase() && s.quantity > 0
                                );
                                if (matches.length > 0) {
                                  const sizeExists = matches.some(s => s.size === chosenSize);
                                  if (!sizeExists) {
                                    setChosenSize(matches[0].size);
                                  }
                                }
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.45rem',
                                padding: '0.45rem 0.85rem',
                                borderRadius: '20px',
                                border: isSelected ? '1.5px solid var(--accent-gold)' : '1px solid var(--border-light)',
                                background: isSelected ? 'rgba(212, 175, 55, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                                color: isSelected ? 'var(--text-main)' : 'var(--text-muted)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                fontSize: '0.85rem'
                              }}
                            >
                              <span 
                                style={{ 
                                  width: '13px', 
                                  height: '13px', 
                                  borderRadius: '50%', 
                                  backgroundColor: hex,
                                  boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.35)',
                                  display: 'inline-block' 
                                }} 
                              />
                              <span style={{ fontWeight: isSelected ? 600 : 400 }}>{color}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Size selector */}
                    <div className="variation-selector-group">
                      <h4 className="product-variation-title">Select Size: <span style={{ color: 'var(--accent-gold)' }}>{chosenSize}</span></h4>
                      <div className="size-selector-list">
                        {Array.from(new Set(selectedProduct.stock.map(s => s.size.trim()))).map((size) => {
                          // Check if size is in stock for currently chosen color
                          const sizeMatch = availableSizesForColor.find(s => s.size.toLowerCase() === size.toLowerCase());
                          const isOutOfStock = !sizeMatch || sizeMatch.quantity <= 0;

                          return (
                            <button
                              key={size}
                              disabled={isOutOfStock}
                              onClick={() => setChosenSize(size)}
                              className={`size-selector-btn ${chosenSize === size ? 'selected' : ''}`}
                            >
                              {size}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Stock indicator */}
                    <div style={{ marginBottom: '2rem' }}>
                      {currentStockQuantity > 0 ? (
                        <span style={{ fontSize: '0.9rem', color: currentStockQuantity <= 5 ? '#e74c3c' : '#2ecc71', fontWeight: 500 }}>
                          {currentStockQuantity <= 5 ? `Only ${currentStockQuantity} items left in stock!` : 'In Stock'}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.9rem', color: '#e74c3c', fontWeight: 500 }}>
                          Selected variation is currently Out of Stock
                        </span>
                      )}
                    </div>

                    <button
                      className="btn-primary"
                      disabled={currentStockQuantity <= 0}
                      onClick={handleAddToCartClick}
                      style={{ width: '100%', justifyContent: 'center', padding: '1rem' }}
                    >
                      {addedText ? (
                        <>
                          <Check size={18} /> Added to Cart!
                        </>
                      ) : (
                        <>
                          <ShoppingBag size={18} /> Add to Cart
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <div style={{ color: '#e74c3c', fontWeight: 500 }}>
                    Product out of stock. Check back later!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

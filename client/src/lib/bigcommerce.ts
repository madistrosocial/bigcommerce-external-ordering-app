import { Product } from './db';

// Types for BigCommerce API response (simplified)
interface BCProduct {
  id: number;
  name: string;
  sku: string;
  price: number;
  inventory_level: number;
  description: string;
  primary_image?: {
    url_standard: string;
  };
}

const BC_API_BASE = '/api/v3'; // In a real app, this would be the proxy endpoint

// Mock data for "Live Search" fallback
const SEARCH_MOCK_RESULTS: Product[] = [
  {
    id: 101,
    bigcommerce_id: 2001,
    name: 'Heavy Duty Hammer Drill',
    sku: 'TL-HMR-001',
    price: 219.99,
    image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400&q=80',
    description: 'Variable speed hammer drill for masonry and concrete.',
    stock_level: 50,
    is_pinned: false
  },
  {
    id: 102,
    bigcommerce_id: 2002,
    name: 'Laser Level 360',
    sku: 'TL-LSR-360',
    price: 149.50,
    image: 'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=400&q=80',
    description: 'Self-leveling 360-degree laser line level.',
    stock_level: 15,
    is_pinned: false
  },
  {
    id: 103,
    bigcommerce_id: 2003,
    name: 'Worksite Radio / Charger',
    sku: 'EQ-RAD-001',
    price: 129.00,
    image: 'https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?w=400&q=80',
    description: 'Bluetooth jobsite radio with built-in battery charger.',
    stock_level: 30,
    is_pinned: false
  },
  {
    id: 104,
    bigcommerce_id: 2004,
    name: 'Portable Generator 2000W',
    sku: 'EQ-GEN-2000',
    price: 499.00,
    image: 'https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?w=400&q=80', // Placeholder
    description: 'Quiet inverter generator for sensitive electronics.',
    stock_level: 5,
    is_pinned: false
  }
];

export async function searchBigCommerceProducts(query: string, token?: string, storeHash?: string): Promise<Product[]> {
  // If we had real credentials and a backend proxy, we would fetch here.
  // Since we are frontend-only, we simulate the network request.
  
  if (token && storeHash) {
    // Attempt real fetch (will likely fail CORS without proxy, but demonstrates intent)
    try {
      const response = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?keyword=${encodeURIComponent(query)}&include=primary_image`, {
        headers: {
          'X-Auth-Token': token,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) throw new Error('API request failed');
      
      const data = await response.json();
      return data.data.map((p: BCProduct) => ({
        id: p.id, // Use BC ID as local ID for simplicity in this demo, or map differently
        bigcommerce_id: p.id,
        name: p.name,
        sku: p.sku,
        price: p.price,
        image: p.primary_image?.url_standard || '',
        description: p.description.replace(/<[^>]*>?/gm, ''), // Strip HTML
        stock_level: p.inventory_level,
        is_pinned: false // Default to unpinned for new search results
      }));
    } catch (e) {
      console.warn("Real API call failed (CORS/Network), falling back to mock search.", e);
      // Fall through to mock
    }
  }

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));

  // Return mock results filtered by query
  if (!query) return [];
  const lowerQuery = query.toLowerCase();
  return SEARCH_MOCK_RESULTS.filter(p => 
    p.name.toLowerCase().includes(lowerQuery) || 
    p.sku.toLowerCase().includes(lowerQuery)
  );
}

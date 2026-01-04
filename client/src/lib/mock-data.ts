import { db, Product, User } from './db';
import img1 from '@assets/stock_images/industrial_tools_and_ca5d1360.jpg';
import img2 from '@assets/stock_images/industrial_tools_and_bd3781e7.jpg';
import img3 from '@assets/stock_images/industrial_tools_and_4a6198d2.jpg';
import img4 from '@assets/stock_images/industrial_tools_and_1201e4bf.jpg';
import img5 from '@assets/stock_images/industrial_tools_and_c79ca76e.jpg';

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 1,
    bigcommerce_id: 1001,
    name: 'Pro-Grade Impact Driver',
    sku: 'TL-IMP-001',
    price: 189.99,
    image: img1,
    description: 'High-torque impact driver for heavy duty industrial use.',
    stock_level: 45,
    is_pinned: true
  },
  {
    id: 2,
    bigcommerce_id: 1002,
    name: 'Precision Socket Set (50pc)',
    sku: 'TL-SOC-050',
    price: 129.50,
    image: img2,
    description: 'Metric and Imperial socket set with chrome vanadium finish.',
    stock_level: 12,
    is_pinned: true
  },
  {
    id: 3,
    bigcommerce_id: 1003,
    name: 'Hydraulic Floor Jack 3T',
    sku: 'EQ-JK-3000',
    price: 249.00,
    image: img3,
    description: 'Heavy duty 3-ton capacity floor jack for automotive service.',
    stock_level: 8,
    is_pinned: false
  },
  {
    id: 4,
    bigcommerce_id: 1004,
    name: 'Cordless Angle Grinder',
    sku: 'TL-GRD-018',
    price: 159.99,
    image: img4,
    description: '18V Brushless angle grinder with safety paddle switch.',
    stock_level: 22,
    is_pinned: false
  },
  {
    id: 5,
    bigcommerce_id: 1005,
    name: 'Industrial Shop Vacuum',
    sku: 'EQ-VAC-012',
    price: 199.99,
    image: img5,
    description: '12-gallon wet/dry vacuum with high-efficiency filtration.',
    stock_level: 15,
    is_pinned: false
  },
  {
    id: 6,
    bigcommerce_id: 1006,
    name: 'Compact Drill Driver',
    sku: 'TL-DRL-012',
    price: 89.99,
    image: img1,
    description: 'Lightweight 12V drill driver for tight spaces.',
    stock_level: 60,
    is_pinned: false
  }
];

export const MOCK_USERS: User[] = [
  {
    id: 1,
    username: 'admin@vansales.com',
    name: 'System Admin',
    role: 'admin',
    is_enabled: true
  },
  {
    id: 2,
    username: 'agent1@vansales.com',
    name: 'John Doe',
    role: 'agent',
    is_enabled: true
  },
  {
    id: 3,
    username: 'agent2@vansales.com',
    name: 'Jane Smith',
    role: 'agent',
    is_enabled: false
  }
];

export const seedDatabase = async () => {
  const productCount = await db.products.count();
  if (productCount === 0) {
    await db.products.bulkAdd(MOCK_PRODUCTS);
  }

  const userCount = await db.users.count();
  if (userCount === 0) {
    await db.users.bulkAdd(MOCK_USERS);
  }
};

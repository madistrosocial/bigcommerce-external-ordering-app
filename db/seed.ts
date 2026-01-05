import { db } from './index';
import { users, products } from '@shared/schema';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('Seeding database...');

  // Create users
  const hashedPassword = await bcrypt.hash('demo123', 10);
  
  try {
    await db.insert(users).values([
      {
        username: 'admin@vansales.com',
        password: hashedPassword,
        name: 'System Admin',
        role: 'admin',
        is_enabled: true
      },
      {
        username: 'agent1@vansales.com',
        password: hashedPassword,
        name: 'John Doe',
        role: 'agent',
        is_enabled: true
      },
      {
        username: 'agent2@vansales.com',
        password: hashedPassword,
        name: 'Jane Smith',
        role: 'agent',
        is_enabled: false
      }
    ]).onConflictDoNothing();
    console.log('✓ Users created');
  } catch (e) {
    console.log('Users already exist or error:', e);
  }

  // Create some initial pinned products
  try {
    await db.insert(products).values([
      {
        bigcommerce_id: 1001,
        name: 'Pro-Grade Impact Driver',
        sku: 'TL-IMP-001',
        price: '189.99',
        image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400&q=80',
        description: 'High-torque impact driver for heavy duty industrial use.',
        stock_level: 45,
        is_pinned: true
      },
      {
        bigcommerce_id: 1002,
        name: 'Precision Socket Set (50pc)',
        sku: 'TL-SOC-050',
        price: '129.50',
        image: 'https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=400&q=80',
        description: 'Metric and Imperial socket set with chrome vanadium finish.',
        stock_level: 12,
        is_pinned: true
      },
      {
        bigcommerce_id: 1003,
        name: 'Hydraulic Floor Jack 3T',
        sku: 'EQ-JK-3000',
        price: '249.00',
        image: 'https://images.unsplash.com/photo-1581235720704-06d3acfcb36f?w=400&q=80',
        description: 'Heavy duty 3-ton capacity floor jack for automotive service.',
        stock_level: 8,
        is_pinned: false
      }
    ]).onConflictDoNothing();
    console.log('✓ Products created');
  } catch (e) {
    console.log('Products already exist or error:', e);
  }

  console.log('Seeding complete!');
  process.exit(0);
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});

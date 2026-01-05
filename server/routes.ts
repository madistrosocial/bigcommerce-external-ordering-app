import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProductSchema, insertOrderSchema, type InsertProduct, type InsertOrder } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ===== PRODUCT ROUTES =====
  
  // Get all products (for admin view)
  app.get("/api/products", async (req, res) => {
    try {
      const products = await storage.getAllProducts();
      res.json(products);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get pinned products only (for agent catalog)
  app.get("/api/products/pinned", async (req, res) => {
    try {
      const products = await storage.getPinnedProducts();
      res.json(products);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create/Import product from BigCommerce search
  app.post("/api/products", async (req, res) => {
    try {
      const productData = insertProductSchema.parse(req.body) as InsertProduct;
      
      // Check if product already exists by BigCommerce ID
      const existing = await storage.getProductByBigCommerceId(productData.bigcommerce_id);
      
      if (existing) {
        // If exists, just pin it
        await storage.updateProductPin(existing.id, true);
        res.json({ ...existing, is_pinned: true });
      } else {
        // Create new product
        const product = await storage.createProduct(productData);
        res.json(product);
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Toggle product pin status
  app.patch("/api/products/:id/pin", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { is_pinned } = req.body;
      
      await storage.updateProductPin(id, is_pinned);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Re-sync all pinned products from BigCommerce
  app.post("/api/products/resync", async (req, res) => {
    try {
      const pinnedProducts = await storage.getPinnedProducts();
      
      if (pinnedProducts.length === 0) {
        return res.json({ message: "No pinned products to re-sync", updated: 0 });
      }

      const setting = await storage.getSetting('bigcommerce_config');
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;

      if (setting && setting.value) {
        const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
        storeHash = config.storeHash || storeHash;
        token = config.token || token;
      }

      if (!token || !storeHash) {
        return res.status(400).json({ error: "BigCommerce credentials not configured" });
      }

      let updated = 0;
      let errors = 0;

      // Re-fetch each product from BigCommerce
      for (const product of pinnedProducts) {
        try {
          const response = await fetch(
            `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${product.bigcommerce_id}?include=variants`,
            {
              headers: {
                'X-Auth-Token': String(token),
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              }
            }
          );

          if (!response.ok) {
            console.error(`Failed to fetch product ${product.bigcommerce_id}:`, response.status, response.statusText);
            errors++;
            continue;
          }

          const { data: p } = await response.json();
          
          // Transform variant data with full option_values
          // Always preserve at least one variant (base variant if no variants returned)
          const variants = (p.variants && p.variants.length > 0) 
            ? p.variants.map((v: any) => ({
                id: v.id,
                sku: v.sku,
                price: v.price?.toString() || p.price?.toString() || product.price,
                stock_level: v.inventory_level || 0,
                option_values: (v.option_values || []).map((ov: any) => ({
                  id: ov.id,
                  option_id: ov.option_id,
                  label: ov.label,
                  option_display_name: ov.option_display_name
                }))
              }))
            : product.variants; // Keep existing variants if none returned

          // Update the product with fresh variant data
          await storage.updateProductByBigCommerceId(product.bigcommerce_id, {
            variants,
            price: p.price?.toString() || product.price,
            stock_level: p.inventory_level || 0,
            name: p.name || product.name,
            sku: p.sku || product.sku,
            image: p.primary_image?.url_standard || product.image,
            description: p.description ? p.description.replace(/<[^>]*>?/gm, '') : product.description,
          });

          updated++;
        } catch (err) {
          console.error(`Failed to re-sync product ${product.bigcommerce_id}:`, err);
          errors++;
        }
      }

      if (errors > 0 && updated === 0) {
        return res.status(502).json({ 
          error: `Failed to re-sync all ${pinnedProducts.length} products. Check server logs for details.`,
          updated: 0,
          errors
        });
      }

      res.json({ 
        message: errors > 0 
          ? `Re-synced ${updated} products (${errors} failed)`
          : `Re-synced ${updated} products successfully`, 
        updated,
        errors
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== USER ROUTES =====
  
  // Get all agents (for admin user management)
  app.get("/api/users/agents", async (req, res) => {
    try {
      const agents = await storage.getAllAgents();
      // Don't send passwords to frontend
      const safeAgents = agents.map(({ password, ...user }) => user);
      res.json(safeAgents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create user (admin only)
  app.post("/api/users", async (req, res) => {
    try {
      const { username, password, name, role } = req.body;
      
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        name,
        role: role || 'agent',
        is_enabled: true
      });

      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update user enabled status
  app.patch("/api/users/:id/status", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { is_enabled } = req.body;
      
      await storage.updateUserStatus(id, is_enabled);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Check if user is enabled
      if (!user.is_enabled) {
        return res.status(403).json({ error: "Account is disabled" });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.password);
      
      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Don't send password to frontend
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== ORDER ROUTES =====
  
  // Create order
  app.post("/api/orders", async (req, res) => {
    try {
      const orderData = insertOrderSchema.parse(req.body) as InsertOrder;
      const order = await storage.createOrder(orderData);
      res.json(order);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get orders by user
  app.get("/api/orders/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const orders = await storage.getOrdersByUser(userId);
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/orders/pending", async (req, res) => {
    try {
      const orders = await storage.getPendingSyncOrders();
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Sync order to BigCommerce
  app.post("/api/orders/:id/sync", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const order = await storage.getOrder(id);
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Get BigCommerce credentials from DB
      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;

      if (setting && setting.value) {
        const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
        storeHash = config.storeHash || storeHash;
        token = config.token || token;
      }

      if (!storeHash || !token) {
        return res.status(400).json({ error: "BigCommerce credentials not configured" });
      }

      // Split customer name into first and last name
      const nameParts = order.customer_name.trim().split(/\s+/);
      const firstName = nameParts[0] || "Customer";
      const lastName = nameParts.slice(1).join(" ") || "Customer";

      // Prepare BigCommerce order data using v2 API format
      const bcOrderData = {
        status_id: 1, // Pending
        customer_id: 0, // Guest checkout
        billing_address: {
          first_name: firstName,
          last_name: lastName,
          street_1: "123 Main St",
          city: "Austin",
          state: "Texas",
          zip: "78701",
          country: "United States",
          country_iso2: "US",
          email: "customer@example.com"
        },
        products: (order.items as any[]).map(item => {
          const productData: any = {
            product_id: item.bigcommerce_product_id,
            quantity: item.quantity,
            price_inc_tax: parseFloat(item.price_at_sale),
            price_ex_tax: parseFloat(item.price_at_sale)
          };
          
          // Include product_options if variant has option_values
          // Note: We need to fetch the variant details to get option_values
          // For now, if item has variant info with option_values, map them
          if (item.variant_option_values && Array.isArray(item.variant_option_values) && item.variant_option_values.length > 0) {
            productData.product_options = item.variant_option_values.map((ov: any) => ({
              id: ov.option_id,
              value: String(ov.id)
            }));
          }
          
          return productData;
        })
      };

      console.log('Creating BigCommerce order:', JSON.stringify(bcOrderData, null, 2));

      // Use v2 Orders API for creation
      const response = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v2/orders`,
        {
          method: 'POST',
          headers: {
            'X-Auth-Token': String(token),
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(bcOrderData)
        }
      );

      const responseText = await response.text();
      console.log('BigCommerce API response:', response.status, responseText);

      if (response.ok) {
        const data = JSON.parse(responseText);
        const bcOrderId = data.id;
        console.log('✅ BigCommerce order created successfully:', bcOrderId);
        await storage.updateOrderStatus(id, 'synced', bcOrderId);
        return res.json({ success: true, bigcommerce_order_id: bcOrderId });
      } else {
        // Parse error response
        let errorMessage = `BigCommerce API error: ${response.status}`;
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.title || errorData.message || JSON.stringify(errorData);
        } catch (e) {
          errorMessage = responseText || errorMessage;
        }
        
        console.error('❌ BigCommerce order creation failed:', errorMessage);
        return res.status(response.status).json({ 
          error: errorMessage,
          details: responseText
        });
      }
    } catch (error: any) {
      console.error('❌ Order sync error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===== BIGCOMMERCE PROXY =====
  
  // BigCommerce proxy for products
  app.get("/api/bigcommerce/products/search", async (req, res) => {
    try {
      const { query } = req.query;
      
      // Fetch setting from database instead of localStorage
      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;

      if (setting && setting.value) {
        const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
        storeHash = config.storeHash || storeHash;
        token = config.token || token;
      }

      if (!token || !storeHash || !query) {
        return res.status(400).json({ error: "Missing required parameters (search query or credentials)" });
      }

      // Call BigCommerce API for products
      const response = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?keyword=${encodeURIComponent(query as string)}&include=primary_image,variants`,
        {
          headers: {
            'X-Auth-Token': String(token),
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`BigCommerce API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Transform to our format
      const products = data.data.map((p: any) => ({
        id: p.id,
        bigcommerce_id: p.id,
        name: p.name,
        sku: p.sku,
        price: p.price.toString(),
        image: p.primary_image?.url_standard || '',
        description: p.description.replace(/<[^>]*>?/gm, ''),
        stock_level: p.inventory_level || 0,
        is_pinned: false,
        // Always include variants array, regardless of option count
        variants: (p.variants || []).map((v: any) => ({
          id: v.id,
          sku: v.sku,
          price: v.price?.toString() || p.price.toString(),
          stock_level: v.inventory_level || 0,
          option_values: (v.option_values || []).map((ov: any) => ({
            id: ov.id, // option value ID - needed for BigCommerce order API
            option_id: ov.option_id, // option ID - needed for BigCommerce order API
            label: ov.label,
            option_display_name: ov.option_display_name
          }))
        }))
      }));

      res.json(products);

    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== SETTINGS ROUTES =====
  app.get("/api/settings/:key", async (req, res) => {
    try {
      const setting = await storage.getSetting(req.params.key);
      res.json(setting || { key: req.params.key, value: null });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const { key, value } = req.body;
      await storage.setSetting(key, value);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertProductSchema, insertOrderSchema } from "@shared/schema";
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
      const productData = insertProductSchema.parse(req.body);
      
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
      const orderData = insertOrderSchema.parse(req.body);
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

  // Get pending sync orders
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
      
      // Simulate BigCommerce order creation
      // In production, this would call BigCommerce API
      const bcOrderId = Math.floor(Math.random() * 100000) + 50000;
      
      await storage.updateOrderStatus(id, 'synced', bcOrderId);
      res.json({ success: true, bigcommerce_order_id: bcOrderId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== BIGCOMMERCE PROXY =====
  
  // Proxy for BigCommerce catalog search
  app.get("/api/bigcommerce/products/search", async (req, res) => {
    try {
      const { query, token, storeHash } = req.query;

      if (!token || !storeHash || !query) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      // Call BigCommerce API
      const response = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?keyword=${encodeURIComponent(query as string)}&include=primary_image`,
        {
          headers: {
            'X-Auth-Token': token as string,
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
        is_pinned: false
      }));

      res.json(products);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}

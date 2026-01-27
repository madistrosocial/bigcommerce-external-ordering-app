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
      const safeAgents = agents.map(({ password, ...user }) => user);
      res.json(safeAgents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all admins
  app.get("/api/users/admins", async (req, res) => {
    try {
      const admins = await storage.getAllAdmins();
      const safeAdmins = admins.map(({ password, ...user }) => user);
      res.json(safeAdmins);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all users
  app.get("/api/users", async (req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const safeUsers = allUsers.map(({ password, ...user }) => user);
      res.json(safeUsers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create user (admin only)
  app.post("/api/users", async (req, res) => {
    try {
      const { username, password, name, role } = req.body;
      
      // Validate role
      const validRoles = ['admin', 'agent'];
      const normalizedRole = (role || 'agent').toLowerCase();
      if (!validRoles.includes(normalizedRole)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      }
      
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
        name,
        role: normalizedRole,
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

  // Update user BigCommerce search permission
  app.patch("/api/users/:id/permission", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { allow_bigcommerce_search } = req.body;
      
      await storage.updateUserPermission(id, allow_bigcommerce_search);
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
  
  // Create order with immediate sync attempt
  app.post("/api/orders", async (req, res) => {
    try {
      // Parse and create order with status 'pending_sync'
      const orderData = insertOrderSchema.parse(req.body) as InsertOrder;
      
      // Validate billing address is provided for BigCommerce orders
      if (!orderData.billing_address || !orderData.billing_address.street_1) {
        return res.status(400).json({ error: "Billing address is required for order creation" });
      }
      
      orderData.status = 'pending_sync';
      const order = await storage.createOrder(orderData);
      
      // Get settings
      const bcSetting = await storage.getSetting("bigcommerce_config");
      const webhookSetting = await storage.getSetting("google_sheets_webhook");
      
      let bcSuccess = false;
      let bcOrderId: number | undefined;
      let bcError = "";
      let sheetsSuccess = false;
      let sheetsError = "";
      
      // Try to sync to BigCommerce
      if (bcSetting && bcSetting.value) {
        const config = typeof bcSetting.value === 'string' ? JSON.parse(bcSetting.value) : bcSetting.value;
        const storeHash = config.storeHash;
        const token = config.token;
        
        if (storeHash && token) {
          try {
            const nameParts = order.customer_name.trim().split(/\s+/);
            const firstName = nameParts[0] || "Customer";
            const lastName = nameParts.slice(1).join(" ") || "Customer";
            
            const bcOrderData = {
              status_id: 1,
              customer_id: order.bigcommerce_customer_id || 0,
              billing_address: order.billing_address,
              staff_notes: order.order_note || undefined,
              products: (order.items as any[]).map(item => {
                const productData: any = {
                  product_id: item.bigcommerce_product_id,
                  quantity: item.quantity,
                  price_inc_tax: parseFloat(item.price_at_sale),
                  price_ex_tax: parseFloat(item.price_at_sale)
                };
                if (item.variant_option_values && Array.isArray(item.variant_option_values) && item.variant_option_values.length > 0) {
                  productData.product_options = item.variant_option_values.map((ov: any) => ({
                    id: ov.option_id,
                    value: String(ov.id)
                  }));
                }
                return productData;
              })
            };
            
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
            
            if (response.ok) {
              const data = await response.json();
              bcOrderId = data.id;
              bcSuccess = true;
              await storage.updateOrderStatus(order.id!, 'synced', bcOrderId);
            } else {
              const errorText = await response.text();
              bcError = `BigCommerce sync failed: ${errorText}`;
              await storage.updateOrderSyncError(order.id!, bcError);
            }
          } catch (e: any) {
            bcError = `BigCommerce sync error: ${e.message}`;
            await storage.updateOrderSyncError(order.id!, bcError);
          }
        }
      }
      
      // Log to Google Sheets webhook
      if (webhookSetting && webhookSetting.value) {
        try {
          const webhookUrl = typeof webhookSetting.value === 'string' ? webhookSetting.value : null;
          if (webhookUrl) {
            const sheetsData = {
              order_id: order.id,
              customer_name: order.customer_name,
              total: order.total,
              date: order.date,
              bigcommerce_order_id: bcOrderId || null,
              bigcommerce_synced: bcSuccess,
              items: order.items
            };
            
            const sheetsResponse = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sheetsData)
            });
            
            sheetsSuccess = sheetsResponse.ok;
            if (!sheetsSuccess) {
              sheetsError = `Google Sheets logging failed: ${sheetsResponse.statusText}`;
            }
          }
        } catch (e: any) {
          sheetsError = `Google Sheets logging error: ${e.message}`;
        }
      }
      
      // Return comprehensive status
      const updatedOrder = await storage.getOrder(order.id!);
      res.json({
        order: updatedOrder,
        bigcommerce: {
          success: bcSuccess,
          order_id: bcOrderId,
          error: bcError || undefined
        },
        google_sheets: {
          success: sheetsSuccess,
          error: sheetsError || undefined
        }
      });
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

  app.get("/api/orders/drafts", async (req, res) => {
    try {
      const drafts = await storage.getDraftOrders();
      res.json(drafts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create draft order (for offline mode)
  app.post("/api/orders/draft", async (req, res) => {
    try {
      const orderData = insertOrderSchema.parse(req.body) as InsertOrder;
      orderData.status = 'draft';
      const order = await storage.createOrder(orderData);
      res.json(order);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Submit draft order (when back online)
  app.post("/api/orders/:id/submit-draft", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { bigcommerce_customer_id, billing_address } = req.body;
      
      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      if (order.status !== 'draft') {
        return res.status(400).json({ error: "Order is not a draft" });
      }

      // Update order with customer data
      await storage.updateOrderForSubmission(id, {
        bigcommerce_customer_id,
        billing_address,
        status: 'pending_sync'
      });

      // Get updated order
      const updatedOrder = await storage.getOrder(id);

      // Get settings
      const bcSetting = await storage.getSetting("bigcommerce_config");
      const webhookSetting = await storage.getSetting("google_sheets_webhook");
      
      let bcSuccess = false;
      let bcOrderId: number | undefined;
      let bcError = "";
      let sheetsSuccess = false;
      let sheetsError = "";
      
      // Try to sync to BigCommerce
      if (bcSetting && bcSetting.value) {
        const config = typeof bcSetting.value === 'string' ? JSON.parse(bcSetting.value) : bcSetting.value;
        const storeHash = config.storeHash;
        const token = config.token;
        
        if (storeHash && token) {
          try {

            const billingAddressWithCompany = {
              ...billing_address,
              company:
                billing_address.company ||
                updatedOrder!.customer_company ||
                ""
            };
            
            const bcOrderData = {
              status_id: 1,
              customer_id: bigcommerce_customer_id || 0,
              billing_address: billingAddressWithCompany,
              staff_notes: updatedOrder!.order_note || undefined,
              products: (updatedOrder!.items as any[]).map(item => {
                const productData: any = {
                  product_id: item.bigcommerce_product_id,
                  quantity: item.quantity,
                  price_inc_tax: parseFloat(item.price_at_sale),
                  price_ex_tax: parseFloat(item.price_at_sale)
                };
            
                if (
                  item.variant_option_values &&
                  Array.isArray(item.variant_option_values) &&
                  item.variant_option_values.length > 0
                ) {
                  productData.product_options = item.variant_option_values.map((ov: any) => ({
                    id: ov.option_id,
                    value: String(ov.id)
                  }));
                }
            
                return productData;
              })
            };

            /*
            const bcOrderData = {
              status_id: 1,
              customer_id: bigcommerce_customer_id || 0,
              billing_address: billing_address,
              staff_notes: updatedOrder!.order_note || undefined,
              products: (updatedOrder!.items as any[]).map(item => {
                const productData: any = {
                  product_id: item.bigcommerce_product_id,
                  quantity: item.quantity,
                  price_inc_tax: parseFloat(item.price_at_sale),
                  price_ex_tax: parseFloat(item.price_at_sale)
                };
                if (item.variant_option_values && Array.isArray(item.variant_option_values) && item.variant_option_values.length > 0) {
                  productData.product_options = item.variant_option_values.map((ov: any) => ({
                    id: ov.option_id,
                    value: String(ov.id)
                  }));
                }
                return productData;
              })
            };
            */
            
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
            
            if (response.ok) {
              const data = await response.json();
              bcOrderId = data.id;
              bcSuccess = true;
              await storage.updateOrderStatus(id, 'synced', bcOrderId);
            } else {
              const errorText = await response.text();
              bcError = `BigCommerce sync failed: ${errorText}`;
              await storage.updateOrderSyncError(id, bcError);
            }
          } catch (e: any) {
            bcError = `BigCommerce sync error: ${e.message}`;
            await storage.updateOrderSyncError(id, bcError);
          }
        }
      }
      
      // Log to Google Sheets webhook
      if (webhookSetting && webhookSetting.value && bcSuccess) {
        try {
          const webhookUrl = typeof webhookSetting.value === 'string' ? webhookSetting.value : null;
          if (webhookUrl) {
            const sheetsData = {
              order_id: id,
              customer_name: updatedOrder!.customer_name,
              total: updatedOrder!.total,
              date: updatedOrder!.date,
              bigcommerce_order_id: bcOrderId || null,
              bigcommerce_synced: bcSuccess,
              items: updatedOrder!.items
            };
            
            const sheetsResponse = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sheetsData)
            });
            
            sheetsSuccess = sheetsResponse.ok;
            if (!sheetsSuccess) {
              sheetsError = `Google Sheets logging failed: ${sheetsResponse.statusText}`;
            }
          }
        } catch (e: any) {
          sheetsError = `Google Sheets logging error: ${e.message}`;
        }
      }
      
      // Return comprehensive status
      const finalOrder = await storage.getOrder(id);
      res.json({
        order: finalOrder,
        bigcommerce: {
          success: bcSuccess,
          order_id: bcOrderId,
          error: bcError || undefined
        },
        google_sheets: {
          success: sheetsSuccess,
          error: sheetsError || undefined
        }
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
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
/*
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
*/
      const billingAddressWithCompany = {
        ...order.billing_address,
        company:
          order.billing_address.company ||
          order.customer_company ||
          ""
      };
      
      const bcOrderData = {
        status_id: 1,
        customer_id: order.bigcommerce_customer_id || 0,
        billing_address: billingAddressWithCompany,
        staff_notes: order.order_note || undefined,
        products: (order.items as any[]).map(item => {
          const productData: any = {
            product_id: item.bigcommerce_product_id,
            quantity: item.quantity,
            price_inc_tax: parseFloat(item.price_at_sale),
            price_ex_tax: parseFloat(item.price_at_sale)
          };
      
          if (
            item.variant_option_values &&
            Array.isArray(item.variant_option_values) &&
            item.variant_option_values.length > 0
          ) {
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
  
  // Agent-facing BigCommerce product search (requires permission)
  app.get("/api/agent/bigcommerce/search", async (req, res) => {
    try {
      const { query, userId } = req.query;
      
      if (!userId) {
        return res.status(401).json({ error: "User ID required" });
      }
      
      // Check if user has permission
      const user = await storage.getUser(parseInt(userId as string));
      if (!user || !user.allow_bigcommerce_search) {
        return res.status(403).json({ error: "BigCommerce search not permitted for this user" });
      }
      
      // Fetch setting from database
      const setting = await storage.getSetting("bigcommerce_config");
      let storeHash = process.env.BC_STORE_HASH;
      let token = process.env.BC_TOKEN;

      if (setting && setting.value) {
        const config = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
        storeHash = config.storeHash || storeHash;
        token = config.token || token;
      }

      if (!token || !storeHash || !query) {
        return res.status(400).json({ error: "Missing required parameters" });
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
      
      // Transform to our format (same as admin endpoint)
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
        variants: (p.variants || []).map((v: any) => ({
          id: v.id,
          sku: v.sku,
          price: v.price?.toString() || p.price.toString(),
          stock_level: v.inventory_level || 0,
          option_values: (v.option_values || []).map((ov: any) => ({
            id: ov.id,
            option_id: ov.option_id,
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

  // BigCommerce proxy for products (admin use)
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

  // BigCommerce customer search
  app.get("/api/bigcommerce/customers/search", async (req, res) => {
    try {
      const { query } = req.query;
      if (!query) {
        return res.json([]);
      }

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

      // Search customers by name or email (try both)
      const searchParam = (query as string).includes('@') 
        ? `email:like=${encodeURIComponent(query as string)}`
        : `name:like=${encodeURIComponent(query as string)}`;
      const response = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/customers?${searchParam}&limit=10`,
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
      
      // Transform to simplified format
      const customers = data.data.map((c: any) => ({
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        email: c.email,
        phone: c.phone || '',
        company: c.company || ''
      }));

      res.json(customers);

    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get BigCommerce customer addresses
  app.get("/api/bigcommerce/customers/:customerId/addresses", async (req, res) => {
    try {
      const { customerId } = req.params;

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

      const response = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/customers/addresses?customer_id:in=${customerId}`,
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
      
      // Return addresses
      const addresses = data.data.map((a: any) => ({
        id: a.id,
        first_name: a.first_name,
        last_name: a.last_name,
        company: a.company || '',
        street_1: a.address1,
        street_2: a.address2 || '',
        city: a.city,
        state: a.state_or_province,
        zip: a.postal_code,
        country: a.country,
        country_iso2: a.country_code,
        phone: a.phone || ''
      }));

      res.json(addresses);

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

e: String(export_type ?? "csv"),
        row_count: Number(row_count ?? 0),
      });
      res.status(201).json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Marketing Module ─────────────────────────────────────────────────────────
  const marketingStatuses = new Set(["draft", "ready", "queued", "scheduled", "sending", "sent", "paused", "failed", "cancelled"]);
  const allowedMarketingTransitions: Record<string, string[]> = {
    draft: ["ready", "paused"],
    ready: ["draft", "scheduled", "queued", "paused"],
    scheduled: ["ready", "queued", "paused", "cancelled"],
    queued: ["paused", "cancelled"],
    sending: ["sent", "failed", "paused"],
    paused: ["draft", "ready", "scheduled"],
    failed: ["draft", "queued"],
    cancelled: ["draft"],
    sent: [],
  };
  const getMarketingUserId = (req: Request) => Number((req as any).authUser?.id);
  const marketingUserCan = async (req: Request, action: string) => {
    const user = (req as any).authUser;
    return user?.role === "admin" || (await storage.getUserPermissionStrings(Number(user?.id))).includes(`marketing:${action}`);
  };
  const validMarketingAudienceTypes = new Set(["all_eligible", "customer_group", "selected_customers", "saved_audience"]);

  function getMarketingAudienceConfig(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  }

  function validateMarketingAudience(
    audienceTypeValue: unknown,
    audienceConfigValue: unknown,
    audienceIdValue: unknown,
    customerIdsValue: unknown,
    requireComplete: boolean,
  ): string | null {
    const audienceType = String(audienceTypeValue ?? "").trim();
    if (!audienceType) return requireComplete ? "Choose an audience before continuing" : null;
    if (!validMarketingAudienceTypes.has(audienceType)) return "Invalid audience type";
    const config = getMarketingAudienceConfig(audienceConfigValue);
    if (audienceType === "saved_audience" && !Number(audienceIdValue)) return "A saved audience is required";
    if (audienceType === "customer_group") {
      const groupName = String(config.customerGroupName ?? config.customerGroup ?? "").trim();
      if (!groupName) return "Choose a BigCommerce customer group";
    }
    if (audienceType === "selected_customers" && requireComplete) {
      const ids = Array.isArray(customerIdsValue) ? customerIdsValue : [];
      if (!ids.some(id => Number.isInteger(Number(id)) && Number(id) > 0)) return "Select at least one customer";
    }
    return null;
  }

  app.get("/api/marketing/dashboard", requirePermission("marketing"), async (_req, res) => {
    try { res.json(await storage.getMarketingDashboard()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/sender-settings", requirePermission("marketing"), async (_req, res) => {
    try {
      res.json(await getMarketingSenderSettings());
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/provider-status", requirePermission("marketing"), async (_req, res) => {
    res.json(await getZohoCampaignsCredentialStatus());
  });

  app.get("/api/admin/zoho-credentials", requireAdmin, async (_req, res) => {
    try {
      res.json(await getZohoCampaignsCredentialStatus());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/admin/zoho-credentials", requireAdmin, async (req, res) => {
    try {
      await saveZohoCampaignsCredentials({
        credentials: req.body?.credentials,
        clear: req.body?.clear,
      });
      res.json(await getZohoCampaignsCredentialStatus());
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/admin/zoho-credentials", requireAdmin, async (_req, res) => {
    try {
      await clearZohoCampaignsCredentials();
      res.json(await getZohoCampaignsCredentialStatus());
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put("/api/marketing/sender-settings", requirePermission("marketing", "send"), async (req, res) => {
    try {
      const requestedEmails: string[] = Array.isArray(req.body?.emails)
        ? req.body.emails.map((email: unknown): string => String(email ?? "").trim())
        : [];
      if (!requestedEmails.length) return res.status(400).json({ error: "Add at least one campaign sender email." });
      if (requestedEmails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        return res.status(400).json({ error: "Every sender email must be valid." });
      }
      const requestedDefault = String(req.body?.defaultEmail ?? "").trim();
      if (requestedDefault && !requestedEmails.some(email => email.toLowerCase() === requestedDefault.toLowerCase())) {
        return res.status(400).json({ error: "The default sender must be one of the configured emails." });
      }
      const settings = normalizeMarketingSenderSettings({ emails: requestedEmails, defaultEmail: requestedDefault });
      await storage.setSetting("marketing_sender_settings", settings);
      res.json(settings);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // Marketing product picker. Credentials stay server-side and only the
  // snapshot fields needed by the campaign editor are returned.
  app.get("/api/marketing/products/search", requirePermission("marketing"), async (req, res) => {
    try {
      const query = String(req.query.query ?? "").trim();
      if (query.length < 2) return res.json([]);
      const setting = await storage.getSetting("bigcommerce_config");
      const config = setting?.value
        ? (typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value)
        : {};
      const storeHash = config.storeHash || process.env.BC_STORE_HASH;
      const token = config.token || process.env.BC_TOKEN;
      const storefrontUrl = String(config.storefrontUrl || "").replace(/\/$/, "");
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce is not configured" });

      const response = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?keyword=${encodeURIComponent(query)}&include=primary_image,variants&limit=50`,
        {
          headers: {
            "X-Auth-Token": String(token),
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
      );
      if (!response.ok) return res.status(502).json({ error: "BigCommerce product search failed" });
      const data = await response.json();
      const products = (data.data ?? []).map((product: any) => {
        const path = String(product.custom_url?.url || `/${String(product.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}/`);
        const productUrl = /^https?:\/\//i.test(path)
          ? path
          : storefrontUrl ? `${storefrontUrl}${path.startsWith("/") ? path : `/${path}`}` : "";
        return {
          id: Number(product.id),
          bigcommerce_id: Number(product.id),
          name: String(product.name ?? ""),
          sku: String(product.sku ?? ""),
          price: String(product.price ?? ""),
          image: String(product.primary_image?.url_standard ?? ""),
          stock_level: Number(product.inventory_level ?? 0),
          product_url: productUrl,
          variants: Array.isArray(product.variants) ? product.variants.map((variant: any) => ({
            id: Number(variant.id),
            sku: String(variant.sku ?? ""),
            stock_level: Number(variant.inventory_level ?? 0),
            option_values: Array.isArray(variant.option_values)
              ? variant.option_values.map((option: any) => ({
                label: String(option.label ?? option.value ?? ""),
                option_display_name: String(option.option_display_name ?? ""),
              }))
              : [],
          })) : [],
        };
      });
      res.json(products);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/marketing/product-lists", requirePermission("marketing"), async (req, res) => {
    try {
      res.json(await storage.getMarketingProductLists({ search: String(req.query.search ?? "") }));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/marketing/product-lists/:id", requirePermission("marketing"), async (req, res) => {
    try {
      const list = await storage.getMarketingProductList(Number(req.params.id));
      if (!list) return res.status(404).json({ error: "Product list not found" });
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/marketing/product-lists", requirePermission("marketing"), async (req, res) => {
    try {
      const name = String(req.body?.name ?? "").trim();
      if (!name) return res.status(400).json({ error: "A product list name is required" });
      if (name.length > 160) return res.status(400).json({ error: "Product list names must be 160 characters or fewer" });
      const created = await storage.createMarketingProductList({
        name,
        description: String(req.body?.description ?? "").trim(),
        created_by: Number((req as any).authUser.id),
      });
      res.status(201).json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch("/api/marketing/product-lists/:id", requirePermission("marketing"), async (req, res) => {
    try {
      const name = req.body?.name === undefined ? undefined : String(req.body.name ?? "").trim();
      if (name !== undefined && !name) return res.status(400).json({ error: "A product list name is required" });
      const updated = await storage.updateMarketingProductList(Number(req.params.id), {
        ...(name !== undefined ? { name } : {}),
        ...(req.body?.description !== undefined ? { description: String(req.body.description ?? "").trim() } : {}),
      }, Number((req as any).authUser.id));
      if (!updated) return res.status(404).json({ error: "Product list not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/marketing/product-lists/:id", requirePermission("marketing"), async (req, res) => {
    try {
      await storage.deleteMarketingProductList(Number(req.params.id), Number((req as any).authUser.id));
      res.status(204).send();
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/marketing/product-lists/:id/items", requirePermission("marketing"), async (req, res) => {
    try {
      const products = Array.isArray(req.body?.products) ? req.body.products : [];
      if (!products.length) return res.status(400).json({ error: "Select at least one product" });
      if (products.length > 250) return res.status(400).json({ error: "A product list cannot contain more than 250 products" });
      const sanitized = products.filter((product: unknown) => product && typeof product === "object").map((product: any) => ({
        id: Number(product.id ?? product.bigcommerce_id),
        bigcommerce_id: Number(product.bigcommerce_id ?? product.id),
        name: String(product.name ?? "").slice(0, 500),
        sku: String(product.sku ?? "").slice(0, 200),
        price: String(product.price ?? "").slice(0, 100),
        image: String(product.image ?? "").slice(0, 2000),
        stock_level: Number(product.stock_level ?? 0),
        product_url: String(product.product_url ?? "").slice(0, 2000),
        variants: Array.isArray(product.variants) ? product.variants.slice(0, 250) : [],
      }));
      const updated = await storage.addMarketingProductListItems(Number(req.params.id), sanitized);
      if (!updated) return res.status(404).json({ error: "Product list not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/marketing/product-lists/:id/items/:itemId", requirePermission("marketing"), async (req, res) => {
    try {
      await storage.removeMarketingProductListItem(Number(req.params.id), Number(req.params.itemId));
      res.status(204).send();
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Order Form customer lookup uses the CRM mirror and applies the caller's
  // existing CRM visibility scope without changing Marketing Audiences.
  app.get("/api/marketing/order-forms/customers", requirePermission("marketing"), async (req, res) => {
    try {
      const user = (req as any).authUser;
      const perms = await storage.getUserPermissionStrings(Number(user.id));
      const scope = await getCrmVisibilityScope(storage, Number(user.id), user.role, perms);
      const result = await storage.getCrmCustomers({
        search: String(req.query.search ?? "").trim() || undefined,
        limit: Math.min(Math.max(Number(req.query.limit) || 25, 1), 100),
        offset: Math.max(Number(req.query.offset) || 0, 0),
        visibilityScope: scope.scope,
        visibilityUserId: scope.userId,
        accountType: "customer",
        status: "active",
      });
      res.json({
        rows: result.customers.map((customer: any) => ({
          id: customer.id,
          company: customer.company,
          first_name: customer.first_name,
          last_name: customer.last_name,
          email: customer.email,
        })),
        total: result.total,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/marketing/order-forms/history", requirePermission("marketing"), async (req, res) => {
    try {
      const user = (req as any).authUser;
      const perms = await storage.getUserPermissionStrings(Number(user.id));
      const scope = await getCrmVisibilityScope(storage, Number(user.id), user.role, perms);
      const visible = await storage.getCrmCustomers({
        limit: 10000,
        offset: 0,
        visibilityScope: scope.scope,
        visibilityUserId: scope.userId,
        accountType: "customer",
        status: "both",
      });
      const customerIds = visible.customers.map((customer: any) => Number(customer.id));
      const entries = await storage.getCrmAuditEntries({
        customerIds,
        actions: ["order_form_send_pending", "order_form_sent", "order_form_send_failed"],
        limit: 1000,
      });
      const latestBySend = new Map<string, any>();
      for (const entry of entries) {
        const detail = entry.detail && typeof entry.detail === "object" ? entry.detail as Record<string, any> : {};
        const sendId = String(detail.send_id ?? "");
        if (!sendId || latestBySend.has(sendId)) continue;
        const status = entry.action === "order_form_sent"
          ? "sent"
          : entry.action === "order_form_send_failed"
            ? "failed"
            : "pending";
        latestBySend.set(sendId, {
          id: sendId,
          customer_id: entry.customer_id,
          customer_name: entry.customer_company || [entry.customer_first_name, entry.customer_last_name].filter(Boolean).join(" ") || entry.customer_email,
          recipient_email: detail.recipient_email ?? entry.customer_email,
          file_format: detail.file_format ?? "xlsx",
          product_count: Number(detail.product_count ?? 0),
          status,
          failure_reason: detail.failure_reason ?? null,
          created_by: detail.created_by_name ?? entry.user_name ?? "Unknown",
          created_at: entry.created_at,
          sent_at: detail.sent_at ?? (status === "sent" ? entry.created_at : null),
        });
      }
      res.json([...latestBySend.values()]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/marketing/logs", requirePermission("marketing"), async (req, res) => {
    try {
      const rawType = String(req.query.type ?? "all");
      const delivery_type = rawType === "campaign" || rawType === "order_form" ? rawType : undefined;
      const result = await storage.getMarketingDeliveryLogs({
        delivery_type,
        campaign_id: req.query.campaignId ? Number(req.query.campaignId) : undefined,
        customer_id: req.query.customerId ? Number(req.query.customerId) : undefined,
        limit: Math.min(Math.max(Number(req.query.limit) || 50, 1), 100),
        offset: Math.max(Number(req.query.offset) || 0, 0),
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/marketing/logs/:id", requirePermission("marketing"), async (req, res) => {
    try {
      const log = await storage.getMarketingDeliveryLog(Number(req.params.id));
      if (!log) return res.status(404).json({ error: "Marketing log not found" });
      res.json(log);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/marketing/order-forms/send", requirePermission("marketing", "send"), async (req, res) => {
    try {
      const defaultEmailTitle = "Your Order Form from MidAtlantic Distribution";
      const defaultEmailBody = "Hi {first_name},\n\nPlease find your order form attached. Review the available products and let us know if you have any questions.\n\nThank you,\nMidAtlantic Distribution";
      const user = (req as any).authUser;
      const audienceType = req.body?.audience_type === "saved_audience" ? "saved_audience" : "selected_customers";
      const audienceId = Number(req.body?.audience_id) || null;
      let customerIds = Array.from(new Set(
        (Array.isArray(req.body?.customer_ids) ? req.body.customer_ids : [])
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value > 0),
      ));
      const productIds = Array.from(new Set(
        (Array.isArray(req.body?.product_ids) ? req.body.product_ids : [])
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value > 0),
      ));
      const format = req.body?.format === "csv" ? "csv" : req.body?.format === "xlsx" ? "xlsx" : "";
      const emailTitle = String(req.body?.email_title ?? defaultEmailTitle).trim().slice(0, 180) || defaultEmailTitle;
      const emailBody = String(req.body?.email_body ?? defaultEmailBody).trim().slice(0, 10000) || defaultEmailBody;
      if (audienceType === "saved_audience") {
        if (!audienceId) return res.status(400).json({ error: "Choose a saved audience" });
        const audience = await storage.getMarketingAudience(audienceId);
        if (!audience) return res.status(404).json({ error: "Saved audience not found" });
        if (audience.audience_type === "manual") {
          customerIds = Array.from(new Set((audience.member_customer_ids ?? [])
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isInteger(value) && value > 0)));
        } else {
          const preview = await storage.getMarketingAudiencePreview(audience.dynamic_filters ?? {}, 100000);
          customerIds = Array.from(new Set((preview.customers ?? [])
            .map((customer: any) => Number(customer.id))
            .filter((value: number) => Number.isInteger(value) && value > 0)));
        }
      }
      if (!customerIds.length) return res.status(400).json({ error: "The selected audience has no CRM customers to send to" });
      if (!productIds.length) return res.status(400).json({ error: "Select at least one product" });
      if (!format) return res.status(400).json({ error: "Choose CSV or XLSX format" });
      if (customerIds.length > 100 || productIds.length > 250) {
        return res.status(400).json({ error: "The order form batch is too large" });
      }

      const customers: any[] = [];
      for (const customerId of customerIds) {
        if (!await assertCrmCustomerAccess(storage, customerId, Number(user.id), user.role, res)) return;
        const customer = await storage.getCrmCustomerById(customerId);
        if (!customer || !customer.is_active || customer.account_type !== "customer") {
          return res.status(400).json({ error: "One or more selected customers are no longer active CRM customers" });
        }
        if (!String(customer.email ?? "").trim()) {
          return res.status(400).json({ error: `${customer.company || customer.first_name || "A selected customer"} does not have an email address` });
        }
        customers.push(customer);
      }

      const setting = await storage.getSetting("bigcommerce_config");
      const config = setting?.value
        ? (typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value)
        : {};
      const storeHash = config.storeHash || process.env.BC_STORE_HASH;
      const token = config.token || process.env.BC_TOKEN;
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce is not configured" });

      const currentProducts: any[] = [];
      for (const productId of productIds) {
        const response = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products/${productId}?include=primary_image,variants`,
          { headers: { "X-Auth-Token": String(token), Accept: "application/json" } },
        );
        if (!response.ok) return res.status(502).json({ error: `Could not refresh product ${productId} from BigCommerce` });
        const product = (await response.json()).data;
        if (!product) return res.status(400).json({ error: `Product ${productId} is no longer available` });
        currentProducts.push({
          id: Number(product.id),
          brand: String(product.brand_name ?? ""),
          name: String(product.name ?? ""),
          sku: String(product.sku ?? ""),
          variants: Array.isArray(product.variants) && product.variants.length
            ? product.variants.map((variant: any) => ({
              sku: String(variant.sku ?? ""),
              stock_level: Number(variant.inventory_level ?? 0),
              variant: Array.isArray(variant.option_values)
                ? variant.option_values.map((option: any) => String(option.label ?? option.value ?? "")).filter(Boolean).join(" / ")
                : "",
            }))
            : [{
              sku: String(product.sku ?? ""),
              stock_level: Number(product.inventory_level ?? 0),
              variant: "Default",
            }],
        });
      }

      const invoiceSetting = await storage.getSetting("invoice_settings").catch(() => null);
      const smtpConfig = invoiceSetting?.value
        ? (typeof invoiceSetting.value === "string" ? JSON.parse(invoiceSetting.value) : invoiceSetting.value)
        : {};
      const smtpHost = smtpConfig.smtp_host || "";
      const smtpPort = Number(smtpConfig.smtp_port) || 587;
      const smtpUser = smtpConfig.smtp_user || "";
      const smtpPass = smtpConfig.smtp_pass || "";
      const marketingSenderSettings = await getMarketingSenderSettings(smtpConfig);
      const requestedSender = String(req.body?.sender_email ?? "").trim();
      const smtpFrom = marketingSenderSettings.emails.find(email => email.toLowerCase() === requestedSender.toLowerCase())
        ?? marketingSenderSettings.defaultEmail;
      if (requestedSender && !marketingSenderSettings.emails.some(email => email.toLowerCase() === requestedSender.toLowerCase())) {
        return res.status(400).json({ error: "Choose a sender email from the configured Marketing sender addresses" });
      }
      if (!smtpHost || !smtpUser) {
        return res.status(400).json({ error: "SMTP is not configured. Please set SMTP settings in Invoice Settings." });
      }
      if (!smtpFrom) return res.status(400).json({ error: "No Marketing sender email is configured. Add one in Marketing settings before sending." });
      const transporter = nodemailer.createTransport({
        host: smtpHost, port: smtpPort, secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
        connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000,
      });
      await transporter.verify();

      const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
      const results: any[] = [];
      const escapeHtml = (value: string) => value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
      const resolveEmailTemplate = (template: string, customer: any) => {
        const firstName = String(customer.first_name ?? "").trim();
        const lastName = String(customer.last_name ?? "").trim();
        const fullName = [firstName, lastName].filter(Boolean).join(" ");
        const businessName = String(customer.company ?? "").trim();
        const values: Record<string, string> = {
          first_name: firstName,
          "first name": firstName,
          last_name: lastName,
          "last name": lastName,
          fullname: fullName,
          full_name: fullName,
          "full name": fullName,
          business_name: businessName,
          "business name": businessName,
          company: businessName,
          email: String(customer.email ?? "").trim(),
        };
        return template.replace(/\{([^{}]+)\}/g, (match, key: string) => values[key.trim().toLowerCase()] ?? match);
      };
      for (const customer of customers) {
        const sendId = randomUUID();
        const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
        const businessName = String(customer.company ?? "");
        const displayName = businessName || customerName || `Customer ${customer.id}`;
        const resolvedEmailTitle = resolveEmailTemplate(emailTitle, customer);
        const resolvedEmailBody = resolveEmailTemplate(emailBody, customer);
        const rows = currentProducts.flatMap((product) => product.variants.map((variant: any) => [
          product.brand || product.name.split(/\s+/)[0],
          product.name,
          variant.variant || "Default",
          variant.sku || product.sku,
          Number(variant.stock_level) > 0 ? "Available" : "OOS",
          "",
          "",
        ]));
        const headers = ["Brand", "Product / Device", "Variant / Flavor", "SKU", "Availability", "Qty", "Notes"];
        const fileBuffer = format === "csv"
          ? Buffer.from([headers, ...rows].map(row => row.map(csvEscape).join(",")).join("\r\n"), "utf8")
          : buildOrderFormXlsx({
            customer,
            products: currentProducts,
            generatedAt: new Date(),
          });
        const safeName = displayName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || `customer-${customer.id}`;
        const filename = `${safeName}-Order-Form.${format}`;
        const detailBase = {
          send_id: sendId,
          recipient_email: String(customer.email).trim(),
          file_format: format,
          product_count: productIds.length,
          created_by_name: user.name || user.username || "Unknown",
        };
        await storage.createCrmAuditLog({
          user_id: Number(user.id),
          customer_id: customer.id,
          action: "order_form_send_pending",
          detail: { ...detailBase, status: "pending" },
        });
        try {
          await transporter.sendMail({
            from: smtpFrom,
            to: String(customer.email).trim(),
            subject: resolvedEmailTitle,
            text: resolvedEmailBody,
            html: escapeHtml(resolvedEmailBody).replace(/\r?\n/g, "<br />"),
            attachments: [{
              filename,
              content: fileBuffer,
              contentType: format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }],
          });
          const sentAt = new Date().toISOString();
          let marketingLog: any;
          try {
            marketingLog = await storage.createMarketingDeliveryLog({
              delivery_type: "order_form",
              customer_id: customer.id,
              source_key: `order-form:${sendId}`,
              recipient_email: String(customer.email).trim(),
              product_titles: currentProducts.map(product => String(product.name ?? "").trim()).filter(Boolean),
              sent_at: new Date(sentAt),
              initiated_by: Number(user.id),
            });
          } catch (logError: any) {
            console.error(`[marketing] delivery log failed for order form ${sendId}:`, logError?.message ?? logError);
          }
          await storage.createCrmAuditLog({
            user_id: Number(user.id),
            customer_id: customer.id,
            action: "order_form_sent",
            detail: { ...detailBase, status: "sent", sent_at: sentAt, marketing_log_id: marketingLog?.id ?? null, product_titles: currentProducts.map(product => String(product.name ?? "").trim()).filter(Boolean) },
          });
          results.push({ customer_id: customer.id, customer_name: displayName, email: customer.email, status: "sent", sent_at: sentAt });
        } catch (error: any) {
          const failureReason = String(error?.message || "Email send failed").slice(0, 500);
          await storage.createCrmAuditLog({
            user_id: Number(user.id),
            customer_id: customer.id,
            action: "order_form_send_failed",
            detail: { ...detailBase, status: "failed", failure_reason: failureReason },
          });
          results.push({ customer_id: customer.id, customer_name: displayName, email: customer.email, status: "failed", failure_reason: failureReason });
        }
      }
      res.json({ success: results.some(result => result.status === "sent"), results });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/marketing/customer-groups", requirePermission("marketing"), async (_req, res) => {
    try {
      const setting = await storage.getSetting("bigcommerce_config");
      const config = setting?.value
        ? (typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value)
        : {};
      const storeHash = config.storeHash || process.env.BC_STORE_HASH;
      const token = config.token || process.env.BC_TOKEN;
      if (!storeHash || !token) return res.status(400).json({ error: "BigCommerce is not configured" });

      const groups: Array<{ id: number; name: string }> = [];
      const pageSize = 250;
      for (let page = 1; ; page++) {
        const response = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v2/customer_groups?limit=${pageSize}&page=${page}`,
          { headers: { "X-Auth-Token": String(token), Accept: "application/json" } },
        );
        if (!response.ok) return res.status(502).json({ error: "BigCommerce customer groups could not be loaded" });
        const pageGroups = await response.json();
        if (!Array.isArray(pageGroups) || pageGroups.length === 0) break;
        for (const group of pageGroups) {
          const id = Number(group?.id);
          const name = String(group?.name ?? "").trim();
          if (Number.isInteger(id) && id > 0 && name) groups.push({ id, name });
        }
        if (pageGroups.length < pageSize) break;
      }
      groups.sort((a, b) => a.name.localeCompare(b.name));
      res.json(Array.from(new Map(groups.map(group => [group.id, group])).values()));
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Unable to load BigCommerce customer groups" });
    }
  });

  app.get("/api/marketing/campaigns", requirePermission("marketing"), async (req, res) => {
    try {
      const result = await storage.getMarketingCampaigns({
        search: String(req.query.search ?? ""),
        status: String(req.query.status ?? "all"),
        limit: Math.min(Number(req.query.limit ?? 50), 100),
        offset: Math.max(Number(req.query.offset ?? 0), 0),
      });
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/campaigns/:id", requirePermission("marketing"), async (req, res) => {
    try {
      const campaign = await storage.getMarketingCampaign(Number(req.params.id));
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      res.json(campaign);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/campaigns", requirePermission("marketing", "create"), async (req, res) => {
    try {
      const body = req.body ?? {};
      if (!String(body.name ?? "").trim()) return res.status(400).json({ error: "Campaign name is required" });
      const requestedStatus = String(body.status ?? "draft");
      if (!marketingStatuses.has(requestedStatus)) return res.status(400).json({ error: "Invalid campaign status" });
      if (requestedStatus !== "draft" && !(await marketingUserCan(req, "send"))) {
        return res.status(403).json({ error: "Sending permission is required to create a non-draft campaign" });
      }
      const audienceType = String(body.audience_type ?? "").trim();
      const audienceError = validateMarketingAudience(
        audienceType,
        body.audience_config,
        body.audience_id,
        body.customer_ids,
        requestedStatus !== "draft",
      );
      if (audienceError) return res.status(400).json({ error: audienceError });
      const campaign = await storage.createMarketingCampaign({
        name: String(body.name),
        internal_description: String(body.internal_description ?? ""),
        campaign_type: String(body.campaign_type ?? "email"),
        subject_line: String(body.subject_line ?? ""),
        preview_text: String(body.preview_text ?? ""),
         message_content: sanitizeMarketingEditorHtml(String(body.message_content ?? "")),
         sender_email: String(body.sender_email ?? "").trim(),
        audience_type: audienceType,
        audience_id: body.audience_id ? Number(body.audience_id) : null,
        audience_config: body.audience_config ?? {},
         product_snapshots: Array.isArray(body.product_snapshots) ? body.product_snapshots : [],
         product_display_options: normalizeMarketingProductDisplayOptions(body.product_display_options),
        scheduled_at: body.scheduled_at ? new Date(body.scheduled_at) : null,
         template_id: body.template_id ? Number(body.template_id) : null,
         timezone: String(body.timezone ?? "UTC"),
        created_by: getMarketingUserId(req),
        customer_ids: Array.isArray(body.customer_ids) ? body.customer_ids.map(Number).filter(Number.isInteger) : [],
      });
      res.status(201).json(campaign);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/marketing/campaigns/:id", requirePermission("marketing", "edit"), async (req, res) => {
    try {
      const body = req.body ?? {};
      const current = await storage.getMarketingCampaign(Number(req.params.id));
      if (!current) return res.status(404).json({ error: "Campaign not found" });
      const nextStatus = String(body.status ?? current.status);
      if (["ready", "scheduled", "queued", "sending", "sent"].includes(nextStatus)) {
        const audienceError = validateMarketingAudience(
          body.audience_type ?? current.audience_type,
          body.audience_config ?? current.audience_config,
          body.audience_id ?? current.audience_id,
          body.customer_ids ?? (current.recipients ?? []).map((recipient: any) => recipient.customer_id ?? recipient.id),
          true,
        );
        if (audienceError) return res.status(400).json({ error: audienceError });
      }
       const updateBody = body.message_content === undefined
         ? body
         : { ...body, message_content: sanitizeMarketingEditorHtml(String(body.message_content)) };
       const campaign = await storage.updateMarketingCampaign(Number(req.params.id), updateBody, getMarketingUserId(req));
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      res.json(campaign);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/marketing/campaigns/:id", requirePermission("marketing", "delete"), async (req, res) => {
    try {
      const campaign = await storage.getMarketingCampaign(Number(req.params.id));
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      if (campaign.status === "sent" || campaign.status === "sending") return res.status(409).json({ error: "Sent or sending campaigns cannot be deleted" });
      await storage.deleteMarketingCampaign(Number(req.params.id), getMarketingUserId(req));
      res.status(204).end();
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/campaigns/:id/status", requirePermission("marketing", "send"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const current = await storage.getMarketingCampaign(id);
      const next = String(req.body?.status ?? "");
      if (!current) return res.status(404).json({ error: "Campaign not found" });
      if (!marketingStatuses.has(next) || !allowedMarketingTransitions[current.status]?.includes(next)) {
        return res.status(409).json({ error: `Cannot move campaign from ${current.status} to ${next}` });
      }
      const audienceError = validateMarketingAudience(
        current.audience_type,
        current.audience_config,
        current.audience_id,
        (current.recipients ?? []).map((recipient: any) => recipient.customer_id ?? recipient.id),
        ["ready", "scheduled", "queued", "sending", "sent"].includes(next),
      );
      if (audienceError) return res.status(400).json({ error: audienceError });
      const campaign = await storage.updateMarketingCampaignStatus(id, next, getMarketingUserId(req));
      res.json(campaign);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/campaigns/:id/test-send", requirePermission("marketing", "send"), async (req, res) => {
    try {
      const email = String(req.body?.email ?? "").trim();
      if (!email) return res.status(400).json({ error: "A test email address is required" });
      const result = await sendMarketingTestEmail(Number(req.params.id), email);
      res.json({ ok: true, ...result });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/marketing/campaigns/:id/send", requirePermission("marketing", "send"), async (req, res) => {
    try {
      if (req.body?.confirm !== true) return res.status(400).json({ error: "Explicit confirmation is required before sending" });
      const id = Number(req.params.id);
      const campaign = await storage.getMarketingCampaign(id);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      if (!["ready", "failed", "paused"].includes(campaign.status)) return res.status(409).json({ error: `Campaign cannot be sent from ${campaign.status}` });
      const audienceError = validateMarketingAudience(
        campaign.audience_type,
        campaign.audience_config,
        campaign.audience_id,
        (campaign.recipients ?? []).map((recipient: any) => recipient.customer_id ?? recipient.id),
        true,
      );
      if (audienceError) return res.status(400).json({ error: audienceError });
      if (campaign.status === "failed") {
        await storage.resetMarketingFailedRecipients(id);
      }
      const queued = await storage.updateMarketingCampaignStatus(id, "queued", getMarketingUserId(req));
      void processMarketingCampaign(id, getMarketingUserId(req));
      res.json(queued);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/marketing/campaigns/:id/schedule", requirePermission("marketing", "send"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const when = new Date(String(req.body?.scheduled_at ?? ""));
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) return res.status(400).json({ error: "Choose a future schedule time" });
      const campaign = await storage.getMarketingCampaign(id);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      if (!["draft", "ready", "paused", "scheduled"].includes(campaign.status)) return res.status(409).json({ error: `Campaign cannot be scheduled from ${campaign.status}` });
      const audienceError = validateMarketingAudience(
        campaign.audience_type,
        campaign.audience_config,
        campaign.audience_id,
        (campaign.recipients ?? []).map((recipient: any) => recipient.customer_id ?? recipient.id),
        true,
      );
      if (audienceError) return res.status(400).json({ error: audienceError });
      const updated = await storage.updateMarketingCampaign(id, { scheduled_at: when, timezone: String(req.body?.timezone ?? "UTC") }, getMarketingUserId(req));
      if (campaign.status === "scheduled") {
        return res.json(updated);
      }
      const scheduled = await storage.updateMarketingCampaignStatus(id, "scheduled", getMarketingUserId(req));
      res.json(scheduled ?? updated);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/marketing/campaigns/:id/pause", requirePermission("marketing", "send"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const campaign = await storage.getMarketingCampaign(id);
      if (!campaign || !["scheduled", "queued", "sending"].includes(campaign.status)) return res.status(409).json({ error: "Only scheduled or active campaigns can be paused" });
      res.json(await storage.updateMarketingCampaignStatus(id, "paused", getMarketingUserId(req)));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/marketing/campaigns/:id/duplicate", requirePermission("marketing", "create"), async (req, res) => {
    try {
      const original = await storage.getMarketingCampaign(Number(req.params.id));
      if (!original) return res.status(404).json({ error: "Campaign not found" });
      const copy = await storage.createMarketingCampaign({
        name: `${original.name} (Copy)`, internal_description: original.internal_description, campaign_type: original.campaign_type,
        subject_line: original.subject_line, preview_text: original.preview_text, message_content: original.message_content,
         sender_email: original.sender_email ?? "",
        audience_type: original.audience_type, audience_id: original.audience_id, audience_config: original.audience_config,
         template_id: original.template_id,
         product_snapshots: Array.isArray(original.product_snapshots) ? original.product_snapshots : [],
         product_display_options: normalizeMarketingProductDisplayOptions(original.product_display_options),
         timezone: original.timezone, created_by: getMarketingUserId(req),
        customer_ids: (original.recipients ?? []).map((r: any) => Number(r.id)).filter(Number.isInteger),
      });
      res.status(201).json(copy);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/marketing/campaigns/:id/recipients", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingRecipients(Number(req.params.id), { status: String(req.query.status ?? "all"), limit: Math.min(Number(req.query.limit ?? 100), 200), offset: Math.max(Number(req.query.offset ?? 0), 0) })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/analytics", requirePermission("marketing", "view_analytics"), async (req, res) => {
    try { res.json(await storage.getMarketingAnalytics({ campaignId: req.query.campaignId ? Number(req.query.campaignId) : undefined, dateFrom: String(req.query.dateFrom ?? ""), dateTo: String(req.query.dateTo ?? "") })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/audiences", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingAudiences({ search: String(req.query.search ?? ""), type: String(req.query.type ?? "all") })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/audiences/:id", requirePermission("marketing"), async (req, res) => {
    try {
      const audience = await storage.getMarketingAudience(Number(req.params.id));
      if (!audience) return res.status(404).json({ error: "Audience not found" });
      res.json(audience);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/audiences", requirePermission("marketing", "manage_audiences"), async (req, res) => {
    try {
      const body = req.body ?? {};
      if (!String(body.name ?? "").trim()) return res.status(400).json({ error: "Audience name is required" });
      const type = String(body.audience_type ?? "manual");
      if (!["manual", "dynamic"].includes(type)) return res.status(400).json({ error: "Invalid audience type" });
      const audience = await storage.createMarketingAudience({
        name: String(body.name), description: String(body.description ?? ""), audience_type: type,
        dynamic_filters: body.dynamic_filters ?? {},
        customer_ids: Array.isArray(body.customer_ids) ? body.customer_ids.map(Number).filter(Number.isInteger) : [],
        contact_ids: Array.isArray(body.contact_ids) ? body.contact_ids.map(Number).filter(Number.isInteger) : [],
        created_by: getMarketingUserId(req),
      });
      res.status(201).json(audience);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/marketing/audiences/:id", requirePermission("marketing", "manage_audiences"), async (req, res) => {
    try {
      const audience = await storage.updateMarketingAudience(Number(req.params.id), req.body ?? {}, getMarketingUserId(req));
      if (!audience) return res.status(404).json({ error: "Audience not found" });
      res.json(audience);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/marketing/audiences/:id", requirePermission("marketing", "manage_audiences"), async (req, res) => {
    try {
      const campaignUse = await storage.getMarketingCampaigns({ limit: 1000 });
      if (campaignUse.campaigns.some(c => c.audience_id === Number(req.params.id))) {
        return res.status(409).json({ error: "This audience is used by a campaign and cannot be deleted" });
      }
      await storage.deleteMarketingAudience(Number(req.params.id), getMarketingUserId(req));
      res.status(204).end();
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/audience-customers", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingAudienceCustomers({ search: String(req.query.search ?? ""), limit: Math.min(Number(req.query.limit ?? 25), 100), offset: Math.max(Number(req.query.offset ?? 0), 0) })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/contacts", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingContacts({ search: String(req.query.search ?? ""), type: String(req.query.type ?? "all"), limit: Math.min(Number(req.query.limit ?? 25), 100), offset: Math.max(Number(req.query.offset ?? 0), 0) })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/contacts/import", requirePermission("marketing", "manage_audiences"), async (req, res) => {
    try {
      const type = String(req.body?.contact_type ?? "lead").toLowerCase();
      if (!["lead", "prospect"].includes(type)) return res.status(400).json({ error: "Contact type must be lead or prospect" });
      const csv = String(req.body?.csv ?? "");
      if (!csv.trim()) return res.status(400).json({ error: "Choose a CSV file to import" });
      const parsed = parseMarketingCsv(csv);
      const emailIndex = parsed.headers.indexOf("email");
      if (emailIndex < 0) return res.status(400).json({ error: "CSV must include an email column" });
      const seen = new Set<string>();
      const records: Array<{ email: string; first_name?: string; last_name?: string; company?: string; phone?: string; contact_type: string }> = [];
      let invalid = 0;
      for (const row of parsed.rows) {
        const value = (row[emailIndex] ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || seen.has(value)) { invalid++; continue; }
        seen.add(value);
        const valueFor = (names: string[]) => {
          const index = names.map(name => parsed.headers.indexOf(name)).find(index => index >= 0);
          return index === undefined ? "" : (row[index] ?? "").trim();
        };
        records.push({ email: value, first_name: valueFor(["first_name", "firstname", "given_name"]), last_name: valueFor(["last_name", "lastname", "surname"]), company: valueFor(["company", "organization", "business"]), phone: valueFor(["phone", "phone_number"]), contact_type: type });
      }
      const result = await storage.importMarketingContacts(records, getMarketingUserId(req));
      res.status(201).json({ ...result, invalid, total_rows: parsed.rows.length });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/marketing/audiences/:id/members", requirePermission("marketing"), async (req, res) => {
    try {
      res.json(await storage.getMarketingAudienceMembers(Number(req.params.id), {
        search: String(req.query.search ?? ""), source: String(req.query.source ?? "all"), status: String(req.query.status ?? "all"),
        limit: Math.min(Number(req.query.limit ?? 25), 100), offset: Math.max(Number(req.query.offset ?? 0), 0),
      }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/audience-preview", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingAudiencePreview(req.body?.filters ?? {}, Math.min(Number(req.body?.limit ?? 25), 100))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/marketing/templates", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingTemplates({ search: String(req.query.search ?? ""), category: String(req.query.category ?? "all"), includeArchived: req.query.includeArchived === "true" })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/templates", requirePermission("marketing", "manage_templates"), async (req, res) => {
    try {
      const key = `marketing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
       const template = await storage.upsertEmailTemplate(key, { name: String(req.body?.name ?? "").trim(), subject_template: String(req.body?.subject_template ?? ""), body: sanitizeMarketingEditorHtml(String(req.body?.body ?? "")), template_type: "marketing", category: String(req.body?.category ?? "general"), updated_by: getMarketingUserId(req) });
      res.status(201).json(template);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.patch("/api/marketing/templates/:id", requirePermission("marketing", "manage_templates"), async (req, res) => {
    try {
      const current = await storage.getMarketingTemplateById(Number(req.params.id));
      if (!current) return res.status(404).json({ error: "Template not found" });
       const template = await storage.upsertEmailTemplate(current.key, { name: String(req.body?.name ?? current.name), subject_template: String(req.body?.subject_template ?? current.subject_template), body: req.body?.body === undefined ? current.body : sanitizeMarketingEditorHtml(String(req.body.body)), template_type: "marketing", category: String(req.body?.category ?? current.category), is_active: req.body?.is_active ?? current.is_active, updated_by: getMarketingUserId(req) });
      res.json(template);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/marketing/templates/:id/archive", requirePermission("marketing", "manage_templates"), async (req, res) => {
    try { res.json(await storage.archiveMarketingTemplate(Number(req.params.id), getMarketingUserId(req), req.body?.archived !== false)); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/marketing/automations", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingAutomations({ status: String(req.query.status ?? "all"), search: String(req.query.search ?? "") })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/marketing/automations/:id", requirePermission("marketing"), async (req, res) => {
    try {
      const automation = await storage.getMarketingAutomation(Number(req.params.id));
      if (!automation) return res.status(404).json({ error: "Automation not found" });
      res.json({ ...automation, executions: await storage.getMarketingAutomationExecutions(automation.id) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/automations", requirePermission("marketing", "manage_automations"), async (req, res) => {
    try {
      const allowedTriggers = new Set(["customer_created", "customer_signup_completed", "audience_membership"]);
      if (!allowedTriggers.has(String(req.body?.trigger_type))) return res.status(400).json({ error: "Unsupported automation trigger" });
      const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
      if (!steps.length) return res.status(400).json({ error: "At least one automation step is required" });
      res.status(201).json(await storage.createMarketingAutomation({ name: String(req.body?.name ?? "").trim(), description: String(req.body?.description ?? ""), trigger_type: String(req.body.trigger_type), trigger_config: req.body?.trigger_config ?? {}, frequency_days: Math.max(0, Number(req.body?.frequency_days ?? 0)), created_by: getMarketingUserId(req), steps }));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.patch("/api/marketing/automations/:id", requirePermission("marketing", "manage_automations"), async (req, res) => {
    try { res.json(await storage.updateMarketingAutomation(Number(req.params.id), req.body ?? {}, getMarketingUserId(req))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.post("/api/marketing/automations/:id/status", requirePermission("marketing", "manage_automations"), async (req, res) => {
    try {
      const status = String(req.body?.status ?? "");
      if (!["draft", "active", "paused", "archived"].includes(status)) return res.status(400).json({ error: "Invalid automation status" });
      res.json(await storage.updateMarketingAutomationStatus(Number(req.params.id), status, getMarketingUserId(req)));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/marketing/customers/:id/preference", requirePermission("marketing"), async (req, res) => {
    try { res.json(await storage.getMarketingCustomerPreference(Number(req.params.id))); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/marketing/customers/:id/preference", requirePermission("marketing", "manage_suppressions"), async (req, res) => {
    try {
      const subscribed = Boolean(req.body?.email_subscribed);
      const preference = await storage.upsertMarketingCustomerPreference(Number(req.params.id), { email_subscribed: subscribed, userId: getMarketingUserId(req) });
      if (!subscribed) await storage.createMarketingSuppression({ customerId: Number(req.params.id), reason: String(req.body?.reason ?? "Unsubscribed by staff"), source: "manual", createdBy: getMarketingUserId(req) });
      res.json(preference);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get("/api/marketing/suppressions", requirePermission("marketing", "manage_suppressions"), async (req, res) => {
    try { res.json(await storage.getMarketingSuppressions(req.query.customerId ? Number(req.query.customerId) : undefined)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/marketing/suppressions", requirePermission("marketing", "manage_suppressions"), async (req, res) => {
    try {
      if (!String(req.body?.reason ?? "").trim()) return res.status(400).json({ error: "A suppression reason is required" });
      res.status(201).json(await storage.createMarketingSuppression({ customerId: Number(req.body?.customer_id), email: String(req.body?.email ?? ""), reason: String(req.body.reason), source: "manual", createdBy: getMarketingUserId(req) }));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.delete("/api/marketing/suppressions/:id", requirePermission("marketing", "manage_suppressions"), async (req, res) => {
    try { res.json(await storage.revokeMarketingSuppression(Number(req.params.id), getMarketingUserId(req), String(req.body?.detail ?? "Re-enabled by staff"))); }
    catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  // Public, signed product-click endpoint. It only redirects to a URL present in
  // the campaign snapshot, so the signed link cannot become an open redirect.
  app.get("/api/marketing/click/:token", async (req, res) => {
    try {
      const decoded = verifyMarketingClickToken(String(req.params.token));
      if (!decoded) return res.status(400).send("Invalid product link");
      const [campaign, recipient] = await Promise.all([
        storage.getMarketingCampaign(decoded.campaignId),
        storage.getMarketingRecipient(decoded.recipientId),
      ]);
      if (!campaign || !recipient || Number(recipient.campaign_id) !== decoded.campaignId) {
        return res.status(404).send("Product link not found");
      }
      const product = (Array.isArray(campaign.product_snapshots) ? campaign.product_snapshots : [])
        .find((candidate: any) => Number(candidate?.id ?? candidate?.bigcommerce_id) === decoded.productId);
      const targetUrl = String(product?.product_url ?? "").trim();
      if (!/^https?:\/\//i.test(targetUrl) || targetUrl !== decoded.targetUrl) {
        return res.status(404).send("Product link not found");
      }
      await storage.recordMarketingEvent({
        campaign_id: decoded.campaignId,
        recipient_id: decoded.recipientId,
        event_type: "clicked",
        detail: {
          product_id: decoded.productId,
          bigcommerce_id: Number(product?.bigcommerce_id ?? product?.id) || null,
        },
      });
      res.setHeader("Cache-Control", "no-store");
      return res.redirect(302, targetUrl);
    } catch (e: any) {
      return res.status(500).send("Unable to process product link");
    }
  });

  // Public, signed unsubscribe endpoint. It intentionally does not expose customer data.
  app.get("/api/marketing/unsubscribe/:token", async (req, res) => {
    try {
      const decoded = verifyMarketingUnsubscribeToken(String(req.params.token));
      if (!decoded) return res.status(400).send("<h1>Invalid unsubscribe link</h1>");
      if (decoded.entityType === "contact" && decoded.contactId) {
        await storage.deactivateMarketingContact(decoded.contactId);
        await storage.recordMarketingEvent({ campaign_id: decoded.campaignId, event_type: "unsubscribed", detail: { marketing_contact_id: decoded.contactId } });
      } else if (decoded.customerId) {
        await storage.upsertMarketingCustomerPreference(decoded.customerId, { email_subscribed: false });
        await storage.createMarketingSuppression({ customerId: decoded.customerId, reason: "Unsubscribed from marketing email", source: "unsubscribe" });
        await storage.recordMarketingEvent({ campaign_id: decoded.campaignId, event_type: "unsubscribed", detail: { customer_id: decoded.customerId } });
      }
      res.status(200).send("<!doctype html><html><body style=\"font-family:Arial;padding:48px;text-align:center\"><h1>You’re unsubscribed</h1><p>You will no longer receive marketing emails from Mid Atlantic Distribution.</p></body></html>");
    } catch (e: any) { res.status(500).send("Unable to process unsubscribe"); }
  });

  // The app already runs cron-based background work in this process. Keep a
  // small, idempotent marketing poller compatible with the single Render web service.
  const marketingQueueTimer = setInterval(() => void processMarketingQueue(), 30_000);
  marketingQueueTimer.unref?.();
  void processMarketingQueue();

  return httpServer;
}

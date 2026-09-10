 r = await fetch(
          `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/categories?limit=250&page=${pg}`,
          { headers },
        );
        if (!r.ok) break;
        const json = await r.json();
        const items = json.data ?? [];
        cats.push(...items.map((c: any) => ({ id: c.id, name: c.name, parent_id: c.parent_id })));
        if (items.length < 250) break;
        pg++;
      }
      cats.sort((a, b) => a.name.localeCompare(b.name));
      await storage.setSetting(cacheKey, { data: cats, ts: Date.now() });
      res.json(cats);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/reports/product-search — search local product catalog
  app.get("/api/reports/product-search", requirePermission("reporting_sales"), async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim();
      if (!q || q.length < 1) return res.json([]);

      // 1. Search the products catalog (by name and base SKU)
      const catalogResults = await storage.searchProductsForReport(q, 30);
      const productHits = catalogResults.map(p => ({
        id: p.id,
        bigcommerce_id: p.bigcommerce_id,
        name: p.name,
        sku: p.sku,
        brand_name: p.brand_name ?? "",
        match_type: "product" as const,
        variant_label: null as string | null,
      }));

      // 2. Also search bc_order_line_items for variant-level SKU matches and
      //    products not yet synced to the local products catalog.
      const lineItemHitsRaw = await storage.searchLineItemsByQuery(q, 40);

      const catalogBcIds = new Set(productHits.map(p => p.bigcommerce_id));
      const extraProducts: typeof productHits = [];
      const skuHits: Array<{
        id: number; bigcommerce_id: number; name: string; sku: string;
        brand_name: string; match_type: "sku"; variant_label: string | null;
      }> = [];
      const seenSkus = new Set<string>();

      for (const row of lineItemHitsRaw) {
        const bcId = row.bigcommerce_product_id;
        const sku = row.sku ?? "";
        const isSkuMatch = sku.toLowerCase().includes(q.toLowerCase());

        if (isSkuMatch && !seenSkus.has(sku)) {
          seenSkus.add(sku);
          skuHits.push({
            id: 0, bigcommerce_id: bcId,
            name: row.product_name ?? "",
            sku, brand_name: row.brand_name ?? "",
            match_type: "sku",
            variant_label: row.variant_label ?? null,
          });
        } else if (!isSkuMatch && !catalogBcIds.has(bcId)) {
          // Product found in line items only (not in catalog)
          catalogBcIds.add(bcId);
          extraProducts.push({
            id: 0, bigcommerce_id: bcId,
            name: row.product_name ?? "",
            sku, brand_name: row.brand_name ?? "",
            match_type: "product", variant_label: null,
          });
        }
      }

      res.json([...productHits, ...extraProducts, ...skuHits].slice(0, 50));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ─── BC API helpers: fetch product IDs by brand/category (cached 1h) ────────

  async function fetchBcProductIdsByBrand(brandId: number): Promise<Set<number>> {
    const cacheKey = `report_brand_pids_${brandId}`;
    const cached = await storage.getSetting(cacheKey);
    if (cached?.value) {
      const { ids: cachedIds, ts } = cached.value as any;
      if (Date.now() - ts < 3600_000) return new Set<number>(cachedIds);
    }
    const { storeHash, headers } = await getBcCreds();
    const ids: number[] = [];
    let pg = 1;
    while (true) {
      const r = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?brand_id=${brandId}&include_fields=id&limit=250&page=${pg}`,
        { headers },
      );
      if (!r.ok) break;
      const json = await r.json();
      const items: any[] = json.data ?? [];
      items.forEach((p: any) => ids.push(p.id));
      if (items.length < 250) break;
      pg++;
    }
    await storage.setSetting(cacheKey, { ids, ts: Date.now() });
    return new Set<number>(ids);
  }

  async function fetchBcProductIdsByCategory(catId: number): Promise<Set<number>> {
    const cacheKey = `report_cat_pids_${catId}`;
    const cached = await storage.getSetting(cacheKey);
    if (cached?.value) {
      const { ids: cachedIds, ts } = cached.value as any;
      if (Date.now() - ts < 3600_000) return new Set<number>(cachedIds);
    }
    const { storeHash, headers } = await getBcCreds();
    const ids: number[] = [];
    let pg = 1;
    while (true) {
      const r = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v3/catalog/products?categories:in=${catId}&include_fields=id&limit=250&page=${pg}`,
        { headers },
      );
      if (!r.ok) break;
      const json = await r.json();
      const items: any[] = json.data ?? [];
      items.forEach((p: any) => ids.push(p.id));
      if (items.length < 250) break;
      pg++;
    }
    await storage.setSetting(cacheKey, { ids, ts: Date.now() });
    return new Set<number>(ids);
  }

  // ─── Resolve brand+category → product ID set ─────────────────────────────

  async function resolveReportProductIds(opts: {
    brandId?: string;
    categoryIdsRaw?: string;
    bcProductIdsRaw?: string;
  }): Promise<number[] | undefined> {
    const { brandId, categoryIdsRaw, bcProductIdsRaw } = opts;
    const hasBrand = !!(brandId && brandId !== "");
    const catIds = (categoryIdsRaw ?? "").split(",").map(Number).filter(Boolean);
    const hasCategory = catIds.length > 0;
    const hasIndividual = !!bcProductIdsRaw;

    if (!hasBrand && !hasCategory && !hasIndividual) return undefined; // no filter at all

    let brandSet: Set<number> | null = null;
    let catSet: Set<number> | null = null;

    if (hasBrand) {
      brandSet = await fetchBcProductIdsByBrand(parseInt(brandId!));
    }

    if (hasCategory) {
      catSet = new Set<number>();
      for (const cid of catIds) {
        const s = await fetchBcProductIdsByCategory(cid);
        s.forEach(id => catSet!.add(id));
      }
    }

    let resolved: Set<number>;

    if (brandSet && catSet) {
      // Intersection: must be in brand AND in selected categories
      resolved = new Set<number>([...brandSet].filter(id => catSet!.has(id)));
    } else if (brandSet) {
      resolved = brandSet;
    } else if (catSet) {
      resolved = catSet;
    } else {
      resolved = new Set<number>();
    }

    // Add individually-selected products (only when not selectAll)
    if (hasIndividual) {
      bcProductIdsRaw!.split(",").map(Number).filter(Boolean).forEach(id => resolved.add(id));
    }

    return [...resolved];
  }

  // GET /api/reports/sales — BC-mirror-based Sales Report
  app.get("/api/reports/sales", requirePermission("reporting_sales"), async (req, res) => {
    try {
      const {
        view = "summary",
        dateFrom,
        dateTo,
        brandId,
        categoryIds: categoryIdsRaw,
        bcProductIds: bcProductIdsRaw,
        selectAll,
        skuFilter,
        bcStatusFilter,
        sortBy = "qty_sold",
        sortDir = "desc",
      } = req.query as Record<string, string>;
      const page = Math.max(0, parseInt(String(req.query.page ?? "0")));
      // Allow up to 50 000 rows for export calls (client sends limit=10000)
      const limit = Math.min(parseInt(String(req.query.limit ?? "20")), 50000);

      const resolvedIds = await resolveReportProductIds({ brandId, categoryIdsRaw, bcProductIdsRaw });

      const opts = {
        dateFrom, dateTo, bcProductIds: resolvedIds,
        skuFilter: skuFilter || undefined,
        bcStatusFilter: bcStatusFilter || undefined,
        page, limit, sortBy, sortDir,
      };
      const [result, totalLineItems] = await Promise.all([
        view === "summary"
          ? storage.getSalesReportSummary(opts)
          : storage.getSalesReportDetails(opts),
        storage.getBcOrderLineItemsCount(),
      ]);

      const noData = totalLineItems === 0;
      res.json({ ...result, noData });
    } catch (e: any) {
      console.error("[Sales Report] Error:", e.message, e.stack);
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/reports/sales/stats — aggregate stats for the report sidebar
  app.get("/api/reports/sales/stats", requirePermission("reporting_sales"), async (req, res) => {
    try {
      const { dateFrom, dateTo, brandId, categoryIds: categoryIdsRaw, bcProductIds: raw, skuFilter, bcStatusFilter } = req.query as Record<string, string>;

      const resolvedIds = await resolveReportProductIds({ brandId, categoryIdsRaw, bcProductIdsRaw: raw });

      const stats = await storage.getSalesReportStats({
        dateFrom, dateTo, bcProductIds: resolvedIds,
        skuFilter: skuFilter || undefined,
        bcStatusFilter: bcStatusFilter || undefined,
      });
      res.json({ ...stats, dateFrom, dateTo });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── SKUVault Settings ──────────────────────────────────────────────────────

  app.get("/api/settings/skuvault", requireAuth, async (_req, res) => {
    try {
      const setting = await storage.getSetting("skuvault_config");
      const cfg = setting?.value ? (typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value) : {};
      // Never expose tokens — mask them
      res.json({
        tenantToken: cfg.tenantToken ? "••••••••" : "",
        userToken: cfg.userToken ? "••••••••" : "",
        warehouseId: cfg.warehouseId ?? null,
        warehouseLocation: cfg.warehouseLocation || "GENERAL",
        reasons: Array.isArray(cfg.reasons) ? cfg.reasons : [],
        hasCredentials: !!(cfg.tenantToken && cfg.userToken),
        lastTestedAt: cfg.lastTestedAt || null,
        lastTestOk: cfg.lastTestOk ?? null,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/settings/skuvault", requireAuth, async (req, res) => {
    try {
      const { tenantToken, userToken, warehouseId, warehouseLocation, reasons } = req.body as { tenantToken?: string; userToken?: string; warehouseId?: number; warehouseLocation?: string; reasons?: string[] };
      const existing = await storage.getSetting("skuvault_config");
      const current = existing?.value ? (typeof existing.value === "string" ? JSON.parse(existing.value) : existing.value) : {};
      const updated: Record<string, any> = { ...current };
      // Only update if the incoming value is not the masked placeholder
      if (tenantToken && tenantToken !== "••••••••") updated.tenantToken = tenantToken;
      if (userToken && userToken !== "••••••••") updated.userToken = userToken;
      if (warehouseId !== undefined && warehouseId !== null) updated.warehouseId = Number(warehouseId);
      if (warehouseLocation !== undefined) updated.warehouseLocation = warehouseLocation || "GENERAL";
      if (reasons !== undefined) updated.reasons = Array.isArray(reasons) ? reasons.filter((r) => r.trim()) : [];
      await storage.setSetting("skuvault_config", updated);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/settings/skuvault/test", requireAuth, async (_req, res) => {
    try {
      const setting = await storage.getSetting("skuvault_config");
      const cfg = setting?.value ? (typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value) : {};
      if (!cfg.tenantToken || !cfg.userToken) return res.status(400).json({ ok: false, message: "SKUVault credentials not configured." });
      const result = await testSkuVaultConnection({ tenantToken: cfg.tenantToken, userToken: cfg.userToken, warehouseId: cfg.warehouseId ?? 0, warehouseLocation: cfg.warehouseLocation });
      // Persist test result
      await storage.setSetting("skuvault_config", { ...cfg, lastTestedAt: new Date().toISOString(), lastTestOk: result.ok });
      res.json(result);
    } catch (e: any) { res.status(500).json({ ok: false, message: e.message }); }
  });

  // ── Inventory Audit Queue ──────────────────────────────────────────────────

  app.get("/api/inventory/audit/kpis", requireAuth, async (_req, res) => {
    try {
      const kpis = await storage.getAuditKPIs();
      res.json(kpis);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/inventory/audit", requireAuth, async (req, res) => {
    try {
      const page = Math.max(0, parseInt(String(req.query.page ?? "0")));
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "10"))));
      const search = (req.query.search as string) || undefined;
      const status = (req.query.status as string) || "pending";
      const source = (req.query.source as string) || undefined;
      const dateFrom = (req.query.dateFrom as string) || undefined;
      const dateTo = (req.query.dateTo as string) || undefined;
      const result = await storage.getAuditQueue({ page, limit, search, status, source, dateFrom, dateTo });
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Live SKUVault on-hand + pending quantities for a list of SKUs
  app.post("/api/inventory/skuvault-live-qty", requireAuth, async (req, res) => {
    try {
      const { skus } = req.body as { skus?: string[] };
      if (!Array.isArray(skus) || skus.length === 0) return res.json({});
      const svSetting = await storage.getSetting("skuvault_config");
      const svCfg = svSetting?.value ? (typeof svSetting.value === "string" ? JSON.parse(svSetting.value) : svSetting.value) : null;
      if (!svCfg?.tenantToken || !svCfg?.userToken) return res.status(503).json({ error: "SKUVault not configured" });
      const cfg: SkuVaultConfig = { tenantToken: svCfg.tenantToken, userToken: svCfg.userToken, warehouseId: svCfg.warehouseId ?? 0, warehouseLocation: svCfg.warehouseLocation };
      const qty = await getLiveSkuQuantities(cfg, skus);
      res.json(qty);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/inventory/audit/product/:productId/tasks", requireAuth, async (req, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const status = (req.query.status as string) || undefined;
      const tasks = await storage.getAuditTasksForProduct(productId, status);
      // Enrich with completed_by_name
      const completedByIds = [...new Set(tasks.map((t) => t.completed_by).filter(Boolean))] as number[];
      let nameMap: Record<number, string> = {};
      if (completedByIds.length > 0) {
        const userRows = await storage.getUsersByIds(completedByIds);
        for (const u of userRows) nameMap[u.id] = u.name;
      }
      const enriched = tasks.map((t) => ({
        ...t,
        completed_by_name: t.completed_by ? (nameMap[t.completed_by] ?? null) : null,
      }));
      res.json(enriched);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/inventory/audit/tasks/:id", requireAuth, async (req, res) => {
    try {
      const task = await storage.getAuditTask(parseInt(req.params.id));
      if (!task) return res.status(404).json({ error: "Task not found" });
      res.json(task);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/inventory/audit/tasks/:id/complete", requireAuth, async (req, res) => {
    try {
      const authUser = (req as any).authUser;
      const id = parseInt(req.params.id);
      const { physical_qty, reason, notes } = req.body as { physical_qty: number; reason: string; notes?: string };
      if (physical_qty === undefined || physical_qty < 0) return res.status(400).json({ error: "physical_qty must be >= 0" });
      if (!reason) return res.status(400).json({ error: "reason is required" });

      const task = await storage.getAuditTask(id);
      if (!task) return res.status(404).json({ error: "Task not found" });

      const variance = physical_qty - (task.system_qty ?? 0);

      // Fetch SKUVault config
      const svSetting = await storage.getSetting("skuvault_config");
      const svCfg = svSetting?.value ? (typeof svSetting.value === "string" ? JSON.parse(svSetting.value) : svSetting.value) : null;
      if (!svCfg?.tenantToken || !svCfg?.userToken) {
        return res.status(400).json({ error: "SKUVault credentials not configured." });
      }

      // Get fresh system qty from SKUVault before completing
      let freshSystemQty = task.system_qty ?? 0;
      let qtyWarning: string | null = null;
      try {
        const svGet = await getSkuVaultInventory({ tenantToken: svCfg.tenantToken, userToken: svCfg.userToken, warehouseId: svCfg.warehouseId ?? 0, warehouseLocation: svCfg.warehouseLocation }, [task.sku]);
        // Items is a SKU-keyed dictionary: { [sku]: SvLocationEntry[] }
        const skuEntries = svGet.Items?.[task.sku];
        if (Array.isArray(skuEntries) && skuEntries.length > 0) {
          // Sum across all bins for an accurate total-stock warning
          freshSystemQty = skuEntries.reduce(
            (sum, e) => sum + (e.QuantityAvailable ?? e.QuantityOnHand ?? e.Quantity ?? 0), 0
          );
        }
        if (freshSystemQty !== (task.system_qty ?? 0)) {
          qtyWarning = `SKUVault quantity changed since task creation (was ${task.system_qty}, now ${freshSystemQty}).`;
        }
      } catch { /* Use stored qty if fetch fails */ }

      // Set inventory in SKUVault to the physical count
      const svSet = await setSkuVaultInventory(
        { tenantToken: svCfg.tenantToken, userToken: svCfg.userToken, warehouseId: svCfg.warehouseId ?? 0, warehouseLocation: svCfg.warehouseLocation || "GENERAL" },
        [{ sku: task.sku, quantity: physical_qty }],
        reason || "Inventory Audit - SalesApp"
      );

      const svErrors = (svSet.Errors ?? []).filter((e: any) => e.Sku === task.sku);
      if (svErrors.length > 0) {
        return res.status(502).json({ error: `SKUVault rejected the adjustment: ${svErrors[0].ErrorMessages?.join("; ")}` });
      }

      const resolvedAuditLocation = svSet.ResolvedLocations?.[task.sku] || null;

      const completed = await storage.completeAuditTask(id, {
        physical_qty, variance, reason, notes,
        completed_by: authUser.id,
        skuvault_result: svSet,
        skuvault_location: resolvedAuditLocation,
      });
      res.json({ ...completed, warning: qtyWarning });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/inventory/audit/tasks/batch-complete", requireAuth, async (req, res) => {
    try {
      const authUser = (req as any).authUser;
      const { items, reason, notes } = req.body as {
        items: { id: number; physical_qty: number; variance: number }[];
        reason: string;
        notes?: string;
      };
      if (!items?.length) return res.status(400).json({ error: "items array is required" });
      if (!reason) return res.status(400).json({ error: "reason is required" });

      const svSetting = await storage.getSetting("skuvault_config");
      const svCfg = svSetting?.value ? (typeof svSetting.value === "string" ? JSON.parse(svSetting.value) : svSetting.value) : null;
      if (!svCfg?.tenantToken || !svCfg?.userToken) return res.status(400).json({ error: "SKUVault credentials not configured." });

      // Fetch all tasks
      const tasks = await Promise.all(items.map((i) => storage.getAuditTask(i.id)));

      // Build SKUVault set payload
      const svItems = items.map((item, idx) => ({ sku: tasks[idx]?.sku ?? "", quantity: item.physical_qty }))
        .filter((i) => i.sku);
      const svSet = await setSkuVaultInventory(
        { tenantToken: svCfg.tenantToken, userToken: svCfg.userToken, warehouseId: svCfg.warehouseId ?? 0, warehouseLocation: svCfg.warehouseLocation || "GENERAL" },
        svItems,
        reason || "Inventory Audit - SalesApp"
      );
      const svErrorsBySku: Record<string, string> = {};
      for (const e of svSet.Errors ?? []) {
        svErrorsBySku[e.Sku] = e.ErrorMessages?.join("; ") || "Unknown error";
      }

      const results: { id: number; sku: string; success: boolean; error?: string }[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const task = tasks[i];
        const sku = task?.sku ?? "";
        if (svErrorsBySku[sku]) {
          await storage.failAuditTask(item.id);
          results.push({ id: item.id, sku, success: false, error: svErrorsBySku[sku] });
        } else {
          await storage.completeAuditTask(item.id, {
            physical_qty: item.physical_qty,
            variance: item.variance,
            reason, notes,
            completed_by: authUser.id,
            skuvault_result: svSet,
            skuvault_location: svSet.ResolvedLocations?.[sku] || null,
          });
          results.push({ id: item.id, sku, success: true });
        }
      }
      res.json({ results });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/reports/recent-exports — last N report export log entries
  app.get("/api/reports/recent-exports", requireAuth, async (req, res) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "5")), 20);
      const rows = await storage.getRecentExportLogs(limit);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/reports/export-log — Audit log for every CSV/Excel export
  app.post("/api/reports/export-log", requireAuth, async (req, res) => {
    try {
      const authUser = (req as any).authUser;
      const { report_name, view_name, filters, export_type, row_count } = req.body;
      // Always use the server-side authenticated user — never trust client-supplied identity
      await storage.logReportExport({
        user_id: authUser.id,
        user_name: authUser.name ?? authUser.username ?? "",
        report_name: String(report_name ?? ""),
        view_name: String(view_name ?? ""),
        filters: filters ?? {},
        export_type: String(export_type ?? "csv"),
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
        };
      });
      res.json(products);
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
      void processMarketingCampaign(id);
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

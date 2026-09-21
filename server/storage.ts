eator_name: rows[0].creator_name,
      member_count: count,
      members: members.rows,
      member_customer_ids: memberIds.flatMap(member => member.customer_id ? [member.customer_id] : []),
      member_contact_ids: memberIds.flatMap(member => member.contact_id ? [member.contact_id] : []),
    };
  }

  async createMarketingAudience(data: { name: string; description?: string; audience_type: string; dynamic_filters?: Record<string, unknown>; customer_ids?: number[]; contact_ids?: number[]; created_by: number }): Promise<any> {
    const audience = await db.transaction(async tx => {
      const [created] = await tx.insert(marketingAudiences).values({
        name: data.name.trim(), description: data.description ?? "", audience_type: data.audience_type,
        dynamic_filters: data.dynamic_filters ?? {}, created_by: data.created_by,
      }).returning();
      const customerIds = Array.from(new Set((data.customer_ids ?? []).filter(Number.isInteger)));
      const contactIds = Array.from(new Set((data.contact_ids ?? []).filter(Number.isInteger)));
      if (customerIds.length || contactIds.length) {
        await tx.insert(marketingAudienceMembers).values([
          ...customerIds.map(customer_id => ({ audience_id: created.id, customer_id })),
          ...contactIds.map(marketing_contact_id => ({ audience_id: created.id, marketing_contact_id })),
        ]);
      }
      return created;
    });
    return this.getMarketingAudience(audience.id);
  }

  async updateMarketingAudience(id: number, data: { name?: string; description?: string; audience_type?: string; dynamic_filters?: Record<string, unknown>; customer_ids?: number[]; contact_ids?: number[] }, userId: number): Promise<any | undefined> {
    const update: Record<string, unknown> = { updated_at: new Date() };
    for (const key of ["name", "description", "audience_type", "dynamic_filters"] as const) if (data[key] !== undefined) update[key] = data[key];
    const [updated] = await db.update(marketingAudiences).set(update as any).where(eq(marketingAudiences.id, id)).returning();
    if (!updated) return undefined;
    if (data.customer_ids || data.contact_ids) {
      await db.delete(marketingAudienceMembers).where(eq(marketingAudienceMembers.audience_id, id));
      const customerIds = Array.from(new Set((data.customer_ids ?? []).filter(Number.isInteger)));
      const contactIds = Array.from(new Set((data.contact_ids ?? []).filter(Number.isInteger)));
      if (customerIds.length || contactIds.length) {
        await db.insert(marketingAudienceMembers).values([
          ...customerIds.map(customer_id => ({ audience_id: id, customer_id })),
          ...contactIds.map(marketing_contact_id => ({ audience_id: id, marketing_contact_id })),
        ]);
      }
    }
    return this.getMarketingAudience(id);
  }

  async deleteMarketingAudience(id: number, _userId: number): Promise<void> {
    await db.delete(marketingAudiences).where(eq(marketingAudiences.id, id));
  }

  async getMarketingAudienceCustomers(opts: { search?: string; limit?: number; offset?: number } = {}): Promise<{ rows: any[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const conditions: any[] = [eq(customersMirror.is_active, true), eq(customersMirror.account_type, "customer")];
    if (opts.search?.trim()) {
      const term = `%${opts.search.trim()}%`;
      conditions.push(or(ilike(customersMirror.company, term), ilike(customersMirror.first_name, term), ilike(customersMirror.last_name, term), ilike(customersMirror.email, term)));
    }
    const where = and(...conditions);
    const [rows, countRows] = await Promise.all([db.select({
      id: customersMirror.id, company: customersMirror.company, first_name: customersMirror.first_name,
      last_name: customersMirror.last_name, email: customersMirror.email, customer_group_name: customersMirror.customer_group_name,
    }).from(customersMirror).where(where).orderBy(asc(customersMirror.company), asc(customersMirror.last_name)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(customersMirror).where(where)]);
    return { rows, total: countRows[0]?.count ?? 0, limit, offset };
  }

  async getMarketingContacts(opts: { search?: string; type?: string; limit?: number; offset?: number } = {}): Promise<{ rows: any[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const conditions: any[] = [eq(marketingContacts.is_active, true)];
    if (opts.type && opts.type !== "all") conditions.push(eq(marketingContacts.contact_type, opts.type));
    if (opts.search?.trim()) {
      const term = `%${opts.search.trim()}%`;
      conditions.push(or(ilike(marketingContacts.email, term), ilike(marketingContacts.company, term), ilike(marketingContacts.first_name, term), ilike(marketingContacts.last_name, term)));
    }
    const where = and(...conditions);
    const [rows, countRows] = await Promise.all([
      db.select().from(marketingContacts).where(where).orderBy(asc(marketingContacts.company), asc(marketingContacts.last_name), asc(marketingContacts.email)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(marketingContacts).where(where),
    ]);
    return { rows, total: countRows[0]?.count ?? 0, limit, offset };
  }

  async importMarketingContacts(records: Array<{ email: string; first_name?: string; last_name?: string; company?: string; phone?: string; contact_type: string }>, userId: number): Promise<{ imported: number; duplicates: number }> {
    let imported = 0;
    for (const record of records) {
      const [row] = await db.insert(marketingContacts).values({
        email: record.email.trim().toLowerCase(),
        first_name: String(record.first_name ?? "").trim(),
        last_name: String(record.last_name ?? "").trim(),
        company: String(record.company ?? "").trim() || null,
        phone: String(record.phone ?? "").trim() || null,
        contact_type: record.contact_type,
        created_by: userId,
      }).onConflictDoNothing({ target: marketingContacts.email }).returning({ id: marketingContacts.id });
      if (row) imported++;
    }
    return { imported, duplicates: records.length - imported };
  }

  async deactivateMarketingContact(id: number): Promise<void> {
    await db.update(marketingContacts).set({ is_active: false, updated_at: new Date() }).where(eq(marketingContacts.id, id));
  }

  async getMarketingAudienceMembers(audienceId: number, opts: { search?: string; source?: string; status?: string; limit?: number; offset?: number } = {}): Promise<{ rows: any[]; total: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const sourceExpr = sql<string>`case when ${marketingAudienceMembers.marketing_contact_id} is not null then 'imported' else 'crm' end`;
    const statusExpr = sql<string>`case
      when ${marketingAudienceMembers.marketing_contact_id} is not null and ${marketingContacts.is_active} = false then 'inactive'
      when ${marketingAudienceMembers.customer_id} is not null and (
        coalesce(${marketingCustomerPreferences.email_subscribed}, true) = false
        or exists (select 1 from marketing_suppressions ms where ms.customer_id = ${marketingAudienceMembers.customer_id} and ms.revoked_at is null)
      ) then 'suppressed'
      else 'eligible' end`;
    const conditions: any[] = [eq(marketingAudienceMembers.audience_id, audienceId)];
    if (opts.source && opts.source !== "all") conditions.push(sql`${sourceExpr} = ${opts.source}`);
    if (opts.status && opts.status !== "all") conditions.push(sql`${statusExpr} = ${opts.status}`);
    if (opts.search?.trim()) {
      const term = `%${opts.search.trim()}%`;
      conditions.push(or(
        ilike(customersMirror.company, term), ilike(customersMirror.first_name, term), ilike(customersMirror.last_name, term), ilike(customersMirror.email, term),
        ilike(marketingContacts.company, term), ilike(marketingContacts.first_name, term), ilike(marketingContacts.last_name, term), ilike(marketingContacts.email, term),
      ));
    }
    const where = and(...conditions);
    const selectShape = {
      member_id: marketingAudienceMembers.id,
      customer_id: marketingAudienceMembers.customer_id,
      contact_id: marketingAudienceMembers.marketing_contact_id,
      company: sql<string>`coalesce(${customersMirror.company}, ${marketingContacts.company})`,
      first_name: sql<string>`coalesce(${customersMirror.first_name}, ${marketingContacts.first_name})`,
      last_name: sql<string>`coalesce(${customersMirror.last_name}, ${marketingContacts.last_name})`,
      email: sql<string>`coalesce(${customersMirror.email}, ${marketingContacts.email})`,
      source: sourceExpr,
      status: statusExpr,
      contact_type: marketingContacts.contact_type,
    };
    const [rows, countRows] = await Promise.all([
      db.select(selectShape).from(marketingAudienceMembers)
        .leftJoin(customersMirror, eq(customersMirror.id, marketingAudienceMembers.customer_id))
        .leftJoin(marketingContacts, eq(marketingContacts.id, marketingAudienceMembers.marketing_contact_id))
        .leftJoin(marketingCustomerPreferences, eq(marketingCustomerPreferences.customer_id, marketingAudienceMembers.customer_id))
        .where(where).orderBy(asc(sql`coalesce(${customersMirror.company}, ${marketingContacts.company})`), asc(sql`coalesce(${customersMirror.email}, ${marketingContacts.email})`)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(marketingAudienceMembers)
        .leftJoin(customersMirror, eq(customersMirror.id, marketingAudienceMembers.customer_id))
        .leftJoin(marketingContacts, eq(marketingContacts.id, marketingAudienceMembers.marketing_contact_id))
        .leftJoin(marketingCustomerPreferences, eq(marketingCustomerPreferences.customer_id, marketingAudienceMembers.customer_id))
        .where(where),
    ]);
    return { rows, total: countRows[0]?.count ?? 0 };
  }

  async getMarketingTemplates(opts: { search?: string; category?: string; includeArchived?: boolean } = {}): Promise<EmailTemplate[]> {
    const conditions: any[] = [eq(emailTemplates.template_type, "marketing")];
    if (!opts.includeArchived) conditions.push(isNull(emailTemplates.archived_at));
    if (opts.category && opts.category !== "all") conditions.push(eq(emailTemplates.category, opts.category));
    if (opts.search?.trim()) {
      const term = `%${opts.search.trim()}%`;
      conditions.push(or(ilike(emailTemplates.name, term), ilike(emailTemplates.key, term)));
    }
    return db.select().from(emailTemplates).where(and(...conditions)).orderBy(desc(emailTemplates.updated_at));
  }

  async getMarketingTemplateById(id: number): Promise<EmailTemplate | undefined> {
    const [template] = await db.select().from(emailTemplates).where(and(eq(emailTemplates.id, id), eq(emailTemplates.template_type, "marketing"))).limit(1);
    return template;
  }

  async archiveMarketingTemplate(id: number, userId: number, archived: boolean): Promise<EmailTemplate | undefined> {
    const [template] = await db.update(emailTemplates).set({
      archived_at: archived ? new Date() : null,
      is_active: !archived,
      updated_by: userId,
      updated_at: new Date(),
    }).where(and(eq(emailTemplates.id, id), eq(emailTemplates.template_type, "marketing"))).returning();
    return template;
  }

  private async getMarketingCandidateCustomers(filters: Record<string, unknown> = {}, limit = 100000): Promise<any[]> {
    const normalized = { ...filters };
    if (normalized.lastOrderBefore && !normalized.lastOrderTo) normalized.lastOrderTo = normalized.lastOrderBefore;
    if (normalized.lastOrderAfter && !normalized.lastOrderFrom) normalized.lastOrderFrom = normalized.lastOrderAfter;
    if (typeof normalized.isActive === "string") normalized.isActive = normalized.isActive === "true" || normalized.isActive === "active";
    if (normalized.accountStatus && normalized.isActive === undefined) normalized.isActive = normalized.accountStatus === "active";
    const rawAccountTypes = Array.isArray(normalized.accountTypes)
      ? normalized.accountTypes
      : typeof normalized.accountTypes === "string"
        ? [normalized.accountTypes]
        : normalized.accountType
          ? [normalized.accountType]
          : [];
    normalized.accountTypes = Array.from(new Set(rawAccountTypes
      .map(value => String(value).trim().toLowerCase())
      .filter(value => ["customer", "vendor", "internal"].includes(value))));
    const preference = typeof normalized.marketingPreference === "string"
      ? normalized.marketingPreference.trim().toLowerCase()
      : "";
    filters = normalized;
    const accountTypes = normalized.accountTypes as string[];
    const conditions: any[] = [
      accountTypes.length
        ? inArray(customersMirror.account_type, accountTypes)
        : eq(customersMirror.account_type, "customer"),
    ];
    if (typeof filters.isActive === "boolean") conditions.push(eq(customersMirror.is_active, filters.isActive));
    else conditions.push(eq(customersMirror.is_active, true));
    const addText = (column: any, key: string) => {
      if (typeof filters[key] === "string" && String(filters[key]).trim()) conditions.push(eq(column, String(filters[key]).trim()));
    };
    addText(customersMirror.customer_group_name, "customerGroup");
    addText(customersMirror.customer_type, "customerType");
    addText(customersMirror.account_health, "accountHealth");
    if (preference === "subscribed") {
      conditions.push(sql`coalesce((select mcp.email_subscribed from marketing_customer_preferences mcp where mcp.customer_id = ${customersMirror.id} limit 1), true) = true`);
    } else if (preference === "unsubscribed") {
      conditions.push(sql`coalesce((select mcp.email_subscribed from marketing_customer_preferences mcp where mcp.customer_id = ${customersMirror.id} limit 1), true) = false`);
    }
    if (typeof filters.primaryRepId === "number" && filters.primaryRepId > 0) conditions.push(eq(customersMirror.primary_rep_id, filters.primaryRepId));
    if (typeof filters.secondaryRepId === "number" && filters.secondaryRepId > 0) conditions.push(eq(customersMirror.secondary_rep_id, filters.secondaryRepId));
    if (typeof filters.repId === "number" && filters.repId > 0) conditions.push(eq(customersMirror.primary_rep_id, filters.repId));
    const dateRange = (column: any, fromKey: string, toKey: string) => {
      if (typeof filters[fromKey] === "string" && filters[fromKey]) conditions.push(sql`${column} >= ${filters[fromKey]}::timestamptz`);
      if (typeof filters[toKey] === "string" && filters[toKey]) conditions.push(sql`${column} < ${filters[toKey]}::timestamptz + interval '1 day'`);
    };
    dateRange(customersMirror.created_date, "createdFrom", "createdTo");
    dateRange(customersMirror.last_order_date, "lastOrderFrom", "lastOrderTo");
    if (typeof filters.minOrders === "number") conditions.push(gte(customersMirror.lifetime_orders, filters.minOrders));
    if (typeof filters.maxOrders === "number") conditions.push(sql`${customersMirror.lifetime_orders} <= ${filters.maxOrders}`);
    if (typeof filters.minRevenue === "number") conditions.push(sql`${customersMirror.lifetime_revenue} >= ${filters.minRevenue}`);
    if (typeof filters.maxRevenue === "number") conditions.push(sql`${customersMirror.lifetime_revenue} <= ${filters.maxRevenue}`);
    if (typeof filters.minStoreCredit === "number") conditions.push(sql`${customersMirror.store_credit_balance} >= ${filters.minStoreCredit}`);
    if (typeof filters.maxStoreCredit === "number") conditions.push(sql`${customersMirror.store_credit_balance} <= ${filters.maxStoreCredit}`);
    if (typeof filters.state === "string" && filters.state.trim()) {
      const selectedState = filters.state.trim();
      const stateCode = selectedState.toUpperCase();
      const stateName = MARKETING_US_STATE_NAMES[stateCode];
      const matchedCode = Object.entries(MARKETING_US_STATE_NAMES).find(([, name]) => name.toLowerCase() === selectedState.toLowerCase())?.[0];
      const stateValues = stateName
        ? [stateCode.toLowerCase(), stateName.toLowerCase()]
        : matchedCode
          ? [matchedCode.toLowerCase(), MARKETING_US_STATE_NAMES[matchedCode].toLowerCase()]
          : [selectedState.toLowerCase()];
      const stateFields = [
        sql`${customersMirror.shipping_address}->>'state_or_province'`,
        sql`${customersMirror.billing_address}->>'state_or_province'`,
        sql`${customersMirror.shipping_address}->>'state'`,
        sql`${customersMirror.billing_address}->>'state'`,
      ];
      conditions.push(or(...stateFields.flatMap(field => stateValues.map(value => sql`lower(trim(${field})) = ${value}`))));
    }
    if (typeof filters.country === "string" && filters.country.trim()) {
      conditions.push(sql`coalesce(${customersMirror.shipping_address}->>'country_code', ${customersMirror.billing_address}->>'country_code', ${customersMirror.shipping_address}->>'country') = ${filters.country.trim()}`);
    }
    if (typeof filters.search === "string" && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(or(ilike(customersMirror.company, term), ilike(customersMirror.first_name, term), ilike(customersMirror.last_name, term), ilike(customersMirror.email, term)));
    }
    return db.select().from(customersMirror).where(and(...conditions)).orderBy(asc(customersMirror.company), asc(customersMirror.last_name)).limit(limit);
  }

  private async getMarketingCustomerSuppressionIds(customerIds: number[]): Promise<Set<number>> {
    if (!customerIds.length) return new Set();
    const rows = await db.select({ id: customersMirror.id })
      .from(customersMirror)
      .leftJoin(marketingCustomerPreferences, eq(marketingCustomerPreferences.customer_id, customersMirror.id))
      .where(and(
        inArray(customersMirror.id, customerIds),
        or(
          eq(marketingCustomerPreferences.email_subscribed, false),
          sql`EXISTS (SELECT 1 FROM marketing_suppressions ms WHERE ms.customer_id = ${customersMirror.id} AND ms.revoked_at IS NULL)`,
        ),
      ));
    return new Set(rows.map(row => row.id));
  }

  async getMarketingAudiencePreview(filters: Record<string, unknown>, limit = 25): Promise<{ customers: any[]; total: number; suppressed: number }> {
    const candidates = await this.getMarketingCandidateCustomers(filters, 100000);
    const suppressedIds = await this.getMarketingCustomerSuppressionIds(candidates.map(c => c.id));
    return {
      customers: candidates.slice(0, Math.max(0, limit)).map(c => ({ ...c, marketing_suppressed: suppressedIds.has(c.id) })),
      total: candidates.length,
      suppressed: suppressedIds.size,
    };
  }

  private async resolveMarketingCampaignCustomers(campaign: any): Promise<any[]> {
    if (!String(campaign.audience_type ?? "").trim()) return [];
    if (campaign.audience_type === "selected_customers") {
      return db.select({ customer: customersMirror }).from(marketingCampaignRecipients)
        .innerJoin(customersMirror, eq(customersMirror.id, marketingCampaignRecipients.customer_id))
        .where(eq(marketingCampaignRecipients.campaign_id, campaign.id))
        .then(rows => rows.map(row => row.customer));
    }
    if (campaign.audience_type === "saved_audience" && campaign.audience_id) {
      const [audience] = await db.select().from(marketingAudiences).where(eq(marketingAudiences.id, campaign.audience_id)).limit(1);
      if (!audience) return [];
      if (audience.audience_type === "manual") {
        const [customerRows, contactRows] = await Promise.all([
          db.select({ customer: customersMirror }).from(marketingAudienceMembers)
            .innerJoin(customersMirror, eq(customersMirror.id, marketingAudienceMembers.customer_id))
            .where(eq(marketingAudienceMembers.audience_id, campaign.audience_id)),
          db.select({ contact: marketingContacts }).from(marketingAudienceMembers)
            .innerJoin(marketingContacts, eq(marketingContacts.id, marketingAudienceMembers.marketing_contact_id))
            .where(and(eq(marketingAudienceMembers.audience_id, campaign.audience_id), eq(marketingContacts.is_active, true))),
        ]);
        return [
          ...customerRows.map(row => row.customer),
          ...contactRows.map(row => ({ ...row.contact, marketing_contact_id: row.contact.id, id: undefined })),
        ];
      }
      return this.getMarketingCandidateCustomers((audience.dynamic_filters ?? {}) as Record<string, unknown>);
    }
    if (campaign.audience_type === "customer_group") {
      const config = (campaign.audience_config ?? {}) as Record<string, unknown>;
      const groupName = String(config.customerGroupName ?? config.customerGroup ?? "").trim();
      if (!groupName) return [];
      return this.getMarketingCandidateCustomers({ ...config, customerGroup: groupName });
    }
    if (campaign.audience_type === "all_eligible") return this.getMarketingCandidateCustomers({});
    return [];
  }

  async claimMarketingCampaign(id: number): Promise<any | undefined> {
    const [campaign] = await db.update(marketingCampaigns).set({
      status: "sending",
      started_at: new Date(),
      send_attempts: sql`${marketingCampaigns.send_attempts} + 1`,
      updated_at: new Date(),
      last_error: null,
    }).where(and(eq(marketingCampaigns.id, id), or(eq(marketingCampaigns.status, "queued"), eq(marketingCampaigns.status, "scheduled")))).returning();
    return campaign;
  }

  async getMarketingQueueCampaigns(): Promise<any[]> {
    return db.select().from(marketingCampaigns).where(or(
      eq(marketingCampaigns.status, "queued"),
      and(eq(marketingCampaigns.status, "scheduled"), lte(marketingCampaigns.scheduled_at, new Date())),
    )).orderBy(asc(marketingCampaigns.scheduled_at)).limit(10);
  }

  async prepareMarketingRecipients(campaignId: number): Promise<{ eligible: number; suppressed: number; unsubscribed: number }> {
    const [campaign] = await db.select().from(marketingCampaigns).where(eq(marketingCampaigns.id, campaignId)).limit(1);
    if (!campaign) throw new Error("Campaign not found");
    const candidates = await this.resolveMarketingCampaignCustomers(campaign);
    const customerIds = Array.from(new Set(candidates.map(c => Number(c.id)).filter(Number.isInteger)));
    const contactIds = Array.from(new Set(candidates.map(c => Number(c.marketing_contact_id)).filter(Number.isInteger)));
    const suppressedIds = await this.getMarketingCustomerSuppressionIds(customerIds);
    const existing = await db.select({ customer_id: marketingCampaignRecipients.customer_id, marketing_contact_id: marketingCampaignRecipients.marketing_contact_id, status: marketingCampaignRecipients.status })
      .from(marketingCampaignRecipients).where(eq(marketingCampaignRecipients.campaign_id, campaignId));
    const existingByKey = new Map(existing.map(row => [row.customer_id ? `customer:${row.customer_id}` : `contact:${row.marketing_contact_id}`, row.status]));
    for (const customer of candidates) {
      const isImported = Number.isInteger(Number(customer.marketing_contact_id));
      const entityId = isImported ? Number(customer.marketing_contact_id) : Number(customer.id);
      const existingStatus = existingByKey.get(isImported ? `contact:${entityId}` : `customer:${entityId}`);
      const status = !isImported && suppressedIds.has(customer.id)
        ? (await this.getMarketingCustomerPreference(customer.id))?.email_subscribed === false ? "unsubscribed" : "suppressed"
        : (existingStatus === "sent" ? "sent" : "eligible");
      const values = {
        campaign_id: campaignId,
        customer_id: isImported ? null : entityId,
        marketing_contact_id: isImported ? entityId : null,
        email: String(customer.email ?? "").trim(),
        status,
      };
      if (isImported) {
        await db.insert(marketingCampaignRecipients).values(values).onConflictDoUpdate({
          target: [marketingCampaignRecipients.campaign_id, marketingCampaignRecipients.marketing_contact_id],
          set: { email: values.email, status: status === "sent" ? "sent" : status },
        });
      } else {
        await db.insert(marketingCampaignRecipients).values(values).onConflictDoUpdate({
          target: [marketingCampaignRecipients.campaign_id, marketingCampaignRecipients.customer_id],
          set: { email: values.email, status: status === "sent" ? "sent" : status },
        });
      }
      if (status === "suppressed" || status === "unsubscribed") {
        await this.recordMarketingEvent({ campaign_id: campaignId, event_type: status, detail: { customer_id: isImported ? null : entityId, marketing_contact_id: isImported ? entityId : null } });
      }
    }
    const [counts] = await db.select({
      eligible: sql<number>`count(*) filter (where ${marketingCampaignRecipients.status} in ('eligible','queued','sending','failed'))::int`,
      suppressed: sql<number>`count(*) filter (where ${marketingCampaignRecipients.status} = 'suppressed')::int`,
      unsubscribed: sql<number>`count(*) filter (where ${marketingCampaignRecipients.status} = 'unsubscribed')::int`,
    }).from(marketingCampaignRecipients).where(eq(marketingCampaignRecipients.campaign_id, campaignId));
    await db.update(marketingCampaigns).set({
      recipient_count: customerIds.length + contactIds.length, suppressed_count: counts?.suppressed ?? 0, unsubscribed_count: counts?.unsubscribed ?? 0, updated_at: new Date(),
    }).where(eq(marketingCampaigns.id, campaignId));
    return { eligible: counts?.eligible ?? 0, suppressed: counts?.suppressed ?? 0, unsubscribed: counts?.unsubscribed ?? 0 };
  }

  async claimMarketingRecipient(id: number): Promise<any | undefined> {
    const [recipient] = await db.update(marketingCampaignRecipients).set({
      status: "sending", attempt_count: sql`${marketingCampaignRecipients.attempt_count} + 1`, last_attempt_at: new Date(),
    }).where(and(eq(marketingCampaignRecipients.id, id), or(eq(marketingCampaignRecipients.status, "eligible"), and(eq(marketingCampaignRecipients.status, "failed"), sql`${marketingCampaignRecipients.attempt_count} < 3`)))).returning();
    return recipient;
  }

  async resetMarketingFailedRecipients(campaignId: number): Promise<void> {
    await db.update(marketingCampaignRecipients).set({
      status: "eligible",
      attempt_count: 0,
      last_attempt_at: null,
      failure_reason: null,
      provider_message_id: null,
    }).where(and(
      eq(marketingCampaignRecipients.campaign_id, campaignId),
      eq(marketingCampaignRecipients.status, "failed"),
    ));
  }

  async markMarketingRecipientSent(id: number, providerMessageId?: string | null): Promise<void> {
    const [recipient] = await db.update(marketingCampaignRecipients).set({ status: "sent", sent_at: new Date(), provider_message_id: providerMessageId ?? null }).where(eq(marketingCampaignRecipients.id, id)).returning();
    if (recipient) await this.recordMarketingEvent({ campaign_id: recipient.campaign_id, recipient_id: id, event_type: "sent", detail: { provider_message_id: providerMessageId ?? null } });
  }

  async markMarketingRecipientFailed(id: number, reason: string, retryable = true): Promise<void> {
    const [recipient] = await db.update(marketingCampaignRecipients).set({
      status: "failed",
      failure_reason: reason.slice(0, 1000),
      ...(retryable ? {} : { attempt_count: 3 }),
    }).where(eq(marketingCampaignRecipients.id, id)).returning();
    if (recipient) await this.recordMarketingEvent({ campaign_id: recipient.campaign_id, recipient_id: id, event_type: "failed", detail: { reason: reason.slice(0, 500) } });
  }

  async recordMarketingEvent(data: { campaign_id: number; recipient_id?: number | null; event_type: string; detail?: Record<string, unknown>; provider_event_id?: string | null }): Promise<void> {
    await db.insert(marketingCampaignEvents).values({
      campaign_id: data.campaign_id, recipient_id: data.recipient_id ?? null, event_type: data.event_type,
      detail: data.detail ?? {}, provider_event_id: data.provider_event_id ?? null,
    });
    if (data.event_type === "clicked") {
      await db.update(marketingCampaigns).set({
        clicked_count: sql`${marketingCampaigns.clicked_count} + 1`,
        updated_at: new Date(),
      }).where(eq(marketingCampaigns.id, data.campaign_id));
    }
  }

  async completeMarketingCampaign(id: number): Promise<any | undefined> {
    const [counts] = await db.select({
      sent: sql<number>`count(*) filter (where ${marketingCampaignRecipients.status} = 'sent')::int`,
      failed: sql<number>`count(*) filter (where ${marketingCampaignRecipients.status} = 'failed')::int`,
    }).from(marketingCampaignRecipients).where(eq(marketingCampaignRecipients.campaign_id, id));
    const status = (counts?.failed ?? 0) > 0 && (counts?.sent ?? 0) === 0 ? "failed" : "sent";
    const [campaign] = await db.update(marketingCampaigns).set({
      status, sent_count: counts?.sent ?? 0, failed_count: counts?.failed ?? 0, completed_at: new Date(), sent_at: status === "sent" ? new Date() : null, updated_at: new Date(),
    }).where(eq(marketingCampaigns.id, id)).returning();
    if (campaign) await this.recordMarketingEvent({ campaign_id: id, event_type: status, detail: { sent: counts?.sent ?? 0, failed: counts?.failed ?? 0 } });
    return campaign ? this.getMarketingCampaign(id) : undefined;
  }

  async getMarketingRecipients(campaignId: number, opts: { status?: string; limit?: number; offset?: number } = {}): Promise<{ rows: any[]; total: number }> {
    const conditions: any[] = [eq(marketingCampaignRecipients.campaign_id, campaignId)];
    if (opts.status && opts.status !== "all") conditions.push(eq(marketingCampaignRecipients.status, opts.status));
    const where = and(...conditions);
    const [rows, countRows] = await Promise.all([
      db.select({ recipient: marketingCampaignRecipients, customer: customersMirror, contact: marketingContacts }).from(marketingCampaignRecipients)
        .leftJoin(customersMirror, eq(customersMirror.id, marketingCampaignRecipients.customer_id))
        .leftJoin(marketingContacts, eq(marketingContacts.id, marketingCampaignRecipients.marketing_contact_id))
        .where(where)
        .orderBy(desc(marketingCampaignRecipients.created_at)).limit(opts.limit ?? 100).offset(opts.offset ?? 0),
      db.select({ count: sql<number>`count(*)::int` }).from(marketingCampaignRecipients).where(where),
    ]);
    return { rows: rows.map(row => ({ ...row.recipient, customer: row.customer ?? row.contact, source: row.contact ? "imported" : "crm" })), total: countRows[0]?.count ?? 0 };
  }

  async getMarketingRecipient(id: number): Promise<any | undefined> {
    const [row] = await db.select({
      recipient: marketingCampaignRecipients,
      customer: customersMirror,
      contact: marketingContacts,
    }).from(marketingCampaignRecipients)
      .leftJoin(customersMirror, eq(customersMirror.id, marketingCampaignRecipients.customer_id))
      .leftJoin(marketingContacts, eq(marketingContacts.id, marketingCampaignRecipients.marketing_contact_id))
      .where(eq(marketingCampaignRecipients.id, id)).limit(1);
    return row ? { ...row.recipient, customer: row.customer ?? row.contact, source: row.contact ? "imported" : "crm" } : undefined;
  }

  async getMarketingAnalytics(opts: { campaignId?: number; dateFrom?: string; dateTo?: string } = {}): Promise<any> {
    const conditions: any[] = [];
    if (opts.campaignId) conditions.push(eq(marketingCampaignEvents.campaign_id, opts.campaignId));
    if (opts.dateFrom) conditions.push(gte(marketingCampaignEvents.occurred_at, new Date(`${opts.dateFrom}T00:00:00`)));
    if (opts.dateTo) {
      const end = new Date(`${opts.dateTo}T00:00:00`); end.setDate(end.getDate() + 1);
      conditions.push(lt(marketingCampaignEvents.occurred_at, end));
    }
    const rows = await db.select({ event_type: marketingCampaignEvents.event_type, count: sql<number>`count(*)::int` })
      .from(marketingCampaignEvents).where(conditions.length ? and(...conditions) : undefined).groupBy(marketingCampaignEvents.event_type);
    const result: Record<string, number> = {};
    rows.forEach(row => { result[row.event_type] = row.count; });
    return {
      sent: result.sent ?? 0, failed: result.failed ?? 0, suppressed: result.suppressed ?? 0, unsubscribed: result.unsubscribed ?? 0,
      delivered: null, opened: null, clicked: result.clicked ?? 0, clickAvailable: true, deliveryAvailable: false,
    };
  }

  async markMarketingTestSent(campaignId: number): Promise<void> {
    await db.update(marketingCampaigns).set({ test_sent_at: new Date(), updated_at: new Date() }).where(eq(marketingCampaigns.id, campaignId));
  }

  async getMarketingCustomerPreference(customerId: number): Promise<any> {
    const [row] = await db.select().from(marketingCustomerPreferences).where(eq(marketingCustomerPreferences.customer_id, customerId)).limit(1);
    return row ?? { customer_id: customerId, email_subscribed: true, unsubscribed_at: null };
  }

  async upsertMarketingCustomerPreference(customerId: number, data: { email_subscribed: boolean; userId?: number }): Promise<any> {
    const [row] = await db.insert(marketingCustomerPreferences).values({
      customer_id: customerId, email_subscribed: data.email_subscribed, unsubscribed_at: data.email_subscribed ? null : new Date(), updated_by: data.userId ?? null,
    }).onConflictDoUpdate({
      target: marketingCustomerPreferences.customer_id,
      set: { email_subscribed: data.email_subscribed, unsubscribed_at: data.email_subscribed ? null : new Date(), updated_by: data.userId ?? null, updated_at: new Date() },
    }).returning();
    return row;
  }

  async getMarketingSuppressions(customerId?: number): Promise<any[]> {
    return db.select().from(marketingSuppressions).where(and(
      customerId ? eq(marketingSuppressions.customer_id, customerId) : sql`true`,
      isNull(marketingSuppressions.revoked_at),
    )).orderBy(desc(marketingSuppressions.created_at));
  }

  async createMarketingSuppression(data: { customerId: number; email?: string; reason: string; source?: string; createdBy?: number }): Promise<any> {
    const customer = await this.getCrmCustomerById(data.customerId);
    const [row] = await db.insert(marketingSuppressions).values({
      customer_id: data.customerId, email: data.email ?? customer?.email ?? "", reason: data.reason.trim(), source: data.source ?? "manual", created_by: data.createdBy ?? null,
    }).returning();
    await this.upsertMarketingCustomerPreference(data.customerId, { email_subscribed: false, userId: data.createdBy });
    return row;
  }

  async revokeMarketingSuppression(id: number, userId: number, detail?: string): Promise<any | undefined> {
    const [row] = await db.update(marketingSuppressions).set({ revoked_at: new Date(), revoked_by: userId, revoked_at_detail: detail ?? null }).where(and(eq(marketingSuppressions.id, id), isNull(marketingSuppressions.revoked_at))).returning();
    return row;
  }

  async getMarketingAutomations(opts: { status?: string; search?: string } = {}): Promise<any[]> {
    const conditions: any[] = [];
    if (opts.status && opts.status !== "all") conditions.push(eq(marketingAutomations.status, opts.status));
    if (opts.search?.trim()) conditions.push(ilike(marketingAutomations.name, `%${opts.search.trim()}%`));
    const rows = await db.select({ automation: marketingAutomations, creator_name: users.name }).from(marketingAutomations)
      .leftJoin(users, eq(users.id, marketingAutomations.created_by)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(marketingAutomations.updated_at));
    return Promise.all(rows.map(async row => ({ ...row.automation, creator_name: row.creator_name, step_count: (await db.select({ count: sql<number>`count(*)::int` }).from(marketingAutomationSteps).where(eq(marketingAutomationSteps.automation_id, row.automation.id)))[0]?.count ?? 0 })));
  }

  async getMarketingAutomation(id: number): Promise<any | undefined> {
    const [row] = await db.select({ automation: marketingAutomations, creator_name: users.name }).from(marketingAutomations)
      .leftJoin(users, eq(users.id, marketingAutomations.created_by)).where(eq(marketingAutomations.id, id)).limit(1);
    if (!row) return undefined;
    const steps = await db.select().from(marketingAutomationSteps).where(eq(marketingAutomationSteps.automation_id, id)).orderBy(asc(marketingAutomationSteps.step_order));
    return { ...row.automation, creator_name: row.creator_name, steps };
  }

  async createMarketingAutomation(data: { name: string; description?: string; trigger_type: string; trigger_config?: Record<string, unknown>; frequency_days?: number; created_by: number; steps: Array<{ action_type: string; action_config?: Record<string, unknown> }> }): Promise<any> {
    const result = await db.transaction(async tx => {
      const [automation] = await tx.insert(marketingAutomations).values({
        name: data.name.trim(), description: data.description ?? "", trigger_type: data.trigger_type, trigger_config: data.trigger_config ?? {}, frequency_days: data.frequency_days ?? 0, created_by: data.created_by,
      }).returning();
      if (data.steps.length) await tx.insert(marketingAutomationSteps).values(data.steps.map((step, index) => ({ automation_id: automation.id, step_order: index, action_type: step.action_type, action_config: step.action_config ?? {} })));
      return automation;
    });
    return this.getMarketingAutomation(result.id);
  }

  async updateMarketingAutomation(id: number, data: Record<string, unknown>, userId: number): Promise<any | undefined> {
    const allowed = ["name", "description", "trigger_type", "trigger_config", "frequency_days"] as const;
    const update: Record<string, unknown> = { updated_at: new Date() };
    for (const key of allowed) if (key in data) update[key] = data[key];
    const result = await db.transaction(async tx => {
      const [updated] = await tx.update(marketingAutomations).set(update as any).where(eq(marketingAutomations.id, id)).returning();
      if (!updated) return undefined;
      if (Array.isArray(data.steps)) {
        await tx.delete(marketingAutomationSteps).where(eq(marketingAutomationSteps.automation_id, id));
        if (data.steps.length) await tx.insert(marketingAutomationSteps).values((data.steps as any[]).map((step, index) => ({ automation_id: id, step_order: index, action_type: String(step.action_type), action_config: step.action_config ?? {} })));
      }
      return updated;
    });
    if (result) await this.createCrmAuditLog({ user_id: userId, action: "marketing_automation_edited", detail: { automation_id: id } });
    return result ? this.getMarketingAutomation(id) : undefined;
  }

  async updateMarketingAutomationStatus(id: number, status: string, userId: number): Promise<any | undefined> {
    const [updated] = await db.update(marketingAutomations).set({ status, updated_at: new Date() }).where(eq(marketingAutomations.id, id)).returning();
    if (!updated) return undefined;
    await this.createCrmAuditLog({ user_id: userId, action: `marketing_automation_${status}`, detail: { automation_id: id } });
    return this.getMarketingAutomation(id);
  }

  async getMarketingAutomationExecutions(id: number, limit = 50): Promise<any[]> {
    return db.select({ execution: marketingAutomationExecutions, customer: customersMirror }).from(marketingAutomationExecutions)
      .innerJoin(customersMirror, eq(customersMirror.id, marketingAutomationExecutions.customer_id))
      .where(eq(marketingAutomationExecutions.automation_id, id)).orderBy(desc(marketingAutomationExecutions.created_at)).limit(limit)
      .then(rows => rows.map(row => ({ ...row.execution, customer: row.customer })));
  }

  async createMarketingAutomationExecution(data: { automationId: number; customerId: number; triggerEvent: string; dedupeKey: string }): Promise<any | undefined> {
    const [execution] = await db.insert(marketingAutomationExecutions).values({
      automation_id: data.automationId, customer_id: data.customerId, trigger_event: data.triggerEvent, dedupe_key: data.dedupeKey,
    }).onConflictDoNothing({ target: marketingAutomationExecutions.dedupe_key }).returning();
    return execution;
  }

  async updateMarketingAutomationExecution(id: number, data: Record<string, unknown>): Promise<void> {
    await db.update(marketingAutomationExecutions).set(data as any).where(eq(marketingAutomationExecutions.id, id));
  }

  // ─── Reports ──────────────────────────────────────────────────────────────────

  async getSalesReport(opts: {
    view: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortDir?: string;
  }): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const { view, dateFrom, dateTo, search, page = 0, limit = 50, sortBy, sortDir = "desc" } = opts;
    const offset = page * limit;

    // Default status filter: synced + pending_sync (unless 'all' is requested)
    const statuses = opts.status === "all"
      ? ["synced", "pending_sync", "draft", "failed"]
      : opts.status === "pending_sync"
      ? ["pending_sync"]
      : opts.status === "synced"
      ? ["synced"]
      : ["synced", "pending_sync"];

    const statusList = statuses.map((s) => `'${s}'`).join(", ");

    const dateFromCond = dateFrom
      ? `AND o.date >= '${dateFrom.replace(/'/g, "''")}'::date`
      : "";
    const dateToCond = dateTo
      ? `AND o.date < ('${dateTo.replace(/'/g, "''")}'::date + INTERVAL '1 day')`
      : "";
    const searchCond = search
      ? `AND (
          item->'product'->>'name' ILIKE '%${search.replace(/'/g, "''")}%'
          OR COALESCE(item->'variant'->>'sku', item->'product'->>'sku', '') ILIKE '%${search.replace(/'/g, "''")}%'
        )`
      : "";

    if (view === "summary") {
      const sortColMap: Record<string, string> = {
        product_name: "product_name",
        variant_label: "variant_label",
        sku: "sku",
        qty_sold: "qty_sold",
        revenue: "revenue",
      };
      const orderCol = sortColMap[sortBy ?? "qty_sold"] ?? "qty_sold";
      const orderDir = sortDir === "asc" ? "ASC" : "DESC";

      const baseWhere = `
        FROM orders o, jsonb_array_elements(o.items) AS item
        WHERE o.status IN (${statusList})
        ${dateFromCond}
        ${dateToCond}
        ${searchCond}
      `;

      const [countResult, dataResult] = await Promise.all([
        db.execute(sql.raw(`
          SELECT COUNT(*)::int AS total
          FROM (
            SELECT 1
            ${baseWhere}
            GROUP BY
              item->'product'->>'name',
              COALESCE(item->'variant'->>'label', ''),
              COALESCE(NULLIF(item->'variant'->>'sku', ''), item->'product'->>'sku', '')
          ) t
        `)),
        db.execute(sql.raw(`
          SELECT
            item->'product'->>'name' AS product_name,
            COALESCE(item->'variant'->>'label', '') AS variant_label,
            COALESCE(NULLIF(item->'variant'->>'sku', ''), item->'product'->>'sku', '') AS sku,
            SUM((item->>'quantity')::numeric) AS qty_sold,
            SUM((item->>'quantity')::numeric * (item->>'price_at_sale')::numeric) AS revenue
          ${baseWhere}
          GROUP BY
            item->'product'->>'name',
            COALESCE(item->'variant'->>'label', ''),
            COALESCE(NULLIF(item->'variant'->>'sku', ''), item->'product'->>'sku', '')
          ORDER BY ${orderCol} ${orderDir}
          LIMIT ${limit} OFFSET ${offset}
        `)),
      ]);

      return {
        rows: dataResult.rows as Record<string, unknown>[],
        total: (countResult.rows[0] as any)?.total ?? 0,
      };
    }

    // ── Order Details view ──────────────────────────────────────────────────────
    const sortColMap: Record<string, string> = {
      product_name: "item->'product'->>'name'",
      variant_label: "COALESCE(item->'variant'->>'label', '')",
      sku: "COALESCE(NULLIF(item->'variant'->>'sku', ''), item->'product'->>'sku', '')",
      order_number: "o.bigcommerce_order_id",
      customer_name: "o.customer_name",
      quantity: "(item->>'quantity')::numeric",
      unit_price: "(item->>'price_at_sale')::numeric",
      order_date: "o.date",
    };
    const orderExpr = sortColMap[sortBy ?? "order_date"] ?? "o.date";
    const orderDir = sortDir === "asc" ? "ASC" : "DESC";

    const baseWhere = `
      FROM orders o, jsonb_array_elements(o.items) AS item
      WHERE o.status IN (${statusList})
      ${dateFromCond}
      ${dateToCond}
      ${searchCond}
    `;

    const [countResult, dataResult] = await Promise.all([
      db.execute(sql.raw(`SELECT COUNT(*)::int AS total ${baseWhere}`)),
      db.execute(sql.raw(`
        SELECT
          item->'product'->>'name' AS product_name,
          COALESCE(item->'variant'->>'label', '') AS variant_label,
          COALESCE(NULLIF(item->'variant'->>'sku', ''), item->'product'->>'sku', '') AS sku,
          o.bigcommerce_order_id AS order_number,
          o.customer_name,
          (item->>'quantity')::numeric AS quantity,
          (item->>'price_at_sale')::numeric AS unit_price,
          o.date AS order_date
        ${baseWhere}
        ORDER BY ${orderExpr} ${orderDir}
        LIMIT ${limit} OFFSET ${offset}
      `)),
    ]);

    return {
      rows: dataResult.rows as Record<string, unknown>[],
      total: (countResult.rows[0] as any)?.total ?? 0,
    };
  }

  async logReportExport(data: InsertReportExportLog): Promise<void> {
    await db.insert(reportExportLogs).values(data);
  }

  // ─── BC Order Line Items mirror ───────────────────────────────────────────

  async getSyncedBcOrderIds(dateFrom?: string, dateTo?: string): Promise<Set<number>> {
    let q = `SELECT DISTINCT bigcommerce_order_id FROM bc_order_line_items`;
    const conditions: string[] = [];
    if (dateFrom) conditions.push(`order_date >= '${dateFrom}'::date`);
    if (dateTo) conditions.push(`order_date < '${dateTo}'::date + interval '1 day'`);
    if (conditions.length) q += ` WHERE ${conditions.join(" AND ")}`;
    const result = await db.execute(sql.raw(q));
    const ids = new Set<number>();
    for (const row of result.rows as any[]) ids.add(Number(row.bigcommerce_order_id));
    return ids;
  }

  async insertBcOrderLineItems(items: InsertBcOrderLineItem[]): Promise<void> {
    if (!items.length) return;
    const CHUNK = 200;
    for (let i = 0; i < items.length; i += CHUNK) {
        // ON CONFLICT DO NOTHING against the unique index uq_bc_order_line_items_business_key
      // (bigcommerce_order_id, bigcommerce_product_id, COALESCE(variant_id, 0))
      await db.insert(bcOrderLineItems).values(items.slice(i, i + CHUNK)).onConflictDoNothing();
    }
  }

  async searchProductsForReport(query: string, limit = 20): Promise<Product[]> {
    const q = `%${query.toLowerCase()}%`;
    return db
      .select()
      .from(products)
      .where(
        or(
          ilike(products.name, `%${query}%`),
          ilike(products.sku, `%${query}%`)
        )
      )
      .limit(limit);
  }

  async searchLineItemsByQuery(query: string, limit = 40, options: { skuOnly?: boolean } = {}): Promise<Array<{ bigcommerce_product_id: number; product_name: string; brand_name: string; sku: string; variant_label: string | null }>> {
    // SKU searches use a prefix match so the functional lower(sku) index can
    // answer the common case without scanning the full order-line mirror.
    const match = options.skuOnly
      ? sql`lower(li.sku) LIKE lower(${query}) || '%'`
      : sql`li.sku ILIKE ${`%${query}%`} OR li.product_name ILIKE ${`%${query}%`}`;
    const orderBy = options.skuOnly
      ? sql`li.sku, li.bigcommerce_product_id`
      : sql`product_name, li.sku`;
    const res = await db.execute(sql`
      SELECT DISTINCT
        li.bigcommerce_product_id,
        COALESCE(p.name, li.product_name) AS product_name,
        COALESCE(p.brand_name, '') AS brand_name,
        li.sku,
        li.variant_label
      FROM bc_order_line_items li
      LEFT JOIN products p ON p.bigcommerce_id = li.bigcommerce_product_id
      WHERE ${match}
      ORDER BY ${orderBy}
      LIMIT ${limit}`);
    return res.rows as Array<{ bigcommerce_product_id: number; product_name: string; brand_name: string; sku: string; variant_label: string | null }>;
  }

  async getProductsByBrandId(brandId: number): Promise<Product[]> {
    return db.select().from(products).where(eq(products.brand_id, brandId));
  }

  async getProductsByCategoryId(categoryId: number): Promise<Product[]> {
    const result = await db.execute(
      sql.raw(`SELECT * FROM products WHERE categories @> '${categoryId}'::jsonb`)
    );
    return result.rows as Product[];
  }

  async getSalesReportSummary(opts: {
    dateFrom?: string;
    dateTo?: string;
    bcProductIds?: number[];
    skuFilter?: string;
    bcStatusFilter?: string[];
    page: number;
    limit: number;
    sortBy: string;
    sortDir: string;
  }): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const { dateFrom, dateTo, bcProductIds, skuFilter, bcStatusFilter, page, limit, sortBy, sortDir } = opts;
    const offset = page * limit;

    const dateFromCond = dateFrom
      ? `AND li.order_date >= '${dateFrom}'::date`
      : "";
    const dateToCond = dateTo
      ? `AND li.order_date < '${dateTo}'::date + interval '1 day'`
      : "";
    const productCond =
      bcProductIds === undefined
        ? ""
        : bcProductIds.length > 0
          ? `AND li.bigcommerce_product_id IN (${bcProductIds.join(",")})`
          : "AND 1=0";
    // SKU-level filter (for variant-specific searches)
    const skuCond = skuFilter
      ? `AND li.sku = '${skuFilter.replace(/'/g, "''")}'`
      : "";
    // BC status filter: empty/undefined = all statuses; otherwise include any selected status.
    const statusValues = (bcStatusFilter ?? []).map(status => `'${status.replace(/'/g, "''")}'`);
    const statusCond = statusValues.length
      ? `AND COALESCE(com.status, '') IN (${statusValues.join(", ")})`
      : "";

    const sortColMap: Record<string, string> = {
      qty_sold: "qty_sold",
      current_stock: "current_stock",
      sku: "li.sku",
      product_name: "product_name",
      variant_label: "li.variant_label",
    };
    const sortCol = sortColMap[sortBy] ?? "qty_sold";
    const dir = sortDir === "asc" ? "ASC" : "DESC";

    const baseFrom = `
      FROM bc_order_line_items li
      LEFT JOIN products p ON p.bigcommerce_id = li.bigcommerce_product_id
      LEFT JOIN customer_orders_mirror com ON com.bigcommerce_order_id = li.bigcommerce_order_id
      WHERE 1=1
      ${statusCond}
      ${dateFromCond}
      ${dateToCond}
      ${productCond}
      ${skuCond}
    `;

    const [countRes, dataRes] = await Promise.all([
      db.execute(sql.raw(`
        SELECT COUNT(*)::int AS total
        FROM (
          SELECT li.bigcommerce_product_id, li.variant_id, li.sku
          ${baseFrom}
          GROUP BY li.bigcommerce_product_id, li.variant_id, li.sku, li.variant_label
        ) sub
      `)),
      db.execute(sql.raw(`
        SELECT
          li.bigcommerce_product_id AS bc_product_id,
          COALESCE(p.name, li.product_name) AS product_name,
          COALESCE(p.brand_name, '') AS brand_name,
          li.variant_id,
          li.variant_label,
          li.sku,
          SUM(li.quantity)::int AS qty_sold,
          COALESCE(
            (
              SELECT CAST(CAST(v->>'stock_level' AS numeric) AS int)
              FROM jsonb_array_elements(p.variants) AS v
              WHERE v->>'id' IS NOT NULL
                AND CAST(v->>'id' AS int) = li.variant_id
              LIMIT 1
            ),
            p.stock_level,
            0
          ) AS current_stock
        ${baseFrom}
        GROUP BY li.bigcommerce_product_id, COALESCE(p.name, li.product_name), COALESCE(p.brand_name, ''), li.variant_id, li.variant_label, li.sku, p.stock_level, p.variants
        ORDER BY ${sortCol} ${dir}
        LIMIT ${limit} OFFSET ${offset}
      `)),
    ]);

    return {
      rows: dataRes.rows as Record<string, unknown>[],
      total: (countRes.rows[0] as any)?.total ?? 0,
    };
  }

  async getSalesReportInventoryKeys(opts: {
    dateFrom?: string;
    dateTo?: string;
    bcProductIds?: number[];
    skuFilter?: string;
    bcStatusFilter?: string[];
  }): Promise<Array<{ bc_product_id: number; variant_id: number | null }>> {
    const { dateFrom, dateTo, bcProductIds, skuFilter, bcStatusFilter } = opts;
    const dateFromCond = dateFrom
      ? `AND li.order_date >= '${dateFrom}'::date`
      : "";
    const dateToCond = dateTo
      ? `AND li.order_date < '${dateTo}'::date + interval '1 day'`
      : "";
    const productCond =
      bcProductIds === undefined
        ? ""
        : bcProductIds.length > 0
          ? `AND li.bigcommerce_product_id IN (${bcProductIds.join(",")})`
          : "AND 1=0";
    const skuCond = skuFilter
      ? `AND li.sku = '${skuFilter.replace(/'/g, "''")}'`
      : "";
    const statusValues = (bcStatusFilter ?? []).map(status => `'${status.replace(/'/g, "''")}'`);
    const statusCond = statusValues.length
      ? `AND COALESCE(com.status, '') IN (${statusValues.join(", ")})`
      : "";

    const result = await db.execute(sql.raw(`
      SELECT DISTINCT li.bigcommerce_product_id AS bc_product_id, li.variant_id
      FROM bc_order_line_items li
      LEFT JOIN customer_orders_mirror com ON com.bigcommerce_order_id = li.bigcommerce_order_id
      WHERE 1=1
      ${statusCond}
      ${dateFromCond}
      ${dateToCond}
      ${productCond}
      ${skuCond}
    `));
    return (result.rows as any[]).map(row => ({
      bc_product_id: Number(row.bc_product_id),
      variant_id: row.variant_id == null ? null : Number(row.variant_id),
    }));
  }

  async getSalesReportDetails(opts: {
    dateFrom?: string;
    dateTo?: string;
    bcProductIds?: number[];
    skuFilter?: string;
    bcStatusFilter?: string[];
    page: number;
    limit: number;
    sortBy: string;
    sortDir: string;
  }): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const { dateFrom, dateTo, bcProductIds, skuFilter, bcStatusFilter, page, limit, sortBy, sortDir } = opts;
    const offset = page * limit;

    const dateFromCond = dateFrom
      ? `AND li.order_date >= '${dateFrom}'::date`
      : "";
    const dateToCond = dateTo
      ? `AND li.order_date < '${dateTo}'::date + interval '1 day'`
      : "";
    const productCond =
      bcProductIds === undefined
        ? ""
        : bcProductIds.length > 0
          ? `AND li.bigcommerce_product_id IN (${bcProductIds.join(",")})`
          : "AND 1=0";
    const skuCond = skuFilter
      ? `AND li.sku = '${skuFilter.replace(/'/g, "''")}'`
      : "";
    const statusValues = (bcStatusFilter ?? []).map(status => `'${status.replace(/'/g, "''")}'`);
    const statusCond = statusValues.length
      ? `AND COALESCE(com.status, '') IN (${statusValues.join(", ")})`
      : "";

    const sortColMap: Record<string, string> = {
      order_date: "li.order_date",
      qty: "li.quantity",
      product_name: "product_name",
      customer_name: "li.customer_name",
      order_number: "li.bigcommerce_order_id",
      bc_status: "com.status",
    };
    const sortCol = sortColMap[sortBy] ?? "li.order_date";
    const dir = sortDir === "asc" ? "ASC" : "DESC";

    const whereCond = `
      WHERE 1=1
      ${statusCond}
      ${dateFromCond}
      ${dateToCond}
      ${productCond}
      ${skuCond}
    `;

    const [countRes, dataRes] = await Promise.all([
      db.execute(sql.raw(`
        SELECT COUNT(*)::int AS total
        FROM bc_order_line_items li
        LEFT JOIN products p ON p.bigcommerce_id = li.bigcommerce_product_id
        LEFT JOIN customer_orders_mirror com ON com.bigcommerce_order_id = li.bigcommerce_order_id
        ${whereCond}
      `)),
      db.execute(sql.raw(`
        SELECT
          li.bigcommerce_product_id AS bc_product_id,
          COALESCE(p.name, li.product_name) AS product_name,
          COALESCE(p.brand_name, '') AS brand_name,
          li.variant_label,
          li.sku,
          li.bigcommerce_order_id AS order_number,
          COALESCE(
            com.order_number::text,
            li.bigcommerce_order_id::text
          ) AS display_order_number,
          li.customer_name,
          li.customer_email,
          li.quantity,
          li.base_price AS unit_price,
          li.order_date,
          COALESCE(com.status, 'Unknown') AS bc_status
        FROM bc_order_line_items li
        LEFT JOIN products p ON p.bigcommerce_id = li.bigcommerce_product_id
        LEFT JOIN customer_orders_mirror com ON com.bigcommerce_order_id = li.bigcommerce_order_id
        ${whereCond}
        ORDER BY ${sortCol} ${dir}
        LIMIT ${limit} OFFSET ${offset}
      `)),
    ]);

    return {
      rows: dataRes.rows as Record<string, unknown>[],
      total: (countRes.rows[0] as any)?.total ?? 0,
    };
  }

  async getSalesReportStats(opts: {
    dateFrom?: string;
    dateTo?: string;
    bcProductIds?: number[];
    skuFilter?: string;
    bcStatusFilter?: string[];
  }): Promise<{ totalProducts: number; totalVariants: number; totalQtySold: number; totalSaleAmount: number; totalCurrentStock: number }> {
    const { dateFrom, dateTo, bcProductIds, skuFilter, bcStatusFilter } = opts;

    const dateFromCond = dateFrom ? `AND li.order_date >= '${dateFrom}'::date` : "";
    const dateToCond = dateTo ? `AND li.order_date < '${dateTo}'::date + interval '1 day'` : "";
    const productCond =
      bcProductIds === undefined
        ? ""
        : bcProductIds.length > 0
          ? `AND li.bigcommerce_product_id IN (${bcProductIds.join(",")})`
          : "AND 1=0";
    const skuCond = skuFilter
      ? `AND li.sku = '${skuFilter.replace(/'/g, "''")}'`
      : "";
    const statusValues = (bcStatusFilter ?? []).map(status => `'${status.replace(/'/g, "''")}'`);
    const statusCond = statusValues.length
      ? `AND COALESCE(com.status, '') IN (${statusValues.join(", ")})`
      : "";

    // Two-phase approach: aggregate qty/counts from line items (fast with index),
    // then compute stock only for the distinct product/variant set (avoids per-row JSONB expansion)
    const res = await db.execute(sql.raw(`
      WITH filtered_li AS (
         SELECT li.bigcommerce_product_id, li.variant_id, li.sku, li.quantity, li.base_price
        FROM bc_order_line_items li
        LEFT JOIN customer_orders_mirror com ON com.bigcommerce_order_id = li.bigcommerce_order_id
        WHERE 1=1
        ${statusCond}
        ${dateFromCond}
        ${dateToCond}
        ${productCond}
        ${skuCond}
      ),
      agg AS (
        SELECT
          COUNT(DISTINCT bigcommerce_product_id)::int AS total_products,
          COUNT(DISTINCT (bigcommerce_product_id, variant_id, sku))::int AS total_variants,
          COALESCE(SUM(quantity), 0)::int AS total_qty_sold,
          COALESCE(SUM(quantity * base_price), 0)::numeric AS total_sale_amount
        FROM filtered_li
      ),
      distinct_pv AS (
        SELECT DISTINCT bigcommerce_product_id, variant_id FROM filtered_li
      ),
      stock AS (
        SELECT COALESCE(SUM(
          CASE
            WHEN dpv.variant_id IS NOT NULL THEN
              COALESCE(
                (SELECT CAST(v->>'stock_level' AS int)
                 FROM jsonb_array_elements(p.variants) v
                 WHERE (v->>'id') IS NOT NULL AND CAST(v->>'id' AS int) = dpv.variant_id
                 LIMIT 1),
                p.stock_level, 0
              )
            ELSE COALESCE(p.stock_level, 0)
          END
        ), 0)::int AS total_current_stock
        FROM distinct_pv dpv
        LEFT JOIN products p ON p.bigcommerce_id = dpv.bigcommerce_product_id
      )
      SELECT agg.*, stock.total_current_stock FROM agg, stock
    `));

    const row = res.rows[0] as any;
    return {
      totalProducts: row?.total_products ?? 0,
      totalVariants: row?.total_variants ?? 0,
      totalQtySold: row?.total_qty_sold ?? 0,
      totalSaleAmount: Number(row?.total_sale_amount ?? 0),
      totalCurrentStock: row?.total_current_stock ?? 0,
    };
  }

  async getRecentExportLogs(limit = 5): Promise<Record<string, unknown>[]> {
    const res = await db
      .select()
      .from(reportExportLogs)
      .orderBy(desc(reportExportLogs.created_at))
      .limit(limit);
    return res as unknown as Record<string, unknown>[];
  }
}

export const storage = new DatabaseStorage();

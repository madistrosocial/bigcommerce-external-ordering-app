label)} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-800">{value}</p></div>)}</div><p className="mt-4 text-xs text-slate-400">SMTP does not provide delivery or open tracking. Product links record clicks when recipients follow them.</p></section>
       <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-3 font-semibold text-slate-900">Recipients</h2><div className="space-y-2">{(recipientData?.rows || []).slice(0, 20).map((r: any) => <div key={r.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-xs"><span className="min-w-0 flex-1 truncate">{r.customer?.company || [r.customer?.first_name, r.customer?.last_name].filter(Boolean).join(" ") || r.email}</span><span className="text-slate-400 truncate max-w-[160px]">{r.email}</span><StatusBadge status={r.status} /></div>)}{!recipientData?.rows?.length && <p className="text-sm text-slate-400">Recipients are prepared when the campaign starts.</p>}</div></section>
      <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-3 font-semibold text-slate-900">Activity</h2><div className="space-y-3">{(campaign.activity || []).length ? campaign.activity.map((a: any) => <div key={a.id} className="flex gap-2 text-sm"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><span className="text-slate-600">{a.action.replaceAll("_", " ")} <span className="text-xs text-slate-400">· {a.user_name || "System"} · {new Date(a.created_at).toLocaleString()}</span></span></div>) : <p className="text-sm text-slate-400">No activity yet.</p>}</div></section>
         {hasPermission("marketing", "send") && <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-3 text-sm font-semibold text-slate-900">Workflow</h2><div className="flex flex-wrap gap-2">{next && <Button size="sm" onClick={() => statusMutation.mutate(next)} disabled={statusMutation.isPending}>{next === "ready" ? "Mark ready" : "Pause campaign"}</Button>}{["ready", "paused", "scheduled"].includes(campaign.status) && <Button size="sm" variant="outline" onClick={() => setLocation(`/marketing/campaigns/${id}/edit`)}><CalendarClock className="mr-1.5 h-4 w-4" /> {campaign.status === "scheduled" ? "Reschedule" : "Schedule campaign"}</Button>}{["ready", "failed", "paused"].includes(campaign.status) && <Button size="sm" onClick={sendNow}><Send className="mr-1.5 h-4 w-4" /> Send now</Button>}{["scheduled", "queued", "sending"].includes(campaign.status) && <Button size="sm" variant="outline" onClick={async () => { try { await pauseMarketingCampaign(id); qc.invalidateQueries({ queryKey: ["marketing-campaign", id] }); } catch (e: any) { toast({ title: "Unable to pause", description: e.message, variant: "destructive" }); } }}>Pause</Button>}<Button size="sm" variant="outline" onClick={testSend}>Test email</Button>{hasPermission("marketing", "create") && <Button size="sm" variant="outline" onClick={async () => { const copy = await duplicateMarketingCampaign(id); toast({ title: "Campaign duplicated" }); setLocation(`/marketing/campaigns/${copy.id}/edit`); }}>Duplicate</Button>}{hasPermission("marketing", "delete") && campaign.status !== "sent" && <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => { if (window.confirm("Delete this campaign?")) deleteMutation.mutate(); }}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>}</div><p className="mt-3 text-xs text-slate-400">Sending runs on the server and respects current CRM preferences and suppressions.</p></section>}
        {!hasPermission("marketing", "send") && (hasPermission("marketing", "create") || hasPermission("marketing", "delete")) && <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-3 text-sm font-semibold text-slate-900">Campaign actions</h2><div className="flex flex-wrap gap-2">{hasPermission("marketing", "create") && <Button size="sm" variant="outline" onClick={async () => { const copy = await duplicateMarketingCampaign(id); toast({ title: "Campaign duplicated" }); setLocation(`/marketing/campaigns/${copy.id}/edit`); }}>Duplicate</Button>}{hasPermission("marketing", "delete") && campaign.status !== "sent" && <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => { if (window.confirm("Delete this campaign?")) deleteMutation.mutate(); }}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>}</div></section>}
     </div></div>
  </PageShell>;
}

function CampaignEditor({ id }: { id?: number }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const editing = Boolean(id);
  const [form, setForm] = useState<any>({
    name: "", internal_description: "", subject_line: "", preview_text: "",
     message_content: "<p></p>", sender_email: "", template_id: null, audience_type: "",
     audience_config: {}, audience_id: null, scheduled_at: "",
    product_snapshots: [], product_display_options: DEFAULT_MARKETING_PRODUCT_DISPLAY_OPTIONS,
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedProductListId, setSelectedProductListId] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [pickerProducts, setPickerProducts] = useState<MarketingProductSnapshot[]>([]);
  const { data: existing } = useQuery<any>({ queryKey: ["marketing-campaign", id], queryFn: () => getMarketingCampaign(id!), enabled: editing });
  const { data: senderSettings = { emails: [], defaultEmail: "" } } = useQuery<{ emails: string[]; defaultEmail: string }>({
    queryKey: ["marketing-sender-settings"],
    queryFn: getMarketingSenderSettings,
  });
  const { data: audiences = [] } = useQuery<any[]>({ queryKey: ["marketing-audiences"], queryFn: getMarketingAudiences });
  const { data: templates = [] } = useQuery<any[]>({ queryKey: ["marketing-templates"], queryFn: getMarketingTemplates });
  const { data: customerPage } = useQuery<any>({ queryKey: ["marketing-audience-customers", "campaign-editor"], queryFn: () => getMarketingAudienceCustomers({ limit: 100 }) });
  const { data: customerGroups = [], isLoading: customerGroupsLoading, error: customerGroupsError } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["marketing-customer-groups"],
    queryFn: getMarketingCustomerGroups,
    enabled: form.audience_type === "customer_group",
    staleTime: 5 * 60 * 1000,
  });
  const { data: productResults = [], isFetching: productsLoading, error: productsError } = useQuery<MarketingProductSnapshot[]>({
    queryKey: ["marketing-product-search", productSearch],
    queryFn: () => searchMarketingProducts(productSearch.trim()),
    enabled: pickerOpen && productSearch.trim().length >= 2,
  });
  const { data: productLists = [] } = useQuery<any[]>({
    queryKey: ["marketing-product-lists"],
    queryFn: () => getMarketingProductLists(),
  });
  const { data: selectedProductList } = useQuery<any>({
    queryKey: ["marketing-product-list", selectedProductListId],
    queryFn: () => getMarketingProductList(Number(selectedProductListId)),
    enabled: Boolean(selectedProductListId),
  });
  useEffect(() => { if (existing) { setForm({ ...existing, sender_email: existing.sender_email || "", scheduled_at: existing.scheduled_at ? new Date(existing.scheduled_at).toISOString().slice(0, 16) : "" }); setSelectedIds((existing.recipients || []).map((r: any) => r.id)); } }, [existing]);
  const saveMutation = useMutation({
    mutationFn: (status: string) => {
      const payload = { ...form, status, scheduled_at: form.scheduled_at || null, customer_ids: form.audience_type === "selected_customers" ? selectedIds : undefined };
      return editing ? updateMarketingCampaign(id!, payload) : createMarketingCampaign(payload);
    },
    onSuccess: (campaign: any) => { qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }); qc.invalidateQueries({ queryKey: ["marketing-dashboard"] }); toast({ title: editing ? "Campaign updated" : "Campaign created" }); setLocation(`/marketing/campaigns/${campaign.id}`); },
    onError: (e: any) => toast({ title: "Unable to save campaign", description: e.message, variant: "destructive" }),
  });
  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!form.scheduled_at) throw new Error("Choose a scheduled date first.");
      if (editing) {
        await updateMarketingCampaign(id!, { ...form, scheduled_at: form.scheduled_at, status: existing?.status === "draft" ? "ready" : existing?.status });
        return scheduleMarketingCampaign(id!, form.scheduled_at);
      }
      const created: any = await createMarketingCampaign({ ...form, status: "ready", scheduled_at: null, customer_ids: form.audience_type === "selected_customers" ? selectedIds : undefined });
      return scheduleMarketingCampaign(created.id, form.scheduled_at);
    },
    onSuccess: (campaign: any) => { qc.invalidateQueries({ queryKey: ["marketing-campaigns"] }); qc.invalidateQueries({ queryKey: ["marketing-dashboard"] }); toast({ title: "Campaign scheduled" }); setLocation(`/marketing/campaigns/${campaign.id}`); },
    onError: (e: any) => toast({ title: "Unable to schedule campaign", description: e.message, variant: "destructive" }),
  });
  const set = (key: string, value: any) => setForm((old: any) => ({ ...old, [key]: value }));
  const products: MarketingProductSnapshot[] = (Array.isArray(form.product_snapshots) ? form.product_snapshots : []).map(asProductSnapshot);
  const productOptions = normalizeMarketingProductDisplayOptions(form.product_display_options);
  const senderOptions = Array.from(new Set([
    ...(Array.isArray(senderSettings.emails) ? senderSettings.emails : []),
    ...(form.sender_email ? [String(form.sender_email)] : []),
  ]));
  const selectedGroupName = String(form.audience_config?.customerGroupName ?? form.audience_config?.customerGroup ?? "").trim();
  const audienceIsComplete = Boolean(
    form.audience_type
    && (form.audience_type !== "saved_audience" || Number(form.audience_id))
    && (form.audience_type !== "customer_group" || selectedGroupName)
    && (form.audience_type !== "selected_customers" || selectedIds.length > 0),
  );
  const updateProducts = (nextProducts: MarketingProductSnapshot[]) => {
    const unique = Array.from(new Map(nextProducts.map(product => [product.id, product])).values());
    setForm((old: any) => ({
      ...old,
      product_snapshots: unique,
      message_content: replaceMarketingProductMarkup(
        old.message_content || "",
        unique,
        normalizeMarketingProductDisplayOptions(old.product_display_options),
      ),
    }));
  };
  const updateProductOptions = (nextOptions: MarketingProductDisplayOptions) => {
    setForm((old: any) => ({
      ...old,
      product_display_options: nextOptions,
      message_content: replaceMarketingProductMarkup(old.message_content || "", products, nextOptions),
    }));
  };
  const openProductPicker = () => {
    setPickerProducts(products);
    setProductSearch("");
    setSelectedProductListId("");
    setPickerOpen(true);
  };
  const addProductListToPicker = () => {
    const listProducts = (selectedProductList?.items || [])
      .map((item: any) => asProductSnapshot(item.product_snapshot || {}))
      .filter((product: MarketingProductSnapshot) => product.id > 0);
    setPickerProducts(old => Array.from(new Map([...old, ...listProducts].map(product => [product.id, product])).values()));
  };
  const togglePickerProduct = (product: MarketingProductSnapshot) => {
    setPickerProducts(old => old.some(item => item.id === product.id)
      ? old.filter(item => item.id !== product.id)
      : [...old, asProductSnapshot(product)]);
  };
  const insertProductGrid = () => {
    if (!products.length) return;
    set("message_content", upsertMarketingProductMarkup(
      form.message_content || "",
      renderMarketingProductGrid(products, productOptions),
      /<!-- marketing-product-grid -->[\s\S]*?<!-- \/marketing-product-grid -->/,
    ));
  };
  const insertProduct = (product: MarketingProductSnapshot) => {
    set("message_content", upsertMarketingProductMarkup(
      form.message_content || "",
      renderMarketingProductBlock(product, productOptions),
      new RegExp(`<!-- marketing-product-block:${product.id} -->[\\s\\S]*?<!-- /marketing-product-block:${product.id} -->`),
    ));
  };
  const applyTemplate = (value: string) => {
    const templateId = Number(value) || null;
    const template = templates.find((candidate: any) => candidate.id === templateId);
    setForm((old: any) => ({
      ...old,
      template_id: templateId,
      ...(template ? {
        subject_line: template.subject_template || old.subject_line,
         message_content: preserveMarketingProductMarkup(template.body || old.message_content, old.message_content || ""),
      } : {}),
    }));
  };
  const customers = customerPage?.rows ?? [];
  return <PageShell title={editing ? "Edit campaign" : "New campaign"} subtitle="Build, test, schedule, or send this campaign through the configured SMTP connection." action={<Button variant="outline" onClick={() => setLocation(editing ? `/marketing/campaigns/${id}` : "/marketing/campaigns")}><ArrowLeft className="mr-2 h-4 w-4" /> Cancel</Button>}>
    <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]"><div className="space-y-5">
       <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><FileText className="h-4 w-4 text-blue-500" /> Campaign details</h2><div className="space-y-4"><label className="block text-sm font-medium text-slate-700">Campaign name<Input className="mt-1.5" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. September new arrivals" /></label><label className="block text-sm font-medium text-slate-700">Internal description<textarea className="mt-1.5 min-h-20 w-full rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-blue-400" value={form.internal_description} onChange={e => set("internal_description", e.target.value)} placeholder="What is this campaign for?" /></label><label className="block text-sm font-medium text-slate-700">Subject line<Input className="mt-1.5" value={form.subject_line} onChange={e => set("subject_line", e.target.value)} placeholder="Your subject line" /></label><label className="block text-sm font-medium text-slate-700">Preview text<Input className="mt-1.5" value={form.preview_text} onChange={e => set("preview_text", e.target.value)} placeholder="Optional inbox preview" /></label><label className="block text-sm font-medium text-slate-700">From email<select className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.sender_email || ""} onChange={e => set("sender_email", e.target.value)}><option value="">Use default{senderSettings.defaultEmail ? ` (${senderSettings.defaultEmail})` : ""}</option>{senderOptions.map(email => <option key={email} value={email}>{email}{email.toLowerCase() === senderSettings.defaultEmail.toLowerCase() ? " · Default" : ""}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-400">{senderSettings.defaultEmail ? `Defaults to ${senderSettings.defaultEmail}. Manage sender addresses in Marketing settings.` : "No sender addresses are configured yet. Add one in Marketing settings before sending."}</span></label></div></section>
       <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold text-slate-900"><Mail className="h-4 w-4 text-blue-500" /> Message</h2><Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}><Eye className="mr-1.5 h-4 w-4" /> Preview email</Button></div><label className="mb-4 block text-sm font-medium text-slate-700">Use a marketing template<select className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.template_id || ""} onChange={e => applyTemplate(e.target.value)}><option value="">Start from scratch</option>{templates.map((template: any) => <option key={template.id} value={template.id}>{template.name}{template.category ? ` · ${template.category}` : ""}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-400">{templates.length ? "Selecting a template fills the subject and message. You can still edit both." : "No active marketing templates are available yet."}</span></label><RichTextEditor value={form.message_content} onChange={value => setForm((old: any) => ({ ...old, message_content: preserveMarketingProductMarkup(value, old.message_content || "") }))} minHeight={240} /></section>
       <section className="rounded-xl border bg-white p-5 shadow-sm">
         <div className="flex flex-wrap items-start justify-between gap-3">
           <div><h2 className="flex items-center gap-2 font-semibold text-slate-900"><ShoppingBag className="h-4 w-4 text-blue-500" /> Products <span className="text-xs font-normal text-slate-400">Optional</span></h2><p className="mt-1 text-xs text-slate-500">Feature catalog products in this email. Products are only added to the message when you insert them.</p></div>
           <Button type="button" variant="outline" size="sm" onClick={openProductPicker}><Plus className="mr-1.5 h-4 w-4" />{products.length ? "Edit products" : "Add products"}</Button>
         </div>
         <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {PRODUCT_DISPLAY_FIELDS.map(([key, label, defaultValue]) => <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={productOptions[key]} onChange={e => updateProductOptions({ ...productOptions, [key]: e.target.checked })} />
             <span>{label}</span>{!Boolean(defaultValue) && <span className="text-[11px] text-slate-400">(off by default)</span>}
           </label>)}
         </div>
         {products.length ? <div className="mt-4 space-y-2">
           <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{products.length} selected product{products.length === 1 ? "" : "s"}</p><Button type="button" size="sm" onClick={insertProductGrid}><Package className="mr-1.5 h-3.5 w-3.5" /> Insert all products</Button></div>
           <div className="grid gap-2 sm:grid-cols-2">{products.map(product => <div key={product.id} className="flex min-w-0 items-center gap-3 rounded-lg border bg-slate-50 p-2.5">
             {product.image ? <img src={product.image} alt="" className="h-14 w-14 shrink-0 rounded object-cover" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-slate-200 text-slate-400"><Package className="h-5 w-5" /></div>}
             <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{product.name}</p><p className="truncate text-xs text-slate-500">{product.sku || "No SKU"} · ${Number(product.price || 0).toFixed(2)} · {product.stock_level} in stock</p><Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => insertProduct(product)}><Pencil className="mr-1 h-3 w-3" /> Insert this product</Button></div>
             <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600" aria-label={`Remove ${product.name}`} onClick={() => updateProducts(products.filter(item => item.id !== product.id))}><X className="h-4 w-4" /></Button>
           </div>)}</div>
         </div> : <p className="mt-4 rounded-lg border border-dashed p-4 text-center text-sm text-slate-400">No products selected yet.</p>}
       </section>
    </div><div className="space-y-5">
      <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><Users className="h-4 w-4 text-blue-500" /> Audience</h2><div className="space-y-3"><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.audience_type} onChange={e => { const nextType = e.target.value; setForm((old: any) => ({ ...old, audience_type: nextType, audience_config: nextType === "customer_group" ? {} : old.audience_config, audience_id: nextType === "saved_audience" ? old.audience_id : null })); }}><option value="">Choose an audience…</option><option value="all_eligible">All eligible customers (explicit opt-in)</option><option value="customer_group">BigCommerce customer group</option><option value="selected_customers">Selected customers</option><option value="saved_audience">Saved audience</option></select>{form.audience_type === "customer_group" && <div className="space-y-2"><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.audience_config?.customerGroupId || (selectedGroupName && !customerGroups.some(group => group.name === selectedGroupName) ? selectedGroupName : "")} disabled={customerGroupsLoading || Boolean(customerGroupsError)} onChange={e => { const group = customerGroups.find(candidate => String(candidate.id) === e.target.value); set("audience_config", group ? { customerGroupId: group.id, customerGroupName: group.name } : {}); }}><option value="">{customerGroupsLoading ? "Loading BigCommerce groups…" : "Choose a customer group…"}</option>{selectedGroupName && !form.audience_config?.customerGroupId && !customerGroups.some(group => group.name === selectedGroupName) && <option value={selectedGroupName}>{selectedGroupName} (saved value)</option>}{customerGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>{customerGroupsError ? <p className="text-xs text-red-600">Unable to load BigCommerce customer groups. Check the catalog connection.</p> : !customerGroupsLoading && !customerGroups.length && <p className="text-xs text-slate-500">No BigCommerce customer groups were found.</p>}<p className="text-xs text-slate-400">Groups are loaded from BigCommerce and matched to the CRM mirror when the campaign sends.</p></div>}{form.audience_type === "saved_audience" && <select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.audience_id || ""} onChange={e => set("audience_id", Number(e.target.value) || null)}><option value="">Choose a saved audience…</option>{audiences.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.member_count})</option>)}</select>}{form.audience_type === "selected_customers" && <div className="max-h-60 space-y-1 overflow-auto rounded-md border p-2">{customers.map((c: any) => <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-slate-50"><input type="checkbox" checked={selectedIds.includes(c.id)} onChange={e => setSelectedIds(old => e.target.checked ? [...old, c.id] : old.filter(x => x !== c.id))} /><span className="min-w-0 truncate">{c.company || `${c.first_name} ${c.last_name}`}</span><span className="ml-auto text-xs text-slate-400">{c.email}</span></label>)}{!customers.length && <p className="p-3 text-xs text-slate-400">No eligible CRM customers found.</p>}</div>}{!form.audience_type ? <p className="text-xs font-medium text-amber-700">Choose an audience before marking this campaign ready, scheduling it, or sending it.</p> : form.audience_type === "all_eligible" ? <p className="text-xs font-medium text-amber-700">This sends to every eligible customer. Select this only when that is intentional.</p> : <p className="text-xs text-slate-400">Customers come from the CRM mirror and must be active customer accounts.</p>}</div></section>
      <section className="rounded-xl border bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><CalendarClock className="h-4 w-4 text-blue-500" /> Schedule</h2><label className="block text-sm font-medium text-slate-700">Optional scheduled date<input type="datetime-local" className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" value={form.scheduled_at || ""} onChange={e => set("scheduled_at", e.target.value)} /></label></section>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => saveMutation.mutate("draft")} disabled={saveMutation.isPending || scheduleMutation.isPending || !hasPermission("marketing", editing ? "edit" : "create")}>Save draft</Button>{hasPermission("marketing", "send") && <>{form.scheduled_at && <Button variant="outline" onClick={() => scheduleMutation.mutate()} disabled={saveMutation.isPending || scheduleMutation.isPending || !audienceIsComplete}><CalendarClock className="mr-1.5 h-4 w-4" /> Schedule</Button>}<Button onClick={() => saveMutation.mutate("ready")} disabled={saveMutation.isPending || !audienceIsComplete || !hasPermission("marketing", editing ? "edit" : "create")}>{saveMutation.isPending ? "Saving…" : "Save & review"}</Button></>}</div>
     </div></div>
      <MarketingEmailPreview open={previewOpen} onOpenChange={setPreviewOpen} subject={form.subject_line} previewText={form.preview_text} sender={form.sender_email || senderSettings.defaultEmail} content={replaceMarketingProductMarkup(form.message_content || "", products, productOptions)} />
      {pickerOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="marketing-product-picker-title">
       <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
         <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
           <div><h2 id="marketing-product-picker-title" className="font-semibold text-slate-900">Choose campaign products</h2><p className="mt-1 text-xs text-slate-500">Search BigCommerce by product title or SKU, then select the products to feature.</p></div>
           <Button type="button" variant="ghost" size="icon" onClick={() => setPickerOpen(false)} aria-label="Close product picker"><X className="h-4 w-4" /></Button>
         </div>
         <div className="border-b px-5 py-4">
           <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input autoFocus className="pl-9" placeholder="Search product title or SKU…" value={productSearch} onChange={e => setProductSearch(e.target.value)} /></div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <select className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm" value={selectedProductListId} onChange={e => setSelectedProductListId(e.target.value)}>
                <option value="">Load a saved product list…</option>
                {productLists.map((list: any) => <option key={list.id} value={list.id}>{list.name} ({list.item_count ?? 0} products)</option>)}
              </select>
              <Button type="button" variant="outline" onClick={addProductListToPicker} disabled={!selectedProductListId || !selectedProductList}><Package className="mr-1.5 h-4 w-4" /> Add list</Button>
            </div>
           <p className="mt-2 text-xs text-slate-400">{pickerProducts.length} selected · Prices and stock are internal catalog information.</p>
         </div>
         <div className="min-h-0 flex-1 overflow-y-auto p-5">
           {productSearch.trim().length < 2 ? <div className="py-12 text-center text-sm text-slate-400"><Package className="mx-auto mb-3 h-8 w-8 text-slate-300" />Enter at least 2 characters to search the catalog.</div>
             : productsLoading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Searching BigCommerce…</div>
             : productsError ? <div className="py-12 text-center text-sm text-red-600">Unable to search BigCommerce. Check the catalog connection and try again.</div>
             : productResults.length ? <div className="grid gap-3 sm:grid-cols-2">{productResults.map(product => {
               const snapshot = asProductSnapshot(product);
               const selected = pickerProducts.some(item => item.id === snapshot.id);
               return <button type="button" key={snapshot.id} onClick={() => togglePickerProduct(snapshot)} className={`flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition-colors ${selected ? "border-blue-400 bg-blue-50/60" : "hover:border-slate-300 hover:bg-slate-50"}`}>
                 <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-transparent"}`}><Check className="h-3.5 w-3.5" /></span>
                 {snapshot.image ? <img src={snapshot.image} alt="" className="h-16 w-16 shrink-0 rounded object-cover" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400"><Package className="h-6 w-6" /></span>}
                 <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{snapshot.name}</span><span className="mt-1 block truncate text-xs text-slate-500">{snapshot.sku || "No SKU"}</span><span className="mt-1 block text-xs text-slate-400">${Number(snapshot.price || 0).toFixed(2)} · {snapshot.stock_level} in stock</span></span>
               </button>;
             })}</div>
             : <div className="py-12 text-center text-sm text-slate-400">No products matched that title or SKU.</div>}
         </div>
         <div className="flex flex-wrap justify-end gap-2 border-t bg-slate-50 px-5 py-3"><Button type="button" variant="outline" onClick={() => setPickerOpen(false)}>Cancel</Button><Button type="button" onClick={() => { updateProducts(pickerProducts); setPickerOpen(false); }}>{pickerProducts.length ? `Add ${pickerProducts.length} product${pickerProducts.length === 1 ? "" : "s"}` : "Clear selection"}</Button></div>
       </div>
     </div>}
  </PageShell>;
}

export function MarketingCampaignRoute() {
  const [newMatch] = useRoute("/marketing/campaigns/new");
  const [match, params] = useRoute("/marketing/campaigns/:id");
  const [editMatch, editParams] = useRoute("/marketing/campaigns/:id/edit");
  if (newMatch) return <CampaignEditor />;
  if (editMatch && editParams?.id && editParams.id !== "new") return <CampaignEditor id={Number(editParams.id)} />;
  if (match && params?.id) return <CampaignDetail id={Number(params.id)} />;
  return <CampaignEditor />;
}

export function MarketingAudiences() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const [selected, setSelected] = useState<any | null>(null);
  const [audienceEditorFocused, setAudienceEditorFocused] = useState(false);
  const [form, setForm] = useState<any>({ name: "", description: "", audience_type: "manual", dynamic_filters: {} });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [sourceTab, setSourceTab] = useState<"crm" | "imported">("crm");
  const [lookupSearch, setLookupSearch] = useState("");
  const [lookupPage, setLookupPage] = useState(0);
  const [contactType, setContactType] = useState("all");
  const [importType, setImportType] = useState<"lead" | "prospect">("lead");
  const [importing, setImporting] = useState(false);
  const [viewingMembers, setViewingMembers] = useState<any | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPage, setMemberPage] = useState(0);
  const [memberStatus, setMemberStatus] = useState("all");
  const pageSize = 25;
  const { data: audiences = [], isLoading } = useQuery<any[]>({ queryKey: ["marketing-audiences"], queryFn: getMarketingAudiences });
  const { data: customerPage } = useQuery<any>({
    queryKey: ["marketing-audience-customers", lookupSearch, lookupPage],
    queryFn: () => getMarketingAudienceCustomers({ search: lookupSearch, limit: pageSize, offset: lookupPage * pageSize }),
    enabled: form.audience_type === "manual" && sourceTab === "crm",
  });
  const { data: contactPage } = useQuery<any>({
    queryKey: ["marketing-contacts", lookupSearch, contactType, lookupPage],
    queryFn: () => getMarketingContacts({ search: lookupSearch, type: contactType, limit: pageSize, offset: lookupPage * pageSize }),
    enabled: form.audience_type === "manual" && sourceTab === "imported",
  });
  const { data: customerGroups = [], isLoading: customerGroupsLoading, error: customerGroupsError } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["marketing-customer-groups"],
    queryFn: getMarketingCustomerGroups,
    enabled: form.audience_type === "dynamic",
    staleTime: 5 * 60 * 1000,
  });
  const { data: preview, isFetching: previewLoading } = useQuery<any>({
    queryKey: ["marketing-audience-preview", form.dynamic_filters],
    queryFn: () => getMarketingAudiencePreview(form.dynamic_filters),
    enabled: form.audience_type === "dynamic",
  });
  const { data: memberData } = useQuery<any>({
    queryKey: ["marketing-audience-members", viewingMembers?.id, memberSearch, memberStatus, memberPage],
    queryFn: () => getMarketingAudienceMembers(viewingMembers.id, { search: memberSearch, status: memberStatus, limit: pageSize, offset: memberPage * pageSize }),
    enabled: Boolean(viewingMembers),
  });
  const save = useMutation({
    mutationFn: () => selected?.id
      ? updateMarketingAudience(selected.id, { ...form, customer_ids: form.audience_type === "manual" ? selectedIds : undefined, contact_ids: form.audience_type === "manual" ? selectedContactIds : undefined })
      : createMarketingAudience({ ...form, customer_ids: form.audience_type === "manual" ? selectedIds : undefined, contact_ids: form.audience_type === "manual" ? selectedContactIds : undefined }),
     onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-audiences"] }); setSelected(null); setForm({ name: "", description: "", audience_type: "manual", dynamic_filters: {} }); setSelectedIds([]); setSelectedContactIds([]); setAudienceEditorFocused(false); toast({ title: "Audience saved" }); },
    onError: (e: any) => toast({ title: "Unable to save audience", description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({ mutationFn: (id: number) => deleteMarketingAudience(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing-audiences"] }), onError: (e: any) => toast({ title: "Unable to delete audience", description: e.message, variant: "destructive" }) });
   const startNew = () => { setSelected(null); setForm({ name: "", description: "", audience_type: "manual", dynamic_filters: {} }); setSelectedIds([]); setSelectedContactIds([]); setViewingMembers(null); setAudienceEditorFocused(true); };
  const edit = async (a: any) => {
    const detail = await getMarketingAudience(a.id);
    setSelected(detail);
    setForm({ name: detail.name, description: detail.description, audience_type: detail.audience_type, dynamic_filters: detail.dynamic_filters || {} });
    setSelectedIds(detail.member_customer_ids || (detail.members || []).filter((m: any) => m.customer_id).map((m: any) => m.customer_id));
    setSelectedContactIds(detail.member_contact_ids || (detail.members || []).filter((m: any) => m.contact_id).map((m: any) => m.contact_id));
     setViewingMembers(null);
     setAudienceEditorFocused(true);
  };
  const visibleRows = sourceTab === "crm" ? (customerPage?.rows ?? []) : (contactPage?.rows ?? []);
  const total = sourceTab === "crm" ? customerPage?.total ?? 0 : contactPage?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);
  const allOnPage = visibleRows.length > 0 && visibleRows.every((row: any) => sourceTab === "crm" ? selectedIds.includes(row.id) : selectedContactIds.includes(row.id));
  const toggleAll = () => {
    const ids = visibleRows.map((row: any) => row.id);
    if (sourceTab === "crm") setSelectedIds(old => allOnPage ? old.filter(id => !ids.includes(id)) : Array.from(new Set([...old, ...ids])));
    else setSelectedContactIds(old => allOnPage ? old.filter(id => !ids.includes(id)) : Array.from(new Set([...old, ...ids])));
  };
  const importCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await importMarketingContacts(await file.text(), importType);
      toast({ title: "Contacts imported", description: `${result.imported} added, ${result.duplicates} duplicates skipped, ${result.invalid} invalid rows skipped.` });
      qc.invalidateQueries({ queryKey: ["marketing-contacts"] });
    } catch (e: any) { toast({ title: "Import failed", description: e.message, variant: "destructive" }); }
    finally { setImporting(false); event.target.value = ""; }
  };
  const setFilter = (key: string, value: any) => setForm((old: any) => ({ ...old, dynamic_filters: { ...old.dynamic_filters, [key]: value === "" || value === undefined || (Array.isArray(value) && value.length === 0) ? undefined : value } }));
  return <PageShell title="Audiences" subtitle="Build reusable CRM and imported-contact groups" action={hasPermission("marketing", "manage_audiences") ? <Button onClick={startNew}><Plus className="mr-2 h-4 w-4" /> New audience</Button> : undefined}>
     <div className={`grid gap-5 transition-[grid-template-columns] duration-300 ${audienceEditorFocused ? "lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)]" : "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"}`}>
      <section onFocusCapture={() => setAudienceEditorFocused(false)} className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-semibold text-slate-900">Saved audiences</h2><p className="text-xs text-slate-500">{audiences.length} audience{audiences.length === 1 ? "" : "s"}</p></div>{isLoading ? <div className="py-16 text-center text-sm text-slate-400">Loading audiences…</div> : audiences.length ? <div className="divide-y">{audiences.map((a: any) => <div key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-4"><span className="rounded-lg bg-violet-50 p-2 text-violet-600"><Users className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{a.name}</p><p className="text-xs text-slate-400">{a.audience_type === "dynamic" ? "Dynamic" : "Manual"} · {a.member_count} members</p></div><Button variant="outline" size="sm" onClick={() => { setViewingMembers(a); setMemberPage(0); setMemberSearch(""); }}>View members</Button><Button variant="ghost" size="sm" onClick={() => edit(a)}>Edit</Button>{hasPermission("marketing", "delete") && <Button variant="ghost" size="sm" className="text-red-600" onClick={() => { if (window.confirm("Delete this audience?")) remove.mutate(a.id); }}><Trash2 className="h-4 w-4" /></Button>}</div>)}</div> : <EmptyState icon={Users} text="No saved audiences yet" action="Create an audience" onClick={startNew} />}</section>
       <section onFocusCapture={() => setAudienceEditorFocused(true)} className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">{selected ? "Edit audience" : "New audience"}</h2><p className="text-xs text-slate-500">Suppression is evaluated again when a campaign sends.</p></div>{selected && <Button variant="ghost" size="sm" onClick={startNew}><X className="h-4 w-4" /></Button>}</div><div className="space-y-4"><label className="block text-sm font-medium text-slate-700">Name<Input className="mt-1.5" value={form.name} onChange={e => setForm((x: any) => ({ ...x, name: e.target.value }))} placeholder="VIP customers" /></label><label className="block text-sm font-medium text-slate-700">Description<textarea className="mt-1.5 min-h-16 w-full rounded-md border border-slate-200 p-3 text-sm" value={form.description} onChange={e => setForm((x: any) => ({ ...x, description: e.target.value }))} /></label><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.audience_type} onChange={e => { setForm((x: any) => ({ ...x, audience_type: e.target.value })); setLookupPage(0); }}><option value="manual">Manual selection</option><option value="dynamic">Dynamic filters</option></select>
         {form.audience_type === "dynamic" ? <div className="space-y-3"><div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"><label className="text-xs font-medium text-slate-600">Customer group<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.customerGroup || ""} disabled={customerGroupsLoading || Boolean(customerGroupsError)} onChange={e => setFilter("customerGroup", e.target.value)}><option value="">{customerGroupsLoading ? "Loading BigCommerce groups…" : "Any customer group"}</option>{form.dynamic_filters?.customerGroup && !customerGroups.some(group => group.name === form.dynamic_filters.customerGroup) && <option value={form.dynamic_filters.customerGroup}>{form.dynamic_filters.customerGroup} (saved value)</option>}{customerGroups.map(group => <option key={group.id} value={group.name}>{group.name}</option>)}</select>{customerGroupsError ? <span className="mt-1 block text-[10px] font-normal text-red-600">Unable to load BigCommerce groups.</span> : !customerGroupsLoading && !customerGroups.length && <span className="mt-1 block text-[10px] font-normal text-slate-400">No BigCommerce groups found.</span>}</label><label className="text-xs font-medium text-slate-600">Customer type<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.customerType || ""} onChange={e => setFilter("customerType", e.target.value)}><option value="">Any type</option><option value="Store">Store</option><option value="Distributor">Distributor</option></select></label><label className="text-xs font-medium text-slate-600">Account health<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.accountHealth || ""} onChange={e => setFilter("accountHealth", e.target.value)}><option value="">Any health</option><option value="Healthy">Healthy</option><option value="Watch">Watch</option><option value="At Risk">At Risk</option><option value="Lost">Lost</option></select></label><label className="text-xs font-medium text-slate-600">Account status<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.isActive === false ? "inactive" : form.dynamic_filters?.isActive === true ? "active" : ""} onChange={e => setFilter("isActive", e.target.value === "active" ? true : e.target.value === "inactive" ? false : undefined)}><option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="text-xs font-medium text-slate-600">State<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.state || ""} onChange={e => setFilter("state", e.target.value)}><option value="">Any U.S. state</option>{MARKETING_US_STATE_OPTIONS.map(([abbreviation, name]) => <option key={abbreviation} value={abbreviation}>{name} ({abbreviation})</option>)}</select></label><label className="text-xs font-medium text-slate-600">Minimum revenue<Input type="number" min="0" className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.minRevenue ?? ""} onChange={e => setFilter("minRevenue", e.target.value ? Number(e.target.value) : undefined)} /></label><label className="text-xs font-medium text-slate-600">Minimum orders<Input type="number" min="0" className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.minOrders ?? ""} onChange={e => setFilter("minOrders", e.target.value ? Number(e.target.value) : undefined)} /></label><label className="text-xs font-medium text-slate-600">Last order before<Input type="date" className="mt-1 h-9 w-full bg-white text-sm" value={form.dynamic_filters?.lastOrderBefore || ""} onChange={e => setFilter("lastOrderBefore", e.target.value)} /></label></div><DynamicFilterExtensions filters={form.dynamic_filters || {}} setFilter={setFilter} /><div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-blue-900">Live preview</p><span className="text-lg font-bold text-blue-700">{previewLoading ? "…" : preview?.total ?? 0}</span></div><p className="mt-1 text-xs text-blue-800/80">{preview?.suppressed ?? 0} suppressed · {Math.max(0, (preview?.total ?? 0) - (preview?.suppressed ?? 0))} eligible</p>{preview?.customers?.slice(0, 5).map((c: any) => <div key={c.id} className="mt-2 flex justify-between text-xs text-blue-900"><span className="truncate">{c.company || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</span><span className={c.marketing_suppressed ? "text-red-600" : "text-emerald-700"}>{c.marketing_suppressed ? "Suppressed" : "Eligible"}</span></div>)}</div></div> : <div className="space-y-3"><div className="flex gap-1 rounded-lg bg-slate-100 p-1"><Button type="button" size="sm" variant={sourceTab === "crm" ? "default" : "ghost"} className="flex-1" onClick={() => { setSourceTab("crm"); setLookupPage(0); }}>CRM customers</Button><Button type="button" size="sm" variant={sourceTab === "imported" ? "default" : "ghost"} className="flex-1" onClick={() => { setSourceTab("imported"); setLookupPage(0); }}>Leads & prospects</Button></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-8" placeholder="Search contacts…" value={lookupSearch} onChange={e => { setLookupSearch(e.target.value); setLookupPage(0); }} /></div>{sourceTab === "imported" && <select className="h-10 rounded-md border bg-white px-2 text-sm" value={contactType} onChange={e => { setContactType(e.target.value); setLookupPage(0); }}><option value="all">All types</option><option value="lead">Leads</option><option value="prospect">Prospects</option></select>}</div>{sourceTab === "imported" && <div className="rounded-lg border border-dashed p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs text-slate-500">CSV requires email; optional first_name, last_name, company, phone.</p><select className="h-8 rounded-md border bg-white px-2 text-xs" value={importType} onChange={e => setImportType(e.target.value as "lead" | "prospect")}><option value="lead">Lead</option><option value="prospect">Prospect</option></select></div><label className="mt-2 inline-flex cursor-pointer items-center rounded-md border bg-white px-3 py-2 text-xs font-medium text-slate-700">{importing ? "Importing…" : "Choose CSV file"}<input type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} disabled={importing || !hasPermission("marketing", "manage_audiences")} /></label></div>}<div className="flex items-center justify-between text-xs text-slate-500"><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={allOnPage} onChange={toggleAll} /> Select all on page</label><span>{selectedIds.length + selectedContactIds.length} selected across all pages</span></div><div className="max-h-64 space-y-1 overflow-auto rounded-md border p-2">{visibleRows.map((c: any) => { const checked = sourceTab === "crm" ? selectedIds.includes(c.id) : selectedContactIds.includes(c.id); return <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-xs hover:bg-slate-50"><input type="checkbox" checked={checked} onChange={e => sourceTab === "crm" ? setSelectedIds(old => e.target.checked ? [...new Set([...old, c.id])] : old.filter(x => x !== c.id)) : setSelectedContactIds(old => e.target.checked ? [...new Set([...old, c.id])] : old.filter(x => x !== c.id))} /><span className="min-w-0 flex-1 truncate">{c.company || [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email}</span><span className="max-w-[130px] truncate text-slate-400">{c.email}</span>{sourceTab === "imported" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">{c.contact_type}</span>}</label>; })}{!visibleRows.length && <p className="p-3 text-center text-xs text-slate-400">No contacts match this search.</p>}</div><div className="flex items-center justify-between text-xs text-slate-500"><span>{total} available</span><div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" disabled={lookupPage === 0} onClick={() => setLookupPage(p => p - 1)}>Previous</Button><span>{totalPages ? lookupPage + 1 : 0} / {totalPages || 0}</span><Button type="button" size="sm" variant="outline" disabled={!totalPages || lookupPage + 1 >= totalPages} onClick={() => setLookupPage(p => p + 1)}>Next</Button></div></div><p className="text-xs text-slate-400">Imported contacts stay outside the CRM mirror and can be reused in marketing audiences.</p></div>}<Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim() || !hasPermission("marketing", "manage_audiences")}>{save.isPending ? "Saving…" : "Save audience"}</Button></div></section>
     </div>
    {viewingMembers && <section className="rounded-xl border bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><div><h2 className="font-semibold text-slate-900">Members: {viewingMembers.name}</h2><p className="text-xs text-slate-500">{memberData?.total ?? viewingMembers.member_count ?? 0} members · live eligibility</p></div><Button variant="ghost" size="sm" onClick={() => setViewingMembers(null)}><X className="mr-1 h-4 w-4" /> Close</Button></div><div className="p-4"><div className="mb-3 flex flex-col gap-2 sm:flex-row"><Input className="max-w-md" placeholder="Search members…" value={memberSearch} onChange={e => { setMemberSearch(e.target.value); setMemberPage(0); }} /><select className="h-10 rounded-md border bg-white px-3 text-sm" value={memberStatus} onChange={e => { setMemberStatus(e.target.value); setMemberPage(0); }}><option value="all">All eligibility</option><option value="eligible">Eligible</option><option value="suppressed">Suppressed</option><option value="inactive">Inactive</option></select></div><div className="overflow-x-auto"><div className="min-w-[620px] divide-y rounded-md border">{(memberData?.rows ?? []).map((m: any) => <div key={m.member_id} className="grid grid-cols-[1.3fr_1fr_130px_110px] gap-3 px-3 py-3 text-xs"><span className="truncate font-medium text-slate-800">{m.company || [m.first_name, m.last_name].filter(Boolean).join(" ") || "Unnamed contact"}</span><span className="truncate text-slate-500">{m.email}</span><span className="capitalize text-slate-500">{m.source}{m.contact_type ? ` · ${m.contact_type}` : ""}</span><span className={m.status === "eligible" ? "text-emerald-700" : "text-red-600"}>{m.status}</span></div>)}{!memberData?.rows?.length && <p className="p-6 text-center text-sm text-slate-400">No members match this search.</p>}</div></div><div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500"><Button size="sm" variant="outline" disabled={memberPage === 0} onClick={() => setMemberPage(p => p - 1)}>Previous</Button><span>{memberData?.total ? memberPage + 1 : 0} / {memberData?.total ? Math.ceil(memberData.total / pageSize) : 0}</span><Button size="sm" variant="outline" disabled={!memberData?.total || memberPage + 1 >= Math.ceil(memberData.total / pageSize)} onClick={() => setMemberPage(p => p + 1)}>Next</Button></div></div></section>}
  </PageShell>;
}

function MarketingAudiencesLegacy() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasPermission } = usePermissions();
  const { data: audiences = [], isLoading } = useQuery<any[]>({ queryKey: ["marketing-audiences"], queryFn: getMarketingAudiences });
  const { data: customers = [] } = useQuery<any[]>({ queryKey: ["marketing-audience-customers"], queryFn: () => getMarketingAudienceCustomers() });
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState<any>({ name: "", description: "", audience_type: "manual", dynamic_filters: {} });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const save = useMutation({ mutationFn: () => selected?.id ? updateMarketingAudience(selected.id, { ...form, customer_ids: form.audience_type === "manual" ? selectedIds : undefined }) : createMarketingAudience({ ...form, customer_ids: form.audience_type === "manual" ? selectedIds : undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-audiences"] }); setSelected(null); setForm({ name: "", description: "", audience_type: "manual", dynamic_filters: {} }); setSelectedIds([]); toast({ title: "Audience saved" }); }, onError: (e: any) => toast({ title: "Unable to save audience", description: e.message, variant: "destructive" }) });
  const remove = useMutation({ mutationFn: (id: number) => deleteMarketingAudience(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing-audiences"] }), onError: (e: any) => toast({ title: "Unable to delete audience", description: e.message, variant: "destructive" }) });
  const startNew = () => { setSelected(null); setForm({ name: "", description: "", audience_type: "manual", dynamic_filters: {} }); setSelectedIds([]); };
  const edit = async (a: any) => { const detail = await getMarketingAudience(a.id); setSelected(detail); setForm({ name: detail.name, description: detail.description, audience_type: detail.audience_type, dynamic_filters: detail.dynamic_filters || {} }); setSelectedIds((detail.members || []).map((m: any) => m.id)); };
  return <PageShell title="Audiences" subtitle="Reusable customer groups built on your existing CRM data" action={hasPermission("marketing", "create") ? <Button onClick={startNew}><Plus className="mr-2 h-4 w-4" /> New audience</Button> : undefined}>
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]"><section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b px-5 py-4"><h2 className="font-semibold text-slate-900">Saved audiences</h2><p className="text-xs text-slate-500">{audiences.length} audience{audiences.length === 1 ? "" : "s"}</p></div>{isLoading ? <div className="py-16 text-center text-sm text-slate-400">Loading audiences…</div> : audiences.length ? <div className="divide-y">{audiences.map((a: any) => <div key={a.id} className="flex items-center gap-3 px-5 py-4"><span className="rounded-lg bg-violet-50 p-2 text-violet-600"><Users className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{a.name}</p><p className="text-xs text-slate-400">{a.audience_type === "dynamic" ? "Dynamic" : "Manual"} · {a.member_count} customers</p></div><Button variant="ghost" size="sm" onClick={() => edit(a)}>Edit</Button>{hasPermission("marketing", "delete") && <Button variant="ghost" size="sm" className="text-red-600" onClick={() => { if (window.confirm("Delete this audience?")) remove.mutate(a.id); }}><Trash2 className="h-4 w-4" /></Button>}</div>)}</div> : <EmptyState icon={Users} text="No saved audiences yet" action="Create an audience" onClick={startNew} />}</section>
       <section className="rounded-xl border bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">{selected ? "Edit audience" : "New audience"}</h2><p className="text-xs text-slate-500">Save a segment for future campaigns.</p></div>{selected && <Button variant="ghost" size="sm" onClick={startNew}><X className="h-4 w-4" /></Button>}</div><div className="space-y-4"><label className="block text-sm font-medium text-slate-700">Name<Input className="mt-1.5" value={form.name} onChange={e => setForm((x: any) => ({ ...x, name: e.target.value }))} placeholder="VIP customers" /></label><label className="block text-sm font-medium text-slate-700">Description<textarea className="mt-1.5 min-h-16 w-full rounded-md border border-slate-200 p-3 text-sm" value={form.description} onChange={e => setForm((x: any) => ({ ...x, description: e.target.value }))} /></label><select className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={form.audience_type} onChange={e => setForm((x: any) => ({ ...x, audience_type: e.target.value }))}><option value="manual">Manual selection</option><option value="dynamic">Dynamic filters</option></select>{form.audience_type === "dynamic" ? <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"><label className="text-xs font-medium text-slate-600">Customer group<Input className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.customerGroup || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, customerGroup: e.target.value } }))} placeholder="Optional group name" /></label><label className="text-xs font-medium text-slate-600">Customer type<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.customerType || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, customerType: e.target.value } }))}><option value="">Any type</option><option value="Store">Store</option><option value="Distributor">Distributor</option></select></label><label className="text-xs font-medium text-slate-600">Account health<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.accountHealth || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, accountHealth: e.target.value } }))}><option value="">Any health</option><option value="Healthy">Healthy</option><option value="Watch">Watch</option><option value="At Risk">At Risk</option><option value="Lost">Lost</option></select></label><label className="text-xs font-medium text-slate-600">Account status<select className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm" value={form.dynamic_filters?.isActive === false ? "inactive" : form.dynamic_filters?.isActive === true ? "active" : ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, ...(e.target.value ? { isActive: e.target.value === "active" } : { isActive: undefined }) } }))}><option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="text-xs font-medium text-slate-600">State<Input className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.state || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, state: e.target.value } }))} placeholder="PA, MD…" /></label><label className="text-xs font-medium text-slate-600">Minimum lifetime revenue<Input type="number" min="0" className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.minRevenue || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, minRevenue: e.target.value ? Number(e.target.value) : undefined } }))} /></label><label className="text-xs font-medium text-slate-600">Minimum orders<Input type="number" min="0" className="mt-1 h-9 bg-white text-sm" value={form.dynamic_filters?.minOrders || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, minOrders: e.target.value ? Number(e.target.value) : undefined } }))} /></label><label className="text-xs font-medium text-slate-600">Last order before<Input type="date" className="mt-1 h-9 w-full bg-white text-sm" value={form.dynamic_filters?.lastOrderBefore || ""} onChange={e => setForm((x: any) => ({ ...x, dynamic_filters: { ...x.dynamic_filters, lastOrderBefore: e.target.value } }))} /></label><p className="col-span-full text-xs text-slate-400">Dynamic filters recalculate from CRM data and exclude marketing-suppressed customers when used in a campaign.</p></div> : <div className="max-h-56 space-y-1 overflow-auto rounded-md border p-2">{customers.map((c: any) => <label key={c.id} className="flex items-center gap-2 rounded p-2 text-xs hover:bg-slate-50"><input type="checkbox" checked={selectedIds.includes(c.id)} onChange={e => setSelectedIds(old => e.target.checked ? [...old, c.id] : old.filter(x => x !== c.id))} /><span className="min-w-0 flex-1 truncate">{c.company || `${c.first_name} ${c.last_name}`}</span></label>)}</div>}<Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim() || !hasPermission("marketing", selected ? "edit" : "create")}>{save.isPending ? "Saving…" : "Save audience"}</Button></div></section>
    </div>
  </PageShell>;
}

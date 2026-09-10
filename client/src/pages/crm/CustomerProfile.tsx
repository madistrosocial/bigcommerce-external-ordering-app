t({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSavingBcNotes(false); }
  };

  // Next follow-up: nearest pending todo with a due_date
  const nextFollowUp = (todos as any[])
    .filter((t: any) => !t.completed_at && t.due_date)
    .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0] ?? null;

  const pendingTodos  = (todos as any[]).filter((t: any) => !t.completed_at);
  const totalActions  = (notes as any[]).length + (todos as any[]).length;

  const TABS: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "overview",  label: "Overview",  icon: <User className="h-3.5 w-3.5" /> },
    { id: "orders",    label: "Orders",    icon: <ShoppingBag className="h-3.5 w-3.5" /> },
    { id: "notes",     label: "Actions",   icon: <MessageSquare className="h-3.5 w-3.5" />, count: totalActions || undefined },
    { id: "timeline",  label: "Timeline",  icon: <Clock className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex flex-col min-h-full bg-slate-50">

      {/* ══════════════════════════════════════════════════════════════════════
          BACK NAV
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border-b px-4 md:px-6 py-2">
        <Button variant="ghost" size="sm" className="-ml-1 text-slate-500 hover:text-slate-800" onClick={() => setLocation("/crm/customers")} data-testid="btn-back-customers">
          <ArrowLeft className="h-4 w-4 mr-1.5" /> CRM Customers
        </Button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          HEADER CARD
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="px-3 sm:px-4 md:px-6 pt-3 sm:pt-4">
        <div className="bg-white border rounded-xl p-4 sm:p-5 shadow-sm">
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:flex sm:items-stretch sm:gap-4">

            {/* Avatar */}
            <div className="col-start-2 row-start-1 order-1 h-16 w-16 sm:h-14 sm:w-14 rounded-full bg-blue-100 flex items-center justify-center shrink-0 self-center justify-self-center sm:order-1 sm:col-auto sm:row-auto sm:justify-self-auto sm:self-start mt-0.5">
              <User className="h-8 w-8 sm:h-7 sm:w-7 text-blue-600" />
            </div>

            {/* Main info — grows */}
            <div className="order-3 col-span-3 w-full min-w-0 sm:order-2 sm:col-auto sm:flex-1">

              {/* Company name */}
              {customer.company && (
                <div className="flex items-center gap-1 text-slate-500 text-xs sm:text-sm mb-0.5">
                  <Building2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                  <span className="font-semibold text-slate-700 truncate">{customer.company}</span>
                </div>
              )}

              {/* Name + health */}
              <div className="flex items-center flex-wrap gap-1.5 mb-1.5">
                <h1 className="text-base sm:text-xl font-bold text-slate-900 leading-tight">
                  {[customer.first_name, customer.last_name].filter(Boolean).join(" ") || "—"}
                </h1>
                <HealthBadge health={customer.account_health} />
              </div>

              {/* Contact row */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs sm:text-sm text-slate-500 mb-2">
                {customer.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3 shrink-0" /><span className="truncate max-w-[180px] sm:max-w-none">{customer.email}</span></span>}
                {customer.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3 shrink-0" />{customer.phone}</span>}
                <span className="flex items-center gap-1"><Hash className="h-3 w-3 shrink-0" />BC {customer.bigcommerce_customer_id}</span>
                {customer.created_date && <span className="flex items-center gap-1 hidden sm:flex"><Calendar className="h-3 w-3 shrink-0" />Joined {fmt.date(customer.created_date)}</span>}
                {customer.customer_group_name && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3 shrink-0" />
                    <span className="truncate max-w-[120px] sm:max-w-none">{customer.customer_group_name}</span>
                    {customer.customer_group_id && <span className="text-slate-400">({customer.customer_group_id})</span>}
                  </span>
                )}
                {customer.created_date && <span className="flex items-center gap-1 sm:hidden"><Calendar className="h-3 w-3 shrink-0" />Joined {fmt.date(customer.created_date)}</span>}
              </div>

              {/* Rep row — both reps on one line, wrapping only if needed */}
              <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mb-2">
                {/* Primary Rep */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 font-medium shrink-0">Primary:</span>
                  {customer.primary_rep_name
                    ? <Badge variant="secondary" className="text-xs gap-1 h-6"><UserCheck className="h-3 w-3" />{customer.primary_rep_name}</Badge>
                    : <span className="text-xs text-slate-400">Unassigned</span>}
                  {canAssignRep && (
                    <>
                      <button
                        className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                        title={customer.primary_rep_name ? "Change rep" : "Assign rep"}
                        data-testid="btn-assign-primary-rep"
                        onClick={() => { setRepAssignMode("primary"); setSelectedRep(customer.primary_rep_id ? String(customer.primary_rep_id) : ""); setShowAssignRep(true); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {customer.primary_rep_name && (
                        <button
                          className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center text-slate-400 hover:border-red-300 hover:text-red-500 transition-colors"
                          title="Remove rep"
                          data-testid="btn-remove-primary-rep"
                          onClick={() => handleRemoveRep("primary")}
                        >
                          <UserMinus className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
                {/* Divider dot */}
                <span className="text-slate-300 text-xs select-none">·</span>
                {/* Secondary Rep */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 font-medium shrink-0">Secondary:</span>
                  {customer.secondary_rep_name
                    ? <Badge variant="secondary" className="text-xs gap-1 h-6"><UserCheck className="h-3 w-3" />{customer.secondary_rep_name}</Badge>
                    : <span className="text-xs text-slate-400">Unassigned</span>}
                  {canAssignRep && (
                    <>
                      <button
                        className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                        title={customer.secondary_rep_name ? "Change rep" : "Assign rep"}
                        data-testid="btn-assign-secondary-rep"
                        onClick={() => { setRepAssignMode("secondary"); setSelectedRep(customer.secondary_rep_id ? String(customer.secondary_rep_id) : ""); setShowAssignRep(true); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {customer.secondary_rep_name && (
                        <button
                          className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center text-slate-400 hover:border-red-300 hover:text-red-500 transition-colors"
                          title="Remove rep"
                          data-testid="btn-remove-secondary-rep"
                          onClick={() => handleRemoveRep("secondary")}
                        >
                          <UserMinus className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Address row — with address type badge inline */}
              <div className="flex items-center gap-2 min-w-0 mb-1.5">
                <span className="text-xs text-slate-500 font-medium shrink-0">Address:</span>
                {loadingAddresses ? (
                  <span className="text-xs text-slate-400">Loading…</span>
                ) : addressBook.length > 0 ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Select
                      value={String(Math.min(selectedAddressIdx, addressBook.length - 1))}
                      onValueChange={v => setSelectedAddressIdx(parseInt(v))}
                    >
                      <SelectTrigger className="h-6 text-xs flex-1 min-w-0 max-w-sm border border-slate-200 rounded-md px-2 gap-1" data-testid="select-address-book">
                        <SelectValue>
                          <span className="truncate">{formatBcAddress(addressBook[Math.min(selectedAddressIdx, addressBook.length - 1)])}</span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-w-sm">
                        {addressBook.map((addr: any, i: number) => (
                          <SelectItem key={i} value={String(i)}>
                            <div className="py-0.5">
                              {addr.company && <div className="font-medium text-xs text-slate-800">{addr.company}</div>}
                              <div className="text-xs text-slate-600">{formatBcAddress(addr)}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Address type badge inline */}
                    <span data-testid="text-address-type" className="shrink-0">
                      {customer.address_type === "Commercial"
                        ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">Commercial</span>
                        : customer.address_type === "Residential"
                        ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-700">Residential</span>
                        : null}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">No addresses on file</span>
                )}
              </div>

              {/* Next Follow Up */}
              {nextFollowUp && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-xs text-slate-500 font-medium shrink-0">Follow Up:</span>
                  <span className={`text-xs font-medium flex items-center gap-1 ${nextFollowUp.is_overdue ? "text-red-600" : "text-blue-600"}`}>
                    <Calendar className="h-3 w-3" />
                    {fmt.date(nextFollowUp.due_date)} — <span className="truncate max-w-[140px] sm:max-w-none">{nextFollowUp.title}</span>
                    {nextFollowUp.is_overdue && <span className="text-[10px] font-normal text-red-400">(overdue)</span>}
                  </span>
                </div>
              )}

              {/* Bottom meta row: Account type + customer type */}
              <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
                {/* Account type */}
                {canManageAccountType ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-500 font-medium">Account:</span>
                    <Select value={customer.account_type ?? "customer"} onValueChange={v => handleMasterFieldChange("account_type", v)}>
                      <SelectTrigger className="h-6 text-xs w-auto border border-slate-200 rounded-md px-2 gap-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer">Customer</SelectItem>
                        <SelectItem value="vendor">Vendor</SelectItem>
                        <SelectItem value="internal">Internal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : customer.account_type && customer.account_type !== "customer" ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-500 font-medium">Account:</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 capitalize">{customer.account_type}</span>
                  </div>
                ) : null}
                {/* Customer type */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500 font-medium">Type:</span>
                  <Select value={customer.customer_type ?? "Store"} onValueChange={v => handleMasterFieldChange("customer_type", v)}>
                    <SelectTrigger className="h-6 text-xs w-auto border border-slate-200 rounded-md px-2 gap-1" data-testid="select-customer-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Store">Store</SelectItem>
                      <SelectItem value="Distributor">Distributor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Right column: status badge + days counter */}
            <div className="col-start-3 row-start-1 order-2 self-center justify-self-end shrink-0 flex flex-col items-end gap-1 text-right sm:order-3 sm:self-auto sm:items-end sm:gap-2 sm:border-l sm:pl-4 sm:min-w-[72px]">

              {/* Active / Inactive status badge */}
              {canManageInactive ? (
                customer.inactive_at ? (
                  <div className="flex flex-col items-end gap-0.5">
                    <button
                      onClick={async () => {
                        try {
                          await fetch(`/api/crm/customers/${id}`, {
                            method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                            body: JSON.stringify({ restore_active: true }),
                          });
                          queryClient.invalidateQueries({ queryKey: ["crm", "customer", id] });
                          toast({ title: "Customer restored to active" });
                        } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                      }}
                       className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200 hover:bg-red-200 transition-colors cursor-pointer"
                      title="Click to restore active"
                    >
                      Inactive
                    </button>
                    {customer.inactive_reason && (
                      <span className="text-[10px] text-slate-400 text-right capitalize leading-tight max-w-[90px]">
                        {customer.inactive_reason.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => { setMarkInactiveReason(""); setMarkInactiveNotes(""); setShowMarkInactiveModal(true); }}
                     className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200 hover:bg-green-200 transition-colors cursor-pointer"
                    title="Click to mark inactive"
                  >
                    Active
                  </button>
                )
              ) : (
                 <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${customer.inactive_at ? "bg-red-100 text-red-700 border border-red-200" : "bg-green-100 text-green-700 border border-green-200"}`}>
                  {customer.inactive_at ? "Inactive" : "Active"}
                </span>
              )}

              {/* Days since last order */}
              {daysSince != null && (
                <div className="text-center sm:text-right mt-1">
                  <p className={`text-xs sm:text-3xl font-extrabold leading-none ${daysSince > 90 ? "text-red-500" : daysSince > 30 ? "text-amber-500" : "text-green-600"}`}>
                    {daysSince}d
                  </p>
                  <p className="text-[9px] sm:text-[11px] text-slate-400 mt-0.5">since last order</p>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SUMMARY CARDS ROW
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="px-4 md:px-6 pt-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard icon={<DollarSign className="h-4 w-4 text-green-500" />} label="Lifetime Revenue" value={fmtCurrency(customer.lifetime_revenue)} testId="text-lifetime-revenue" />
          <SummaryCard icon={<ShoppingBag className="h-4 w-4 text-blue-500" />} label="Lifetime Orders" value={lifetimeOrders.toLocaleString()} testId="text-lifetime-orders" />
          <SummaryCard icon={<TrendingUp className="h-4 w-4 text-purple-500" />} label="Avg Order Value" value={fmtCurrency(avgOrderValue)} />
          <SummaryCard icon={<Calendar className="h-4 w-4 text-amber-500" />} label="Last Order" value={customer.last_order_date ? fmt.date(customer.last_order_date) : "—"} testId="text-last-order-date" />
          <StoreCreditCard
            value={fmtCurrency(customer.store_credit_balance ?? 0)}
            updatedAt={customer.updated_at}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["crm", "customer", id] })}
            isRefreshing={loadingCustomer}
          />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB NAV
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="px-4 md:px-6 pt-3">
        <div className="bg-white border rounded-t-xl overflow-x-auto">
          <div className="flex gap-0 min-w-max px-2">
            {TABS.map(tab => (
              <button
                key={tab.id}
                data-testid={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                }`}
              >
                {tab.icon}{tab.label}
                {tab.count != null && (
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    activeTab === tab.id ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                  }`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB CONTENT
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="px-4 md:px-6 pb-6">
        <div className="bg-white border border-t-0 rounded-b-xl overflow-hidden">

          {/* ── OVERVIEW TAB ──────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="p-5 space-y-5">
              {hasPermission("marketing") && (
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <Mail className="h-5 w-5 text-blue-600" />
                  <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800">Marketing email preference</p><p className="text-xs text-slate-500">Separate from transactional order and invoice email.</p></div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${marketingPreference?.email_subscribed === false ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{marketingPreference?.email_subscribed === false ? "Unsubscribed" : "Subscribed"}</span>
                  {hasPermission("marketing", "manage_suppressions") && <Button size="sm" variant="outline" onClick={() => marketingPreferenceMutation.mutate(marketingPreference?.email_subscribed === false)} disabled={marketingPreferenceMutation.isPending}>{marketingPreference?.email_subscribed === false ? "Re-enable" : "Unsubscribe"}</Button>}
                </div>
              )}

              {/* Recent Notes + Recent Activity columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Recent Notes */}
                <div className="border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4 text-slate-400" />Recent Notes
                    </h2>
                    <div className="flex items-center gap-2">
                      {canCreateNote && (
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1" onClick={() => setShowAddNote(true)} data-testid="btn-add-note">
                          <Plus className="h-3 w-3" />Add
                        </Button>
                      )}
                      {(notes as any[]).length > 5 && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-blue-600" onClick={() => setActiveTab("notes")}>
                          View all ({(notes as any[]).length})
                        </Button>
                      )}
                    </div>
                  </div>
                  {loadingNotes ? (
                    <div className="flex items-center justify-center h-20 text-slate-400 text-sm">Loading…</div>
                  ) : recentNotes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-20 text-slate-400 text-xs">
                      <MessageSquare className="h-5 w-5 mb-1 opacity-30" />No notes yet
                    </div>
                  ) : (
                    <div className="divide-y">
                      {recentNotes.map((note: any) => (
                        <div key={note.id} className="px-4 py-3">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <NoteTypePill type={note.note_type} />
                          </div>
                          <p className="text-xs font-semibold text-slate-700 mb-0.5">{createdBy(note.created_by_name, note.created_by)}</p>
                          <p className="text-[11px] text-slate-400 mb-1">{fmt.dateTime(note.created_at)}</p>
                          <p className="text-xs text-slate-600 line-clamp-2">{note.note}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Activity */}
                <div className="border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-slate-400" />Recent Activity
                    </h2>
                    {(timeline as any[]).length > 10 && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-blue-600" onClick={() => setActiveTab("timeline")}>
                        View all
                      </Button>
                    )}
                  </div>
                  {loadingTimeline ? (
                    <div className="flex items-center justify-center h-20 text-slate-400 text-sm">Loading…</div>
                  ) : recentTimeline.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-20 text-slate-400 text-xs">No activity yet</div>
                  ) : (
                    <div className="px-4 py-3 space-y-0">
                      {recentTimeline.map((entry: any, i: number) => {
                        const isLast = i === recentTimeline.length - 1;
                        return (
                          <div key={entry.id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${TimelineIconBg(entry.type, entry.action)}`}>
                                <TimelineIconEl type={entry.type} action={entry.action} />
                              </div>
                              {!isLast && <div className="w-px flex-1 bg-slate-200 my-1" />}
                            </div>
                            <div className={`pb-3 flex-1 min-w-0 ${isLast ? "pb-0" : ""}`}>
                              <p className="text-[10px] text-slate-400 mb-0.5">{fmt.relative(entry.date)}</p>
                              <TimelineDescription entry={entry} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Order History (latest 20) — replaces Customer Summary panel */}
              <div className="border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <ShoppingBag className="h-4 w-4 text-slate-400" />Order History (Latest 20)
                  </h2>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-blue-600" onClick={() => setActiveTab("orders")} data-testid="btn-view-all-orders">
                    View All Orders →
                  </Button>
                </div>
                <CustomerOrdersPanel
                  crmCustomerId={id}
                  limit={20}
                  customerInfo={{
                    name: customer.company || [customer.first_name, customer.last_name].filter(Boolean).join(" "),
                    email: customer.email ?? null,
                    company: customer.company ?? null,
                    bigcommerceCustomerId: customer.bigcommerce_customer_id ?? null,
                  }}
                />
              </div>
            </div>
          )}

          {/* ── ORDERS TAB ────────────────────────────────────────────────── */}
          {activeTab === "orders" && (
            <div>
              <div className="px-4 py-3 border-b bg-slate-50">
                <h2 className="text-sm font-semibold text-slate-700">Order History</h2>
              </div>
              <CustomerOrdersPanel
                crmCustomerId={id}
                customerInfo={{
                  name: customer.company || [customer.first_name, customer.last_name].filter(Boolean).join(" "),
                  email: customer.email ?? null,
                  company: customer.company ?? null,
                  bigcommerceCustomerId: customer.bigcommerce_customer_id ?? null,
                }}
              />
            </div>
          )}

          {/* ── NOTES TAB ─────────────────────────────────────────────────── */}
          {activeTab === "notes" && (
            <div>

              {/* ── SECTION 1: Customer Account Notes (BigCommerce) ────────── */}
              <div className="border-b">
                <div className="px-4 py-3 bg-slate-50 flex items-center justify-between gap-3 flex-wrap border-b">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                      <BookOpen className="h-4 w-4 text-slate-400" />
                      Customer Account Notes
                    </h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Permanent account-level notes synced with BigCommerce.
                    </p>
                  </div>
                  {canEditBcNotes && (
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1.5 shrink-0"
                      onClick={handleSaveBcNotes}
                      disabled={savingBcNotes || loadingBcNotes || generalNotesEdit === null || generalNotesEdit === (bcNotesData?.generalNotes ?? "")}
                      data-testid="btn-save-bc-notes"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {savingBcNotes ? "Saving…" : "Save To BigCommerce"}
                    </Button>
                  )}
                </div>
                {loadingBcNotes ? (
                  <div className="flex items-center justify-center h-24 text-slate-400 text-sm">Loading from BigCommerce…</div>
                ) : (
                  <div className="p-4">
                    <Textarea
                      data-testid="textarea-general-notes"
                      value={generalNotesEdit ?? ""}
                      onChange={e => canEditBcNotes && setGeneralNotesEdit(e.target.value)}
                      readOnly={!canEditBcNotes}
                      placeholder={canEditBcNotes ? "Enter general account notes here…" : "No account notes."}
                      className={`min-h-[140px] text-sm font-mono resize-y w-full ${!canEditBcNotes ? "bg-slate-50 cursor-default" : ""}`}
                    />
                  </div>
                )}
              </div>

              {/* ── SECTION 2: CRM Notes ───────────────────────────────────── */}
              <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-slate-400" />
                  CRM Notes {(notes as any[]).length > 0 && <span className="text-xs font-normal text-slate-400">({(notes as any[]).length})</span>}
                </h2>
                {canCreateNote && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAddNote(true)} data-testid="btn-add-note-tab">
                    <Plus className="h-3.5 w-3.5" />Add Note
                  </Button>
                )}
              </div>
              {loadingNotes ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading…</div>
              ) : (notes as any[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                  <MessageSquare className="h-8 w-8 mb-2 opacity-20" />
                  <p className="text-sm">No notes yet</p>
                  {canCreateNote && <Button size="sm" variant="outline" className="mt-2 text-xs" onClick={() => setShowAddNote(true)}>Add first note</Button>}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr className="border-b bg-slate-50">
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Date & Time</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Type</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Order #</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Note</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">Created By</th>
                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(notes as any[]).map((note: any) => (
                        <tr key={note.id} data-testid={`note-row-${note.id}`} className="border-b last:border-0 hover:bg-slate-50 align-top">
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmt.dateTime(note.created_at)}</td>
                          <td className="px-4 py-3"><NoteTypePill type={note.note_type} /></td>
                          <td className="px-4 py-3 text-xs text-indigo-600 font-mono whitespace-nowrap">
                            {note.order_id ? `#${note.order_id}` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700 max-w-[320px]">
                            <p className="whitespace-pre-wrap break-words">{note.note}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap font-medium">
                            {createdBy(note.created_by_name, note.created_by)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {canEditNote && (isAdmin || note.created_by === currentUserId) && (
                                <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600" onClick={() => setEditingNote(note)} data-testid={`btn-edit-note-${note.id}`} title="Edit note">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canDeleteNote && (
                                <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-red-600" onClick={() => setDeletingNoteId(note.id)} data-testid={`btn-delete-note-${note.id}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── SECTION 3: To Dos ──────────────────────────────────────────── */}
              <div className="px-4 py-3 border-t border-b bg-slate-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <CheckSquare className="h-4 w-4 text-slate-400" />
                  To Dos {pendingTodos.length > 0 && <span className="text-xs font-normal text-slate-400">({pendingTodos.length} pending)</span>}
                </h2>
                {canManageTodos && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAddTodo(true)}>
                    <Plus className="h-3.5 w-3.5" />New To Do
                  </Button>
                )}
              </div>
              {loadingTodos ? (
                <div className="flex items-center justify-center h-20 text-slate-400 text-sm">Loading…</div>
              ) : (todos as any[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-20 text-slate-400">
                  <p className="text-sm">No to dos</p>
                  {canManageTodos && <Button size="sm" variant="outline" className="mt-1.5 text-xs" onClick={() => setShowAddTodo(true)}>Create first to do</Button>}
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {(todos as any[])
                    .sort((a, b) => {
                      if (!!a.completed_at !== !!b.completed_at) return a.completed_at ? 1 : -1;
                      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
                      if (a.due_date) return -1;
                      if (b.due_date) return 1;
                      return 0;
                    })
                    .map((todo: any) => {
                      const isDone = !!todo.completed_at;
                      const isOverdue = todo.is_overdue && !isDone;
                      const PRIORITY_COLORS: Record<string, string> = { high: "bg-red-100 text-red-700 border-red-200", medium: "bg-amber-100 text-amber-700 border-amber-200", low: "bg-slate-100 text-slate-500 border-slate-200" };
                      return (
                        <div key={todo.id} className={`flex items-start gap-3 p-3 rounded-lg border ${isDone ? "bg-slate-50 opacity-60" : "bg-white"}`}>
                          <button
                            onClick={() => updateTodoMutation.mutate({ todoId: todo.id, data: { completed: !isDone } })}
                            className={`mt-0.5 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${isDone ? "bg-green-500 border-green-500 text-white" : "border-slate-300 hover:border-blue-500"}`}
                          >
                            {isDone && <span className="text-white text-[10px] font-bold">✓</span>}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-sm font-medium ${isDone ? "line-through text-slate-400" : "text-slate-800"}`}>{todo.title}</span>
                              {todo.priority && <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border capitalize ${PRIORITY_COLORS[todo.priority] ?? PRIORITY_COLORS.medium}`}>{todo.priority}</span>}
                            </div>
                            {todo.note && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{todo.note}</p>}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-slate-400">
                              {todo.due_date && <span className={`flex items-center gap-1 ${isOverdue ? "text-red-500 font-medium" : ""}`}><Calendar className="h-3 w-3" />Due {fmt.date(todo.due_date)}{isOverdue && " (overdue)"}</span>}
                              {todo.assigned_to_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{todo.assigned_to_name}</span>}
                              {todo.completed_at && <span><Clock className="h-3 w-3 inline mr-0.5" />Done {fmt.relative(todo.completed_at)}</span>}
                            </div>
                          </div>
                          {canManageTodos && (
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => setEditingTodo(todo)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setDeletingTodoId(todo.id)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ── TIMELINE TAB ──────────────────────────────────────────────── */}
          {activeTab === "timeline" && (
            <div>
              <div className="px-4 py-3 border-b bg-slate-50">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-slate-400" />Activity Timeline
                </h2>
              </div>
              {loadingTimeline ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading…</div>
              ) : (timeline as any[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-slate-400 text-sm">No activity recorded.</div>
              ) : (
                <div className="p-5 space-y-0">
                  {(timeline as any[]).map((entry: any, i: number) => {
                    const isLast = i === (timeline as any[]).length - 1;
                    const actor = entry.type === "note"
                      ? createdBy(entry.created_by_name, entry.created_by)
                      : entry.type === "audit"
                      ? createdBy(entry.user_name, entry.user_id)
                      : "System";
                    return (
                      <div key={entry.id} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${TimelineIconBg(entry.type, entry.action)}`}>
                            <TimelineIconEl type={entry.type} action={entry.action} />
                          </div>
                          {!isLast && <div className="w-px flex-1 bg-slate-200 my-1 min-h-[12px]" />}
                        </div>
                        <div className={`pb-5 flex-1 min-w-0 ${isLast ? "pb-0" : ""}`}>
                          <TimelineDescription entry={entry} />
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            <span className="font-medium text-slate-500">{actor}</span>
                            {" · "}{fmt.relative(entry.date)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}


        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════════════════════════ */}

      <NoteModal
        open={showAddNote} title="Add Action"
        onClose={() => setShowAddNote(false)}
        onSave={data => createNoteMutation.mutate(data)}
        onSaveTodo={data => createTodoMutation.mutate(data)}
        saving={createNoteMutation.isPending || createTodoMutation.isPending}
        orders={orders as any[]}
        users={crmUsers as { id: number; name: string }[]}
        currentUserId={currentUserId}
      />
      {editingNote && (
        <NoteModal
          open={!!editingNote} title="Edit Note"
          initial={{ note: editingNote.note, note_type: editingNote.note_type, order_id: editingNote.order_id }}
          onClose={() => setEditingNote(null)}
          onSave={data => updateNoteMutation.mutate({ noteId: editingNote.id, data })}
          saving={updateNoteMutation.isPending}
          orders={orders as any[]}
        />
      )}
      <Dialog open={deletingNoteId !== null} onOpenChange={v => { if (!v) setDeletingNoteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Note?</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">This note will be permanently deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingNoteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingNoteId && deleteNoteMutation.mutate(deletingNoteId)} disabled={deleteNoteMutation.isPending} data-testid="btn-confirm-delete-note">
              {deleteNoteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showAssignRep} onOpenChange={v => { if (!v) setShowAssignRep(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{repAssignMode === "primary" ? "Assign Primary Rep" : "Assign Secondary Rep"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Select Rep</Label>
            <Select value={selectedRep} onValueChange={setSelectedRep}>
              <SelectTrigger data-testid="select-assign-rep"><SelectValue placeholder="Choose a rep…" /></SelectTrigger>
              <SelectContent>
                {(crmUsers as { id: number; name: string }[])
                  .filter(u => {
                    if (repAssignMode === "primary" && customer?.secondary_rep_id) return String(u.id) !== String(customer.secondary_rep_id);
                    if (repAssignMode === "secondary" && customer?.primary_rep_id) return String(u.id) !== String(customer.primary_rep_id);
                    return true;
                  })
                  .map(u => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignRep(false)}>Cancel</Button>
            <Button onClick={handleAssignRep} disabled={!selectedRep || assignSaving} data-testid="btn-confirm-assign-rep">
              {assignSaving ? "Saving…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* ── Mark Inactive Modal ─────────────────────────────────────────────── */}
      <Dialog open={showMarkInactiveModal} onOpenChange={v => { if (!v) setShowMarkInactiveModal(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark Customer Inactive</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            <span className="font-medium">{customer?.company || [customer?.first_name, customer?.last_name].filter(Boolean).join(" ")}</span> will be hidden from active customer lists.
          </p>
          <div className="space-y-3 mt-1">
            <div>
              <Label className="text-xs mb-1.5 block">Reason</Label>
              <Select value={markInactiveReason || "__none__"} onValueChange={v => setMarkInactiveReason(v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select reason…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No reason specified</SelectItem>
                  <SelectItem value="no_longer_ordering">No Longer Ordering</SelectItem>
                  <SelectItem value="closed">Business Closed</SelectItem>
                  <SelectItem value="duplicate">Duplicate Account</SelectItem>
                  <SelectItem value="test_account">Test Account</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Notes (optional)</Label>
              <Textarea value={markInactiveNotes} onChange={e => setMarkInactiveNotes(e.target.value)} placeholder="Additional context…" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkInactiveModal(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={savingMarkInactive}
              onClick={async () => {
                setSavingMarkInactive(true);
                try {
                  const r = await fetch(`/api/crm/customers/${id}`, {
                    method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                    body: JSON.stringify({ mark_inactive: true, inactive_reason: markInactiveReason || null, inactive_notes: markInactiveNotes || null }),
                  });
                  if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
                  queryClient.invalidateQueries({ queryKey: ["crm", "customer", id] });
                  toast({ title: "Customer marked inactive" });
                  setShowMarkInactiveModal(false);
                } catch (e: any) {
                  toast({ title: "Error", description: e.message, variant: "destructive" });
                } finally { setSavingMarkInactive(false); }
              }}
            >
              {savingMarkInactive ? "Saving…" : "Mark Inactive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add To Do Modal ──────────────────────────────────────────────────── */}
      <Dialog open={showAddTodo} onOpenChange={v => { if (!v) { setShowAddTodo(false); setTodoTitle(""); setTodoNote(""); setTodoPriority("medium"); setTodoDueDate(""); setTodoAssignedTo(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New To Do</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1.5 block">Title *</Label>
              <Input value={todoTitle} onChange={e => setTodoTitle(e.target.value)} placeholder="What needs to be done?" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Description</Label>
              <Textarea value={todoNote} onChange={e => setTodoNote(e.target.value)} placeholder="Optional details…" rows={2} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-xs mb-1.5 block">Priority</Label>
                <Select value={todoPriority} onValueChange={setTodoPriority}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-xs mb-1.5 block">Due Date</Label>
                <Input type="date" value={todoDueDate} onChange={e => setTodoDueDate(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddTodo(false); setTodoTitle(""); setTodoNote(""); setTodoPriority("medium"); setTodoDueDate(""); }}>Cancel</Button>
            <Button
              onClick={() => createTodoMutation.mutate({ title: todoTitle, note: todoNote, priority: todoPriority, due_date: todoDueDate || null })}
              disabled={!todoTitle.trim() || createTodoMutation.isPending}
            >
              {createTodoMutation.isPending ? "Saving…" : "Create To Do"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit To Do Modal ─────────────────────────────────────────────────── */}
      {editingTodo && (
        <Dialog open={!!editingTodo} onOpenChange={v => { if (!v) setEditingTodo(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Edit To Do</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1.5 block">Title *</Label>
                <Input value={editingTodo.title ?? ""} onChange={e => setEditingTodo((t: any) => ({ ...t, title: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Description</Label>
                <Textarea value={editingTodo.note ?? ""} onChange={e => setEditingTodo((t: any) => ({ ...t, note: e.target.value }))} rows={2} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label className="text-xs mb-1.5 block">Priority</Label>
                  <Select value={editingTodo.priority ?? "medium"} onValueChange={v => setEditingTodo((t: any) => ({ ...t, priority: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Label className="text-xs mb-1.5 block">Due Date</Label>
                  <Input
                    type="date"
                    value={editingTodo.due_date ? new Date(editingTodo.due_date).toISOString().split("T")[0] : ""}
                    onChange={e => setEditingTodo((t: any) => ({ ...t, due_date: e.target.value || null }))}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingTodo(null)}>Cancel</Button>
              <Button
                onClick={() => updateTodoMutation.mutate({ todoId: editingTodo.id, data: { title: editingTodo.title, note: editingTodo.note, priority: editingTodo.priority, due_date: editingTodo.due_date || null } })}
                disabled={!editingTodo.title?.trim() || updateTodoMutation.isPending}
              >
                {updateTodoMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Delete To Do Confirm ─────────────────────────────────────────────── */}
      <Dialog open={deletingTodoId !== null} onOpenChange={v => { if (!v) setDeletingTodoId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete To Do</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">This to do will be permanently deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingTodoId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deletingTodoId && deleteTodoMutation.mutate(deletingTodoId)} disabled={deleteTodoMutation.isPending}>
              {deleteTodoMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, testId }: { icon: React.ReactNode; label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-xl border px-3 py-2.5 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 mb-1">{icon}<span className="text-xs text-slate-500">{label}</span></div>
      <p className="text-lg font-bold text-slate-900" data-testid={testId}>{value}</p>
    </div>
  );
}

function StoreCreditCard({ value, updatedAt, onRefresh, isRefreshing }: {
  value: string;
  updatedAt: string | Date | null | undefined;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const fmt = useTimeService();
  return (
    <div className="rounded-xl border px-3 py-2.5 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <CreditCard className="h-4 w-4 text-teal-500" />
          <span className="text-xs text-slate-500">Store Credit</span>
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          data-testid="btn-refresh-store-credit"
          className="text-slate-400 hover:text-teal-600 transition-colors disabled:opacity-40"
          title="Refresh store credit from BigCommerce"
        >
          <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
      </div>
      <p className="text-lg font-bold text-slate-900" data-testid="text-store-credit">{value}</p>
      {updatedAt && (
        <p className="text-[10px] text-slate-400 mt-0.5">Updated {fmt.relative(updatedAt)}</p>
      )}
    </div>
  );
}

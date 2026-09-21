             const maxPurchase =
                        item.variant?.max_purchase_quantity ??
                        item.product.max_purchase_quantity ??
                        null;
                      return maxPurchase != null && maxPurchase > 0 ? (
                        <div
                          className="flex items-start gap-1.5 mt-1.5 bg-amber-50 border border-amber-300 rounded px-2 py-1.5 text-xs text-amber-800"
                          data-testid={`warning-max-purchase-${item.lineId}`}
                        >
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px text-amber-500" />
                          <span>
                            <strong>BC Max Purchase Limit: {maxPurchase}</strong> — limit will be automatically removed at checkout and restored after.
                          </span>
                        </div>
                      ) : null;
                    })()}

                    {/* Price display */}
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span
                        className={`text-xl font-bold ${isDiscounted || isFree ? "text-red-600" : "text-slate-900"}`}
                      >
                        ${fmtPrice(item.price_at_sale)}
                      </span>
                      {(isDiscounted || isFree) && (
                        <span className="text-xs text-slate-400 line-through">
                          ${fmtPrice(item.original_price)}
                        </span>
                      )}
                      {isFree && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] h-4 px-1"
                        >
                          FREE
                        </Badge>
                      )}
                      {hasPct && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] h-4 px-1"
                        >
                          -{item.discount_value}%
                        </Badge>
                      )}
                      {item.price_source === "price_list" &&
                        item.price_tier_label && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white leading-none self-center"
                            style={{
                              backgroundColor:
                                item.price_tier_color || "#6366f1",
                            }}
                            data-testid={`badge-tier-active-${item.lineId}`}
                          >
                            {item.price_tier_label}
                          </span>
                        )}
                      {item.price_source === "historical" && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-bold text-purple-600 bg-purple-50 leading-none self-center"
                          data-testid={`badge-hist-active-${item.lineId}`}
                        >
                          HIST
                        </span>
                      )}
                      {item.price_source === "custom" && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-bold text-amber-700 bg-amber-50 leading-none self-center"
                          data-testid={`badge-custom-active-${item.lineId}`}
                        >
                          CUSTOM
                        </span>
                      )}
                    </div>

                    {/* Discount controls */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Last $ button */}
                      {selectedCustomer && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs"
                          disabled={loadingHistoryLineId === item.lineId}
                          onClick={async () => {
                            setLoadingHistoryLineId(item.lineId);
                            try {
                              const hist = await fetchPriceHistory(item);
                              if (hist.length === 0) {
                                toast({
                                  title: "No price history",
                                  variant: "destructive",
                                  duration: 2000,
                                });
                                return;
                              }
                              applyManualPrice(
                                item,
                                index,
                                hist[0].price,
                                "historical",
                              );
                            } finally {
                              setLoadingHistoryLineId(null);
                              focusSearch();
                            }
                          }}
                          data-testid={`button-pos-last-price-${item.lineId}`}
                        >
                          {loadingHistoryLineId === item.lineId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Last $"
                          )}
                        </Button>
                      )}
                      {/* History dropdown */}
                      {selectedCustomer &&
                        (() => {
                          const hkey = historyKey(item);
                          const hist = priceHistoryCache.get(hkey) ?? [];
                          const isOpen = openHistoryLineId === item.lineId;
                          return (
                            <div className="relative">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 text-xs"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (isOpen) {
                                    setOpenHistoryLineId(null);
                                    return;
                                  }
                                  setLoadingHistoryLineId(item.lineId);
                                  try {
                                    await fetchPriceHistory(item);
                                  } finally {
                                    setLoadingHistoryLineId(null);
                                  }
                                  setOpenHistoryLineId(item.lineId);
                                  focusSearch();
                                }}
                                data-testid={`button-pos-history-${item.lineId}`}
                              >
                                History ▾
                              </Button>
                              {isOpen && (
                                <div
                                  className="absolute left-0 top-full mt-1 w-56 bg-white border rounded-md shadow-lg z-50 py-1"
                                  onMouseDown={(e) => e.preventDefault()}
                                >
                                  {hist.length === 0 ? (
                                    <p className="px-3 py-2 text-xs text-slate-500">
                                      No history
                                    </p>
                                  ) : (
                                    hist.map((h, hi) => (
                                      <button
                                        key={hi}
                                        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 border-b last:border-0"
                                        onClick={() => {
                                          applyManualPrice(
                                            item,
                                            index,
                                            h.price,
                                            "historical",
                                          );
                                          setOpenHistoryLineId(null);
                                          focusSearch();
                                        }}
                                        data-testid={`option-history-${item.lineId}-${hi}`}
                                      >
                                        <p className="text-sm font-bold text-green-600">
                                          ${fmtPrice(parseFloat(h.price))}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                          {h.date ? fmt.date(h.date) : ""}
                                          {h.orderId ? ` | #${h.orderId}` : ""}
                                        </p>
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="Disc (%)"
                        className="w-28 h-8 text-xs bg-white"
                        value={discountInput}
                        onChange={(e) =>
                          setDiscountInputs((p) => ({
                            ...p,
                            [item.lineId]: e.target.value,
                          }))
                        }
                        onBlur={(e) => {
                          const pct = parseFloat(e.target.value);
                          if (!isNaN(pct) && pct >= 0 && pct <= 100)
                            applyPercent(item, index, pct);
                          else if (!e.target.value && hasPct)
                            clearLineDiscount(item, index);
                          focusSearch();
                        }}
                        data-testid={`input-pos-discount-${item.lineId}`}
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Price ($)"
                        className="w-32 h-8 text-xs bg-white"
                        value={manualInput}
                        onChange={(e) =>
                          setManualPriceInputs((p) => ({
                            ...p,
                            [item.lineId]: e.target.value,
                          }))
                        }
                        onBlur={(e) => {
                          if (e.target.value)
                            applyManualPrice(item, index, e.target.value);
                          focusSearch();
                        }}
                        data-testid={`input-pos-price-${item.lineId}`}
                      />
                      {(isDiscounted || isFree || manualInput) && (
                        <button
                          className="text-xs text-slate-400 hover:text-slate-700 underline"
                          onClick={() => {
                            clearLineDiscount(item, index);
                            focusSearch();
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    <div className="flex justify-between text-xs text-slate-600 pt-0.5">
                      <span>Line total</span>
                      <span className="font-bold text-slate-900 text-sm">
                        ${fmtPrice(item.price_at_sale * item.quantity)}
                      </span>
                    </div>
                  </div>
                );
              })
            ))}
          </div>

          {/* Notes section */}
          {!wholesaleMode && cart.length > 0 && (
            <div className="px-3 py-2 border-t shrink-0 space-y-2">
              {notesSectionContent}
            </div>
          )}

          {!wholesaleMode && (
          <div className="border-t px-4 py-3 bg-slate-50 shrink-0 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">
                {totalQty} item{totalQty !== 1 ? "s" : ""}
              </span>
              {totalDiscount > 0 && (
                <span
                  className="text-sm text-red-500 font-medium"
                  data-testid="text-pos-discount"
                >
                  Item Discount: -${fmtPrice(totalDiscount)}
                </span>
              )}
            </div>
            {cartDiscountAmount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">
                  {cartDiscount?.type === "store_credit"
                    ? "Store Credit"
                    : "Discount"}
                </span>
                <span
                  className="text-sm font-semibold text-red-500"
                  data-testid="text-pos-cart-discount"
                >
                  -${fmtPrice(cartDiscountAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-base font-semibold text-slate-700">
                Total
              </span>
              <span
                className="text-2xl font-bold text-slate-900"
                data-testid="text-pos-total"
              >
                ${fmtPrice(adjustedTotal)}
              </span>
            </div>

            {cart.length > 0 && !selectedCustomer && (
              <div className="flex items-center gap-1.5 pt-1 text-amber-600 text-xs font-medium">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Select a customer to enable checkout
              </div>
            )}
            {cart.length > 0 && selectedCustomer && !selectedAddress && (
              <div className="flex items-center gap-1.5 pt-1 text-amber-600 text-xs font-medium">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                No address found for this customer
              </div>
            )}

            {/* Max qty override log — collapsible summary */}
            {(() => {
              const limitedItems = cart.filter(item => {
                const m = item.variant?.max_purchase_quantity ?? item.product.max_purchase_quantity ?? null;
                return m != null && m > 0;
              });
              if (limitedItems.length === 0) return null;
              return (
                <div className="mt-2 bg-amber-50 border border-amber-300 rounded" data-testid="max-qty-override-log">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 hover:bg-amber-100 rounded transition-colors"
                    onClick={() => setShowOverrideLog(v => !v)}
                    data-testid="button-toggle-override-log"
                  >
                    <span className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      Max Qty Override — {limitedItems.length} item{limitedItems.length !== 1 ? "s" : ""} · Limits removed before checkout
                    </span>
                    <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${showOverrideLog ? "rotate-180" : ""}`} />
                  </button>
                  {showOverrideLog && (
                    <div className="px-2 pb-2 space-y-1 border-t border-amber-200">
                      <div className="pt-1 space-y-0.5">
                        {limitedItems.map(item => {
                          const maxQty = item.variant?.max_purchase_quantity ?? item.product.max_purchase_quantity;
                          return (
                            <div key={item.lineId} className="flex justify-between text-[11px] text-amber-800" data-testid={`log-entry-${item.lineId}`}>
                              <span className="truncate mr-2">{item.product.name}{item.variant ? ` (${item.variant.sku})` : ""}</span>
                              <span className="shrink-0 font-semibold">Max: {maxQty}</span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-amber-600 pt-0.5 border-t border-amber-200">Limits removed before checkout · restored after</p>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                disabled={cart.length === 0 || isSubmitting}
                onClick={handleSaveDraft}
                data-testid="button-pos-save-draft"
              >
                <FileText className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
              <Button
                className="flex-1"
                size="lg"
                disabled={
                  cart.length === 0 ||
                  !selectedCustomer ||
                  !selectedAddress ||
                  isSubmitting
                }
                onClick={handleCheckoutClick}
                data-testid="button-pos-checkout"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                {isSubmitting ? "Processing…" : "Checkout"}
              </Button>
            </div>

            {/* ── Inline sync row ── */}
            <div
              className="flex items-center gap-2 pt-1.5 border-t mt-2"
              data-testid="pos-sync-footer"
            >
              <button
                onClick={syncPriceHistory}
                disabled={isSyncing}
                className="text-blue-600 font-medium text-xs disabled:opacity-50 shrink-0"
                data-testid="button-sync-prices"
              >
                {isSyncing ? "Syncing..." : "Sync"}
              </button>
              <span
                className="text-gray-400 text-xs truncate"
                data-testid="text-sync-status"
              >
                {syncStatusText}
              </span>
            </div>
          </div>
          )}
          {/* ── Wholesale sticky footer ── */}
          {wholesaleMode && (
            <div className="shrink-0 border-t bg-white px-4 py-3 shadow-inner">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-2xl font-bold text-slate-900">${fmtPrice(adjustedTotal)}</span>
                  <span className="text-sm text-slate-500 ml-1">{totalQty} item{totalQty !== 1 ? "s" : ""}</span>
                  {totalDiscount > 0 && <span className="text-sm text-red-500 font-medium ml-1">· -{fmtPrice(totalDiscount)}</span>}
                  {cartDiscountAmount > 0 && <span className="text-sm text-red-500 font-medium ml-1">· -{fmtPrice(cartDiscountAmount)}</span>}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={cart.length === 0 || isSubmitting} onClick={handleSaveDraft} data-testid="button-ws-save-draft">
                    <FileText className="h-4 w-4 mr-1.5" />Save Draft
                  </Button>
                  <Button disabled={cart.length === 0 || !selectedCustomer || !selectedAddress || isSubmitting} onClick={handleCheckoutClick} data-testid="button-ws-checkout">
                    {isSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CreditCard className="h-4 w-4 mr-1.5" />}
                    {isSubmitting ? "Processing…" : "Checkout"}
                  </Button>
                </div>
              </div>
              {cart.length > 0 && !selectedCustomer && (
                <div className="flex items-center gap-1.5 mt-2 text-amber-600 text-xs font-medium">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Select a customer to enable checkout
                </div>
              )}
              {cart.length > 0 && selectedCustomer && !selectedAddress && (
                <div className="flex items-center gap-1.5 mt-2 text-amber-600 text-xs font-medium">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  No address found for this customer
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Checkout confirmation ── */}
      <AlertDialog
        open={showCheckoutConfirm}
        onOpenChange={setShowCheckoutConfirm}
      >
        <AlertDialogContent data-testid="dialog-checkout-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Checkout</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedCustomer
                ? `Submit order for ${selectedCustomer.first_name} ${selectedCustomer.last_name}?`
                : "Submit this order?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-confirm-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-checkout"
              onClick={() => {
                setShowCheckoutConfirm(false);
                handleCheckout();
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Inventory Shortfall Push Dialog ── */}
      <Dialog open={showInvPushDialog} onOpenChange={setShowInvPushDialog}>
        <DialogContent
          className="w-[95%] max-w-[95%] flex flex-col p-0 gap-0"
          style={{
            maxHeight: "calc(var(--app-height, 100dvh) - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 2rem)",
            marginTop: "env(safe-area-inset-top)",
          }}
          data-testid="dialog-inv-shortfall"
        >
          <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-amber-700 text-base">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              Inventory Shortfall Detected
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              The items below have less stock in BigCommerce than the quantity in your cart.
              Push inventory for each item as needed, then continue to checkout.
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
            {invPushItems.map((item, idx) => {
              const pendingForSku = invPushPendingOrders[(item.sku || "").toLowerCase()] || [];
              const isPushing = invPushingIds.has(item.lineId);
              const isPushed = invPushedIds.has(item.lineId);

              return (
                <div
                  key={item.lineId}
                  className={`border rounded-lg p-3 space-y-2.5 ${isPushed ? "border-green-300 bg-green-50" : "border-amber-200 bg-amber-50/60"}`}
                  data-testid={`inv-shortfall-item-${item.lineId}`}
                >
                  {/* Product header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-800 leading-tight truncate">{item.productName}</p>
                      {item.variantName && (
                        <p className="text-xs text-slate-500 truncate">{item.variantName}</p>
                      )}
                      <p className="text-xs font-mono text-slate-500 mt-0.5">SKU: {item.sku}</p>
                    </div>
                    {isPushed && (
                      <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0 text-[10px]">
                        <CheckCircle2 className="h-3 w-3 mr-1" />Pushed
                      </Badge>
                    )}
                  </div>

                  {/* Stock summary */}
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="bg-white rounded p-1.5 border">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Cart Qty</p>
                      <p className="font-bold text-slate-800 text-sm">{item.cartQty}</p>
                    </div>
                    <div className="bg-white rounded p-1.5 border">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">In Stock</p>
                      <p className={`font-bold text-sm ${item.bcStock < item.cartQty ? "text-red-600" : "text-slate-800"}`}>{item.bcStock}</p>
                    </div>
                    <div className="bg-white rounded p-1.5 border border-amber-300">
                      <p className="text-[10px] text-amber-600 uppercase tracking-wide">Shortfall</p>
                      <p className="font-bold text-amber-700 text-sm">{item.cartQty - item.bcStock}</p>
                    </div>
                  </div>

                  {/* Push quantity (editable) */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-600 shrink-0 w-20">Push Qty</label>
                    <Input
                      type="number"
                      min={1}
                      value={item.pushQty}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value) || 1);
                        setInvPushItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, pushQty: val } : it))
                        );
                      }}
                      className="h-8 w-24 text-sm"
                      disabled={isPushing || isPushed}
                      data-testid={`input-inv-push-qty-${item.lineId}`}
                    />
                  </div>

                  {/* Reason */}
                  <div>
                    <label className="text-xs text-slate-600 block mb-1">Reason</label>
                    <Input
                      value={item.reason}
                      onChange={(e) =>
                        setInvPushItems((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, reason: e.target.value } : it))
                        )
                      }
                      className="h-8 text-sm"
                      placeholder="Reason for pushing inventory"
                      disabled={isPushing || isPushed}
                      data-testid={`input-inv-push-reason-${item.lineId}`}
                    />
                  </div>

                  {/* Pending unfulfilled BC orders for this SKU */}
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-1">
                      Pending Fulfillment Orders
                      {!invPushLoadingOrders && pendingForSku.length > 0 && (
                        <span className="ml-1 text-amber-600">({pendingForSku.length})</span>
                      )}
                    </p>
                    {invPushLoadingOrders ? (
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading…
                      </div>
                    ) : pendingForSku.length > 0 ? (
                      <div className="max-h-28 overflow-y-auto space-y-1 rounded border bg-white p-1">
                        {pendingForSku.map((po) => (
                          <div
                            key={po.order_id}
                            className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-slate-50"
                          >
                            <span className="font-semibold text-slate-700">#{po.order_id}</span>
                            <span className="text-slate-500 truncate max-w-[90px] mx-1">{po.customer}</span>
                            <span className="text-slate-600 shrink-0">×{po.quantity}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 ml-1">{po.status}</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No pending orders found for this SKU</p>
                    )}
                  </div>

                  {/* Per-item push button */}
                  <Button
                    size="sm"
                    disabled={isPushing || isPushed}
                    className={`w-full ${isPushed ? "bg-green-600 hover:bg-green-700" : ""}`}
                    onClick={async () => {
                      setInvPushingIds((prev) => new Set(prev).add(item.lineId));
                      try {
                        await api.pushInventory({
                          product_id: item.productDbId ?? 0,
                          variant_id: item.variantId ?? 0,
                          sku: item.sku,
                          quantity_added: item.pushQty,
                          reason: item.reason || undefined,
                          product_name: item.productName,
                          variant_name: item.variantName,
                        });
                        setInvPushedIds((prev) => new Set(prev).add(item.lineId));
                        toast({
                          title: `Inventory pushed for ${item.sku}`,
                          description: `+${item.pushQty} unit${item.pushQty !== 1 ? "s" : ""} added to BigCommerce`,
                        });
                      } catch (err: any) {
                        toast({
                          title: "Push failed",
                          description: err.message,
                          variant: "destructive",
                        });
                      } finally {
                        setInvPushingIds((prev) => {
                          const n = new Set(prev);
                          n.delete(item.lineId);
                          return n;
                        });
                      }
                    }}
                    data-testid={`button-inv-push-${item.lineId}`}
                  >
                    {isPushing ? (
                      <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Pushing…</>
                    ) : isPushed ? (
                      <><CheckCircle2 className="h-3 w-3 mr-1.5" />Pushed</>
                    ) : (
                      `Push +${item.pushQty} unit${item.pushQty !== 1 ? "s" : ""}`
                    )}
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t shrink-0 flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setShowInvPushDialog(false)}
              data-testid="button-inv-shortfall-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowInvPushDialog(false);
                proceedToCheckoutConfirm();
              }}
              data-testid="button-inv-shortfall-continue"
            >
              Continue to Checkout
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Inventory error dialog ── */}
      <AlertDialog
        open={showInventoryDialog}
        onOpenChange={setShowInventoryDialog}
      >
        <AlertDialogContent data-testid="dialog-inventory-error">
          <AlertDialogHeader>
            <AlertDialogTitle>Inventory Updated</AlertDialogTitle>
            <AlertDialogDescription>
              The inventory has been updated. Modify your cart before checkout.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowInventoryDialog(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Generic error dialog ── */}
      <AlertDialog open={showErrorDialog} onOpenChange={setShowErrorDialog}>
        <AlertDialogContent data-testid="dialog-checkout-error">
          <AlertDialogHeader>
            <AlertDialogTitle>Something went wrong</AlertDialogTitle>
            <AlertDialogDescription>
              {errorDialogMsg || "An unexpected error occurred."} Contact IT
              support if the issue persists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowErrorDialog(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Navigation guard ── */}
      <AlertDialog
        open={!!navTarget}
        onOpenChange={(open) => {
          if (!open) setNavTarget(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-nav-guard">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave POS Mode?</AlertDialogTitle>
            <AlertDialogDescription>
              Your cart has {cart.length} {cart.length === 1 ? "item" : "items"}
              . If you leave now your cart will be cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="nav-guard-stay">
              Stay
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={confirmNavigation}
              data-testid="nav-guard-leave"
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Variant Popup Dialog ── */}
      {popupProduct && (
        <VariantPopupDialog
          product={popupProduct}
          onClose={() => {
            setPopupProduct(null);
            setPopupFreshVariantStock(new Map());
            setPopupPriceListPrices({});
            focusSearch();
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          onAdd={handlePopupAdd}
          onInventoryLimitReached={(product, variant) => {
            setPopupProduct(null);
            openInventoryPush(product, variant, "selector");
          }}
          allowOverselling={allowOverselling}
          selectedCustomer={selectedCustomer}
          onFetchPriceHistory={fetchPopupPriceHistory}
          freshVariantStock={popupFreshVariantStock}
          priceListPrices={popupPriceListPrices}
          matchedTier={matchedTier}
        />
      )}

      {/* ── Max Purchase Qty Override Modal ── */}
      <AlertDialog
        open={showMaxOverrideModal}
        onOpenChange={setShowMaxOverrideModal}
      >
        <AlertDialogContent data-testid="dialog-max-override" className="w-[95vw] max-w-[95vw]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Maximum Purchase Limits Detected
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Some items in your cart have maximum purchase limits.
                  Temporarily disable limits to proceed with checkout?
                </p>
                <ul className="text-xs bg-amber-50 border border-amber-200 rounded p-2 space-y-1 mt-2 max-h-48 overflow-y-auto">
                  {maxOverrideItems.map((item) => {
                    const maxQty =
                      item.variant?.max_purchase_quantity ??
                      item.product.max_purchase_quantity;
                    return (
                      <li key={item.lineId} className="flex justify-between">
                        <span className="truncate mr-2">
                          {item.product.name ||
                            item.variant?.sku ||
                            item.product.sku}
                        </span>
                        <span className="shrink-0 font-medium text-amber-700">
                          Qty {item.quantity} · Max {maxQty}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-slate-500 mt-1">
                  Limits are removed at the product level and restored
                  automatically after checkout.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-max-override-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isOverriding}
              onClick={handleCheckoutWithOverride}
              data-testid="button-max-override-confirm"
            >
              {isOverriding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Overriding…
                </>
              ) : (
                "Proceed"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Below-Cost Price Protection Modal ── */}
      <AlertDialog
        open={!!belowCostConfirm}
        onOpenChange={(open) => {
          if (!open) {
            if (belowCostConfirm) {
              setManualPriceInputs((p) => {
                const n = { ...p };
                if (belowCostConfirm.prevPriceInput) n[belowCostConfirm.item.lineId] = belowCostConfirm.prevPriceInput;
                else delete n[belowCostConfirm.item.lineId];
                return n;
              });
              setBelowCostConfirm(null);
              focusSearch();
            }
          }
        }}
      >
        <AlertDialogContent
          data-testid="dialog-below-cost"
          className="w-[95vw] sm:max-w-xl"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>⚠ Price Below Product Cost</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {belowCostConfirm && (
                <div className="space-y-2">
                  <div className="text-sm bg-red-50 border border-red-200 rounded p-2 space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 shrink-0">Product</span>
                      <span className="font-medium text-slate-800 text-right break-words">{belowCostConfirm.item.product.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">SKU</span>
                      <span className="font-medium text-slate-800">{belowCostConfirm.item.variant?.sku || belowCostConfirm.item.product.sku}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Product Cost</span>
                      <span className="font-medium text-slate-800">${fmtPrice(belowCostConfirm.cost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Entered Price</span>
                      <span className="font-bold text-red-600">${fmtPrice(belowCostConfirm.price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Difference</span>
                      <span className="font-bold text-red-600">-${fmtPrice(belowCostConfirm.cost - belowCostConfirm.price)}</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600">This sale will generate a loss. Do you want to continue?</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-below-cost-no">No</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-below-cost-yes"
              onClick={async () => {
                if (!belowCostConfirm) return;
                const { item, index, price, priceSource, cost } = belowCostConfirm;
                commitManualPrice(item, index, price, priceSource);
                setBelowCostConfirm(null);
                try {
                  await api.createPriceOverrideAudit({
                    customer_id: selectedCustomer?.id ?? null,
                    customer_name: selectedCustomer ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}` : null,
                    product_id: item.product.id,
                    product_name: item.product.name,
                    sku: item.variant?.sku || item.product.sku,
                    product_cost: cost,
                    selling_price: price,
                  });
                } catch {
                  /* audit log failure should not block the sale */
                }
                focusSearch();
              }}
            >
              Yes, Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Push Inventory Modal ── */}
      {showPushInventoryModal && (
        <PushInventoryModal
          initialSku={pushInventoryTarget?.sku}
          fromInventoryLimit={!!pushInventoryTarget}
          onSuccess={handleInventoryPushSuccess}
          onClose={() => {
            setShowPushInventoryModal(false);
            setPushInventoryTarget(null);
          }}
        />
      )}

      <Toaster />
    </div>
  );
}

// ─── Push Inventory Modal ─────────────────────────────────────────────────────

function PushInventoryModal({
  onClose,
  initialSku,
  fromInventoryLimit = false,
  onSuccess,
}: {
  onClose: () => void;
  initialSku?: string;
  fromInventoryLimit?: boolean;
  onSuccess?: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const { currentUser } = useStore();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<api.Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<api.Product | null>(
    null,
  );
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const [reason, setReason] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 80);
  }, []);

  const selectProduct = useCallback((p: api.Product, autoVariant?: any) => {
    setSelectedProduct(p);
    if (autoVariant) {
      setSelectedVariant(autoVariant);
    } else {
      const variants = getVariants(p);
      setSelectedVariant(variants.length === 1 ? variants[0] : null);
    }
    setSearch("");
    setResults([]);
  }, []);

  // Always search full BigCommerce catalog via agent route (SKU, UPC, keyword)
  const handleSearch = useCallback(
    (q: string) => {
      setSearch(q);
      if (!q.trim()) {
        setResults([]);
        return;
      }
      if (debRef.current) clearTimeout(debRef.current);
      debRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const userId = currentUser?.id;
          if (!userId) {
            setResults([]);
            return;
          }
          const result = await api.agentBigCommerceSearch(q, userId);
          if (result.resultType === "variant") {
            // Direct SKU/UPC hit — auto-select product + variant immediately
            // Merge min/max onto the variant from search result
            selectProduct(result.product, result.variant);
          } else {
            // Keyword results — show product list for user to pick from
            setResults((result.products || []).slice(0, 20));
          }
        } catch {
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      }, 350);
    },
    [currentUser?.id, selectProduct],
  );

  useEffect(() => {
    if (initialSku) handleSearch(initialSku);
  }, [handleSearch, initialSku]);

  const quantity = Number(quantityInput);
  const hasValidQuantity = Number.isInteger(quantity) && quantity > 0;

  const handleSubmit = async () => {
    if (!selectedProduct || !selectedVariant || !hasValidQuantity) return;
    setIsSubmitting(true);
    try {
      const result = await api.pushInventory({
        product_id: selectedProduct.bigcommerce_id,
        variant_id: selectedVariant.id,
        sku: selectedVariant.sku || selectedProduct.sku,
        quantity_added: quantity,
        reason: reason || undefined,
        product_name: selectedProduct.name,
        variant_name:
          variantLabel(selectedVariant) || selectedVariant.sku || "",
        push_to_bigcommerce: true,
        push_to_skuvault: fromInventoryLimit,
      });
      toast({
        title: "Inventory Updated",
        description: `${selectedVariant.sku || selectedProduct.sku}: ${result.previous_inventory} → ${result.new_inventory}`,
      });
      setSelectedProduct(null);
      setSelectedVariant(null);
      setQuantityInput("1");
      setReason("");
      setShowConfirm(false);
      await onSuccess?.();
      // Refocus search for next push
      setTimeout(() => searchRef.current?.focus(), 80);
    } catch (e: any) {
      toast({
        title: "Failed to push inventory",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const variants = selectedProduct ? getVariants(selectedProduct) : [];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="w-[95vw] max-w-[95vw] h-[90vh] max-h-[90vh] flex flex-col p-0 gap-0"
        data-testid="dialog-push-inventory"
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="h-5 w-5" /> Push Inventory
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            {fromInventoryLimit
              ? "Available inventory has been reached. Add inventory to continue."
              : "Search the full catalog by product name, SKU, or UPC to manually increment stock."}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Search bar — always visible */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
            <Input
              ref={searchRef}
              placeholder="Search by name, SKU, or UPC…"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9 pr-9"
              data-testid="input-push-inv-search"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-slate-400" />
            )}
            {search && !isSearching && (
              <button
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                onClick={() => {
                  setSearch("");
                  setResults([]);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Search results — mother titles */}
          {results.length > 0 && !selectedProduct && (
            <div className="border rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {results.length} result{results.length !== 1 ? "s" : ""} —
                  click to select
                </p>
              </div>
              <div className="divide-y max-h-[40vh] overflow-y-auto">
                {results.map((p) => {
                  const pvariants = getVariants(p);
                  return (
                    <button
                      key={p.id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left transition-colors"
                      onClick={() => selectProduct(p)}
                      data-testid={`push-inv-result-${p.id}`}
                    >
                      {p.image && (
                        <img
                          src={p.image}
                          alt=""
                          className="w-10 h-10 object-cover rounded border shrink-0 bg-slate-50"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-slate-800">
                          {p.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          SKU: {p.sku}
                          {pvariants.length > 1 && (
                            <span className="ml-2 text-slate-400">
                              · {pvariants.length} variants
                            </span>
                          )}
                        </p>
                      </div>
                      <Plus className="h-4 w-4 text-slate-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {search &&
            !isSearching &&
            results.length === 0 &&
            !selectedProduct && (
              <p className="text-sm text-slate-400 text-center py-4">
                No products found for "{search}"
              </p>
            )}

          {/* Selected product + variant + quantity */}
          {selectedProduct && (
            <>
              {/* Product header */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                {selectedProduct.image && (
                  <img
                    src={selectedProduct.image}
                    alt=""
                    className="w-12 h-12 object-cover rounded border shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {selectedProduct.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    SKU: {selectedProduct.sku}
                  </p>
                  {selectedVariant && (
                    <p className="text-xs text-blue-600 font-medium mt-0.5">
                      {variantLabel(selectedVariant) || selectedVariant.sku} ·
                      Stock: {selectedVariant.stock_level ?? 0}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelectedProduct(null);
                    setSelectedVariant(null);
                    setShowConfirm(false);
                  }}
                  className="text-slate-400 hover:text-slate-600 shrink-0"
                  data-testid="button-push-inv-change-product"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Variant selection if multiple */}
              {variants.length > 1 && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">
                    Select Variant
                  </label>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-[30vh] overflow-y-auto divide-y">
                      {variants.map((v: any) => (
                        <button
                          key={v.id}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors ${selectedVariant?.id === v.id ? "bg-blue-50 font-semibold text-blue-700" : ""}`}
                          onClick={() => setSelectedVariant(v)}
                          data-testid={`push-inv-variant-${v.id}`}
                        >
                          <span>{variantLabel(v) || v.sku}</span>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-slate-400 font-mono">
                              {v.sku}
                            </span>
                            <span
                              className={
                                v.stock_level <= 0
                                  ? "text-red-500"
                                  : "text-slate-400"
                              }
                            >
                              Stock: {v.stock_level ?? 0}
                            </span>
                            {selectedVariant?.id === v.id && (
                              <span className="text-blue-600">✓</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Quantity + reason */}
              {selectedVariant && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">
                      Quantity to Add
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() =>
                          setQuantityInput(String(Math.max(1, quantity - 1)))
                        }
                        className="border rounded-lg p-2.5 hover:bg-slate-100 transition-colors"
                        data-testid="button-push-inv-minus"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <Input
                        type="number"
                        min="1"
                          step="1"
                        value={quantityInput}
                        onChange={(e) => setQuantityInput(e.target.value)}
                        className="text-center w-28 font-bold text-xl h-12"
                        data-testid="input-push-inv-quantity"
                      />
                      <button
                        onClick={() => setQuantityInput(String(quantity + 1))}
                        className="border rounded-lg p-2.5 hover:bg-slate-100 transition-colors"
                        data-testid="button-push-inv-plus"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <div className="text-sm text-slate-500 ml-2">
                        <p>
                          {selectedVariant.stock_level ?? 0}{" "}
                          <span className="text-slate-400">current</span>
                        </p>
                        <p className="font-semibold text-slate-800">
                          → {(selectedVariant.stock_level ?? 0) + quantity}{" "}
                          <span className="text-slate-400 font-normal">
                            after
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 block">
                      Reason (Optional)
                    </label>
                    <Input
                      placeholder="e.g. Received shipment, Stock correction…"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      data-testid="input-push-inv-reason"
                    />
                  </div>

                  {!showConfirm ? (
                    <Button
                      className="w-full h-12 text-base font-semibold"
                      disabled={!hasValidQuantity}
                      onClick={() => setShowConfirm(true)}
                      data-testid="button-push-inv-confirm-open"
                    >
                      <Package className="h-4 w-4 mr-2" />
                      Push {quantity} Unit{quantity !== 1 ? "s" : ""} to
                      {fromInventoryLimit ? "BigCommerce + SKUVault" : "BigCommerce"}
                    </Button>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                      <p className="text-sm font-semibold text-amber-800">
                        Confirm Inventory Push
                      </p>
                      <p className="text-sm text-amber-700">
                        Add <strong>{quantity}</strong> unit
                        {quantity !== 1 ? "s" : ""} to{" "}
                        <strong>
                          {variantLabel(selectedVariant) || selectedVariant.sku}
                        </strong>{" "}
                        on {fromInventoryLimit ? "BigCommerce + SKUVault" : "BigCommerce"}.
                        <br />
                        Stock:{" "}
                        <strong>
                          {selectedVariant.stock_level ?? 0}
                        </strong> →{" "}
                        <strong>
                          {(selectedVariant.stock_level ?? 0) + quantity}
                        </strong>
                        {reason && (
                          <>
                            <br />
                            Reason: <em>{reason}</em>
                          </>
                        )}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowConfirm(false)}
                          data-testid="button-push-inv-cancel"
                        >
                          Cancel
                        </Button>
                        <Button
                          disabled={isSubmitting}
                          onClick={handleSubmit}
                          data-testid="button-push-inv-submit"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Pushing…
                            </>
                          ) : (
                            "Confirm Push"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

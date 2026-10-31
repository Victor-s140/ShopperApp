(() => {
  "use strict";

  const STORAGE_KEY = "counter-shop-data-v1";
  const emojiOptions = ["📦", "🥛", "🍞", "🥚", "🍚", "💧", "🧃", "🧼", "🍎", "☕", "🍫", "🍌", "🥔", "🥫", "🧴"];
  const state = { products: [], sales: [], cart: [], view: "checkout", category: "All products", query: "", salesQuery: "", user: null, legacyData: null };
  const appShell = document.getElementById("app-shell");
  const authRoot = document.getElementById("auth-root");
  const authMessage = document.getElementById("auth-message");
  const importButton = document.getElementById("import-local-button");
  const appContent = document.getElementById("app-content");
  const modalRoot = document.getElementById("modal-root");
  const toastRegion = document.getElementById("toast-region");
  const pageTitle = document.getElementById("page-title");
  const currencyCode = "NGN";
  let authMode = "signin";

  const formatMoney = (amount) => new Intl.NumberFormat("en-NG", { style: "currency", currency: currencyCode }).format(amount);
  const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const todayStart = () => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  const isValidData = (data) => data && Array.isArray(data.products) && Array.isArray(data.sales)
    && data.products.every((product) => product && typeof product.id === "string" && typeof product.name === "string"
      && typeof product.category === "string" && typeof product.sku === "string"
      && Number.isFinite(product.price) && product.price >= 0 && Number.isInteger(product.stock) && product.stock >= 0)
    && data.sales.every((sale) => sale && typeof sale.id === "string" && Number.isFinite(sale.total)
      && typeof sale.paymentMethod === "string" && Array.isArray(sale.items) && Number.isFinite(sale.createdAt)
      && (sale.customerName === undefined || typeof sale.customerName === "string")
      && (sale.repayments === undefined || Array.isArray(sale.repayments) && sale.repayments.every((repayment) => repayment
        && typeof repayment.id === "string" && Number.isFinite(repayment.amount) && repayment.amount > 0
        && typeof repayment.paymentMethod === "string" && Number.isFinite(repayment.createdAt)))
      && sale.items.every((item) => item && typeof item.name === "string" && Number.isFinite(item.price)
        && item.price >= 0 && Number.isInteger(item.quantity) && item.quantity > 0));

  async function loadData() {
    const data = await window.counterBackend.loadData();
    state.products = data.products;
    state.sales = data.sales;
  }

  function notify(message, error = false) {
    const toast = document.createElement("div");
    toast.className = `toast${error ? " error" : ""}`;
    toast.textContent = message;
    toastRegion.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4500);
  }

  function setView(view) {
    state.view = view;
    document.querySelectorAll(".nav-link").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    pageTitle.textContent = { checkout: "Checkout", products: "Products", sales: "Sales history", credit: "Credit sales", reports: "Reports" }[view];
    render();
  }

  function render() {
    if (state.view === "checkout") renderCheckout();
    else if (state.view === "products") renderProducts();
    else if (state.view === "sales") renderSales();
    else if (state.view === "credit") renderCredit();
    else renderReports();
  }

  function renderCheckout() {
    const categories = ["All products", ...new Set(state.products.map((product) => product.category))];
    const filtered = state.products.filter((product) => {
      const matchesCategory = state.category === "All products" || product.category === state.category;
      const query = state.query.trim().toLowerCase();
      return matchesCategory && (!query || `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query));
    });
    const itemCount = state.cart.reduce((total, item) => total + item.quantity, 0);
    const subtotal = cartSubtotal();

    appContent.innerHTML = `
      <div class="page-heading">
        <div><p class="eyebrow">POINT OF SALE</p><h1>Checkout</h1><p class="subheading">Select products to add them to the customer's basket.</p></div>
        <button class="secondary-button" data-action="add-product">＋ &nbsp;New product</button>
      </div>
      <div class="checkout-layout">
        <section class="catalog-panel" aria-label="Product catalog">
          <div class="catalog-toolbar">
            <label class="search-wrap"><span class="search-icon" aria-hidden="true">⌕</span><span class="sr-only">Search products</span><input class="search-input" id="product-search" placeholder="Search products or scan SKU…" value="${escapeHTML(state.query)}" autocomplete="off"></label>
            <div class="category-filters" aria-label="Filter by category">${categories.map((category) => `<button class="filter-chip${category === state.category ? " active" : ""}" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>`).join("")}</div>
          </div>
          ${filtered.length ? `<div class="product-grid">${filtered.map((product, index) => productCard(product, index)).join("")}</div>` : `<div class="empty-state">No products found. Try a different search or add a product.</div>`}
        </section>
        <aside class="cart-panel" aria-label="Current sale">
          <div class="cart-header"><h2>Current sale</h2><span class="item-count">${itemCount} ${itemCount === 1 ? "item" : "items"}</span></div>
          <div class="cart-items">${state.cart.length ? state.cart.map(cartItemMarkup).join("") : `<div class="cart-empty"><span class="cart-empty-icon" aria-hidden="true">▱</span>Your basket is empty<br>Tap a product to get started</div>`}</div>
          <div class="cart-summary">
            <div class="summary-row"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>
            <div class="summary-row"><span>Tax</span><span>Not included</span></div>
            <div class="summary-row total"><span>Total</span><span>${formatMoney(subtotal)}</span></div>
            <button class="primary-button checkout-button" data-action="open-payment" ${state.cart.length ? "" : "disabled"}>Charge ${formatMoney(subtotal)} <span aria-hidden="true">→</span></button>
            <p class="helper-note">Tax is not calculated. Check your local tax requirements before trading.</p>
          </div>
        </aside>
      </div>`;
  }

  function productCard(product, index) {
    const inCart = state.cart.find((item) => item.productId === product.id)?.quantity || 0;
    const available = product.stock - inCart;
    return `<button class="product-card" data-action="add-to-cart" data-id="${escapeHTML(product.id)}" ${available <= 0 ? "disabled" : ""} aria-label="Add ${escapeHTML(product.name)} to sale">
      <span class="product-art tone-${index % 5}" aria-hidden="true">${escapeHTML(product.emoji || "📦")}</span>
      <span class="product-category">${escapeHTML(product.category)}</span><span class="product-name">${escapeHTML(product.name)}</span>
      <span class="product-card-bottom"><span class="product-price">${formatMoney(product.price)}</span><span class="stock-note${available <= 5 ? " low" : ""}">${available <= 0 ? "Out of stock" : `${available} in stock`}</span></span>
    </button>`;
  }

  function cartItemMarkup(item) {
    const product = state.products.find((entry) => entry.id === item.productId);
    if (!product) return "";
    return `<div class="cart-item">
      <span class="cart-item-art" aria-hidden="true">${escapeHTML(product.emoji || "📦")}</span>
      <div><div class="cart-item-name">${escapeHTML(product.name)}</div><div class="cart-item-price">${formatMoney(product.price)} each</div>
        <div class="qty-control"><button class="qty-button" data-action="change-quantity" data-id="${escapeHTML(product.id)}" data-delta="-1" aria-label="Remove one ${escapeHTML(product.name)}">−</button><span class="qty-value">${item.quantity}</span><button class="qty-button" data-action="change-quantity" data-id="${escapeHTML(product.id)}" data-delta="1" aria-label="Add one ${escapeHTML(product.name)}">+</button></div>
      </div><div class="cart-item-total">${formatMoney(product.price * item.quantity)}</div>
    </div>`;
  }

  function renderProducts() {
    const query = state.query.trim().toLowerCase();
    const products = state.products.filter((product) => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query));
    appContent.innerHTML = `
      <div class="page-heading"><div><p class="eyebrow">YOUR CATALOG</p><h1>Products</h1><p class="subheading">Manage prices and keep an eye on stock levels.</p></div><button class="primary-button" data-action="add-product">＋ &nbsp;Add product</button></div>
      <section class="panel">
        <div class="panel-heading"><h2>All products <span class="table-secondary">· ${state.products.length} items</span></h2><div class="toolbar-row"><label class="search-wrap"><span class="search-icon" aria-hidden="true">⌕</span><span class="sr-only">Search products</span><input class="search-input" id="product-search" placeholder="Search products…" value="${escapeHTML(state.query)}"></label></div></div>
        <div class="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>In stock</th><th></th></tr></thead>
          <tbody>${products.map((product) => `<tr>
            <td><div class="table-primary">${escapeHTML(product.emoji || "📦")} &nbsp;${escapeHTML(product.name)}</div><div class="table-secondary">${escapeHTML(product.sku)}</div></td>
            <td>${escapeHTML(product.category)}</td><td class="table-primary">${formatMoney(product.price)}</td>
            <td><span class="stock-pill${product.stock <= 5 ? " low" : ""}">${product.stock} ${product.stock === 1 ? "unit" : "units"}</span></td>
            <td><div class="table-actions"><button data-action="edit-product" data-id="${escapeHTML(product.id)}">Edit / restock</button></div></td>
          </tr>`).join("") || `<tr><td colspan="5"><div class="empty-state">No products match your search.</div></td></tr>`}</tbody></table></div>
      </section>`;
  }

  function renderSales() {
    const query = state.salesQuery.trim().toLowerCase();
    const sales = [...state.sales].sort((a, b) => b.createdAt - a.createdAt).filter((sale) =>
      !query || `${sale.id} ${sale.paymentMethod} ${sale.items.map((item) => item.name).join(" ")}`.toLowerCase().includes(query));
    appContent.innerHTML = `
      <div class="page-heading"><div><p class="eyebrow">TRANSACTION LOG</p><h1>Sales history</h1><p class="subheading">Review completed sales and reprint receipts.</p></div></div>
      <section class="panel"><div class="panel-heading"><h2>All sales <span class="table-secondary">· ${state.sales.length} transactions</span></h2>
        <label class="search-wrap"><span class="search-icon" aria-hidden="true">⌕</span><span class="sr-only">Search sales</span><input class="search-input" id="sales-search" placeholder="Search sales…" value="${escapeHTML(state.salesQuery)}"></label>
      </div><div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Date &amp; time</th><th>Items</th><th>Payment</th><th>Total</th><th></th></tr></thead><tbody>
        ${sales.map((sale) => `<tr><td class="table-primary">${escapeHTML(sale.id)}</td>
          <td>${formatDate(sale.createdAt)}<div class="table-secondary">${formatTime(sale.createdAt)}</div></td>
          <td>${sale.items.reduce((count, item) => count + item.quantity, 0)} items</td><td><span class="payment-pill">${escapeHTML(sale.paymentMethod)}</span></td>
          <td class="table-primary">${formatMoney(sale.total)}</td><td><div class="table-actions"><button data-action="view-receipt" data-id="${escapeHTML(sale.id)}">Receipt</button></div></td></tr>`).join("") || `<tr><td colspan="6"><div class="empty-state">${query ? "No sales match your search." : "No sales recorded yet. Completed checkouts will appear here."}</div></td></tr>`}
      </tbody></table></div></section>`;
  }

  function renderCredit() {
    const creditSales = state.sales.filter((sale) => sale.paymentMethod === "Credit").sort((a, b) => b.createdAt - a.createdAt);
    const outstanding = creditSales.reduce((sum, sale) => sum + creditBalance(sale), 0);
    const openSales = creditSales.filter((sale) => creditBalance(sale) > 0).length;
    const customers = new Set(creditSales.map((sale) => sale.customerName?.trim().toLowerCase()).filter(Boolean));
    appContent.innerHTML = `
      <div class="page-heading"><div><p class="eyebrow">PAYMENT TRACKING</p><h1>Credit sales</h1><p class="subheading">Track customer balances and record repayments.</p></div></div>
      <div class="stats-grid credit-summary">
        <article class="stat-card"><p class="stat-label">Outstanding balance</p><p class="stat-value">${formatMoney(outstanding)}</p><p class="stat-foot">Across all credit sales</p></article>
        <article class="stat-card"><p class="stat-label">Open credit sales</p><p class="stat-value">${openSales}</p><p class="stat-foot">With a balance remaining</p></article>
        <article class="stat-card"><p class="stat-label">Customers</p><p class="stat-value">${customers.size}</p><p class="stat-foot">Named credit customers</p></article>
      </div>
      <section class="panel"><div class="panel-heading"><h2>Credit transactions <span class="table-secondary">· ${creditSales.length} sales</span></h2></div>
        <div class="table-wrap"><table><thead><tr><th>Customer</th><th>Sale</th><th>Date</th><th>Sale total</th><th>Repaid</th><th>Balance due</th><th></th></tr></thead><tbody>
          ${creditSales.map((sale) => {
            const repaid = repaymentTotal(sale);
            const customerName = sale.customerName?.trim() || "Unassigned customer";
            return `<tr><td class="table-primary">${escapeHTML(customerName)}${sale.customerName?.trim() ? "" : `<div class="table-secondary">Add a name when managing this sale</div>`}</td>
              <td>${escapeHTML(sale.id)}</td><td>${formatDate(sale.createdAt)}</td><td>${formatMoney(sale.total)}</td><td>${formatMoney(repaid)}</td>
              <td class="table-primary">${formatMoney(creditBalance(sale))}</td><td><div class="table-actions"><button data-action="manage-credit" data-id="${escapeHTML(sale.id)}">Manage / repay</button></div></td></tr>`;
          }).join("") || `<tr><td colspan="7"><div class="empty-state">No credit sales yet. Choose Credit at checkout to start a customer balance.</div></td></tr>`}
        </tbody></table></div>
      </section>
      <p class="helper-note" style="text-align:left;margin-top:14px">Older credit sales without a customer name appear as unassigned. Repayments are shared with your shop account.</p>`;
  }

  function repaymentTotal(sale) {
    return (sale.repayments || []).reduce((sum, repayment) => sum + repayment.amount, 0);
  }

  function creditBalance(sale) {
    return Math.max(0, Math.round((sale.total - repaymentTotal(sale)) * 100) / 100);
  }

  function renderReports() {
    const dayStart = todayStart();
    const todaysSales = state.sales.filter((sale) => sale.createdAt >= dayStart);
    const dailyProducts = summarizeProductSales(todaysSales);
    const revenue = todaysSales.reduce((sum, sale) => sum + sale.total, 0);
    const units = todaysSales.reduce((sum, sale) => sum + sale.items.reduce((count, item) => count + item.quantity, 0), 0);
    const week = [];
    const now = new Date();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setDate(now.getDate() - offset);
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      const end = start + 24 * 60 * 60 * 1000;
      const amount = state.sales.filter((sale) => sale.createdAt >= start && sale.createdAt < end).reduce((sum, sale) => sum + sale.total, 0);
      week.push({ date, amount });
    }
    const maxAmount = Math.max(...week.map((day) => day.amount), 1);
    const soldProducts = new Map();
    state.sales.forEach((sale) => sale.items.forEach((item) => {
      soldProducts.set(item.name, (soldProducts.get(item.name) || 0) + item.quantity);
    }));
    const topProducts = [...soldProducts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    appContent.innerHTML = `
      <div class="page-heading"><div><p class="eyebrow">SHOP OVERVIEW</p><h1>Reports</h1><p class="subheading">A quick look at your recorded sales and stock.</p></div></div>
      <div class="stats-grid">
        <article class="stat-card"><p class="stat-label">Sales today</p><p class="stat-value">${formatMoney(revenue)}</p><p class="stat-foot">Completed transactions</p></article>
        <article class="stat-card"><p class="stat-label">Transactions</p><p class="stat-value">${todaysSales.length}</p><p class="stat-foot">Sales recorded today</p></article>
        <article class="stat-card"><p class="stat-label">Items sold today</p><p class="stat-value">${units}</p><p class="stat-foot">Units across all sales</p></article>
        <article class="stat-card"><p class="stat-label">Low stock</p><p class="stat-value${state.products.filter((product) => product.stock <= 5).length ? " stat-accent" : ""}">${state.products.filter((product) => product.stock <= 5).length}</p><p class="stat-foot">Products with 5 units or fewer</p></article>
      </div>
      <div class="report-layout">
        <section class="panel"><div class="panel-heading"><h2>Sales · last 7 days</h2></div><div class="bars" aria-label="Sales by day">${week.map((day, index) => `<div class="bar-column"><span class="bar-value">${day.amount ? formatMoney(day.amount) : ""}</span><span class="bar${index === week.length - 1 ? " today" : ""}" style="height:${Math.max(day.amount ? 8 : 2, day.amount / maxAmount * 100)}%"></span><span class="bar-day">${day.date.toLocaleDateString(undefined, { weekday: "short" })}</span></div>`).join("")}</div></section>
        <section class="panel"><div class="panel-heading"><h2>Best sellers</h2></div>${topProducts.length ? `<div class="top-products-list">${topProducts.map(([name, count], index) => `<div class="top-product-row"><span class="rank">${index + 1}</span><span class="top-product-name">${escapeHTML(name)}</span><span class="top-product-sold">${count} sold</span></div>`).join("")}</div>` : `<div class="empty-state">Your best sellers will appear after your first sale.</div>`}</section>
      </div>
      <section class="panel daily-report-panel"><div class="panel-heading daily-report-heading"><div><h2>Products sold today</h2><p class="table-secondary">${dailyProducts.length} products across ${units} units</p></div><button class="secondary-button" data-action="download-daily-products"${dailyProducts.length ? "" : " disabled"}>Download CSV</button></div>
        <div class="table-wrap"><table><thead><tr><th>Product</th><th>Units sold</th><th>Sales total (NGN)</th></tr></thead><tbody>
          ${dailyProducts.map((product) => `<tr><td class="table-primary">${escapeHTML(product.name)}</td><td>${product.quantity}</td><td class="table-primary">${formatMoney(product.total)}</td></tr>`).join("") || `<tr><td colspan="3"><div class="empty-state">No products sold today. Completed sales will appear here.</div></td></tr>`}
        </tbody></table></div>
      </section>
      <p class="helper-note" style="text-align:left;margin-top:14px">Reports include sales recorded in the shared shop account. Tax is not calculated.</p>`;
  }

  function summarizeProductSales(sales) {
    const products = new Map();
    sales.forEach((sale) => sale.items.forEach((item) => {
      const key = item.productId || item.name;
      const existing = products.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        existing.total += item.price * item.quantity;
      } else {
        products.set(key, { name: item.name, quantity: item.quantity, total: item.price * item.quantity });
      }
    }));
    return [...products.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function downloadDailyProductReport() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const todaysSales = state.sales.filter((sale) => sale.createdAt >= start && sale.createdAt < end);
    const products = summarizeProductSales(todaysSales);
    if (!products.length) return;

    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const rows = [
      ["Date", "Product", "Units sold", "Sales total (NGN)"],
      ...products.map((product) => [dateKey, product.name, product.quantity, product.total.toFixed(2)])
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sales-products-${dateKey}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function cartSubtotal() {
    return state.cart.reduce((total, item) => {
      const product = state.products.find((entry) => entry.id === item.productId);
      return total + (product ? product.price * item.quantity : 0);
    }, 0);
  }

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function addToCart(id) {
    const product = state.products.find((entry) => entry.id === id);
    if (!product) return;
    const item = state.cart.find((entry) => entry.productId === id);
    if ((item?.quantity || 0) >= product.stock) {
      notify(`Only ${product.stock} ${product.stock === 1 ? "unit is" : "units are"} in stock.`, true);
      return;
    }
    if (item) item.quantity += 1;
    else state.cart.push({ productId: id, quantity: 1 });
    render();
  }

  function changeQuantity(id, delta) {
    const item = state.cart.find((entry) => entry.productId === id);
    const product = state.products.find((entry) => entry.id === id);
    if (!item || !product) return;
    const next = item.quantity + delta;
    if (next > product.stock) {
      notify(`Only ${product.stock} ${product.stock === 1 ? "unit is" : "units are"} in stock.`, true);
      return;
    }
    if (next <= 0) state.cart = state.cart.filter((entry) => entry.productId !== id);
    else item.quantity = next;
    render();
  }

  function openProductForm(product = null) {
    const editing = Boolean(product);
    modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
      <div class="modal-header"><div><h2 id="product-modal-title">${editing ? "Edit product" : "Add a product"}</h2><p>${editing ? "Update details or adjust the stock quantity." : "Add an item to your shop catalog."}</p></div><button class="close-button" data-action="close-modal" aria-label="Close">×</button></div>
      <form id="product-form" novalidate><div class="form-grid">
        <div class="form-field full"><label for="product-name">Product name</label><input class="form-input" id="product-name" name="name" maxlength="70" required value="${escapeHTML(product?.name || "")}" placeholder="e.g. Sparkling water"></div>
        <div class="form-field"><label for="product-price">Price (${currencyCode})</label><input class="form-input" id="product-price" name="price" type="number" min="0" step="0.01" required value="${product ? product.price.toFixed(2) : ""}" placeholder="0.00"></div>
        <div class="form-field"><label for="product-stock">Units in stock</label><input class="form-input" id="product-stock" name="stock" type="number" min="0" step="1" required value="${product ? product.stock : ""}" placeholder="0"></div>
        <div class="form-field"><label for="product-category">Category</label><input class="form-input" id="product-category" name="category" maxlength="40" required list="category-options" value="${escapeHTML(product?.category || "")}" placeholder="e.g. Drinks"><datalist id="category-options">${[...new Set(state.products.map((entry) => entry.category))].map((category) => `<option value="${escapeHTML(category)}">`).join("")}</datalist></div>
        <div class="form-field"><label for="product-sku">SKU / barcode</label><input class="form-input" id="product-sku" name="sku" maxlength="40" value="${escapeHTML(product?.sku || "")}" placeholder="Optional"></div>
        <div class="form-field"><label for="product-emoji">Product icon</label><select class="form-select" id="product-emoji" name="emoji">${emojiOptions.map((emoji) => `<option value="${emoji}" ${(product?.emoji || "📦") === emoji ? "selected" : ""}>${emoji}</option>`).join("")}</select></div>
        <p class="form-error" id="product-form-error" aria-live="polite"></p>
      </div><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">${editing ? "Save changes" : "Add product"}</button></div></form>
    </section></div>`;
    modalRoot.querySelector("#product-name").focus();
    modalRoot.querySelector("#product-form").addEventListener("submit", (event) => saveProduct(event, product));
  }

  async function saveProduct(event, existing) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const category = String(form.get("category") || "").trim();
    const sku = String(form.get("sku") || "").trim();
    const rawPrice = String(form.get("price") || "").trim();
    const rawStock = String(form.get("stock") || "").trim();
    const price = Number(rawPrice);
    const stock = Number(rawStock);
    const error = modalRoot.querySelector("#product-form-error");
    if (!name || !category || !rawPrice || !Number.isFinite(price) || price < 0 || !rawStock || !Number.isInteger(stock) || stock < 0) {
      error.textContent = "Enter a name, category, non-negative price, and whole-number stock quantity.";
      return;
    }
    if (sku && state.products.some((product) => product.sku.toLowerCase() === sku.toLowerCase() && product.id !== existing?.id)) {
      error.textContent = "That SKU is already assigned to another product.";
      return;
    }
    const nextProducts = existing
      ? state.products.map((product) => product.id === existing.id ? { ...product, name, category, sku, price, stock, emoji: String(form.get("emoji")) } : product)
      : [...state.products, { id: createId(), name, category, sku: sku || `ITEM-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, price, stock, emoji: String(form.get("emoji")) }];
    const product = nextProducts[nextProducts.length - 1].id === existing?.id
      ? nextProducts[nextProducts.length - 1]
      : existing ? nextProducts.find((entry) => entry.id === existing.id) : nextProducts[nextProducts.length - 1];
    const submitButton = event.currentTarget.querySelector("button[type=submit]");
    submitButton.disabled = true;
    try {
      await window.counterBackend.saveProduct(product);
      await loadData();
      state.query = "";
      closeModal();
      render();
      notify(existing ? "Product updated." : "Product added to your catalog.");
    } catch (saveError) {
      error.textContent = saveError.message;
      submitButton.disabled = false;
    }
  }

  function openPayment() {
    if (!state.cart.length) return;
    const total = cartSubtotal();
    modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal modal-small" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title">
      <div class="modal-header"><div><h2 id="payment-modal-title">Complete sale</h2><p>Choose how the customer paid.</p></div><button class="close-button" data-action="close-modal" aria-label="Close">×</button></div>
      <div class="payment-total"><span>Amount due</span><strong>${formatMoney(total)}</strong></div>
      <form id="payment-form" novalidate><div class="form-field"><label for="payment-method">Payment method</label><select class="form-select" id="payment-method" name="method"><option>Cash</option><option>Card</option><option>Mobile payment</option><option>Credit</option><option>Other</option></select></div>
        <div class="form-field" id="credit-customer-field" style="margin-top:13px" hidden><label for="credit-customer">Customer name</label><input class="form-input" id="credit-customer" name="customer" maxlength="80" autocomplete="name" placeholder="Who is buying on credit?"></div>
        <div class="form-field" id="cash-field" style="margin-top:13px"><label for="cash-received">Cash received (${currencyCode})</label><input class="form-input" id="cash-received" name="cash" type="number" min="${total.toFixed(2)}" step="0.01" value="${total.toFixed(2)}"></div>
        <div class="change-box" id="change-preview"><span>Change due</span><strong>${formatMoney(0)}</strong></div>
        <p class="form-error" id="payment-error" aria-live="polite"></p>
        <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">Record sale</button></div>
      </form>
    </section></div>`;
    const paymentForm = modalRoot.querySelector("#payment-form");
    paymentForm.dataset.saleId = `SALE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const method = modalRoot.querySelector("#payment-method");
    const cashField = modalRoot.querySelector("#cash-field");
    const cashInput = modalRoot.querySelector("#cash-received");
    const creditCustomerField = modalRoot.querySelector("#credit-customer-field");
    const creditCustomerInput = modalRoot.querySelector("#credit-customer");
    const changePreview = modalRoot.querySelector("#change-preview");
    const updatePaymentFields = () => {
      const isCash = method.value === "Cash";
      const isCredit = method.value === "Credit";
      cashField.hidden = !isCash;
      changePreview.hidden = !isCash;
      creditCustomerField.hidden = !isCredit;
      creditCustomerInput.required = isCredit;
      updateChange();
    };
    const updateChange = () => {
      changePreview.querySelector("strong").textContent = formatMoney(Math.max(0, Number(cashInput.value) - total));
    };
    method.addEventListener("change", updatePaymentFields);
    cashInput.addEventListener("input", updateChange);
    updatePaymentFields();
    paymentForm.addEventListener("submit", recordSale);
    cashInput.focus();
  }

  async function recordSale(event) {
    event.preventDefault();
    const total = cartSubtotal();
    const method = modalRoot.querySelector("#payment-method").value;
    const cashReceived = Number(modalRoot.querySelector("#cash-received").value);
    const customerName = modalRoot.querySelector("#credit-customer").value.trim();
    const error = modalRoot.querySelector("#payment-error");
    if (method === "Cash" && (!Number.isFinite(cashReceived) || cashReceived < total)) {
      error.textContent = "Cash received must be at least the amount due.";
      return;
    }
    if (method === "Credit" && !customerName) {
      error.textContent = "Enter the customer's name for this credit sale.";
      modalRoot.querySelector("#credit-customer").focus();
      return;
    }
    for (const item of state.cart) {
      const product = state.products.find((entry) => entry.id === item.productId);
      if (!product || product.stock < item.quantity) {
        error.textContent = `${product?.name || "A product"} no longer has enough stock. Please review the basket.`;
        return;
      }
    }
    const sale = {
      id: event.currentTarget.dataset.saleId,
      paymentMethod: method,
      total,
      cashReceived: method === "Cash" ? cashReceived : null,
      change: method === "Cash" ? cashReceived - total : 0,
      ...(method === "Credit" ? { customerName, repayments: [] } : {}),
      items: state.cart.map((item) => {
        const product = state.products.find((entry) => entry.id === item.productId);
        return { productId: product.id, name: product.name, price: product.price, quantity: item.quantity };
      })
    };
    const submitButton = event.currentTarget.querySelector("button[type=submit]");
    submitButton.disabled = true;
    try {
      await window.counterBackend.recordSale(sale);
      await loadData();
      const savedSale = state.sales.find((entry) => entry.id === sale.id);
      if (!savedSale) throw new Error("The sale was recorded, but could not be loaded. Refresh the page before trying again.");
      state.cart = [];
      render();
      openReceipt(savedSale);
    } catch (saleError) {
      try {
        await loadData();
        const savedSale = state.sales.find((entry) => entry.id === sale.id);
        if (savedSale) {
          state.cart = [];
          render();
          openReceipt(savedSale);
          return;
        }
        render();
      } catch {}
      error.textContent = saleError.message;
      submitButton.disabled = false;
    }
  }

  function openReceipt(sale) {
    modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal modal-receipt" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
      <div class="modal-header"><div><h2 id="receipt-title">Sale complete</h2><p>Receipt is ready to print or view later in sales history.</p></div><button class="close-button" data-action="close-modal" aria-label="Close">×</button></div>
      ${receiptMarkup(sale)}<div class="modal-actions"><button class="secondary-button" data-action="close-modal">Done</button><button class="primary-button" data-action="print-receipt">⎙ &nbsp;Print receipt</button></div>
    </section></div>`;
  }

  function receiptMarkup(sale) {
    return `<div class="receipt-content"><div class="receipt-brand">counter<span class="brand-period">.</span></div><p class="receipt-subtitle">Thank you for shopping with us</p>
      <div class="receipt-meta"><span>${escapeHTML(sale.id)}</span><span>${formatDate(sale.createdAt)} · ${formatTime(sale.createdAt)}</span></div>
      <div class="receipt-lines">${sale.items.map((item) => `<div class="receipt-line"><span>${escapeHTML(item.name)} × ${item.quantity}</span><span>${formatMoney(item.price * item.quantity)}</span></div>`).join("")}</div>
      <div class="receipt-total"><span>Total</span><span>${formatMoney(sale.total)}</span></div>
      <div class="receipt-line"><span>Payment</span><span>${escapeHTML(sale.paymentMethod)}</span></div>
      ${sale.paymentMethod === "Credit" ? `<div class="receipt-line"><span>Customer</span><span>${escapeHTML(sale.customerName || "Unassigned customer")}</span></div><div class="receipt-line"><span>Balance due</span><span>${formatMoney(creditBalance(sale))}</span></div>` : ""}
      ${sale.paymentMethod === "Cash" ? `<div class="receipt-line"><span>Cash received</span><span>${formatMoney(sale.cashReceived)}</span></div><div class="receipt-line"><span>Change</span><span>${formatMoney(sale.change)}</span></div>` : ""}
      <p class="receipt-thanks">Tax not included</p></div>`;
  }

  function openCreditRepayment(sale) {
    if (!sale) return;
    const balance = creditBalance(sale);
    const repayments = [...(sale.repayments || [])].sort((a, b) => b.createdAt - a.createdAt);
    modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal modal-small" role="dialog" aria-modal="true" aria-labelledby="credit-modal-title">
      <div class="modal-header"><div><h2 id="credit-modal-title">Credit account</h2><p>${escapeHTML(sale.id)} · ${formatDate(sale.createdAt)}</p></div><button class="close-button" data-action="close-modal" aria-label="Close">×</button></div>
      <div class="credit-balance-summary"><div><span>Sale total</span><strong>${formatMoney(sale.total)}</strong></div><div><span>Repaid</span><strong>${formatMoney(repaymentTotal(sale))}</strong></div><div><span>Balance due</span><strong>${formatMoney(balance)}</strong></div></div>
      <div class="repayment-history"><h3>Repayment history</h3>${repayments.length ? repayments.map((repayment) => `<div class="repayment-row"><span>${formatDate(repayment.createdAt)} · ${formatTime(repayment.createdAt)}<small>${escapeHTML(repayment.paymentMethod)}</small></span><strong>${formatMoney(repayment.amount)}</strong></div>`).join("") : `<p class="table-secondary">No repayments recorded yet.</p>`}</div>
      <form id="credit-repayment-form" novalidate><div class="form-field"><label for="credit-account-customer">Customer name</label><input class="form-input" id="credit-account-customer" name="customer" maxlength="80" required value="${escapeHTML(sale.customerName || "")}" placeholder="Customer name"></div>
        <div class="form-field" style="margin-top:12px"><label for="repayment-method">Repayment method</label><select class="form-select" id="repayment-method" name="method"><option>Cash</option><option>Card</option><option>Mobile payment</option><option>Other</option></select></div>
        <div class="form-field" style="margin-top:12px"><label for="repayment-amount">Repayment amount (${currencyCode})</label><input class="form-input" id="repayment-amount" name="amount" type="number" min="0.01" max="${balance.toFixed(2)}" step="0.01" ${balance ? "" : "disabled"} placeholder="Leave blank to update customer name"></div>
        <p class="form-error" id="repayment-error" aria-live="polite"></p>
        <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Close</button><button type="submit" class="primary-button">Save changes</button></div>
      </form>
    </section></div>`;
    modalRoot.querySelector("#credit-repayment-form").addEventListener("submit", (event) => recordCreditRepayment(event, sale.id));
    modalRoot.querySelector("#credit-account-customer").focus();
  }

  async function recordCreditRepayment(event, saleId) {
    event.preventDefault();
    const sale = state.sales.find((entry) => entry.id === saleId);
    if (!sale) return;
    const form = new FormData(event.currentTarget);
    const customerName = String(form.get("customer") || "").trim();
    const rawAmount = String(form.get("amount") || "").trim();
    const amount = Number(rawAmount);
    const error = modalRoot.querySelector("#repayment-error");
    if (!customerName) {
      error.textContent = "Enter the customer's name.";
      modalRoot.querySelector("#credit-account-customer").focus();
      return;
    }
    if (rawAmount && (!Number.isFinite(amount) || amount <= 0 || amount > creditBalance(sale))) {
      error.textContent = `Enter an amount greater than zero and no more than ${formatMoney(creditBalance(sale))}.`;
      return;
    }

    const repayment = rawAmount ? {
      id: `PAY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      amount: Math.round(amount * 100) / 100,
      paymentMethod: String(form.get("method")),
      createdAt: Date.now()
    } : null;
    const submitButton = event.currentTarget.querySelector("button[type=submit]");
    submitButton.disabled = true;
    try {
      await window.counterBackend.saveCreditAccount(saleId, customerName, repayment);
      await loadData();
      closeModal();
      render();
      notify(repayment ? "Repayment recorded." : "Credit customer updated.");
    } catch (repaymentError) {
      error.textContent = repaymentError.message;
      submitButton.disabled = false;
    }
  }

  function closeModal() {
    modalRoot.innerHTML = "";
  }

  function showSignedOut(message = "") {
    state.user = null;
    state.products = [];
    state.sales = [];
    state.cart = [];
    state.legacyData = null;
    appShell.hidden = true;
    authRoot.hidden = false;
    importButton.hidden = true;
    authMessage.textContent = message;
  }

  async function initializeWorkspace(user) {
    await loadData();
    const alreadyImported = await window.counterBackend.hasImportedLocalData();
    state.user = user;
    state.legacyData = null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (isValidData(data)) state.legacyData = data;
        else notify("This device has saved data in an older format that cannot be imported automatically.", true);
      }
    } catch (storageError) {
      notify(`Could not read this device's saved data. The shared shop account is still available. ${storageError.message}`, true);
    }
    importButton.hidden = alreadyImported || !state.legacyData || state.products.length > 0 || state.sales.length > 0;
    document.getElementById("account-name").textContent = user.email || "Shop account";
    document.getElementById("account-avatar").textContent = (user.email || "S").slice(0, 1).toUpperCase();
    authRoot.hidden = true;
    appShell.hidden = false;
    render();
  }

  async function startApp() {
    document.getElementById("today-label").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    if (!window.counterBackend.configured || !window.counterBackend.auth) {
      showSignedOut("Configure the Supabase project URL and publishable key in supabase-config.js to enable sign-in.");
      return;
    }
    try {
      const { data, error } = await window.counterBackend.auth.getSession();
      if (error) throw error;
      if (data.session) await initializeWorkspace(data.session.user);
      else showSignedOut();
    } catch (error) {
      showSignedOut(`Could not connect to the shop backend. ${error.message}`);
    }
  }

  function createId() {
    return `product-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  appContent.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, id, delta } = button.dataset;
    if (action === "add-to-cart") addToCart(id);
    else if (action === "change-quantity") changeQuantity(id, Number(delta));
    else if (action === "add-product") openProductForm();
    else if (action === "edit-product") openProductForm(state.products.find((product) => product.id === id));
    else if (action === "open-payment") openPayment();
    else if (action === "download-daily-products") downloadDailyProductReport();
    else if (action === "manage-credit") openCreditRepayment(state.sales.find((sale) => sale.id === id));
    else if (action === "view-receipt") {
      const sale = state.sales.find((entry) => entry.id === id);
      if (sale) {
        modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal modal-receipt" role="dialog" aria-modal="true" aria-labelledby="receipt-title"><div class="modal-header"><div><h2 id="receipt-title">Sale receipt</h2><p>Receipt details for this transaction.</p></div><button class="close-button" data-action="close-modal" aria-label="Close">×</button></div>${receiptMarkup(sale)}<div class="modal-actions"><button class="secondary-button" data-action="close-modal">Close</button><button class="primary-button" data-action="print-receipt">⎙ &nbsp;Print receipt</button></div></section></div>`;
      }
    }
  });

  appContent.addEventListener("input", (event) => {
    if (event.target.id === "product-search") {
      const selectionStart = event.target.selectionStart;
      state.query = event.target.value;
      render();
      const input = appContent.querySelector("#product-search");
      input.focus();
      input.setSelectionRange(selectionStart, selectionStart);
    } else if (event.target.id === "sales-search") {
      const selectionStart = event.target.selectionStart;
      state.salesQuery = event.target.value;
      renderSales();
      const input = appContent.querySelector("#sales-search");
      input.focus();
      input.setSelectionRange(selectionStart, selectionStart);
    }
  });

  appContent.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-category]");
    if (chip) {
      state.category = chip.dataset.category;
      renderCheckout();
    }
  });

  document.querySelectorAll(".nav-link").forEach((button) => button.addEventListener("click", () => {
    state.query = "";
    setView(button.dataset.view);
  }));

  modalRoot.addEventListener("click", (event) => {
    if (event.target === event.currentTarget.querySelector(".modal-backdrop")) closeModal();
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "close-modal") closeModal();
    else if (button.dataset.action === "print-receipt") window.print();
  });

  document.getElementById("help-button").addEventListener("click", () => {
    modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal modal-small" role="dialog" aria-modal="true" aria-labelledby="help-title"><div class="modal-header"><div><h2 id="help-title">About Counter</h2><p>A simple checkout and sales log for your shop.</p></div><button class="close-button" data-action="close-modal" aria-label="Close">×</button></div><p class="subheading" style="line-height:1.8">Add products to the basket, choose a payment method, then record the sale. Products, sales, and credit repayments are shared through your shop account. A connection is required to save changes and complete checkout. The local data import leaves the original copy on this device.</p><div class="modal-actions"><button class="primary-button" data-action="close-modal">Got it</button></div></section></div>`;
  });

  function setAuthMode(mode) {
    authMode = mode;
    const signingUp = mode === "signup";
    document.getElementById("auth-title").textContent = signingUp ? "Create your shop" : "Sign in";
    document.getElementById("auth-description").textContent = signingUp
      ? "Create an account with its own products and sales."
      : "Use your shop account to access its products and sales.";
    document.getElementById("confirm-password-field").hidden = !signingUp;
    document.getElementById("confirm-password").required = signingUp;
    document.getElementById("login-password").setAttribute("autocomplete", signingUp ? "new-password" : "current-password");
    document.getElementById("auth-submit-label").textContent = signingUp ? "Create account" : "Sign in";
    document.getElementById("auth-mode-toggle").textContent = signingUp
      ? "Already have an account? Sign in"
      : "New here? Create a shop account";
    authMessage.textContent = "";
  }

  document.getElementById("auth-mode-toggle").addEventListener("click", () => {
    setAuthMode(authMode === "signin" ? "signup" : "signin");
  });

  document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    authMessage.textContent = "";
    const formElement = event.currentTarget;
    const submitButton = formElement.querySelector("button[type=submit]");
    const form = new FormData(formElement);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    submitButton.disabled = true;
    try {
      if (!window.counterBackend.configured || !window.counterBackend.auth) {
        throw new Error("Configure the Supabase project URL and publishable key in supabase-config.js first.");
      }
      let result;
      if (authMode === "signup") {
        if (password.length < 8) throw new Error("Use a password with at least 8 characters.");
        if (password !== String(form.get("confirmPassword") || "")) throw new Error("The passwords do not match.");
        result = await window.counterBackend.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin }
        });
      } else {
        result = await window.counterBackend.auth.signInWithPassword({ email, password });
      }
      const { data, error } = result;
      if (error) throw error;
      if (authMode === "signup" && !data.session) {
        formElement.reset();
        setAuthMode("signin");
        authMessage.textContent = "Account created. Check your email to confirm it, then sign in.";
      } else {
        await initializeWorkspace(data.user);
      }
    } catch (error) {
      authMessage.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  document.getElementById("sign-out-button").addEventListener("click", async () => {
    try {
      const { error } = await window.counterBackend.auth.signOut();
      if (error) throw error;
      showSignedOut();
    } catch (error) {
      notify(`Could not sign out. ${error.message}`, true);
    }
  });

  importButton.addEventListener("click", async () => {
    if (!state.legacyData || !window.confirm(`Import ${state.legacyData.products.length} products and ${state.legacyData.sales.length} sales from this device? The original local copy will be kept.`)) return;
    const productCount = state.legacyData.products.length;
    const saleCount = state.legacyData.sales.length;
    importButton.disabled = true;
    try {
      const counts = await window.counterBackend.importLegacyData(state.legacyData);
      await loadData();
      state.legacyData = null;
      importButton.hidden = true;
      render();
      notify(`Imported ${counts.products} products and ${counts.sales} sales.`);
    } catch (error) {
      try {
        if (await window.counterBackend.hasImportedLocalData()) {
          await loadData();
          state.legacyData = null;
          importButton.hidden = true;
          render();
          notify(`Imported ${productCount} products and ${saleCount} sales.`);
          return;
        }
      } catch {}
      notify(`Local data was not imported. ${error.message}`, true);
    } finally {
      importButton.disabled = false;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  startApp();
})();

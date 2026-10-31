(() => {
  "use strict";

  const config = window.COUNTER_SUPABASE_CONFIG || {};
  const configured = Boolean(window.supabase?.createClient)
    && typeof config.url === "string" && config.url.startsWith("https://")
    && typeof config.anonKey === "string" && config.anonKey.length > 20
    && !config.url.includes("YOUR_PROJECT_ID") && !config.anonKey.includes("YOUR_SUPABASE");
  const client = configured && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;

  function requireClient() {
    if (!client) throw new Error("Supabase is not configured. Add your project URL and publishable key in supabase-config.js.");
    return client;
  }

  function throwIfError(result) {
    if (result.error) throw new Error(result.error.message || "The request could not be completed.");
    return result.data;
  }

  async function currentUser() {
    const { data, error } = await requireClient().auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error("Your session has ended. Sign in again to continue.");
    return data.user;
  }

  function mapSale(row) {
    return {
      id: row.id,
      createdAt: Number(row.created_at),
      paymentMethod: row.payment_method,
      total: Number(row.total),
      cashReceived: row.cash_received === null ? null : Number(row.cash_received),
      change: Number(row.change_amount),
      ...(row.customer_name ? { customerName: row.customer_name } : {}),
      items: (row.sale_items || []).sort((first, second) => first.position - second.position).map((item) => ({
        ...(item.product_id ? { productId: item.product_id } : {}),
        name: item.product_name,
        price: Number(item.unit_price),
        quantity: item.quantity
      })),
      ...(row.payment_method === "Credit" ? {
        repayments: (row.credit_repayments || []).map((repayment) => ({
          id: repayment.id,
          amount: Number(repayment.amount),
          paymentMethod: repayment.payment_method,
          createdAt: Number(repayment.created_at)
        }))
      } : {})
    };
  }

  async function fetchAll(queryFactory) {
    const rows = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const result = await queryFactory().range(offset, offset + pageSize - 1);
      const page = throwIfError(result);
      rows.push(...page);
      if (page.length < pageSize) return rows;
    }
  }

  async function loadData() {
    const api = requireClient();
    const [products, sales] = await Promise.all([
      fetchAll(() => api.from("products").select("id,name,category,price,stock,sku,emoji").order("name").order("id")),
      fetchAll(() => api.from("sales").select("id,created_at,payment_method,total,cash_received,change_amount,customer_name,sale_items(product_id,product_name,unit_price,quantity,position),credit_repayments(id,amount,payment_method,created_at)").order("created_at", { ascending: false }).order("id", { ascending: false }))
    ]);
    return {
      products: products.map((product) => ({ ...product, price: Number(product.price) })),
      sales: sales.map(mapSale)
    };
  }

  async function saveProduct(product) {
    const api = requireClient();
    const user = await currentUser();
    const result = await api.from("products").upsert({
      id: product.id,
      owner_id: user.id,
      name: product.name,
      category: product.category,
      price: product.price,
      stock: product.stock,
      sku: product.sku,
      emoji: product.emoji || "📦"
    }, { onConflict: "owner_id,id" });
    throwIfError(result);
  }

  async function recordSale(sale) {
    const result = await requireClient().rpc("record_sale", {
      p_sale: {
        id: sale.id,
        paymentMethod: sale.paymentMethod,
        cashReceived: sale.cashReceived,
        customerName: sale.customerName || null,
        items: sale.items.map((item) => ({ productId: item.productId, quantity: item.quantity }))
      }
    });
    throwIfError(result);
  }

  async function hasImportedLocalData() {
    const result = await requireClient().from("data_imports").select("owner_id").maybeSingle();
    throwIfError(result);
    return Boolean(result.data);
  }

  async function saveCreditAccount(saleId, customerName, repayment) {
    const result = await requireClient().rpc("record_credit_repayment", {
      p_sale_id: saleId,
      p_customer_name: customerName,
      p_repayment: repayment ? {
        id: repayment.id,
        amount: repayment.amount,
        paymentMethod: repayment.paymentMethod
      } : null
    });
    throwIfError(result);
  }

  async function importLegacyData(payload) {
    const result = await requireClient().rpc("import_legacy_data", { p_payload: payload });
    throwIfError(result);
    return result.data;
  }

  window.counterBackend = {
    configured,
    auth: client?.auth || null,
    currentUser,
    hasImportedLocalData,
    importLegacyData,
    loadData,
    recordSale,
    saveCreditAccount,
    saveProduct
  };
})();
'use strict';

const STORAGE_KEY = 'uwuCafePriceCalculator_v2';
const THEME_STORAGE_KEY = 'uwuCafePriceCalculator_theme';
const DISCOUNT_STORAGE_KEY = 'uwuCafePriceCalculator_discount';
const TIP_STORAGE_KEY = 'uwuCafePriceCalculator_tipTotal';
const CONFIRM_PREFS_STORAGE_KEY = 'uwuCafePriceCalculator_confirmPrefs';

const defaultProducts = [
  { name: 'Ramen', price: 25, qty: 0 },
  { name: 'Reis mit Curry', price: 25, qty: 0 },
  { name: 'Bento Box', price: 25, qty: 0 },
  { name: 'Onigiri', price: 15, qty: 0 },  
  { name: 'Omuraisu', price: 15, qty: 0 },
  { name: 'Karaage', price: 15, qty: 0 },
  { name: 'Dango', price: 15, qty: 0 },
  { name: 'Mochi', price: 12, qty: 0 },
  { name: 'Kuchen', price: 15, qty: 0 },
  { name: 'UwU Wasser', price: 10, qty: 0 },
  { name: 'Bubble Tea', price: 14, qty: 0 },
  { name: 'Kaffee', price: 8, qty: 0 },
  { name: 'Matcha Latte', price: 10, qty: 0 },
  { name: 'Tee', price: 10, qty: 0 },
  { name: 'UwU Cookie', price: 0, qty: 0 }
];

const CONFIRM_TYPES = Object.freeze({
  resetProducts: 'resetProducts',
  resetQty: 'resetQty',
  resetTips: 'resetTips'
});

const SECURITY_LIMITS = Object.freeze({
  maxProducts: 250,
  maxProductNameLength: 80,
  maxPrice: 100000,
  maxQty: 999,
  maxTipTotal: 1000000,
  maxAmountReceived: 1000000,
  maxDiscountPercent: 100
});

const MODAL_ANIMATION_MS = 360;

const productList = document.getElementById('productList');
const billList = document.getElementById('billList');
const totalItems = document.getElementById('totalItems');
const totalPrice = document.getElementById('totalPrice');
const discountedPrice = document.getElementById('discountedPrice');
const addProductBtn = document.getElementById('addProductBtn');
const resetBtn = document.getElementById('resetBtn');
const resetQtyBtn = document.getElementById('resetQtyBtn');
const resetTipBtn = document.getElementById('resetTipBtn');
const addTipBtn = document.getElementById('addTipBtn');
const markPaidBtn = document.getElementById('markPaidBtn');
const restoreConfirmDialogsBtn = document.getElementById('restoreConfirmDialogsBtn');
const showOrderBtn = document.getElementById('showOrderBtn');
const tipInput = document.getElementById('tipInput');
const tipTotal = document.getElementById('tipTotal');
const amountReceivedInput = document.getElementById('amountReceivedInput');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const themeModeLabel = document.getElementById('themeModeLabel');
const discountEnabled = document.getElementById('discountEnabled');
const discountPercent = document.getElementById('discountPercent');
const discountControls = document.getElementById('discountControls');
const discountHint = document.getElementById('discountHint');
const confirmModal = document.getElementById('confirmModal');
const confirmTitle = document.getElementById('confirmTitle');
const confirmMessage = document.getElementById('confirmMessage');
const confirmAcceptBtn = document.getElementById('confirmAcceptBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const confirmSkipCheckbox = document.getElementById('confirmSkipCheckbox');
const infoModal = document.getElementById('infoModal');
const infoTitle = document.getElementById('infoTitle');
const infoMessage = document.getElementById('infoMessage');
const infoCloseBtn = document.getElementById('infoCloseBtn');
const orderModal = document.getElementById('orderModal');
const orderTitle = document.getElementById('orderTitle');
const orderMessage = document.getElementById('orderMessage');
const orderCloseBtn = document.getElementById('orderCloseBtn');
const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');

let pendingConfirmAction = null;
let pendingConfirmType = null;
let lastSuggestedAmountReceived = 0;
let lastSuggestedAmountReceivedRaw = '0';
let lastSuggestedTipRaw = '0';

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeGetItem(key) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key, value) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveItem(key) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function parseStoredJson(key, fallback) {
  const raw = safeGetItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function clampNumber(value, min, max, fallback = min) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(max, Math.max(min, numericValue));
}

function sanitizeProductName(name) {
  return String(name || '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SECURITY_LIMITS.maxProductNameLength) || 'Neues Produkt';
}

function sanitizeMoneyInputValue(value, max) {
  const normalized = clampNumber(value, 0, max, 0);
  return normalized > 0 ? normalized.toFixed(2).replace('.', ',') : '0';
}

function parseMoneyInputValue(value, max) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  const normalized = raw
    .replace(/\s+/g, '')
    .replace(/\.(?=.*[\.,])/g, '')
    .replace(',', '.');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? clampNumber(parsed, 0, max, 0) : 0;
}

function sanitizeIntegerInputValue(value, max) {
  const normalized = Math.floor(clampNumber(value, 0, max, 0));
  return String(normalized);
}

function sanitizeProduct(product) {
  return {
    name: sanitizeProductName(product?.name),
    price: clampNumber(product?.price, 0, SECURITY_LIMITS.maxPrice, 0),
    qty: Math.floor(clampNumber(product?.qty, 0, SECURITY_LIMITS.maxQty, 0))
  };
}

function cloneDefaultProducts() {
  return defaultProducts.map(product => ({ ...product }));
}

function normalizeProductName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('de-DE');
}

function syncProductsWithDefaults(localProducts) {
  const safeLocalProducts = Array.isArray(localProducts)
    ? localProducts.slice(0, SECURITY_LIMITS.maxProducts).map(sanitizeProduct)
    : [];

  const existingNames = new Set(
    safeLocalProducts
      .map(product => normalizeProductName(product.name))
      .filter(Boolean)
  );

  const addedProducts = [];

  defaultProducts.forEach(defaultProduct => {
    const normalizedName = normalizeProductName(defaultProduct.name);
    if (!normalizedName || existingNames.has(normalizedName)) return;

    const newProduct = sanitizeProduct({ ...defaultProduct, qty: 0 });
    safeLocalProducts.push(newProduct);
    addedProducts.push(newProduct.name);
    existingNames.add(normalizedName);
  });

  return {
    products: safeLocalProducts.length ? safeLocalProducts : cloneDefaultProducts(),
    addedProducts
  };
}

function loadProducts() {
  const parsed = parseStoredJson(STORAGE_KEY, null);
  if (!Array.isArray(parsed) || !parsed.length) return cloneDefaultProducts();
  return parsed.slice(0, SECURITY_LIMITS.maxProducts).map(sanitizeProduct);
}

function saveProducts() {
  safeSetItem(STORAGE_KEY, JSON.stringify(products));
}

function loadThemePreference() {
  const saved = safeGetItem(THEME_STORAGE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : null;
}

function saveThemePreference(mode) {
  if (!mode) {
    safeRemoveItem(THEME_STORAGE_KEY);
    return;
  }
  safeSetItem(THEME_STORAGE_KEY, mode);
}

function loadDiscountState() {
  const parsed = parseStoredJson(DISCOUNT_STORAGE_KEY, null);
  const percent = Number(parsed?.percent);
  return {
    enabled: Boolean(parsed?.enabled),
    percent: Number.isFinite(percent) ? clampNumber(percent, 0, SECURITY_LIMITS.maxDiscountPercent, 10) : 10
  };
}

function saveDiscountState() {
  safeSetItem(DISCOUNT_STORAGE_KEY, JSON.stringify(discountState));
}

function loadTipTotal() {
  const raw = Number(safeGetItem(TIP_STORAGE_KEY));
  return Number.isFinite(raw) ? clampNumber(raw, 0, SECURITY_LIMITS.maxTipTotal, 0) : 0;
}

function saveTipTotal() {
  safeSetItem(TIP_STORAGE_KEY, String(tipTotalValue));
}

function loadConfirmPrefs() {
  const parsed = parseStoredJson(CONFIRM_PREFS_STORAGE_KEY, {});
  return {
    resetProducts: Boolean(parsed?.resetProducts),
    resetQty: Boolean(parsed?.resetQty),
    resetTips: Boolean(parsed?.resetTips)
  };
}

function saveConfirmPrefs() {
  safeSetItem(CONFIRM_PREFS_STORAGE_KEY, JSON.stringify(confirmPrefs));
}

const initialProducts = loadProducts();
const productSyncResult = syncProductsWithDefaults(initialProducts);

let products = productSyncResult.products;
let userThemePreference = loadThemePreference();
let discountState = loadDiscountState();
let tipTotalValue = loadTipTotal();
let confirmPrefs = loadConfirmPrefs();

function getResolvedTheme() {
  return userThemePreference || (themeMedia.matches ? 'dark' : 'light');
}

function applyTheme() {
  const resolved = getResolvedTheme();
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
  themeToggle.setAttribute('aria-pressed', String(resolved === 'dark'));
  themeIcon.textContent = resolved === 'dark' ? '☾' : '☀';
  themeModeLabel.textContent = userThemePreference
    ? `${resolved === 'dark' ? 'Dark Mode' : 'Light Mode'} · Manuell`
    : `${resolved === 'dark' ? 'Dark Mode' : 'Light Mode'} · Auto`;
}

function toggleTheme() {
  const current = getResolvedTheme();
  userThemePreference = current === 'dark' ? 'light' : 'dark';
  saveThemePreference(userThemePreference);
  applyTheme();
}

function runConfirmedAction(confirmType, title, message, onConfirm) {
  if (confirmPrefs[confirmType]) {
    onConfirm();
    return;
  }
  openConfirmDialog(confirmType, title, message, onConfirm);
}

function syncBodyModalState() {
  const hasVisibleModal = [confirmModal, infoModal, orderModal].some(modal => !modal.classList.contains('hidden'));
  document.body.classList.toggle('modal-open', hasVisibleModal);
}

function focusModalPrimaryAction(modal, focusTarget) {
  window.setTimeout(() => {
    if (!modal.classList.contains('hidden') && focusTarget) {
      focusTarget.focus();
    }
  }, 80);
}

function openAnimatedModal(modal, focusTarget) {
  modal.classList.remove('hidden', 'closing');
  modal.setAttribute('aria-hidden', 'false');
  syncBodyModalState();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });
  });

  focusModalPrimaryAction(modal, focusTarget);
}

function closeAnimatedModal(modal, onClosed) {
  if (modal.classList.contains('hidden') || modal.classList.contains('closing')) {
    return;
  }

  modal.classList.remove('show');
  modal.classList.add('closing');
  modal.setAttribute('aria-hidden', 'true');

  window.setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('closing');
    syncBodyModalState();
    if (typeof onClosed === 'function') onClosed();
  }, MODAL_ANIMATION_MS);
}

function openConfirmDialog(confirmType, title, message, onConfirm) {
  pendingConfirmType = confirmType;
  pendingConfirmAction = typeof onConfirm === 'function' ? onConfirm : null;
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmSkipCheckbox.checked = false;
  confirmAcceptBtn.textContent = 'Ja, ich bin sicher';
  confirmCancelBtn.textContent = 'Nein';
  openAnimatedModal(confirmModal, confirmAcceptBtn);
}

function openWarningContinueDialog(title, message, onConfirm) {
  pendingConfirmType = null;
  pendingConfirmAction = typeof onConfirm === 'function' ? onConfirm : null;
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmSkipCheckbox.checked = false;
  confirmAcceptBtn.textContent = 'Ja, fortfahren';
  confirmCancelBtn.textContent = 'Nein';
  openAnimatedModal(confirmModal, confirmAcceptBtn);
}

function closeConfirmDialog() {
  closeAnimatedModal(confirmModal, () => {
    pendingConfirmAction = null;
    pendingConfirmType = null;
    confirmSkipCheckbox.checked = false;
    confirmAcceptBtn.textContent = 'Ja, ich bin sicher';
    confirmCancelBtn.textContent = 'Nein';
  });
}

function openInfoDialog(title, addedProductNames) {
  const names = Array.isArray(addedProductNames)
    ? addedProductNames.map(sanitizeProductName).filter(Boolean)
    : [];
  if (!names.length) return;

  infoTitle.textContent = title;
  infoMessage.replaceChildren();

  const paragraph = document.createElement('p');
  paragraph.className = 'modal-text';
  paragraph.textContent = 'Neue Produkte wurden zur Liste hinzugefügt:';

  const list = document.createElement('ul');
  list.className = 'info-list';

  names.forEach(name => {
    const item = document.createElement('li');
    item.textContent = name;
    list.appendChild(item);
  });

  infoMessage.append(paragraph, list);
  openAnimatedModal(infoModal, infoCloseBtn);
}

function closeInfoDialog() {
  closeAnimatedModal(infoModal);
}

function resetAllQty() {
  products = products.map(product => ({ ...product, qty: 0 }));
  saveProducts();
  renderProducts();
  renderBill();
}

function getCurrentOrderTotal() {
  const price = products.reduce((sum, p) => sum + Number(p.qty || 0) * Number(p.price || 0), 0);
  const discountPercentValue = discountState.enabled ? clampNumber(discountState.percent, 0, SECURITY_LIMITS.maxDiscountPercent, 0) : 0;
  return price * (1 - discountPercentValue / 100);
}

function syncAmountReceivedFromTotal() {
  const total = clampNumber(getCurrentOrderTotal(), 0, SECURITY_LIMITS.maxAmountReceived, 0);
  const currentRaw = String(amountReceivedInput.value ?? '').trim();
  const currentValue = parseMoneyInputValue(currentRaw, SECURITY_LIMITS.maxAmountReceived);
  const shouldUpdate = !currentRaw
    || currentRaw === lastSuggestedAmountReceivedRaw
    || Math.abs(currentValue - lastSuggestedAmountReceived) < 0.009;

  if (shouldUpdate) {
    const suggested = sanitizeMoneyInputValue(total, SECURITY_LIMITS.maxAmountReceived);
    amountReceivedInput.value = suggested;
    lastSuggestedAmountReceivedRaw = suggested;
  }

  lastSuggestedAmountReceived = total;
}

function syncTipFromAmountReceived() {
  const received = parseMoneyInputValue(amountReceivedInput.value, SECURITY_LIMITS.maxAmountReceived);
  const total = getCurrentOrderTotal();
  const tipValue = received > total ? received - total : 0;
  const tipRaw = String(tipInput.value ?? '').trim();
  const shouldUpdateTip = document.activeElement !== tipInput
    || !tipRaw
    || tipRaw === lastSuggestedTipRaw;

  if (shouldUpdateTip) {
    const suggestedTip = sanitizeMoneyInputValue(tipValue, SECURITY_LIMITS.maxTipTotal);
    tipInput.value = suggestedTip;
    lastSuggestedTipRaw = suggestedTip;
  }
}

function updateDiscountUi() {
  discountEnabled.checked = discountState.enabled;
  discountPercent.value = String(clampNumber(discountState.percent, 0, SECURITY_LIMITS.maxDiscountPercent, 0));
  discountControls.classList.toggle('hidden', !discountState.enabled);
  discountControls.setAttribute('aria-hidden', String(!discountState.enabled));
}

function updateTipUi() {
  tipTotal.textContent = money(tipTotalValue);
  tipInput.value = '0';
  lastSuggestedTipRaw = '0';
}

function updateShowOrderButtonState() {
  const hasItems = products.some(product => Number(product.qty || 0) > 0);
  showOrderBtn.disabled = !hasItems;
  showOrderBtn.classList.toggle('is-active', hasItems);
  showOrderBtn.setAttribute('aria-disabled', String(!hasItems));
  showOrderBtn.title = hasItems
    ? 'Aktuelle Bestellung mit ausgewählten Produkten anzeigen'
    : 'Sobald Produkte ausgewählt wurden, kann die aktuelle Bestellung angezeigt werden';
}

function money(value) {
  return `${Number(value).toFixed(2).replace('.', ',')}$`;
}

function createField(labelText, input) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const label = document.createElement('label');
  label.className = 'small';
  label.textContent = labelText;
  wrap.append(label, input);
  return wrap;
}

function renderProducts() {
  productList.replaceChildren();

  products.forEach((product, index) => {
    const row = document.createElement('div');
    row.className = 'product-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = product.name;
    nameInput.placeholder = 'Produktname';
    nameInput.maxLength = SECURITY_LIMITS.maxProductNameLength;
    nameInput.autocomplete = 'off';
    nameInput.spellcheck = false;
    nameInput.addEventListener('input', event => {
      products[index].name = sanitizeProductName(event.target.value);
      if (nameInput.value !== products[index].name) {
        nameInput.value = products[index].name;
      }
      saveProducts();
      renderBill();
      syncTipFromAmountReceived();
    });

    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.step = '0.01';
    priceInput.min = '0';
    priceInput.value = String(product.price);
    priceInput.max = String(SECURITY_LIMITS.maxPrice);
    priceInput.inputMode = 'decimal';
    priceInput.autocomplete = 'off';
    priceInput.addEventListener('input', event => {
      const safeValue = clampNumber(event.target.value, 0, SECURITY_LIMITS.maxPrice, 0);
      products[index].price = safeValue;
      const normalized = safeValue > 0 ? String(safeValue) : '0';
      if (priceInput.value !== normalized && Number(priceInput.value) !== safeValue) {
        priceInput.value = normalized;
      }
      saveProducts();
      renderBill();
      syncTipFromAmountReceived();
    });

    const qtyWrap = document.createElement('div');
    qtyWrap.className = 'qty-wrap';
    const qtyLabel = document.createElement('label');
    qtyLabel.className = 'small';
    qtyLabel.textContent = 'Menge';

    const qtyControls = document.createElement('div');
    qtyControls.className = 'qty-controls';

    const minus = document.createElement('button');
    minus.className = 'qty-btn';
    minus.type = 'button';
    minus.textContent = '−';
    minus.addEventListener('click', () => {
      products[index].qty = Math.max(0, Number(products[index].qty || 0) - 1);
      saveProducts();
      renderProducts();
      renderBill();
      syncTipFromAmountReceived();
    });

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '0';
    qtyInput.step = '1';
    qtyInput.value = String(product.qty);
    qtyInput.max = String(SECURITY_LIMITS.maxQty);
    qtyInput.inputMode = 'numeric';
    qtyInput.autocomplete = 'off';
    qtyInput.addEventListener('input', event => {
      const safeValue = Math.floor(clampNumber(event.target.value, 0, SECURITY_LIMITS.maxQty, 0));
      products[index].qty = safeValue;
      const normalized = String(safeValue);
      if (qtyInput.value !== normalized && Number(qtyInput.value) !== safeValue) {
        qtyInput.value = normalized;
      }
      saveProducts();
      renderBill();
      syncTipFromAmountReceived();
    });

    const plus = document.createElement('button');
    plus.className = 'qty-btn';
    plus.type = 'button';
    plus.textContent = '+';
    plus.addEventListener('click', () => {
      products[index].qty = Math.min(SECURITY_LIMITS.maxQty, Number(products[index].qty || 0) + 1);
      saveProducts();
      renderProducts();
      renderBill();
      syncTipFromAmountReceived();
    });

    qtyControls.append(minus, qtyInput, plus);
    qtyWrap.append(qtyLabel, qtyControls);

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.type = 'button';
    delBtn.title = 'Produkt entfernen';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      products.splice(index, 1);
      saveProducts();
      renderProducts();
      renderBill();
      syncTipFromAmountReceived();
    });

    row.append(
      createField('Produkt', nameInput),
      createField('Preis', priceInput),
      qtyWrap,
      delBtn
    );

    productList.appendChild(row);
  });
}

function renderBill() {
  syncAmountReceivedFromTotal();
  updateShowOrderButtonState();

  const chosen = products.filter(p => Number(p.qty) > 0);
  const items = chosen.reduce((sum, p) => sum + Number(p.qty || 0), 0);
  const price = chosen.reduce((sum, p) => sum + Number(p.qty || 0) * Number(p.price || 0), 0);
  const discountPercentValue = discountState.enabled ? clampNumber(discountState.percent, 0, SECURITY_LIMITS.maxDiscountPercent, 0) : 0;
  const discountedTotal = price * (1 - discountPercentValue / 100);

  totalItems.textContent = String(items);
  totalPrice.textContent = money(price);
  discountedPrice.textContent = money(discountedTotal);
  discountHint.textContent = discountState.enabled
    ? `Rabatt von ${discountPercentValue.toFixed(1).replace('.', ',')}% aktiv · Ersparnis ${money(price - discountedTotal)}`
    : 'Rabatt derzeit deaktiviert.';

  billList.replaceChildren();

  if (!chosen.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Noch nichts ausgewählt ✦';
    billList.appendChild(empty);
    return;
  }

  chosen.forEach(product => {
    const row = document.createElement('div');
    row.className = 'bill-row';
    const lineSum = Number(product.qty) * Number(product.price);

    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = `${sanitizeProductName(product.name)} × ${Math.floor(clampNumber(product.qty, 0, SECURITY_LIMITS.maxQty, 0))}`;

    const priceEl = document.createElement('div');
    priceEl.className = 'price';
    priceEl.textContent = `${money(product.price)} je`;

    const sumEl = document.createElement('div');
    sumEl.className = 'sum';
    sumEl.textContent = money(lineSum);

    row.append(nameEl, priceEl, sumEl);
    billList.appendChild(row);
  });
}

function getCurrentOrderItems() {
  return products
    .filter(product => Number(product.qty) > 0)
    .map(product => ({
      name: sanitizeProductName(product.name),
      qty: Math.floor(clampNumber(product.qty, 0, SECURITY_LIMITS.maxQty, 0)),
      price: clampNumber(product.price, 0, SECURITY_LIMITS.maxPrice, 0),
      sum:
        Math.floor(clampNumber(product.qty, 0, SECURITY_LIMITS.maxQty, 0)) *
        clampNumber(product.price, 0, SECURITY_LIMITS.maxPrice, 0)
    }));
}

function createOrderSummaryTotalLine(labelText, valueText) {
  const line = document.createElement('div');
  line.className = 'order-summary-total-line';

  const label = document.createElement('span');
  label.textContent = labelText;

  const value = document.createElement('strong');
  value.textContent = valueText;

  line.append(label, value);
  return line;
}

function openOrderDialog() {
  const chosen = getCurrentOrderItems();
  const subtotal = chosen.reduce((sum, product) => sum + product.sum, 0);
  const discountPercentValue = discountState.enabled
    ? clampNumber(discountState.percent, 0, SECURITY_LIMITS.maxDiscountPercent, 0)
    : 0;
  const discountAmount = subtotal * (discountPercentValue / 100);
  const total = subtotal - discountAmount;

  orderTitle.textContent = 'Bestellübersicht';
  orderMessage.replaceChildren();

  if (!chosen.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Aktuell sind noch keine Produkte mit einer Menge größer als 0 ausgewählt.';
    orderMessage.appendChild(empty);
  } else {
    const shell = document.createElement('div');
    shell.className = 'order-summary-shell';

    const list = document.createElement('div');
    list.className = 'order-summary-list';

    chosen.forEach(product => {
      const row = document.createElement('div');
      row.className = 'order-summary-row';

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = `${product.qty} × ${sanitizeProductName(product.name)}`;

      const unit = document.createElement('div');
      unit.className = 'unit';
      unit.textContent = `Einzelpreis: ${money(product.price)}`;

      const sum = document.createElement('div');
      sum.className = 'sum';
      sum.textContent = `Gesamt: ${money(product.sum)}`;

      row.append(name, unit, sum);
      list.appendChild(row);
    });

    const totals = document.createElement('div');
    totals.className = 'order-summary-totals';

    if (discountState.enabled) {
      totals.appendChild(createOrderSummaryTotalLine('Zwischensumme', money(subtotal)));
      totals.appendChild(
        createOrderSummaryTotalLine(
          `Rabatt (${discountPercentValue.toFixed(1).replace('.', ',')}%)`,
          `− ${money(discountAmount)}`
        )
      );
    }

    totals.appendChild(createOrderSummaryTotalLine('Gesamter Bestellbetrag', money(total)));
    shell.append(list, totals);
    orderMessage.appendChild(shell);
  }

  openAnimatedModal(orderModal, orderCloseBtn);
}

function closeOrderDialog() {
  closeAnimatedModal(orderModal);
}

discountEnabled.addEventListener('change', event => {
  discountState.enabled = event.target.checked;
  saveDiscountState();
  updateDiscountUi();
  renderBill();
  syncTipFromAmountReceived();
});

discountPercent.addEventListener('input', event => {
  const safeValue = clampNumber(event.target.value, 0, SECURITY_LIMITS.maxDiscountPercent, 0);
  discountState.percent = safeValue;
  discountPercent.value = String(safeValue);
  saveDiscountState();
  renderBill();
  syncTipFromAmountReceived();
});

amountReceivedInput.addEventListener('input', () => {
  syncTipFromAmountReceived();
});

tipInput.addEventListener('input', () => {
  lastSuggestedTipRaw = '';
});

amountReceivedInput.addEventListener('blur', () => {
  lastSuggestedAmountReceivedRaw = String(amountReceivedInput.value ?? '').trim() || '0';
});

tipInput.addEventListener('blur', () => {
  lastSuggestedTipRaw = String(tipInput.value ?? '').trim() || '0';
});

addTipBtn.addEventListener('click', () => {
  const value = parseMoneyInputValue(tipInput.value, SECURITY_LIMITS.maxTipTotal);
  if (value <= 0) return;
  tipTotalValue = clampNumber(tipTotalValue + value, 0, SECURITY_LIMITS.maxTipTotal, tipTotalValue);
  saveTipTotal();
  updateTipUi();
  renderBill();
  syncTipFromAmountReceived();
});

addProductBtn.addEventListener('click', () => {
  if (products.length >= SECURITY_LIMITS.maxProducts) {
    openInfoDialog('Limit erreicht', [`Es können maximal ${SECURITY_LIMITS.maxProducts} Produkte verwaltet werden.`]);
    return;
  }
  products.push({ name: 'Neues Produkt', price: 0, qty: 0 });
  saveProducts();
  renderProducts();
  renderBill();
  syncTipFromAmountReceived();
});

resetBtn.addEventListener('click', () => {
  runConfirmedAction(
    CONFIRM_TYPES.resetProducts,
    'Produktliste zurücksetzen',
    'Sicher, dass die ursprüngliche Produktliste wiederhergestellt werden soll?\n\nDadurch gehen manuell hinzugefügte oder geänderte Produkte verloren.',
    () => {
      products = cloneDefaultProducts();
      saveProducts();
      renderProducts();
      renderBill();
      syncTipFromAmountReceived();
    }
  );
});

resetQtyBtn.addEventListener('click', () => {
  runConfirmedAction(
    CONFIRM_TYPES.resetQty,
    'Mengenangaben zurücksetzen',
    'Sicher, dass alle Mengenangaben wirklich auf 0 (null) zurückgesetzt werden sollen?',
    () => {
      resetAllQty();
      syncTipFromAmountReceived();
    }
  );
});

resetTipBtn.addEventListener('click', () => {
  runConfirmedAction(
    CONFIRM_TYPES.resetTips,
    'Trinkgeld zurücksetzen',
    'Sicher, dass die gesamte Trinkgeldsumme wirklich auf 0 (null) zurückgesetzt werden soll?',
    () => {
      tipTotalValue = 0;
      saveTipTotal();
      updateTipUi();
      renderBill();
      syncTipFromAmountReceived();
    }
  );
});

markPaidBtn.addEventListener('click', () => {
  const received = parseMoneyInputValue(amountReceivedInput.value, SECURITY_LIMITS.maxAmountReceived);
  const orderTotal = getCurrentOrderTotal();

  const finalize = () => {
    const autoTip = parseMoneyInputValue(tipInput.value, SECURITY_LIMITS.maxTipTotal);
    if (autoTip > 0) {
      tipTotalValue = clampNumber(tipTotalValue + autoTip, 0, SECURITY_LIMITS.maxTipTotal, tipTotalValue);
      saveTipTotal();
      updateTipUi();
    }

    resetAllQty();
    amountReceivedInput.value = '0';
    lastSuggestedAmountReceived = 0;
    syncTipFromAmountReceived();
  };

  if (received > 0 && received < orderTotal) {
    openWarningContinueDialog(
      'Betrag kleiner als Gesamtpreis',
      'Der eingegebene Betrag ist kleiner als der berechnete Gesamtpreis der Bestellung.\n\nMöchtest du trotzdem fortfahren?',
      finalize
    );
    return;
  }

  finalize();
});

showOrderBtn.addEventListener('click', () => {
  if (showOrderBtn.disabled) return;
  openOrderDialog();
});

restoreConfirmDialogsBtn.addEventListener('click', () => {
  confirmPrefs = {
    resetProducts: false,
    resetQty: false,
    resetTips: false
  };
  saveConfirmPrefs();
});

confirmAcceptBtn.addEventListener('click', () => {
  const action = pendingConfirmAction;
  const type = pendingConfirmType;
  const shouldSkip = confirmSkipCheckbox.checked;

  if (shouldSkip && type) {
    confirmPrefs[type] = true;
    saveConfirmPrefs();
  }

  closeConfirmDialog();
  if (action) action();
});

confirmCancelBtn.addEventListener('click', closeConfirmDialog);

confirmModal.addEventListener('click', event => {
  if (event.target === confirmModal) closeConfirmDialog();
});

infoCloseBtn.addEventListener('click', closeInfoDialog);
orderCloseBtn.addEventListener('click', closeOrderDialog);

infoModal.addEventListener('click', event => {
  if (event.target === infoModal) closeInfoDialog();
});

orderModal.addEventListener('click', event => {
  if (event.target === orderModal) closeOrderDialog();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!confirmModal.classList.contains('hidden')) {
      closeConfirmDialog();
      return;
    }
    if (!infoModal.classList.contains('hidden')) {
      closeInfoDialog();
      return;
    }
    if (!orderModal.classList.contains('hidden')) {
      closeOrderDialog();
    }
  }
});

themeToggle.addEventListener('click', toggleTheme);

if (typeof themeMedia.addEventListener === 'function') {
  themeMedia.addEventListener('change', () => {
    if (!userThemePreference) applyTheme();
  });
} else if (typeof themeMedia.addListener === 'function') {
  themeMedia.addListener(() => {
    if (!userThemePreference) applyTheme();
  });
}

if (productSyncResult.addedProducts.length) {
  saveProducts();
}

applyTheme();
updateDiscountUi();
updateTipUi();
renderProducts();
renderBill();
syncTipFromAmountReceived();

if (productSyncResult.addedProducts.length) {
  openInfoDialog('Neue Produkte erkannt', productSyncResult.addedProducts);
}

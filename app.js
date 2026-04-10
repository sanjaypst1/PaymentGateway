const el = (sel) => document.querySelector(sel);
const els = (sel) => Array.from(document.querySelectorAll(sel));

const formatINR = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);

const state = {
  method: "card",
  subtotal: 499,
  taxRate: 0.18,
  discount: 0,
};

function computeTotals() {
  const tax = (state.subtotal - state.discount) * state.taxRate;
  const total = Math.max(0, state.subtotal - state.discount) + tax;
  return { tax, total };
}

function setText(id, text) {
  const node = el(id);
  if (node) node.textContent = text;
}

function setError(name, msg) {
  const err = document.querySelector(`[data-error-for="${name}"]`);
  const input = document.getElementById(name);
  if (err) err.textContent = msg || "";
  if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
}

function clearAllErrors() {
  els("[data-error-for]").forEach((n) => (n.textContent = ""));
  els("input[aria-invalid='true']").forEach((n) =>
    n.setAttribute("aria-invalid", "false"),
  );
  setText("#couponError", "");
}

function setMethod(next) {
  state.method = next;
  els(".segBtn").forEach((b) => {
    const active = b.dataset.method === next;
    b.classList.toggle("isActive", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  els(".pane").forEach((p) =>
    p.classList.toggle("isActive", p.dataset.pane === next),
  );

  const cardReq = next === "card";
  const upiReq = next === "upi";

  el("#cardName").required = cardReq;
  el("#cardNumber").required = cardReq;
  el("#cardExp").required = cardReq;
  el("#cardCvc").required = cardReq;
  el("#email").required = cardReq;

  el("#upiId").required = upiReq;
}

function digitsOnly(s) {
  return (s || "").replace(/\D+/g, "");
}

function luhnCheck(numStr) {
  const digits = numStr.split("").map((c) => Number(c));
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits[i];
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function validateEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function validateExp(v) {
  const m = (v || "").match(/^(\d{2})\/(\d{2})$/);
  if (!m) return { ok: false, reason: "Use MM/YY" };
  const mm = Number(m[1]);
  const yy = Number(m[2]);
  if (mm < 1 || mm > 12) return { ok: false, reason: "Invalid month" };

  const now = new Date();
  const currYY = Number(String(now.getFullYear()).slice(-2));
  const currMM = now.getMonth() + 1;
  const isExpired = yy < currYY || (yy === currYY && mm < currMM);
  if (isExpired) return { ok: false, reason: "Card expired" };

  return { ok: true };
}

function validateUpi(v) {
  return /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test((v || "").trim());
}

function validateForm() {
  clearAllErrors();
  let ok = true;

  if (state.method === "card") {
    const cardName = el("#cardName").value.trim();
    const cardNumberRaw = el("#cardNumber").value;
    const cardNumber = digitsOnly(cardNumberRaw);
    const cardExp = el("#cardExp").value.trim();
    const cardCvc = digitsOnly(el("#cardCvc").value);
    const email = el("#email").value.trim();

    if (!cardName) {
      setError("cardName", "Enter the name on card.");
      ok = false;
    }

    if (cardNumber.length < 13 || cardNumber.length > 19) {
      setError("cardNumber", "Enter a valid card number.");
      ok = false;
    } else if (!luhnCheck(cardNumber)) {
      setError("cardNumber", "Card number failed validation (Luhn).");
      ok = false;
    }

    const exp = validateExp(cardExp);
    if (!exp.ok) {
      setError("cardExp", exp.reason);
      ok = false;
    }

    if (cardCvc.length < 3 || cardCvc.length > 4) {
      setError("cardCvc", "Enter a valid CVV.");
      ok = false;
    }

    if (!validateEmail(email)) {
      setError("email", "Enter a valid email.");
      ok = false;
    }
  } else {
    const upiId = el("#upiId").value;
    if (!validateUpi(upiId)) {
      setError("upiId", "Enter a valid UPI ID (e.g. name@bank).");
      ok = false;
    }
  }

  return ok;
}

function setTotalsUI() {
  const { tax, total } = computeTotals();
  setText("#subtotal", formatINR(state.subtotal));
  setText("#tax", formatINR(tax));
  setText("#total", formatINR(total));
  setText("#payAmountInline", formatINR(total));
}

function normalizeCardNumberInput() {
  const input = el("#cardNumber");
  const digits = digitsOnly(input.value).slice(0, 19);
  const grouped = digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  input.value = grouped;
}

function normalizeExpInput() {
  const input = el("#cardExp");
  const digits = digitsOnly(input.value).slice(0, 4);
  if (digits.length <= 2) input.value = digits;
  else input.value = `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function normalizeCvcInput() {
  const input = el("#cardCvc");
  input.value = digitsOnly(input.value).slice(0, 4);
}

function openModal() {
  const modal = el("#resultModal");
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  const modal = el("#resultModal");
  modal.hidden = true;
  document.body.style.overflow = "";
}

async function fakeProgress() {
  const title = el("#resultTitle");
  const desc = el("#resultDesc");
  const bar = el("#progressBar");
  const close = el("#closeModal");
  const newPayment = el("#newPayment");
  const icon = el("#statusIcon");

  close.disabled = true;
  newPayment.hidden = true;
  icon.classList.remove("ok", "fail");
  title.textContent = "Processing…";
  desc.textContent = "Please don’t close this tab.";
  bar.style.width = "0%";

  const steps = [
    { p: 18, t: "Connecting to bank…" },
    { p: 40, t: "Requesting authorization…" },
    { p: 66, t: state.method === "upi" ? "Waiting for UPI approval…" : "Verifying card…" },
    { p: 88, t: "Finalizing payment…" },
    { p: 100, t: "Done" },
  ];

  for (const s of steps) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 520));
    bar.style.width = `${s.p}%`;
    desc.textContent = s.t;
  }

  const tx = `TXN-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
  icon.classList.add("ok");
  title.textContent = "Payment successful";
  desc.textContent =
    state.method === "upi"
      ? `UPI request approved. Reference: ${tx}`
      : `Your card was charged. Reference: ${tx}`;

  close.disabled = false;
  newPayment.hidden = false;
  close.textContent = "Close";
}

function applyCoupon(codeRaw) {
  const code = (codeRaw || "").trim().toUpperCase();
  const before = state.discount;
  state.discount = 0;

  if (!code) {
    setText("#couponError", "");
    return true;
  }

  if (code === "SAVE10") {
    state.discount = Math.round(state.subtotal * 0.1 * 100) / 100;
    setText("#couponError", "");
  } else if (code === "FLAT50") {
    state.discount = 50;
    setText("#couponError", "");
  } else {
    state.discount = before;
    setText("#couponError", "Invalid coupon. Try SAVE10 or FLAT50.");
    return false;
  }
  return true;
}

function resetForm() {
  el("#payForm").reset();
  state.discount = 0;
  setTotalsUI();
  clearAllErrors();
  setMethod("card");
}

function init() {
  setTotalsUI();
  setMethod("card");

  els(".segBtn").forEach((b) =>
    b.addEventListener("click", () => setMethod(b.dataset.method)),
  );

  el("#cardNumber").addEventListener("input", normalizeCardNumberInput);
  el("#cardExp").addEventListener("input", normalizeExpInput);
  el("#cardCvc").addEventListener("input", normalizeCvcInput);

  el("#applyCoupon").addEventListener("click", () => {
    applyCoupon(el("#coupon").value);
    setTotalsUI();
  });

  el("#coupon").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyCoupon(el("#coupon").value);
      setTotalsUI();
    }
  });

  el("#payForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = validateForm();
    if (!ok) return;

    openModal();
    el("#payBtn").disabled = true;
    el("#payBtn").textContent = "Processing…";

    await fakeProgress();

    el("#payBtn").disabled = false;
    el("#payBtn").innerHTML = `Pay <span id="payAmountInline"></span>`;
    setTotalsUI();
  });

  el("#closeModal").addEventListener("click", () => closeModal());
  el("#newPayment").addEventListener("click", () => {
    closeModal();
    resetForm();
  });

  el("#resultModal").addEventListener("click", (e) => {
    if (e.target === el("#resultModal")) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el("#resultModal").hidden) closeModal();
  });
}

document.addEventListener("DOMContentLoaded", init);


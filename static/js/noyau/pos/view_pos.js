document.addEventListener("DOMContentLoaded", function () {
    const POINT_EARN_STEP = 2500;
    const POINT_VALUE_KMF = 100;

    const buttons = document.querySelectorAll(".filter-button");
    const products = document.querySelectorAll("#list-product > div[data-slot='card']");
    const productList = document.getElementById("list-product");
    const list = document.getElementById("list-item");
    const subtotalElem = document.getElementById("subtotal");
    const totalElem = document.getElementById("total");
    const payBtn = document.getElementById("btn-pay");
    const clearBtn = document.querySelector("button#btn-clear");
    const cardBox = document.getElementById("fidelity-card-box");
    const voucherBox = document.getElementById("voucher-box");
    const voucherRemoveBtn = document.getElementById("voucher-remove");
    const loyalties_json = document.getElementById("loyalties_json");
    const modalContainer = document.getElementById("modalContainer");
    const csrfToken = document.querySelector("[name=csrfmiddlewaretoken]");
    const abimesButton = document.getElementById("btn-abimes");
    const remisesButton = document.getElementById("btn-remises");
    const consumptionsButton = document.getElementById("btn-consumptions");
    const expensesButton = document.getElementById("btn-expenses");
    const resaleStockButton = document.getElementById("btn-resale-stock");
    const arStockButton = document.getElementById("btn-ar-stock");
    const logoutButton = document.getElementById("btn-logout");
    const productsDataEl = document.getElementById("pos-products");
    const remisesDefaultsEl = document.getElementById("pos-remises-defaults");
    const remisesCurrentEl = document.getElementById("pos-remises-current");
    const shiftDataEl = document.getElementById("pos-shift");
    const searchInput = document.getElementById("search-product");
    const pyromaneOrdersEl = document.getElementById("pyromane-orders");
    const pyromaneButton = document.getElementById("btn-pyromane");
    const pyromaneCountBadge = document.querySelector("[data-role='pyromane-count']");
    const miniFourButton = document.getElementById("btn-mini-four");
    const miniFourCountBadge = document.querySelector("[data-role='mini-four-count']");
    let pyromaneList = document.getElementById("pyromane-list");
    let pyromaneSearch = document.getElementById("pyromane-search");
    let pyromaneRefresh = document.getElementById("pyromane-refresh");
    const pyromaneActiveBox = document.getElementById("pyromane-active");
    const pyromaneRemoveBtn = document.getElementById("pyromane-remove");
    const pyromaneHistoryBtn = document.getElementById("pyromane-history");
    const pyromaneModifiedBadge = document.querySelector("[data-role='pyromane-modified']");

    if (!productList || !list || !subtotalElem || !totalElem || !payBtn || !cardBox || !modalContainer || !csrfToken) {
        return;
    }

    let loyaltiesData = [];
    const loyaltyCache = new Map();
    let productsData = [];
    let remisesDefaults = {};
    let remisesCurrent = {};
    let shiftData = {};
    if (loyalties_json) {
        const rawLoyalties = (loyalties_json.textContent || "").trim();
        loyaltiesData = JSON.parse(rawLoyalties || "[]");
    }
    if (productsDataEl) {
        productsData = JSON.parse(productsDataEl.textContent || "[]");
    }
    if (remisesDefaultsEl) {
        remisesDefaults = JSON.parse(remisesDefaultsEl.textContent || "{}");
    }
    if (remisesCurrentEl) {
        remisesCurrent = JSON.parse(remisesCurrentEl.textContent || "{}");
    }
    if (shiftDataEl) {
        shiftData = JSON.parse(shiftDataEl.textContent || "{}");
    }
    let pyromaneOrders = [];
    if (pyromaneOrdersEl) {
        const raw = JSON.parse(pyromaneOrdersEl.textContent || "[]");
        pyromaneOrders = Array.isArray(raw)
            ? raw
            : (raw && Array.isArray(raw.orders) ? raw.orders : []);
    }

    let activeVoucher = null;
    let activePyromaneOrder = null;
    let pyromaneModalInterval = null;
    let pyromaneSyncTimer = null;

    function setShiftLock(locked) {
        const lockClass = "opacity-50";
        const buttonsToLock = [
            payBtn,
            clearBtn,
            abimesButton,
            remisesButton,
            consumptionsButton,
            expensesButton,
            resaleStockButton,
            arStockButton,
        ];
        buttonsToLock.forEach((btn) => {
            if (!btn) return;
            btn.disabled = locked;
            btn.classList.toggle(lockClass, locked);
            btn.classList.toggle("pointer-events-none", locked);
        });
    }

    async function selectShift(shift, force = false) {
        const res = await fetch("/pos/shift/select/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfToken.value,
            },
            body: JSON.stringify({
                shift,
                force,
            }),
        });
        const data = await window.safeJson(res);
        if (!res.ok || !data.success) {
            if (data && data.requires_confirm) {
                openShiftModal("confirm", data.time_shift);
                return;
            }
            openInfoModal({
                title: "Shift indisponible",
                message: data.error || "Impossible de définir le shift.",
                tone: "error",
            });
            return;
        }
        shiftData = data.shift_data || shiftData;
        setShiftLock(false);
        modalContainer.innerHTML = "";
        window.location.reload();
    }

    function openShiftModal(mode = "select", timeShiftOverride = null) {
        if (!modalContainer) return;
        const timeShift = timeShiftOverride || shiftData.time_shift || "MATIN";
        const isConfirm = mode === "confirm";
        const allowMorning = isConfirm || timeShift === "MATIN";
        const allowEvening = isConfirm || timeShift === "SOIR";
        const showForceMorning = !isConfirm && timeShift === "SOIR";
        const title = isConfirm ? "Changement de shift" : "Choisir votre shift";
        const desc = isConfirm
            ? "Il est après 15h. Continuer le matin ou passer au soir ?"
            : "Sélectionnez le shift qui correspond à votre poste actuel.";

        modalContainer.innerHTML = `
            <div role="dialog" aria-labelledby="shift-title" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border p-6 shadow-lg duration-200 sm:max-w-[420px]" tabindex="-1" style="pointer-events: auto">
                <div class="space-y-1">
                    <h2 id="shift-title" class="text-lg font-semibold">${title}</h2>
                    <p class="text-sm text-muted-foreground">${desc}</p>
                </div>
                <div class="grid gap-3">
                    <button type="button" data-shift="MATIN" class="shift-select-btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all ${allowMorning ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border bg-background text-muted-foreground"} h-10 px-4 py-2" ${allowMorning ? "" : "disabled"}>
                        Matin
                    </button>
                    <button type="button" data-shift="SOIR" class="shift-select-btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all ${allowEvening ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border bg-background text-muted-foreground"} h-10 px-4 py-2" ${allowEvening ? "" : "disabled"}>
                        Soir
                    </button>
                    ${showForceMorning ? `
                        <button type="button" data-shift="MATIN" data-force="1" class="shift-select-btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background hover:bg-accent h-9 px-4 py-2">
                            Forcer matin (retard)
                        </button>
                    ` : ""}
                </div>
            </div>
        `;
        modalContainer.querySelectorAll(".shift-select-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const shift = btn.dataset.shift;
                const force = btn.dataset.force === "1" || mode === "confirm";
                selectShift(shift, force);
            });
        });
    }

    function isModalOpen() {
        return Boolean(document.querySelector(".modal-custom"));
    }

    function closeScanModal() {
        if (modalContainer) {
            modalContainer.innerHTML = "";
        }
    }

    function openScanModal() {
        if (!modalContainer || isModalOpen()) return;
        modalContainer.innerHTML = `
            <div role="dialog" aria-labelledby="scan-title" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border p-6 shadow-lg duration-200 sm:max-w-[420px]" tabindex="-1" style="pointer-events: auto">
                <div class="space-y-1">
                    <h2 id="scan-title" class="text-lg font-semibold">Scanner carte fidélité</h2>
                    <p class="text-sm text-muted-foreground">Passe la carte devant la douchette ou saisis le code.</p>
                </div>
                <div class="space-y-2">
                    <label data-slot="label" class="flex items-center gap-2 text-sm leading-none font-medium" for="scan-card">Code carte</label>
                    <input data-slot="input" id="scan-card" class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-10 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none" placeholder="Scanner la carte" />
                </div>
                <div class="flex justify-end gap-2">
                    <button type="button" id="scan-cancel" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                        Annuler
                    </button>
                </div>
            </div>
        `;
        const input = modalContainer.querySelector("#scan-card");
        const cancelBtn = modalContainer.querySelector("#scan-cancel");
        if (cancelBtn) {
            cancelBtn.addEventListener("click", closeScanModal);
        }
        bindScanInput(input);
    }

    function renderScanPrompt() {
        if (!cardBox) return;
        cardBox.innerHTML = `
            <div class="pos-fidelity-scan">
                <div>
                    <p class="pos-fidelity-title">Carte fidélité</p>
                    <p class="pos-fidelity-sub">Cliquez pour scanner la carte</p>
                </div>
                <button id="open-scan-modal" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2">
                    Scanner
                </button>
            </div>
        `;
        const btn = cardBox.querySelector("#open-scan-modal");
        if (btn) {
            btn.addEventListener("click", openScanModal);
        }
    }

    function initShiftSelection() {
        const shiftValue = (shiftData.shift || "").toUpperCase();
        if (!shiftValue) {
            setShiftLock(true);
            openShiftModal("select");
            return;
        }
        if (shiftData.needs_confirm) {
            setShiftLock(true);
            openShiftModal("confirm", shiftData.time_shift);
            return;
        }
        setShiftLock(false);
    }

    renderScanPrompt();
    initShiftSelection();

    function toInt(value) {
        return parseInt(value, 10) || 0;
    }

    function formatKmf(value) {
        return `${toInt(value)} KMF`;
    }

    function calculateEarnedPoints(amount, remainder = 0) {
        const normalized = toInt(amount);
        const carry = toInt(remainder);
        if (normalized <= 0) {
            return 0;
        }
        return Math.floor((normalized + carry) / POINT_EARN_STEP);
    }

    function maxRedeemablePoints(amount) {
        const normalized = toInt(amount);
        if (normalized <= 0) {
            return 0;
        }
        return Math.floor(normalized / POINT_VALUE_KMF);
    }

    function normalizeWallet(solde) {
        const normalizedSoldeFromInput = toInt(solde);
        const normalizedPoints = Math.floor(normalizedSoldeFromInput / POINT_VALUE_KMF);
        const normalizedSolde = normalizedPoints * POINT_VALUE_KMF;
        return {
            points: normalizedPoints,
            solde: normalizedSolde,
        };
    }

    function getCartSubtotal() {
        let subtotal = 0;
        document.querySelectorAll(".amount").forEach(el => {
            subtotal += toInt(el.textContent);
        });
        return subtotal;
    }

    function updateLoyaltyPreview(subtotal) {
        const cardDiv = cardBox.querySelector("div[data-id]");
        if (!cardDiv) {
            return;
        }
        const remainder = toInt(cardDiv.dataset.remainder);
        const preview = cardDiv.querySelector("[data-role='points-earned-preview']");
        if (preview) {
            preview.textContent = `Points a gagner: +${calculateEarnedPoints(subtotal, remainder)}`;
        }
    }

    function getScannedLoyaltyCard() {
        const cardDiv = cardBox.querySelector("div[data-id]");
        if (!cardDiv) {
            return null;
        }
        return {
            id: toInt(cardDiv.dataset.id),
            client: cardDiv.dataset.client || "",
            solde: toInt(cardDiv.dataset.solde),
            points_balance: toInt(cardDiv.dataset.points),
            points_remainder: toInt(cardDiv.dataset.remainder),
        };
    }

    function isVoucherCode(value) {
        return /^brm-?[a-z0-9]{3,}$/i.test(value.trim());
    }

    function setActiveVoucher(voucher) {
        activeVoucher = voucher;
        if (!voucherBox) {
            return;
        }
        voucherBox.classList.remove("hidden");
        const codeEl = voucherBox.querySelector("[data-role='voucher-code']");
        const expiryEl = voucherBox.querySelector("[data-role='voucher-expiry']");
        const amountEl = voucherBox.querySelector("[data-role='voucher-amount']");
        if (codeEl) {
            codeEl.textContent = voucher.code;
        }
        if (expiryEl) {
            expiryEl.textContent = `Expire le ${voucher.expires_at}`;
        }
        if (amountEl) {
            amountEl.textContent = formatKmf(voucher.amount);
        }
    }

    function clearActiveVoucher() {
        activeVoucher = null;
        if (!voucherBox) {
            return;
        }
        voucherBox.classList.add("hidden");
        const codeEl = voucherBox.querySelector("[data-role='voucher-code']");
        const expiryEl = voucherBox.querySelector("[data-role='voucher-expiry']");
        const amountEl = voucherBox.querySelector("[data-role='voucher-amount']");
        if (codeEl) {
            codeEl.textContent = "";
        }
        if (expiryEl) {
            expiryEl.textContent = "";
        }
        if (amountEl) {
            amountEl.textContent = "";
        }
    }

    async function scanVoucher(code) {
        let normalizedCode = code.trim().toUpperCase();
        if (normalizedCode.startsWith("BRM") && !normalizedCode.startsWith("BRM-") && normalizedCode.length > 3) {
            normalizedCode = `BRM-${normalizedCode.slice(3)}`;
        }
        if (!normalizedCode) {
            return false;
        }
        try {
            const response = await fetch(`/pos/voucher/scan/?code=${encodeURIComponent(normalizedCode)}`);
            const data = await response.json();
            if (!response.ok || !data.success) {
                openInfoModal({
                    title: "Bon invalide",
                    message: data.error || "Impossible de valider ce bon.",
                    tone: "error",
                });
                return false;
            }
            setActiveVoucher(data.voucher);
            return true;
        } catch (error) {
            console.error("Erreur bon", error);
            openInfoModal({
                title: "Bon invalide",
                message: "Impossible de valider ce bon.",
                tone: "error",
            });
            return false;
        }
    }

    function setActivePyromane(order) {
        activePyromaneOrder = order;
        if (!pyromaneActiveBox) {
            return;
        }
        pyromaneActiveBox.classList.remove("hidden");
        const numberEl = pyromaneActiveBox.querySelector("[data-role='pyromane-order-number']");
        const timeEl = pyromaneActiveBox.querySelector("[data-role='pyromane-order-time']");
        const amountEl = pyromaneActiveBox.querySelector("[data-role='pyromane-order-amount']");
        if (numberEl) numberEl.textContent = order.order_number;
        if (timeEl) timeEl.textContent = `Reçue à ${order.created_at}`;
        if (amountEl) amountEl.textContent = formatKmf(order.total_amount);
        if (pyromaneModifiedBadge) {
            if (order.modified) {
                pyromaneModifiedBadge.classList.remove("is-hidden");
            } else {
                pyromaneModifiedBadge.classList.add("is-hidden");
            }
        }
    }

    function updateActivePyromaneFromServer(order) {
        if (!order || !activePyromaneOrder) return;
        activePyromaneOrder.total_amount = order.total_amount;
        if (order.items) {
            activePyromaneOrder.items = order.items;
        }
        setActivePyromane(activePyromaneOrder);
    }

    function clearActivePyromane() {
        activePyromaneOrder = null;
        if (!pyromaneActiveBox) {
            return;
        }
        pyromaneActiveBox.classList.add("hidden");
        const numberEl = pyromaneActiveBox.querySelector("[data-role='pyromane-order-number']");
        const timeEl = pyromaneActiveBox.querySelector("[data-role='pyromane-order-time']");
        const amountEl = pyromaneActiveBox.querySelector("[data-role='pyromane-order-amount']");
        if (numberEl) numberEl.textContent = "";
        if (timeEl) timeEl.textContent = "";
        if (amountEl) amountEl.textContent = "";
        if (pyromaneModifiedBadge) {
            pyromaneModifiedBadge.classList.add("is-hidden");
        }
    }

    function updateActionBadge(button, badge, count) {
        if (!button || !badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? "99+" : String(count);
            badge.classList.remove("is-hidden");
            button.classList.add("has-pending");
        } else {
            badge.textContent = "0";
            badge.classList.add("is-hidden");
            button.classList.remove("has-pending");
        }
    }

    function renderPyromaneOrders(list) {
        if (!pyromaneList) {
            return;
        }
        const orders = Array.isArray(list)
            ? list
            : (list && Array.isArray(list.orders) ? list.orders : []);
        pyromaneList.innerHTML = "";
        if (!orders.length) {
            pyromaneList.innerHTML = "<div class='text-xs text-muted-foreground'>Aucune commande en attente.</div>";
            return;
        }
        orders.forEach((order) => {
            const card = document.createElement("div");
            card.className = "pos-pyromane-card";
            card.innerHTML = `
                <div class="pos-pyromane-card-header">
                    <div>
                        <div class="pos-pyromane-number">${order.order_number}</div>
                        <div class="pos-pyromane-meta">${order.created_at} · ${formatKmf(order.total_amount)}</div>
                    </div>
                    ${order.modified ? `<span class="pos-pyromane-badge">Modifié</span>` : ""}
                </div>
                <button class="pos-pyromane-action" type="button">Charger</button>
            `;
            const btn = card.querySelector(".pos-pyromane-action");
            btn.addEventListener("click", () => loadPyromaneOrder(order));
            pyromaneList.appendChild(card);
        });
    }

    function filterPyromaneOrders() {
        const query = (pyromaneSearch ? pyromaneSearch.value : "").trim().toLowerCase();
        if (!query) {
            renderPyromaneOrders(pyromaneOrders);
            return;
        }
        const list = Array.isArray(pyromaneOrders)
            ? pyromaneOrders
            : (pyromaneOrders && Array.isArray(pyromaneOrders.orders) ? pyromaneOrders.orders : []);
        const filtered = list.filter((order) => order.order_number.toLowerCase().includes(query));
        renderPyromaneOrders(filtered);
    }

    async function refreshPyromaneOrders() {
        try {
            const response = await fetch("/pyromane/orders/pending/");
            const data = await window.safeJson(response);
            if (!response.ok || !data || !data.success) {
                return;
            }
            pyromaneOrders = data.orders || [];
            updateActionBadge(pyromaneButton, pyromaneCountBadge, pyromaneOrders.length);
            filterPyromaneOrders();
        } catch (error) {
            console.error("Erreur chargement Pyromane", error);
        }
    }

    async function refreshMiniFourCount() {
        if (!miniFourButton) {
            return;
        }
        try {
            const response = await fetch("/bakery/orders/pending-count/");
            const data = await window.safeJson(response);
            if (!response.ok || !data || !data.success) {
                return;
            }
            updateActionBadge(miniFourButton, miniFourCountBadge, data.count || 0);
        } catch (error) {
            console.warn("Erreur chargement Mini-Four", error);
        }
    }

    function closePyromaneModal() {
        if (pyromaneModalInterval) {
            clearInterval(pyromaneModalInterval);
            pyromaneModalInterval = null;
        }
        if (modalContainer) {
            modalContainer.innerHTML = "";
        }
        pyromaneList = null;
        pyromaneSearch = null;
        pyromaneRefresh = null;
    }

    function openPyromaneModal() {
        if (!modalContainer) {
            return;
        }
        if (modalContainer.querySelector(".modal-custom")) {
            return;
        }
        modalContainer.innerHTML = `
            <div role="dialog" aria-labelledby="pyromane-title" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border p-6 shadow-lg duration-200 sm:max-w-[720px]" tabindex="-1" style="pointer-events: auto">
                <div class="flex items-start justify-between gap-4">
                    <div class="space-y-1">
                        <h2 id="pyromane-title" class="text-lg font-semibold">Commandes Pyromane</h2>
                        <p class="text-sm text-muted-foreground">En attente de paiement</p>
                    </div>
                    <button type="button" id="pyromane-close" class="rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent">Fermer</button>
                </div>
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input id="pyromane-search" type="text" placeholder="Rechercher PG-1205..." class="pos-pyromane-search w-full" />
                    <button id="pyromane-refresh" type="button" class="pos-pyromane-refresh">Actualiser</button>
                </div>
                <div id="pyromane-list" class="pos-pyromane-list pos-pyromane-list--modal"></div>
            </div>
        `;

        pyromaneList = document.getElementById("pyromane-list");
        pyromaneSearch = document.getElementById("pyromane-search");
        pyromaneRefresh = document.getElementById("pyromane-refresh");

        if (pyromaneSearch) {
            pyromaneSearch.addEventListener("input", filterPyromaneOrders);
        }
        if (pyromaneRefresh) {
            pyromaneRefresh.addEventListener("click", refreshPyromaneOrders);
        }
        renderPyromaneOrders(pyromaneOrders);
        refreshPyromaneOrders();
        pyromaneModalInterval = setInterval(refreshPyromaneOrders, 20000);

        const closeBtn = document.getElementById("pyromane-close");
        if (closeBtn) {
            closeBtn.addEventListener("click", closePyromaneModal);
        }
    }

    async function openPyromaneHistoryModal() {
        if (!activePyromaneOrder) {
            openInfoModal({
                title: "Historique indisponible",
                message: "Aucune commande Pyromane chargée.",
                tone: "info",
            });
            return;
        }
        try {
            const response = await fetch(`/pyromane/order/logs/?order_id=${encodeURIComponent(activePyromaneOrder.id)}`);
            const data = await window.safeJson(response);
            if (!response.ok || !data.success) {
                openInfoModal({
                    title: "Historique",
                    message: data.error || "Impossible de charger l'historique.",
                    tone: "error",
                });
                return;
            }
            const logs = data.logs || [];
            const listHtml = logs.length
                ? logs.map((log) => {
                    const actionLabel = log.action === "CREATE"
                        ? "Créée"
                        : log.action === "CANCEL"
                            ? "Annulée"
                            : "Modifiée";
                    const itemCount = Array.isArray(log.details?.after) ? log.details.after.length : null;
                    const summary = itemCount !== null ? `${itemCount} article(s)` : "";
                    return `
                        <div class="flex items-start justify-between gap-3 border-b pb-2">
                            <div>
                                <div class="text-sm font-semibold">${actionLabel}</div>
                                <div class="text-xs text-muted-foreground">${log.created_at} ${log.user ? "· " + log.user : ""}</div>
                            </div>
                            <div class="text-xs text-muted-foreground">${summary}</div>
                        </div>
                    `;
                }).join("")
                : "<div class='text-sm text-muted-foreground'>Aucune modification.</div>";

            modalContainer.innerHTML = `
                <div role="dialog" aria-labelledby="pyromane-history-title" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border p-6 shadow-lg duration-200 sm:max-w-[520px]" tabindex="-1" style="pointer-events: auto">
                    <div class="flex items-start justify-between gap-4">
                        <div class="space-y-1">
                            <h2 id="pyromane-history-title" class="text-lg font-semibold">Historique Pyromane</h2>
                            <p class="text-sm text-muted-foreground">Commande ${activePyromaneOrder.order_number}</p>
                        </div>
                        <button type="button" id="pyromane-history-close" class="rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent">Fermer</button>
                    </div>
                    <div class="space-y-2">${listHtml}</div>
                </div>
            `;
            const closeBtn = document.getElementById("pyromane-history-close");
            if (closeBtn) {
                closeBtn.addEventListener("click", () => {
                    modalContainer.innerHTML = "";
                });
            }
        } catch (error) {
            console.error("Erreur historique Pyromane", error);
            openInfoModal({
                title: "Historique",
                message: "Impossible de charger l'historique.",
                tone: "error",
            });
        }
    }

    function loadPyromaneOrder(order) {
        if (activePyromaneOrder && activePyromaneOrder.id !== order.id) {
            const proceed = window.confirm("Une commande Pyromane est déjà chargée. Remplacer ?");
            if (!proceed) {
                return;
            }
            removePyromaneItemsFromCart();
            clearActivePyromane();
        }

        setActivePyromane(order);
        addPyromaneItemsToCart(order);
        updateTotals();
        closePyromaneModal();
    }

    function addPyromaneItemsToCart(order) {
        order.items.forEach((item) => {
            const existing = list.querySelector(`.cart-item[data-id='${item.product_id}']`);
            if (existing) {
                const qtyElem = existing.querySelector(".quantity");
                const amountElem = existing.querySelector(".amount");
                const currentQty = toInt(qtyElem.textContent);
                const newQty = currentQty + item.quantity;
                qtyElem.textContent = newQty;
                amountElem.textContent = newQty * toInt(existing.dataset.price);
                const baseQty = toInt(existing.dataset.baseQty) || 0;
                existing.dataset.lock = "pyromane";
                existing.dataset.baseQty = baseQty + item.quantity;
            } else {
                createCartItem(item.product_id, item.name, item.unit_price, "∞", {
                    lock: true,
                    baseQty: item.quantity,
                });
                const created = list.querySelector(`.cart-item[data-id='${item.product_id}']`);
                if (created) {
                    const qtyElem = created.querySelector(".quantity");
                    const amountElem = created.querySelector(".amount");
                    qtyElem.textContent = item.quantity;
                    amountElem.textContent = item.quantity * toInt(created.dataset.price);
                }
            }
        });
    }

    function removePyromaneItemsFromCart() {
        const lockedItems = list.querySelectorAll(".cart-item[data-lock='pyromane']");
        lockedItems.forEach((item) => item.remove());
        updateTotals();
    }

    function collectPyromaneCartItems() {
        const items = [];
        list.querySelectorAll(".cart-item[data-lock='pyromane']").forEach((item) => {
            const productId = toInt(item.dataset.id);
            const quantity = toInt(item.querySelector(".quantity").textContent);
            if (productId && quantity > 0) {
                items.push({ product_id: productId, quantity });
            }
        });
        return items;
    }

    function getPyromaneItemCount() {
        return list.querySelectorAll(".cart-item[data-lock='pyromane']").length;
    }

    function schedulePyromaneSync() {
        if (!activePyromaneOrder) return;
        if (pyromaneSyncTimer) {
            clearTimeout(pyromaneSyncTimer);
        }
        pyromaneSyncTimer = setTimeout(syncPyromaneOrder, 300);
    }

    async function syncPyromaneOrder() {
        if (!activePyromaneOrder) return;
        const items = collectPyromaneCartItems();
        try {
            const res = await fetch("/pyromane/order/update/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken.value,
                },
                body: JSON.stringify({
                    order_id: activePyromaneOrder.id,
                    items,
                }),
            });
            const data = await window.safeJson(res);
            if (!res.ok || !data.success) {
                openInfoModal({
                    title: "Commande Pyromane",
                    message: data.error || "Impossible de mettre à jour la commande.",
                    tone: "error",
                });
                return;
            }
            if (data.order && data.order.status === "CANCELED") {
                removePyromaneItemsFromCart();
                clearActivePyromane();
                refreshPyromaneOrders();
                return;
            }
            if (data.order) {
                data.order.modified = true;
                updateActivePyromaneFromServer(data.order);
                refreshPyromaneOrders();
            }
        } catch (error) {
            console.error("Erreur sync Pyromane", error);
        }
    }

    async function cancelActivePyromaneOrder() {
        if (!activePyromaneOrder) return;
        const orderId = activePyromaneOrder.id;
        try {
            const res = await fetch("/pyromane/order/update/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken.value,
                },
                body: JSON.stringify({
                    order_id: orderId,
                    items: [],
                }),
            });
            const data = await window.safeJson(res);
            if (!res.ok || !data.success) {
                openInfoModal({
                    title: "Commande Pyromane",
                    message: data.error || "Impossible d'annuler la commande.",
                    tone: "error",
                });
                return;
            }
            removePyromaneItemsFromCart();
            clearActivePyromane();
            refreshPyromaneOrders();
        } catch (error) {
            console.error("Erreur annulation Pyromane", error);
        }
    }

    function bindScanInput(inputElement) {
        if (!inputElement) {
            return;
        }
        inputElement.addEventListener("blur", function () {
            setTimeout(() => {
                if (inputElement.isConnected) {
                    inputElement.focus();
                }
            }, 0);
        });
        inputElement.addEventListener("change", function () {
            const cardValue = this.value.trim();
            if (cardValue) {
                scanCard(cardValue);
            }
            setTimeout(() => {
                if (inputElement.isConnected) {
                    inputElement.focus();
                }
            }, 0);
        });
        setTimeout(() => {
            if (inputElement.isConnected) {
                inputElement.focus();
            }
        }, 0);
    }

    if (voucherRemoveBtn) {
        voucherRemoveBtn.addEventListener("click", () => {
            clearActiveVoucher();
        });
    }

    if (pyromaneRemoveBtn) {
        pyromaneRemoveBtn.addEventListener("click", () => {
            openConfirmModal({
                title: "Annuler la commande",
                message: "Cette action va annuler totalement la commande Pyromane. Continuer ?",
                confirmLabel: "Annuler la commande",
                cancelLabel: "Garder",
                onConfirm: cancelActivePyromaneOrder,
            });
        });
    }

    if (pyromaneHistoryBtn) {
        pyromaneHistoryBtn.addEventListener("click", () => {
            openPyromaneHistoryModal();
        });
    }

    if (pyromaneButton) {
        pyromaneButton.addEventListener("click", openPyromaneModal);
    }

    updateActionBadge(pyromaneButton, pyromaneCountBadge, pyromaneOrders.length);
    refreshPyromaneOrders();
    refreshMiniFourCount();
    const POS_REFRESH_INTERVAL = 5000;
    setInterval(() => {
        if (!document.hidden) {
            refreshPyromaneOrders();
        }
    }, POS_REFRESH_INTERVAL);
    setInterval(() => {
        if (!document.hidden) {
            refreshMiniFourCount();
        }
    }, POS_REFRESH_INTERVAL);

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            refreshPyromaneOrders();
            refreshMiniFourCount();
        }
    });

    async function resolveLoyaltyRemote(code) {
        const cached = loyaltyCache.get(code);
        if (cached) {
            return cached;
        }
        try {
            const response = await fetch("/loyalty/resolve/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken ? csrfToken.value : "",
                },
                body: JSON.stringify({ code }),
            });
            const data = await window.safeJson(response);
            if (data && data.success && data.loyalty) {
                loyaltyCache.set(code, data.loyalty);
                return data.loyalty;
            }
        } catch (error) {
            console.warn("Impossible de résoudre la carte fidélité:", error);
        }
        return null;
    }

    async function scanCard(cartValue) {
        const trimmedValue = cartValue.trim();
        if (!trimmedValue) {
            return null;
        }

        if (isVoucherCode(trimmedValue)) {
            const ok = await scanVoucher(trimmedValue);
            if (ok) {
                closeScanModal();
            }
            const activeScanInput = document.getElementById("scan-card");
            if (activeScanInput) {
                activeScanInput.value = "";
            }
            return null;
        }

        const normalizedCartValue = trimmedValue.toLowerCase();

        const resolved = await resolveLoyaltyRemote(normalizedCartValue);
        if (resolved) {
            scanLoyalty(resolved, cardBox);
            closeScanModal();
            return resolved;
        }
        return null;
    }

    function scanLoyalty(loyalty, targetCardBox) {
        const activeScanInput = document.getElementById("scan-card");
        if (activeScanInput) {
            activeScanInput.value = "";
        }

        targetCardBox.innerHTML = "";
        const div = document.createElement("div");
        const wallet = normalizeWallet(loyalty.solde);
        const solde = wallet.solde;
        const points = wallet.points;

        div.className = "flex justify-between items-start";
        div.dataset.id = loyalty.id;
        div.dataset.client = loyalty.client || "";
        div.dataset.solde = solde;
        div.dataset.points = points;
        div.dataset.remainder = loyalty.points_remainder || 0;
        div.innerHTML = `
            <div>
                <p class="text-sm font-medium text-blue-900">${loyalty.client || "Client"}</p>
                <p class="text-xs text-blue-700">Solde: ${solde} KMF</p>
                <p class="text-xs text-blue-700">Points: ${points}</p>
                <p class="text-xs text-blue-600" data-role="points-earned-preview">Points a gagner: +${calculateEarnedPoints(getCartSubtotal(), loyalty.points_remainder || 0)}</p>
            </div>
            <button data-slot="button" id="card-delete" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 h-6 w-6">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 h-3 w-3">
                    <path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    <line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line>
                </svg>
            </button>
        `;

        targetCardBox.appendChild(div);
        const deleteBtn = document.getElementById("card-delete");
        if (deleteBtn) {
            deleteBtn.addEventListener("click", function () {
                cardDelete(targetCardBox);
            });
        }
        closeScanModal();
    }

    function cardDelete(targetCardBox) {
        renderScanPrompt();
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", function () {
            list.innerHTML = "";
            clearActivePyromane();
            updateTotals();
        });
    }

    updateTotals();

    function updateTotals() {
        const subtotal = getCartSubtotal();
        subtotalElem.textContent = formatKmf(subtotal);
        totalElem.textContent = formatKmf(subtotal);
        payBtn.disabled = subtotal === 0;
        updateLoyaltyPreview(subtotal);
    }

    function openInfoModal({ title, message, tone = "info" }) {
        const toneStyles = {
            success: "bg-green-50 border-green-200 text-green-700",
            error: "bg-red-50 border-red-200 text-red-700",
            info: "bg-amber-50 border-amber-200 text-amber-700",
        };
        const badgeClass = toneStyles[tone] || toneStyles.info;

        modalContainer.innerHTML = `
            <div role="dialog" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border p-6 shadow-lg duration-200 sm:max-w-[420px]" tabindex="-1" style="pointer-events: auto">
                <div class="flex items-start justify-between gap-4">
                    <div class="space-y-2">
                        <div class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass}">
                            ${tone === "success" ? "Succès" : tone === "error" ? "Erreur" : "Information"}
                        </div>
                        <h2 class="text-lg font-semibold">${title}</h2>
                        <p class="text-sm text-muted-foreground">${message}</p>
                    </div>
                    <button type="button" id="close-info-modal" class="rounded-md border px-2 py-1 text-xs font-medium hover:bg-accent">Fermer</button>
                </div>
            </div>
        `;

        const closeBtn = document.getElementById("close-info-modal");
        if (closeBtn) {
            closeBtn.addEventListener("click", () => {
                modalContainer.innerHTML = "";
            });
        }
    }

    function openConfirmModal({ title, message, confirmLabel = "Confirmer", cancelLabel = "Annuler", onConfirm }) {
        modalContainer.innerHTML = `
            <div role="dialog" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border p-6 shadow-lg duration-200 sm:max-w-[420px]" tabindex="-1" style="pointer-events: auto">
                <div class="space-y-2">
                    <h2 class="text-lg font-semibold">${title}</h2>
                    <p class="text-sm text-muted-foreground">${message}</p>
                </div>
                <div class="flex justify-end gap-2">
                    <button type="button" id="confirm-cancel" class="inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm hover:bg-accent">${cancelLabel}</button>
                    <button type="button" id="confirm-ok" class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">${confirmLabel}</button>
                </div>
            </div>
        `;
        const cancelBtn = document.getElementById("confirm-cancel");
        const okBtn = document.getElementById("confirm-ok");
        if (cancelBtn) {
            cancelBtn.addEventListener("click", () => {
                modalContainer.innerHTML = "";
            });
        }
        if (okBtn) {
            okBtn.addEventListener("click", () => {
                modalContainer.innerHTML = "";
                if (typeof onConfirm === "function") {
                    onConfirm();
                }
            });
        }
    }

    let activeFilter = "Tout";
    let searchQuery = "";

    function getProductName(product) {
        return (product.dataset.name || "").trim();
    }

    function applyProductFilters() {
        products.forEach(product => {
            const name = getProductName(product);
            const firstLetter = name ? name[0].toUpperCase() : "";
            const matchesFilter = activeFilter === "Tout" || firstLetter === activeFilter;
            const matchesSearch = !searchQuery || name.toLowerCase().includes(searchQuery);

            if (matchesFilter && matchesSearch) {
                product.style.display = "";
            } else {
                product.style.display = "none";
            }
        });
    }

    buttons.forEach(btn => {
        btn.addEventListener("click", function () {
            const filter = this.getAttribute("data-filter");
            activeFilter = filter || "Tout";
            buttons.forEach(b => b.classList.remove("bg-secondary", "text-secondary-foreground"));
            this.classList.add("bg-secondary", "text-secondary-foreground");
            applyProductFilters();
        });
    });

    if (searchInput) {
        searchInput.addEventListener("input", function () {
            searchQuery = this.value.trim().toLowerCase();
            applyProductFilters();
        });
    }

    function createCartItem(id, name, price, stock, options = {}) {
        const div = document.createElement("div");
        div.className = "flex items-center justify-between bg-card p-2 gap-2 rounded-lg border cart-item";
        div.dataset.name = name;
        div.dataset.price = price;
        div.dataset.stock = stock;
        div.dataset.id = id;
        if (options.lock) {
            div.dataset.lock = "pyromane";
            div.dataset.baseQty = options.baseQty || 1;
        }

        div.innerHTML = `
            <div class="flex-1">
                <div class="font-medium text-sm">${name}</div>
                <div class="text-xs text-muted-foreground">${price} KMF / unite</div>
            </div>

            <div class="flex items-center gap-2">
                <div class="flex items-center gap-2">
                    <button data-slot="button" class="btn-minus inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-9 h-6 w-6 bg-transparent">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus h-3 w-3">
                            <path d="M5 12h14"></path>
                        </svg>
                    </button>
                    <span class="w-4 text-center text-sm font-medium quantity">1</span>
                    <button data-slot="button" class="btn-plus inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-9 h-6 w-6 bg-transparent">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus h-3 w-3">
                            <path d="M5 12h14"></path>
                            <path d="M12 5v14"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="w-20 text-right font-medium text-sm amount">${price}</div>
            <button data-slot="button" class="btn-delete inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent dark:hover:bg-accent/50 size-9 h-6 w-6 text-muted-foreground hover:text-destructive ml-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 h-3 w-3">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    <line x1="10" x2="10" y1="11" y2="17"></line>
                    <line x1="14" x2="14" y1="11" y2="17"></line>
                </svg>
            </button>
        `;

        list.appendChild(div);

        div.querySelector(".btn-plus").addEventListener("click", () => updateQty(div, 1, stock));
        div.querySelector(".btn-minus").addEventListener("click", () => updateQty(div, -1, stock));
        div.querySelector(".btn-delete").addEventListener("click", () => {
            const isLocked = div.dataset.lock === "pyromane";
            if (isLocked && getPyromaneItemCount() <= 1) {
                openConfirmModal({
                    title: "Annuler la commande",
                    message: "Supprimer ce produit annulera toute la commande Pyromane. Continuer ?",
                    confirmLabel: "Annuler la commande",
                    cancelLabel: "Garder",
                    onConfirm: () => {
                        div.remove();
                        updateTotals();
                        schedulePyromaneSync();
                    },
                });
                return;
            }
            div.remove();
            updateTotals();
            if (isLocked) {
                schedulePyromaneSync();
            }
        });
    }

    function updateQty(item, change, stock) {
        const qtyElem = item.querySelector(".quantity");
        const amountElem = item.querySelector(".amount");
        const isLocked = item.dataset.lock === "pyromane";

        let availableStr = (Number.isFinite(stock) ? stock : item.dataset.stock) || "0";
        let available = availableStr === "∞" ? Infinity : toInt(availableStr);

        const price = toInt(item.dataset.price);
        let qty = toInt(qtyElem.textContent);
        const previousQty = qty;
        qty += change;

        if (qty <= 0) {
            if (isLocked && getPyromaneItemCount() <= 1) {
                openConfirmModal({
                    title: "Annuler la commande",
                    message: "Réduire à 0 annulera toute la commande Pyromane. Continuer ?",
                    confirmLabel: "Annuler la commande",
                    cancelLabel: "Garder",
                    onConfirm: () => {
                        item.remove();
                        updateTotals();
                        schedulePyromaneSync();
                    },
                });
                qtyElem.textContent = previousQty;
                amountElem.textContent = previousQty * price;
                return;
            }
            item.remove();
            updateTotals();
            if (isLocked) {
                schedulePyromaneSync();
            }
            return;
        }

        if (available !== Infinity) {
            if (available <= 0) {
                showItemError(item, "Rupture de stock");
                item.remove();
                updateTotals();
                return;
            }

            if (qty > available) {
                showItemError(item, `Stock disponible : ${available}`);
                qty = available;
            }
        }

        qtyElem.textContent = qty;
        amountElem.textContent = qty * price;
        updateTotals();
        if (isLocked) {
            schedulePyromaneSync();
        }
    }

    function showItemError(item, message) {
        let err = item.querySelector(".error-msg");
        if (!err) {
            err = document.createElement("div");
            err.className = "error-msg text-xs text-destructive mt-1";
            item.appendChild(err);
        }

        if (err._hideTimeout) {
            clearTimeout(err._hideTimeout);
        }

        err.textContent = message;
        err.style.display = "";
        err._hideTimeout = setTimeout(() => {
            err.style.display = "none";
        }, 3000);
    }

    productList.addEventListener("click", function (e) {
        const product = e.target.closest(".product-card");
        if (!product) {
            return;
        }

        const name = product.dataset.name;
        const id = product.dataset.id;
        const price = toInt(product.dataset.price);
        const stock = product.dataset.stock;
        const available = stock === "∞" ? Infinity : toInt(stock);

        if (available === 0) {
            showOutOfStockModal(name);
            return;
        }
        const existing = list.querySelector(`.cart-item[data-name="${name}"]`);

        if (existing) {
            updateQty(existing, 1, stock);
        } else {
            createCartItem(id, name, price, stock);
        }

        updateTotals();
    });

    function showOutOfStockModal(productName) {
        modalContainer.innerHTML = `
            <div role="dialog" aria-describedby="out-stock-desc" aria-labelledby="out-stock-title" data-state="open" data-slot="dialog-content" class="modal-custom bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]" tabindex="-1" style="pointer-events: auto">
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 id="out-stock-title" data-slot="dialog-title" class="text-lg leading-none font-semibold text-destructive">Stock a zero</h2>
                </div>
                <div class="space-y-3" id="out-stock-desc">
                    <p class="text-sm text-muted-foreground">Le produit <strong>${productName}</strong> est en rupture.</p>
                    <p class="text-sm">Merci de demander une nouvelle production.</p>
                </div>
                <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button id="close-out-stock" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                        Fermer
                    </button>
                </div>
            </div>
        `;
        const closeBtn = document.getElementById("close-out-stock");
        if (closeBtn) {
            closeBtn.addEventListener("click", () => {
                modalContainer.innerHTML = "";
            });
        }
    }

    payBtn.addEventListener("click", function () {
        if (this.disabled) {
            return;
        }

        const grossTotal = getCartSubtotal();
        const cartItems = [];

        document.querySelectorAll(".cart-item").forEach(item => {
            cartItems.push({
                id: toInt(item.dataset.id),
                quantity: toInt(item.querySelector(".quantity").textContent),
                subtotal: toInt(item.querySelector(".amount").textContent),
            });
        });

        const loyaltyCard = getScannedLoyaltyCard();
        processPayment(grossTotal, cartItems, loyaltyCard);
    });

    const readyProducts = productsData.filter((p) => p.stock_known);
    const baseProductIds = new Set(
        productsData.map((p) => p.base_product_id).filter((value) => value)
    );
    const makeProducts = productsData.filter((p) => !p.stock_known);
    const remiseProducts = readyProducts;
    const resaleType = "vente en dépôt";
    const shiftExclusionTypes = new Set(["vente en dépôt", "achat & revente"]);

    function buildSelectOptions(list) {
        return list.map((product) => `<option value="${product.id}">${product.name}</option>`).join("");
    }

    function openAbimesModal() {
        const abimeRows = readyProducts
            .filter((product) => !baseProductIds.has(product.id))
            .filter((product) => !shiftExclusionTypes.has((product.product_type || "").toLowerCase()))
            .map((product) => `
            <div class="flex items-center justify-between gap-3 border-b pb-2">
                <div class="text-sm font-medium">${product.name}</div>
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    value="0"
                    data-product-id="${product.id}"
                    class="abime-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-28 rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none"
                />
            </div>
        `).join("");

        modalContainer.innerHTML = `
            <div role="dialog" aria-describedby="abimes-desc" aria-labelledby="abimes-title" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[520px]" tabindex="-1" style="pointer-events: auto">
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 id="abimes-title" data-slot="dialog-title" class="text-lg leading-none font-semibold">Abîmés (produits prêts)</h2>
                    <p id="abimes-desc" class="text-sm text-muted-foreground">Saisissez uniquement les quantités abîmées.</p>
                </div>
                <form class="grid gap-4" id="abimesForm">
                    <div class="max-h-64 overflow-y-auto rounded-md border p-3 space-y-2">
                        ${abimeRows || "<p class='text-sm text-muted-foreground'>Aucun produit prêt.</p>"}
                    </div>
                    <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" id="cancel-abimes" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                            Annuler
                        </button>
                        <button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2" type="submit">
                            Enregistrer
                        </button>
                    </div>
                </form>
            </div>
        `;

        const form = document.getElementById("abimesForm");
        const cancelButton = document.getElementById("cancel-abimes");
        cancelButton.addEventListener("click", () => {
            modalContainer.innerHTML = "";
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const abimes = Array.from(form.querySelectorAll(".abime-input")).map((input) => ({
                product_id: Number(input.dataset.productId),
                quantity: Number(input.value || 0),
            })).filter((item) => item.quantity > 0);

            if (abimes.length === 0) {
                openInfoModal({
                    title: "Aucun abîmé",
                    message: "Ajoutez au moins une quantité pour enregistrer.",
                    tone: "info",
                });
                return;
            }

            const res = await fetch("/pos/shift/abimes/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken.value,
                },
                body: JSON.stringify({
                    date: shiftData.date,
                    shift: shiftData.shift,
                    abimes,
                }),
            });
            const data = await window.safeJson(res);
            if (!res.ok || !data.success) {
                openInfoModal({
                    title: "Enregistrement impossible",
                    message: data.error || "Impossible d'enregistrer les abîmés.",
                    tone: "error",
                });
                return;
            }
            modalContainer.innerHTML = "";
            openInfoModal({
                title: "Abîmés enregistrés",
                message: "Les abîmés ont bien été enregistrés.",
                tone: "success",
            });
        });
    }

    function openRemisesModal() {
        const remiseRows = remiseProducts
            .filter((product) => !baseProductIds.has(product.id))
            .filter((product) => !shiftExclusionTypes.has((product.product_type || "").toLowerCase()))
            .map((product) => {
            const isDurable = (product.category || "").toLowerCase() === "durable";
            const currentValue = remisesCurrent[String(product.id)];
            const defaultValue = currentValue !== undefined
                ? currentValue
                : (isDurable ? (remisesDefaults[String(product.id)] ?? 0) : 0);
            const alreadySetBadge = currentValue !== undefined
                ? `<span class="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Déjà saisi</span>`
                : "";
            return `
                <div class="remise-row flex items-center justify-between gap-3 border-b pb-2">
                    <div class="text-sm font-medium flex items-center gap-2">
                        ${product.name}
                        ${alreadySetBadge}
                        ${isDurable ? "" : "<span class='text-xs text-muted-foreground'>(non durable)</span>"}
                    </div>
                    <div class="flex items-center gap-2">
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value="${defaultValue}"
                            data-product-id="${product.id}"
                            class="remise-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-24 rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none"
                        />
                        <button type="button" class="remise-reset inline-flex items-center justify-center rounded-md border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-accent">
                            Remettre à 0
                        </button>
                    </div>
                </div>
            `;
        }).join("");

        modalContainer.innerHTML = `
            <div role="dialog" aria-describedby="remises-desc" aria-labelledby="remises-title" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[520px]" tabindex="-1" style="pointer-events: auto">
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 id="remises-title" data-slot="dialog-title" class="text-lg leading-none font-semibold">Remises (stock restant)</h2>
                    <p id="remises-desc" class="text-sm text-muted-foreground">Les produits durables sont préremplis. Les autres restent à 0 (modifiables si besoin).</p>
                </div>
                <form class="grid gap-4" id="remisesForm">
                    <div class="max-h-64 overflow-y-auto rounded-md border p-3 space-y-2">
                        ${remiseRows || "<p class='text-sm text-muted-foreground'>Aucun produit prêt.</p>"}
                    </div>
                    <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" id="cancel-remises" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                            Annuler
                        </button>
                        <button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2" type="submit">
                            Enregistrer
                        </button>
                    </div>
                </form>
            </div>
        `;

        const form = document.getElementById("remisesForm");
        const cancelButton = document.getElementById("cancel-remises");
        form.querySelectorAll(".remise-reset").forEach((btn) => {
            btn.addEventListener("click", () => {
                const row = btn.closest(".remise-row");
                const input = row ? row.querySelector(".remise-input") : null;
                if (input) {
                    input.value = 0;
                }
            });
        });
        cancelButton.addEventListener("click", () => {
            modalContainer.innerHTML = "";
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const remises = Array.from(form.querySelectorAll(".remise-input")).map((input) => ({
                product_id: Number(input.dataset.productId),
                quantity: Number(input.value || 0),
            })).filter((item) => item.quantity > 0);

            const res = await fetch("/pos/shift/start/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken.value,
                },
                body: JSON.stringify({
                    date: shiftData.date,
                    shift: shiftData.shift,
                    remises,
                }),
            });
            const data = await window.safeJson(res);
            if (!res.ok || !data.success) {
                openInfoModal({
                    title: "Erreur",
                    message: data.error || "Impossible d'enregistrer les remises.",
                    tone: "error",
                });
                return;
            }
            modalContainer.innerHTML = "";
            openInfoModal({
                title: "Remises enregistrées",
                message: remises.length ? "Les remises ont été enregistrées." : "Aucune remise, enregistré à zéro.",
                tone: "success",
            });
        });
    }

    function openResaleStockModal() {
        const resaleProducts = readyProducts
            .filter((product) => (product.product_type || "").toLowerCase() === resaleType)
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        const stockRows = resaleProducts.map((product) => `
            <div class="flex items-center justify-between gap-3 border-b pb-2">
                <div class="text-sm font-medium">${product.name}</div>
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    value="0"
                    data-product-id="${product.id}"
                    class="resale-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-28 rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none"
                />
            </div>
        `).join("");

        modalContainer.innerHTML = `
            <div role="dialog" aria-describedby="resale-desc" aria-labelledby="resale-title" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[520px]" tabindex="-1" style="pointer-events: auto">
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
            <h2 id="resale-title" data-slot="dialog-title" class="text-lg leading-none font-semibold">Entrées Vente en dépôt</h2>
                    <p id="resale-desc" class="text-sm text-muted-foreground">Saisissez les quantités livrées aujourd'hui.</p>
                </div>
                <form class="grid gap-4" id="resaleForm">
                    <div class="max-h-64 overflow-y-auto rounded-md border p-3 space-y-2">
                        ${stockRows || "<p class='text-sm text-muted-foreground'>Aucun produit Vente en dépôt.</p>"}
                    </div>
                    <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" id="cancel-resale" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                            Annuler
                        </button>
                        <button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2" type="submit">
                            Enregistrer
                        </button>
                    </div>
                </form>
            </div>
        `;

        const form = document.getElementById("resaleForm");
        const cancelButton = document.getElementById("cancel-resale");
        cancelButton.addEventListener("click", () => {
            modalContainer.innerHTML = "";
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const items = Array.from(form.querySelectorAll(".resale-input")).map((input) => ({
                product_id: Number(input.dataset.productId),
                quantity: Number(input.value || 0),
            })).filter((item) => item.quantity > 0);

            if (items.length === 0) {
                openInfoModal({
                    title: "Aucune entrée",
                    message: "Ajoutez au moins une quantité pour enregistrer.",
                    tone: "info",
                });
                return;
            }

            const res = await fetch("/pos/stock/receive/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken.value,
                },
                body: JSON.stringify({ items }),
            });
            const data = await window.safeJson(res);
            if (!res.ok || !data.success) {
                openInfoModal({
                    title: "Erreur",
                    message: data.error || "Impossible d'enregistrer les entrées.",
                    tone: "error",
                });
                return;
            }
            modalContainer.innerHTML = "";
            openInfoModal({
                title: "Entrées enregistrées",
                message: "Les quantités Vente en dépôt ont été enregistrées.",
                tone: "success",
            });
            window.location.reload();
        });
    }

    function openArStockModal() {
        const arProducts = readyProducts
            .filter((product) => (product.product_type || "").toLowerCase() === "achat & revente")
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        const stockRows = arProducts.map((product) => `
            <div class="flex items-center justify-between gap-3 border-b pb-2">
                <div class="text-sm font-medium">${product.name}</div>
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    value="0"
                    data-product-id="${product.id}"
                    class="ar-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-28 rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none"
                />
            </div>
        `).join("");

        modalContainer.innerHTML = `
            <div role="dialog" aria-describedby="ar-desc" aria-labelledby="ar-title" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[520px]" tabindex="-1" style="pointer-events: auto">
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 id="ar-title" data-slot="dialog-title" class="text-lg leading-none font-semibold">Entrées Achat &amp; Revente</h2>
                    <p id="ar-desc" class="text-sm text-muted-foreground">Saisissez les quantités envoyées au comptoir.</p>
                </div>
                <form class="grid gap-4" id="arForm">
                    <div class="max-h-64 overflow-y-auto rounded-md border p-3 space-y-2">
                        ${stockRows || "<p class='text-sm text-muted-foreground'>Aucun produit Achat & Revente.</p>"}
                    </div>
                    <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" id="cancel-ar" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                            Annuler
                        </button>
                        <button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2" type="submit">
                            Enregistrer
                        </button>
                    </div>
                </form>
            </div>
        `;

        const form = document.getElementById("arForm");
        const cancelButton = document.getElementById("cancel-ar");
        cancelButton.addEventListener("click", () => {
            modalContainer.innerHTML = "";
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const items = Array.from(form.querySelectorAll(".ar-input")).map((input) => ({
                product_id: Number(input.dataset.productId),
                quantity: Number(input.value || 0),
            })).filter((item) => item.quantity > 0);

            if (items.length === 0) {
                openInfoModal({
                    title: "Aucune entrée",
                    message: "Ajoutez au moins une quantité pour enregistrer.",
                    tone: "info",
                });
                return;
            }

            const res = await fetch("/pos/stock/receive-ar/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken.value,
                },
                body: JSON.stringify({ items }),
            });
            const data = await window.safeJson(res);
            if (!res.ok || !data.success) {
                openInfoModal({
                    title: "Erreur",
                    message: data.error || "Impossible d'enregistrer les entrées.",
                    tone: "error",
                });
                return;
            }
            modalContainer.innerHTML = "";
            openInfoModal({
                title: "Entrées enregistrées",
                message: "Les quantités Achat & Revente ont été enregistrées.",
                tone: "success",
            });
            window.location.reload();
        });
    }

    function openConsumptionsModal() {
        modalContainer.innerHTML = `
            <div role="dialog" aria-describedby="consumptions-desc" aria-labelledby="consumptions-title" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[720px]" tabindex="-1" style="pointer-events: auto">
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 id="consumptions-title" data-slot="dialog-title" class="text-lg leading-none font-semibold">Consommations internes</h2>
                    <p id="consumptions-desc" class="text-sm text-muted-foreground">Ajoutez une ou plusieurs personnes, puis les produits consommés.</p>
                </div>
                <form class="grid gap-4" id="consumptionsForm">
                    <div class="flex items-center justify-between">
                        <div class="text-sm font-semibold">Personnes</div>
                        <button type="button" id="add-person" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-semibold transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-8 px-3">
                            Ajouter une personne
                        </button>
                    </div>
                    <div id="person-list" class="space-y-3"></div>
                    <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" id="cancel-consumptions" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                            Annuler
                        </button>
                        <button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2" type="submit">
                            Enregistrer
                        </button>
                    </div>
                </form>
            </div>
        `;

        const form = document.getElementById("consumptionsForm");
        const personList = document.getElementById("person-list");
        const addPerson = document.getElementById("add-person");
        const cancelButton = document.getElementById("cancel-consumptions");

        function addProductRow(container) {
            const row = document.createElement("div");
            row.className = "grid grid-cols-1 md:grid-cols-3 gap-2";
            row.innerHTML = `
                <select class="consumption-product file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none">
                    <option value="">Produit</option>
                    ${buildSelectOptions(productsData)}
                </select>
                <input type="number" min="1" value="1" class="consumption-qty file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none" />
                <button type="button" class="remove-row inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-semibold transition-all border bg-background shadow-xs hover:bg-destructive/10 hover:text-destructive h-9 px-3">Retirer</button>
            `;
            row.querySelector(".remove-row").addEventListener("click", () => row.remove());
            container.appendChild(row);
        }

        function addPersonBlock() {
            const wrapper = document.createElement("div");
            wrapper.className = "consumption-person rounded-md border p-3 space-y-3";
            wrapper.innerHTML = `
                <div class="flex flex-col md:flex-row md:items-center gap-2">
                    <input type="text" placeholder="Nom" class="person-name file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none" />
                    <button type="button" class="remove-person inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-semibold transition-all border bg-background shadow-xs hover:bg-destructive/10 hover:text-destructive h-9 px-3">
                        Supprimer
                    </button>
                </div>
                <div class="person-products space-y-2"></div>
                <div>
                    <button type="button" class="add-product inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-semibold transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-8 px-3">
                        Ajouter un produit
                    </button>
                </div>
            `;

            const productsContainer = wrapper.querySelector(".person-products");
            const addProductButton = wrapper.querySelector(".add-product");
            const removePersonButton = wrapper.querySelector(".remove-person");

            addProductButton.addEventListener("click", () => addProductRow(productsContainer));
            removePersonButton.addEventListener("click", () => wrapper.remove());

            addProductRow(productsContainer);
            personList.appendChild(wrapper);
        }

        addPerson.addEventListener("click", addPersonBlock);
        cancelButton.addEventListener("click", () => {
            modalContainer.innerHTML = "";
        });

        addPersonBlock();

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const consumptions = [];
            const personBlocks = Array.from(personList.querySelectorAll(".consumption-person"));
            personBlocks.forEach((block) => {
                const name = block.querySelector(".person-name").value.trim();
                const rows = Array.from(block.querySelectorAll(".person-products > div"));
                rows.forEach((row) => {
                    const productId = Number(row.querySelector(".consumption-product").value);
                    const quantity = Number(row.querySelector(".consumption-qty").value || 0);
                    if (name && productId && quantity > 0) {
                        consumptions.push({
                            person_name: name,
                            product_id: productId,
                            quantity,
                        });
                    }
                });
            });

            if (consumptions.length === 0) {
                openInfoModal({
                    title: "Aucune consommation",
                    message: "Ajoutez au moins un produit consommé.",
                    tone: "info",
                });
                return;
            }

            const res = await fetch("/pos/shift/consumptions/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken.value,
                },
                body: JSON.stringify({
                    date: shiftData.date,
                    shift: shiftData.shift,
                    consumptions,
                }),
            });
            const data = await window.safeJson(res);
            if (!res.ok || !data.success) {
                openInfoModal({
                    title: "Enregistrement impossible",
                    message: data.error || "Impossible d'enregistrer les consommations.",
                    tone: "error",
                });
                return;
            }
            modalContainer.innerHTML = "";
            openInfoModal({
                title: "Consommations enregistrées",
                message: "Les consommations internes ont bien été enregistrées.",
                tone: "success",
            });
        });
    }

    function openExpensesModal() {
        modalContainer.innerHTML = `
            <div role="dialog" aria-describedby="expenses-desc" aria-labelledby="expenses-title" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[520px]" tabindex="-1" style="pointer-events: auto">
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 id="expenses-title" data-slot="dialog-title" class="text-lg leading-none font-semibold">Dépenses de caisse</h2>
                    <p id="expenses-desc" class="text-sm text-muted-foreground">Saisissez les dépenses effectuées pendant le shift.</p>
                </div>
                <form class="grid gap-4" id="expensesForm">
                    <div class="flex items-center justify-between">
                        <div class="text-sm font-semibold">Dépenses</div>
                        <button type="button" id="add-expense" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-semibold transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-8 px-3">
                            Ajouter
                        </button>
                    </div>
                    <div id="expense-list" class="space-y-2"></div>
                    <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button type="button" id="cancel-expenses" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                            Annuler
                        </button>
                        <button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2" type="submit">
                            Enregistrer
                        </button>
                    </div>
                </form>
            </div>
        `;

        const form = document.getElementById("expensesForm");
        const expenseList = document.getElementById("expense-list");
        const addExpense = document.getElementById("add-expense");
        const cancelButton = document.getElementById("cancel-expenses");

        function addExpenseRow() {
            const row = document.createElement("div");
            row.className = "grid grid-cols-1 md:grid-cols-3 gap-2";
            row.innerHTML = `
                <input type="text" placeholder="Motif" class="expense-label file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none" />
                <input type="number" min="0" step="0.01" placeholder="Montant" class="expense-amount file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none" />
                <button type="button" class="remove-row inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-semibold transition-all border bg-background shadow-xs hover:bg-destructive/10 hover:text-destructive h-9 px-3">Retirer</button>
            `;
            row.querySelector(".remove-row").addEventListener("click", () => row.remove());
            expenseList.appendChild(row);
        }

        addExpense.addEventListener("click", addExpenseRow);
        cancelButton.addEventListener("click", () => {
            modalContainer.innerHTML = "";
        });

        addExpenseRow();

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const expenses = Array.from(expenseList.children).map((row) => ({
                label: row.querySelector(".expense-label").value.trim(),
                amount: Number(row.querySelector(".expense-amount").value || 0),
            })).filter((item) => item.label && item.amount > 0);

            if (expenses.length === 0) {
                openInfoModal({
                    title: "Aucune dépense",
                    message: "Ajoutez au moins une dépense.",
                    tone: "info",
                });
                return;
            }

            const res = await fetch("/pos/shift/expenses/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken.value,
                },
                body: JSON.stringify({
                    date: shiftData.date,
                    shift: shiftData.shift,
                    expenses,
                }),
            });
            const data = await window.safeJson(res);
            if (!res.ok || !data.success) {
                openInfoModal({
                    title: "Enregistrement impossible",
                    message: data.error || "Impossible d'enregistrer les dépenses.",
                    tone: "error",
                });
                return;
            }
            modalContainer.innerHTML = "";
            openInfoModal({
                title: "Dépenses enregistrées",
                message: "Les dépenses ont bien été enregistrées.",
                tone: "success",
            });
        });
    }

    if (abimesButton) {
        abimesButton.addEventListener("click", openAbimesModal);
    }

    if (remisesButton) {
        remisesButton.addEventListener("click", openRemisesModal);
    }
    if (resaleStockButton) {
        resaleStockButton.addEventListener("click", openResaleStockModal);
    }
    if (arStockButton) {
        arStockButton.addEventListener("click", openArStockModal);
    }

    if (consumptionsButton) {
        consumptionsButton.addEventListener("click", openConsumptionsModal);
    }

    if (expensesButton) {
        expensesButton.addEventListener("click", openExpensesModal);
    }

    function processPayment(grossTotal, cartItems, loyaltyCard) {
        modalContainer.innerHTML = `
            <div role="dialog" aria-describedby="radix-_r_c_" aria-labelledby="radix-_r_b_" data-state="open" data-slot="dialog-content" class="modal-custom bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]" tabindex="-1" style="pointer-events: auto">
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 id="settlement" data-slot="dialog-title" class="text-lg leading-none font-semibold">Reglement</h2>
                </div>
                <div class="grid gap-6 py-4">
                    <div class="text-center">
                        <p class="text-sm text-muted-foreground">Montant a payer</p>
                        <p id="payment-total-display" class="text-4xl font-bold text-primary">${grossTotal} KMF</p>
                        <p id="payment-discount-display" class="text-xs text-green-700 mt-1 hidden"></p>
                        <p id="payment-voucher-display" class="text-xs text-amber-700 mt-1 hidden"></p>
                        <p id="payment-points-earned" class="text-xs text-muted-foreground mt-1"></p>
                    </div>
                    <div dir="ltr" data-orientation="horizontal" data-slot="tabs" class="flex flex-col gap-2 w-full">
                        <div role="tablist" aria-orientation="horizontal" data-slot="tabs-list" class="bg-muted text-muted-foreground h-9 items-center justify-center rounded-lg p-[3px] grid w-full grid-cols-2" tabindex="0" data-orientation="horizontal" style="outline: none">
                            <button type="button" role="tab" aria-selected="true" aria-controls="content-cash" data-state="active" id="trigger-cash" data-slot="tabs-trigger" class="data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4" tabindex="0" data-orientation="horizontal" data-radix-collection-item="">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-banknote mr-2 h-4 w-4">
                                    <rect width="20" height="12" x="2" y="6" rx="2"></rect>
                                    <circle cx="12" cy="12" r="2"></circle>
                                    <path d="M6 12h.01M18 12h.01"></path>
                                </svg>Especes
                            </button>
                            <button type="button" role="tab" aria-selected="false" aria-controls="content-card" data-state="inactive" id="trigger-card" data-slot="tabs-trigger" class="data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4" tabindex="-1" data-orientation="horizontal" data-radix-collection-item="">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card mr-2 h-4 w-4">
                                    <rect width="20" height="14" x="2" y="5" rx="2"></rect>
                                    <line x1="2" x2="22" y1="10" y2="10"></line>
                                </svg>Carte Fidelite
                            </button>
                        </div>
                        <div data-state="active" data-orientation="horizontal" role="tabpanel" aria-labelledby="trigger-cash" id="content-cash" tabindex="0" data-slot="tabs-content" class="flex-1 outline-none space-y-4 mt-4" style="">
                            <div class="space-y-2">
                                <label data-slot="label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50">Montant recu</label>
                                <input data-slot="input" class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive text-lg" placeholder="0" type="number" value=""/>
                            </div>
                        </div>
                        <div data-state="inactive" data-orientation="horizontal" role="tabpanel" aria-labelledby="trigger-card" id="content-card" tabindex="0" data-slot="tabs-content" class="flex-1 outline-none mt-4" hidden=""></div>
                    </div>
                </div>
                <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button id="confirm-payment" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-6 has-[&gt;svg]:px-4 w-full" disabled="">
                        Valider le paiement
                    </button>
                </div>
                <button id="closeModal" type="button" data-slot="dialog-close" class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x">
                        <path d="M18 6 6 18"></path>
                        <path d="m6 6 12 12"></path>
                    </svg>
                    <span class="sr-only">Close</span>
                </button>
            </div>
        `;

        const closeModal = document.getElementById("closeModal");
        const confirmBtn = document.getElementById("confirm-payment");
        const triggerCash = document.getElementById("trigger-cash");
        const triggerCard = document.getElementById("trigger-card");
        const contentCash = document.getElementById("content-cash");
        const contentCard = document.getElementById("content-card");
        const paymentTotalDisplay = document.getElementById("payment-total-display");
        const paymentDiscountDisplay = document.getElementById("payment-discount-display");
        const paymentVoucherDisplay = document.getElementById("payment-voucher-display");
        const paymentPointsDisplay = document.getElementById("payment-points-earned");
        const cashInput = document.querySelector("#content-cash input[type='number']");

        const voucherApplied = activeVoucher ? Math.min(activeVoucher.amount, grossTotal) : 0;

        const state = {
            tab: "cash",
            grossTotal: grossTotal,
            discountAmount: 0,
            pointsRedeemed: 0,
            pointsEarned: loyaltyCard ? calculateEarnedPoints(grossTotal, loyaltyCard.points_remainder || 0) : 0,
            totalToPay: Math.max(grossTotal - voucherApplied, 0),
            voucherApplied: voucherApplied,
            voucherCode: activeVoucher ? activeVoucher.code : null,
            cashReceived: 0,
            issueChangeVoucher: false,
        };

        const changeContainer = document.createElement("div");
        changeContainer.className = "p-4 bg-green-50 rounded-lg border border-green-100 text-center mt-2";
        changeContainer.innerHTML = `
            <p class="text-sm text-green-800">Monnaie a rendre</p>
            <p class="text-2xl font-bold text-green-600">0 KMF</p>
        `;
        changeContainer.style.display = "none";

        const voucherOption = document.createElement("div");
        voucherOption.className = "mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900";
        voucherOption.innerHTML = `
            <label class="flex items-center gap-2 font-semibold">
                <input type="checkbox" id="change-voucher-toggle" class="h-4 w-4 rounded border-amber-300 text-amber-600" />
                Rendu en bon de monnaie
            </label>
            <p class="text-xs text-amber-700 mt-1">Un bon sera imprime pour la monnaie.</p>
        `;
        voucherOption.style.display = "none";

        if (cashInput && cashInput.parentNode) {
            cashInput.parentNode.appendChild(changeContainer);
            cashInput.parentNode.appendChild(voucherOption);
        }

        const voucherToggle = voucherOption.querySelector("#change-voucher-toggle");
        if (voucherToggle) {
            voucherToggle.addEventListener("change", () => {
                state.issueChangeVoucher = voucherToggle.checked;
            });
        }

        function refreshHeader() {
            paymentTotalDisplay.textContent = formatKmf(state.totalToPay);

            if (state.discountAmount > 0) {
                paymentDiscountDisplay.classList.remove("hidden");
                paymentDiscountDisplay.textContent = `Remise points: -${formatKmf(state.discountAmount)}`;
            } else {
                paymentDiscountDisplay.classList.add("hidden");
                paymentDiscountDisplay.textContent = "";
            }

            if (state.voucherApplied > 0) {
                paymentVoucherDisplay.classList.remove("hidden");
                paymentVoucherDisplay.textContent = `Bon applique: -${formatKmf(state.voucherApplied)}`;
            } else {
                paymentVoucherDisplay.classList.add("hidden");
                paymentVoucherDisplay.textContent = "";
            }

            if (loyaltyCard) {
                paymentPointsDisplay.textContent = `Points gagnes: +${state.pointsEarned}`;
            } else {
                paymentPointsDisplay.textContent = "Aucun point (carte non scannee).";
            }
        }

        function setCashTab() {
            triggerCash.dataset.state = "active";
            triggerCash.setAttribute("aria-selected", "true");
            contentCash.hidden = false;

            triggerCard.dataset.state = "inactive";
            triggerCard.setAttribute("aria-selected", "false");
            contentCard.hidden = true;

            state.tab = "cash";
            state.discountAmount = 0;
            state.pointsRedeemed = 0;
            state.totalToPay = Math.max(state.grossTotal - state.voucherApplied, 0);
            state.pointsEarned = loyaltyCard ? calculateEarnedPoints(state.totalToPay, loyaltyCard.points_remainder || 0) : 0;
            state.cashReceived = 0;
            state.issueChangeVoucher = false;

            refreshHeader();
            if (cashInput) {
                setupPaymentInput(cashInput, changeContainer, confirmBtn, state, voucherOption);
            }
        }

        function setCardTab() {
            triggerCard.dataset.state = "active";
            triggerCard.setAttribute("aria-selected", "true");
            contentCard.hidden = false;

            triggerCash.dataset.state = "inactive";
            triggerCash.setAttribute("aria-selected", "false");
            contentCash.hidden = true;

            state.tab = "card";
            state.issueChangeVoucher = false;
            renderCardTab();
        }

        function renderCardTab() {
            contentCard.innerHTML = "";

            if (!loyaltyCard) {
                contentCard.innerHTML = `
                    <div class="text-center py-8 text-muted-foreground">
                        Veuillez scanner une carte de fidelite dans le panneau lateral
                    </div>
                `;
                confirmBtn.disabled = true;
                state.discountAmount = 0;
                state.pointsRedeemed = 0;
                state.totalToPay = Math.max(state.grossTotal - state.voucherApplied, 0);
                state.pointsEarned = 0;
                refreshHeader();
                return;
            }

            const currentBalance = toInt(loyaltyCard.solde);
            const availablePoints = toInt(loyaltyCard.points_balance);
            const totalForCard = Math.max(state.grossTotal - state.voucherApplied, 0);
            const pointsToSpend = Math.floor(totalForCard / POINT_VALUE_KMF);
            const pointsEarned = 0;

            const balanceAfterPayment = currentBalance - (pointsToSpend * POINT_VALUE_KMF);
            const finalBalance = balanceAfterPayment;
            const finalPoints = availablePoints - pointsToSpend;

            state.discountAmount = 0;
            state.pointsRedeemed = pointsToSpend;
            state.totalToPay = totalForCard;
            state.pointsEarned = pointsEarned;

            contentCard.innerHTML = `
                <div class="space-y-4">
                    <div class="p-4 bg-blue-50 rounded-lg border border-blue-100">
                        <div class="flex justify-between mb-2">
                            <span class="text-sm text-blue-800">Solde actuel</span>
                            <span class="font-bold text-blue-900">${formatKmf(currentBalance)}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-sm text-blue-800">Points actuels</span>
                            <span class="font-bold text-blue-900">${availablePoints}</span>
                        </div>
                    </div>
                    <div class="p-4 bg-emerald-50 rounded-lg border border-emerald-100 space-y-2">
                        <div class="flex justify-between">
                            <span class="text-sm text-emerald-900">Points debites (paiement carte)</span>
                            <span class="font-semibold text-emerald-900">-${pointsToSpend}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-sm text-emerald-900">Points gagnes</span>
                            <span class="font-semibold text-emerald-900">+${pointsEarned}</span>
                        </div>
                        <div class="flex justify-between pt-2 border-t border-emerald-200">
                            <span class="text-sm text-emerald-900">Nouveau solde</span>
                            <span id="card-new-balance" class="font-bold text-emerald-900">${formatKmf(finalBalance)}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-sm text-emerald-900">Nouveaux points</span>
                            <span id="card-new-points" class="font-bold text-emerald-900">${finalPoints}</span>
                        </div>
                        <p id="card-balance-error" class="text-xs text-red-700 hidden"></p>
                    </div>
                </div>
            `;

            const cardBalanceError = document.getElementById("card-balance-error");

            const invalidMultiple = totalForCard % POINT_VALUE_KMF !== 0;

            if (invalidMultiple) {
                cardBalanceError.classList.remove("hidden");
                cardBalanceError.textContent = "Le paiement carte doit etre un multiple de 100 KMF.";
                confirmBtn.disabled = true;
            } else if (pointsToSpend > availablePoints || balanceAfterPayment < 0) {
                cardBalanceError.classList.remove("hidden");
                cardBalanceError.textContent = "Solde/points insuffisants pour ce paiement carte.";
                confirmBtn.disabled = true;
            } else {
                cardBalanceError.classList.add("hidden");
                cardBalanceError.textContent = "";
                confirmBtn.disabled = false;
            }

            refreshHeader();
        }

        if (closeModal) {
            closeModal.addEventListener("click", () => {
                modalContainer.innerHTML = "";
            });
        }

        if (cashInput) {
            cashInput.addEventListener("input", () => {
                if (state.tab === "cash") {
                    setupPaymentInput(cashInput, changeContainer, confirmBtn, state, voucherOption);
                }
            });
        }

        triggerCash.addEventListener("click", setCashTab);
        triggerCard.addEventListener("click", setCardTab);

        confirmBtn.addEventListener("click", function () {
            if (this.disabled) {
                return;
            }
            newTransaction(state, cartItems, loyaltyCard);
        });

        setCashTab();
    }

    function newTransaction(state, cartItems, loyaltyCard) {
        const payload = {
            method: state.tab,
            gross_total: state.grossTotal,
            total: state.totalToPay,
            discount_amount: state.discountAmount,
            points_redeemed: state.pointsRedeemed,
            points_earned: state.pointsEarned,
            items: cartItems,
            loyalty_id: loyaltyCard ? loyaltyCard.id : null,
            voucher_code: state.voucherCode,
            issue_change_voucher: state.issueChangeVoucher,
            cash_received: state.cashReceived,
            pyromane_order_id: activePyromaneOrder ? activePyromaneOrder.id : null,
        };

        finalizeTransaction(payload);
    }

    function finalizeTransaction(payload) {
        fetch("/pos/transaction/add/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrfToken.value,
            },
            body: JSON.stringify(payload),
        })
            .then(window.safeJson)
            .then(async r => {
                if (!r.success) {
                    console.error("Erreur", r.error || "Impossible de faire la transaction");
                    alert(r.error || "Impossible de faire la transaction");
                    return;
                }

                try {
                    const response = await fetch("/pos/ticket/print/", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-CSRFToken": csrfToken.value,
                        },
                        body: JSON.stringify(payload),
                    });

                    const data = await response.json();

                    if (data.success && data.text) {
                        const prn = data.text;
                        const intent = "intent:" + encodeURIComponent(prn) + "#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;";
                        window.location.href = intent;

                        const vouchers = Array.isArray(r.vouchers_to_print) ? r.vouchers_to_print : [];
                        if (vouchers.length) {
                            for (const voucher of vouchers) {
                                const voucherResp = await fetch("/pos/voucher/print/", {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        "X-CSRFToken": csrfToken.value,
                                    },
                                    body: JSON.stringify({ code: voucher.code }),
                                });
                                const voucherData = await voucherResp.json();
                                if (voucherData.success && voucherData.text) {
                                    const voucherIntent = "intent:" + encodeURIComponent(voucherData.text) + "#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;";
                                    window.location.href = voucherIntent;
                                    await new Promise(resolve => setTimeout(resolve, 900));
                                } else {
                                    alert(voucherData.error || "Erreur lors de l'impression du bon.");
                                }
                            }
                        }

                        setTimeout(() => {
                            window.location.reload();
                        }, 1500);
                    } else {
                        alert("Erreur lors de la generation du ticket.");
                    }
                } catch (error) {
                    console.error("Erreur:", error);
                    alert("Erreur lors de la connexion au serveur.");
                }
            })
            .catch(err => {
                console.error("Erreur", "Impossible de contacter le serveur", err);
            });
    }

    function setupPaymentInput(input, changeContainer, confirmBtn, state, voucherOption) {
        const value = toInt(input.value);
        state.cashReceived = value;
        const totalToPay = state.totalToPay;

        if (totalToPay <= 0) {
            confirmBtn.disabled = false;
            changeContainer.style.display = "none";
            if (voucherOption) {
                voucherOption.style.display = "none";
                const toggle = voucherOption.querySelector("#change-voucher-toggle");
                if (toggle) {
                    toggle.checked = false;
                }
                state.issueChangeVoucher = false;
            }
            return;
        }

        if (value >= totalToPay) {
            confirmBtn.disabled = false;
            const change = value - totalToPay;
            changeContainer.querySelector("p:nth-child(2)").textContent = `${change} KMF`;
            changeContainer.style.display = "block";

            if (voucherOption) {
                if (change > 0) {
                    voucherOption.style.display = "block";
                } else {
                    voucherOption.style.display = "none";
                    const toggle = voucherOption.querySelector("#change-voucher-toggle");
                    if (toggle) {
                        toggle.checked = false;
                    }
                    state.issueChangeVoucher = false;
                }
            }
        } else {
            confirmBtn.disabled = true;
            changeContainer.style.display = "none";
            if (voucherOption) {
                voucherOption.style.display = "none";
                const toggle = voucherOption.querySelector("#change-voucher-toggle");
                if (toggle) {
                    toggle.checked = false;
                }
                state.issueChangeVoucher = false;
            }
        }
    }

    const productGrid = document.getElementById("list-product");
    const listProducts = Array.from(productGrid.children);
    const itemsPerPage = 12;
    let currentPage = 1;
    const totalRows = listProducts.length;
    const totalPages = Math.ceil(totalRows / itemsPerPage);

    const prevBtn = document.querySelector("#pagination button:first-child");
    const nextBtn = document.querySelector("#pagination button:last-child");

    let paginationInfo = document.querySelector("#pagination .text-sm.text-muted-foreground");
    if (!paginationInfo) {
        paginationInfo = document.createElement("div");
        paginationInfo.className = "text-sm text-muted-foreground";
        document.getElementById("pagination").prepend(paginationInfo);
    }

    const pageNumberLabel = document.querySelector("#pagination .page-number");

    function showPage(page) {
        currentPage = page;
        const start = (page - 1) * itemsPerPage;
        const end = Math.min(start + itemsPerPage, totalRows);

        listProducts.forEach((product, index) => {
            product.style.display = index >= start && index < end ? "" : "none";
        });

        paginationInfo.textContent = `Affichage de ${totalRows === 0 ? 0 : start + 1} a ${end} sur ${totalRows} resultats`;
        pageNumberLabel.textContent = `Page ${currentPage} sur ${totalPages}`;

        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages;
    }

    prevBtn.addEventListener("click", () => {
        if (currentPage > 1) {
            showPage(currentPage - 1);
        }
    });

    nextBtn.addEventListener("click", () => {
        if (currentPage < totalPages) {
            showPage(currentPage + 1);
        }
    });

    showPage(1);
});

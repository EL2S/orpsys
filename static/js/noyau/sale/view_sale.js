document.addEventListener('DOMContentLoaded', function () {
    const todayBtn = document.getElementById("today-button");
    const allBtn = document.getElementById("all-button");
    const shiftBtn = document.getElementById("shift-button");
    const modalContainer = document.getElementById('modalContainer');
    const transactionsTable = document.getElementById('transactionTable');
    const transactionsBody = transactionsTable.querySelector('tbody');
    const transactionsRows = transactionsTable.querySelectorAll("tbody tr");
    const transactionSelectInput = document.getElementById("employer-transaction");
    const startTransactionInput = document.getElementById("start-date-transaction");
    const endTransactionInput = document.getElementById("end-date-transaction");
    const salesTable = document.getElementById('saleTable');
    const salesBody = salesTable.querySelector("tbody");
    const salesRows = salesTable.querySelectorAll("tbody tr");
    const saleSelectInput = document.getElementById("employer-sale");
    const startSaleInput = document.getElementById("start-date-sale");
    const endSaleInput = document.getElementById("end-date-sale");
    const shiftReportButton = document.getElementById("btn-shift-report");
    const shiftTable = document.getElementById('shiftTable');
    const shiftBody = shiftTable ? shiftTable.querySelector('tbody') : null;
    const shiftRowsNode = shiftTable ? shiftTable.querySelectorAll("tbody tr") : [];
    const shiftCashiersEl = document.getElementById("shift-cashiers-json");
    const shiftCashiers = shiftCashiersEl ? JSON.parse(shiftCashiersEl.textContent || "[]") : [];
    const csrfToken = document.querySelector("[name=csrfmiddlewaretoken]");

    const REPORT_BRAND = {
        companyName: "SALIMAMOUD",
        logoUrl: "/static/img/logo/salimamoud.png",
    };

    const REPORT_COLORS = {
        text: [28, 30, 35],
        muted: [90, 96, 110],
        border: [228, 232, 238],
        soft: [246, 248, 251],
        entry: [245, 158, 11],
        entrySoft: [255, 243, 223],
    };

    function formatShiftLabel(shiftCode) {
        if (shiftCode === "SOIR") return "Soir";
        if (shiftCode === "MATIN") return "Matin";
        return "Tous";
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    async function imageUrlToDataUrl(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Logo introuvable");
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function drawSectionTitle(doc, y, title) {
        const left = 48;
        const right = doc.internal.pageSize.getWidth() - 48;
        doc.setFillColor(...REPORT_COLORS.soft);
        doc.roundedRect(left, y, right - left, 22, 6, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...REPORT_COLORS.text);
        doc.text(title, left + 10, y + 15);
        return y + 32;
    }

    function toNumber(value) {
        if (value === null || value === undefined || value === "") return 0;
        if (typeof value === "number") return value;
        const cleaned = String(value).replace(/[^0-9.-]/g, "");
        const num = parseFloat(cleaned);
        return Number.isFinite(num) ? num : 0;
    }

    function ensureSpace(doc, y, needed) {
        const bottom = doc.internal.pageSize.getHeight() - 48;
        if (y + needed > bottom) {
            doc.addPage();
            return 48;
        }
        return y;
    }

    function renderEmptySection(doc, y) {
        const left = 48;
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(...REPORT_COLORS.muted);
        doc.text("Aucune donnée.", left + 6, y + 12);
        return y + 28;
    }

    function renderSummaryCard(doc, report, startY) {
        const left = 48;
        const right = doc.internal.pageSize.getWidth() - 48;
        const cardHeight = 132;
        let y = ensureSpace(doc, startY, cardHeight + 8);

        doc.setFillColor(...REPORT_COLORS.entrySoft);
        doc.roundedRect(left, y, right - left, cardHeight, 10, 10, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...REPORT_COLORS.text);
        doc.text("Résumé caisse", left + 12, y + 18);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(...REPORT_COLORS.text);

        const line1Y = y + 38;
        const line2Y = y + 56;
        const line3Y = y + 74;
        const line4Y = y + 92;
        doc.text(`Ventes POS : ${report.totals.pos_sales_total}`, left + 12, line1Y);
        doc.text(`Ventes Boulangerie : ${report.totals.bakery_sales_total}`, left + 200, line1Y);
        doc.text(`Total ventes : ${report.totals.sales_total}`, left + 400, line1Y);

        doc.text(`Consommations : ${report.totals.consumption_total}`, left + 12, line2Y);
        doc.text(`Dépenses : ${report.totals.expense_total}`, left + 200, line2Y);
        doc.text(`Vente en dépôt : ${report.totals.resale_total || 0}`, left + 12, line3Y);
        doc.text(`Achat & Revente : ${report.totals.ar_total || 0}`, left + 200, line3Y);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(...REPORT_COLORS.entry);
        doc.text(`Net à remettre : ${report.totals.net_total}`, left + 12, line4Y + 18);

        return y + cardHeight + 16;
    }

    function renderTableSection(doc, title, head, body, startY) {
        let y = ensureSpace(doc, startY, 80);
        y = drawSectionTitle(doc, y, title);

        if (!body || body.length === 0) {
            return renderEmptySection(doc, y);
        }

        doc.autoTable({
            startY: y,
            margin: { left: 48, right: doc.internal.pageSize.getWidth() - 48 },
            tableWidth: doc.internal.pageSize.getWidth() - 96,
            theme: "grid",
            head: [head],
            body,
            styles: { font: "helvetica", fontSize: 9, cellPadding: 6 },
        });
        return doc.lastAutoTable.finalY + 18;
    }

    function renderReportTables(doc, report, startY) {
        const left = 48;
        const right = doc.internal.pageSize.getWidth() - 48;
        let y = startY;

        const readyRows = (report.ready_rows || []).filter((row) => {
            return (
                toNumber(row.remises) > 0 ||
                toNumber(row.prod) > 0 ||
                toNumber(row.total) > 0 ||
                toNumber(row.sold) > 0 ||
                toNumber(row.abimes) > 0 ||
                toNumber(row.restes) > 0 ||
                toNumber(row.amount) > 0
            );
        });
        y = renderTableSection(
            doc,
            "Comptoir",
            ["Désignation", "Remises", "Prod.", "Total", "Vendus", "Abîmés", "Restes", "P.U", "Montant"],
            readyRows.map((row) => [
                row.name,
                row.remises,
                row.prod,
                row.total,
                row.sold,
                row.abimes,
                row.restes,
                row.unit_price,
                row.amount,
            ]),
            y
        );

        const resaleRows = (report.resale_rows || []).filter((row) => {
            return (
                toNumber(row.delivered) > 0 ||
                toNumber(row.sold) > 0 ||
                toNumber(row.amount) > 0 ||
                toNumber(row.restes) > 0
            );
        });
        y = renderTableSection(
            doc,
            "Vente en dépôt",
            ["Désignation", "Entrées", "Vendus", "Restes", "P.U", "Montant"],
            resaleRows.map((row) => [
                row.name,
                row.delivered,
                row.sold,
                row.restes,
                row.unit_price,
                row.amount,
            ]),
            y
        );

        const arRows = (report.ar_rows || []).filter((row) => {
            return (
                toNumber(row.delivered) > 0 ||
                toNumber(row.sold) > 0 ||
                toNumber(row.amount) > 0 ||
                toNumber(row.restes) > 0
            );
        });
        y = renderTableSection(
            doc,
            "Achat & Revente",
            ["Désignation", "Entrées", "Vendus", "Restes", "P.U", "Montant"],
            arRows.map((row) => [
                row.name,
                row.delivered,
                row.sold,
                row.restes,
                row.unit_price,
                row.amount,
            ]),
            y
        );

        const makeRows = (report.make_rows || []).filter((row) => {
            return (
                toNumber(row.prod) > 0 ||
                toNumber(row.sold) > 0 ||
                toNumber(row.amount) > 0
            );
        });
        y = renderTableSection(
            doc,
            "Pyromane Grill",
            ["Désignation", "Prod.", "Vendus", "P.U", "Montant"],
            makeRows.map((row) => [
                row.name,
                row.prod,
                row.sold,
                row.unit_price,
                row.amount,
            ]),
            y
        );

        if (report.bakery_rows && report.bakery_rows.length) {
            y = drawSectionTitle(doc, y, "Commandes boulangerie encaissées");
            doc.autoTable({
                startY: y,
                margin: { left, right },
                tableWidth: right - left,
                theme: "grid",
                head: [["Commande", "Client", "Heure", "Paiement", "Montant"]],
                body: report.bakery_rows.map((row) => [
                    row.order,
                    row.client,
                    row.time || "-",
                    row.payment_method || "-",
                    row.amount,
                ]),
                styles: { font: "helvetica", fontSize: 9, cellPadding: 6 },
            });
            y = doc.lastAutoTable.finalY + 18;
        }

        const consumptionRows = (report.consumptions || []).filter((row) => {
            return toNumber(row.quantity) > 0 || toNumber(row.amount) > 0;
        });
        y = renderTableSection(
            doc,
            "Consommations internes",
            ["Nom", "Produit", "Qté", "P.U", "Montant"],
            consumptionRows.map((row) => [
                row.person_name,
                row.product,
                row.quantity,
                row.unit_price,
                row.amount,
            ]),
            y
        );

        const expenseRows = (report.expenses || []).filter((row) => {
            return toNumber(row.amount) > 0;
        });
        y = renderTableSection(
            doc,
            "Dépenses",
            ["Motif", "Montant"],
            expenseRows.map((row) => [row.label, row.amount]),
            y
        );

        renderSummaryCard(doc, report, y);
    }

    function mergeReports(reports) {
        if (!reports || reports.length === 0) return null;
        if (reports.length === 1) return reports[0];

        const merged = {
            shift_date: reports[0].shift_date,
            cashier: reports[0].cashier,
            ready_rows: [],
            resale_rows: [],
            ar_rows: [],
            make_rows: [],
            bakery_rows: [],
            consumptions: [],
            expenses: [],
            totals: {
                sales_total: 0,
                pos_sales_total: 0,
                bakery_sales_total: 0,
                resale_total: 0,
                ar_total: 0,
                expense_total: 0,
                consumption_total: 0,
                net_total: 0,
            },
        };

        const readyMap = new Map();
        const makeMap = new Map();
        const resaleMap = new Map();
        const arMap = new Map();
        const expenseMap = new Map();
        const consumptionMap = new Map();

        reports.forEach((report) => {
            (report.ready_rows || []).forEach((row) => {
                const key = row.name || "";
                const current = readyMap.get(key) || {
                    name: row.name,
                    remises: 0,
                    prod: 0,
                    total: 0,
                    sold: 0,
                    abimes: 0,
                    restes: 0,
                    unit_price: row.unit_price,
                    amount: 0,
                };
                current.remises += toNumber(row.remises);
                current.prod += toNumber(row.prod);
                current.total += toNumber(row.total);
                current.sold += toNumber(row.sold);
                current.abimes += toNumber(row.abimes);
                current.restes += toNumber(row.restes);
                current.amount += toNumber(row.amount);
                if (!current.unit_price && row.unit_price) current.unit_price = row.unit_price;
                readyMap.set(key, current);
            });

            (report.make_rows || []).forEach((row) => {
                const key = row.name || "";
                const current = makeMap.get(key) || {
                    name: row.name,
                    prod: 0,
                    sold: 0,
                    unit_price: row.unit_price,
                    amount: 0,
                };
                current.prod += toNumber(row.prod);
                current.sold += toNumber(row.sold);
                current.amount += toNumber(row.amount);
                if (!current.unit_price && row.unit_price) current.unit_price = row.unit_price;
                makeMap.set(key, current);
            });

            (report.resale_rows || []).forEach((row) => {
                const key = row.name || "";
                const current = resaleMap.get(key) || {
                    name: row.name,
                    delivered: 0,
                    sold: 0,
                    restes: 0,
                    unit_price: row.unit_price,
                    amount: 0,
                };
                current.delivered += toNumber(row.delivered);
                current.sold += toNumber(row.sold);
                current.restes += toNumber(row.restes);
                current.amount += toNumber(row.amount);
                if (!current.unit_price && row.unit_price) current.unit_price = row.unit_price;
                resaleMap.set(key, current);
            });

            (report.ar_rows || []).forEach((row) => {
                const key = row.name || "";
                const current = arMap.get(key) || {
                    name: row.name,
                    delivered: 0,
                    sold: 0,
                    restes: 0,
                    unit_price: row.unit_price,
                    amount: 0,
                };
                current.delivered += toNumber(row.delivered);
                current.sold += toNumber(row.sold);
                current.restes += toNumber(row.restes);
                current.amount += toNumber(row.amount);
                if (!current.unit_price && row.unit_price) current.unit_price = row.unit_price;
                arMap.set(key, current);
            });

            (report.bakery_rows || []).forEach((row) => merged.bakery_rows.push(row));

            (report.expenses || []).forEach((row) => {
                const key = row.label || "";
                const current = expenseMap.get(key) || { label: row.label, amount: 0 };
                current.amount += toNumber(row.amount);
                expenseMap.set(key, current);
            });

            (report.consumptions || []).forEach((row) => {
                const key = `${row.person_name || ""}::${row.product || ""}`;
                const current = consumptionMap.get(key) || {
                    person_name: row.person_name,
                    product: row.product,
                    quantity: 0,
                    unit_price: row.unit_price,
                    amount: 0,
                };
                current.quantity += toNumber(row.quantity);
                current.amount += toNumber(row.amount);
                if (!current.unit_price && row.unit_price) current.unit_price = row.unit_price;
                consumptionMap.set(key, current);
            });

            merged.totals.sales_total += toNumber(report.totals?.sales_total);
            merged.totals.pos_sales_total += toNumber(report.totals?.pos_sales_total);
            merged.totals.bakery_sales_total += toNumber(report.totals?.bakery_sales_total);
            merged.totals.resale_total += toNumber(report.totals?.resale_total);
            merged.totals.ar_total += toNumber(report.totals?.ar_total);
            merged.totals.expense_total += toNumber(report.totals?.expense_total);
            merged.totals.consumption_total += toNumber(report.totals?.consumption_total);
            merged.totals.net_total += toNumber(report.totals?.net_total);
        });

        merged.ready_rows = Array.from(readyMap.values());
        merged.make_rows = Array.from(makeMap.values());
        merged.resale_rows = Array.from(resaleMap.values());
        merged.ar_rows = Array.from(arMap.values());
        merged.expenses = Array.from(expenseMap.values());
        merged.consumptions = Array.from(consumptionMap.values());

        return merged;
    }

    function normalizeFilenameLabel(label) {
        return (label || "caissier")
            .toString()
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-_]/g, "");
    }

    async function generateShiftReportPdf(reports, { date, cashierLabel }) {
        if (!window.jspdf?.jsPDF) {
            alert("La librairie PDF n'est pas chargée.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        let logoDataUrl = null;
        try {
            logoDataUrl = await imageUrlToDataUrl(REPORT_BRAND.logoUrl);
        } catch (_) {
            // ignore
        }

        const sortedReports = [...reports].sort((a, b) => (a.shift || "").localeCompare(b.shift || ""));
        if (sortedReports.length === 0) {
            alert("Aucune donnée à exporter.");
            return;
        }

        sortedReports.forEach((report, index) => {
            if (index > 0) {
                doc.addPage();
            }
            const left = 48;
            let y = 48;
            if (logoDataUrl) {
                doc.addImage(logoDataUrl, "PNG", left, y, 44, 44);
            }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(26);
            doc.setTextColor(...REPORT_COLORS.text);
            doc.text(REPORT_BRAND.companyName, left + (logoDataUrl ? 56 : 0), y + 24);

            doc.setFontSize(12);
            doc.setTextColor(...REPORT_COLORS.muted);
            doc.text("Rapport caisse POS", left + (logoDataUrl ? 56 : 0), y + 42);

            y += 72;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            doc.setTextColor(...REPORT_COLORS.text);
            doc.text(`Date : ${report.shift_date || date}`, left, y);
            const headerRight = doc.internal.pageSize.getWidth() - 48;
            doc.text(`Caissier(e) : ${report.cashier || cashierLabel || "-"}`, headerRight, y, { align: "right" });
            y += 16;
            doc.text(`Shift : ${report.shift === "SOIR" ? "Soir" : "Matin"}`, left, y);
            y += 18;

            renderReportTables(doc, report, y);
        });

        const safeLabel = normalizeFilenameLabel(cashierLabel || reports[0]?.cashier);
        const filename = `rapport-caisse-pos-${date}-${safeLabel || "caissier"}.pdf`;
        doc.save(filename);
    }

    function openShiftReportModal() {
        if (!modalContainer) return;
        const today = new Date().toISOString().slice(0, 10);
        modalContainer.innerHTML = `
            <div role="dialog" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border p-6 shadow-lg duration-200 sm:max-w-[420px]" tabindex="-1" style="pointer-events: auto">
                <div class="space-y-2">
                    <h2 class="text-lg font-semibold">Générer un rapport de caisse</h2>
                    <p class="text-sm text-muted-foreground">Choisissez la date et le caissier pour télécharger le PDF.</p>
                </div>
                <form id="shiftReportForm" class="grid gap-4">
                    <div class="space-y-2">
                        <label class="text-sm font-medium">Date</label>
                        <input type="date" id="shiftReportDate" value="${today}" class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none" required />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium">Caissier(e)</label>
                        <select id="shiftReportCashier" class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none">
                            <option value="">Chargement...</option>
                        </select>
                    </div>
                    <p id="shiftReportError" class="text-sm text-red-600 hidden"></p>
                    <div class="flex justify-end gap-2">
                        <button type="button" id="shiftReportCancel" class="inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm hover:bg-accent">Annuler</button>
                        <button type="submit" class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Télécharger</button>
                    </div>
                </form>
            </div>
        `;

        const cancelBtn = document.getElementById("shiftReportCancel");
        const form = document.getElementById("shiftReportForm");
        const errorEl = document.getElementById("shiftReportError");
        const dateInput = document.getElementById("shiftReportDate");
        const cashierSelect = document.getElementById("shiftReportCashier");

        async function loadCashiers(date) {
            errorEl.classList.add("hidden");
            cashierSelect.innerHTML = `<option value="">Chargement...</option>`;
            const res = await fetch(`/pos/shift/cashiers/?date=${encodeURIComponent(date)}`);
            const data = await window.safeJson(res).catch(() => ({}));
            if (!res.ok || !data.success) {
                cashierSelect.innerHTML = `<option value="">Aucun caissier</option>`;
                errorEl.textContent = data.error || "Impossible de charger les caissiers.";
                errorEl.classList.remove("hidden");
                return;
            }

            const cashiers = data.cashiers || [];
            if (cashiers.length === 0) {
                cashierSelect.innerHTML = `<option value="">Aucun caissier</option>`;
                return;
            }

            cashierSelect.innerHTML = `<option value="">Choisir un caissier</option>` + cashiers
                .map((cashier) => `<option value="${cashier.id}">${cashier.name}</option>`)
                .join("");
        }

        cancelBtn.addEventListener("click", () => {
            modalContainer.innerHTML = "";
        });

        dateInput.addEventListener("change", () => {
            loadCashiers(dateInput.value);
        });

        loadCashiers(today);

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            errorEl.classList.add("hidden");

            const date = dateInput.value;
            const cashierId = cashierSelect.value;
            const cashierLabel = cashierSelect.options[cashierSelect.selectedIndex]?.text || "";

            if (!cashierId) {
                errorEl.textContent = "Veuillez sélectionner un caissier.";
                errorEl.classList.remove("hidden");
                return;
            }

            const res = await fetch(`/pos/shift/report/?date=${encodeURIComponent(date)}&cashier_id=${encodeURIComponent(cashierId)}`);
            const data = await window.safeJson(res).catch(() => ({}));
            if (!res.ok || !data.success) {
                errorEl.textContent = data.error || "Impossible de générer le rapport.";
                errorEl.classList.remove("hidden");
                return;
            }

            const reports = data.reports || (data.report ? [data.report] : []);
            if (reports.length === 0) {
                errorEl.textContent = "Aucune donnée disponible.";
                errorEl.classList.remove("hidden");
                return;
            }

            await generateShiftReportPdf(reports, { date, cashierLabel });
            modalContainer.innerHTML = "";
        });
    }

    function filterSaleTable() {
        const saleSelect = saleSelectInput.value.trim().toLowerCase();
        const startSale = startSaleInput.value ? new Date(startSaleInput.value) : null;
        const endSale = endSaleInput.value ? new Date(endSaleInput.value) : null;

        salesRows.forEach(row => {
            const dateText = row.children[0].textContent.trim();   // JJ/MM/AAAA
            const employerText = row.children[3].textContent.trim().toLowerCase();

            // convertir JJ/MM/AAAA → Date
            const [day, month, year] = dateText.split("/");
            const rowDate = new Date(`${year}-${month}-${day}`);

            let show = true;

            // Filtre Employé
            if (saleSelect !== "" && employerText !== saleSelect) {
                show = false;
            }

            // Filtre Date de début
            if (startSale && rowDate < startSale) {
                show = false;
            }

            // Filtre Date de fin
            if (endSale && rowDate > endSale) {
                show = false;
            }

            // Afficher ou masquer la ligne
            row.style.display = show ? "" : "none";
        });
    }

    // Écouteurs d’événements
    saleSelectInput.addEventListener("change", filterSaleTable);
    startSaleInput.addEventListener("change", filterSaleTable);
    endSaleInput.addEventListener("change", filterSaleTable);


    function filterTransactionTable() {
        const transactionSelect = transactionSelectInput.value.trim().toLowerCase();
        const startTransaction = startTransactionInput.value ? new Date(startTransactionInput.value) : null;
        const endTransaction = endTransactionInput.value ? new Date(endTransactionInput.value) : null;

        transactionsRows.forEach(row => {
            const dateText = row.children[0].textContent.trim();   // JJ/MM/AAAA
            const employerText = row.children[2].textContent.trim().toLowerCase();

            // convertir JJ/MM/AAAA → Date
            const [day, month, year] = dateText.split("/");
            const rowDate = new Date(`${year}-${month}-${day}`);

            let show = true;

            // Filtre Employé
            if (transactionSelect !== "" && employerText !== transactionSelect) {
                show = false;
            }

            // Filtre Date de début
            if (startTransaction && rowDate < startTransaction) {
                show = false;
            }

            // Filtre Date de fin
            if (endTransaction && rowDate > endTransaction) {
                show = false;
            }

            // Afficher ou masquer la ligne
            row.style.display = show ? "" : "none";
        });
    }

    // Écouteurs d’événements
    transactionSelectInput.addEventListener("change", filterTransactionTable);
    startTransactionInput.addEventListener("change", filterTransactionTable);
    endTransactionInput.addEventListener("change", filterTransactionTable);

    // Les panneaux
    const todayPanel = document.querySelector('[role="tabpanel"][aria-labelledby="today-button"]');
    const allPanel = document.querySelector('[role="tabpanel"][aria-labelledby="all-button"]');
    const shiftPanel = document.querySelector('[role="tabpanel"][aria-labelledby="shift-button"]');
    const tabs = [
        { button: todayBtn, panel: todayPanel },
        { button: allBtn, panel: allPanel },
        { button: shiftBtn, panel: shiftPanel },
    ].filter((tab) => tab.button && tab.panel);

    function activateTab(selectedBtn, selectedPanel) {
        tabs.forEach(({ button, panel }) => {
            const isSelected = button === selectedBtn && panel === selectedPanel;
            button.dataset.state = isSelected ? "active" : "inactive";
            button.setAttribute("aria-selected", isSelected ? "true" : "false");
            button.tabIndex = isSelected ? 0 : -1;
            panel.dataset.state = isSelected ? "active" : "inactive";
            panel.hidden = !isSelected;
        });
    }

    if (todayBtn && todayPanel) {
        todayBtn.addEventListener("click", () => activateTab(todayBtn, todayPanel));
    }
    if (allBtn && allPanel) {
        allBtn.addEventListener("click", () => activateTab(allBtn, allPanel));
    }
    if (shiftBtn && shiftPanel) {
        shiftBtn.addEventListener("click", () => activateTab(shiftBtn, shiftPanel));
    }


    let allSaleRows = Array.from(document.querySelectorAll("#saleTable tbody tr"));
    let saleRows = allSaleRows.filter(row => !row.textContent.includes("Aucune vente trouvée."));

    const rowsPerPage = 10;
    let currentSalePage = 1;

    const paginationInfo = document.querySelector("#pagination .text-muted-foreground");
    const pageNumberLabel = document.querySelector("#pagination .page-number");
    const prevBtn = document.querySelector('#pagination button:first-child');
    const nextBtn = document.querySelector('#pagination button:last-child');

    function renderTable() {
        const totalRows = saleRows.length;
        const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

        // Masquer toutes les lignes
        allSaleRows.forEach(row => row.style.display = "none");

        // Si 0 résultat
        if (totalRows === 0) {
            // afficher la ligne "Aucune vente trouvée."
            const noDataRow = allSaleRows.find(row => row.textContent.includes("Aucune vente trouvée."));
            if (noDataRow) noDataRow.style.display = "";

            // Textes pagination
            paginationInfo.textContent = "Affichage de 0 à 0 sur 0 résultats";
            pageNumberLabel.textContent = "Page 1 sur 1";

            // Désactiver les boutons
            prevBtn.disabled = true;
            nextBtn.disabled = true;

            return; // arrêter ici
        }

        // Sinon, pagination normale
        const start = (currentSalePage - 1) * rowsPerPage;
        const end = Math.min(start + rowsPerPage, totalRows);

        for (let i = start; i < end; i++) {
            saleRows[i].style.display = "";
        }

        // MAJ textes
        paginationInfo.textContent = `Affichage de ${start + 1} à ${end} sur ${totalRows} résultats`;
        pageNumberLabel.textContent = `Page ${currentSalePage} sur ${totalPages}`;

        // Buttons
        prevBtn.disabled = currentSalePage === 1;
        nextBtn.disabled = currentSalePage === totalPages;
    }

    prevBtn.addEventListener("click", () => {
        currentSalePage--;
        renderTable();
    });

    nextBtn.addEventListener("click", () => {
        currentSalePage++;
        renderTable();
    });

    renderTable();



    let allTransactionRows = Array.from(document.querySelectorAll("#transactionTable tbody tr"));
    let transactionRows = allTransactionRows.filter(row => !row.textContent.includes("Aucune vente trouvée."));
    let currentTransactionPage = 1;

    const paginationInfoTransaction = document.querySelector("#transactionPagination .text-muted-foreground");
    const pageNumberLabelTransaction = document.querySelector("#transactionPagination .page-number");
    const prevBtnTransaction = document.querySelector('#transactionPagination button:first-child');
    const nextBtnTransaction = document.querySelector('#transactionPagination button:last-child');

    function renderTableTransaction() {
        const totalRows = transactionRows.length;
        const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

        // Masquer toutes les lignes
        allTransactionRows.forEach(row => row.style.display = "none");

        // Si 0 résultat
        if (totalRows === 0) {
            // afficher la ligne "Aucune vente trouvée."
            const noDataRow = allTransactionRows.find(row => row.textContent.includes("Aucune vente trouvée."));
            if (noDataRow) noDataRow.style.display = "";

            // Textes pagination
            paginationInfoTransaction.textContent = "Affichage de 0 à 0 sur 0 résultats";
            pageNumberLabelTransaction.textContent = "Page 1 sur 1";

            // Désactiver les boutons
            prevBtnTransaction.disabled = true;
            nextBtnTransaction.disabled = true;

            return; // arrêter ici
        }

        // Sinon, pagination normale
        const start = (currentTransactionPage - 1) * rowsPerPage;
        const end = Math.min(start + rowsPerPage, totalRows);

        for (let i = start; i < end; i++) {
            transactionRows[i].style.display = "";
        }

        // MAJ textes
        paginationInfoTransaction.textContent = `Affichage de ${start + 1} à ${end} sur ${totalRows} résultats`;
        pageNumberLabelTransaction.textContent = `Page ${currentTransactionPage} sur ${totalPages}`;

        // Buttons
        prevBtnTransaction.disabled = currentTransactionPage === 1;
        nextBtnTransaction.disabled = currentTransactionPage === totalPages;
    }

    prevBtnTransaction.addEventListener("click", () => {
        currentTransactionPage--;
        renderTableTransaction();
    });

    nextBtnTransaction.addEventListener("click", () => {
        currentTransactionPage++;
        renderTableTransaction();
    });

    renderTableTransaction();

    let allShiftRows = Array.from(shiftRowsNode);
    let shiftRows = allShiftRows.filter(row => !row.textContent.includes("Aucun shift trouvé."));
    let currentShiftPage = 1;

    const paginationInfoShift = document.querySelector("#shiftPagination .text-muted-foreground");
    const pageNumberLabelShift = document.querySelector("#shiftPagination .page-number");
    const prevBtnShift = document.querySelector('#shiftPagination button:first-child');
    const nextBtnShift = document.querySelector('#shiftPagination button:last-child');

    function renderShiftTable() {
        if (!shiftBody || !paginationInfoShift || !pageNumberLabelShift || !prevBtnShift || !nextBtnShift) {
            return;
        }
        const totalRows = shiftRows.length;
        const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

        allShiftRows.forEach(row => row.style.display = "none");

        if (totalRows === 0) {
            const noDataRow = allShiftRows.find(row => row.textContent.includes("Aucun shift trouvé."));
            if (noDataRow) noDataRow.style.display = "";
            paginationInfoShift.textContent = "Affichage de 0 à 0 sur 0 résultats";
            pageNumberLabelShift.textContent = "Page 1 sur 1";
            prevBtnShift.disabled = true;
            nextBtnShift.disabled = true;
            return;
        }

        const start = (currentShiftPage - 1) * rowsPerPage;
        const end = Math.min(start + rowsPerPage, totalRows);
        for (let i = start; i < end; i++) {
            shiftRows[i].style.display = "";
        }

        paginationInfoShift.textContent = `Affichage de ${start + 1} à ${end} sur ${totalRows} résultats`;
        pageNumberLabelShift.textContent = `Page ${currentShiftPage} sur ${totalPages}`;
        prevBtnShift.disabled = currentShiftPage === 1;
        nextBtnShift.disabled = currentShiftPage === totalPages;
    }

    if (prevBtnShift && nextBtnShift) {
        prevBtnShift.addEventListener("click", () => {
            currentShiftPage--;
            renderShiftTable();
        });
        nextBtnShift.addEventListener("click", () => {
            currentShiftPage++;
            renderShiftTable();
        });
    }

    renderShiftTable();

    salesBody.addEventListener('click', function (event) {
        const viewBtn = event.target.closest('.view-button');
        if (viewBtn) {
            const saleId = viewBtn.getAttribute('data-id');
            fetch(`/sale/bakery/${saleId}/get/`)
                .then(window.safeJson)
                .then(data => {
                    if (data.success) {
                        viewSaleItem(data.sales);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération des donneés :", err);
                });
        }
    });

    function viewSaleItem(sales){
        const totalItems = Object.values(sales).reduce((sum, p) => sum + p.quantity, 0);
        const totalPrice = Object.values(sales).reduce((sum, p) => sum + (p.quantity * p.price), 0);
        modalContainer.innerHTML = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div data-slot="card" class="text-card-foreground gap-6 rounded-xl border py-6 shadow-sm w-full max-w-2xl max-h-[90vh] flex flex-col bg-background">
                    <div class="flex items-center justify-between p-6 border-b border-border">
                        <h2 class="text-2xl font-bold text-foreground">Récapitulatif</h2>
                        <button data-slot="button" id="closeModal" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x h-6 w-6">
                                <path d="M18 6 6 18"></path>
                                <path d="m6 6 12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="flex-1 overflow-y-auto p-6">
                        <div class="space-y-4" id="cart-items">
                            
                        </div>
                    </div>
                    <div class="border-t border-border p-6 bg-secondary/30">
                        <div class="flex justify-between items-center mb-2">
                            <span class="total-items text-muted-foreground">Articles (${totalItems})</span>
                            <span class="total-price text-foreground">${totalPrice}KMF</span>
                        </div>
                        <div class="flex justify-between items-center mb-6 text-xl font-bold">
                            <span class="text-foreground">Total</span>
                            <span class="total-price text-primary">${totalPrice}KMF</span>
                        </div>
                    </div>
                </div>
            </div>

        
        `;
        const closeModal = document.getElementById('closeModal');
        const cartItems = document.getElementById('cart-items');
        let itemsHTML = Object.entries(sales).map(([id, item]) => `
            <div class="flex gap-3 pb-4 border-b border-border">
                <div class="w-16 h-16 bg-muted rounded overflow-hidden flex-shrink-0">
                    <img alt="${item.name}" class="w-full h-full object-cover" src="/media/${item.image}" />
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-foreground truncate">${item.name}</h3>
                    <p class="text-sm text-muted-foreground">${item.quantity} × ${item.price}KMF</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-foreground">${parseFloat(item.subtotal)}KMF</p>
                </div>
            </div>
        `).join('');
        cartItems.innerHTML = itemsHTML;
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });

    }

    transactionsBody.addEventListener('click', function (event) {
        const viewBtn = event.target.closest('.view-button');
        if (viewBtn) {
            const transactionId = viewBtn.getAttribute('data-id');
            fetch(`/sale/transaction/${transactionId}/get/`)
                .then(window.safeJson)
                .then(data => {
                    if (data.success) {
                        viewTransactionItem(data.transactions);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération des donneés :", err);
                });
        }
    });

    function viewTransactionItem(transactions){
        const totalItems = Object.values(transactions).reduce((sum, p) => sum + p.quantity, 0);
        const totalPrice = Object.values(transactions).reduce((sum, p) => sum + (p.quantity * p.price), 0);
        modalContainer.innerHTML = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div data-slot="card" class="text-card-foreground gap-6 rounded-xl border py-6 shadow-sm w-full max-w-2xl max-h-[90vh] flex flex-col bg-background">
                    <div class="flex items-center justify-between p-6 border-b border-border">
                        <h2 class="text-2xl font-bold text-foreground">Récapitulatif</h2>
                        <button data-slot="button" id="closeModal" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x h-6 w-6">
                                <path d="M18 6 6 18"></path>
                                <path d="m6 6 12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="flex-1 overflow-y-auto p-6">
                        <div class="space-y-4" id="cart-items">
                            
                        </div>
                    </div>
                    <div class="border-t border-border p-6 bg-secondary/30">
                        <div class="flex justify-between items-center mb-2">
                            <span class="total-items text-muted-foreground">Articles (${totalItems})</span>
                            <span class="total-price text-foreground">${totalPrice}KMF</span>
                        </div>
                        <div class="flex justify-between items-center mb-6 text-xl font-bold">
                            <span class="text-foreground">Total</span>
                            <span class="total-price text-primary">${totalPrice}KMF</span>
                        </div>
                    </div>
                </div>
            </div>

        
        `;
        const closeModal = document.getElementById('closeModal');
        const cartItems = document.getElementById('cart-items');
        let itemsHTML = Object.entries(transactions).map(([id, item]) => `
            <div class="flex gap-3 pb-4 border-b border-border">
                <div class="w-16 h-16 bg-muted rounded overflow-hidden flex-shrink-0">
                    <img alt="${item.name}" class="w-full h-full object-cover" src="/media/${item.image}" />
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-foreground truncate">${item.name}</h3>
                    <p class="text-sm text-muted-foreground">${item.quantity} × ${item.price}KMF</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-foreground">${parseFloat(item.subtotal)}KMF</p>
                </div>
            </div>
        `).join('');
        cartItems.innerHTML = itemsHTML;
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });

    }

    async function loadShiftReport(reportId) {
        const response = await fetch(`/pos/shift/${reportId}/get/`);
        const data = await window.safeJson(response);
        if (!response.ok || !data.success) {
            throw new Error(data.error || "Impossible de charger le shift.");
        }
        return data.report;
    }

    function openShiftEditModal(report) {
        const cashierOptions = [`<option value="">Aucune caissière</option>`].concat(
            shiftCashiers.map((cashier) => {
                const selected = String(cashier.id) === String(report.cashier_id || "") ? "selected" : "";
                return `<option value="${cashier.id}" ${selected}>${escapeHtml(cashier.name)}</option>`;
            })
        ).join("");

        modalContainer.innerHTML = `
            <div role="dialog" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border p-6 shadow-lg duration-200 sm:max-w-[560px]" tabindex="-1" style="pointer-events: auto">
                <div class="space-y-2">
                    <h2 class="text-lg font-semibold">Modifier le shift caisse</h2>
                    <p class="text-sm text-muted-foreground">Ajustez seulement le rapport de shift. Les lignes liées restent attachées à ce rapport.</p>
                </div>
                <form id="shiftManageForm" class="grid gap-4">
                    <div class="grid gap-4 sm:grid-cols-2">
                        <div class="space-y-2">
                            <label class="text-sm font-medium">Date</label>
                            <input type="date" name="shift_date" value="${escapeHtml(report.shift_date)}" class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none" required />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium">Shift</label>
                            <select name="shift" class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none">
                                <option value="MATIN" ${report.shift === "MATIN" ? "selected" : ""}>Matin</option>
                                <option value="SOIR" ${report.shift === "SOIR" ? "selected" : ""}>Soir</option>
                            </select>
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium">Caissière</label>
                        <select name="cashier_id" class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none">
                            ${cashierOptions}
                        </select>
                    </div>
                    <div class="grid gap-4 sm:grid-cols-2">
                        <div class="space-y-2">
                            <label class="text-sm font-medium">Ouvert à</label>
                            <input type="datetime-local" name="opened_at" value="${escapeHtml(report.opened_at)}" class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none" required />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium">Clôturé à</label>
                            <input type="datetime-local" name="closed_at" value="${escapeHtml(report.closed_at)}" class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none" />
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium">Note</label>
                        <input type="text" name="note" value="${escapeHtml(report.note || "")}" class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none" />
                    </div>
                    <p id="shiftManageError" class="text-sm text-red-600 hidden"></p>
                    <div class="flex justify-end gap-2">
                        <button type="button" id="shiftManageCancel" class="inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm hover:bg-accent">Annuler</button>
                        <button type="submit" class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Enregistrer</button>
                    </div>
                </form>
            </div>
        `;

        const cancelBtn = document.getElementById("shiftManageCancel");
        const form = document.getElementById("shiftManageForm");
        const errorEl = document.getElementById("shiftManageError");

        cancelBtn.addEventListener("click", () => {
            modalContainer.innerHTML = "";
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            errorEl.classList.add("hidden");
            const formData = new FormData(form);
            const payload = {
                shift_date: formData.get("shift_date"),
                shift: formData.get("shift"),
                cashier_id: formData.get("cashier_id"),
                opened_at: formData.get("opened_at"),
                closed_at: formData.get("closed_at"),
                note: formData.get("note"),
            };

            const response = await fetch(`/pos/shift/${report.id}/update/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken ? csrfToken.value : "",
                },
                body: JSON.stringify(payload),
            });
            const data = await window.safeJson(response);
            if (!response.ok || !data.success) {
                errorEl.textContent = data.error || "Impossible d'enregistrer les modifications.";
                errorEl.classList.remove("hidden");
                return;
            }

            window.location.reload();
        });
    }

    if (shiftBody) {
        shiftBody.addEventListener("click", async (event) => {
            const editBtn = event.target.closest(".shift-edit-button");
            if (editBtn) {
                const reportId = editBtn.getAttribute("data-id");
                try {
                    const report = await loadShiftReport(reportId);
                    openShiftEditModal(report);
                } catch (error) {
                    alert(error.message || "Impossible de charger le shift.");
                }
                return;
            }

            const deleteBtn = event.target.closest(".shift-delete-button");
            if (deleteBtn) {
                const reportId = deleteBtn.getAttribute("data-id");
                try {
                    const report = await loadShiftReport(reportId);
                    const linkedText = `Remises ${report.remises_count} · Abîmés ${report.abimes_count} · Consommations ${report.consumptions_count} · Dépenses ${report.expenses_count}`;
                    const confirmed = window.confirm(`Supprimer le shift ${report.shift_date_label} ${report.shift} ?\n${linkedText}\nCette suppression efface aussi les lignes liées.`);
                    if (!confirmed) return;

                    const response = await fetch(`/pos/shift/${reportId}/delete/`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-CSRFToken": csrfToken ? csrfToken.value : "",
                        },
                        body: JSON.stringify({}),
                    });
                    const data = await window.safeJson(response);
                    if (!response.ok || !data.success) {
                        throw new Error(data.error || "Impossible de supprimer le shift.");
                    }
                    window.location.reload();
                } catch (error) {
                    alert(error.message || "Impossible de supprimer le shift.");
                }
            }
        });
    }

    if (shiftReportButton) {
        shiftReportButton.addEventListener("click", () => {
            openShiftReportModal();
        });
    }

});

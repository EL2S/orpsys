document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('searchInput');
    const inventoryTable = document.getElementById('inventoryTable');
    const tableBody = inventoryTable.querySelector('tbody');
    const tableRows = tableBody.getElementsByTagName('tr');
    const addButton = document.getElementById('add-button');
    const modalContainer = document.getElementById('modalContainer');
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
    const stockInButton = document.getElementById('stock-in-button');
    const stockOutButton = document.getElementById('stock-out-button');
    const inventories_json = document.getElementById('inventories_json');
    const movements_json = document.getElementById('movements_json');
    const sale_products_json = document.getElementById('sale_products_json');
    const printButton = document.getElementById('print-button');
    let inventoriesData = [];
    let movementsData = [];
    if (inventories_json) {
        const rawInventories = (inventories_json.textContent || "").trim();
        try {
            inventoriesData = JSON.parse(rawInventories || "[]");
            if (typeof inventoriesData === "string") {
                inventoriesData = JSON.parse(inventoriesData || "[]");
            }
        } catch (err) {
            inventoriesData = [];
        }
        if (!Array.isArray(inventoriesData)) {
            inventoriesData = [];
        }
    }

    if (movements_json) {
        const rawMovements = (movements_json.textContent || "").trim();
        try {
            movementsData = JSON.parse(rawMovements || "[]");
            if (typeof movementsData === "string") {
                movementsData = JSON.parse(movementsData || "[]");
            }
        } catch (err) {
            movementsData = [];
        }
        if (!Array.isArray(movementsData)) {
            movementsData = [];
        }
    }

    let saleProductsData = [];
    if (sale_products_json) {
        const rawProducts = (sale_products_json.textContent || "").trim();
        try {
            saleProductsData = JSON.parse(rawProducts || "[]");
            if (typeof saleProductsData === "string") {
                saleProductsData = JSON.parse(saleProductsData || "[]");
            }
        } catch (err) {
            saleProductsData = [];
        }
        if (!Array.isArray(saleProductsData)) {
            saleProductsData = [];
        }
    }

    const inventoryById = new Map(
        inventoriesData.map((item) => [String(item.id), item])
    );

    function normalizeDecimalFieldValue(value) {
        return String(value ?? "")
            .trim()
            .replace(/\s+/g, "")
            .replace(",", ".");
    }

    function parseFlexibleDecimalValue(value) {
        const normalized = normalizeDecimalFieldValue(value);
        if (!normalized) return 0;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    function validateDecimalField(input, message) {
        if (!input) return true;
        const rawValue = String(input.value || "").trim();
        if (!rawValue) {
            input.setCustomValidity("");
            return true;
        }
        const parsed = parseFlexibleDecimalValue(rawValue);
        if (Number.isNaN(parsed)) {
            input.setCustomValidity(message);
            input.reportValidity();
            return false;
        }
        input.value = normalizeDecimalFieldValue(rawValue);
        input.setCustomValidity("");
        return true;
    }


    const REPORT_BRAND = {
        companyName: "SALIMAMOUD",
        logoUrl: "/static/img/logo/salimamoud.png",
    };

    const REPORT_COLORS = {
        text: [28, 30, 35],
        muted: [90, 96, 110],
        border: [228, 232, 238],
        soft: [246, 248, 251],
        entry: [37, 126, 86],
        entrySoft: [232, 245, 238],
        sortie: [201, 58, 58],
        sortieSoft: [252, 238, 238],
    };

    function openInfoModal({ title, message, tone = "info" }) {
        const toneClasses = {
            info: "text-blue-600",
            success: "text-green-600",
            error: "text-red-600",
        };
        modalContainer.innerHTML = `
            <div role="dialog" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[420px]" tabindex="-1" style="pointer-events: auto">
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 class="text-lg leading-none font-semibold ${toneClasses[tone] || ""}">${title || "Information"}</h2>
                    <p class="text-sm text-muted-foreground">${message || ""}</p>
                </div>
                <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" id="close-info" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                        Fermer
                    </button>
                </div>
            </div>
        `;
        const closeBtn = document.getElementById("close-info");
        if (closeBtn) {
            closeBtn.addEventListener("click", () => {
                modalContainer.innerHTML = "";
            });
        }
    }

    function toApiDateOnly(value) {
        const str = String(value || "");
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
        const dt = new Date(str);
        if (Number.isNaN(dt.getTime())) return str.slice(0, 10);
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, "0");
        const d = String(dt.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }

    function formatDateLongFr(ymd) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || "")) return "-";
        const [y, m, d] = ymd.split("-");
        const dt = new Date(Number(y), Number(m) - 1, Number(d));
        return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    }

    function toNumber(value) {
        const n = Number(String(value ?? "").replace(",", "."));
        return Number.isFinite(n) ? n : 0;
    }

    function formatQuantity(value) {
        const n = toNumber(value);
        return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
    }

    function formatDestination(value) {
        const normalized = String(value || "").toUpperCase();
        if (normalized === "POS") return "Comptoir";
        if (normalized === "BAKERY") return "Mini-Four";
        if (normalized === "CUISINE") return "Cuisine";
        if (normalized === "AUTRE") return "Autre";
        return "-";
    }

    function groupByPerson(rows) {
        const groups = new Map();
        for (const row of rows) {
            const person = (row.assigned_to || "Sans nom").trim() || "Sans nom";
            if (!groups.has(person)) groups.set(person, []);
            groups.get(person).push(row);
        }
        return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"));
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

    function drawHeader(doc, { selectedDate, movementType, logoDataUrl, continuation = false }) {
        const left = 48;
        const right = doc.internal.pageSize.getWidth() - 48;
        let y = 44;

        if (logoDataUrl) {
            doc.addImage(logoDataUrl, "PNG", left, y - 8, 44, 44);
        }

        const titleX = logoDataUrl ? left + 56 : left;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(30);
        doc.setTextColor(...REPORT_COLORS.text);
        doc.text(REPORT_BRAND.companyName, titleX, y + 20);

        doc.setFontSize(15);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...REPORT_COLORS.muted);
        doc.text("Gestion de stock", titleX, y + 38);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(28);
        doc.setTextColor(...REPORT_COLORS.text);
        doc.text(
            `Rapport des mouvements de stock${continuation ? " (suite)" : ""}`,
            left,
            y + 74
        );

        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        doc.setTextColor(...REPORT_COLORS.text);
        doc.text(`Date : ${formatDateLongFr(selectedDate)}`, left, y + 102);

        const isEntry = movementType === "Entrée";
        const badgeBg = isEntry ? REPORT_COLORS.entrySoft : REPORT_COLORS.sortieSoft;
        const badgeFg = isEntry ? REPORT_COLORS.entry : REPORT_COLORS.sortie;
        const badgeText = `Type : ${movementType}`;
        const badgeW = doc.getTextWidth(badgeText) + 18;
        const badgeX = right - badgeW;
        const badgeY = y + 88;

        doc.setFillColor(...badgeBg);
        doc.roundedRect(badgeX, badgeY, badgeW, 22, 11, 11, "F");
        doc.setTextColor(...badgeFg);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(badgeText, badgeX + 9, badgeY + 15);

        doc.setDrawColor(...REPORT_COLORS.border);
        doc.line(left, y + 118, right, y + 118);

        return y + 140;
    }

    function drawSectionTitle(doc, y, text, type = "neutral") {
        const left = 48;
        const right = doc.internal.pageSize.getWidth() - 48;

        const bg =
            type === "entry" ? REPORT_COLORS.entrySoft :
                type === "sortie" ? REPORT_COLORS.sortieSoft :
                    REPORT_COLORS.soft;

        const fg =
            type === "entry" ? REPORT_COLORS.entry :
                type === "sortie" ? REPORT_COLORS.sortie :
                    REPORT_COLORS.text;

        doc.setFillColor(...bg);
        doc.roundedRect(left, y, right - left, 26, 7, 7, "F");

        doc.setTextColor(...fg);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text(text, left + 12, y + 17);

        return y + 36;
    }

    function drawSimpleTable(doc, startY, rows, { includeDestination = false, includeFefoStatus = false } = {}) {
        const left = 48;
        const right = doc.internal.pageSize.getWidth() - 48;
        const w = right - left;

        const head = includeDestination
            ? (includeFefoStatus
                ? [["Ingrédient", "Quantité", "Unité", "Destination", "Statut FEFO"]]
                : [["Ingrédient", "Quantité", "Unité", "Destination"]])
            : (includeFefoStatus
                ? [["Ingrédient", "Quantité", "Unité", "Statut FEFO"]]
                : [["Ingrédient", "Quantité", "Unité"]]);
        const body = rows.map((m) => {
            const fefoLabel = m.fefo_status || "-";
            if (includeDestination && includeFefoStatus) {
                return [m.name || "-", formatQuantity(m.quantity), m.unit || "-", formatDestination(m.destination), fefoLabel];
            }
            if (includeDestination) {
                return [m.name || "-", formatQuantity(m.quantity), m.unit || "-", formatDestination(m.destination)];
            }
            if (includeFefoStatus) {
                return [m.name || "-", formatQuantity(m.quantity), m.unit || "-", fefoLabel];
            }
            return [m.name || "-", formatQuantity(m.quantity), m.unit || "-"];
        });

        let columnStyles = {};
        if (includeDestination && includeFefoStatus) {
            columnStyles = {
                0: { cellWidth: w * 0.36 },
                1: { cellWidth: w * 0.18, halign: "right" },
                2: { cellWidth: w * 0.14, halign: "center" },
                3: { cellWidth: w * 0.16, halign: "center" },
                4: { cellWidth: w * 0.16, halign: "center" },
            };
        } else if (includeDestination) {
            columnStyles = {
                0: { cellWidth: w * 0.46 },
                1: { cellWidth: w * 0.20, halign: "right" },
                2: { cellWidth: w * 0.18, halign: "center" },
                3: { cellWidth: w * 0.16, halign: "center" },
            };
        } else if (includeFefoStatus) {
            columnStyles = {
                0: { cellWidth: w * 0.52 },
                1: { cellWidth: w * 0.20, halign: "right" },
                2: { cellWidth: w * 0.14, halign: "center" },
                3: { cellWidth: w * 0.14, halign: "center" },
            };
        } else {
            columnStyles = {
                0: { cellWidth: w * 0.56 },
                1: { cellWidth: w * 0.24, halign: "right" },
                2: { cellWidth: w * 0.20, halign: "center" },
            };
        }

        doc.autoTable({
            startY: startY,
            margin: { left, right },
            tableWidth: w,
            theme: "grid",
            head,
            body,
            styles: {
                font: "helvetica",
                fontSize: 11,
                cellPadding: 8,
                textColor: REPORT_COLORS.text,
                lineColor: REPORT_COLORS.border,
                lineWidth: 0.6,
                valign: "middle",
            },
            headStyles: {
                fillColor: [242, 245, 249],
                textColor: REPORT_COLORS.text,
                fontStyle: "bold",
            },
            alternateRowStyles: {
                fillColor: [252, 253, 255],
            },
            columnStyles,
        });

        return doc.lastAutoTable.finalY + 16;
    }

    function getFefoLabel(inventory) {
        if (!inventory || String(inventory.stock_mode || "").toUpperCase() !== "FEFO") {
            return "-";
        }
        const status = (inventory.expiry_status || "").toLowerCase();
        if (status === "expired") return "Expiré";
        if (status === "soon") return "Expire bientôt";
        return "OK";
    }

    function aggregateRows(rows, { includeDestination = false } = {}) {
        const map = new Map();
        for (const item of rows) {
            const name = (item.name || "-").trim() || "-";
            const unit = (item.unit || "-").trim() || "-";
            const destination = includeDestination ? (item.destination || "") : "";
            const key = `${name}||${unit}||${destination}`;
            const qty = toNumber(item.quantity);
            const inventory = inventoryById.get(String(item.raw_material_id || ""));
            const fefoStatus = getFefoLabel(inventory);
            if (!map.has(key)) {
                map.set(key, { name, unit, destination, quantity: 0, fefo_status: fefoStatus });
            }
            const entry = map.get(key);
            entry.quantity += qty;
            if (entry.fefo_status === "-" && fefoStatus !== "-") {
                entry.fefo_status = fefoStatus;
            }
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "fr"));
    }

    function drawSignature(doc, y) {
        const left = 48;
        const right = doc.internal.pageSize.getWidth() - 48;
        const pageH = doc.internal.pageSize.getHeight();

        if (y > pageH - 90) {
            doc.addPage();
            y = 72;
        }

        doc.setDrawColor(...REPORT_COLORS.border);
        doc.line(left, y, right, y);

        y += 24;
        doc.setTextColor(...REPORT_COLORS.text);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        doc.text("Responsable du stock", left, y);

        doc.setDrawColor(180, 186, 196);
        doc.line(right - 180, y + 2, right - 20, y + 2);
    }

    async function generateAndDownloadStockPDF({ movements, selectedDate, movementType }) {
        if (!window.jspdf?.jsPDF) {
            alert("La librairie PDF n'est pas chargée.");
            return;
        }

        const cleanedMovements = (Array.isArray(movements) ? movements : []).filter(
            (m) => toNumber(m.quantity) > 0
        );

        const aggregatedEntries = aggregateRows(cleanedMovements, { includeDestination: false });
        const includeFefoStatus = inventoriesData.some(
            (inv) => String(inv.stock_mode || "").toUpperCase() === "FEFO"
        );

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: "pt", format: "a4" });

        let logoDataUrl = null;
        try {
            logoDataUrl = await imageUrlToDataUrl(REPORT_BRAND.logoUrl);
        } catch (_) {
            // PDF continue sans logo si erreur
        }

        const pageH = doc.internal.pageSize.getHeight();
        let y = drawHeader(doc, { selectedDate, movementType, logoDataUrl, continuation: false });

        if (movementType === "Entrée") {
            y = drawSectionTitle(doc, y, "Mouvements d'entrée", "entry");
            y = drawSimpleTable(doc, y, aggregatedEntries, { includeFefoStatus });
        } else {
            const sections = groupByPerson(cleanedMovements);

            for (let i = 0; i < sections.length; i += 1) {
                const [person, rows] = sections[i];

                if (y > pageH - 150) {
                    doc.addPage();
                    y = drawHeader(doc, { selectedDate, movementType, logoDataUrl, continuation: true });
                }

                const aggregatedRows = aggregateRows(rows, { includeDestination: true });
                y = drawSectionTitle(doc, y, person, "sortie");
                y = drawSimpleTable(doc, y, aggregatedRows, { includeDestination: true, includeFefoStatus });
            }
        }

        drawSignature(doc, y);
        doc.save(`rapport-${movementType.toLowerCase()}-${selectedDate}.pdf`);
    }

    printButton.addEventListener('click', function () {
        // HTML du modal
        modalContainer.innerHTML = `
    
            <div
                role="dialog"
                aria-describedby="radix-_r_c_"
                aria-labelledby="radix-_r_b_"
                data-state="open"
                data-slot="dialog-content"
                class="modal-custom bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]"
                tabindex="-1"
                style="pointer-events: auto"
                >
                <div
                    data-slot="dialog-header"
                    class="flex flex-col gap-2 text-center sm:text-left"
                >
                    <h2
                    data-slot="dialog-title"
                    class="text-lg leading-none font-semibold"
                    >
                    Rapport des mouvements de stock
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="printForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="print">
                    <div class="space-y-2">
                        <p id="printError" class="text-red-800 text-sm hidden">
                        Aucun mouvement trouvé pour cette sélection
                        </p>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                                data-slot="label"
                                class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                                for="date"
                                >Date</label
                            ><input
                                data-slot="input"
                                class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                                id="date"
                                name="date"
                                type="date"
                                required
                            />
                        </div>
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="movement_type"
                            >Type de mouvement</label
                            ><select
                            id="movement_type"
                            name="movement_type"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                                <option value="Entrée" >Entrée</option>
                                <option value="Sortie" >Sortie</option>
                            </select>
                        </div>
                    </div>
                    <div
                    data-slot="dialog-footer"
                    class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
                    >
                    <button
                        data-slot="button"
                        class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[&gt;svg]:px-3"
                        type="submit"
                    >
                        Imprimer
                    </button>
                    </div>
                </form>
                <button
                    type="button"
                    data-slot="dialog-close"
                    id="closeModal"
                    class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4"
                >
                    <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="lucide lucide-x"
                    >
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path></svg
                    ><span class="sr-only">Close</span>
                </button>
            </div>

        `;
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('printForm');
        const dateInput = document.getElementById("date");
        const movementTypeSelect = document.getElementById("movement_type");
        const error = document.getElementById("printError");
        // Fermer le modal
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });

        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const date = dateInput.value;
            const movementType = movementTypeSelect.value;

            const filtered = (Array.isArray(movementsData) ? movementsData : []).filter(
                (m) => toApiDateOnly(m.date) === date && m.movement_type === movementType
            );
            const cleaned = filtered.filter((m) => toNumber(m.quantity) > 0);

            if (cleaned.length === 0) {
                error.classList.remove("hidden");
                return;
            }

            error.classList.add("hidden");

            try {
                await generateAndDownloadStockPDF({
                    movements: cleaned,
                    selectedDate: date,
                    movementType,
                });

                // Fermer le modal après téléchargement
                modalContainer.innerHTML = "";
            } catch (err) {
                console.error(err);
            }
        });


        dateInput.addEventListener("change", () => {
            error.classList.add("hidden");
        });

        movementTypeSelect.addEventListener("change", () => {
            error.classList.add("hidden");
        });
    });

    const fefoFilter = document.getElementById("fefoFilter");
    const expiryDateFilter = document.getElementById("expiryDateFilter");

    function rowMatchesSearch(row, query) {
        if (!query) return true;
        const cells = row.getElementsByTagName('td');
        for (let i = 0; i < cells.length - 1; i++) { // exclut la colonne Actions
            if (cells[i].textContent.toLowerCase().includes(query)) {
                return true;
            }
        }
        return false;
    }

    function rowMatchesFilter(row, filterValue) {
        if (!filterValue || filterValue === "all") return true;
        const mode = (row.dataset.stockMode || "").toUpperCase();
        if (filterValue === "fefo") return mode === "FEFO";
        if (filterValue === "normal") return mode !== "FEFO";
        if (filterValue === "soon") {
            return mode === "FEFO" && (row.dataset.expiryStatus || "") === "soon";
        }
        if (filterValue === "expired") {
            return mode === "FEFO" && (row.dataset.expiryStatus || "") === "expired";
        }
        return true;
    }

    function applyFilters() {
        const query = (searchInput.value || "").toLowerCase().trim();
        const filterValue = fefoFilter ? fefoFilter.value : "all";
        const expiryDateValue = expiryDateFilter ? (expiryDateFilter.value || "") : "";
        rows = allRows.filter((row) => {
            if (row.querySelector('td[colspan]')) return false;
            const matchesFilters = rowMatchesFilter(row, filterValue) && rowMatchesSearch(row, query);
            if (!matchesFilters) return false;
            if (expiryDateValue) {
                return (row.dataset.expiryDate || "") === expiryDateValue;
            }
            return true;
        });

        rows.sort((a, b) => {
            const modeA = (a.dataset.stockMode || "").toUpperCase();
            const modeB = (b.dataset.stockMode || "").toUpperCase();
            const statusA = (a.dataset.expiryStatus || "").toLowerCase();
            const statusB = (b.dataset.expiryStatus || "").toLowerCase();
            const priority = (mode, status) => {
                if (mode !== "FEFO") return 4;
                if (status === "expired") return 0;
                if (status === "soon") return 1;
                if (status === "ok") return 2;
                return 3;
            };
            const prioA = priority(modeA, statusA);
            const prioB = priority(modeB, statusB);
            if (prioA !== prioB) return prioA - prioB;

            if (modeA === "FEFO" && modeB === "FEFO") {
                const dateA = a.dataset.expiryDate || "9999-12-31";
                const dateB = b.dataset.expiryDate || "9999-12-31";
                if (dateA !== dateB) return dateA.localeCompare(dateB);
            }

            return Number(a.dataset.rowIndex || 0) - Number(b.dataset.rowIndex || 0);
        });

        // Gérer le message "Aucun ingrédient trouvé"
        const noDataRow = allRows.find(row => row.textContent.includes("Aucun ingrédient trouvé."));
        if (rows.length === 0) {
            if (noDataRow) noDataRow.style.display = "";
        } else {
            if (noDataRow) noDataRow.style.display = "none";
        }

        currentPage = 1;
        renderTable();
    }

    searchInput.addEventListener('input', applyFilters);
    if (fefoFilter) {
        fefoFilter.addEventListener("change", applyFilters);
    }
    if (expiryDateFilter) {
        expiryDateFilter.addEventListener("change", applyFilters);
    }

    addButton.addEventListener('click', function () {
        const tableRows = tableBody.getElementsByTagName('tr');

        // Tableau plat pour toutes les premières cellules
        let itemsData = Array.from(tableRows).map(row => {
            const firstCell = row.getElementsByTagName('td')[0];
            return firstCell ? firstCell.textContent.trim() : null;
        });

        // HTML du modal
        modalContainer.innerHTML = `
    
            <div
                role="dialog"
                aria-describedby="radix-_r_c_"
                aria-labelledby="radix-_r_b_"
                data-state="open"
                data-slot="dialog-content"
                class="modal-custom bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]"
                tabindex="-1"
                style="pointer-events: auto"
                >
                <div
                    data-slot="dialog-header"
                    class="flex flex-col gap-2 text-center sm:text-left"
                >
                    <h2
                    data-slot="dialog-title"
                    class="text-lg leading-none font-semibold"
                    >
                    Ajouter un ingrédient
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="addForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="add">
                    <div class="space-y-2">
                    <label
                        data-slot="label"
                        class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                        for="name"
                        >Nom de l’ingrédient</label
                    ><input
                        data-slot="input"
                        class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                        id="name"
                        name="name"
                        required=""
                        type="text"
                        
                    />
                    </div>
                    <div class="space-y-2">
                        <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="linked_product"
                            >Produit Achat & Revente (optionnel)</label
                        >
                        <select
                            id="linked_product"
                            name="linked_product"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                            <option value="">Aucun</option>
                            ${saleProductsData.map((p) => `<option value="${p.id}">${p.name}</option>`).join("")}
                        </select>
                        <p class="text-xs text-muted-foreground">Si sélectionné, ce stock alimente le POS (Achat & Revente).</p>
                    </div>
                    <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="unit"
                            >Unité</label
                            ><select
                            id="unit"
                            name="unit"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                                <option value="kg">Kilogramme (kg)</option>
                                <option value="g">Gramme (g)</option>
                                <option value="mg">Milligramme (mg)</option>
                                <option value="L">Litre (L)</option>
                                <option value="dl">Décilitre (dl)</option>
                                <option value="cl">Centilitre (cl)</option>
                                <option value="ml">Millilitre (ml)</option>
                                <option value="pce">Pièce (pce)</option>
                                <option value="unite">Unité (u)</option>
                                <option value="sachet">Sachet</option>
                                <option value="paquet">Paquet</option>
                                <option value="bte">Boîte (bte)</option>
                                <option value="carton">Carton</option>
                                <option value="bouteille">Bouteille</option>
                                <option value="bidon">Bidon</option>
                                <option value="barquette">Barquette</option>
                                <option value="plateau">Plateau</option>
                                <option value="rouleau">Rouleau</option>
                                <option value="portion">Portion</option>
                                <option value="tranche">Tranche</option>
                                <option value="botte">Botte</option>
                                <option value="cube">Cube</option>
                                <option value="bande">Bande</option>
                                <option value="boule">Boule</option>
                            </select>
                        </div>
                    <div class="space-y-2">
                        <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="stock_mode"
                            >Mode de stock</label
                        >
                        <select
                            id="stock_mode"
                            name="stock_mode"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                            <option value="NORMAL" selected>Normal (sans expiration)</option>
                            <option value="FEFO">FEFO (expiration obligatoire)</option>
                        </select>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                                data-slot="label"
                                class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                                for="current_stock"
                                >Stock Initial</label
                            ><input
                                data-slot="input"
                                class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                                id="current_stock"
                                name="current_stock"
                                required=""
                                type="text"
                                inputmode="decimal"
                                placeholder="Ex: 5 ou 5,5"
                            />
                        </div>
                        <div class="space-y-2">
                            <label
                                data-slot="label"
                                class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                                for="min_stock"
                                >Stock Minimum</label
                            ><input
                                data-slot="input"
                                class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                                id="min_stock"
                                name="min_stock"
                                required=""
                                type="text"
                                inputmode="decimal"
                                placeholder="Ex: 2 ou 2,5"
                            />
                        </div>
                    </div>
                    <div class="space-y-2 hidden" id="initial-expiry-field">
                        <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="initial_expiry"
                            >Date d’expiration (stock initial)</label
                        >
                        <input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            id="initial_expiry"
                            name="initial_expiry"
                            type="date"
                        />
                        <p class="text-xs text-muted-foreground">Obligatoire si le mode FEFO et un stock initial sont saisis.</p>
                    </div>
                    <div
                    data-slot="dialog-footer"
                    class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
                    >
                    <button
                        data-slot="button"
                        class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[&gt;svg]:px-3"
                        type="submit"
                    >
                        Enregistrer
                    </button>
                    </div>
                </form>
                <button
                    type="button"
                    data-slot="dialog-close"
                    id="closeModal"
                    class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4"
                >
                    <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="lucide lucide-x"
                    >
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path></svg
                    ><span class="sr-only">Close</span>
                </button>
            </div>

        `;
        const modal = document.getElementById('addModal');
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('addForm');
        const nameInput = document.getElementById('name');
        const linkedProductSelect = document.getElementById('linked_product');
        const stockModeSelect = document.getElementById('stock_mode');
        const currentStockInput = document.getElementById('current_stock');
        const minStockInput = document.getElementById('min_stock');
        const expiryField = document.getElementById('initial-expiry-field');
        const expiryInput = document.getElementById('initial_expiry');
        // Fermer le modal
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });

        function refreshExpiryField() {
            if (!stockModeSelect || !currentStockInput || !expiryField || !expiryInput) return;
            const isFefo = stockModeSelect.value === "FEFO";
            const hasStock = parseFlexibleDecimalValue(currentStockInput.value || 0) > 0;
            if (isFefo) {
                expiryField.classList.remove("hidden");
                expiryInput.required = hasStock;
            } else {
                expiryField.classList.add("hidden");
                expiryInput.required = false;
                expiryInput.value = "";
            }
        }

        if (stockModeSelect) {
            stockModeSelect.addEventListener("change", refreshExpiryField);
        }
        if (currentStockInput) {
            currentStockInput.addEventListener("input", refreshExpiryField);
            currentStockInput.addEventListener("blur", () => {
                validateDecimalField(currentStockInput, "Entrez un nombre valide, par exemple 5 ou 5,5.");
                refreshExpiryField();
            });
        }
        if (minStockInput) {
            minStockInput.addEventListener("blur", () => {
                validateDecimalField(minStockInput, "Entrez un nombre valide, par exemple 2 ou 2,5.");
            });
        }
        refreshExpiryField();

        let lastLinkedName = "";
        if (linkedProductSelect) {
            linkedProductSelect.addEventListener("change", () => {
                const selectedOption = linkedProductSelect.options[linkedProductSelect.selectedIndex];
                const selectedName = selectedOption && selectedOption.value ? selectedOption.textContent.trim() : "";
                if (!nameInput.value.trim() || nameInput.value.trim() === lastLinkedName) {
                    if (selectedName) {
                        nameInput.value = selectedName;
                    }
                }
                lastLinkedName = selectedName;
            });
        }

        function clearNameError() {
            nameInput.classList.remove("border-red-500");
            const oldError = form.querySelector("#name-error");
            if (oldError) oldError.remove();
        }
        nameInput.addEventListener("input", clearNameError);

        form.addEventListener('submit', function (e) {
            e.preventDefault(); // Empêche l'envoi immédiat
            clearNameError();
            const stockOk = validateDecimalField(currentStockInput, "Entrez un nombre valide pour le stock initial.");
            const minOk = validateDecimalField(minStockInput, "Entrez un nombre valide pour le stock minimum.");
            if (!stockOk || !minOk) {
                return;
            }
            const enteredName = nameInput.value.trim().toLowerCase();
            // Suppression des anciens messages d’erreur
            form.querySelectorAll('.error-msg').forEach(el => el.remove());
            const nameExists = itemsData.some(n => n.toLowerCase() === enteredName);
            if (nameExists) {

                // Ajouter bordure rouge
                nameInput.classList.add("border-red-500");

                // Ajouter message d’erreur
                const errorMsg = document.createElement("p");
                errorMsg.id = "name-error";
                errorMsg.className = "error-msg text-red-600 text-sm mt-1";
                errorMsg.textContent = "Ce produit existe déjà.";
                nameInput.insertAdjacentElement("afterend", errorMsg);

                return; // ne pas soumettre
            }

            // Envoyer le formulaire
            form.submit();
        });

    });
    stockInButton.addEventListener('click', function () {
        const type = stockInButton.getAttribute('data-type');
        stockInventory(type);
    });
    stockOutButton.addEventListener('click', function () {
        const type = stockOutButton.getAttribute('data-type');
        stockInventory(type);
    });
    tableBody.addEventListener('click', function (event) {
        const deleteBtn = event.target.closest('.delete-button');
        if (deleteBtn) {
            const inventoryId = deleteBtn.getAttribute('data-id');
            deleteInventory(inventoryId);
        }
        const changeBtn = event.target.closest('.change-button');
        if (changeBtn) {
            const inventoryId = changeBtn.getAttribute('data-id');
            fetch(`/inventory/${inventoryId}/get/`)
                .then(window.safeJson)
                .then(data => {
                    if (data.success) {
                        changeInventory(data.inventory, inventoryId);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération de l'ingrédient :", err);
                });
        }
    });

    function deleteInventory(inventoryId) {
        modalContainer.innerHTML = `
            <div
                role="dialog"
                aria-describedby="radix-_r_c_"
                aria-labelledby="radix-_r_b_"
                data-state="open"
                data-slot="dialog-content"
                class="modal-custom bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]"
                tabindex="-1"
                style="pointer-events: auto"
                >
                <div
                    data-slot="dialog-header"
                    class="flex flex-col gap-2 text-center sm:text-left"
                >
                    <h2
                    data-slot="dialog-title"
                    class="text-lg leading-none font-semibold"
                    >
                    Confirmer la suppression
                    </h2>
                </div>
                <div class="grid gap-4 py-4">
                    <p class="flex items-center text-sm font-medium text-primary">Êtes-vous sûr de vouloir supprimer cet ingrédient ? Cette action est irréversible.</p>
                    <div
                    data-slot="dialog-footer"
                    class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
                    >
                    <button
                        id="confirmDelete"
                        data-slot="button"
                        class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[&gt;svg]:px-3"
                        type="button"
                    >
                        Supprimer
                    </button>
                    </div>
                </div>
                <button
                    type="button"
                    data-slot="dialog-close"
                    id="closeModal"
                    class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4"
                >
                    <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="lucide lucide-x"
                    >
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path></svg
                    ><span class="sr-only">Close</span>
                </button>
                </div>
        `;
        const modal = document.getElementById('deleteModal');
        const closeModal = document.getElementById('closeModal');
        const confirmDelete = document.getElementById('confirmDelete');
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        confirmDelete.addEventListener('click', () => {
            window.location.href = `/inventory/${inventoryId}/delete/`;
        });
    }

    function changeInventory(inventory, inventoryId) {

        const tableRows = tableBody.getElementsByTagName('tr');

        // Tableau plat pour toutes les premières cellules
        let itemsData = Array.from(tableRows).map(row => {
            const firstCell = row.getElementsByTagName('td')[0];
            return firstCell ? firstCell.textContent.trim() : null;
        });
        itemsData = itemsData.filter(n => n.toLowerCase() !== inventory.name.toLowerCase());
        // HTML du modal
        modalContainer.innerHTML = `
    
            <div
                role="dialog"
                aria-describedby="radix-_r_c_"
                aria-labelledby="radix-_r_b_"
                data-state="open"
                data-slot="dialog-content"
                class="modal-custom bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]"
                tabindex="-1"
                style="pointer-events: auto"
                >
                <div
                    data-slot="dialog-header"
                    class="flex flex-col gap-2 text-center sm:text-left"
                >
                    <h2
                    id="radix-_r_b_"
                    data-slot="dialog-title"
                    class="text-lg leading-none font-semibold"
                    >
                        Changer l'ingrédient
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="changeForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="change">
                    <input type="hidden" name="inventory_id" value="${inventoryId}">
                    <div class="p-4 bg-muted rounded-lg text-center">
                        <p class="text-sm text-muted-foreground">Stock Actuel</p>
                        <p class="text-2xl font-bold">${inventory.current_stock} ${inventory.unit}</p>
                    </div>
                    <div class="space-y-2">
                    <label
                        data-slot="label"
                        class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                        for="name"
                        >Nom de l’ingrédient</label
                    ><input
                        data-slot="input"
                        class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                        id="name"
                        name="name"
                        required=""
                        type="text"
                        value="${inventory.name}"
                    />
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="unit"
                            >Unité</label
                            ><select
                            id="unit"
                            name="unit"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                                <option value="kg" ${inventory.unit === "kg" ? "selected" : ""}>Kilogramme (kg)</option>
                                <option value="g" ${inventory.unit === "g" ? "selected" : ""}>Gramme (g)</option>
                                <option value="mg" ${inventory.unit === "mg" ? "selected" : ""}>Milligramme (mg)</option>
                                <option value="L" ${inventory.unit === "L" ? "selected" : ""}>Litre (L)</option>
                                <option value="dl" ${inventory.unit === "dl" ? "selected" : ""}>Décilitre (dl)</option>
                                <option value="cl" ${inventory.unit === "cl" ? "selected" : ""}>Centilitre (cl)</option>
                                <option value="ml" ${inventory.unit === "ml" ? "selected" : ""}>Millilitre (ml)</option>
                                <option value="pce" ${inventory.unit === "pce" ? "selected" : ""}>Pièce (pce)</option>
                                <option value="unite" ${inventory.unit === "unite" ? "selected" : ""}>Unité (u)</option>
                                <option value="sachet" ${inventory.unit === "sachet" ? "selected" : ""}>Sachet</option>
                                <option value="paquet" ${inventory.unit === "paquet" ? "selected" : ""}>Paquet</option>
                                <option value="bte" ${inventory.unit === "bte" ? "selected" : ""}>Boîte (bte)</option>
                                <option value="carton" ${inventory.unit === "carton" ? "selected" : ""}>Carton</option>
                                <option value="bouteille" ${inventory.unit === "bouteille" ? "selected" : ""}>Bouteille</option>
                                <option value="bidon" ${inventory.unit === "bidon" ? "selected" : ""}>Bidon</option>
                                <option value="barquette" ${inventory.unit === "barquette" ? "selected" : ""}>Barquette</option>
                                <option value="plateau" ${inventory.unit === "plateau" ? "selected" : ""}>Plateau</option>
                                <option value="rouleau" ${inventory.unit === "rouleau" ? "selected" : ""}>Rouleau</option>
                                <option value="portion" ${inventory.unit === "portion" ? "selected" : ""}>Portion</option>
                                <option value="tranche" ${inventory.unit === "tranche" ? "selected" : ""}>Tranche</option>
                                <option value="botte" ${inventory.unit === "botte" ? "selected" : ""}>Botte</option>
                                <option value="cube" ${inventory.unit === "cube" ? "selected" : ""}>Cube</option>
                                <option value="bande" ${inventory.unit === "bande" ? "selected" : ""}>Bande</option>
                                <option value="boule" ${inventory.unit === "boule" ? "selected" : ""}>Boule</option>
                            </select>
                        </div>
                        <div class="space-y-2">
                            <label
                                data-slot="label"
                                class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                                for="min_stock"
                                >Stock Minimum</label
                            ><input
                                data-slot="input"
                                class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                                id="min_stock"
                                name="min_stock"
                                required=""
                                type="text"
                                inputmode="decimal"
                                value="${inventory.min_stock}"
                            />
                        </div>
                    </div>
                    ${String(inventory.stock_mode || "").toUpperCase() === "FEFO" ? `
                        <div class="rounded-lg border p-3 space-y-3 bg-muted/30">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-sm font-semibold">Lots FEFO</p>
                                    <p class="text-xs text-muted-foreground">Modifiez les dates d’expiration si besoin.</p>
                                </div>
                                <button type="button" id="save-fefo-lots" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3">
                                    Enregistrer dates
                                </button>
                            </div>
                            <div id="fefo-lots-body" class="text-sm text-muted-foreground">Chargement...</div>
                        </div>
                    ` : ""}
                    <div
                    data-slot="dialog-footer"
                    class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
                    >
                    <button
                        data-slot="button"
                        class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[&gt;svg]:px-3"
                        type="submit"
                    >
                        Enregistrer
                    </button>
                    </div>
                </form>
                <button
                    type="button"
                    data-slot="dialog-close"
                    id="closeModal"
                    class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4"
                >
                    <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="lucide lucide-x"
                    >
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path></svg
                    ><span class="sr-only">Close</span>
                </button>
            </div>

        `;
        const modal = document.getElementById('changeModal');
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('changeForm');
        const nameInput = document.getElementById('name');
        const linkedProductSelect = document.getElementById('linked_product');
        const minStockInput = document.getElementById('min_stock');
        const fefoLotsBody = document.getElementById("fefo-lots-body");
        const saveFefoLotsBtn = document.getElementById("save-fefo-lots");
        // Fermer le modal
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });

        function clearNameError() {
            nameInput.classList.remove("border-red-500");
            const oldError = form.querySelector("#name-error");
            if (oldError) oldError.remove();
        }
        nameInput.addEventListener("input", clearNameError);
        if (minStockInput) {
            minStockInput.addEventListener("blur", () => {
                validateDecimalField(minStockInput, "Entrez un nombre valide, par exemple 2 ou 2,5.");
            });
        }

        if (linkedProductSelect) {
            linkedProductSelect.addEventListener("change", () => {
                const selectedOption = linkedProductSelect.options[linkedProductSelect.selectedIndex];
                const selectedName = selectedOption && selectedOption.value ? selectedOption.textContent.trim() : "";
                if (!nameInput.value.trim()) {
                    nameInput.value = selectedName;
                }
            });
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault(); // Empêche l'envoi immédiat
            clearNameError();
            const minOk = validateDecimalField(minStockInput, "Entrez un nombre valide pour le stock minimum.");
            if (!minOk) {
                return;
            }
            const enteredName = nameInput.value.trim().toLowerCase();
            // Suppression des anciens messages d’erreur
            form.querySelectorAll('.error-msg').forEach(el => el.remove());
            const nameExists = itemsData.some(n => n.toLowerCase() === enteredName);
            if (nameExists) {

                // Ajouter bordure rouge
                nameInput.classList.add("border-red-500");

                // Ajouter message d’erreur
                const errorMsg = document.createElement("p");
                errorMsg.id = "name-error";
                errorMsg.className = "error-msg text-red-600 text-sm mt-1";
                errorMsg.textContent = "Ce produit existe déjà.";
                nameInput.insertAdjacentElement("afterend", errorMsg);

                return; // ne pas soumettre
            }

            // Envoyer le formulaire
            form.submit();
        });

        if (fefoLotsBody) {
            fetch(`/inventory/${inventoryId}/lots/`)
                .then(window.safeJson)
                .then((data) => {
                    if (!data || !data.success) {
                        fefoLotsBody.textContent = "Aucun lot disponible.";
                        return;
                    }
                    if (!data.lots || !data.lots.length) {
                        fefoLotsBody.innerHTML = "<div class='py-2 text-muted-foreground'>Aucun lot enregistré.</div>";
                        return;
                    }
                    const rows = data.lots.map((lot) => {
                        const exp = lot.expiration_date ? lot.expiration_date.slice(0, 10) : "";
                        return `
                            <div class="grid grid-cols-4 gap-2 items-center py-1 border-b border-border/60">
                                <div class="text-xs text-muted-foreground">Lot #${lot.id}</div>
                                <input type="date" data-lot-id="${lot.id}" value="${exp}" class="border-input h-8 rounded-md border bg-transparent px-2 text-xs" />
                                <div class="text-xs">${lot.quantity} ${data.unit || ""}</div>
                                <div class="text-xs text-muted-foreground">${formatDateShort(lot.received_at)}</div>
                            </div>
                        `;
                    }).join("");
                    fefoLotsBody.innerHTML = `
                        <div class="grid grid-cols-4 gap-2 text-[11px] uppercase tracking-wide text-muted-foreground pb-1">
                            <span>Lot</span><span>Expiration</span><span>Quantité</span><span>Reçu</span>
                        </div>
                        ${rows}
                    `;
                })
                .catch(() => {
                    fefoLotsBody.textContent = "Impossible de charger les lots.";
                });
        }

        if (saveFefoLotsBtn) {
            saveFefoLotsBtn.addEventListener("click", async () => {
                const inputs = modalContainer.querySelectorAll("[data-lot-id]");
                const lotsPayload = Array.from(inputs).map((input) => ({
                    id: input.getAttribute("data-lot-id"),
                    expiration_date: input.value || null,
                }));
                try {
                    const res = await fetch(`/inventory/${inventoryId}/lots/update/`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-CSRFToken": csrfToken.value,
                        },
                        body: JSON.stringify({ lots: lotsPayload }),
                    });
                    const data = await window.safeJson(res);
                    if (!data || !data.success) {
                        throw new Error((data && data.error) || "Impossible de sauvegarder.");
                    }
                    openInfoModal({
                        title: "Lots mis à jour",
                        message: "Les dates d’expiration ont été enregistrées.",
                        tone: "success",
                    });
                } catch (error) {
                    openInfoModal({
                        title: "Erreur",
                        message: error.message || "Impossible de sauvegarder les lots.",
                        tone: "error",
                    });
                }
            });
        }
    }
    function stockInventory(type) {
        let title = type === "in" ? "Entrée de stock" : "Sortie de stock";
        let chosen = type === "in" ? "Ajouter du stock" : "Retirer du stock";
        const todayStr = new Date().toISOString().slice(0, 10);
        const dateField = type === "out" ? `
            <div class="space-y-2">
                <label
                data-slot="label"
                class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                for="movement_date"
                >Date de sortie</label
                >
                <input
                    type="date"
                    id="movement_date"
                    name="movement_date"
                    value="${todayStr}"
                    required
                    class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                />
            </div>
        ` : "";
        let optionsHTML = inventoriesData.map(item => {
            const modeLabel = String(item.stock_mode || "").toUpperCase() === "FEFO" ? " • FEFO" : "";
            return `
                <option value="${item.id}" title="${item.name}">${item.name} (${item.current_stock} ${item.unit}${modeLabel})</option>
            `;
        }).join('');
        let assigned_to = type === "in" ? "" : `
            <div class="space-y-2">
                <label
                data-slot="label"
                class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                for="assigned_to"
                >Remis a</label
                >
                <input type="text" id="assigned_to" name="assigned_to" class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
            </div>
        `;
        let destinationField = type === "in" ? "" : `
            <div class="space-y-2">
                <label
                data-slot="label"
                class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                for="destination"
                >Destination</label
                >
                <select
                    id="destination"
                    name="destination"
                    class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                    required
                >
                    <option value="" disabled selected>Choisir une destination</option>
                    <option value="POS">Comptoir (POS)</option>
                    <option value="BAKERY">Mini-Four (Boulangerie)</option>
                    <option value="CUISINE">Cuisine</option>
                    <option value="AUTRE">Autre</option>
                </select>
            </div>
        `;
        modalContainer.innerHTML = `
    
            <div
                role="dialog"
                aria-describedby="radix-_r_c_"
                aria-labelledby="radix-_r_b_"
                data-state="open"
                data-slot="dialog-content"
                class="modal-custom bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]"
                tabindex="-1"
                style="pointer-events: auto"
                >
                <div
                    data-slot="dialog-header"
                    class="flex flex-col gap-2 text-center sm:text-left"
                >
                    <h2
                    data-slot="dialog-title"
                    class="text-lg leading-none font-semibold"
                    >
                        ${title}
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="stockForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="${type}">
                    ${assigned_to}
                    ${destinationField}
                    ${dateField}
                    <div class="space-y-2">
                        <label
                        data-slot="label"
                        class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                        for="material"
                        >Ingrédient</label
                        ><select
                        id="material"
                        class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                            <option value="" selected disabled>----- Veuillez selectionnez un ingrédient -----</option>
                            ${optionsHTML}
                        </select>
                    </div>
                    <div class="space-y-2">
                        <div class="form-extra">
                            <div class="available">
                                <div class="leading-none font-semibold">Matières premières</div>
                                <div class="liste-extra">
                                    <select multiple name="aut_ch" id="aut_ch">

                                    </select>
                                </div>
                            </div>
                            <div class="chosen">
                                <div class="leading-none font-semibold">${chosen}</div>
                                <div class="liste-extra">
                                    <div id="aut_rem" class="planned-quantity">
                                        
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div
                    data-slot="dialog-footer"
                    class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
                    >
                    <button
                        data-slot="button"
                        class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[&gt;svg]:px-3"
                        type="submit"
                    >
                        Enregistrer
                    </button>
                    </div>
                </form>
                <button
                    type="button"
                    data-slot="dialog-close"
                    id="closeModal"
                    class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4"
                >
                    <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="lucide lucide-x"
                    >
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path></svg
                    ><span class="sr-only">Close</span>
                </button>
            </div>

        `;
        const modal = document.getElementById('stockModal');
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('stockForm');
        const material = document.getElementById('material');
        const sourceSelect = document.getElementById('aut_ch');
        const destination = document.getElementById('aut_rem');
        const quantityInputStyle = `
            width: 100%;
            color: #334155;
            font-size: 13px;
            font-family: "Inter", sans-serif;
            font-weight: 400;
            padding: 6px;
            padding-top: 2.5px;
            padding-bottom: 2.5px;
            border-radius: 8px;
            margin-bottom: 4px;
            cursor: pointer;
            transition: all 0.2s ease;
            background: white;
            border: 1px solid #22638c;
        `;

        material.addEventListener('change', () => {
            const selectedOptions = Array.from(material.selectedOptions);
            selectedOptions.forEach(option => {
                // Ajouter dans le multiselect "aut_ch"
                sourceSelect.appendChild(option);
                option.selected = true;

                const wrapper = document.createElement('div');
                wrapper.className = "inventory-qty-row";
                wrapper.style.display = "grid";
                wrapper.style.gridTemplateColumns = "1fr 1fr";
                wrapper.style.gap = "8px";
                wrapper.style.marginBottom = "6px";

                // Ajouter un champ quantité correspondant dans "aut_rem"
                const quantityInput = document.createElement('input');
                quantityInput.type = 'number';
                quantityInput.name = 'quantity[]';
                quantityInput.required = true;
                quantityInput.placeholder = `${option.textContent} quantité`;
                quantityInput.style.cssText = quantityInputStyle; // appliquer le style pro
                wrapper.appendChild(quantityInput);

                const inventory = inventoryById.get(option.value);
                const isFefo = inventory && String(inventory.stock_mode || "").toUpperCase() === "FEFO";
                const expiryInput = document.createElement('input');
                expiryInput.type = 'date';
                expiryInput.name = 'expiry_date[]';
                expiryInput.style.cssText = quantityInputStyle;
                expiryInput.placeholder = "Expiration";
                expiryInput.setAttribute("aria-label", "Date d’expiration");
                expiryInput.title = "Date d’expiration";
                if (type === "in" && isFefo) {
                    expiryInput.required = true;
                } else {
                    expiryInput.required = false;
                    expiryInput.type = "hidden";
                }
                wrapper.appendChild(expiryInput);

                destination.appendChild(wrapper);
            });

            // Reset du select initial
            material.value = "";
        });

        // Fermer le modal
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        form.addEventListener('submit', function (e) {
            e.preventDefault();

            form.submit();
        });
    }

    let allRows = Array.from(document.querySelectorAll("#inventoryTable tbody tr"));
    allRows.forEach((row, index) => {
        row.dataset.rowIndex = index;
    });
    let rows = allRows.filter(row => !row.textContent.includes("Aucun ingrédient trouvé."));

    function formatDateShort(iso) {
        if (!iso) return "-";
        const parts = iso.split("T")[0].split("-");
        if (parts.length !== 3) return iso;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    function computeExpiryStatus(isoDate) {
        if (!isoDate) return { label: "OK", color: "text-green-600" };
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const exp = new Date(isoDate);
        exp.setHours(0, 0, 0, 0);
        const diff = Math.floor((exp - today) / (1000 * 60 * 60 * 24));
        if (diff < 0) return { label: "Expiré", color: "text-red-600" };
        if (diff <= 21) return { label: "Expire bientôt", color: "text-orange-500" };
        return { label: "OK", color: "text-green-600" };
    }

    function openLotsModal(inventoryId) {
        modalContainer.innerHTML = `
            <div role="dialog" aria-describedby="lots-desc" aria-labelledby="lots-title" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[640px]" tabindex="-1" style="pointer-events: auto">
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 id="lots-title" data-slot="dialog-title" class="text-lg leading-none font-semibold">Lots FEFO</h2>
                    <p id="lots-desc" class="text-sm text-muted-foreground">Chargement des lots...</p>
                </div>
                <div class="min-h-[120px]"></div>
                <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" id="close-lots" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                        Fermer
                    </button>
                </div>
            </div>
        `;

        const closeBtn = document.getElementById("close-lots");
        closeBtn.addEventListener("click", () => {
            modalContainer.innerHTML = "";
        });

        fetch(`/inventory/${inventoryId}/lots/`)
            .then(res => res.json())
            .then(data => {
                if (!data.success) {
                    openInfoModal({
                        title: "Erreur",
                        message: data.error || "Impossible de charger les lots.",
                        tone: "error",
                    });
                    modalContainer.innerHTML = "";
                    return;
                }
                const title = document.getElementById("lots-title");
                const desc = document.getElementById("lots-desc");
                if (title) title.textContent = `Lots FEFO — ${data.name}`;
                if (desc) desc.textContent = `Unité : ${data.unit}`;
                const body = desc.parentElement.nextElementSibling;
                const rowsHtml = (data.lots || []).map((lot) => {
                    const status = computeExpiryStatus(lot.expiration_date);
                    const badgeClass = status.label === "Expiré"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : status.label === "Expire bientôt"
                            ? "border-orange-200 bg-orange-50 text-orange-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700";
                    return `
                        <tr class="border-b">
                            <td class="py-2 px-2 text-sm">${lot.id}</td>
                            <td class="py-2 px-2 text-sm">${formatDateShort(lot.expiration_date)}</td>
                            <td class="py-2 px-2 text-sm font-medium">${lot.quantity} ${data.unit}</td>
                            <td class="py-2 px-2 text-sm">${formatDateShort(lot.received_at)}</td>
                            <td class="py-2 px-2 text-sm">
                                <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${badgeClass}">
                                    ${status.label}
                                </span>
                            </td>
                        </tr>
                    `;
                }).join("");

                body.innerHTML = `
                    <div class="rounded-lg border overflow-hidden">
                        <table class="w-full text-sm">
                            <thead class="bg-muted/50">
                                <tr>
                                    <th class="text-left px-2 py-2">Lot</th>
                                    <th class="text-left px-2 py-2">Expiration</th>
                                    <th class="text-left px-2 py-2">Quantité</th>
                                    <th class="text-left px-2 py-2">Reçu le</th>
                                    <th class="text-left px-2 py-2">Statut</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml || "<tr><td colspan='5' class='py-6 text-center text-sm text-muted-foreground'>Aucun lot disponible.</td></tr>"}
                            </tbody>
                        </table>
                    </div>
                `;
            })
            .catch(() => {
                modalContainer.innerHTML = "";
                openInfoModal({
                    title: "Erreur",
                    message: "Impossible de charger les lots.",
                    tone: "error",
                });
            });
    }

    document.querySelectorAll(".lots-button").forEach((btn) => {
        btn.addEventListener("click", () => {
            const inventoryId = btn.getAttribute("data-id");
            if (inventoryId) {
                openLotsModal(inventoryId);
            }
        });
    });

    const rowsPerPage = 10;
    let currentPage = 1;

    const paginationInfo = document.querySelector("#pagination .text-muted-foreground");
    const pageNumberLabel = document.querySelector("#pagination .page-number");
    const prevBtn = document.querySelector('#pagination button:first-child');
    const nextBtn = document.querySelector('#pagination button:last-child');

    function renderTable() {
        const totalRows = rows.length;
        const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

        // Masquer toutes les lignes
        allRows.forEach(row => row.style.display = "none");

        // Si 0 résultat
        if (totalRows === 0) {
            // afficher la ligne Aucun ingrédient trouvé."
            const noDataRow = allRows.find(row => row.textContent.includes("Aucun ingrédient trouvé."));
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
        const start = (currentPage - 1) * rowsPerPage;
        const end = Math.min(start + rowsPerPage, totalRows);

        for (let i = start; i < end; i++) {
            rows[i].style.display = "";
        }

        // MAJ textes
        paginationInfo.textContent = `Affichage de ${start + 1} à ${end} sur ${totalRows} résultats`;
        pageNumberLabel.textContent = `Page ${currentPage} sur ${totalPages}`;

        // Buttons
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages;
    }

    prevBtn.addEventListener("click", () => {
        currentPage--;
        renderTable();
    });

    nextBtn.addEventListener("click", () => {
        currentPage++;
        renderTable();
    });

    applyFilters();
});

document.addEventListener("DOMContentLoaded", function () {
    const modalContainer = document.getElementById("modalContainer");
    const shiftTable = document.getElementById("shiftTable");
    const shiftBody = shiftTable ? shiftTable.querySelector("tbody") : null;
    const shiftCashiersEl = document.getElementById("shift-cashiers-json");
    let shiftCashiers = [];
    const csrfToken = document.querySelector("[name=csrfmiddlewaretoken]");
    const dateFilter = document.getElementById("shiftDateFilter");
    const shiftFilter = document.getElementById("shiftFilter");
    const cashierFilter = document.getElementById("shiftCashierFilter");
    const statusFilter = document.getElementById("shiftStatusFilter");

    if (!shiftTable || !shiftBody) {
        return;
    }

    const rowsPerPage = 10;
    const noDataRows = Array.from(shiftBody.querySelectorAll(".shift-no-data-row"));
    const dataRows = Array.from(shiftBody.querySelectorAll("tr[data-report-id]"));
    let filteredRows = [...dataRows];
    let currentPage = 1;

    const paginationInfo = document.querySelector("#shiftPagination .text-muted-foreground");
    const pageNumberLabel = document.querySelector("#shiftPagination .page-number");
    const prevBtn = document.querySelector("#shiftPagination button:first-child");
    const nextBtn = document.querySelector("#shiftPagination button:last-child");

    if (shiftCashiersEl) {
        try {
            const parsed = JSON.parse(shiftCashiersEl.textContent || "[]");
            if (Array.isArray(parsed)) {
                shiftCashiers = parsed;
            } else if (typeof parsed === "string") {
                const nested = JSON.parse(parsed || "[]");
                shiftCashiers = Array.isArray(nested) ? nested : [];
            }
        } catch (error) {
            console.error("Impossible de lire les caissières de shift", error);
            shiftCashiers = [];
        }
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
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
                            <input type="date" name="shift_date" value="${escapeHtml(report.shift_date)}" class="file:text-foreground placeholder:text-muted-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none" required />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium">Shift</label>
                            <select name="shift" class="file:text-foreground placeholder:text-muted-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none">
                                <option value="MATIN" ${report.shift === "MATIN" ? "selected" : ""}>Matin</option>
                                <option value="SOIR" ${report.shift === "SOIR" ? "selected" : ""}>Soir</option>
                            </select>
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium">Caissière</label>
                        <select name="cashier_id" class="file:text-foreground placeholder:text-muted-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none">
                            ${cashierOptions}
                        </select>
                    </div>
                    <div class="grid gap-4 sm:grid-cols-2">
                        <div class="space-y-2">
                            <label class="text-sm font-medium">Ouvert à</label>
                            <input type="datetime-local" name="opened_at" value="${escapeHtml(report.opened_at)}" class="file:text-foreground placeholder:text-muted-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none" required />
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium">Clôturé à</label>
                            <input type="datetime-local" name="closed_at" value="${escapeHtml(report.closed_at)}" class="file:text-foreground placeholder:text-muted-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none" />
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium">Note</label>
                        <input type="text" name="note" value="${escapeHtml(report.note || "")}" class="file:text-foreground placeholder:text-muted-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none" />
                    </div>
                    <div class="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                        <div class="font-medium text-foreground">Lignes liées à ce shift</div>
                        <div class="mt-2 flex flex-wrap gap-2">
                            <span class="rounded-full bg-background px-2.5 py-1">Remises ${report.remises_count}</span>
                            <span class="rounded-full bg-background px-2.5 py-1">Abîmés ${report.abimes_count}</span>
                            <span class="rounded-full bg-background px-2.5 py-1">Consommations ${report.consumptions_count}</span>
                            <span class="rounded-full bg-background px-2.5 py-1">Dépenses ${report.expenses_count}</span>
                        </div>
                    </div>
                    <p id="shiftManageError" class="hidden text-sm text-red-600"></p>
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

    function openDeleteModal(report) {
        modalContainer.innerHTML = `
            <div role="dialog" data-state="open" data-slot="dialog-content" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border p-6 shadow-lg duration-200 sm:max-w-[460px]" tabindex="-1" style="pointer-events: auto">
                <div class="space-y-2">
                    <h2 class="text-lg font-semibold">Confirmer la suppression</h2>
                    <p class="text-sm text-muted-foreground">
                        Vous allez supprimer le shift <span class="font-medium text-foreground">${escapeHtml(report.shift_date_label)} · ${escapeHtml(report.shift)}</span>.
                        Cette action efface aussi toutes les lignes liées.
                    </p>
                </div>
                <div class="rounded-xl border bg-red-50/60 p-4 text-sm">
                    <div class="font-medium text-red-700">Impact de la suppression</div>
                    <div class="mt-2 flex flex-wrap gap-2 text-red-700">
                        <span class="rounded-full bg-white px-2.5 py-1">Remises ${report.remises_count}</span>
                        <span class="rounded-full bg-white px-2.5 py-1">Abîmés ${report.abimes_count}</span>
                        <span class="rounded-full bg-white px-2.5 py-1">Consommations ${report.consumptions_count}</span>
                        <span class="rounded-full bg-white px-2.5 py-1">Dépenses ${report.expenses_count}</span>
                    </div>
                </div>
                <div class="flex justify-end gap-2">
                    <button type="button" id="shiftDeleteCancel" class="inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm hover:bg-accent">Annuler</button>
                    <button type="button" id="shiftDeleteConfirm" class="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Supprimer</button>
                </div>
                <button type="button" id="shiftDeleteClose" class="absolute right-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                        <path d="M18 6 6 18"></path>
                        <path d="m6 6 12 12"></path>
                    </svg>
                    <span class="sr-only">Fermer</span>
                </button>
            </div>
        `;

        const closeModal = () => {
            modalContainer.innerHTML = "";
        };

        document.getElementById("shiftDeleteCancel")?.addEventListener("click", closeModal);
        document.getElementById("shiftDeleteClose")?.addEventListener("click", closeModal);
        document.getElementById("shiftDeleteConfirm")?.addEventListener("click", async () => {
            try {
                const response = await fetch(`/pos/shift/${report.id}/delete/`, {
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
        });
    }

    function applyFilters() {
        const dateValue = (dateFilter?.value || "").trim();
        const shiftValue = (shiftFilter?.value || "").trim();
        const cashierValue = (cashierFilter?.value || "").trim();
        const statusValue = (statusFilter?.value || "").trim();

        filteredRows = dataRows.filter((row) => {
            if (dateValue && row.dataset.date !== dateValue) return false;
            if (shiftValue && row.dataset.shift !== shiftValue) return false;
            if (cashierValue && row.dataset.cashier !== cashierValue) return false;
            if (statusValue && row.dataset.status !== statusValue) return false;
            return true;
        });
        currentPage = 1;
        renderTable();
    }

    function renderTable() {
        const totalRows = filteredRows.length;
        const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));

        dataRows.forEach((row) => {
            row.style.display = "none";
        });
        noDataRows.forEach((row) => {
            row.style.display = "none";
            row.classList.add("hidden");
        });

        if (totalRows === 0) {
            noDataRows.forEach((row) => {
                row.style.display = "";
                row.classList.remove("hidden");
            });
            paginationInfo.textContent = "Affichage de 0 à 0 sur 0 résultats";
            pageNumberLabel.textContent = "Page 1 sur 1";
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            return;
        }

        const start = (currentPage - 1) * rowsPerPage;
        const end = Math.min(start + rowsPerPage, totalRows);
        for (let i = start; i < end; i += 1) {
            filteredRows[i].style.display = "";
        }

        paginationInfo.textContent = `Affichage de ${start + 1} à ${end} sur ${totalRows} résultats`;
        pageNumberLabel.textContent = `Page ${currentPage} sur ${totalPages}`;
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages;
    }

    prevBtn.addEventListener("click", () => {
        if (currentPage === 1) return;
        currentPage -= 1;
        renderTable();
    });

    nextBtn.addEventListener("click", () => {
        const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
        if (currentPage >= totalPages) return;
        currentPage += 1;
        renderTable();
    });

    [dateFilter, shiftFilter, cashierFilter, statusFilter].forEach((input) => {
        if (!input) return;
        input.addEventListener("change", applyFilters);
    });

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
        if (!deleteBtn) return;

        const reportId = deleteBtn.getAttribute("data-id");
        try {
            const report = await loadShiftReport(reportId);
            openDeleteModal(report);
        } catch (error) {
            alert(error.message || "Impossible de supprimer le shift.");
        }
    });

    renderTable();
});

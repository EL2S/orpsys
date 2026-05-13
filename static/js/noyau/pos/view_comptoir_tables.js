document.addEventListener("DOMContentLoaded", function () {
    const page = document.getElementById("comptoirTablesPage");
    const grid = document.getElementById("tableGrid");
    const modalContainer = document.getElementById("modalContainer");
    const emptyState = document.getElementById("tableEmptyState");
    const searchInput = document.getElementById("tableSearchInput");
    const filterButtons = Array.from(document.querySelectorAll(".table-zone-filter"));
    const createButton = document.getElementById("createTableButton");
    const tablesJson = document.getElementById("comptoir-tables-json");
    const zonesJson = document.getElementById("comptoir-zones-json");

    if (!page || !grid || !tablesJson || !zonesJson) {
        return;
    }

    const canAdd = page.dataset.canAdd === "true";
    const canChange = page.dataset.canChange === "true";
    const canDelete = page.dataset.canDelete === "true";
    const tableTemplateUrls = {
        A: page.dataset.templateA || "",
        B: page.dataset.templateB || "",
        VIP: page.dataset.templateVip || "",
        TER: page.dataset.templateTer || "",
    };
    const zoneLabelSummary = document.getElementById("tableSummaryZone");
    const visibleSummary = document.getElementById("tableSummaryVisible");
    const totalSummary = document.getElementById("tableSummaryTotal");
    const activeSummary = document.getElementById("tableSummaryActive");
    const inactiveSummary = document.getElementById("tableSummaryInactive");

    let tables = [];
    let zoneChoices = [];
    let selectedZone = "";
    let searchValue = "";

    try {
        tables = JSON.parse(tablesJson.textContent || "[]");
    } catch (error) {
        console.error("Impossible de lire les tables comptoir", error);
        tables = [];
    }

    try {
        zoneChoices = JSON.parse(zonesJson.textContent || "[]");
    } catch (error) {
        console.error("Impossible de lire les zones", error);
        zoneChoices = [];
    }

    function getCsrfToken() {
        const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : "";
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function getZoneLabel(zoneCode) {
        const zone = zoneChoices.find((entry) => entry.code === zoneCode);
        return zone ? zone.label : zoneCode;
    }

    function sortTables(data) {
        const zoneOrder = { A: 1, B: 2, VIP: 3, TER: 4 };
        return [...data].sort((left, right) => {
            const zoneDiff = (zoneOrder[left.zone] || 99) - (zoneOrder[right.zone] || 99);
            if (zoneDiff !== 0) {
                return zoneDiff;
            }
            return Number(left.number) - Number(right.number);
        });
    }

    function filteredTables() {
        const normalizedSearch = searchValue.trim().toLowerCase();
        return sortTables(
            tables.filter((table) => {
                if (selectedZone && table.zone !== selectedZone) {
                    return false;
                }
                if (!normalizedSearch) {
                    return true;
                }
                const haystack = `${table.code} ${table.zone_label} ${table.note || ""}`.toLowerCase();
                return haystack.includes(normalizedSearch);
            })
        );
    }

    function renderCard(table) {
        return `
            <article
                class="comptoir-table-tile${table.is_active ? "" : " is-inactive"}"
                data-table-id="${table.id}"
                data-zone="${escapeHtml(table.zone)}"
            >
                <div class="comptoir-tile-top">
                    <span class="comptoir-zone-badge">${escapeHtml(table.zone_label)}</span>
                    <span class="comptoir-status-badge ${table.is_active ? "is-active" : "is-inactive"}">
                        ${escapeHtml(table.status_label)}
                    </span>
                </div>
                <div class="comptoir-table-code">${escapeHtml(table.code)}</div>
                <div class="comptoir-table-details">
                    <span>Table ${escapeHtml(table.number)}</span>
                    <span>${escapeHtml(table.updated_at_label)}</span>
                </div>
                <div class="comptoir-table-note">
                    ${table.note ? escapeHtml(table.note) : "Aucune note"}
                </div>
                <div class="comptoir-table-actions">
                    <button type="button" class="table-card-button card-button comptoir-icon-button is-card" data-id="${table.id}" aria-label="Télécharger la fiche ${escapeHtml(table.code)}" title="Télécharger la fiche">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                            <path d="M7 11h10M7 8h10M7 14h7M4 3h16v18l-8-4-8 4V3z"></path>
                        </svg>
                    </button>
                    ${canChange ? `
                        <button type="button" class="table-edit-button comptoir-icon-button" data-id="${table.id}" aria-label="Modifier ${escapeHtml(table.code)}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                                <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.37 2.63a2.12 2.12 0 1 1 3 3L12 15l-4 1 1-4Z"></path>
                            </svg>
                        </button>
                    ` : ""}
                    ${canDelete ? `
                        <button type="button" class="table-delete-button comptoir-icon-button is-danger" data-id="${table.id}" aria-label="Supprimer ${escapeHtml(table.code)}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                                <path d="M3 6h18"></path>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                <path d="M10 11v6"></path>
                                <path d="M14 11v6"></path>
                            </svg>
                        </button>
                    ` : ""}
                </div>
            </article>
        `;
    }

    function updateSummary(visibleTables) {
        const activeCount = tables.filter((table) => table.is_active).length;
        const inactiveCount = tables.length - activeCount;
        totalSummary.textContent = String(tables.length);
        activeSummary.textContent = String(activeCount);
        inactiveSummary.textContent = String(inactiveCount);
        zoneLabelSummary.textContent = selectedZone ? getZoneLabel(selectedZone) : "Toutes";
        visibleSummary.textContent = `${visibleTables.length} table(s) visibles`;
    }

    function render() {
        const visibleTables = filteredTables();
        updateSummary(visibleTables);

        filterButtons.forEach((button) => {
            const isActive = button.dataset.zone === selectedZone;
            button.classList.toggle("is-active", isActive);
        });

        if (!visibleTables.length) {
            grid.innerHTML = "";
            emptyState.classList.remove("hidden");
            return;
        }

        emptyState.classList.add("hidden");
        grid.innerHTML = visibleTables.map(renderCard).join("");
    }

    function closeModal() {
        modalContainer.innerHTML = "";
    }

    function modalShell(title, body) {
        modalContainer.innerHTML = `
            <div role="dialog" data-state="open" class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-xl border p-6 shadow-lg duration-200 sm:max-w-[520px]" tabindex="-1" style="pointer-events: auto">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <h2 class="text-lg font-semibold">${escapeHtml(title)}</h2>
                    </div>
                    <button type="button" id="tableModalClose" class="rounded-xs opacity-70 transition-opacity hover:opacity-100">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4">
                            <path d="M18 6 6 18"></path>
                            <path d="m6 6 12 12"></path>
                        </svg>
                    </button>
                </div>
                ${body}
            </div>
        `;
        document.getElementById("tableModalClose")?.addEventListener("click", closeModal);
    }

    function buildZoneOptions(selectedZoneValue) {
        return zoneChoices.map((zone) => (
            `<option value="${zone.code}" ${zone.code === selectedZoneValue ? "selected" : ""}>${escapeHtml(zone.label)}</option>`
        )).join("");
    }

    function openTableForm(table = null) {
        const isEdit = Boolean(table);
        modalShell(
            isEdit ? `Modifier ${table.code}` : "Nouvelle table comptoir",
            `
                <p class="text-sm text-muted-foreground">Choisissez la zone puis le numéro. Le code se construit automatiquement : A1, B2, VIP3, TER4...</p>
                <form id="tableForm" class="grid gap-4">
                    <div class="grid gap-4 sm:grid-cols-2">
                        <div class="space-y-2">
                            <label class="text-sm font-medium">Zone</label>
                            <select name="zone" class="file:text-foreground placeholder:text-muted-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none">
                                ${buildZoneOptions(table ? table.zone : "A")}
                            </select>
                        </div>
                        <div class="space-y-2">
                            <label class="text-sm font-medium">Numéro</label>
                            <input type="number" min="1" step="1" name="number" value="${table ? escapeHtml(table.number) : ""}" class="file:text-foreground placeholder:text-muted-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none" required />
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium">Note</label>
                        <input type="text" name="note" value="${table ? escapeHtml(table.note || "") : ""}" class="file:text-foreground placeholder:text-muted-foreground border-input h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none" placeholder="Optionnel" />
                    </div>
                    <label class="inline-flex items-center gap-2 text-sm font-medium">
                        <input type="checkbox" name="is_active" class="h-4 w-4 rounded border-slate-300" ${!table || table.is_active ? "checked" : ""} />
                        Table active
                    </label>
                    <p id="tableFormError" class="hidden text-sm text-red-600"></p>
                    <div class="flex justify-end gap-2">
                        <button type="button" id="tableFormCancel" class="inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm hover:bg-accent">Annuler</button>
                        <button type="submit" class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                            ${isEdit ? "Enregistrer" : "Créer la table"}
                        </button>
                    </div>
                </form>
            `
        );

        document.getElementById("tableFormCancel")?.addEventListener("click", closeModal);
        document.getElementById("tableForm")?.addEventListener("submit", async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const errorEl = document.getElementById("tableFormError");
            errorEl.classList.add("hidden");
            const formData = new FormData(form);
            const payload = {
                zone: formData.get("zone"),
                number: formData.get("number"),
                note: formData.get("note"),
                is_active: formData.get("is_active") === "on",
            };

            try {
                const url = isEdit ? `/pos/tables/${table.id}/update/` : "/pos/tables/create/";
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": getCsrfToken(),
                    },
                    body: JSON.stringify(payload),
                });
                const data = await window.safeJson(response);
                if (!data.success) {
                    throw new Error(data.error || "Impossible d'enregistrer la table.");
                }

                if (isEdit) {
                    tables = tables.map((entry) => (entry.id === data.table.id ? data.table : entry));
                } else {
                    tables.push(data.table);
                }
                closeModal();
                render();
            } catch (error) {
                errorEl.textContent = error.message || "Impossible d'enregistrer la table.";
                errorEl.classList.remove("hidden");
            }
        });
    }

    function openDeleteModal(table) {
        modalShell(
            `Supprimer ${table.code}`,
            `
                <p class="text-sm text-muted-foreground">Cette suppression retirera définitivement la table <span class="font-medium text-foreground">${escapeHtml(table.code)}</span> de l’organisation comptoir.</p>
                <div class="rounded-xl border bg-red-50/60 p-4 text-sm text-red-700">
                    <div class="font-medium">Table concernée</div>
                    <div class="mt-2">Zone ${escapeHtml(table.zone_label)} · Numéro ${escapeHtml(table.number)}</div>
                </div>
                <div class="flex justify-end gap-2">
                    <button type="button" id="tableDeleteCancel" class="inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm hover:bg-accent">Annuler</button>
                    <button type="button" id="tableDeleteConfirm" class="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Supprimer</button>
                </div>
            `
        );

        document.getElementById("tableDeleteCancel")?.addEventListener("click", closeModal);
        document.getElementById("tableDeleteConfirm")?.addEventListener("click", async () => {
            try {
                const response = await fetch(`/pos/tables/${table.id}/delete/`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": getCsrfToken(),
                    },
                    body: JSON.stringify({}),
                });
                const data = await window.safeJson(response);
                if (!data.success) {
                    throw new Error(data.error || "Impossible de supprimer la table.");
                }
                tables = tables.filter((entry) => entry.id !== table.id);
                closeModal();
                render();
            } catch (error) {
                alert(error.message || "Impossible de supprimer la table.");
            }
        });
    }

    function findTable(tableId) {
        return tables.find((table) => String(table.id) === String(tableId));
    }

    function downloadTableCard(table) {
        const templateUrl = tableTemplateUrls[table.zone];
        if (!templateUrl) {
            alert("Aucun modèle PDF n'est configuré pour cette zone.");
            return;
        }

        const link = document.createElement("a");
        link.href = templateUrl;
        link.download = `table-${table.code}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
            selectedZone = button.dataset.zone || "";
            render();
        });
    });

    searchInput?.addEventListener("input", (event) => {
        searchValue = event.target.value || "";
        render();
    });

    createButton?.addEventListener("click", () => {
        if (canAdd) {
            openTableForm();
        }
    });

    grid.addEventListener("click", (event) => {
        const cardButton = event.target.closest(".table-card-button");
        const editButton = event.target.closest(".table-edit-button");
        const deleteButton = event.target.closest(".table-delete-button");

        if (cardButton) {
            const table = findTable(cardButton.dataset.id);
            if (table) {
                downloadTableCard(table);
            }
            return;
        }

        if (editButton) {
            const table = findTable(editButton.dataset.id);
            if (table && canChange) {
                openTableForm(table);
            }
            return;
        }

        if (deleteButton) {
            const table = findTable(deleteButton.dataset.id);
            if (table && canDelete) {
                openDeleteModal(table);
            }
        }
    });

    render();
});

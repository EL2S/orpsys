document.addEventListener('DOMContentLoaded', function () {
    const todayBtn = document.getElementById("today-button");
    const allBtn = document.getElementById("all-button");
    const startButton = document.getElementById('start-production');
    const modalContainer = document.getElementById('modalContainer');
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
    const todayTable = document.getElementById('todayTable');
    const tableBody = todayTable.querySelector('tbody');
    const productionTable = document.getElementById('productionTable');
    const productionBody = productionTable.querySelector('tbody');
    const tableRows = productionBody.getElementsByTagName('tr');
    const searchInput = document.getElementById('searchInput');
    if(searchInput){
        searchInput.addEventListener('input', function () {
            const filter = this.value.toLowerCase().trim();
            for (let row of tableRows) {
                // Ignore les lignes "Aucun employé trouvé"
                if (row.querySelector('td[colspan]')) continue;

                const cells = row.getElementsByTagName('td');
                let match = false;

                // Vérifie si une cellule correspond au texte recherché
                for (let i = 0; i < cells.length - 1; i++) { // exclut la colonne Actions
                    if (cells[i].textContent.toLowerCase().includes(filter)) {
                        match = true;
                        break;
                    }
                }

                row.style.display = match ? '' : 'none';
            }

            // Si aucune ligne ne correspond, afficher un message
            let visibleRows = Array.from(tableRows).filter(row => row.style.display !== 'none' && !row.querySelector('td[colspan]'));
            if (visibleRows.length === 0) {
                if (!productionTable.querySelector('.no-results')) {
                    const tr = document.createElement('tr');
                    tr.className = 'no-results';
                    const td = document.createElement('td');
                    td.colSpan =inventoryTable.querySelectorAll('th').length;
                    td.className = 'text-center py-4';
                    td.textContent = 'Aucun produit trouvé.';
                    tr.appendChild(td);
                    productionTable.appendChild(tr);
                }
            } else {
                const noResults = tableBody.querySelector('.no-results');
                if (noResults) noResults.remove();
            }
        });
    }
    const products_json = document.getElementById('products_json');
    let productsData = [];
    if (products_json) {
        productsData = JSON.parse(products_json.value || "[]");
    }
    // Les panneaux
    const todayPanel = document.querySelector('[role="tabpanel"][aria-labelledby="today-button"]');
    const allPanel = document.querySelector('[role="tabpanel"][aria-labelledby="all-button"]');

    function activateTab(selectedBtn, selectedPanel, otherBtn, otherPanel) {

        // Activer le bouton sélectionné
        selectedBtn.dataset.state = "active";
        selectedBtn.setAttribute("aria-selected", "true");
        selectedBtn.tabIndex = 0;

        // Désactiver l'autre bouton
        otherBtn.dataset.state = "inactive";
        otherBtn.setAttribute("aria-selected", "false");
        otherBtn.tabIndex = -1;

        // Afficher le panneau sélectionné
        selectedPanel.dataset.state = "active";
        selectedPanel.hidden = false;

        // Masquer l'autre panneau
        otherPanel.dataset.state = "inactive";
        otherPanel.hidden = true;
    }

    // Quand on clique sur Aujourd’hui
    todayBtn.addEventListener("click", () => {
        activateTab(todayBtn, todayPanel, allBtn, allPanel);
    });

    // Quand on clique sur Hier
    allBtn.addEventListener("click", () => {
        activateTab(allBtn, allPanel, todayBtn, todayPanel);
    });

    startButton.addEventListener("click", () => {
        let optionsHTML = productsData.map(item => `
            <option value="${item.id}" title="${item.name}">${item.name}</option>
        `).join('');
        modalContainer.innerHTML = `
    
            <div
                role="dialog"
                id="stockModal"
                aria-describedby="radix-_r_c_"
                aria-labelledby="radix-_r_b_"
                data-state="open"
                data-slot="dialog-content"
                class="addModal bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]"
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
                        Produits Finis
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="stockForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="add">
                    <div class="space-y-2">
                        <label
                        data-slot="label"
                        class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                        for="material"
                        >Produit</label
                        ><select
                        id="material"
                        class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                            <option value="" selected disabled>----- Veuillez selectionnez un produit -----</option>
                            ${optionsHTML}
                        </select>
                    </div>
                    <div class="form-extra">
                        <div class="available">
                            <div class="leading-none font-semibold">Produits fabriqués</div>
                            <div class="liste-extra">
                                <select multiple name="aut_ch" id="aut_ch">

                                </select>
                            </div>
                        </div>
                        <div class="chosen">
                            <div class="leading-none font-semibold">Quantités produites</div>
                            <div class="liste-extra">
                                <div id="aut_rem" class="planned-quantity">
                                    
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
            margin-bottom: 5px;
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

                // Ajouter un champ quantité correspondant dans "aut_rem"
                const quantityInput = document.createElement('input');
                quantityInput.type = 'number';
                quantityInput.name = 'quantity[]';
                quantityInput.required = true;
                quantityInput.placeholder = `${option.textContent} quantité`;
                quantityInput.style.cssText = quantityInputStyle; // appliquer le style pro
                destination.appendChild(quantityInput);
            });

            // Reset du select initial
            material.value = "";
        });
        // Fermer le modal
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
    });

    tableBody.addEventListener('click', function (event) {
        const deleteBtn = event.target.closest('.delete-button');
        if (deleteBtn) {
            const productionId = deleteBtn.getAttribute('data-id');
            deleteProduction(productionId);
        }
        const decreaseBtn = event.target.closest('.decrease-button');
        if (decreaseBtn) {
            const productionId = decreaseBtn.getAttribute('data-id');
            fetch(`/production/${productionId}/get/`)
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        decreaseProduction(data.production, productionId);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération de la producion :", err);
                });
        }
        const increaseBtn = event.target.closest('.increase-button');
        if (increaseBtn) {
            const productionId = increaseBtn.getAttribute('data-id');
            fetch(`/production/${productionId}/get/`)
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        increaseProduction(data.production, productionId);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération de la producion :", err);
                });
        }
    });
    function deleteProduction(productionId){
        modalContainer.innerHTML = `
            <div
                role="dialog"
                id="deleteModal"
                aria-describedby="radix-_r_c_"
                aria-labelledby="radix-_r_b_"
                data-state="open"
                data-slot="dialog-content"
                class="addModal bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]"
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
                    Confirmer la suppression
                    </h2>
                </div>
                <div class="grid gap-4 py-4">
                    <p class="flex items-center text-sm font-medium text-primary">Êtes-vous sûr de vouloir supprimer cette production ? Cette action est irréversible.</p>
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
            window.location.href = `/production/${productionId}/delete/`;
        });
    }
    function decreaseProduction(production,productionId){
        modalContainer.innerHTML = `
            <div
                role="dialog"
                id="decreaseModal"
                aria-describedby="radix-_r_c_"
                aria-labelledby="radix-_r_b_"
                data-state="open"
                data-slot="dialog-content"
                class=" bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]"
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
                    Augmentation du stock
                    </h2>
                    <div data-slot="card-description" class="text-muted-foreground text-sm">
                        Produit : ${production.name} (${production.unit_price.toFixed(2)} KMF)
                    </div>
                </div>
                <form class="grid gap-4 py-4" id="decreaseForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="decrease">
                    <input type="hidden" name="production_id" value="${productionId}">
                    <div class="p-4 bg-muted rounded-lg text-center flex flex-row justify-center items-center gap-4">
                        <div class="p-4 bg-muted rounded-lg text-center">
                            <p class="text-sm text-muted-foreground">Prévu</p>
                            <p class="text-2xl font-bold">${ production.planned_quantity }</p>
                        </div>

                        <!-- Stock Vendu -->
                        <div class="p-4 bg-muted rounded-lg text-center">
                            <p class="text-sm text-muted-foreground">Vendu</p>
                            <p class="text-2xl font-bold">${ production.sold_quantity }</p>
                        </div>

                        <!-- Stock Restant -->
                        <div class="p-4 bg-muted rounded-lg text-center">
                            <p class="text-sm text-muted-foreground">Restant</p>
                            <p class="text-2xl font-bold">${ production.remaining_quantity }</p>
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            >Quantité à retirer (Unité)</label
                        ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            type="number"
                            id="reduction_quantity"
                            name="reduction_quantity"
                            value=""
                        />
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
                        Confirmer l'augmentation
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
        const modal = document.getElementById('decreaseModal');
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('decreaseForm');
        // Fermer le modal
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        const reductionInput = document.getElementById('reduction_quantity');

        // Effacer les messages d'erreur dès qu'on change la valeur
        reductionInput.addEventListener('input', () => {
            form.querySelectorAll('.error-msg').forEach(el => el.remove());
        });

        // Validation et soumission du formulaire
        form.addEventListener('submit', function (e) {
            e.preventDefault(); // Empêche l'envoi immédiat

            // Supprimer les anciens messages d'erreur
            form.querySelectorAll('.error-msg').forEach(el => el.remove());

            const reductionValue = parseInt(reductionInput.value, 10);
            const remainingQuantity = production.remaining_quantity; // Stock restant actuel

            let hasError = false;

            // Validation
            if (isNaN(reductionValue)) {
                const error = document.createElement('p');
                error.className = 'text-red-600 text-sm error-msg';
                error.textContent = 'Veuillez entrer une valeur numérique.';
                reductionInput.parentNode.appendChild(error);
                hasError = true;
            } else if (reductionValue < 0) {
                const error = document.createElement('p');
                error.className = 'text-red-600 text-sm error-msg';
                error.textContent = 'La quantité ne peut pas être inférieure à 0.';
                reductionInput.parentNode.appendChild(error);
                hasError = true;
            } else if (reductionValue > remainingQuantity) {
                const error = document.createElement('p');
                error.className = 'text-red-600 text-sm error-msg';
                error.textContent = `La quantité ne peut pas dépasser le stock restant (${remainingQuantity}).`;
                reductionInput.parentNode.appendChild(error);
                hasError = true;
            }

            if (!hasError) {
                form.submit();
            }
        });


    }
    function increaseProduction(production,productionId){
        modalContainer.innerHTML = `
            <div
                role="dialog"
                id="increaseModal"
                aria-describedby="radix-_r_c_"
                aria-labelledby="radix-_r_b_"
                data-state="open"
                data-slot="dialog-content"
                class=" bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]"
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
                    Augmentation du stock
                    </h2>
                    <div data-slot="card-description" class="text-muted-foreground text-sm">
                        Produit : ${production.name} (${production.unit_price.toFixed(2)} KMF)
                    </div>
                </div>
                <form class="grid gap-4 py-4" id="increaseForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="increase">
                    <input type="hidden" name="production_id" value="${productionId}">
                    <div class="p-4 bg-muted rounded-lg text-center flex flex-row justify-center items-center gap-4">
                        <div class="p-4 bg-muted rounded-lg text-center">
                            <p class="text-sm text-muted-foreground">Prévu</p>
                            <p class="text-2xl font-bold">${ production.planned_quantity }</p>
                        </div>

                        <!-- Stock Vendu -->
                        <div class="p-4 bg-muted rounded-lg text-center">
                            <p class="text-sm text-muted-foreground">Vendu</p>
                            <p class="text-2xl font-bold">${ production.sold_quantity }</p>
                        </div>

                        <!-- Stock Restant -->
                        <div class="p-4 bg-muted rounded-lg text-center">
                            <p class="text-sm text-muted-foreground">Restant</p>
                            <p class="text-2xl font-bold">${ production.remaining_quantity }</p>
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            >Quantité à ajouter (Unité)</label
                        ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            type="number"
                            id="additional_quantity"
                            name="additional_quantity"
                            value=""
                        />
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
                        Confirmer l'augmentation
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
        const modal = document.getElementById('increaseModal');
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('increaseForm');
        // Fermer le modal
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        form.addEventListener('submit', function (e) {
            e.preventDefault(); // Empêche l'envoi immédiat

            // Suppression des anciens messages d’erreur
            form.querySelectorAll('.error-msg').forEach(el => el.remove());

            let hasError = false;

            // Si erreur → on n’envoie pas
            if (hasError) {
                return;
            }

            // Envoyer le formulaire
            form.submit();
        });
    }
});
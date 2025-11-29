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
    let inventoriesData = [];
    if (inventories_json) {
        inventoriesData = JSON.parse(inventories_json.value || "[]");
    }
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
            if (!tableBody.querySelector('.no-results')) {
                const tr = document.createElement('tr');
                tr.className = 'no-results';
                const td = document.createElement('td');
                td.colSpan =inventoryTable.querySelectorAll('th').length;
                td.className = 'text-center py-4';
                td.textContent = 'Aucun ingrédient trouvé.';
                tr.appendChild(td);
                tableBody.appendChild(tr);
            }
        } else {
            const noResults = tableBody.querySelector('.no-results');
            if (noResults) noResults.remove();
        }
    });
    
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
                            for="unit"
                            >Unité</label
                            ><select
                            id="unit"
                            name="unit"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                                <option value="kg" >Kilogramme (kg)</option>
                                <option value="L" >Litre (L)</option>
                                <option value="g" >Gramme (g)</option>
                                <option value="ml">Millilitre (ml)</option>
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
                                type="number"
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
                                type="number"
                            />
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
        const modal = document.getElementById('addModal');
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('addForm');
        const nameInput = document.getElementById('name');
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

        form.addEventListener('submit', function (e) {
            e.preventDefault(); // Empêche l'envoi immédiat
            clearNameError();
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
                .then(res => res.json())
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

    function deleteInventory(inventoryId){
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

    function changeInventory(inventory, inventoryId){

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
                                <option value="kg"  ${inventory.unit === "kg" ? "selected" : ""}>Kilogramme (kg)</option>
                                <option value="L"  ${inventory.unit === "L" ? "selected" : ""}>Litre (L)</option>
                                <option value="g"  ${inventory.unit === "g" ? "selected" : ""}>Gramme (g)</option>
                                <option value="ml" ${inventory.unit === "ml" ? "selected" : ""}>Millilitre (ml)</option>
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
                                type="number"
                                value="${inventory.min_stock}"
                            />
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
        const modal = document.getElementById('changeModal');
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('changeForm');
        const nameInput = document.getElementById('name');
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

        form.addEventListener('submit', function (e) {
            e.preventDefault(); // Empêche l'envoi immédiat
            clearNameError();
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
    }
    function stockInventory(type){
        let title = type === "in" ? "Entrée de stock" : "Sortie de stock";
        let chosen = type === "in" ? "Ajouter du stock" : "Retirer du stock";
        let optionsHTML = inventoriesData.map(item => `
            <option value="${item.id}" title="${item.name}">${item.name} (${item.current_stock} ${item.unit})</option>
        `).join('');
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
    }

    let allRows = Array.from(document.querySelectorAll("#inventoryTable tbody tr"));
    let rows = allRows.filter(row => !row.textContent.includes("Aucun ingrédient trouvé."));

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
            // afficher la ligne "Aucun ingrédient trouvé."
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

    renderTable();
});
document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('searchInput');
    const productTable = document.getElementById('productTable');
    const tableBody = productTable.querySelector('tbody');
    const tableRows = tableBody.getElementsByTagName('tr');
    const addButton = document.getElementById('add-button');
    const modalContainer = document.getElementById('modalContainer');
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
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
                td.colSpan =productTable.querySelectorAll('th').length;
                td.className = 'text-center py-4';
                td.textContent = 'Aucun produit trouvé.';
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
                    Ajouter un produit
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="addForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="add">
                    <div class="space-y-2 flex items-center justify-center">
                        <label for="image" class="bg-primary/10 flex items-center justify-center product-img cursor-pointer">
                            <img src="/static/img/logo/salimamoud.png" alt="Salimamoud Logo">
                            <input type="file" name="image" id="image" accept="image/*">
                        </label>
                    </div>
                    <div class="space-y-2">
                    <label
                        data-slot="label"
                        class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                        for="name"
                        >Nom du produit</label
                    ><input
                        data-slot="input"
                        class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                        id="name"
                        name="name"
                        required=""
                        type="text"
                        
                    />
                    </div>

                    
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="category"
                            >Catégorie</label
                            ><select
                            id="category"
                            name="category"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                                <option value="Périssable">Périssable</option>
                                <option value="Durable">Durable</option>
                            </select>
                        </div>
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="product_type"
                            >Type de produit</label
                            ><select
                            id="product_type"
                            name="product_type"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                            <option value="Fabriqué sur place">Fabriqué sur place</option>
                            <option value="Achat & Revente">Achat & Revente</option>
                            <option value="Vente en dépôt">Vente en dépôt</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="stock_known"
                            >Statut</label
                            ><select
                            id="stock_known"
                            name="stock_known"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                                <option value="True">Prêt</option>
                                <option value="False">À produire</option>
                            </select>
                        </div>
                        <div class="space-y-2">
                            <label
                                data-slot="label"
                                class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                                for="unit_price"
                                >Prix de vente</label
                            ><input
                                data-slot="input"
                                class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                                id="unit_price"
                                name="unit_price"
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

        document.getElementById('image').addEventListener('change', function (e) {
            const file = e.target.files[0];

            if (file) {
                const imageURL = URL.createObjectURL(file);
                document.querySelector('.product-img img').src = imageURL;
            }
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
    tableBody.addEventListener('click', function (event) {
        const deleteBtn = event.target.closest('.delete-button');
        if (deleteBtn) {
            const productId = deleteBtn.getAttribute('data-id');
            deleteProduct(productId);
        }
        const changeBtn = event.target.closest('.change-button');
        if (changeBtn) {
            const productId = changeBtn.getAttribute('data-id');
            fetch(`/product/${productId}/get/`)
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        changeProduct(data.product, productId);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération du congé :", err);
                });
        }
    });

    function deleteProduct(productId){
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
                    <p class="flex items-center text-sm font-medium text-primary">Êtes-vous sûr de vouloir supprimer ce produit ? Cette action est irréversible.</p>
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
            window.location.href = `/product/${productId}/delete/`;
        });
    }

    function changeProduct(product, productId){

        const tableRows = tableBody.getElementsByTagName('tr');

        // Tableau plat pour toutes les premières cellules
        let itemsData = Array.from(tableRows).map(row => {
            const firstCell = row.getElementsByTagName('td')[0];
            return firstCell ? firstCell.textContent.trim() : null;
        });
        itemsData = itemsData.filter(n => n.toLowerCase() !== product.name.toLowerCase());
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
                    Ajouter un produit
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="changeForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="change">
                    <input type="hidden" name="product_id" value="${productId}">
                    <div class="space-y-2 flex items-center justify-center">
                        <label for="image" class="bg-primary/10 flex items-center justify-center product-img cursor-pointer">
                            <img src="/media/${product.image}" alt="Salimamoud Logo">
                            <input type="file" name="image" id="image" accept="image/*">
                        </label>
                    </div>
                    <div class="space-y-2">
                    <label
                        data-slot="label"
                        class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                        for="name"
                        >Nom du produit</label
                    ><input
                        data-slot="input"
                        class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                        id="name"
                        name="name"
                        required=""
                        type="text"
                        value="${product.name}"
                    />
                    </div>

                    
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="category"
                            >Catégorie</label
                            ><select
                            id="category"
                            name="category"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                                <option value="Périssable" ${product.category === "Périssable" ? "selected" : ""}>Périssable</option>
                                <option value="Durable" ${product.category === "Durable" ? "selected" : ""}>Durable</option>
                            </select>
                        </div>
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="product_type"
                            >Type de produit</label
                            ><select
                            id="product_type"
                            name="product_type"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                            <option value="Fabriqué sur place" ${product.product_type === "Fabriqué sur place" ? "selected" : ""}>Fabriqué sur place</option>
                            <option value="Achat & Revente" ${product.product_type === "Achat & Revente" ? "selected" : ""}>Achat & Revente</option>
                            <option value="Vente en dépôt" ${product.product_type === "Vente en dépôt" ? "selected" : ""}>Vente en dépôt</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="stock_known"
                            >Statut</label
                            ><select
                            id="stock_known"
                            name="stock_known"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                                <option value="True" ${product.stock_known ? "selected" : ""}>Prêt</option>
                                <option value="False" ${!product.stock_known ? "selected" : ""}>À produire</option>
                            </select>
                        </div>
                        <div class="space-y-2">
                            <label
                                data-slot="label"
                                class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                                for="unit_price"
                                >Prix de vente</label
                            ><input
                                data-slot="input"
                                class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                                id="unit_price"
                                name="unit_price"
                                required=""
                                type="number"
                                value="${product.unit_price}"
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

        document.getElementById('image').addEventListener('change', function (e) {
            const file = e.target.files[0];

            if (file) {
                const imageURL = URL.createObjectURL(file);
                document.querySelector('.product-img img').src = imageURL;
            }
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
    
    let allRows = Array.from(document.querySelectorAll("#productTable tbody tr"));
    let rows = allRows.filter(row => !row.textContent.includes("Aucun produit trouvé."));

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
            // afficher la ligne "Aucun produit trouvé."
            const noDataRow = allRows.find(row => row.textContent.includes("Aucun produit trouvé."));
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
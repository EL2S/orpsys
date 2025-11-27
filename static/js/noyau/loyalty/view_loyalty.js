document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('searchInput');
    const loyaltyTable = document.getElementById('loyaltyTable');
    const tableBody = loyaltyTable.querySelector('tbody');
    const tableRows = tableBody.getElementsByTagName('tr');
    const addButton = document.getElementById('add-button');
    const modalContainer = document.getElementById('modalContainer');
    const scanButton = document.getElementById('scan-button');
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
    const loyalties_json = document.getElementById('loyalties_json');
    let loyaltiesData = [];
    if (loyalties_json) {
        loyaltiesData = JSON.parse(loyalties_json.value || "[]");
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
                td.colSpan =loyaltyTable.querySelectorAll('th').length;
                td.className = 'text-center py-4';
                td.textContent = 'Aucun carte trouvé.';
                tr.appendChild(td);
                tableBody.appendChild(tr);
            }
        } else {
            const noResults = tableBody.querySelector('.no-results');
            if (noResults) noResults.remove();
        }
    });
    addButton.addEventListener('click', function () {
        addLoyalty();
    });

    tableBody.addEventListener('click', function (event) {
        const balanceBtn = event.target.closest('.balance-button');
        if (balanceBtn) {
            const loyaltyId = balanceBtn.getAttribute('data-id');
            fetch(`/loyalty/${loyaltyId}/get/`)
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        balanceLoyalty(data.loyalty, loyaltyId);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération du congé :", err);
                });
        }
        const deleteBtn = event.target.closest('.delete-button');
        if (deleteBtn) {
            const loyaltyId = deleteBtn.getAttribute('data-id');
            deleteLoyalty(loyaltyId);
        }
        const changeBtn = event.target.closest('.change-button');
        if (changeBtn) {
            const loyaltyId = changeBtn.getAttribute('data-id');
            fetch(`/loyalty/${loyaltyId}/get/`)
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        changeLoyalty(data.loyalty, loyaltyId);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération du congé :", err);
                });
        }
        const cardBtn = event.target.closest('.card-button');
        if (cardBtn) {
            const loyaltyId = cardBtn.getAttribute('data-id');
            fetch(`/loyalty/${loyaltyId}/get/`)
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        cardLoyalty(data.loyalty, loyaltyId);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération du congé :", err);
                });
        }
    });

    function addLoyalty(){
        fetch(`/loyalty/add/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
        })
            .then(res => res.json())
            .then(r => {
                if (!r.success) {
                    console.error("Erreur", res.error || "Impossible de crée la cart", "error");
                }
                location.reload();
            })
            .catch(err => {
                console.error("Erreur", "Impossible de contacter le serveur", err);
            });
    }

    function deleteLoyalty(loyaltyId){
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
                    <p class="flex items-center text-sm font-medium text-primary">Êtes-vous sûr de vouloir supprimer cette carte de fidélité ? Cette action est irréversible.</p>
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
            window.location.href = `/loyalty/${loyaltyId}/delete/`;
        });
    }

    function changeLoyalty(loyalty, loyaltyId){

        modalContainer.innerHTML = `
            <div
                role="dialog"
                id="changeModal"
                aria-describedby="radix-_r_c_"
                aria-labelledby="radix-_r_b_"
                data-state="open"
                data-slot="dialog-content"
                class="requestModal bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]"
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
                    Information de la carte de fidélité
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="changeForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="change">
                    <input type="hidden" name="loyalty_id" value="${loyaltyId}">
                    <div class="p-4 bg-muted rounded-lg text-center">
                        <p class="text-sm text-muted-foreground">Solde actuel</p>
                        <p class="text-2xl font-bold">${loyalty.solde.toFixed(2)} KMF</p>
                    </div>
                    <div class="space-y-2">
                        <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="client"
                            >Nom du client</label
                        ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            id="client"
                            name="client"
                            required=""
                            type="text"
                            value="${loyalty.client}"
                        />
                    </div>
                    <div class="space-y-2">
                        <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="phone"
                            >N° Téléphone</label
                        ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            id="phone"
                            name="phone"
                            required=""
                            type="text"
                            value="${loyalty.phone}"
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

    function balanceLoyalty(loyalty, loyaltyId){

        modalContainer.innerHTML = `
            <div
                role="dialog"
                id="balanceModal"
                aria-describedby="radix-_r_c_"
                aria-labelledby="radix-_r_b_"
                data-state="open"
                data-slot="dialog-content"
                class="requestModal bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]"
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
                    Recharger la carte de fidélité
                    </h2>
                    <div data-slot="card-description" class="text-muted-foreground text-sm">
                        Client : ${loyalty.client} (${loyalty.card_id})
                    </div>
                </div>
                <form class="grid gap-4 py-4" id="balanceForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="solde">
                    <input type="hidden" name="loyalty_id" value="${loyaltyId}">
                    <div class="p-4 bg-muted rounded-lg text-center">
                        <p class="text-sm text-muted-foreground">Solde actuel</p>
                        <p class="text-2xl font-bold">${loyalty.solde.toFixed(2)} KMF</p>
                    </div>
                    <div class="space-y-2">
                        <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            >Montant à ajouter (KMF)</label
                        ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            type="number"
                            id="solde"
                            name="solde"
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
                        Confirmer le rechargement
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
        const modal = document.getElementById('balanceModal');
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('balanceForm');
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

    scanButton.addEventListener('click', function () {
        openModalScan();
    });

    function openModalScan(){
        modalContainer.innerHTML = `
            <div
                role="dialog"
                id="scanModal"
                aria-describedby="radix-_r_c_"
                aria-labelledby="radix-_r_b_"
                data-state="open"
                data-slot="dialog-content"
                class="requestModal bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]"
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
                    Scannez votre carte
                    </h2>
                </div>
                <div class="flex-1 space-y-4 mt-6" id="tab-badge">
                    <div class="flex flex-col items-center space-y-6 p-4 border-2 border-dashed rounded-xl bg-muted/30">
                        <div class="w-32 h-32 rounded-full flex items-center justify-center bg-muted">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-scan w-16 h-16 text-muted-foreground">
                            <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                            <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                            <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                            <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                            </svg>
                        </div>

                        <div class="text-center space-y-2">
                            <h3 class="font-medium text-lg">Scannez votre badge</h3>
                            <p class="text-sm text-muted-foreground">Approchez votre badge du lecteur</p>
                        </div>

                            <!-- Hidden input for auto-read badge -->
                        <form class="w-full opacity-0 h-0 overflow-hidden">
                            <input class="h-9 w-full rounded-md border px-3 py-1 bg-transparent" type="text" id="scan" name="scan"/>
                        </form>
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
        const modal = document.getElementById('balanceModal');
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('balanceForm');
        // Fermer le modal
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        const scanInput = document.getElementById('scan');
        scanInput.focus();
        scanInput.addEventListener('change', function () {
            const cartValue = this.value.trim();
            if (cartValue) {
                scanCart(cartValue);
            }
        });
    }

    async function scanCart(cartValue) {

        for (const loyalty of loyaltiesData) {

            const setting = loyalty.setting;
            const cardId = loyalty.card_id;
            const loyaltyId = loyalty.id;

            // Base de génération
            const base = `${setting}|${cardId}|${loyaltyId}`;

            // Convertir en bytes
            const msgUint8 = new TextEncoder().encode(base);

            // SHA-256
            const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);

            // Buffer → hex (64 chars)
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const secureId = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

            // Vérification
            if (secureId === cartValue) {
                scanLoyalty(loyalty);
                return loyalty; // On retourne la carte trouvée
            }
        }
    }

    function scanLoyalty(loyalty){
        modalContainer.innerHTML = `
            <div
                role="dialog"
                id="scanModal"
                aria-describedby="radix-_r_c_"
                aria-labelledby="radix-_r_b_"
                data-state="open"
                data-slot="dialog-content"
                class="requestModal bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]"
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
                    Carte de fidélité
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="scanForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="scan">
                    <input type="hidden" name="loyalty_id" value="${loyalty.id}">
                    <div class="p-4 bg-muted rounded-lg text-center">
                        <p class="text-sm text-muted-foreground">Solde actuel</p>
                        <p class="text-2xl font-bold">${loyalty.solde} KMF</p>
                    </div>
                    <div class="space-y-2">
                        <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="client"
                            >Nom du client</label
                        ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            id="client"
                            name="client"
                            required=""
                            type="text"
                            value="${loyalty.client}"
                        />
                    </div>
                    <div class="space-y-2">
                        <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="phone"
                            >N° Téléphone</label
                        ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            id="phone"
                            name="phone"
                            required=""
                            type="text"
                            value="${loyalty.phone}"
                        />
                    </div>
                    <div class="space-y-2">
                        <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            >Montant à ajouter (KMF)</label
                        ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            type="number"
                            id="solde"
                            name="solde"
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
        const modal = document.getElementById('scanModal');
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('scanForm');
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

    async function cardLoyalty(loyalty, loyaltyId) {
        const setting = loyalty.setting;     
        const cardId = loyalty.card_id;    

        // Base de génération
        const base = `${setting}|${cardId}|${loyaltyId}`;

        // Convertir en bytes
        const msgUint8 = new TextEncoder().encode(base);

        // Hash SHA-256
        const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);

        // Buffer → hex (64 caractères)
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const secureId = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        console.log("Secure Loyalty ID:", secureId);

        return secureId;
    }

    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
});
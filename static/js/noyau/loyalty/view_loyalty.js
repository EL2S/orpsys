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
    const loyaltyCardTemplate = document.getElementById('loyalty-card-template');
    const loyaltyTemplateUrls = {
        STANDARD: loyaltyCardTemplate?.dataset.standardUrl || '/static/template/loyalty_standard.pdf',
        PREMIUM: loyaltyCardTemplate?.dataset.premiumUrl || '/static/template/loyalty_premium.pdf'
    };
    const loyaltyCardTypeLabels = {
        STANDARD: 'Standard',
        PREMIUM: 'Premium'
    };
    const loyaltyLogoUrl = loyaltyCardTemplate?.dataset.logoUrl || '/static/img/logo/salimamoud-white.png';
    const loyaltyPdfLibUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    const loyaltyPdfWorkerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const loyaltyQrZone = {
        pageIndex: 1,
        x: 160.0,
        y: 24.6,
        size: 68.8,
        radius: 15
    };
    let loyaltiesData = [];
    let loyaltyPdfJsPromise = null;
    let loyaltyTemplatePromises = {};
    let loyaltyLogoPromise = null;
    if (loyalties_json) {
        const rawLoyalties = (loyalties_json.textContent || "").trim();
        loyaltiesData = JSON.parse(rawLoyalties || "[]");
    }

    function normalizeCardType(cardType) {
        return loyaltyCardTypeLabels[cardType] ? cardType : 'STANDARD';
    }

    function renderCardTypeField(selectedType = 'STANDARD', fieldName = 'card_type') {
        const normalizedType = normalizeCardType(selectedType);
        return `
            <div class="space-y-2">
                <label
                    data-slot="label"
                    class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                    for="${fieldName}"
                >Type de carte</label>
                <select
                    data-slot="input"
                    id="${fieldName}"
                    name="${fieldName}"
                    class="border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                    <option value="STANDARD" ${normalizedType === 'STANDARD' ? 'selected' : ''}>Standard</option>
                    <option value="PREMIUM" ${normalizedType === 'PREMIUM' ? 'selected' : ''}>Premium</option>
                </select>
            </div>
        `;
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
                .then(window.safeJson)
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
                .then(window.safeJson)
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
            if (cardBtn.dataset.loading === '1') {
                return;
            }

            const loyaltyId = cardBtn.getAttribute('data-id');
            cardBtn.dataset.loading = '1';
            cardBtn.disabled = true;

            fetch(`/loyalty/${loyaltyId}/get/`)
                .then(window.safeJson)
                .then(data => {
                    if (data.success) {
                        return cardLoyalty(data.loyalty);
                    }
                    throw new Error(data.error || 'Impossible de générer la carte fidélité.');
                })
                .catch(err => {
                    console.error('Erreur lors de la récupération de la carte :', err);
                    alert(err.message || 'Erreur lors de la génération de la carte fidélité.');
                })
                .finally(() => {
                    cardBtn.disabled = false;
                    delete cardBtn.dataset.loading;
                });
        }
    });

    function addLoyalty(){
        modalContainer.innerHTML = `
            <div
                role="dialog"
                data-state="open"
                data-slot="dialog-content"
                class="modal-custom bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]"
                tabindex="-1"
                style="pointer-events: auto"
            >
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 data-slot="dialog-title" class="text-lg leading-none font-semibold">Nouvelle carte fidélité</h2>
                    <p data-slot="card-description" class="text-muted-foreground text-sm">
                        Choisissez le type de carte avant la création.
                    </p>
                </div>
                <form class="grid gap-4 py-4" id="addLoyaltyForm">
                    ${renderCardTypeField('STANDARD', 'add_card_type')}
                    <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                            data-slot="button"
                            class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2"
                            type="submit"
                        >
                            Créer la carte
                        </button>
                    </div>
                </form>
                <button
                    type="button"
                    data-slot="dialog-close"
                    id="closeModal"
                    class="absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x">
                        <path d="M18 6 6 18"></path>
                        <path d="m6 6 12 12"></path>
                    </svg>
                    <span class="sr-only">Close</span>
                </button>
            </div>
        `;

        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('addLoyaltyForm');

        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            const cardType = normalizeCardType(document.getElementById('add_card_type')?.value);

            fetch(`/loyalty/add/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({ card_type: cardType })
            })
                .then(window.safeJson)
                .then(response => {
                    if (!response.success) {
                        throw new Error(response.error || 'Impossible de créer la carte.');
                    }
                    location.reload();
                })
                .catch(err => {
                    console.error('Erreur', err);
                    alert(err.message || 'Impossible de contacter le serveur.');
                });
        });
    }

    function deleteLoyalty(loyaltyId){
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
                    ${renderCardTypeField(loyalty.card_type || 'STANDARD', 'card_type')}
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
                        <form id="scanHiddenForm" class="w-full opacity-0 h-0 overflow-hidden">
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
        const closeModal = document.getElementById('closeModal');
        // Fermer le modal
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        const scanForm = document.getElementById('scanHiddenForm');
        const scanInput = document.getElementById('scan');
        let isScanInProgress = false;

        const handleScan = async () => {
            if (!scanInput || isScanInProgress) {
                return;
            }

            const cartValue = extractScanValue(scanInput.value);
            if (!cartValue) {
                return;
            }

            if (!/^[a-f0-9]{64}$/.test(cartValue)) {
                return;
            }

            isScanInProgress = true;
            try {
                const loyalty = await scanCart(cartValue);
                if (!loyalty) {
                    scanInput.select();
                    return;
                }
                scanInput.value = '';
            } finally {
                isScanInProgress = false;
            }
        };

        if (scanForm) {
            scanForm.addEventListener('submit', function (event) {
                event.preventDefault();
                void handleScan();
            });
        }

        scanInput.focus();
        scanInput.addEventListener('input', function () {
            const rawValue = this.value.trim().toLowerCase();
            if (rawValue.length >= 64 || rawValue.includes('scan=')) {
                void handleScan();
            }
        });
        scanInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                void handleScan();
            }
        });
    }

    function extractScanValue(rawValue) {
        const value = (rawValue || '').trim();
        if (!value) {
            return '';
        }

        try {
            const scannedUrl = new URL(value);
            const scanParam = scannedUrl.searchParams.get('scan');
            if (scanParam) {
                return scanParam.trim().toLowerCase();
            }
        } catch (error) {
            // Valeur brute: pas une URL.
        }

        const hashMatch = value.match(/[a-f0-9]{64}/i);
        if (hashMatch) {
            return hashMatch[0].toLowerCase();
        }

        return value.toLowerCase();
    }

    async function scanCart(cartValue) {
        const normalizedCartValue = cartValue.trim().toLowerCase();

        for (const loyalty of loyaltiesData) {

            const setting = loyalty.setting;
            const cardId = loyalty.card_id;
            const loyaltyId = loyalty.id;

            // Vérifie l'ancien format (LOYALTY2026) et le format courant (id réel)
            const basesToCheck = new Set([
                `${setting}|${cardId}|${loyaltyId}`,
                `${setting}|${cardId}|LOYALTY2026`,
            ]);

            for (const base of basesToCheck) {
                const msgUint8 = new TextEncoder().encode(base);
                const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const secureId = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

                if (secureId === normalizedCartValue) {
                    viewOption(loyalty);
                    return loyalty; // On retourne la carte trouvée
                }
            }
        }
        return null;
    }

    function viewOption(loyalty){
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
                    Vue d'ensemble
                    </h2>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <button type="button" id="info" class="p-6 bg-muted rounded-lg text-center">
                        <p class="text-2xl font-bold">INFORMATION</p>
                    </button>
                    <button type="button" id="history" class="p-6 bg-muted rounded-lg text-center">
                        <p class="text-2xl font-bold">HISTORIQUE</p>
                    </button>
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
        const closeModal = document.getElementById('closeModal');
        const info = document.getElementById('info');
        const history = document.getElementById('history');
        // Fermer le modal
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        info.addEventListener('click', () => {
            scanLoyalty(loyalty);
        });
        history.addEventListener('click', () => {
            historyClient(loyalty);
        });
    }

    function historyClient(loyalty){
        fetch(`/loyalty/${loyalty.id}/history/`)
                .then(window.safeJson)
                .then(data => {
                    if (data.success) {
                        historyLoyalty(data.histories);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération des donneés :", err);
                });
    }

    function historyLoyalty(histories){
        modalContainer.innerHTML = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div data-slot="card" class="text-card-foreground gap-6 rounded-xl border py-6 shadow-sm w-full max-w-2xl max-h-[90vh] flex flex-col bg-background">
                    <div class="flex items-center justify-between p-6 border-b border-border">
                        <h2 class="text-2xl font-bold text-foreground">Historique du client</h2>
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
                </div>
            </div>
        
        `;
        const closeModal = document.getElementById('closeModal');
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        const cartItems = document.getElementById('cart-items');

        let itemsHTML = Object.entries(histories).map(([id,item]) => `
            <div class="flex gap-4 pb-4 border-b border-border">
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-lg text-foreground truncate">
                        Le ${item.date}, ${item.note}
                    </h3>
                    <p class="text-muted-foreground text-sm">${item.points} points / ${item.move_type} qui nous donne ${item.balance_after} points / balance</p>
                </div>
            </div>
        `).join('');

        cartItems.innerHTML = itemsHTML;
    }

    function scanLoyalty(loyalty){
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

    function loadExternalScript(src) {
        return new Promise((resolve, reject) => {
            const existingScript = document.querySelector(`script[src="${src}"]`);
            if (existingScript) {
                if (existingScript.dataset.loaded === '1') {
                    resolve();
                    return;
                }

                existingScript.addEventListener('load', () => resolve(), { once: true });
                existingScript.addEventListener('error', () => reject(new Error(`Impossible de charger ${src}`)), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.addEventListener('load', () => {
                script.dataset.loaded = '1';
                resolve();
            }, { once: true });
            script.addEventListener('error', () => reject(new Error(`Impossible de charger ${src}`)), { once: true });
            document.head.appendChild(script);
        });
    }

    async function loadPdfJs() {
        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = loyaltyPdfWorkerUrl;
            return window.pdfjsLib;
        }

        if (!loyaltyPdfJsPromise) {
            loyaltyPdfJsPromise = loadExternalScript(loyaltyPdfLibUrl)
                .then(() => {
                    if (!window.pdfjsLib) {
                        throw new Error("La librairie PDF.js n'est pas disponible.");
                    }
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = loyaltyPdfWorkerUrl;
                    return window.pdfjsLib;
                })
                .catch(error => {
                    loyaltyPdfJsPromise = null;
                    throw error;
                });
        }

        return loyaltyPdfJsPromise;
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Impossible de lire le fichier généré.'));
            reader.readAsDataURL(blob);
        });
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Impossible de charger le QR code généré.'));
            image.src = src;
        });
    }

    async function buildLoyaltyCenterLogoDataUrl() {
        if (!loyaltyLogoPromise) {
            loyaltyLogoPromise = (async () => {
                const sourceImage = await loadImage(loyaltyLogoUrl);
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');

                if (!context) {
                    throw new Error('Impossible de préparer le logo fidélité.');
                }

                canvas.width = sourceImage.width;
                canvas.height = sourceImage.height;
                context.drawImage(sourceImage, 0, 0);

                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const pixels = imageData.data;

                for (let index = 0; index < pixels.length; index += 4) {
                    if (pixels[index + 3] === 0) {
                        continue;
                    }

                    pixels[index] = 255 - pixels[index];
                    pixels[index + 1] = 255 - pixels[index + 1];
                    pixels[index + 2] = 255 - pixels[index + 2];
                }

                context.putImageData(imageData, 0, 0);
                return canvas.toDataURL('image/png');
            })().catch(error => {
                loyaltyLogoPromise = null;
                throw error;
            });
        }

        return loyaltyLogoPromise;
    }

    function buildRoundedRectPath(context, x, y, width, height, radius) {
        const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
        context.beginPath();
        context.moveTo(x + safeRadius, y);
        context.lineTo(x + width - safeRadius, y);
        context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
        context.lineTo(x + width, y + height - safeRadius);
        context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
        context.lineTo(x + safeRadius, y + height);
        context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
        context.lineTo(x, y + safeRadius);
        context.quadraticCurveTo(x, y, x + safeRadius, y);
        context.closePath();
    }

    async function buildRoundedLoyaltyQrCard(qrDataUrl) {
        const [qrImage, centerLogoDataUrl] = await Promise.all([
            loadImage(qrDataUrl),
            buildLoyaltyCenterLogoDataUrl()
        ]);
        const centerLogoImage = await loadImage(centerLogoDataUrl);
        const canvasSize = 1200;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        if (!context) {
            throw new Error('Impossible de préparer la carte fidélité.');
        }

        canvas.width = canvasSize;
        canvas.height = canvasSize;

        const radius = (loyaltyQrZone.radius / loyaltyQrZone.size) * canvasSize;
        buildRoundedRectPath(context, 0, 0, canvasSize, canvasSize, radius);
        context.clip();
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, canvasSize, canvasSize);
        context.drawImage(qrImage, 0, 0, canvasSize, canvasSize);

        const centerX = canvasSize / 2;
        const centerY = canvasSize / 2;
        const logoSize = canvasSize * 0.14;
        const logoPadding = logoSize * 0.32;

        context.save();
        context.fillStyle = '#FFFFFF';
        context.beginPath();
        context.arc(centerX, centerY, (logoSize / 2) + logoPadding, 0, Math.PI * 2);
        context.fill();
        context.restore();

        context.drawImage(
            centerLogoImage,
            centerX - (logoSize / 2),
            centerY - (logoSize / 2),
            logoSize,
            logoSize
        );

        return canvas.toDataURL('image/png');
    }

    async function buildSecureLoyaltyId(loyalty) {
        const loyaltyId = loyalty.id ?? 'LOYALTY2026';
        const setting = loyalty.setting ?? '';
        const cardId = loyalty.card_id ?? loyaltyId;
        const base = `${setting}|${cardId}|${loyaltyId}`;
        const data = new TextEncoder().encode(base);
        const hash = await crypto.subtle.digest('SHA-256', data);

        return Array.from(new Uint8Array(hash))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    }

    async function buildLoyaltyQrDataUrl(secureId) {
        if (typeof QRCodeStyling === 'undefined') {
            throw new Error("La librairie QRCodeStyling n'est pas chargée.");
        }

        const qr = new QRCodeStyling({
            width: 1024,
            height: 1024,
            data: secureId,
            margin: 18,
            qrOptions: {
                errorCorrectionLevel: 'H'
            },
            dotsOptions: {
                color: '#000000',
                type: 'rounded'
            },
            cornersSquareOptions: {
                color: '#000000',
                type: 'extra-rounded'
            },
            cornersDotOptions: {
                color: '#000000',
                type: 'square'
            },
            backgroundOptions: {
                color: '#FFFFFF'
            }
        });

        const blob = await qr.getRawData('png');
        return blobToDataUrl(blob);
    }

    async function renderLoyaltyTemplatePages(cardType = 'STANDARD') {
        const normalizedType = normalizeCardType(cardType);

        if (!loyaltyTemplatePromises[normalizedType]) {
            loyaltyTemplatePromises[normalizedType] = (async () => {
                const pdfjsLib = await loadPdfJs();
                const templateUrl = loyaltyTemplateUrls[normalizedType];
                const response = await fetch(templateUrl, { cache: 'no-cache' });

                if (!response.ok) {
                    throw new Error('Impossible de charger le modèle PDF fidélité.');
                }

                const pdfData = await response.arrayBuffer();
                const pdfDocument = await pdfjsLib.getDocument({ data: pdfData }).promise;
                const pages = [];

                for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
                    const page = await pdfDocument.getPage(pageNumber);
                    const layoutViewport = page.getViewport({ scale: 1 });
                    const renderViewport = page.getViewport({ scale: 4 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d', { alpha: false });

                    if (!context) {
                        throw new Error('Impossible de préparer le rendu du modèle fidélité.');
                    }

                    canvas.width = renderViewport.width;
                    canvas.height = renderViewport.height;

                    await page.render({
                        canvasContext: context,
                        viewport: renderViewport
                    }).promise;

                    pages.push({
                        width: layoutViewport.width,
                        height: layoutViewport.height,
                        image: canvas.toDataURL('image/png')
                    });
                }

                return pages;
            })().catch(error => {
                delete loyaltyTemplatePromises[normalizedType];
                throw error;
            });
        }

        return loyaltyTemplatePromises[normalizedType];
    }

    async function cardLoyalty(loyalty) {
        if (!window.jspdf?.jsPDF) {
            alert("La librairie PDF n'est pas chargée.");
            return null;
        }

        try {
            const normalizedCardType = normalizeCardType(loyalty.card_type);
            const [secureId, templatePages] = await Promise.all([
                buildSecureLoyaltyId(loyalty),
                renderLoyaltyTemplatePages(normalizedCardType)
            ]);
            const qrDataUrl = await buildLoyaltyQrDataUrl(secureId);
            const roundedQrDataUrl = await buildRoundedLoyaltyQrCard(qrDataUrl);
            const { jsPDF } = window.jspdf;

            if (!templatePages.length) {
                throw new Error('Le modèle PDF fidélité est vide.');
            }

            const firstPage = templatePages[0];
            const firstOrientation = firstPage.width >= firstPage.height ? 'landscape' : 'portrait';
            const documentPdf = new jsPDF({
                orientation: firstOrientation,
                unit: 'pt',
                format: [firstPage.width, firstPage.height],
                compress: true
            });

            templatePages.forEach((page, index) => {
                if (index > 0) {
                    const orientation = page.width >= page.height ? 'landscape' : 'portrait';
                    documentPdf.addPage([page.width, page.height], orientation);
                }

                documentPdf.addImage(page.image, 'PNG', 0, 0, page.width, page.height, undefined, 'FAST');

                if (index === loyaltyQrZone.pageIndex) {
                    documentPdf.addImage(roundedQrDataUrl, 'PNG', loyaltyQrZone.x, loyaltyQrZone.y, loyaltyQrZone.size, loyaltyQrZone.size, undefined, 'FAST');
                }
            });

            const fileId = loyalty.card_id || loyalty.id || 'card';
            documentPdf.save(`loyalty-${fileId}.pdf`);
            return secureId;
        } catch (error) {
            console.error('Erreur lors de la génération de la carte fidélité :', error);
            alert(error.message || 'Impossible de générer la carte fidélité.');
            return null;
        }
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

    let allRows = Array.from(document.querySelectorAll("#loyaltyTable tbody tr"));
    let rows = allRows.filter(row => !row.textContent.includes("Aucun carte trouvé."));

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
            // afficher la ligne "Aucun carte trouvé."
            const noDataRow = allRows.find(row => row.textContent.includes("Aucun carte trouvé."));
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

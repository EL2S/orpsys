document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('searchInput');
    const employeeTable = document.getElementById('employeeTable');
    const tableBody = employeeTable.querySelector('tbody');
    const tableRows = tableBody.getElementsByTagName('tr');
    const addButton = document.getElementById('add-button');
    const modalContainer = document.getElementById('modalContainer');
    const permissions = document.getElementById('permissions');
    let itemsData = [];
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
    if (permissions) {
        itemsData = JSON.parse(permissions.value || "[]");
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
                td.colSpan = employeeTable.querySelectorAll('th').length;
                td.className = 'text-center py-4';
                td.textContent = 'Aucun employé trouvé.';
                tr.appendChild(td);
                tableBody.appendChild(tr);
            }
        } else {
            const noResults = tableBody.querySelector('.no-results');
            if (noResults) noResults.remove();
        }
    });
    addButton.addEventListener('click', function () {
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
            Ajouter un employé
            </h2>
        </div>
        <form class="grid gap-4 py-4" id="addForm" method="POST" enctype="multipart/form-data">
            <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
            <input type="hidden" name="type" value="add">
            <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                    <label
                    data-slot="label"
                    class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                    for="first_name"
                    >Prénom</label
                    ><input
                    data-slot="input"
                    class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                    id="first_name"
                    name="first_name"
                    required=""
                    
                    />
                </div>
                <div class="space-y-2">
                    <label
                    data-slot="label"
                    class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                    for="last_name"
                    >Nom</label
                    ><input
                    data-slot="input"
                    class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                    id="last_name"
                    name="last_name"
                    required=""
                    
                    />
                </div>
            </div>
            <div class="space-y-2">
            <label
                data-slot="label"
                class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                for="email"
                >Email</label
            ><input
                data-slot="input"
                class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                id="email"
                name="email"
                required=""
                type="email"
                
            />
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                    <label
                    data-slot="label"
                    class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                    for="role"
                    >Rôle</label
                    ><select
                    id="role"
                    name="role"
                    class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                    <option value="Administrateur">Administrateur</option>
                    <option value="Gérant">Gérant</option>
                    <option value="Caissier">Caissier</option>
                    <option value="Employé" selected="">Employé</option>
                    </select>
                </div>
                <div class="space-y-2">
                    <label
                    data-slot="label"
                    class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                    for="salary"
                    >Salaire</label
                    ><input
                    data-slot="input"
                    class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                    id="salary"
                    name="salary"
                    required=""
                    type="number"
                    value="0"
                    />
                </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                    <label
                    data-slot="label"
                    class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                    for="password"
                    >Mot de passe</label
                    ><input
                    data-slot="input"
                    class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                    id="password"
                    name="password"
                    required=""
                    type="password"
                    />
                </div>
                <div class="space-y-2">
                    <label
                    data-slot="label"
                    class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                    for="confirm_password"
                    >Confirmez le mot de passe</label
                    ><input
                    data-slot="input"
                    class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                    id="confirm_password"
                    name="confirm_password"
                    required=""
                    type="password"
                    />
                </div>
            </div>
            <div id="permission-employer"></div>
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
        const form = document.getElementById('addForm');
        const permission = document.getElementById('permission-employer');
        const role = document.getElementById('role');

        role.addEventListener('change', () => {
            permission.innerHTML = ``;
            if (role.value === "Gérant" || role.value === "Caissier") {
                let optionsHTML = itemsData.map(item => `
                    <option value="${item.id}" title="${item.name}">${item.name}</option>
                `).join('');
                permission.className = "grid";
                permission.innerHTML = `
                <div class="form-extra">
                    <div class="available">
                        <div class="leading-none font-semibold">Autorisations disponibles</div>
                        <div class="liste-extra">
                            <select multiple name="aut_ch" id="aut_ch">
                                ${optionsHTML}
                            </select>
                        </div>
                    </div>
                    <div class="arrow-controls">
                        <div class="icon-btn" id="move_right">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-chevron-right fs-5">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg> 
                        </div>
                        <div class="icon-btn" id="move_left">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-chevron-left text-body fs-5">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg> 
                        </div>
                    </div>
                    <div class="chosen">
                        <div class="leading-none font-semibold">Autorisations choisies</div>
                        <div class="liste-extra">
                            <select multiple name="aut_rem" id="aut_rem">
                            </select>
                        </div>
                    </div>
                </div>
            `;
                const moveRightIcon = document.getElementById('move_right');
                const moveLeftIcon = document.getElementById('move_left');
                const sourceSelect = document.getElementById('aut_ch');
                const destinationSelect = document.getElementById('aut_rem');
                updateArrowStates();
                function updateArrowStates() {
                    if (moveRightIcon && sourceSelect) {
                        if (sourceSelect.selectedOptions.length > 0) {
                            moveRightIcon.removeAttribute('disabled');
                            moveRightIcon.classList.remove('disabled');
                        } else {
                            moveRightIcon.setAttribute('disabled', 'true');
                            moveRightIcon.classList.add('disabled');
                        }
                    }

                    if (moveLeftIcon && destinationSelect) {
                        if (destinationSelect.selectedOptions.length > 0) {
                            moveLeftIcon.removeAttribute('disabled');
                            moveLeftIcon.classList.remove('disabled');
                        } else {
                            moveLeftIcon.setAttribute('disabled', 'true');
                            moveLeftIcon.classList.add('disabled');
                        }
                    }
                }

                // 🔹 Écoute des changements sur les listes
                if (sourceSelect) {
                    sourceSelect.addEventListener('change', updateArrowStates);
                }
                if (destinationSelect) {
                    destinationSelect.addEventListener('change', updateArrowStates);
                }

                // 🔹 Déplacer les options vers la droite
                if (moveRightIcon) {
                    moveRightIcon.addEventListener('click', function () {
                        if (moveRightIcon.classList.contains('disabled')) {
                            return;
                        }

                        const selectedOptions = Array.from(sourceSelect.selectedOptions);
                        selectedOptions.forEach(option => {
                            destinationSelect.appendChild(option);
                            option.selected = false;
                        });
                        updateArrowStates();
                    });
                }

                // 🔹 Déplacer les options vers la gauche
                if (moveLeftIcon) {
                    moveLeftIcon.addEventListener('click', function () {
                        if (moveLeftIcon.classList.contains('disabled')) {
                            return;
                        }

                        const selectedOptions = Array.from(destinationSelect.selectedOptions);
                        selectedOptions.forEach(option => {
                            sourceSelect.appendChild(option);
                            option.selected = false;
                        });
                        updateArrowStates();
                    });
                }
            }

        });
        // Fermer le modal
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        form.addEventListener('submit', function (e) {
            e.preventDefault(); // Empêche l'envoi immédiat

            // Suppression des anciens messages d’erreur
            form.querySelectorAll('.error-msg').forEach(el => el.remove());

            let hasError = false;

            // ==========================
            // 🔹  Validation Mot de passe
            // ==========================

            const password = form.querySelector('#password');
            const confirmPassword = form.querySelector('#confirm_password');

            if (password && confirmPassword) {
                if (password.value.trim() !== confirmPassword.value.trim()) {
                    hasError = true;
                    confirmPassword.insertAdjacentHTML('afterend',
                        `<div class="error-msg text-red-600 text-sm mt-1">
                            Les mots de passe ne correspondent pas.
                        </div>`
                    );
                }
            }

            // ======================================
            // 🔹  Validation des permissions (si rôle)
            // ======================================

            const role = form.querySelector('#role');
            const destinationSelect = form.querySelector('#aut_rem'); // autorisations choisies

            if ((role.value === "Gérant" || role.value === "Caissier") && destinationSelect) {
                if (destinationSelect.options.length === 0) {
                    hasError = true;
                    destinationSelect.insertAdjacentHTML('afterend',
                        `<div class="error-msg text-red-600 text-sm mt-1">
                            Vous devez sélectionner au moins une autorisation.
                        </div>`
                    );
                }
            }

            // Si erreur → on n’envoie pas
            if (hasError) {
                return;
            }

            // ======================================================
            // 🔹 Si aucune erreur → sélectionner les options choisies
            // ======================================================

            if (destinationSelect) {
                Array.from(destinationSelect.options).forEach(option => {
                    option.selected = true;
                });
            }

            // Envoyer le formulaire
            form.submit();
        });

    });
    employeeTable.addEventListener('click', function (event) {
        const deleteBtn = event.target.closest('.delete-button');
        if (deleteBtn) {
            const employeeId = deleteBtn.getAttribute('data-id');
            deleteEmployee(employeeId);
        }
        const changeBtn = event.target.closest('.change-button');
        if (changeBtn) {
            const employeeId = changeBtn.getAttribute('data-id');
            fetch(`/employer/${employeeId}/get/`)
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        changeEmployee(data.employer, employeeId);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération de l'employé:", err);
                });
        }
        const badgeBtn = event.target.closest('.badge-button');
        if (badgeBtn) {
            const employeeId = badgeBtn.getAttribute('data-id');
            fetch(`/employer/${employeeId}/get/`)
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        badgeEmployee(data.employer, employeeId);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération de l'employé:", err);
                });
        }
    });

    async function badgeEmployee(employer, employeeId) {
        const setting = employer.setting;     
        const badgeId = employer.badge_id;    

        // Base de génération
        const base = `${setting}|${badgeId}|${employeeId}`;

        // Convertir en bytes
        const msgUint8 = new TextEncoder().encode(base);

        // Hash SHA-256
        const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);

        // Buffer → hex (64 caractères)
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const secureId = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

        console.log("Secure badge ID:", secureId);

        return secureId;
    }

    function changeEmployee(employer, employeeId) {
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
                    Changer l'employé
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="changeForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="employer_id" value="${employeeId}">
                    <input type="hidden" name="type" value="change">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="first_name"
                            >Prénom</label
                            ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            id="first_name"
                            name="first_name"
                            required=""
                            value="${employer.first_name}"
                            />
                        </div>
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="last_name"
                            >Nom</label
                            ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            id="last_name"
                            name="last_name"
                            required=""
                            value="${employer.last_name}"
                            />
                        </div>
                    </div>
                    <div class="space-y-2">
                    <label
                        data-slot="label"
                        class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                        for="email"
                        >Email</label
                    ><input
                        data-slot="input"
                        class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                        id="email"
                        name="email"
                        required=""
                        type="email"
                        value="${employer.email}"
                    />
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="role"
                            >Rôle</label
                            ><select
                            id="role"
                            name="role"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                                <option value="Administrateur" ${employer.role === "Administrateur" ? "selected" : ""}>Administrateur</option>
                                <option value="Gérant" ${employer.role === "Gérant" ? "selected" : ""}>Gérant</option>
                                <option value="Caissier" ${employer.role === "Caissier" ? "selected" : ""}>Caissier</option>
                                <option value="Employé" ${employer.role === "Employé" ? "selected" : ""}>Employé</option>
                            </select>
                        </div>
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="salary"
                            >Salaire</label
                            ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            id="salary"
                            name="salary"
                            required=""
                            type="number"
                            value="${employer.salary}"
                            />
                        </div>
                    </div>
                    <div class="space-y-2" id="password-section">
                        <div class="flex items-center text-sm font-medium text-primary label-password" id="label-password">Mettre à jour le mot de passe →</div>
                    </div>
                    <div id="permission-employer"></div>
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
        const form = document.getElementById('changeForm');
        const permission = document.getElementById('permission-employer');
        const role = document.getElementById('role');
        const section = document.getElementById('password-section');
        const label = document.getElementById('label-password');
        label.addEventListener('click', () => {
            section.innerHTML = `
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <label
                        data-slot="label"
                        class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                        for="password"
                        >Mot de passe</label
                        ><input
                        data-slot="input"
                        class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                        id="password"
                        name="password"
                        required=""
                        type="password"
                        />
                    </div>
                    <div class="space-y-2">
                        <label
                        data-slot="label"
                        class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                        for="confirm_password"
                        >Confirmez le mot de passe</label
                        ><input
                        data-slot="input"
                        class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                        id="confirm_password"
                        name="confirm_password"
                        required=""
                        type="password"
                        />
                    </div>
                </div>
            `;
        });
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        getPermissionsForRole();
        role.addEventListener('change', () => {
            getPermissionsForRole();
        });
        function getPermissionsForRole() {
            permission.innerHTML = ``;
            if (role.value === "Gérant" || role.value === "Caissier") {
                let optionsHTML = employer.permissions.map(item => `
                    <option value="${item.id}" title="${item.name}">${item.name}</option>
                `).join('');
                let chosensHTML = employer.user_permissions.map(item => `
                    <option value="${item.id}" title="${item.name}">${item.name}</option>
                `).join('');
                permission.className = "grid";
                permission.innerHTML = `
                <div class="form-extra">
                    <div class="available">
                        <div class="leading-none font-semibold">Autorisations disponibles</div>
                        <div class="liste-extra">
                            <select multiple name="aut_ch" id="aut_ch">
                                ${optionsHTML}
                            </select>
                        </div>
                    </div>
                    <div class="arrow-controls">
                        <div class="icon-btn" id="move_right">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-chevron-right fs-5">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg> 
                        </div>
                        <div class="icon-btn" id="move_left">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-chevron-left text-body fs-5">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg> 
                        </div>
                    </div>
                    <div class="chosen">
                        <div class="leading-none font-semibold">Autorisations choisies</div>
                        <div class="liste-extra">
                            <select multiple name="aut_rem" id="aut_rem">
                                ${chosensHTML}
                            </select>
                        </div>
                    </div>
                </div>
            `;
                const moveRightIcon = document.getElementById('move_right');
                const moveLeftIcon = document.getElementById('move_left');
                const sourceSelect = document.getElementById('aut_ch');
                const destinationSelect = document.getElementById('aut_rem');
                updateArrowStates();
                function updateArrowStates() {
                    if (moveRightIcon && sourceSelect) {
                        if (sourceSelect.selectedOptions.length > 0) {
                            moveRightIcon.removeAttribute('disabled');
                            moveRightIcon.classList.remove('disabled');
                        } else {
                            moveRightIcon.setAttribute('disabled', 'true');
                            moveRightIcon.classList.add('disabled');
                        }
                    }

                    if (moveLeftIcon && destinationSelect) {
                        if (destinationSelect.selectedOptions.length > 0) {
                            moveLeftIcon.removeAttribute('disabled');
                            moveLeftIcon.classList.remove('disabled');
                        } else {
                            moveLeftIcon.setAttribute('disabled', 'true');
                            moveLeftIcon.classList.add('disabled');
                        }
                    }
                }

                // 🔹 Écoute des changements sur les listes
                if (sourceSelect) {
                    sourceSelect.addEventListener('change', updateArrowStates);
                }
                if (destinationSelect) {
                    destinationSelect.addEventListener('change', updateArrowStates);
                }

                // 🔹 Déplacer les options vers la droite
                if (moveRightIcon) {
                    moveRightIcon.addEventListener('click', function () {
                        if (moveRightIcon.classList.contains('disabled')) {
                            return;
                        }

                        const selectedOptions = Array.from(sourceSelect.selectedOptions);
                        selectedOptions.forEach(option => {
                            destinationSelect.appendChild(option);
                            option.selected = false;
                        });
                        updateArrowStates();
                    });
                }

                // 🔹 Déplacer les options vers la gauche
                if (moveLeftIcon) {
                    moveLeftIcon.addEventListener('click', function () {
                        if (moveLeftIcon.classList.contains('disabled')) {
                            return;
                        }

                        const selectedOptions = Array.from(destinationSelect.selectedOptions);
                        selectedOptions.forEach(option => {
                            sourceSelect.appendChild(option);
                            option.selected = false;
                        });
                        updateArrowStates();
                    });
                }
            }
        }
        form.addEventListener('submit', function (e) {
            e.preventDefault(); // Empêche l'envoi immédiat

            // Suppression des anciens messages d’erreur
            form.querySelectorAll('.error-msg').forEach(el => el.remove());

            let hasError = false;

            // ==========================
            // 🔹  Validation Mot de passe
            // ==========================

            const password = form.querySelector('#password');
            const confirmPassword = form.querySelector('#confirm_password');

            if (password && confirmPassword) {
                if (password.value.trim() !== confirmPassword.value.trim()) {
                    hasError = true;
                    confirmPassword.insertAdjacentHTML('afterend',
                        `<div class="error-msg text-red-600 text-sm mt-1">
                            Les mots de passe ne correspondent pas.
                        </div>`
                    );
                }
            }
            // ======================================
            // 🔹  Validation des permissions (si rôle)
            // ======================================

            const role = form.querySelector('#role');
            const destinationSelect = form.querySelector('#aut_rem'); // autorisations choisies

            if ((role.value === "Gérant" || role.value === "Caissier") && destinationSelect) {
                if (destinationSelect.options.length === 0) {
                    hasError = true;
                    destinationSelect.insertAdjacentHTML('afterend',
                        `<div class="error-msg text-red-600 text-sm mt-1">
                            Vous devez sélectionner au moins une autorisation.
                        </div>`
                    );
                }
            }

            // Si erreur → on n’envoie pas
            if (hasError) {
                return;
            }

            // ======================================================
            // 🔹 Si aucune erreur → sélectionner les options choisies
            // ======================================================

            if (destinationSelect) {
                Array.from(destinationSelect.options).forEach(option => {
                    option.selected = true;
                });
            }

            // Envoyer le formulaire
            form.submit();
        });
    }
    function deleteEmployee(employeeId) {
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
                    <p class="flex items-center text-sm font-medium text-primary">Êtes-vous sûr de vouloir supprimer cet employé ? Cette action est irréversible.</p>
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
        const closeModal = document.getElementById('closeModal');
        const confirmDelete = document.getElementById('confirmDelete');
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        confirmDelete.addEventListener('click', () => {
            window.location.href = `/employer/${employeeId}/delete/`;
        });
    }

    let allRows = Array.from(document.querySelectorAll("#employeeTable tbody tr"));
    let rows = allRows.filter(row => !row.textContent.includes("Aucun employé trouvé."));

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
            // afficher la ligne "Aucun employé trouvé."
            const noDataRow = allRows.find(row => row.textContent.includes("Aucun employé trouvé."));
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
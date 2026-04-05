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
        const rawPermissions = (permissions.textContent || "").trim();
        const parsed = JSON.parse(rawPermissions || "[]");
        itemsData = Array.isArray(parsed) ? parsed : [];
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
            <div class="grid grid-cols-2 gap-4">
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
                .then(window.safeJson)
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
                .then(window.safeJson)
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

    async function badgeEmployee(employer, employeeIdOverride) {
        const employeeId = employeeIdOverride ?? employer.id;
        if (!employeeId) {
            console.error("ID employé manquant pour générer le badge.");
            return;
        }
        const setting = employer.setting;     
        const badgeId = employer.badge_id;    

        // 🔐 Secure ID (IDENTIQUE à vos fichiers)
        const base = `${setting}|${badgeId}|${employeeId}`;
        const data = new TextEncoder().encode(base);
        const hash = await crypto.subtle.digest("SHA-256", data);

        const secureId = Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");

        // 📦 QR stylé (MÊME LOGIQUE que createStyledQR)
        const qr = new QRCodeStyling({
            width: 320,
            height: 320,
            data: secureId,
            image: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA+gAAAPoCAYAAABNo9TkAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAA+NpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDcuMi1jMDAwIDc5LjFiNjVhNzliNCwgMjAyMi8wNi8xMy0yMjowMTowMSAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0UmVmPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDpEMzdGOTBFRUVCREYxMUYwQjBCMjgwMTUzMDVDM0UzMCIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpEMzdGOTBFREVCREYxMUYwQjBCMjgwMTUzMDVDM0UzMCIgZGM6Zm9ybWF0PSJpbWFnZS9wbmciIHhtcDpDcmVhdGVEYXRlPSIyMDI1LTEyLTMwVDIzOjUzOjI0KzAxOjAwIiB4bXA6TW9kaWZ5RGF0ZT0iMjAyNi0wMS0wN1QxNjo0NSswMTowMCIgeG1wOk1ldGFkYXRhRGF0ZT0iMjAyNi0wMS0wN1QxNjo0NSswMTowMCIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgMjAyMiBXaW5kb3dzIj4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3Rh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`, // ⬅️ le même logo
            margin: 14,
            qrOptions: {
                errorCorrectionLevel: "H"
            },
            dotsOptions: {
                color: "#000000",
                type: "rounded"
            },
            cornersSquareOptions: {
                color: "#000000",
                type: "extra-rounded"
            },
            cornersDotOptions: {
                color: "#000000",
                type: "square"
            },
            backgroundOptions: {
                color: "#FFFFFF"
            },
            imageOptions: {
                hideBackgroundDots: true,
                imageSize: 0.30,
                margin: 10
            }
        });

        // ⬇️ Téléchargement (COMME dans downloadQR)
        const blob = await qr.getRawData("png");

        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `badge-${badgeId}.png`;
        document.body.appendChild(link);
        link.click();

        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

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
                    <div class="grid grid-cols-2 gap-4">
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

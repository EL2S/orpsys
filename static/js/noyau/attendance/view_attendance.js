document.addEventListener('DOMContentLoaded', function () {
    const attendanceBtn = document.getElementById("attendance-button");
    const scheduleBtn = document.getElementById("schedule-button");
    const modalContainer = document.getElementById('modalContainer');
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
    const attendanceTable = document.getElementById('attendanceTable');
    const tableBody = attendanceTable.querySelector('tbody');
    const tableRows = tableBody.getElementsByTagName('tr');
    const searchAttendance = document.getElementById('searchAttendance');
    const dayoffBtn = document.getElementById("add-dayoff");
    const shiftBtn = document.getElementById("add-shift");
    const shiftTable = document.getElementById('shiftTable');
    const employees = document.getElementById('employees');
    const searchDayoff = document.getElementById('searchDayoff');
    const dayoffTable = document.getElementById('dayoffTable');
    const dayoffBody = dayoffTable.querySelector('tbody');
    const dayoffRows = dayoffBody.getElementsByTagName('tr');
    const shifts_json = document.getElementById('shifts_json');
    const scanButton = document.getElementById('scan-button');
    const badges = document.getElementById('badges');
    const importBtn = document.getElementById('import-attendance');
    let badgesData = [];
    if (badges) {
        badgesData = JSON.parse(badges.value || "[]");
    }
    let shiftsData = [];
    if (shifts_json) {
        shiftsData = JSON.parse(shifts_json.value || "[]");
    }
    let employeesData = [];
    if (employees) {
        employeesData = JSON.parse(employees.value || "[]");
    }
    if (dayoffBtn) {
        dayoffBtn.addEventListener('click', () => {
            addDayOff();
        });
    }

    importBtn.addEventListener('click', function () {
        openModalImport();
    });

    function openModalImport(){
        modalContainer.innerHTML = `
            <div
                role="dialog"
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
                    Importez les heures d'arrivée et de départ 
                    </h2>
                </div>
                <div class="flex-1 space-y-4 mt-6" id="tab-badge">
                    <label for="excel-file" class="flex flex-col items-center space-y-6 p-4 border-2 border-dashed rounded-xl bg-muted/30 cursor-pointer hover:bg-muted/40 transition">
                        
                        <div class="w-32 h-32 rounded-full flex items-center justify-center bg-muted">
                            <!-- SVG Importation -->
                            <svg id="importIcon" xmlns="http://www.w3.org/2000/svg" 
                                class="w-16 h-16 text-muted-foreground"
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="currentColor" 
                                stroke-width="2"
                                stroke-linecap="round" 
                                stroke-linejoin="round">
                                <path d="M12 3v12"></path>
                                <path d="m8 11 4 4 4-4"></path>
                                <path d="M20 19H4"></path>
                            </svg>
                        </div>

                        <div class="text-center space-y-2">
                            <h3 class="font-medium text-lg" id="importTitle">Importez votre fichier</h3>
                            <p class="text-sm text-muted-foreground" id="importDesc">
                                Importez votre fichier Excel
                            </p>
                        </div>

                        <!-- Hidden input for auto-read badge -->
                        <form class="w-full opacity-0 h-0 overflow-hidden" 
                            id="importForm" 
                            method="POST" 
                            enctype="multipart/form-data">
                            <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                            <input type="hidden" name="type" value="import-attendance">
                            <input class="h-9 w-full rounded-md border px-3 py-1 bg-transparent" 
                                type="file" 
                                id="excel-file" 
                                name="excelInput" 
                                accept=".xlsx,.xls"/>
                        </form>

                    </label>
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
        const form = document.getElementById('importForm');
        const excelInput = document.getElementById('excelInput');
        excelInput.addEventListener('change', function () {
            startImportAnimation();
            setTimeout(() => form.submit(), 1200);
        });

    }

    function startImportAnimation() {
        // Changer le texte
        document.getElementById("importTitle").textContent = "Importation en cours…";
        document.getElementById("importDesc").textContent = "Veuillez patienter";

        // Changer le SVG → Spinner animé
        document.getElementById("importIcon").outerHTML = `
            <svg class="animate-spin w-16 h-16 text-primary"
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" fill="none">
                <circle class="opacity-25" cx="12" cy="12" r="10" 
                    stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" 
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
        `;
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
                    Scannez votre badge
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
        const closeModal = document.getElementById('closeModal');
        // Fermer le modal
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        const scanInput = document.getElementById('scan');
        scanInput.focus();
        scanInput.addEventListener('change', function () {
            const badgeValue = this.value.trim();
            if (badgeValue) {
                scanBadge(badgeValue);
            }
        });

    }

    async function scanBadge(badgeValue) {

        for (const badge of badgesData) {

            const setting = badge.setting;
            const badgeId = badge.badge_id;
            const employerId = badge.id;

            // Base de génération
            const base = `${setting}|${badgeId}|${employerId}`;

            // Convertir en bytes
            const msgUint8 = new TextEncoder().encode(base);

            // SHA-256
            const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);

            // Buffer → hex (64 chars)
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const secureId = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

            // Vérification
            if (secureId === badgeValue) {
                scanDayOff(parseInt(badge.dayoff_id));
                return badge; // On retourne la carte trouvée
            }
        }
    }

    function scanDayOff(dayoffId){
        fetch(`/attendance/dayoff/${dayoffId}/get/`)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                changeDayOff(data.dayoff, dayoffId);
            }
        })
        .catch(err => {
            console.error("Erreur lors de la récupération de l'horaire de travail et du jour de repos:", err);
        });
    }

    searchDayoff.addEventListener('input', function () {
        const filter = this.value.toLowerCase().trim();
        for (let row of dayoffRows) {
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
        let visibleRows = Array.from(dayoffRows).filter(row => row.style.display !== 'none' && !row.querySelector('td[colspan]'));
        if (visibleRows.length === 0) {
            if (!dayoffBody.querySelector('.no-results')) {
                const tr = document.createElement('tr');
                tr.className = 'no-results';
                const td = document.createElement('td');
                td.colSpan = shiftTable.querySelectorAll('th').length;
                td.className = 'text-center py-4';
                td.textContent = 'Aucun repos trouvé.';
                tr.appendChild(td);
                dayoffBody.appendChild(tr);
            }
        } else {
            const noResults = dayoffBody.querySelector('.no-results');
            if (noResults) noResults.remove();
        }
    });

    function addDayOff() {
        let optionsHTML = employeesData.map(employee => `
            <option value="${employee.id}" title="${employee.user__username}">${employee.user__username}</option>
        `).join('');
        let shiftsHTML = shiftsData.map(item => `
            <option value="${item.id}" title="De ${item.start_time} à ${item.end_time}">De ${item.start_time} à ${item.end_time}</option>
        `).join('');
        modalContainer.innerHTML = `
            <div role="dialog" aria-describedby="radix-_r_c_" aria-labelledby="radix-_r_b_" data-state="open" data-slot="dialog-content" class="modal-custom bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]" tabindex="-1" style="pointer-events: auto" >
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 id="radix-_r_b_" data-slot="dialog-title" class="text-lg leading-none font-semibold" >
                        Information du horaire de travail et du jour de repos
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="addDayoffForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="add-dayoff">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="employer_id"
                            >Employé </label
                            ><select
                            id="employer_id"
                            name="employer_id"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                                ${optionsHTML}
                            </select>
                        </div>
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="day"
                            >Jours de repos </label
                            ><select
                            id="day"
                            name="day"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                            <option value="Lundi">Lundi</option>
                            <option value="Mardi">Mardi</option>
                            <option value="Mércredit">Mércredit</option>
                            <option value="Jeudi">Jeudi</option>
                            <option value="Vendredi">Vendredi</option>
                            <option value="Samedi">Samedi</option>
                            <option value="Dimanche">Dimanche</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid">
                        <div class="form-extra">
                            <div class="available">
                                <div class="leading-none font-semibold">Horaires disponibles</div>
                                <div class="liste-extra">
                                    <select multiple name="aut_ch" id="aut_ch">
                                        ${shiftsHTML}
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
                                <div class="leading-none font-semibold">Horaires choisies</div>
                                <div class="liste-extra">
                                    <select multiple name="aut_rem" id="aut_rem">
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end" >
                        <button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[&gt;svg]:px-3" type="submit">
                            Enregistrer
                        </button>
                    </div>
                </form>
                <button type="button" data-slot="dialog-close" id="closeModal" class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" >
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path></svg
                    ><span class="sr-only">Close</span>
                </button>
            </div>
        `;
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('addDayoffForm');
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        form.addEventListener('submit', function (e) {
            form.submit();
        });
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
        form.addEventListener('submit', function (e) {
            e.preventDefault(); // Empêche l'envoi immédiat

            // Suppression des anciens messages d’erreur
            form.querySelectorAll('.error-msg').forEach(el => el.remove());

            let hasError = false;
            const destinationSelect = form.querySelector('#aut_rem'); // autorisations choisies

            if (destinationSelect.options.length === 0) {
                hasError = true;
                destinationSelect.insertAdjacentHTML('afterend',
                    `<div class="error-msg text-red-600 text-sm mt-1">
                        Vous devez sélectionner au moins une horaire de travail.
                    </div>`
                );
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

    dayoffTable.addEventListener('click', function (event) {
        const deleteDayoffBtn = event.target.closest('.delete-button');
        if (deleteDayoffBtn) {
            const dayoffId = deleteDayoffBtn.getAttribute('data-id');
            deleteDayOff(dayoffId);
        }
        const changeDayoffBtn = event.target.closest('.change-button');
        if (changeDayoffBtn) {
            const dayoffId = changeDayoffBtn.getAttribute('data-id');
            fetch(`/attendance/dayoff/${dayoffId}/get/`)
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        changeDayOff(data.dayoff, dayoffId);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération de l'horaire de travail et du jour de repos:", err);
                });
        }
    });

    function deleteDayOff(dayoffId) {
        modalContainer.innerHTML = `
            <div
                role="dialog"
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
                    <p class="flex items-center text-sm font-medium text-primary">Êtes-vous sûr de vouloir supprimer cette vue d'ensemble de repos des horaires de travail de cet employé ? Cette action est irréversible.</p>
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
            window.location.href = `/attendance/dayoff/${dayoffId}/delete/`;
        });
    }

    function changeDayOff(dayoff, dayoffId) {
        let employeesHTML = dayoff.employees.map(employee => `
            <option value="${employee.id}" title="${employee.user__username}" ${employee.id === dayoffId ? "selected" : ""}>${employee.user__username}</option>
        `).join('');
        let shiftsHTML = dayoff.shifts.map(item => `
            <option value="${item.id}" title="De ${item.start_time} à ${item.end_time}">De ${item.start_time} à ${item.end_time}</option>
        `).join('');
        let optionsHTML = dayoff.employerShifts.map(item => `
            <option value="${item.id}" title="De ${item.start_time} à ${item.end_time}">De ${item.start_time} à ${item.end_time}</option>
        `).join('');
        modalContainer.innerHTML = `
            <div role="dialog" aria-describedby="radix-_r_c_" aria-labelledby="radix-_r_b_" data-state="open" data-slot="dialog-content" class="modal-custom bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]" tabindex="-1" style="pointer-events: auto" >
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 id="radix-_r_b_" data-slot="dialog-title" class="text-lg leading-none font-semibold" >
                        Information du horaire de travail et du jour de repos
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="changeDayoffForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="change-dayoff">
                    <input type="hidden" name="dayoff_id" value="${dayoffId}">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="employer_id"
                            >Employé </label
                            ><select
                            id="employer_id"
                            name="employer_id"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                                ${employeesHTML}
                            </select>
                        </div>
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="day"
                            >Jours de repos </label
                            ><select
                            id="day"
                            name="day"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                            <option value="Lundi" ${dayoff.day === "Lundi" ? "selected" : ""}>Lundi</option>
                            <option value="Mardi" ${dayoff.day === "Mardi" ? "selected" : ""}>Mardi</option>
                            <option value="Mércredit" ${dayoff.day === "Mércredit" ? "selected" : ""}>Mércredit</option>
                            <option value="Jeudi" ${dayoff.day === "Jeudi" ? "selected" : ""}>Jeudi</option>
                            <option value="Vendredi" ${dayoff.day === "Vendredi" ? "selected" : ""}>Vendredi</option>
                            <option value="Samedi" ${dayoff.day === "Samedi" ? "selected" : ""}>Samedi</option>
                            <option value="Dimanche" ${dayoff.day === "Dimanche" ? "selected" : ""}>Dimanche</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid">
                        <div class="form-extra">
                            <div class="available">
                                <div class="leading-none font-semibold">Horaires disponibles</div>
                                <div class="liste-extra">
                                    <select multiple name="aut_ch" id="aut_ch">
                                        ${shiftsHTML}
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
                                <div class="leading-none font-semibold">Horaires choisies</div>
                                <div class="liste-extra">
                                    <select multiple name="aut_rem" id="aut_rem">
                                        ${optionsHTML}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end" >
                        <button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[&gt;svg]:px-3" type="submit">
                            Enregistrer
                        </button>
                    </div>
                </form>
                <button type="button" data-slot="dialog-close" id="closeModal" class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" >
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path></svg
                    ><span class="sr-only">Close</span>
                </button>
            </div>
        `;
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('changeDayoffForm');
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        form.addEventListener('submit', function (e) {
            form.submit();
        });
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
        form.addEventListener('submit', function (e) {
            e.preventDefault(); // Empêche l'envoi immédiat

            // Suppression des anciens messages d’erreur
            form.querySelectorAll('.error-msg').forEach(el => el.remove());

            let hasError = false;
            const destinationSelect = form.querySelector('#aut_rem'); // autorisations choisies

            if (destinationSelect.options.length === 0) {
                hasError = true;
                destinationSelect.insertAdjacentHTML('afterend',
                    `<div class="error-msg text-red-600 text-sm mt-1">
                        Vous devez sélectionner au moins une horaire de travail.
                    </div>`
                );
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

    if (shiftBtn) {
        shiftBtn.addEventListener('click', () => {
            addShift();
        });
    }

    function addShift() {
        modalContainer.innerHTML = `
            <div role="dialog" aria-describedby="radix-_r_c_" aria-labelledby="radix-_r_b_" data-state="open" data-slot="dialog-content" class=" bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]" tabindex="-1" style="pointer-events: auto" >
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 id="radix-_r_b_" data-slot="dialog-title" class="text-lg leading-none font-semibold" >
                        Information du horaires de travail
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="addShiftForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="add-shift">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="start_time"
                            >Arrivée</label
                            ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            type="time"
                            id="start_time"
                            name="start_time"
                            required=""
                            
                            />
                        </div>
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="end_time"
                            >Départ</label
                            ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            type="time"
                            id="end_time"
                            name="end_time"
                            required=""
                            
                            />
                        </div>
                    </div>
                    <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end" >
                        <button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[&gt;svg]:px-3" type="submit">
                            Enregistrer
                        </button>
                    </div>
                </form>
                <button type="button" data-slot="dialog-close" id="closeModal" class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" >
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path></svg
                    ><span class="sr-only">Close</span>
                </button>
            </div>
        `;
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('addShiftForm');
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        form.addEventListener('submit', function (e) {
            form.submit();
        });
    }

    shiftTable.addEventListener('click', function (event) {
        const deleteShiftBtn = event.target.closest('.delete-button');
        if (deleteShiftBtn) {
            const shiftId = deleteShiftBtn.getAttribute('data-id');
            deleteShift(shiftId);
        }
        const changeShiftBtn = event.target.closest('.change-button');
        if (changeShiftBtn) {
            const shiftId = changeShiftBtn.getAttribute('data-id');
            fetch(`/attendance/shift/${shiftId}/get/`)
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        changeShift(data.shift, shiftId);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération de l'horaire:", err);
                });
        }
    });

    function deleteShift(shiftId) {
        modalContainer.innerHTML = `
            <div
                role="dialog"
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
                    <p class="flex items-center text-sm font-medium text-primary">Êtes-vous sûr de vouloir supprimer cette horaire de travail ? Cette action est irréversible.</p>
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
            window.location.href = `/attendance/shift/${shiftId}/delete/`;
        });
    }

    function changeShift(shift, shiftId) {
        modalContainer.innerHTML = `
            <div role="dialog" aria-describedby="radix-_r_c_" aria-labelledby="radix-_r_b_" data-state="open" data-slot="dialog-content" class=" bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]" tabindex="-1" style="pointer-events: auto" >
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 id="radix-_r_b_" data-slot="dialog-title" class="text-lg leading-none font-semibold" >
                        Information du horaires de travail
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="changeShiftForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="change-shift">
                    <input type="hidden" name="shift_id" value="${shiftId}">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="start_time"
                            >Arrivée</label
                            ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            type="time"
                            id="start_time"
                            name="start_time"
                            required=""
                            value="${shift.start_time}"
                            />
                        </div>
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="end_time"
                            >Départ</label
                            ><input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            type="time"
                            id="end_time"
                            name="end_time"
                            required=""
                            value="${shift.end_time}"
                            />
                        </div>
                    </div>
                    <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end" >
                        <button data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[&gt;svg]:px-3" type="submit">
                            Enregistrer
                        </button>
                    </div>
                </form>
                <button type="button" data-slot="dialog-close" id="closeModal" class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" >
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path></svg
                    ><span class="sr-only">Close</span>
                </button>
            </div>
        `;
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('changeShiftForm');
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        form.addEventListener('submit', function (e) {
            form.submit();
        });
    }

    searchAttendance.addEventListener('input', function () {
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
                td.colSpan = attendanceTable.querySelectorAll('th').length;
                td.className = 'text-center py-4';
                td.textContent = 'Aucun historique trouvé.';
                tr.appendChild(td);
                tableBody.appendChild(tr);
            }
        } else {
            const noResults = tableBody.querySelector('.no-results');
            if (noResults) noResults.remove();
        }
    });
    // Les panneaux
    const attendancePanel = document.querySelector('[role="tabpanel"][aria-labelledby="attendance-button"]');
    const schedulePanel = document.querySelector('[role="tabpanel"][aria-labelledby="schedule-button"]');

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
    attendanceBtn.addEventListener("click", () => {
        activateTab(attendanceBtn, attendancePanel, scheduleBtn, schedulePanel);
    });

    // Quand on clique sur Hier
    scheduleBtn.addEventListener("click", () => {
        activateTab(scheduleBtn, schedulePanel, attendanceBtn, attendancePanel);
    });
});
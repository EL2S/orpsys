document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('searchInput');
    const leaveTable = document.getElementById('leaveTable');
    const tableBody = leaveTable.querySelector('tbody');
    const tableRows = tableBody.getElementsByTagName('tr');
    const requestButton = document.getElementById('request-button');
    const modalContainer = document.getElementById('modalContainer');
    const employees = document.getElementById('employees');
    let employeesData = [];
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
    if (employees) {
        employeesData = JSON.parse(employees.value || "[]");
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
                td.colSpan =leaveTable.querySelectorAll('th').length;
                td.className = 'text-center py-4';
                td.textContent = 'Aucun congé trouvé.';
                tr.appendChild(td);
                tableBody.appendChild(tr);
            }
        } else {
            const noResults = tableBody.querySelector('.no-results');
            if (noResults) noResults.remove();
        }
    });
    requestButton.addEventListener('click', function () {
        let optionsHTML = employeesData.map(employee => `
            <option value="${employee.id}" title="${employee.user__username}">${employee.user__username}</option>
        `).join('');
        // HTML du modal
        modalContainer.innerHTML = `
    
            <div
                role="dialog"
                id="requestModal"
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
                    Demander un congé
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="requestForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="add">
                    <div class="grid grid-cols-2 gap-4">
                        <!-- Date de début -->
                        <div class="space-y-2">
                            <label 
                            data-slot="label" 
                            class="flex items-center gap-2 text-sm font-medium leading-none select-none
                                    group-data-[disabled=true]:pointer-events-none 
                                    group-data-[disabled=true]:opacity-50 
                                    peer-disabled:cursor-not-allowed 
                                    peer-disabled:opacity-50">
                            Date de début
                            </label>
                            <input 
                            data-slot="input" 
                            type="date"
                            id="start_date"
                            name="start_date"
                            required=""
                            class="h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base
                                    placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground
                                    file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium
                                    shadow-xs transition-[color,box-shadow] outline-none
                                    focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
                                    aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40
                                    aria-invalid:border-destructive
                                    dark:bg-input/30 border-input
                                    disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50
                                    md:text-sm">
                            </input>
                        </div>

                        <!-- Date de fin -->
                        <div class="space-y-2">
                            <label 
                            data-slot="label" 
                            class="flex items-center gap-2 text-sm font-medium leading-none select-none
                                    group-data-[disabled=true]:pointer-events-none 
                                    group-data-[disabled=true]:opacity-50 
                                    peer-disabled:cursor-not-allowed 
                                    peer-disabled:opacity-50">
                            Date de fin
                            </label>
                            <input 
                            data-slot="input" 
                            type="date"
                            id="end_date"
                            name="end_date"
                            required=""
                            class="h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base
                                    placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground
                                    file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium
                                    shadow-xs transition-[color,box-shadow] outline-none
                                    focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
                                    aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40
                                    aria-invalid:border-destructive
                                    dark:bg-input/30 border-input
                                    disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50
                                    md:text-sm">
                            </input>
                        </div>
                    </div>

                    
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="employer"
                            >Employé</label
                            ><select
                            id="employer"
                            name="employer"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                            ${optionsHTML}
                            </select>
                        </div>
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="leave_type"
                            >Type</label
                            ><select
                            id="leave_type"
                            name="leave_type"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                            <option value="Vacances">Vacances</option>
                            <option value="Maladie">Maladie</option>
                            <option value="Personnel">Personnel</option>
                            <option value="Congé maternité/paternité">Congé maternité/paternité</option>
                            <option value="Congé sans solde">Congé sans solde</option>
                            <option value="Congé annuel">Congé annuel</option>
                            <option value="Congé exceptionnel">Congé exceptionnel</option>
                            <option value="Développement professionnel">Développement professionnel</option>
                            </select>
                        </div>
                    </div>
                    <div class="space-y-2">
                    <label
                        data-slot="label"
                        class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                        for="reason"
                        >Motif</label
                    ><input
                        data-slot="input"
                        class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                        id="reason"
                        name="reason"
                        required=""
                        type="text"
                        
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
        const modal = document.getElementById('requestModal');
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('requestForm');
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

    });
    tableBody.addEventListener('click', function (event) {
        const approvedBtn = event.target.closest('.approved-button');
        if (approvedBtn) {
            const leaveId = approvedBtn.getAttribute('data-id');
            const type = "approved";
            addLeave(leaveId,type);
        }
        const rejectedBtn = event.target.closest('.rejected-button');
        if (rejectedBtn) {
            const leaveId = rejectedBtn.getAttribute('data-id');
            const type = "rejected";
            addLeave(leaveId,type);
        }
        const deleteBtn = event.target.closest('.delete-button');
        if (deleteBtn) {
            const leaveId = deleteBtn.getAttribute('data-id');
            deleteLeave(leaveId);
        }
        const changeBtn = event.target.closest('.change-button');
        if (changeBtn) {
            const leaveId = changeBtn.getAttribute('data-id');
            fetch(`/leave/${leaveId}/get/`)
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        changeLeave(data.leave, leaveId);
                    }
                })
                .catch(err => {
                    console.error("Erreur lors de la récupération du congé :", err);
                });
        }
    });
    
    function addLeave(leaveId,type){
        fetch(`/leave/${leaveId}/${type}/add/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
        })
            .then(res => res.json())
            .then(r => {
                if (!r.success) {
                    console.error("Erreur", res.error || "Impossible de charger le Statut", "error");
                }
                location.reload();
            })
            .catch(err => {
                console.error("Erreur", "Impossible de contacter le serveur", err);
            });
    }

    function deleteLeave(leaveId){
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
                    <p class="flex items-center text-sm font-medium text-primary">Êtes-vous sûr de vouloir supprimer cette congé ? Cette action est irréversible.</p>
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
            window.location.href = `/leave/${leaveId}/delete/`;
        });
    }

    function changeLeave(leave, leaveId){
        let optionsHTML = employeesData.map(employee => `
            <option value="${employee.id}" title="${employee.user__username}" ${employee.id === leave.employer ? "selected" : ""}>${employee.user__username}</option>
        `).join('');

        modalContainer.innerHTML = `
            <div
                role="dialog"
                id="requestModal"
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
                    Demander un congé
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="requestForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <input type="hidden" name="type" value="change">
                    <input type="hidden" name="leave_id" value="${leaveId}">
                    <div class="grid grid-cols-2 gap-4">
                        <!-- Date de début -->
                        <div class="space-y-2">
                            <label 
                            data-slot="label" 
                            class="flex items-center gap-2 text-sm font-medium leading-none select-none
                                    group-data-[disabled=true]:pointer-events-none 
                                    group-data-[disabled=true]:opacity-50 
                                    peer-disabled:cursor-not-allowed 
                                    peer-disabled:opacity-50">
                            Date de début
                            </label>
                            <input 
                            data-slot="input" 
                            type="date"
                            id="start_date"
                            name="start_date"
                            required=""
                            value="${leave.start_date}"
                            class="h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base
                                    placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground
                                    file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium
                                    shadow-xs transition-[color,box-shadow] outline-none
                                    focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
                                    aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40
                                    aria-invalid:border-destructive
                                    dark:bg-input/30 border-input
                                    disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50
                                    md:text-sm">
                            </input>
                        </div>

                        <!-- Date de fin -->
                        <div class="space-y-2">
                            <label 
                            data-slot="label" 
                            class="flex items-center gap-2 text-sm font-medium leading-none select-none
                                    group-data-[disabled=true]:pointer-events-none 
                                    group-data-[disabled=true]:opacity-50 
                                    peer-disabled:cursor-not-allowed 
                                    peer-disabled:opacity-50">
                            Date de fin
                            </label>
                            <input 
                            data-slot="input" 
                            type="date"
                            id="end_date"
                            name="end_date"
                            required=""
                            value="${leave.end_date}"
                            class="h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base
                                    placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground
                                    file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium
                                    shadow-xs transition-[color,box-shadow] outline-none
                                    focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]
                                    aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40
                                    aria-invalid:border-destructive
                                    dark:bg-input/30 border-input
                                    disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50
                                    md:text-sm">
                            </input>
                        </div>
                    </div>

                    
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="employer"
                            >Employé</label
                            ><select
                            id="employer"
                            name="employer"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                            ${optionsHTML}
                            </select>
                        </div>
                        <div class="space-y-2">
                            <label
                            data-slot="label"
                            class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                            for="leave_type"
                            >Type</label
                            ><select
                            id="leave_type"
                            name="leave_type"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                            <option value="Vacances" ${leave.leave_type === "Vacances" ? "selected" : ""}>Vacances</option>
                            <option value="Maladie" ${leave.leave_type === "Maladie"? "selected" : ""}>Maladie</option>
                            <option value="Personnel" ${leave.leave_type === "Personnel" ? "selected" : ""}>Personnel</option>
                            <option value="Congé maternité/paternité" ${leave.leave_type === "Congé maternité/paternité" ? "selected" : ""}>Congé maternité/paternité</option>
                            <option value="Congé sans solde" ${leave.leave_type === "Congé sans solde" ? "selected" : ""}>Congé sans solde</option>
                            <option value="Congé annuel" ${leave.leave_type === "Congé annuel" ? "selected" : ""}>Congé annuel</option>
                            <option value="Congé exceptionnel" ${leave.leave_type === "Congé exceptionnel"? "selected" : ""}>Congé exceptionnel</option>
                            <option value="Développement professionnel" ${leave.leave_type === "Développement professionnel" ? "selected" : ""}>Développement professionnel</option>
                            </select>
                        </div>
                    </div>
                    <div class="space-y-2">
                    <label
                        data-slot="label"
                        class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                        for="reason"
                        >Motif</label
                    ><input
                        data-slot="input"
                        class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                        id="reason"
                        name="reason"
                        required=""
                        type="text"
                        value="${leave.reason}"
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
        const modal = document.getElementById('requestModal');
        const closeModal = document.getElementById('closeModal');
        const form = document.getElementById('requestForm');
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
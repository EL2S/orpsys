document.addEventListener('DOMContentLoaded', function () {
    const salariesTable = document.getElementById('salariesTable');
    const tableBody = salariesTable.querySelector('tbody');
    const tableRows = tableBody.getElementsByTagName('tr');
    const addButton = document.getElementById('add-button');
    const modalContainer = document.getElementById('modalContainer');
    const salaries = document.getElementById('salaries');
    const employees = document.getElementById('employees');
    let salariesData = [];
    let employeesData = [];
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
    const monthSelect = document.getElementById('month');
    const yearSelect = document.getElementById('year');
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const addBtn = document.getElementById('penalty-button');
    for (let year = 1993; year <= currentYear; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        if (year === currentYear) {
            option.selected = true;
        }
        yearSelect.appendChild(option);
    }

    monthSelect.innerHTML = `
        <option value="0" ${currentMonth.toString() === "0" ? "selected" : ""}>Janvier</option>
        <option value="1" ${currentMonth.toString() === "1" ? "selected" : ""}>Février</option>
        <option value="2" ${currentMonth.toString() === "2" ? "selected" : ""}>Mars</option>
        <option value="3" ${currentMonth.toString() === "3" ? "selected" : ""}>Avril</option>
        <option value="4" ${currentMonth.toString() === "4" ? "selected" : ""}>Mai</option>
        <option value="5" ${currentMonth.toString() === "5" ? "selected" : ""}>Juin</option>
        <option value="6" ${currentMonth.toString() === "6" ? "selected" : ""}>Juillet</option>
        <option value="7" ${currentMonth.toString() === "7" ? "selected" : ""}>Août</option>
        <option value="8" ${currentMonth.toString() === "8" ? "selected" : ""}>Septembre</option>
        <option value="9" ${currentMonth.toString() === "9" ? "selected" : ""}>Octobre</option>
        <option value="10" ${currentMonth.toString() === "10" ? "selected" : ""}>Novembre</option>
        <option value="11" ${currentMonth.toString() === "11" ? "selected" : ""}>Décembre</option>
    `;
    if (salaries) {
        salariesData = JSON.parse(salaries.value || "[]");
    }
    if (employees) {
        employeesData = JSON.parse(employees.value || "[]");
    }
    tableBody.innerHTML = ``;

    viewTable(salariesData, tableBody, monthSelect.value, yearSelect.value);
    function viewTable(salaries, body, month, year){
        if(salariesTable){
            if(salaries.length > 0){
                body.innerHTML = salaries.map(salarie => `
                    ${
                        salarie.month === month && salarie.year === year ?
                        `
                            <tr data-slot="table-row" class="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors" data-month="${salarie.month}" data-year="${salarie.year}">
                                <td data-slot="table-cell" class="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px] font-medium">
                                    ${salarie.name}
                                </td>
                                <td data-slot="table-cell" class="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                    ${salarie.base}
                                </td>
                                <td data-slot="table-cell" class="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px]">
                                    ${salarie.pointage}
                                </td>
                                <td data-slot="table-cell" class="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px] text-red-600">
                                    - ${salarie.penalty}
                                </td>
                                <td data-slot="table-cell" class="p-2 align-middle whitespace-nowrap [&amp;:has([role=checkbox])]:pr-0 [&amp;&gt;[role=checkbox]]:translate-y-[2px] text-right font-bold">
                                    ${salarie.salary} KMF
                                </td>
                            </tr>
                        
                        `
                        :
                        `
                            <tr>
                                <td colspan="5" class="text-center py-4">Aucun salaire (Mensuel) trouvé.</td>
                            </tr>
                        
                        `
                    }

                `).join('');
            }else{
                body.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center py-4">Aucun salaire (Mensuel) trouvé.</td>
                    </tr>
                `;
            }
        }
    }

    monthSelect.addEventListener('change', () => {
        viewTable(salariesData, tableBody, monthSelect.value, yearSelect.value);
    });

    yearSelect.addEventListener('change', () => {
        viewTable(salariesData, tableBody, monthSelect.value, yearSelect.value);
    });

    addBtn.addEventListener('click', () => {
        addPenalty(employeesData);
    });
    
    function addPenalty(employees){
        let optionsHTML = employees.map(employee => `
            <option value="${employee.id}" title="${employee.username}">${employee.username}</option>
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
                        Appliquer une pénalité
                    </h2>
                </div>
                <form class="grid gap-4 py-4" id="addForm" method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken.value}">
                    <div class="space-y-2">
                        <label data-slot="label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                            ID Employé
                        </label>
                        <select
                            id="employer_id"
                            id="employer_id"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive">
                            ${optionsHTML}
                        </select>
                    </div>
                    <div class="space-y-2">
                        <label data-slot="label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50" >
                            Montant (KMF)
                        </label>
                        <input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            type="number"
                            id="amount"
                            id="amount"
                        />
                    </div>
                    <div class="space-y-2">
                        <label data-slot="label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50" >
                            Motif
                        </label>
                        <input
                            data-slot="input"
                            class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                            placeholder="Raison..."
                            id="reason"
                            id="reason"
                        />
                    </div>
                    <div
                    data-slot="dialog-footer"
                    class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"
                    >
                    <button
                        data-slot="button"
                        type="submit"
                        class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 h-9 px-4 py-2 has-[&gt;svg]:px-3">
                        Confirmer la pénalité
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
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        form.addEventListener('submit', function (e) {
            e.preventDefault(); // Empêche l'envoi immédiat

            form.querySelectorAll('.error-msg').forEach(el => el.remove());

            let hasError = false;

            if (!hasError) {
                form.submit();
            }
        });
    }
});
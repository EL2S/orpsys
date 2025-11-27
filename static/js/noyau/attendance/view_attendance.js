document.addEventListener('DOMContentLoaded', function () {
    const attendanceBtn = document.getElementById("attendance-button");
    const scheduleBtn = document.getElementById("schedule-button");
    const modalContainer = document.getElementById('modalContainer');
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
    const attendanceTable = document.getElementById('attendanceTable');
    const tableBody = attendanceTable.querySelector('tbody');
    const tableRows = tableBody.getElementsByTagName('tr');
    const searchAttendance = document.getElementById('searchAttendance');
    if(searchAttendance){
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
                if (!attendanceTable.querySelector('.no-results')) {
                    const tr = document.createElement('tr');
                    tr.className = 'no-results';
                    const td = document.createElement('td');
                    td.colSpan =inventoryTable.querySelectorschedule('th').length;
                    td.className = 'text-center py-4';
                    td.textContent = 'Aucun historique trouvé.';
                    tr.appendChild(td);
                    attendanceTable.appendChild(tr);
                }
            } else {
                const noResults = tableBody.querySelector('.no-results');
                if (noResults) noResults.remove();
            }
        });
    }
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
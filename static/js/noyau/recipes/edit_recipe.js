document.addEventListener("DOMContentLoaded", () => {
    const addButton = document.getElementById("add-ingredient");
    const rowsContainer = document.getElementById("ingredient-rows");
    const template = document.getElementById("ingredient-row-template");

    if (!addButton || !rowsContainer || !template) return;

    function bindRow(row) {
        const removeButton = row.querySelector("[data-action='remove']");
        if (removeButton) {
            removeButton.addEventListener("click", () => {
                row.remove();
            });
        }
    }

    rowsContainer.querySelectorAll(".ingredient-row").forEach(bindRow);

    addButton.addEventListener("click", () => {
        const fragment = template.content.cloneNode(true);
        const row = fragment.querySelector(".ingredient-row");
        if (!row) return;
        rowsContainer.appendChild(fragment);
        bindRow(row);
    });
});

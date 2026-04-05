document.addEventListener('DOMContentLoaded', function () {
    const modalContainer = document.getElementById('modalContainer');
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
    const confirmBtn = document.getElementById('confirmBtn');
    const nameInput = document.getElementById('name');
    const phoneInput = document.getElementById('phone');
    const summary = document.getElementById('summary');
    const paymentInput = document.getElementById('payment_method');
    const paymentButtons = document.querySelectorAll('.payment-btn');
    const itemsInput = document.getElementById('items');
    const form = document.getElementById('addForm');

    // Récupérer le panier depuis localStorage
    const storedCart = localStorage.getItem("cart");

    // --- Sélection méthode de paiement ---
    paymentButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            paymentButtons.forEach(b => {
                b.classList.remove("border-primary", "bg-primary/10");
                b.classList.add("border-border");
            });
            this.classList.add("border-primary", "bg-primary/10");
            this.classList.remove("border-border");
            const title = this.querySelector(".font-semibold").textContent.trim();
            paymentInput.value = title;
        });
    });

    // --- Vérification des champs ---
    function checkForm() {
        if (!confirmBtn) return;
        confirmBtn.disabled = (nameInput.value.trim() === '' || phoneInput.value.trim() === '');
    }

    nameInput?.addEventListener('input', checkForm);
    phoneInput?.addEventListener('input', checkForm);
    checkForm();

    // --- Affichage du panier ---
    if (storedCart && summary) {
        let panier;
        try {
            panier = JSON.parse(storedCart);
        } catch (e) {
            panier = {};
            console.error("Erreur parsing cart:", e);
        }

        const totalItems = Object.values(panier).reduce((sum, p) => sum + p.quantity, 0);
        const totalPrice = Object.values(panier).reduce((sum, p) => sum + (p.quantity * p.price), 0);

        summary.innerHTML = `
            <div data-slot="card" class="bg-card text-card-foreground flex flex-col gap-6 rounded-xl border shadow-sm p-6 sticky top-24">
                <h2 class="text-xl font-bold mb-6 text-foreground">Récapitulatif</h2>
                <div class="space-y-4 mb-6 max-h-96 overflow-y-auto" id="cart-items">
                </div>
                <div class="space-y-2 pt-4 border-t border-border">
                    <div class="flex justify-between text-muted-foreground">
                        <span>Articles (${totalItems})</span><span>${totalPrice}KMF</span>
                    </div>
                    <div class="flex justify-between text-xl font-bold">
                        <span class="text-foreground">Total</span><span class="text-primary">${totalPrice}KMF</span>
                    </div>
                </div>
            </div>
        `;

        const cartItemsContainer = document.getElementById("cart-items");
        if (cartItemsContainer) {
            cartItemsContainer.innerHTML = Object.entries(panier).map(([id, item]) => `
                <div class="flex gap-3 pb-4 border-b border-border">
                    <div class="w-16 h-16 bg-muted rounded overflow-hidden flex-shrink-0">
                        <img alt="${item.name}" class="w-full h-full object-cover" src="/media/${item.image}" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-semibold text-foreground truncate">${item.name}</h3>
                        <p class="text-sm text-muted-foreground">${item.quantity} × ${item.price}KMF</p>
                    </div>
                    <div class="text-right">
                        <p class="font-bold text-foreground">${parseFloat(item.price) * parseInt(item.quantity)}KMF</p>
                    </div>
                </div>
            `).join('');
        }
        itemsInput.value = storedCart;
    } else if (summary) {
        summary.innerHTML = `<div class="text-center py-12 text-muted-foreground">Aucun panier trouvé</div>`;
        // Panier introuvable: aucun traitement requis ici.
        itemsInput.value = '';
    }

    // --- Validation du téléphone ---
    function clearPhoneError() {
        phoneInput.classList.remove("border-red-500");
        const oldError = form.querySelector("#phone-error");
        if (oldError) oldError.remove();
    }

    phoneInput?.addEventListener("input", clearPhoneError);

    form?.addEventListener('submit', function (e) {
        const phone = phoneInput.value.trim();
        form.querySelectorAll('.error-msg').forEach(el => el.remove());

        // Vérifie qu'il y a seulement des chiffres et éventuellement +
        const phoneRegex = /^\+?\d[\d\s]*$/;

        if (!phoneRegex.test(phone)) {
            e.preventDefault();
            phoneInput.classList.add("border-red-500");
            const errorMsg = document.createElement("p");
            errorMsg.id = "phone-error";
            errorMsg.className = "error-msg text-red-600 text-sm mt-1";
            errorMsg.textContent = "Numéro de téléphone invalide. Veuillez entrer uniquement des chiffres et éventuellement +";
            phoneInput.insertAdjacentElement("afterend", errorMsg);
            phoneInput.focus();
            return false;
        }
        localStorage.clear();
        // Formulaire valide, soumission normale
        form.submit();
    });

});

document.addEventListener('DOMContentLoaded', function () {
    const paymentInput = document.getElementById('payment_method');
    const paymentButtons = document.querySelectorAll('.payment-btn');
    const form = document.getElementById('confirmationForm');
    const sale_id = document.getElementById('sale_id');
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
    // --- Sélectionner par défaut le paiement déjà choisi ---
    const currentPayment = paymentInput.value; // valeur initiale depuis Django
    paymentButtons.forEach(btn => {
        const title = btn.querySelector(".font-semibold").textContent.trim();
        if (title === currentPayment) {
            btn.classList.add("border-primary", "bg-primary/10");
            btn.classList.remove("border-border");
        } else {
            btn.classList.add("border-border");
            btn.classList.remove("border-primary", "bg-primary/10");
        }
    });

    // --- Sélection méthode de paiement au clic ---
    paymentButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            paymentButtons.forEach(b => {
                b.classList.remove("border-primary", "bg-primary/10");
                b.classList.add("border-border");
            });

            this.classList.add("border-primary", "bg-primary/10");
            this.classList.remove("border-border");

            const title = this.querySelector(".font-semibold").textContent.trim();
            paymentInput.value = title; // met à jour l'input caché
        });
    });

    form.addEventListener('submit', function (e) {
    e.preventDefault();

    const payload = {
        payment_method: paymentInput.value,
    };

    if (!sale_id.value) {
        return;
    }

    fetch(`/sale/bakery/${sale_id.value}/print/`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken.value
        },
        body: JSON.stringify(payload)
    })
    .then(window.safeJson)
    .then(r => {

        if (!r.success) {
            console.error("Erreur", r.error || "Impossible de faire la transaction");
            return;
        }

        // 🔥 r contient déjà la réponse JSON complète (r.text)
        if (r.text) {

            const prn = r.text;
            const intent =
                "intent:" + encodeURIComponent(prn) +
                "#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;";

            // Envoi ticket RawBT
            window.location.href = intent;

            // 🔄 Redirection vers POS
            setTimeout(() => {
                window.location.href = "/pos/";
            }, 1200);
        } 
        else {
            alert("Erreur : ticket introuvable.");
        }

    })
    .catch(err => {
        console.error("Erreur", "Impossible de contacter le serveur", err);
    });

});

});

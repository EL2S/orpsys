document.addEventListener("DOMContentLoaded", function () {
    const buttons = document.querySelectorAll(".filter-button");
    const products = document.querySelectorAll("#list-product > div[data-slot='card']");
    const productList = document.getElementById("list-product"); // ✅ Correction
    const list = document.getElementById("list-item");
    const subtotalElem = document.getElementById("subtotal");
    const totalElem = document.getElementById("total");
    const payBtn = document.getElementById("btn-pay");
    const clearBtn = document.getElementById("btn-clear");
    const scanInput = document.getElementById("scan-card");
    const cardBox = document.getElementById("fidelity-card-box");
    const loyalties_json = document.getElementById('loyalties_json');
    const modalContainer = document.getElementById('modalContainer');
    let loyaltiesData = [];
    if (loyalties_json) {
        loyaltiesData = JSON.parse(loyalties_json.value || "[]");
    }
    scanInput.focus();

    // --- SCANNER UNE CARTE DE FIDÉLITÉ ---
    scanInput.addEventListener('change', function () {
        const cartValue = this.value.trim();
        if (cartValue) {
            scanCart(cartValue);
        }
    });
    async function scanCart(cartValue) {

        for (const loyalty of loyaltiesData) {

            const setting = loyalty.setting;
            const cardId = loyalty.card_id;
            const loyaltyId = loyalty.id;

            // Base de génération
            const base = `${setting}|${cardId}|${loyaltyId}`;

            // Convertir en bytes
            const msgUint8 = new TextEncoder().encode(base);

            // SHA-256
            const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);

            // Buffer → hex (64 chars)
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const secureId = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

            // Vérification
            if (secureId === cartValue) {
                scanLoyalty(loyalty,cardBox);
                return loyalty; // On retourne la carte trouvée
            }
        }
    }

    function scanLoyalty(loyalty,cardBox){
        scanInput.value = "";
        cardBox.innerHTML = "";
        const div = document.createElement("div");
        div.className = "flex justify-between items-center";
        div.dataset.id = loyalty.id;
        div.innerHTML = `
            <div>
                <p class="text-sm font-medium text-blue-900">${loyalty.client}</p>
                <p class="text-xs text-blue-700">Solde: ${parseInt(loyalty.solde)} KMF</p>
            </div>
            <button data-slot="button" id="card-delete" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9 h-6 w-6">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 h-3 w-3">
                    <path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    <line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line>
                </svg>
            </button>
        `;
        cardBox.appendChild(div);
        const deleteBtn = document.getElementById("card-delete");
        deleteBtn.addEventListener("click", function(){
            cardDelete(cardBox);
        });
    }
    function cardDelete(cardBox){
        cardBox.innerHTML = "";
        const div = document.createElement("div");
        div.className = "flex gap-2";
        div.innerHTML = `
            <input data-slot="input" id="scan-card" class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded-md border px-3 py-1 shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive h-8 text-sm bg-white" placeholder="N° Carte Fidélité" value=""/>
            <button data-slot="button" class="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground hover:bg-primary/90 rounded-md gap-1.5 px-3 has-[&gt;svg]:px-2.5 h-8">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user h-3 w-3">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
            </button>
        `;
        cardBox.appendChild(div);
        const scanInput = document.getElementById("scan-card");
        scanInput.focus();
        scanInput.addEventListener('change', function () {
            const cartValue = this.value.trim();
            if (cartValue) {
                scanCart(cartValue);
            }
        });
    }
    // --- VIDER LE PANIER ---
    clearBtn.addEventListener("click", function () {
        list.innerHTML = "";
        updateTotals();
    });
    
    updateTotals();
    // --- METTRE À JOUR LES TOTALS ---
    function updateTotals() {
        let subtotal = 0;

        document.querySelectorAll(".amount").forEach(el => {
            subtotal += parseInt(el.textContent);
        });

        subtotalElem.textContent = subtotal + " KMF";
        totalElem.textContent = subtotal + " KMF";

        payBtn.disabled = subtotal === 0;
    }

    // --- FILTRAGE DES PRODUITS ---
    buttons.forEach(btn => {
        btn.addEventListener("click", function () {
            const filter = this.getAttribute("data-filter");

            // Highlight
            buttons.forEach(b => b.classList.remove("bg-secondary", "text-secondary-foreground"));
            this.classList.add("bg-secondary", "text-secondary-foreground");

            // Filtrer
            products.forEach(product => {
                const name = product.querySelector(".font-medium").textContent.trim();
                const firstLetter = name[0].toUpperCase();

                if (filter === "Tout" || firstLetter === filter) {
                    product.style.display = "";
                } else {
                    product.style.display = "none";
                }
            });
        });
    });

    // --- CRÉER UN ITEM PANIER ---
    function createCartItem(id, name, price, stock) {
        const div = document.createElement("div");
        div.className = "flex items-center justify-between bg-card p-2 gap-2 rounded-lg border cart-item";
        div.dataset.name = name;
        div.dataset.price = price; // ✅ IMPORTANT pour updateQty
        div.dataset.stock = stock;
        div.dataset.id = id;

        div.innerHTML = `
            <div class="flex-1">
                <div class="font-medium text-sm">${name}</div>
                <div class="text-xs text-muted-foreground">${price} KMF / unité</div>
            </div>

            <div class="flex items-center gap-2">
                <div class="flex items-center gap-2">
                    <button data-slot="button" class="btn-minus inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-9 h-6 w-6 bg-transparent">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus h-3 w-3">
                        <path d="M5 12h14"></path>
                        </svg>
                    </button>
                    <span class="w-4 text-center text-sm font-medium quantity">1</span>
                    <button data-slot="button" class="btn-plus inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-9 h-6 w-6 bg-transparent">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus h-3 w-3">
                            <path d="M5 12h14"></path>
                            <path d="M12 5v14"></path>
                        </svg>
                    </button>
                </div>

            </div>
            <div class="w-20 text-right font-medium text-sm amount">${price}</div>
            <button data-slot="button" class="btn-delete inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent dark:hover:bg-accent/50 size-9 h-6 w-6 text-muted-foreground hover:text-destructive ml-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 h-3 w-3">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    <line x1="10" x2="10" y1="11" y2="17"></line>
                    <line x1="14" x2="14" y1="11" y2="17"></line>
                </svg>
            </button>
        `;

        list.appendChild(div);

        div.querySelector(".btn-plus").addEventListener("click", () => updateQty(div, 1,stock));
        div.querySelector(".btn-minus").addEventListener("click", () => updateQty(div, -1,stock));
        div.querySelector(".btn-delete").addEventListener("click", () => {
            div.remove();
            updateTotals();
        });
    }

    // --- AJUSTER QUANTITÉ ---
    function updateQty(item, change, stock) {
        const qtyElem = item.querySelector(".quantity");
        const totalElem = item.querySelector(".amount");

        // récupère le stock depuis l'argument ou data-stock
        let availableStr = (Number.isFinite(stock) ? stock : item.dataset.stock) || "0";
        let available = (availableStr === "∞") ? Infinity : parseInt(availableStr);

        const price = parseInt(item.dataset.price);

        let qty = parseInt(qtyElem.textContent) || 0;
        qty += change;

        // si quantité <= 0 : on supprime l'item
        if (qty <= 0) {
            item.remove();
            updateTotals();
            return;
        }

        // vérifie le stock seulement si ce n'est pas infini
        if (available !== Infinity) {
            if (available <= 0) {
                showItemError(item, "Rupture de stock");
                item.remove();
                updateTotals();
                return;
            }

            if (qty > available) {
                showItemError(item, `Stock disponible : ${available}`);
                qty = available;
            }
        }

        // met à jour l'affichage
        qtyElem.textContent = qty;
        totalElem.textContent = qty * price;
        updateTotals();
    }


    /* Affiche un message d'erreur inline sur l'item et le cache après 3s */
    function showItemError(item, message) {
        let err = item.querySelector(".error-msg");
        if (!err) {
            err = document.createElement("div");
            err.className = "error-msg text-xs text-destructive mt-1"; // adapte classes CSS
            // insère l'erreur juste après la partie principale (ajuste selon ton HTML)
            item.appendChild(err);
        }
        // gère timers précédents pour éviter multiplications
        if (err._hideTimeout) {
            clearTimeout(err._hideTimeout);
        }
        err.textContent = message;
        err.style.display = ""; // s'assurer qu'il est visible

        // cache après 3s
        err._hideTimeout = setTimeout(() => {
            err.style.display = "none";
        }, 3000);
    }


    // --- CLIQUER SUR UN PRODUIT POUR L'AJOUTER ---
    productList.addEventListener("click", function (e) { // ✅ correction ici
        const product = e.target.closest(".product-card");
        if (!product) return;

        const name = product.dataset.name;
        const id = product.dataset.id;
        const price = parseInt(product.dataset.price);
        const stock = parseInt(product.dataset.stock);
        const existing = list.querySelector(`.cart-item[data-name="${name}"]`);

        if (existing) {
            updateQty(existing, 1);
        } else {
            createCartItem(id, name, price, stock);
        }
        updateTotals();
    });

    payBtn.addEventListener('click', function () {
        if (this.disabled) return;
        const totalText = totalElem.textContent;
        const total = parseInt(totalText.replace(/\D/g, ""));
        const cartItems = [];
        document.querySelectorAll(".cart-item").forEach(item => {
            cartItems.push({
                id: parseInt(item.dataset.id),
                quantity: parseInt(item.querySelector(".quantity").textContent),
                subtotal: parseInt(item.querySelector(".amount").textContent)
            });
        });
        let loyaltyCard = null;
        const cardDiv = cardBox.querySelector("div[data-id]");
        if (cardDiv) {
            loyaltyCard = {
                id: cardDiv.dataset.id,
                client: cardDiv.querySelector("p:first-child")?.textContent || "",
                solde: cardDiv.querySelector("p:nth-child(2)")?.textContent.replace(/\D/g, "") || ""
            };
        }
        processPayment(total, cartItems, loyaltyCard);
    });
    function processPayment(total, cartItems, loyaltyCard) {
        modalContainer.innerHTML = `
            <div role="dialog" aria-describedby="radix-_r_c_" aria-labelledby="radix-_r_b_" data-state="open" data-slot="dialog-content" class="addModal bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-[425px]" tabindex="-1" style="pointer-events: auto">
                <div data-slot="dialog-header" class="flex flex-col gap-2 text-center sm:text-left">
                    <h2 id="settlement" data-slot="dialog-title" class="text-lg leading-none font-semibold">Règlement</h2>
                </div>
                <div class="grid gap-6 py-4">
                    <div class="text-center">
                        <p class="text-sm text-muted-foreground">Montant total</p>
                        <p class="text-4xl font-bold text-primary">${total} KMF</p>
                    </div>
                    <div dir="ltr" data-orientation="horizontal" data-slot="tabs" class="flex flex-col gap-2 w-full">
                        <div role="tablist" aria-orientation="horizontal" data-slot="tabs-list" class="bg-muted text-muted-foreground h-9 items-center justify-center rounded-lg p-[3px] grid w-full grid-cols-2" tabindex="0" data-orientation="horizontal" style="outline: none" >
                            <button type="button" role="tab" aria-selected="true" aria-controls="content-cash" data-state="active" id="trigger-cash" data-slot="tabs-trigger" class="data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4" tabindex="0" data-orientation="horizontal" data-radix-collection-item="">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-banknote mr-2 h-4 w-4" >
                                    <rect width="20" height="12" x="2" y="6" rx="2"></rect>
                                    <circle cx="12" cy="12" r="2"></circle>
                                    <path d="M6 12h.01M18 12h.01"></path>
                                </svg>Espèces
                            </button>
                            <button type="button" role="tab" aria-selected="false" aria-controls="content-card" data-state="inactive" id="trigger-card" data-slot="tabs-trigger" class="data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4" tabindex="-1" data-orientation="horizontal" data-radix-collection-item="">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-credit-card mr-2 h-4 w-4">
                                    <rect width="20" height="14" x="2" y="5" rx="2"></rect>
                                    <line x1="2" x2="22" y1="10" y2="10"></line>
                                </svg>Carte Fidélité
                            </button>
                        </div>
                        <div data-state="active" data-orientation="horizontal" role="tabpanel" aria-labelledby="trigger-cash" id="content-cash" tabindex="0" data-slot="tabs-content" class="flex-1 outline-none space-y-4 mt-4" style="">
                            <div class="space-y-2">
                                <label data-slot="label" class="flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50" >Montant reçu</label>
                                <input data-slot="input" class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive text-lg" placeholder="0" type="number" value=""/>
                            </div>
                        </div>
                        <div data-state="inactive" data-orientation="horizontal" role="tabpanel" aria-labelledby="trigger-card" id="content-card" tabindex="0" data-slot="tabs-content" class="flex-1 outline-none mt-4" hidden="">
                            
                        </div>
                    </div>
                </div>
                <div data-slot="dialog-footer" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button id="confirm-payment" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-6 has-[&gt;svg]:px-4 w-full" disabled="">
                        Valider le paiement
                    </button>
                </div>
                <button id="closeModal" type="button" data-slot="dialog-close" class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 [&amp;_svg:not([class*='size-'])]:size-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x">
                    <path d="M18 6 6 18"></path>
                    <path d="m6 6 12 12"></path></svg>
                    <span class="sr-only">Close</span>
                </button>
            </div>
        `;
        const closeModal = document.getElementById('closeModal');
        const confirmBtn = document.getElementById('confirm-payment');
        const triggerCash = document.getElementById('trigger-cash');
        const triggerCard = document.getElementById('trigger-card');
        const contentCash = document.getElementById('content-cash');
        const contentCard = document.getElementById('content-card');
        activateTab('cash', contentCash, contentCard, confirmBtn, triggerCash, triggerCard);
        triggerCash.addEventListener('click', () => activateTab('cash', contentCash, contentCard, confirmBtn, triggerCash, triggerCard, null , null));
        triggerCard.addEventListener('click', () => activateTab('card', contentCash, contentCard, confirmBtn, triggerCash, triggerCard, loyaltyCard, total));

        // Fermer le modal
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        const input = document.querySelector('#content-cash input[type="number"]');
        // Create the change container only once
        let changeContainer = document.createElement('div');
        changeContainer.className = "p-4 bg-green-50 rounded-lg border border-green-100 text-center mt-2";
        changeContainer.innerHTML = `
            <p class="text-sm text-green-800">Monnaie à rendre</p>
            <p class="text-2xl font-bold text-green-600">0 KMF</p>
        `;
        changeContainer.style.display = "none"; // hidden by default
        input.parentNode.appendChild(changeContainer);
        input.addEventListener('input', () => {
            setupPaymentInput(input, changeContainer, confirmBtn, total);
        });

        confirmBtn.addEventListener('click', function () {
            if (this.disabled) return;
            newTransaction(confirmBtn,total, cartItems, loyaltyCard);
        });
    }

    function newTransaction(confirmBtn,total, cartItems, loyaltyCard){
        const tab = confirmBtn.dataset.tab;
        let newBalance = 0;
        if(tab === 'cash') {
            newBalance = parseInt(loyaltyCard.solde);
        } else if(tab === 'card') {
            newBalance = parseInt(loyaltyCard.solde) - parseInt(total);
        }
        finalizeTransaction(total, cartItems, loyaltyCard, newBalance);
    }

    function finalizeTransaction(total, cartItems, loyaltyCard, newBalance, tab) {
        const payload = {
            total: total,
            items: cartItems,
            loyalty_id: loyaltyCard?.id || null,
            new_balance: newBalance,
            method: tab
        };

        fetch(`/pos/transaction/add/`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(async r => {
            if (!r.success) {
                console.error("Erreur", r.error || "Impossible de faire la transaction");
                return;
            }

            try {
                const response = await fetch(`/pos/ticket/print/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (data.success && data.text) {
                    const prn = data.text;
                    const intent = "intent:" + encodeURIComponent(prn) + "#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;";
                    
                    // 🔥 Envoi du ticket à l’imprimante
                    window.location.href = intent;

                    // 🔄 Rafraîchir automatiquement après 1.2 sec
                    setTimeout(() => {
                        window.location.reload();
                    }, 1200);

                } else {
                    alert("Erreur lors de la génération du ticket.");
                }
            } catch (error) {
                console.error("Erreur:", error);
                alert("Erreur lors de la connexion au serveur.");
            }
        })
        .catch(err => {
            console.error("Erreur", "Impossible de contacter le serveur", err);
        });
    }

    function setupPaymentInput(input, changeContainer, confirmBtn, total) {
        const value = parseInt(input.value) || 0;
        if (value >= total) {
            confirmBtn.disabled = false;
            const change = value - total;
            changeContainer.querySelector('p:nth-child(2)').textContent = `${change} KMF`;
            changeContainer.style.display = "block";
        } else {
            confirmBtn.disabled = true;
            changeContainer.style.display = "none";
        }
    }
    function activateTab(tab, contentCash, contentCard, confirmBtn, triggerCash, triggerCard, loyaltyCard, total) {
        if(tab === 'cash') {
            // Activer espèces
            triggerCash.dataset.state = 'active';
            triggerCash.setAttribute('aria-selected', 'true');
            contentCash.hidden = false;

            // Désactiver carte
            triggerCard.dataset.state = 'inactive';
            triggerCard.setAttribute('aria-selected', 'false');
            contentCard.hidden = true;
            confirmBtn.dataset.tab = 'cash';
        } else if(tab === 'card') {
            // Activer carte fidélité
            triggerCard.dataset.state = 'active';
            triggerCard.setAttribute('aria-selected', 'true');
            contentCard.hidden = false;

            // Désactiver espèces
            triggerCash.dataset.state = 'inactive';
            triggerCash.setAttribute('aria-selected', 'false');
            contentCash.hidden = true;
            confirmBtn.dataset.tab = 'card';

            contentCard.innerHTML = '';
            if(!loyaltyCard) {
                contentCard.innerHTML = `
                    <div class="text-center py-8 text-muted-foreground">
                        Veuillez scanner une carte de fidélité dans le panneau latéral
                    </div>
                `;
                confirmBtn.disabled = true;
            } else {
                const currentBalance = parseInt(loyaltyCard.solde);
                
                // Vérification du solde
                if (total > currentBalance) {
                    contentCard.innerHTML = `
                        <div class="p-4 bg-red-50 rounded-lg border border-red-200">
                            <p class="text-red-800 font-semibold">Solde insuffisant</p>
                            <p class="text-sm text-red-700 mt-1">
                                Votre solde est de ${currentBalance} KMF, mais le total est de ${total} KMF.
                            </p>
                        </div>
                    `;
                    confirmBtn.disabled = true; // Bloquer le paiement
                    return; 
                }

                // Solde suffisant → calcul normal
                const newBalance = currentBalance - total;

                contentCard.innerHTML = `
                    <div class="space-y-4">
                        <div class="p-4 bg-blue-50 rounded-lg border border-blue-100">
                            <div class="flex justify-between mb-2">
                                <span class="text-sm text-blue-800">Solde actuel</span>
                                <span class="font-bold text-blue-900">${currentBalance} KMF</span>
                            </div>
                            <div class="flex justify-between pt-2 border-t border-blue-200">
                                <span class="text-sm text-blue-800">Nouveau solde</span>
                                <span class="font-bold text-blue-900">${newBalance} KMF</span>
                            </div>
                        </div>
                    </div>
                `;

                confirmBtn.disabled = false;
            }

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

});

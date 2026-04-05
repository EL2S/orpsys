document.addEventListener('DOMContentLoaded', function () {
    const productsInput = document.getElementById('products');
    const listProducts = document.getElementById('list-products');
    const cartBtn = document.getElementById('btn-cart');
    const modalContainer = document.getElementById('modalContainer');
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');

    let cart = {};
    let productsData = [];

    if (productsInput) {
        try {
            const rawProducts = (productsInput.textContent || "").trim();
            const parsed = JSON.parse(rawProducts || "[]");
            if (Array.isArray(parsed)) {
                productsData = parsed;
            } else if (typeof parsed === "string") {
                try {
                    const nested = JSON.parse(parsed);
                    productsData = Array.isArray(nested)
                        ? nested
                        : (nested && Array.isArray(nested.products) ? nested.products : []);
                } catch (_) {
                    productsData = [];
                }
            } else if (parsed && Array.isArray(parsed.products)) {
                productsData = parsed.products;
            } else {
                productsData = [];
            }
        } catch (error) {
            productsData = [];
        }
    }

    function formatKmf(value) {
        return `${value} KMF`;
    }

    function cartStats() {
        const totalItems = Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
        const totalPrice = Object.values(cart).reduce((sum, item) => sum + (item.quantity * item.price), 0);
        return { totalItems, totalPrice };
    }

    function updateCartButton() {
        const { totalItems, totalPrice } = cartStats();
        if (!cartBtn) return;

        if (totalItems === 0) {
            cartBtn.disabled = true;
            cartBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shopping-cart mr-2 h-5 w-5">
                    <circle cx="8" cy="21" r="1"></circle>
                    <circle cx="19" cy="21" r="1"></circle>
                    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>
                </svg>Panier (0)
            `;
            return;
        }

        cartBtn.disabled = false;
        cartBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shopping-cart mr-2 h-5 w-5">
                <circle cx="8" cy="21" r="1"></circle>
                <circle cx="19" cy="21" r="1"></circle>
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>
            </svg>Panier (${totalItems})
            <span data-slot="badge" class="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 transition-[color,box-shadow] overflow-hidden border-transparent ml-2 bg-primary-foreground text-primary">
                ${totalPrice} KMF
            </span>
        `;
    }

    function renderProducts() {
        if (!listProducts) return;
        listProducts.innerHTML = '';
        if (!productsData.length) {
            listProducts.innerHTML = '<div class="text-center text-muted-foreground">Aucun produit disponible.</div>';
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'pyromane-grid';

        productsData.forEach((product) => {
            const imageSrc = `/media/${product.image || ''}`;
            const card = document.createElement('div');
            card.className = 'pyromane-card';
            card.dataset.id = product.id;
            card.innerHTML = `
                <div class="pyromane-card__media">
                    <img src="${imageSrc}" alt="${product.name}" />
                </div>
                <div class="pyromane-card__body">
                    <h3 class="pyromane-card__name">${product.name}</h3>
                </div>
                <div class="pyromane-card__footer">
                    <span class="pyromane-card__price">${product.price} KMF</span>
                    <button class="add-button pyromane-add">Ajouter</button>
                </div>
            `;
            const addBtn = card.querySelector('.add-button');
            addBtn.addEventListener('click', () => addToCart(product));
            grid.appendChild(card);
        });

        listProducts.appendChild(grid);
    }

    function addToCart(product) {
        if (!cart[product.id]) {
            cart[product.id] = {
                id: product.id,
                name: product.name,
                price: Number(product.price),
                image: product.image,
                category: product.category || '',
                quantity: 1,
            };
        } else {
            cart[product.id].quantity += 1;
        }
        updateCartButton();
    }

    function openCartModal() {
        const { totalItems, totalPrice } = cartStats();
        if (!totalItems) return;

        modalContainer.innerHTML = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div data-slot="card" class="text-card-foreground gap-6 rounded-xl border py-6 shadow-sm w-full max-w-2xl max-h-[90vh] flex flex-col bg-background">
                    <div class="flex items-center justify-between p-6 border-b border-border">
                        <h2 class="text-2xl font-bold text-foreground">Résumé de commande</h2>
                        <button data-slot="button" id="closeModal" class="inline-flex items-center justify-center rounded-md hover:bg-accent size-9">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 6 6 18"></path>
                                <path d="m6 6 12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="flex-1 overflow-y-auto p-6 space-y-4" id="cart-items"></div>
                    <div class="border-t border-border p-6 bg-secondary/30">
                        <div class="flex justify-between items-center mb-2">
                            <span class="text-muted-foreground">Articles (${totalItems})</span>
                            <span class="text-foreground">${formatKmf(totalPrice)}</span>
                        </div>
                        <div class="flex justify-between items-center mb-6 text-xl font-bold">
                            <span class="text-foreground">Total</span>
                            <span class="text-primary">${formatKmf(totalPrice)}</span>
                        </div>
                        <button id="confirmOrderBtn" data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-6 w-full">
                            Confirmer la commande
                        </button>
                    </div>
                </div>
            </div>
        `;

        const cartItems = document.getElementById('cart-items');
        cartItems.innerHTML = Object.values(cart).map((item) => `
            <div class="flex gap-4 pb-4 border-b border-border">
                <div class="w-20 h-20 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                    <img alt="${item.name}" class="w-full h-full object-cover" src="/media/${item.image || ''}"/>
                </div>
                <div class="flex-1">
                    <h3 class="font-semibold text-foreground">${item.name}</h3>
                    <p class="text-primary font-bold mt-1">${item.price} KMF / pièce</p>
                </div>
                <div class="flex flex-col items-end gap-2">
                    <div class="flex items-center gap-2">
                        <button data-id="${item.id}" class="minus-button border rounded-md h-8 w-8">-</button>
                        <span class="quantity text-lg font-bold text-primary w-8 text-center">${item.quantity}</span>
                        <button data-id="${item.id}" class="plus-button border rounded-md h-8 w-8">+</button>
                    </div>
                    <p class="text-lg font-bold text-foreground">${formatKmf(item.price * item.quantity)}</p>
                </div>
            </div>
        `).join('');

        modalContainer.querySelectorAll('.plus-button').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                cart[id].quantity += 1;
                openCartModal();
            });
        });

        modalContainer.querySelectorAll('.minus-button').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                cart[id].quantity -= 1;
                if (cart[id].quantity <= 0) {
                    delete cart[id];
                }
                if (Object.keys(cart).length === 0) {
                    modalContainer.innerHTML = '';
                    updateCartButton();
                    return;
                }
                openCartModal();
            });
        });

        const closeModal = document.getElementById('closeModal');
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });

        const confirmBtn = document.getElementById('confirmOrderBtn');
        confirmBtn.addEventListener('click', async () => {
            const itemsPayload = Object.values(cart).map(item => ({
                id: item.id,
                quantity: item.quantity,
                price: item.price,
            }));

            try {
                const response = await fetch('/pyromane/order/create/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken.value,
                    },
                    body: JSON.stringify({ items: itemsPayload }),
                });
                const data = await window.safeJson(response);
                if (!data || !data.success) {
                    alert(data.error || 'Impossible de valider la commande.');
                    return;
                }
                cart = {};
                updateCartButton();
                showSuccessModal(data.order_number);
            } catch (error) {
                console.error(error);
                alert('Erreur lors de la validation.');
            }
        });
    }

    function showSuccessModal(orderNumber) {
        modalContainer.innerHTML = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div class="bg-background rounded-xl border p-6 w-full max-w-md text-center">
                    <h2 class="text-2xl font-bold text-foreground">Commande validée</h2>
                    <p class="text-muted-foreground mt-2">Veuillez vous rendre à la caisse avec ce numéro.</p>
                    <div class="text-4xl font-bold text-primary mt-4">${orderNumber}</div>
                    <button id="closeSuccess" class="mt-6 inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-6 w-full">OK</button>
                </div>
            </div>
        `;
        const closeSuccess = document.getElementById('closeSuccess');
        closeSuccess.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
    }

    cartBtn?.addEventListener('click', openCartModal);

    renderProducts();
    updateCartButton();
});

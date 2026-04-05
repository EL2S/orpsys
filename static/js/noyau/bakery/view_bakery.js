document.addEventListener('DOMContentLoaded', function () {
    const listeProduits = document.getElementById('list-products');
    const products = document.getElementById('products');
    const cartBtn = document.getElementById('btn-cart');
    const modalContainer = document.getElementById('modalContainer');
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]');
    cartBtn.innerHTML = "";
    let panier = {};
    let productsData = [];
    if (products) {
        try {
            const rawProducts = (products.textContent || "").trim();
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
        } catch (_) {
            productsData = [];
        }
    }

    const ITEMS_PER_PAGE = 12;

    updateCartDisplay();

    function updateCartDisplay() {

        const totalItems = Object.values(panier).reduce((sum, p) => sum + p.quantity, 0);
        const totalPrice = Object.values(panier).reduce((sum, p) => sum + (p.quantity * p.price), 0);

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
            <span data-slot="badge" class="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&amp;&gt;svg]:size-3 gap-1 [&amp;&gt;svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent [a&amp;]:hover:bg-primary/90 ml-2 bg-primary-foreground text-primary">
                ${totalPrice}KMF
            </span>
        `;

        cartBtn.addEventListener('click', function () {
            if (this.disabled) return;
            orderSummary(panier);
        });
    }

    function orderSummary(panier) {
        const totalItems = Object.values(panier).reduce((sum, p) => sum + p.quantity, 0);
        const totalPrice = Object.values(panier).reduce((sum, p) => sum + (p.quantity * p.price), 0);
        const checkoutDisabled = totalItems === 0 ? "disabled" : "";
        modalContainer.innerHTML = `
            <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div data-slot="card" class="text-card-foreground gap-6 rounded-xl border py-6 shadow-sm w-full max-w-2xl max-h-[90vh] flex flex-col bg-background">
                    <div class="flex items-center justify-between p-6 border-b border-border">
                        <h2 class="text-2xl font-bold text-foreground">Résumé de Commande</h2>
                        <button data-slot="button" id="closeModal" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 size-9">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x h-6 w-6">
                                <path d="M18 6 6 18"></path>
                                <path d="m6 6 12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="flex-1 overflow-y-auto p-6">
                        <div class="space-y-4" id="cart-items">
                            
                        </div>
                    </div>
                    <div class="border-t border-border p-6 bg-secondary/30">
                        <div class="flex justify-between items-center mb-2">
                            <span class="total-items text-muted-foreground">Articles (${totalItems})</span>
                            <span class="total-price text-foreground">${totalPrice}KMF</span>
                        </div>
                        <div class="flex justify-between items-center mb-6 text-xl font-bold">
                            <span class="text-foreground">Total</span>
                            <span class="total-price text-primary">${totalPrice}KMF</span>
                        </div>
                        <button id="confirmOrderBtn" ${checkoutDisabled} data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-6 has-[&gt;svg]:px-4 w-full">
                            Confirmer la commande
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right ml-2 h-5 w-5">
                                <path d="M5 12h14"></path>
                                <path d="m12 5 7 7-7 7"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

        
        `;
        const closeModal = document.getElementById('closeModal');
        const cartItems = document.getElementById('cart-items');
        let itemsHTML = Object.entries(panier).map(([id, item]) => `
            <div class="flex gap-4 pb-4 border-b border-border" data-id="${id}">
                <div class="w-20 h-20 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                    <img alt="${item.name}" class="w-full h-full object-cover" src="/media/${item.image}"/>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-lg text-foreground truncate">
                        ${item.name}
                    </h3>
                    <p class="text-muted-foreground text-sm">${item.category}</p>
                    <p class="text-primary font-bold mt-1">${item.price}KMF / pièce</p>
                </div>
                <div class="flex flex-col items-end gap-2">
                    <div class="flex items-center gap-2">
                        <button data-id="${id}" data-slot="button" class="minus-button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-9 h-8 w-8">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus h-4 w-4">
                                <path d="M5 12h14"></path>
                            </svg>
                        </button> 
                        <input type="number" min="1" inputmode="numeric" class="quantity-input text-center text-base font-semibold text-primary w-16 h-8 rounded-md border border-border bg-background" value="${item.quantity}" />
                        <button data-id="${id}" data-slot="button" class="plus-button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-9 h-8 w-8">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus h-4 w-4">
                                <path d="M5 12h14"></path>
                                <path d="M12 5v14"></path>
                            </svg>
                        </button>
                    </div>
                    <p class="text-lg font-bold text-foreground">${parseFloat(item.price) * parseInt(item.quantity)}KMF</p>
                </div>
            </div>
        `).join('');

        if (totalItems === 0){
            cartItems.innerHTML = `<div class="text-center py-12 text-muted-foreground">Votre panier est vide</div>`;
            closeModal.addEventListener('click', () => {
                modalContainer.innerHTML = '';
            });
            return;
        };
        cartItems.innerHTML = itemsHTML;
        closeModal.addEventListener('click', () => {
            modalContainer.innerHTML = '';
        });
        cartItems.querySelectorAll('.plus-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const container = e.target.closest('.flex.items-center.gap-2');
                const id = e.target.closest('[data-id]').dataset.id;
                changeOrderQuantity(id, +1, container);
            });
        });

        cartItems.querySelectorAll('.minus-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const container = e.target.closest('.flex.items-center.gap-2');
                const id = e.target.closest('[data-id]').dataset.id;
                changeOrderQuantity(id, -1, container);
            });
        });

        cartItems.querySelectorAll(".quantity-input").forEach(input => {
            input.addEventListener("change", (e) => {
                const row = e.target.closest("[data-id]");
                if (!row) return;
                const id = row.dataset.id;
                const container = e.target.closest(".flex.items-center.gap-2");
                const rawValue = parseInt(e.target.value, 10);
                const nextQty = Number.isFinite(rawValue) ? rawValue : 0;
                setOrderQuantity(id, nextQty, container);
            });
        });

        const confirmOrderBtn = document.getElementById("confirmOrderBtn");

        confirmOrderBtn?.addEventListener("click", () => {
            localStorage.clear();
            localStorage.setItem("cart", JSON.stringify(panier));
            window.location.href = "/bakery/order/confirmation/";
        });

    }

    function applyOrderQuantity(id, nextQty, containerInModal) {
        const product = panier[id];
        if (!product) return;
        const productCard = listeProduits.querySelector(`.product-card[data-id="${id}"]`);
        const containerCard = productCard ? productCard.querySelector(".flex.items-center.gap-2") : null;

        const normalizedQty = Math.max(0, parseInt(nextQty || 0, 10) || 0);
        product.quantity = normalizedQty;

        if (product.quantity <= 0) {
            delete panier[id];
            updateCartDisplay();
            orderSummary(panier);

            if (containerCard) {
                containerCard.innerHTML = `
                    <button class="add-button bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-6 w-full">
                        Ajouter
                    </button>
                `;
                const addBtn = containerCard.querySelector(".add-button");
                addBtn.addEventListener("click", () => {
                    handleAddProduct(containerCard.closest(".flex.flex-col"), product);
                });
            }
            return;
        }

        if (containerInModal) {
            const input = containerInModal.querySelector(".quantity-input");
            if (input) input.value = product.quantity;
        }

        if (containerCard) {
            const input = containerCard.querySelector(".quantity-input");
            if (input) input.value = product.quantity;
        }

        updateCartDisplay();
        orderSummary(panier);
    }

    function changeOrderQuantity(id, delta, containerInModal) {
        const current = panier[id] ? panier[id].quantity : 0;
        applyOrderQuantity(id, current + delta, containerInModal);
    }

    function setOrderQuantity(id, quantity, containerInModal) {
        applyOrderQuantity(id, quantity, containerInModal);
    }


    function groupByCategory(products) {
        const grouped = {};

        products.forEach(p => {
            if (!grouped[p.category]) {
                grouped[p.category] = {
                    name: p.category,
                    count: 0,
                    items: [],
                    page: 1 // pagination individuelle par catégorie
                };
            }
            grouped[p.category].items.push(p);
            grouped[p.category].count++;
        });

        return Object.values(grouped);
    }

    function renderCategoryProducts(grid, category) {
        grid.innerHTML = "";

        const start = (category.page - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const pageItems = category.items.slice(start, end);

        pageItems.forEach(product => {
            const card = document.createElement('div');
            card.className = "product-card bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm overflow-hidden hover:shadow-lg transition-shadow";
            card.setAttribute('data-id', product.id);
            card.innerHTML = `
                <div class="aspect-square bg-muted relative">
                    <img class="w-full h-full object-cover" alt="${product.name}" src="/media/${product.image}"/>
                </div>
                <div class="p-4">
                    <h3 class="font-semibold text-lg mb-1 text-foreground">${product.name}</h3>
                    <p class="text-2xl font-bold text-primary mb-3">
                        ${product.price}KMF <span class="text-sm text-muted-foreground ml-1">/ pièce</span>
                    </p>
                    <div class="flex items-center gap-2">
                        <button class="add-button bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-6 w-full">
                            Ajouter
                        </button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
            const addBtn = card.querySelector(".add-button");
            addBtn.addEventListener("click", () => {
                handleAddProduct(card, product);
            });

        });
    }

    function handleAddProduct(card, product) {
        panier[product.id] = {
            id:product.id,
            quantity: 1,
            price: product.price,
            image: product.image,
            name: product.name,
            category: product.category,
        };
        updateCartDisplay();
        const container = card.querySelector(".flex.items-center.gap-2");
        container.innerHTML = `
            <button data-slot="button" class="minus-btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-9 h-10 w-10">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus h-5 w-5">
                    <path d="M5 12h14"></path>
                </svg>
            </button>
            <div class="flex-1 text-center">
                <input type="number" min="1" inputmode="numeric" class="quantity-input text-center text-base font-semibold text-primary w-16 h-10 rounded-md border border-border bg-background" value="1" />
            </div>
            <button data-slot="button" class="plus-btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-9 h-10 w-10">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus h-5 w-5">
                    <path d="M5 12h14"></path>
                    <path d="M12 5v14"></path>
                </svg>
            </button>
        `;

        container.querySelector(".plus-btn").addEventListener("click", () => changeQuantity(product, +1, container));
        container.querySelector(".minus-btn").addEventListener("click", () => changeQuantity(product, -1, container));
        const input = container.querySelector(".quantity-input");
        if (input) {
            input.addEventListener("change", (e) => {
                const rawValue = parseInt(e.target.value, 10);
                const nextQty = Number.isFinite(rawValue) ? rawValue : 0;
                setCardQuantity(product, nextQty, container);
            });
        }
    }

    function setCardQuantity(product, quantity, container) {
        const id = product.id;
        const nextQty = Math.max(0, parseInt(quantity || 0, 10) || 0);
        panier[id].quantity = nextQty;
        if (panier[id].quantity <= 0) {
            delete panier[id];
            updateCartDisplay();
            container.innerHTML = `
                <button class="add-button bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-6 w-full">
                    Ajouter
                </button>
            `;

            const addBtn = container.querySelector(".add-button");
            addBtn.addEventListener("click", () => 
                handleAddProduct(container.closest(".flex.flex-col"), product)
            );
            return;
        }

        const input = container.querySelector(".quantity-input");
        if (input) input.value = panier[id].quantity;
        updateCartDisplay();
    }

    function changeQuantity(product, delta, container) {
        const id = product.id;
        panier[id].quantity += delta;
        if (panier[id].quantity <= 0) {
            delete panier[id];
            updateCartDisplay();
            container.innerHTML = `
                <button class="add-button bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-6 w-full">
                    Ajouter
                </button>
            `;

            const addBtn = container.querySelector(".add-button");
            addBtn.addEventListener("click", () => 
                handleAddProduct(container.closest(".flex.flex-col"), product)
            );
            return;
        }

        const input = container.querySelector(".quantity-input");
        if (input) input.value = panier[id].quantity;
        updateCartDisplay();
    }

    function renderProducts(data) {
        listeProduits.innerHTML = '';

        const grouped = groupByCategory(data);

        grouped.forEach(category => {
            const totalPages = Math.ceil(category.items.length / ITEMS_PER_PAGE);

            const section = document.createElement('section');
            section.className = "mb-12";

            section.innerHTML = `
                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-2xl font-semibold text-foreground">
                        ${category.name}
                        <span class="ml-3 text-sm text-muted-foreground font-normal">(${category.count} produits)</span>
                    </h2>
                    <div class="flex items-center gap-2">
                        <button data-slot="button" class="prev-btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-9" ${category.page === 1 ? 'disabled' : ''}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left h-5 w-5">
                                <path d="m15 18-6-6 6-6"></path>
                            </svg>
                        </button>
                        <span class="page-indicator text-sm text-muted-foreground min-w-[80px] text-center">Page ${category.page} / ${totalPages}</span>
                        <button data-slot="button" class="next-btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 size-9" ${category.page === totalPages ? 'disabled' : ''}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right h-5 w-5">
                                <path d="m9 18 6-6-6-6"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"></div>
            `;

            const grid = section.querySelector(".grid");

            renderCategoryProducts(grid, category);

            const prevBtn = section.querySelector(".prev-btn");
            const nextBtn = section.querySelector(".next-btn");
            const pageIndicator = section.querySelector(".page-indicator");

            prevBtn.addEventListener("click", () => {
                if (category.page > 1) {
                    category.page--;
                    renderCategoryProducts(grid, category);
                    prevBtn.disabled = category.page === 1;
                    nextBtn.disabled = category.page === totalPages;
                    pageIndicator.textContent = `Page ${category.page} / ${totalPages}`;
                }
            });

            nextBtn.addEventListener("click", () => {
                if (category.page < totalPages) {
                    category.page++;
                    renderCategoryProducts(grid, category);
                    prevBtn.disabled = category.page === 1;
                    nextBtn.disabled = category.page === totalPages;
                    pageIndicator.textContent = `Page ${category.page} / ${totalPages}`;
                }
            });

            listeProduits.appendChild(section);
        });
    }

    renderProducts(productsData);
});

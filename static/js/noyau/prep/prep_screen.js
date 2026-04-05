function updateDate() {
    const el = document.getElementById("current-date");
    const now = new Date();
    const options = { weekday: "long", day: "numeric", month: "long" };
    const text = now.toLocaleDateString("fr-FR", options);
    el.textContent = text.charAt(0).toUpperCase() + text.slice(1);
}

updateDate();
setInterval(updateDate, 60 * 1000);

let currentOrderCount = parseInt(
    document.getElementById("orders-count").dataset.count
);

async function checkForNewOrders() {
    try {
        const response = await fetch("/prep/orders/count/");
        const data = await response.json();

        if (data.total_orders > currentOrderCount) {
            // Nouvelle commande détectée → recharge la page
            location.reload();
        }
    } catch (error) {
        console.error("Erreur vérification commandes:", error);
    }
}

// Vérifie toutes les 5 secondes (idéal pour cuisine)
setInterval(checkForNewOrders, 5000);

function formatLivraisonFR(dateStr, timeStr) {
    const [day, month, year] = dateStr.split("/").map(Number);
    const date = new Date(year, month - 1, day);

    const jours = [
        "dimanche", "lundi", "mardi", "mercredi",
        "jeudi", "vendredi", "samedi"
    ];

    const mois = [
        "janvier", "février", "mars", "avril",
        "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"
    ];

    const jourNom = jours[date.getDay()];
    const jour = date.getDate();
    const moisNom = mois[date.getMonth()];
    const annee = date.getFullYear();

    let heure = "--";
    let minute = "--";

    if (timeStr) {
        [heure, minute] = timeStr.split(":");
    }

    return `Livraison : ${jourNom} ${jour} ${moisNom} ${annee} à ${heure} H ${minute}`;
}


let currentOrderIndex = 0;
let ordersCache = [];

async function checkOrdersForToday() {
    try {
        const response = await fetch("/prep/orders/count/today/");
        const data = await response.json();

        const prepScreen = document.getElementById("prep-screen");
        const prepScreenAlert = document.getElementById("prep-screen-alert");

        if (data.today_orders > 0 && data.orders.length > 0) {
            ordersCache = data.orders; // ⬅️ on stocke TOUT
            currentOrderIndex = 0;     // ⬅️ on affiche la première

            if (prepScreen) prepScreen.style.display = "none";
            if (prepScreenAlert) prepScreenAlert.style.display = "block";

            renderOrder(currentOrderIndex);
        } else {
            if (prepScreen) prepScreen.style.display = "block";
            if (prepScreenAlert) prepScreenAlert.style.display = "none";
        }

    } catch (error) {
        console.error("Erreur commandes :", error);
    }
}

function renderOrder(index) {
    const order = ordersCache[index];
    if (!order) return;

    const livraison = formatLivraisonFR(
        order.pickup_date,
        order.time
    );

    let itemsHTML = order.items.map(item => `
        <div data-slot="card" class="text-card-foreground flex flex-col gap-6 rounded-xl shadow-sm bg-slate-800/90 border-slate-600 border-2 p-10 hover:border-red-500 transition-all">
            <div class="flex gap-8">
                <div class="w-40 h-40 bg-slate-700 rounded-xl overflow-hidden flex-shrink-0">
                    <img
                        alt="${item.name}"
                        class="w-full h-full object-cover"
                        src="/media/${item.image}"
                    />
                </div>
                <div class="flex-1">
                    <div class="flex items-start justify-between mb-4">
                        <div>
                                <p class="text-slate-400 text-xl mb-2">Article #${item.count}</p>
                                <h3 class="text-4xl font-bold text-white leading-tight mb-3">
                                    ${item.name}
                                </h3>
                                <p class="text-slate-400 text-2xl">Quantité : ${item.quantity} / pièce</p>
                        </div>
                        <div class="text-center">
                            <p class="text-amber-400 text-2xl font-bold mb-2">Quantité</p>
                            <div class="bg-red-500 text-white font-black text-7xl px-10 py-6 rounded-xl">
                                ×${item.quantity}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    `).join('');

    document.getElementById("prep-screen-alert").innerHTML = `
        <div class="max-w-[1920px] mx-auto">
            <div class="flex items-center justify-between mb-8">
                <div class="flex items-center gap-6">
                    <div class="bg-red-500 p-6 rounded-xl animate-pulse">
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
                            class="lucide lucide-triangle-alert h-12 w-12 text-white"
                        >
                            <path
                            d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"
                            ></path>
                            <path d="M12 9v4"></path>
                            <path d="M12 17h.01"></path>
                        </svg>
                    </div>
                    
                    <div>
                        <h1 class="text-6xl font-black text-white mb-4">COMMANDE À PRÉPARER</h1>
                        <div class="bg-yellow-500 px-8 py-4 rounded-xl inline-block">
                            <p class="text-slate-900 text-4xl font-black">📅 ${livraison}</p>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-4">
                    <button onclick="prevOrder()" ${index === 0 ? "disabled" : ""} data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border shadow-xs hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-10 rounded-md has-[&gt;svg]:px-4 bg-slate-800 border-slate-600 hover:bg-slate-700 text-white text-xl px-6 py-6">
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
                        class="lucide lucide-chevron-left h-8 w-8"
                        >
                        <path d="m15 18-6-6 6-6"></path>
                        </svg>
                    </button>
                    <div class="bg-slate-800 border-2 border-red-500 px-8 py-4 rounded-xl">
                        <p class="text-white text-3xl font-black">${index + 1} / ${ordersCache.length}</p>
                        <p class="text-red-400 text-sm text-center mt-1">Manuel</p>
                    </div>
                    <button onclick="nextOrder()" ${index === ordersCache.length - 1 ? "disabled" : ""} data-slot="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&amp;_svg]:pointer-events-none [&amp;_svg:not([class*='size-'])]:size-4 shrink-0 [&amp;_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border shadow-xs hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-10 rounded-md has-[&gt;svg]:px-4 bg-slate-800 border-slate-600 hover:bg-slate-700 text-white text-xl px-6 py-6">
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
                        class="lucide lucide-chevron-right h-8 w-8"
                        >
                        <path d="m9 18 6-6-6-6"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div data-slot="card" class="text-card-foreground flex flex-col gap-6 rounded-xl shadow-sm bg-slate-800/90 border-red-500 border-2 p-10 mb-8">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-slate-400 text-2xl mb-3">Client</p>
                        <h2 class="text-7xl font-black text-white">${order.client}</h2>
                    </div>
                    <div class="text-right">
                        <p class="text-slate-400 text-2xl mb-3">Commande N°</p>
                        <p class="text-5xl font-bold text-white">#${order.order_number}</p>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-10">
                ${itemsHTML}
            </div>
            <div data-slot="card" class="text-card-foreground flex flex-col gap-6 rounded-xl shadow-sm mt-10 bg-red-900/40 border-red-500 border-2 p-10">
                <div class="flex items-center gap-8">
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
                            class="lucide lucide-package h-20 w-20 text-red-400"
                        >
                            <path d="m7.5 4.27 9 5.15"></path>
                            <path
                                d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"
                            ></path>
                            <path d="m3.3 7 8.7 5 8.7-5"></path>
                            <path d="M12 22V12"></path>
                        </svg>
                    <div>
                        <p class="text-red-300 text-3xl mb-3">TOTAL D'ARTICLES À PRÉPARER</p>
                        <p class="text-8xl font-black text-white">${order.item_count} unités</p>
                    </div>
                </div>
            </div>

        </div>
    `;
}

function nextOrder() {
    if (currentOrderIndex < ordersCache.length - 1) {
        currentOrderIndex++;
        renderOrder(currentOrderIndex);
    }
}

function prevOrder() {
    if (currentOrderIndex > 0) {
        currentOrderIndex--;
        renderOrder(currentOrderIndex);
    }
}


// Vérifie toutes les 5 secondes
setInterval(checkOrdersForToday, 5000);
checkOrdersForToday();

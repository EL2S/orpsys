document.addEventListener('DOMContentLoaded', function () {
    const navLinks = document.querySelectorAll('nav a'); // Tous les liens dans le nav
    const currentUrl = window.location.pathname; // URL actuelle
    const closeBtn = document.getElementById("close-menu");
    const translateFull = document.getElementById("translate-x-full");
    const screenView = document.getElementById("screen-hidden");
    const openBtn = document.getElementById("open-menu");
    const customItems = document.querySelectorAll(".custom-items");
    customItems.forEach(link => {
        link.addEventListener('click', function () {
            if (screenView) screenView.className = "";
            if (translateFull) translateFull.className = "fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-200 ease-in-out -translate-x-full lg:translate-x-0";
        });
    });
    navLinks.forEach(link => {
        const svg = link.querySelector('svg');
        const defaultLinkClass = "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800";
        const activeLinkClass = "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400";

        const defaultSvgClass = "lucide h-5 w-5 text-slate-400";
        const activeSvgClass = "lucide h-5 w-5 text-amber-600";

        // Appliquer la classe par défaut
        link.className = defaultLinkClass;
        if (svg) svg.className.baseVal = defaultSvgClass;

        // Vérifier si le href correspond à l'URL actuelle
        if (link.getAttribute('href') === currentUrl) {
            link.className = activeLinkClass;
            if (svg) svg.className.baseVal = activeSvgClass;
        }
    });
    const logouts = document.querySelectorAll('.button-logout');
    logouts.forEach(button => {
        button.addEventListener('click', function (event) {
            event.preventDefault();
            window.location.href = `/logout/`;
        });
    });
    
    if(closeBtn){
        closeBtn.addEventListener('click', function () {
            screenView.className = "";
            translateFull.className = "fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-200 ease-in-out -translate-x-full lg:translate-x-0";
        });
    }
    if(openBtn){
        openBtn.addEventListener('click', function () {
            screenView.className = "fixed inset-0 bg-black/50 z-20 lg:hidden";
            translateFull.className = "fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-200 ease-in-out lg:translate-x-0";
        });
    }
});

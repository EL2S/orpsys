document.addEventListener('DOMContentLoaded', function () {
    const navLinks = document.querySelectorAll('nav a'); // Tous les liens dans le nav
    const currentUrl = window.location.pathname; // URL actuelle

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
});

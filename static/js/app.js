window.safeJson = async function (res) {
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    if (!res.ok) {
        if (isJson) {
            const body = await res.json().catch(() => ({}));
            const message = body && body.error ? body.error : `Erreur HTTP ${res.status}`;
            throw new Error(message);
        }
        const text = await res.text().catch(() => '');
        throw new Error(text || `Erreur HTTP ${res.status}`);
    }

    if (!isJson) {
        const text = await res.text().catch(() => '');
        throw new Error(text ? `Réponse non-JSON: ${text.slice(0, 160)}` : 'Réponse non-JSON');
    }

    return res.json();
};

document.addEventListener('DOMContentLoaded', function () {
    const shell = document.querySelector('.app-shell');
    const navLinks = document.querySelectorAll('[data-nav-link]');
    const currentUrl = window.location.pathname;
    const closeBtn = document.getElementById('close-menu');
    const overlay = document.getElementById('screen-hidden');
    const openBtn = document.getElementById('open-menu');

    const setActiveLink = (link) => {
        const href = link.getAttribute('href');
        if (!href) {
            return false;
        }

        const isActive =
            currentUrl === href ||
            (href !== '/' && (currentUrl.startsWith(`${href}/`) || currentUrl.startsWith(`${href}?`)));

        link.classList.toggle('nav-link--active', isActive);
        return isActive;
    };

    navLinks.forEach((link) => {
        setActiveLink(link);
        link.addEventListener('click', function () {
            if (shell) {
                shell.classList.remove('is-open');
            }
        });
    });

    const openMenu = () => {
        if (shell) {
            shell.classList.add('is-open');
        }
    };

    const closeMenu = () => {
        if (shell) {
            shell.classList.remove('is-open');
        }
    };

    if (openBtn) {
        openBtn.addEventListener('click', openMenu);
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeMenu);
    }

    if (overlay) {
        overlay.addEventListener('click', closeMenu);
    }

    const logouts = document.querySelectorAll('.button-logout');
    logouts.forEach((button) => {
        button.addEventListener('click', function (event) {
            event.preventDefault();
            window.location.href = `/logout/`;
        });
    });
});

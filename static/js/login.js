(() => {
    const btnBadge = document.getElementById('btn-badge');
    const btnPassword = document.getElementById('btn-password');
    const tabBadge = document.getElementById('tab-badge');
    const tabPassword = document.getElementById('tab-password');
    const scanInput = document.getElementById('scan');
    const scanForm = document.getElementById('scanHiddenForm');
    const scanEmployerIdInput = document.getElementById('scan_employer_id');
    const employeesScript = document.getElementById('employees_json');
    let employeesData = [];

    if (!btnBadge || !btnPassword || !tabBadge || !tabPassword) {
        return;
    }

    if (employeesScript) {
        try {
            employeesData = JSON.parse(employeesScript.textContent || '[]');
        } catch (error) {
            employeesData = [];
        }
    }

    const setActiveTab = (tab) => {
        const showBadge = tab === 'badge';

        tabBadge.style.display = showBadge ? 'block' : 'none';
        tabPassword.style.display = showBadge ? 'none' : 'block';

        btnBadge.classList.toggle('bg-background', showBadge);
        btnPassword.classList.toggle('bg-background', !showBadge);

        if (showBadge && scanInput) {
            scanInput.focus();
            scanInput.select();
        }
    };

    setActiveTab('badge');

    btnBadge.addEventListener('click', () => setActiveTab('badge'));
    btnPassword.addEventListener('click', () => setActiveTab('password'));

    if (!scanInput || !scanForm) {
        return;
    }

    let isScanInProgress = false;

    const handleScan = async () => {
        if (!scanInput || isScanInProgress) {
            return;
        }

        const cartValue = extractScanValue(scanInput.value);
        if (!cartValue) {
            return;
        }

        const normalizedScanValue = cartValue.trim();
        const normalizedHashValue = normalizedScanValue.toLowerCase();
        const isHash = /^[a-f0-9]{64}$/.test(normalizedHashValue);

        isScanInProgress = true;
        try {
            let matchedEmployer = null;

            if (isHash) {
                matchedEmployer = await scanCart(normalizedHashValue);
            } else if (employeesData.length) {
                matchedEmployer = employeesData.find((employer) => {
                    const badgeId = (employer.badge_id || "").toString();
                    return badgeId && badgeId.toLowerCase() === normalizedScanValue.toLowerCase();
                });
            }

            if (scanEmployerIdInput) {
                scanEmployerIdInput.value = matchedEmployer ? matchedEmployer.id : "";
            }

            scanInput.value = isHash ? normalizedHashValue : normalizedScanValue;
            scanForm.submit();
        } finally {
            isScanInProgress = false;
        }
    };

    if (scanForm) {
        scanForm.addEventListener('submit', function (event) {
            event.preventDefault();
            void handleScan();
        });
    }

    scanInput.addEventListener('input', function () {
        const rawValue = this.value.trim();
        const normalizedValue = rawValue.toLowerCase();
        if (
            normalizedValue.length >= 64 ||
            normalizedValue.includes('scan=') ||
            /^badge\d{4,}$/i.test(rawValue)
        ) {
            void handleScan();
        }
    });
    scanInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            void handleScan();
        }
    });

    function extractScanValue(rawValue) {
        const value = (rawValue || '').trim();
        if (!value) {
            return '';
        }

        try {
            const scannedUrl = new URL(value);
            const scanParam = scannedUrl.searchParams.get('scan');
            if (scanParam) {
                return scanParam.trim().toLowerCase();
            }
        } catch (error) {
            // Valeur brute: pas une URL.
        }

        const hashMatch = value.match(/[a-f0-9]{64}/i);
        if (hashMatch) {
            return hashMatch[0].toLowerCase();
        }

        return value.toLowerCase();
    }

    async function scanCart(cartValue) {
        const normalizedCartValue = cartValue.trim().toLowerCase();

        for (const employer of employeesData) {

            const employeeId = employer.id;
            const setting = employer.setting;     
            const badgeId = employer.badge_id; 

            // 🔐 Secure ID (IDENTIQUE à vos fichiers)
            const base = `${setting}|${badgeId}|${employeeId}`;
            const data = new TextEncoder().encode(base);
            const hash = await crypto.subtle.digest("SHA-256", data);

            const secureId = Array.from(new Uint8Array(hash))
                .map(b => b.toString(16).padStart(2, "0"))
                .join("");

            if (secureId === normalizedCartValue) {
                return employer; // On retourne la carte trouvée
            }
        }
        return null;
    }
    scanInput.focus();
})();

document.addEventListener("DOMContentLoaded", function () {
    const assistant = document.querySelector(".ai-assistant");
    const input = document.querySelector(".ai-input-bar input");
    const sendBtn = document.querySelector(".ai-send-btn");
    const debriefEl = document.getElementById("ai-debrief");
    const titleEl = document.getElementById("ai-debrief-title");
    const rangeEl = document.getElementById("ai-debrief-range");
    const stepperEl = document.getElementById("ai-stepper");
    const sectionsEl = document.getElementById("ai-debrief-sections");
    const prevBtn = document.getElementById("ai-prev");
    const nextBtn = document.getElementById("ai-next");
    const stopBtn = document.getElementById("ai-stop");
    const responseEl = document.getElementById("ai-response");
    const responseTitle = document.getElementById("ai-response-title");
    const responseRange = document.getElementById("ai-response-range");
    const responseGrid = document.getElementById("ai-response-grid");
    const responseControls = document.getElementById("ai-response-controls");
    const micBtn = document.querySelector(".ai-mic-btn");
    let recognition = null;
    let isListening = false;
    let micBaseInput = "";
    const helpBox = document.getElementById("ai-help");

    let data = { periods: [] };
    const dataEl = document.getElementById("ai-debrief-data");
    if (dataEl) {
        try {
            data = JSON.parse(dataEl.textContent || "{}");
        } catch (error) {
            data = { periods: [] };
        }
    }

    let currentIndex = 0;
    let currentRanking = null;
    let currentRankingSort = "score";

    function normalizeText(text) {
        return (text || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();
    }

    function toggleListening(state) {
        if (!micBtn) return;
        isListening = state;
        micBtn.classList.toggle("is-listening", state);
    }

    const helpSuggestions = [
        { label: "Débriefing", value: "Débriefing", hint: "Rapport global (jour, semaine, mois)." },
        { label: "Débriefing semaine", value: "Débriefing semaine", hint: "Synthèse hebdo complète." },
        { label: "Ventes aujourd’hui", value: "Ventes aujourd’hui", hint: "CA, tickets, panier moyen." },
        { label: "Top produits (quantité)", value: "Top produits quantité", hint: "Classement par quantités vendues." },
        { label: "Top produits (CA)", value: "Top produits CA", hint: "Classement par chiffre d’affaires." },
        { label: "Employé Ali aujourd’hui", value: "Employé Ali aujourd’hui", hint: "Historique & actions du jour." },
        { label: "Employé Ali historique", value: "Employé Ali historique", hint: "Historique complet." },
        { label: "Ruptures avant 10h", value: "Produits finis avant 10h", hint: "Alertes rupture trop tôt." },
        { label: "Production POS aujourd’hui", value: "Production POS aujourd’hui", hint: "Suivi production comptoir." },
        { label: "Production Boulangerie aujourd’hui", value: "Production Boulangerie aujourd’hui", hint: "Suivi production mini-four." },
        { label: "Stock faible", value: "Stock faible", hint: "Produits/ingrédients critiques." },
        { label: "Sorties stock cuisine", value: "Sorties stock cuisine", hint: "Mouvements vers cuisine." },
        { label: "Bons de monnaie émis", value: "Bons émis aujourd’hui", hint: "Suivi des bons." },
        { label: "Commandes Pyromane en attente", value: "Commandes Pyromane en attente", hint: "Commandes non payées." },
    ];

    function closeHelp() {
        if (!helpBox) return;
        helpBox.classList.remove("is-open");
        helpBox.innerHTML = "";
    }

    function renderHelpList(query) {
        if (!helpBox) return;
        const normalizedQuery = normalizeText(query);
        const filtered = helpSuggestions.filter(item => {
            if (!normalizedQuery) return true;
            const label = normalizeText(item.label);
            const hint = normalizeText(item.hint);
            return label.includes(normalizedQuery) || hint.includes(normalizedQuery);
        });

        if (!filtered.length) {
            closeHelp();
            return;
        }

        helpBox.innerHTML = "";
        filtered.forEach(item => {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "ai-help-item";
            row.innerHTML = `<strong>${item.label}</strong><span>${item.hint}</span>`;
            row.addEventListener("click", () => {
                if (input) {
                    input.value = item.value;
                    input.focus();
                }
                closeHelp();
            });
            helpBox.appendChild(row);
        });
        helpBox.classList.add("is-open");
    }

    function formatKmf(value) {
        const num = Number(value || 0);
        return `${Math.round(num)} KMF`;
    }

    function renderStepper() {
        if (!stepperEl) return;
        stepperEl.innerHTML = "";
        data.periods.forEach((period, index) => {
            const pill = document.createElement("button");
            pill.type = "button";
            pill.className = `ai-step${index === currentIndex ? " is-active" : ""}`;
            pill.textContent = period.label;
            pill.addEventListener("click", () => {
                currentIndex = index;
                renderStep();
            });
            stepperEl.appendChild(pill);
        });
    }

    function renderSummaryCard(summary) {
        if (!sectionsEl || !summary) return;
        const card = document.createElement("div");
        card.className = "ai-card ai-card--summary";
        card.style.animationDelay = "0ms";
        card.innerHTML = `
            <h3>Vue globale</h3>
            <div class="ai-summary-grid">
                <div class="ai-metric">
                    <div class="ai-metric-label">CA total</div>
                    <div class="ai-metric-value">${formatKmf(summary.ca_total)}</div>
                </div>
                <div class="ai-metric">
                    <div class="ai-metric-label">Tickets</div>
                    <div class="ai-metric-value">${summary.tickets_total}</div>
                </div>
                <div class="ai-metric">
                    <div class="ai-metric-label">Ticket moyen</div>
                    <div class="ai-metric-value">${formatKmf(summary.ticket_moyen)}</div>
                </div>
            </div>
            <div class="ai-breakdown">
                POS: ${formatKmf(summary.pos.ca)} · ${summary.pos.tickets} tickets<br />
                Mini-Four: ${formatKmf(summary.mini_four.ca)} · ${summary.mini_four.tickets} tickets<br />
                Pyromane: ${formatKmf(summary.pyromane.ca)} · ${summary.pyromane.tickets} tickets
            </div>
        `;
        sectionsEl.appendChild(card);
    }

    function renderSectionCard(section, index) {
        if (!sectionsEl || !section) return;
        const card = document.createElement("div");
        card.className = "ai-card";
        card.style.animationDelay = `${Math.min(index * 70, 420)}ms`;
        const summaryLines = (section.summary || []).map(line => `<li>${line}</li>`).join("");
        const issuesLines = (section.issues || []).map(line => `<li class="ai-alert">${line}</li>`).join("");
        const improvementsLines = (section.improvements || []).map(line => `<li>${line}</li>`).join("");
        const actionsLines = (section.actions || []).map(line => `<li>${line}</li>`).join("");
        card.innerHTML = `
            <h3>${section.title}</h3>
            <div>
                <div class="ai-mini-title">Résumé</div>
                <ul class="ai-list">${summaryLines || "<li>Aucune donnée.</li>"}</ul>
            </div>
            <div>
                <div class="ai-mini-title">Problèmes</div>
                <ul class="ai-list">${issuesLines || "<li>Aucun problème détecté.</li>"}</ul>
            </div>
            <div>
                <div class="ai-mini-title">Améliorations</div>
                <ul class="ai-list">${improvementsLines || "<li>Aucune amélioration.</li>"}</ul>
            </div>
            <div>
                <div class="ai-mini-title">Actions</div>
                <ul class="ai-list">${actionsLines || "<li>Aucune action requise.</li>"}</ul>
            </div>
        `;
        sectionsEl.appendChild(card);
    }

    function renderStep() {
        if (!data.periods.length) {
            return;
        }
        const period = data.periods[currentIndex];
        if (titleEl) titleEl.textContent = period.label;
        if (rangeEl) rangeEl.textContent = period.range_label;

        renderStepper();
        if (sectionsEl) {
            sectionsEl.innerHTML = "";
            renderSummaryCard(period.summary);
            (period.sections || []).forEach((section, index) => renderSectionCard(section, index + 1));
        }

        if (prevBtn) prevBtn.disabled = currentIndex === 0;
        if (nextBtn) {
            nextBtn.textContent = currentIndex === data.periods.length - 1 ? "Terminer" : "Suivant";
        }
    }

    function openDebrief() {
        if (!debriefEl || !assistant) return;
        if (!data.periods.length) {
            return;
        }
        currentIndex = 0;
        assistant.classList.add("is-debriefing");
        debriefEl.classList.add("is-active");
        if (responseEl) {
            responseEl.classList.remove("is-active");
        }
        renderStep();
    }

    function closeDebrief() {
        if (!debriefEl || !assistant) return;
        debriefEl.classList.remove("is-active");
        assistant.classList.remove("is-debriefing");
    }

    function renderResponseCards(sections) {
        if (!responseGrid) return;
        responseGrid.innerHTML = "";
        (sections || []).forEach((section, index) => {
            const card = document.createElement("div");
            card.className = "ai-card";
            card.style.animationDelay = `${Math.min(index * 70, 420)}ms`;
            const summaryLines = (section.summary || []).map(line => `<li>${line}</li>`).join("");
            const issuesLines = (section.issues || []).map(line => `<li class="ai-alert">${line}</li>`).join("");
            const actionsLines = (section.actions || []).map(line => `<li>${line}</li>`).join("");
            card.innerHTML = `
                <h3>${section.title}</h3>
                <div>
                    <div class="ai-mini-title">Résumé</div>
                    <ul class="ai-list">${summaryLines || "<li>Aucune donnée.</li>"}</ul>
                </div>
                <div>
                    <div class="ai-mini-title">Points clés</div>
                    <ul class="ai-list">${issuesLines || "<li>Aucune alerte.</li>"}</ul>
                </div>
                <div>
                    <div class="ai-mini-title">Actions</div>
                    <ul class="ai-list">${actionsLines || "<li>Aucune action.</li>"}</ul>
                </div>
            `;
            responseGrid.appendChild(card);
        });
    }

    function buildRankingLines(list) {
        return list.map(item => {
            const score = Number(item.score || 0);
            const starsCount = Math.max(1, Math.min(5, Math.round(score / 20)));
            const stars = "★".repeat(starsCount) + "☆".repeat(5 - starsCount);
            const badge = item.badge || (score >= 85 ? "OK" : score >= 60 ? "Attention" : "Critique");
            return `${item.name} · Fiabilité ${score}% · ${stars} · ${badge} · Alertes ${item.alerts} · Shifts ${item.shifts}`;
        });
    }

    function renderRanking(sortKey) {
        if (!currentRanking) return;
        const list = [...currentRanking];
        if (sortKey === "alerts") {
            list.sort((a, b) => (a.alerts || 0) - (b.alerts || 0));
        } else if (sortKey === "shifts") {
            list.sort((a, b) => (b.shifts || 0) - (a.shifts || 0));
        } else {
            list.sort((a, b) => (b.score || 0) - (a.score || 0));
        }
        const section = {
            title: "Employés",
            summary: buildRankingLines(list),
            issues: [],
            actions: [],
        };
        renderResponseCards([section]);
    }

    function renderRankingControls() {
        if (!responseControls) return;
        responseControls.innerHTML = "";
        if (!currentRanking) return;
        const buttons = [
            { key: "score", label: "Fiabilité" },
            { key: "alerts", label: "Alertes" },
            { key: "shifts", label: "Shifts" },
        ];
        buttons.forEach(btn => {
            const el = document.createElement("button");
            el.type = "button";
            el.className = `ai-sort-btn${currentRankingSort === btn.key ? " is-active" : ""}`;
            el.textContent = btn.label;
            el.addEventListener("click", () => {
                currentRankingSort = btn.key;
                renderRankingControls();
                renderRanking(btn.key);
            });
            responseControls.appendChild(el);
        });
    }

    function openResponse(payload) {
        if (!responseEl || !assistant) return;
        if (debriefEl) {
            debriefEl.classList.remove("is-active");
        }
        responseEl.classList.add("is-active");
        assistant.classList.add("is-debriefing");
        if (responseTitle) responseTitle.textContent = payload.title || "Réponse";
        if (responseRange) responseRange.textContent = payload.period_label || "";
        currentRanking = payload.rankings || null;
        if (currentRanking && currentRanking.length) {
            renderRankingControls();
            renderRanking(currentRankingSort);
        } else {
            if (responseControls) responseControls.innerHTML = "";
            renderResponseCards(payload.sections || []);
        }
    }

    function handleSend() {
        if (!input) return;
        const normalized = normalizeText(input.value);
        if (normalized === "debriefing" || normalized === "debrifing") {
            openDebrief();
        } else if (normalized) {
            const queryText = input.value.trim();
            fetch(`/ai/query/?q=${encodeURIComponent(queryText)}`)
                .then(response => response.json())
                .then(data => {
                    if (data && data.success) {
                        openResponse(data);
                    } else {
                        openResponse({
                            title: "Assistant Salimamoud",
                            period_label: "",
                            sections: [{
                                title: "Information",
                                summary: [],
                                issues: [data.error || "Requête non reconnue pour Salimamoud."],
                                actions: ["Essayez: employé, ventes, stock, production, fidélité."],
                            }],
                        });
                    }
                })
                .catch(() => {
                    openResponse({
                        title: "Assistant Salimamoud",
                        period_label: "",
                        sections: [{
                            title: "Information",
                            summary: [],
                            issues: ["Impossible de traiter la requête pour le moment."],
                            actions: ["Réessayez dans un instant."],
                        }],
                    });
                });
        }
        input.value = "";
        closeHelp();
    }

    if (sendBtn) {
        sendBtn.addEventListener("click", handleSend);
    }

    if (micBtn) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            micBtn.classList.add("is-disabled");
            micBtn.setAttribute("disabled", "disabled");
            micBtn.setAttribute("title", "Micro indisponible sur cet appareil.");
        } else {
            recognition = new SpeechRecognition();
            recognition.lang = "fr-FR";
            recognition.interimResults = true;
            recognition.continuous = true;

            recognition.onstart = () => {
                micBaseInput = input ? input.value : "";
                toggleListening(true);
            };

            recognition.onend = () => {
                toggleListening(false);
            };

            recognition.onerror = (event) => {
                toggleListening(false);
                if (event && event.error === "not-allowed") {
                    alert("Micro bloqué. Autorisez le micro dans le navigateur.");
                }
            };

            recognition.onresult = (event) => {
                if (!input) return;
                let finalTranscript = "";
                let interimTranscript = "";
                for (let i = event.resultIndex; i < event.results.length; i += 1) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
                const combined = `${micBaseInput} ${finalTranscript}${interimTranscript}`.trim();
                input.value = combined;
                input.dispatchEvent(new Event("input"));
            };

            micBtn.addEventListener("click", () => {
                if (!recognition) return;
                if (isListening) {
                    recognition.stop();
                    return;
                }
                try {
                    recognition.start();
                } catch (error) {
                    // Ignore repeated start errors
                }
            });
        }
    }

    if (input) {
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                handleSend();
            }
            if (event.key === "Escape") {
                closeHelp();
            }
        });

        input.addEventListener("input", () => {
            const normalized = normalizeText(input.value);
            if (!normalized.startsWith("aide")) {
                closeHelp();
                return;
            }
            const query = normalized.replace(/^aide\\s*/, "");
            renderHelpList(query);
        });
    }

    document.addEventListener("click", (event) => {
        if (!helpBox || !helpBox.classList.contains("is-open")) return;
        const target = event.target;
        if (target.closest(".ai-input-field")) {
            return;
        }
        closeHelp();
    });

    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            if (currentIndex > 0) {
                currentIndex -= 1;
                renderStep();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            if (!data.periods.length) return;
            if (currentIndex === data.periods.length - 1) {
                closeDebrief();
                return;
            }
            currentIndex += 1;
            renderStep();
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener("click", closeDebrief);
    }
});

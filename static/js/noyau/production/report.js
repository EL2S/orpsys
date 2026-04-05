document.addEventListener("DOMContentLoaded", () => {
    if (typeof Chart === "undefined") {
        return;
    }

    function renderSection({ dataId, comparisonId, deltaId, colors }) {
        const dataEl = document.getElementById(dataId);
        const comparisonTarget = document.getElementById(comparisonId);
        const deltaTarget = document.getElementById(deltaId);

        if (!dataEl || !comparisonTarget || !deltaTarget) {
            return;
        }

        const rows = JSON.parse(dataEl.textContent || "[]");
        const filtered = rows.filter(row => (row.stock_out || 0) > 0 || (row.theoretical || 0) > 0 || (row.delta || 0) !== 0);

        if (filtered.length === 0) {
            comparisonTarget.replaceWith(document.createTextNode("Aucune donnée à afficher."));
            deltaTarget.replaceWith(document.createTextNode("Aucune donnée à afficher."));
            return;
        }

        const comparisonRows = [...filtered]
            .sort((a, b) => (b.stock_out || 0) - (a.stock_out || 0))
            .slice(0, 8);

        const comparisonLabels = comparisonRows.map(row => `${row.name || "-"} (${row.unit || "-"})`);
        const comparisonStock = comparisonRows.map(row => Number(row.stock_out || 0));
        const comparisonTheo = comparisonRows.map(row => Number(row.theoretical || 0));

        const deltaRows = [...filtered]
            .sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0))
            .slice(0, 8);

        const deltaLabels = deltaRows.map(row => `${row.name || "-"} (${row.unit || "-"})`);
        const deltaValues = deltaRows.map(row => Number(row.delta || 0));
        const deltaColors = deltaValues.map(value => value >= 0 ? "rgba(34, 197, 94, 0.6)" : "rgba(239, 68, 68, 0.6)");
        const deltaBorders = deltaValues.map(value => value >= 0 ? "rgba(34, 197, 94, 1)" : "rgba(239, 68, 68, 1)");

        new Chart(comparisonTarget, {
            type: "bar",
            data: {
                labels: comparisonLabels,
                datasets: [
                    {
                        label: "Sortie stock",
                        data: comparisonStock,
                        backgroundColor: colors.stockBg,
                        borderColor: colors.stockBorder,
                        borderWidth: 1,
                    },
                    {
                        label: "Conso théorique",
                        data: comparisonTheo,
                        backgroundColor: colors.theoBg,
                        borderColor: colors.theoBorder,
                        borderWidth: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom",
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                    },
                },
            },
        });

        new Chart(deltaTarget, {
            type: "bar",
            data: {
                labels: deltaLabels,
                datasets: [
                    {
                        label: "Écart",
                        data: deltaValues,
                        backgroundColor: deltaColors,
                        borderColor: deltaBorders,
                        borderWidth: 1,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false,
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                    },
                },
            },
        });
    }

    renderSection({
        dataId: "report-data-pos",
        comparisonId: "chart-comparison-pos",
        deltaId: "chart-delta-pos",
        colors: {
            stockBg: "rgba(245, 158, 11, 0.6)",
            stockBorder: "rgba(245, 158, 11, 1)",
            theoBg: "rgba(99, 102, 241, 0.5)",
            theoBorder: "rgba(99, 102, 241, 1)",
        },
    });

    renderSection({
        dataId: "report-data-bakery",
        comparisonId: "chart-comparison-bakery",
        deltaId: "chart-delta-bakery",
        colors: {
            stockBg: "rgba(16, 185, 129, 0.55)",
            stockBorder: "rgba(16, 185, 129, 1)",
            theoBg: "rgba(59, 130, 246, 0.5)",
            theoBorder: "rgba(59, 130, 246, 1)",
        },
    });
});

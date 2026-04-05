document.addEventListener("DOMContentLoaded", () => {
    const REPORT_BRAND = {
        companyName: "SALIMAMOUD",
        logoUrl: "/static/img/logo/salimamoud.png",
    };

    const REPORT_COLORS = {
        text: [28, 30, 35],
        muted: [90, 96, 110],
        border: [228, 232, 238],
        soft: [246, 248, 251],
        entry: [245, 158, 11],
        entrySoft: [255, 243, 223],
    };

    async function imageUrlToDataUrl(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Logo introuvable");
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function drawSectionTitle(doc, y, title) {
        const left = 48;
        const right = doc.internal.pageSize.getWidth() - 48;
        doc.setFillColor(...REPORT_COLORS.soft);
        doc.roundedRect(left, y, right - left, 22, 6, 6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...REPORT_COLORS.text);
        doc.text(title, left + 10, y + 15);
        return y + 32;
    }

    function ensureSpace(doc, y, needed) {
        const bottom = doc.internal.pageSize.getHeight() - 48;
        if (y + needed > bottom) {
            doc.addPage();
            return 48;
        }
        return y;
    }

    function renderSummaryCard(doc, report, startY) {
        const left = 48;
        const right = doc.internal.pageSize.getWidth() - 48;
        const cardHeight = 128;
        let y = ensureSpace(doc, startY, cardHeight + 8);

        doc.setFillColor(...REPORT_COLORS.entrySoft);
        doc.roundedRect(left, y, right - left, cardHeight, 10, 10, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...REPORT_COLORS.text);
        doc.text("Résumé production", left + 12, y + 18);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(...REPORT_COLORS.text);

        const line1Y = y + 38;
        const line2Y = y + 56;
        const line3Y = y + 74;
        doc.text(`Total produit : ${report.total}`, left + 12, line1Y);
        doc.text(`Produits : ${report.productsCount}`, left + 200, line1Y);
        doc.text(`Shift : ${report.shiftLabel}`, left + 360, line1Y);

        doc.text(`Matin : ${report.matinTotal}`, left + 12, line2Y);
        doc.text(`Soir : ${report.soirTotal}`, left + 200, line2Y);
        if (report.cashier) {
            doc.text(`Responsable : ${report.cashier}`, left + 12, line3Y);
        }

        return y + cardHeight + 16;
    }

    const chart = document.getElementById("shift-chart");
    if (chart) {
        const matin = Number(chart.dataset.matin || 0);
        const soir = Number(chart.dataset.soir || 0);
        const max = Math.max(matin, soir, 1);
        const matinBar = chart.querySelector("[data-role='matin-bar']");
        const soirBar = chart.querySelector("[data-role='soir-bar']");
        if (matinBar) matinBar.style.width = `${(matin / max) * 100}%`;
        if (soirBar) soirBar.style.width = `${(soir / max) * 100}%`;
    }

    const exportBtn = document.getElementById("btn-production-pdf");
    const dataEl = document.getElementById("pos-production-data");
    const metaEl = document.getElementById("pos-production-meta");
    const dateInput = document.querySelector("input[name='date']");
    const shiftSelect = document.querySelector("select[name='shift']");

    if (!exportBtn || !dataEl) return;

    exportBtn.addEventListener("click", async () => {
        if (!window.jspdf?.jsPDF) {
            alert("La librairie PDF n'est pas chargée.");
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: "pt", format: "a4" });

        let productions = [];
        try {
            productions = JSON.parse(dataEl.textContent || "[]");
        } catch (e) {
            productions = [];
        }
        let meta = {};
        if (metaEl) {
            try {
                meta = JSON.parse(metaEl.textContent || "{}");
            } catch (_) {
                meta = {};
            }
        }

        const dateLabel = dateInput ? dateInput.value : "";
        const shiftLabel = meta.shift_label || (shiftSelect ? shiftSelect.options[shiftSelect.selectedIndex]?.text || "" : "");
        const cashierLabel = meta.cashier || "";

        let logoDataUrl = null;
        try {
            logoDataUrl = await imageUrlToDataUrl(REPORT_BRAND.logoUrl);
        } catch (_) {
            logoDataUrl = null;
        }

        const left = 48;
        let y = 48;

        if (logoDataUrl) {
            doc.addImage(logoDataUrl, "PNG", left, y, 44, 44);
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(24);
        doc.setTextColor(...REPORT_COLORS.text);
        doc.text(REPORT_BRAND.companyName, left + (logoDataUrl ? 56 : 0), y + 24);

        doc.setFontSize(12);
        doc.setTextColor(...REPORT_COLORS.muted);
        doc.text("Rapport Production POS", left + (logoDataUrl ? 56 : 0), y + 42);
        y += 72;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(...REPORT_COLORS.text);
        doc.text(`Date : ${dateLabel || "-"}`, left, y);
        doc.text(`Shift : ${shiftLabel || "-"}`, left + 220, y);
        if (cashierLabel) {
            doc.text(`Responsable : ${cashierLabel}`, left + 360, y);
        }
        y += 16;

        const matin = Number(chart?.dataset.matin || 0);
        const soir = Number(chart?.dataset.soir || 0);
        const total = productions.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
        const productsCount = new Set(productions.map((row) => row.product)).size;
        y = renderSummaryCard(doc, {
            total,
            productsCount,
            shiftLabel: shiftLabel || "-",
            matinTotal: matin,
            soirTotal: soir,
            cashier: cashierLabel,
        }, y);

        const grouped = {};
        productions.forEach((row) => {
            const key = row.product || "";
            grouped[key] = (grouped[key] || 0) + Number(row.quantity || 0);
        });
        const top = Object.entries(grouped)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        if (top.length) {
            y = drawSectionTitle(doc, y, "Top produits");
            doc.autoTable({
                startY: y,
                margin: { left, right: doc.internal.pageSize.getWidth() - left },
                tableWidth: doc.internal.pageSize.getWidth() - left * 2,
                theme: "grid",
                head: [["Produit", "Quantité"]],
                body: top.map(([name, qty]) => [name, qty]),
                styles: { font: "helvetica", fontSize: 9, cellPadding: 6 },
            });
            y = doc.lastAutoTable.finalY + 18;
        }

        y = drawSectionTitle(doc, y, "Détail des productions");
        if (!productions.length) {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(10);
            doc.setTextColor(...REPORT_COLORS.muted);
            doc.text("Aucune production enregistrée.", left + 6, y + 12);
        } else {
            doc.autoTable({
                startY: y,
                margin: { left, right: doc.internal.pageSize.getWidth() - left },
                tableWidth: doc.internal.pageSize.getWidth() - left * 2,
                theme: "grid",
                head: [["Produit", "Quantité", "Shift", "Note", "Saisi par"]],
                body: productions.map((row) => [
                    row.product,
                    row.quantity,
                    row.shift,
                    row.note || "-",
                    row.recorded_by || "-",
                ]),
                styles: { font: "helvetica", fontSize: 9, cellPadding: 6 },
            });
        }

        const filename = `production-pos-${dateLabel || "date"}.pdf`;
        doc.save(filename);
    });
});

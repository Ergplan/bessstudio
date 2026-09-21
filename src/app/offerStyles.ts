/**
 * Offer document styling. Held as a module rather than a stylesheet so the rendered page and the
 * standalone HTML export are guaranteed to carry exactly the same rules.
 */
export const offerCss = String.raw`
/* Offer document. Four A4 pages that print to PDF from the browser, laid out to the issued
   Solarworld proposal: navy header band, green accent rule, navy table headers, zebra rows. */
.offer{--o-navy:#22415B;--o-navy-deep:#153956;--o-accent:#93BE49;--o-ink:#1D293B;--o-slate:#4A5A6E;
  --o-muted:#7A8B9C;--o-line:#D8E0E6;--o-zebra:#F4F7F9;--o-chip:#EDF1F4;
  --o-serif:Georgia,'Times New Roman',serif;--o-sans:'Inter','Segoe UI',system-ui,Arial,sans-serif}

.offer-page{width:210mm;min-height:297mm;background:#fff;color:var(--o-ink);font-family:var(--o-sans);
  font-size:7.4pt;line-height:1.38;position:relative;margin:0 auto 18px;padding:0 0 13mm;
  box-shadow:0 2px 14px rgba(29,41,59,.14);display:flex;flex-direction:column}
.offer-page:last-child{margin-bottom:0}

.offer-head{background:var(--o-navy);color:#fff;padding:4mm 10mm;display:flex;align-items:center;gap:5mm;
  border-bottom:1.8mm solid var(--o-accent);flex-shrink:0}
.offer-head img{height:11mm;width:11mm;object-fit:contain;background:#fff;border-radius:1.4mm;padding:1mm;flex-shrink:0}
.offer-head .who{flex:1;min-width:0}
.offer-head .who b{display:block;font-family:var(--o-serif);font-size:11.5pt;letter-spacing:.2pt;line-height:1.15}
.offer-head .who span{font-size:6.8pt;color:#C3D3DE}
.offer-head .what{text-align:right;flex-shrink:0}
.offer-head .what b{display:block;font-size:9.5pt}
.offer-head .what span{font-size:6.8pt;color:#C3D3DE}

.offer-body{padding:5mm 10mm 0;flex:1;min-height:0}
.offer-foot{position:absolute;left:10mm;right:10mm;bottom:5mm;border-top:.3mm solid var(--o-line);
  padding-top:1.6mm;font-size:6.2pt;color:var(--o-slate)}
.offer-foot .row-1,.offer-foot .row-2{display:flex;justify-content:space-between;gap:6mm}
.offer-foot .row-2{margin-top:.6mm}
.offer-foot .conf{color:var(--o-muted)}
.offer-foot b{font-weight:600;color:var(--o-slate)}

.offer h2.sec{font-family:var(--o-serif);font-size:10.5pt;color:var(--o-navy);margin:0 0 .8mm;
  padding-left:3mm;border-left:1mm solid var(--o-accent);line-height:1.25}
.offer h2.sec em{font-style:normal;color:var(--o-accent);margin-right:2mm}
.offer .sec-note{font-family:var(--o-serif);font-style:italic;color:var(--o-slate);font-size:6.9pt;
  margin:0 0 1.5mm;padding-bottom:1.1mm;border-bottom:.3mm solid var(--o-line)}
.offer h4.eyebrow{font-size:6.9pt;letter-spacing:.8pt;text-transform:uppercase;color:var(--o-navy);
  margin:0 0 1.2mm;padding-bottom:.7mm;border-bottom:.6mm solid var(--o-accent);font-weight:700}
.offer h5.block{font-size:6.8pt;letter-spacing:.7pt;text-transform:uppercase;color:var(--o-navy);margin:0 0 1mm;font-weight:700}
.offer p{margin:0 0 1.5mm}
.offer .two-col{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.offer .three-col{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}

table.offer-table{width:100%;border-collapse:collapse;font-size:6.5pt;line-height:1.24;margin-bottom:2mm}
table.offer-table thead th{background:var(--o-navy);color:#fff;text-align:left;padding:.9mm 1.5mm;font-weight:600;line-height:1.25}
table.offer-table td{padding:.5mm 1.4mm;border-bottom:.2mm solid var(--o-line);vertical-align:top}
table.offer-table tbody tr:nth-child(even){background:var(--o-zebra)}
table.offer-table td.num,table.offer-table th.num{text-align:right;font-variant-numeric:tabular-nums}
table.offer-table tr.total td{background:var(--o-navy);color:#fff;font-weight:700;border-bottom:none}
table.offer-table tr.subtotal td{background:#DDE5EB;font-weight:700;color:var(--o-navy)}
table.offer-table tr.total td.num,table.offer-table tr.subtotal td.num{font-variant-numeric:tabular-nums}

.spec-table td:first-child{width:42%;color:var(--o-slate)}
.spec-table td:last-child{font-weight:600;color:var(--o-ink)}

.chip-row{display:grid;grid-template-columns:repeat(6,1fr);gap:1.6mm;margin-bottom:2.2mm}
.chip{background:var(--o-chip);border-left:.8mm solid var(--o-accent);padding:1.2mm 1.6mm}
.chip span{display:block;font-size:5.9pt;color:var(--o-slate);line-height:1.3}
.chip b{font-size:8pt;color:var(--o-navy)}

.stat-row{display:grid;grid-template-columns:repeat(4,1fr);gap:2.5mm;margin:3mm 0 3.5mm}
.stat-tile{background:var(--o-navy);color:#fff;text-align:center;padding:2.6mm 2mm 2mm;border-bottom:1.2mm solid var(--o-accent)}
.stat-tile b{display:block;font-family:var(--o-serif);font-size:13.5pt;line-height:1.1}
.stat-tile span{font-size:6.4pt;color:#C3D3DE}

.hero-eyebrow{font-size:8pt;letter-spacing:1.4pt;text-transform:uppercase;color:var(--o-accent);font-weight:700;margin-bottom:1.5mm}
.hero-title{font-family:var(--o-serif);font-size:29pt;color:var(--o-navy);line-height:1.02;margin:0;letter-spacing:-.6pt}
.hero-sub{font-family:var(--o-serif);font-size:13.5pt;color:#3E6B8C;margin:1.2mm 0 .8mm;font-weight:400}
.hero-line{font-family:var(--o-serif);font-style:italic;color:var(--o-slate);font-size:7.6pt}

.cover-figure{margin:0 0 3mm;text-align:center}
.cover-figure img,.cover-figure svg{max-width:100%;max-height:58mm;object-fit:contain}
.cover-figure figcaption{font-family:var(--o-serif);font-style:italic;font-size:7pt;color:var(--o-muted);margin-top:1.5mm;text-align:left}

.why li{list-style:none;margin:0 0 1.8mm;padding-left:4mm;position:relative}
.why li::before{content:'';position:absolute;left:0;top:1.3mm;width:2mm;height:2mm;border-radius:50%;background:var(--o-accent)}
.why b{display:block;font-size:7.8pt;color:var(--o-navy)}
.why span{color:var(--o-slate);font-size:7pt;line-height:1.42}
.why ul{margin:0;padding:0}

.contents{background:var(--o-navy);color:#fff;padding:3.5mm 5mm;margin-top:3mm}
.contents h5{font-size:6.9pt;letter-spacing:1pt;text-transform:uppercase;margin:0 0 2.5mm;font-weight:700}
.contents .three-col b{display:block;color:var(--o-accent);font-size:6.6pt;letter-spacing:.6pt;text-transform:uppercase;margin-bottom:1.2mm}
.contents .three-col p{color:#C9D8E2;font-size:6.6pt;line-height:1.42;margin:0}
.contents .strip{margin-top:2.5mm;padding-top:1.8mm;border-top:.3mm solid rgba(255,255,255,.22);font-size:6.4pt;color:#A9BFCE}

.qual li{list-style:none;position:relative;padding-left:3.4mm;margin-bottom:.8mm;font-size:6.6pt;color:var(--o-slate);line-height:1.4}
.qual li::before{content:'';position:absolute;left:0;top:.9mm;width:1.3mm;height:1.3mm;border-radius:50%;background:var(--o-accent)}
.qual ul{margin:0;padding:0}

.basis-card{background:var(--o-chip);border-left:.9mm solid var(--o-accent);padding:1.8mm 2.4mm}
.basis-card h5{margin-bottom:2mm}
.basis-card .kv{display:grid;grid-template-columns:20mm 1fr;gap:.8mm 2.2mm;font-size:6.3pt}
.basis-card .kv span{color:var(--o-slate)}
.basis-card .kv b{color:var(--o-ink);font-weight:600}

.addons{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5mm;margin-top:1.2mm}
.addons div{background:var(--o-chip);border-left:.8mm solid var(--o-accent);padding:1.2mm 1.8mm}
.addons b{display:block;font-size:7pt;color:var(--o-navy)}
.addons span{font-size:6.3pt;color:var(--o-slate);line-height:1.35}
.addons img{height:3.4mm;vertical-align:-.4mm;margin-right:1mm}

.accept{background:var(--o-chip);border-left:.9mm solid var(--o-accent);padding:2mm 2.6mm;margin-top:1.8mm}
.accept h5{margin-bottom:1.5mm}
.accept .sign{display:grid;grid-template-columns:1fr 1fr;gap:10mm;margin-top:4.5mm}
.accept .sign div{border-top:.3mm solid var(--o-slate);padding-top:1mm;font-size:6.2pt;color:var(--o-slate)}

.terms-grid{display:grid;grid-template-columns:1fr 1fr;gap:1mm 5mm}
.terms-grid section{break-inside:avoid}
.terms-grid p{font-size:6.1pt;color:var(--o-slate);line-height:1.34;margin:0}

.offer-chart{width:100%;height:auto;display:block}
.offer-chart text{font-family:var(--o-sans);fill:var(--o-slate)}
.offer-legend{display:flex;gap:5mm;justify-content:center;font-size:6.2pt;color:var(--o-slate);margin-top:1mm}
.offer-legend span{display:inline-flex;align-items:center;gap:1.5mm}
.offer-legend i{width:3mm;height:3mm;border-radius:.6mm;display:inline-block}

/* Screen preview: the pages float on the app surface; print drops the chrome. */
.offer-preview{background:#E9EEF1;padding:18px;border-radius:14px;overflow:auto}
@media print{
  @page{size:A4;margin:0}
  html,body{background:#fff!important}
  body *{visibility:hidden}
  .offer,.offer *{visibility:visible}
  .offer{position:absolute;left:0;top:0;width:210mm}
  .offer-preview{background:none;padding:0;border-radius:0;overflow:visible}
  .offer-page{box-shadow:none;margin:0;height:297mm;overflow:hidden;page-break-after:always;break-after:page}
  .offer-page:last-child{page-break-after:auto;break-after:auto}
}

/* Page four carries the most prose, so its body copy runs a shade tighter. */
.offer .prose{font-size:6.1pt;color:var(--o-slate);line-height:1.32;margin:0 0 1.2mm}
.offer .close-note{font-size:6pt;color:var(--o-muted);margin-top:1.5mm}

.offer-overflow{position:absolute;right:6mm;bottom:20mm;background:#C4614C;color:#fff;font-size:6.6pt;
  font-weight:600;padding:1.2mm 2mm;border-radius:1mm;max-width:80mm;line-height:1.35}
@media print{.offer-overflow{display:none}}
`;

/** Uploaded templates are capped at 5 MB. */
export const MAX_PDF_TEMPLATE_BYTES = 5 * 1024 * 1024;

/**
 * Safe body area, in PDF points measured from each page edge. For a US Letter page
 * (612 x 792 pt) this gives x 30 -> 582 and y 120 -> 642: content starts 120 pt from the
 * top (below the logo) and stops 150 pt from the bottom (above the footer).
 */
export const LETTERHEAD_MARGINS = { top: 120, bottom: 150, left: 30, right: 30 } as const;

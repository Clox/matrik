import sharp from "sharp";
import { resolvePrintProfile } from "../shared/print-profile.js";

// Change only the SVG viewport dimensions. Sharp then rasterizes the original
// vector scene directly at the requested output pixels, without a resize pass.
export async function renderSvgPng(svg, profileInput) {
  const profile = resolvePrintProfile(profileInput);
  const sized = svg.replace(
    /(<svg\b[^>]*\bwidth=")[^"]+("\s+height=")[^"]+(")/,
    `$1${profile.widthPx}px$2${profile.heightPx}px$3`,
  );
  if (sized === svg) throw new Error("SVG saknar förväntade kortmått.");
  return sharp(Buffer.from(sized), { density: 72 })
    .png()
    .withMetadata({ density: profile.dpi })
    .toBuffer();
}

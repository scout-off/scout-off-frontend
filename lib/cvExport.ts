import type { Player, Milestone } from '@/types';
import type { PDFFont } from 'pdf-lib';
import { getProgressLabel } from '@/lib/progress';
import { fetchAcademyForWallet } from '@/lib/api';

const PAGE_WIDTH = 595.28; // A4, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Builds a `playername-scoutoff-cv.pdf`-style filename, safe for all filesystems. */
export function buildCvFilename(playerName: string): string {
  const slug = playerName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'player'}-scoutoff-cv.pdf`;
}

/**
 * Resolves each unique validator wallet on the milestone list to a
 * human-readable name via the academy lookup (same source ValidatorChip
 * uses), falling back to a truncated address when a validator isn't
 * registered under an academy.
 */
async function resolveValidatorNames(
  milestones: Milestone[],
): Promise<Record<string, string>> {
  const uniqueAddresses = Array.from(
    new Set(milestones.map((m) => m.validator)),
  );
  const entries = await Promise.all(
    uniqueAddresses.map(async (address) => {
      const academy = await fetchAcademyForWallet(address);
      return [address, academy?.name ?? truncateAddress(address)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Generates a one-or-more-page CV PDF for a player: vitals, progress level,
 * stats, and a chronological milestone list with resolved validator names.
 * Runs entirely client-side via a dynamically-imported pdf-lib so the
 * library stays out of the main bundle.
 */
export async function generatePlayerCvPdf(
  player: Player,
  milestones: Milestone[],
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const validatorNames = await resolveValidatorNames(milestones);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const INK = rgb(0.07, 0.09, 0.15);
  const MUTED = rgb(0.42, 0.45, 0.5);
  const GREEN = rgb(0, 0.78, 0.33);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(height: number) {
    if (y - height < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  function drawText(
    text: string,
    opts: {
      size?: number;
      font?: PDFFont;
      color?: ReturnType<typeof rgb>;
      gapAfter?: number;
    } = {},
  ) {
    const size = opts.size ?? 11;
    const gapAfter = opts.gapAfter ?? 4;
    ensureSpace(size + gapAfter);
    page.drawText(text, {
      x: MARGIN,
      y,
      size,
      font: opts.font ?? font,
      color: opts.color ?? INK,
    });
    y -= size + gapAfter;
  }

  drawText('ScoutOff — Player CV', {
    size: 11,
    font: boldFont,
    color: GREEN,
    gapAfter: 18,
  });

  drawText(player.vitals.name, { size: 24, font: boldFont, gapAfter: 4 });
  drawText(
    `${player.vitals.position} · ${player.vitals.region} · Age ${player.vitals.age} · ${player.vitals.nationality}`,
    { size: 11, color: MUTED, gapAfter: 20 },
  );

  drawText('Progress Level', { size: 13, font: boldFont, gapAfter: 6 });
  drawText(
    `${getProgressLabel(player.progressLevel)} (Level ${player.progressLevel} of 3)`,
    { size: 11, gapAfter: 20 },
  );

  if (player.stats) {
    drawText('Stats', { size: 13, font: boldFont, gapAfter: 6 });
    const statLines = [
      `Goals: ${player.stats.goals}`,
      `Assists: ${player.stats.assists}`,
      `Appearances: ${player.stats.appearances}`,
    ];
    if (player.vitals.position === 'GK') {
      statLines.push(`Clean Sheets: ${player.stats.clean_sheets ?? 0}`);
    }
    drawText(statLines.join('   ·   '), { size: 11, gapAfter: 20 });
  }

  drawText('Milestone History', { size: 13, font: boldFont, gapAfter: 8 });

  if (milestones.length === 0) {
    drawText('No milestones recorded yet.', { size: 11, color: MUTED });
  } else {
    const chronological = [...milestones].sort(
      (a, b) => a.timestamp - b.timestamp,
    );
    for (const milestone of chronological) {
      ensureSpace(36);
      drawText(milestone.description, { size: 11, gapAfter: 2 });
      const date = new Date(milestone.timestamp * 1000).toLocaleDateString();
      const validatorName =
        validatorNames[milestone.validator] ??
        truncateAddress(milestone.validator);
      drawText(`Validated by ${validatorName} · ${date}`, {
        size: 9,
        color: MUTED,
        gapAfter: 14,
      });
    }
  }

  ensureSpace(20);
  drawText(`Generated ${new Date().toLocaleDateString()} · scoutoff.app`, {
    size: 8,
    color: MUTED,
  });

  return doc.save();
}

/** Triggers a browser download of the generated PDF bytes. */
export function downloadPlayerCvPdf(
  bytes: Uint8Array,
  playerName: string,
): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = buildCvFilename(playerName);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { TastingJournalEntry } from '../types';
import { saveOrShareFile } from './fileExportHelper';
import { Capacitor } from '@capacitor/core';

export interface PdfExportOptions {
  scale?: number;
  marginMm?: number;
  title?: string;
}

/**
 * Exports any DOM element to a high-resolution, downloadable PDF document.
 * Creates an isolated off-screen rendering clone to completely eliminate modal clipping,
 * CSS transform distortions (e.g. zoom-in animations), and mobile narrow width squishing.
 */
export async function exportElementToPdf(
  element: HTMLElement,
  filename: string,
  options?: PdfExportOptions
): Promise<void> {
  const margin = options?.marginMm ?? 8;
  // Optimal scale: 1.5 generates crisp ~300 DPI print quality without thread-blocking lag or memory crashes
  const scale = options?.scale ?? 1.5;

  // 1. Create a dedicated off-screen rendering container directly on document.body
  const renderContainer = document.createElement('div');
  renderContainer.style.position = 'fixed';
  renderContainer.style.top = '-99999px';
  renderContainer.style.left = '-99999px';
  renderContainer.style.width = '794px'; // Exactly A4 width in 96 DPI CSS pixels (210mm)
  renderContainer.style.backgroundColor = '#ffffff';
  renderContainer.style.color = '#1c1917';
  renderContainer.style.margin = '0';
  renderContainer.style.padding = '16px';
  renderContainer.style.boxSizing = 'border-box';
  renderContainer.style.overflow = 'visible';
  renderContainer.style.transform = 'none';
  renderContainer.style.zIndex = '-9999';

  // Deep clone target element to decouple from modal styles and scrollbars
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.width = '100%';
  clone.style.maxWidth = 'none';
  clone.style.height = 'auto';
  clone.style.maxHeight = 'none';
  clone.style.overflow = 'visible';
  clone.style.transform = 'none';
  clone.style.animation = 'none';
  clone.style.transition = 'none';
  clone.style.boxShadow = 'none';
  clone.style.margin = '0';

  renderContainer.appendChild(clone);
  document.body.appendChild(renderContainer);

  try {
    const canvas = await html2canvas(renderContainer, {
      scale,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: 800,
      onclone: (clonedDoc) => {
        // Double-guard: automatically convert any lingering oklab / oklch color values to standard rgb/hex
        try {
          const testCanvas = clonedDoc.createElement('canvas');
          const ctx = testCanvas.getContext('2d');
          if (ctx) {
            const allNodes = clonedDoc.querySelectorAll<HTMLElement>('*');
            const colorProps = ['color', 'backgroundColor', 'borderColor', 'outlineColor', 'fill', 'stroke'] as const;
            for (let i = 0; i < allNodes.length; i++) {
              const node = allNodes[i];
              for (const prop of colorProps) {
                const val = node.style[prop];
                if (val && (val.includes('oklab') || val.includes('oklch'))) {
                  ctx.fillStyle = '#000000';
                  ctx.fillStyle = val;
                  node.style[prop] = ctx.fillStyle;
                }
              }
            }
          }
        } catch {
          // ignore
        }
      }
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;

    const imgWidth = contentWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight <= contentHeight) {
      // Single page fit
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
    } else {
      // Multi-page slicing
      const pageCanvasHeight = (canvas.width * contentHeight) / contentWidth;
      let renderedHeight = 0;
      let pageNum = 0;

      while (renderedHeight < canvas.height) {
        if (pageNum > 0) {
          pdf.addPage();
        }

        const sourceY = renderedHeight;
        const sourceHeight = Math.min(canvas.height - renderedHeight, pageCanvasHeight);

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sourceHeight;
        const ctx = pageCanvas.getContext('2d');

        if (ctx) {
          ctx.drawImage(
            canvas,
            0,
            sourceY,
            canvas.width,
            sourceHeight,
            0,
            0,
            canvas.width,
            sourceHeight
          );

          const sliceHeightMm = (sourceHeight * contentWidth) / canvas.width;
          const sliceImgData = pageCanvas.toDataURL('image/jpeg', 0.92);
          pdf.addImage(sliceImgData, 'JPEG', margin, margin, contentWidth, sliceHeightMm);
        }

        renderedHeight += sourceHeight;
        pageNum++;
      }
    }

    const cleanFilename = `${filename.replace(/\.pdf$/i, '')}.pdf`;
    const pdfBlob = pdf.output('blob');
    const base64Data = pdf.output('datauristring').split(',')[1];

    await saveOrShareFile({
      filename: cleanFilename,
      blob: pdfBlob,
      base64Data,
      mimeType: 'application/pdf',
      title: options?.title || cleanFilename
    });
  } catch (error) {
    console.warn('Direct PDF export failed:', error);
    if (typeof window !== 'undefined' && typeof window.print === 'function' && !Capacitor.isNativePlatform()) {
      window.print();
    }
    throw error;
  } finally {
    if (document.body.contains(renderContainer)) {
      document.body.removeChild(renderContainer);
    }
  }
}

/**
 * Exports all tasting journal entries into a comprehensive, beautifully styled PDF document.
 */
export async function exportJournalEntriesToPdf(entries: TastingJournalEntry[]): Promise<void> {
  if (entries.length === 0) return;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.width = '800px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#1c1917';
  container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  container.style.padding = '24px';
  container.style.boxSizing = 'border-box';

  const todayStr = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const avgRating = (entries.reduce((acc, e) => acc + e.rating, 0) / entries.length).toFixed(1);

  let html = `
    <div style="border-bottom: 2px solid #8c3809; padding-bottom: 12px; margin-bottom: 20px;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #8c3809; font-weight: bold;">
        Gongfu Cha Extraction Laboratory • Дневник дегустаций
      </div>
      <h1 style="font-size: 22px; font-weight: bold; margin: 4px 0; color: #1c1917;">
        Дегустационный журнал чаепитий
      </h1>
      <div style="font-size: 12px; color: #78716c; display: flex; justify-content: space-between; margin-top: 4px;">
        <span>Сформировано: ${todayStr}</span>
        <span>Всего записей: <strong>${entries.length}</strong> • Средняя оценка: <strong>${avgRating} ★</strong></span>
      </div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 16px;">
  `;

  for (const entry of entries) {
    const entryDate = new Date(entry.dateIso).toLocaleDateString('ru-RU');
    const stars = '★'.repeat(entry.rating) + '☆'.repeat(5 - entry.rating);

    // Compute steeping curve if not explicitly recorded
    const steeps = entry.steepScheduleSec && entry.steepScheduleSec.length > 0
      ? entry.steepScheduleSec
      : Array.from({ length: entry.steepsCount || 7 }, (_, i) => {
          if (i === 0) return 8;
          if (i === 1) return 6;
          if (i === 2) return 8;
          return 8 + Math.round(Math.pow(i - 2, 1.35) * 5);
        });

    const steepsBadges = steeps
      .map(
        (sec, idx) => `
        <span style="display: inline-block; background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 4px; padding: 2px 6px; font-size: 11px; font-family: monospace; margin: 2px;">
          #${idx + 1}: <strong style="color: #78350f;">${sec}с</strong>
        </span>
      `
      )
      .join('');

    const blendHtml = entry.blendComponents && entry.blendComponents.length > 0
      ? `<div style="font-size: 11px; color: #581c87; margin-top: 4px;"><strong>Состав:</strong> ${entry.blendComponents.join(', ')}</div>`
      : '';

    html += `
      <div style="border: 1px solid #d6d3d1; border-radius: 8px; padding: 12px 14px; background: #ffffff; break-inside: avoid; page-break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #f5f5f4; padding-bottom: 8px;">
          <div>
            <span style="font-size: 10px; font-weight: bold; color: #8c3809; text-transform: uppercase;">
              ${entry.teaTypeNameRu} ${entry.isBlend ? '• Авторский купаж' : ''}
            </span>
            <div style="font-size: 15px; font-weight: bold; color: #1c1917; margin-top: 2px;">
              ${entry.teaNameRu} ${entry.teaNameZh ? `<span style="font-weight: normal; color: #78716c;">(${entry.teaNameZh})</span>` : ''}
            </div>
            ${blendHtml}
          </div>
          <div style="text-align: right; font-size: 12px;">
            <div style="color: #b45309; font-weight: bold; font-size: 13px;">${stars}</div>
            <div style="color: #a8a29e; font-size: 10px; font-family: monospace; margin-top: 2px;">${entryDate}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; background: #fafaf9; padding: 6px 10px; border-radius: 6px; font-size: 11px;">
          <div><span style="color: #78716c; font-size: 10px;">Температура:</span> <strong>${entry.waterTempC}°C</strong></div>
          <div><span style="color: #78716c; font-size: 10px;">Пропорция:</span> <strong>${entry.teaMassG}г / ${entry.waterVolumeMl}мл</strong></div>
          <div><span style="color: #78716c; font-size: 10px;">Проливов:</span> <strong>${entry.steepsCount}</strong></div>
          <div><span style="color: #78716c; font-size: 10px;">Посуда:</span> <strong>${entry.vesselUsed || 'Гайвань'}</strong></div>
        </div>

        <div style="margin-top: 8px;">
          <div style="font-size: 10px; font-weight: bold; color: #57534e; text-transform: uppercase; margin-bottom: 2px;">
            Хронометраж проливов:
          </div>
          <div>${steepsBadges}</div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; font-size: 11px; text-align: center;">
          <div style="background: #f5f5f4; padding: 4px; border-radius: 4px;">Сладость: <strong style="color: #78350f;">${entry.sweetnessScore}/10</strong></div>
          <div style="background: #f5f5f4; padding: 4px; border-radius: 4px;">Плотность: <strong>${entry.bodyScore}/10</strong></div>
          <div style="background: #f5f5f4; padding: 4px; border-radius: 4px;">Хуэйгань: <strong style="color: #065f46;">${entry.huiGanScore}/10</strong></div>
          <div style="background: #f5f5f4; padding: 4px; border-radius: 4px;">Терпкость: <strong>${entry.astringencyScore}/10</strong></div>
        </div>

        ${
          entry.userNotes
            ? `<div style="margin-top: 8px; padding: 6px 10px; background: #fffbeb; border-radius: 6px; font-size: 11px; color: #78350f; font-style: italic;">"${entry.userNotes}"</div>`
            : ''
        }

        <div style="margin-top: 6px; display: flex; justify-content: space-between; font-size: 10px; color: #78716c;">
          <span>Эффект: <strong>${entry.effectNote}</strong></span>
          ${entry.tags && entry.tags.length > 0 ? `<span>${entry.tags.map((t) => `#${t}`).join(' ')}</span>` : ''}
        </div>
      </div>
    `;
  }

  html += `
    </div>
    <div style="margin-top: 24px; text-align: center; font-size: 10px; color: #a8a29e; border-top: 1px solid #e7e5e4; padding-top: 12px;">
      Gongfu Cha Lab • Расчет кинетики экстракции чая • CAAS / ISO 9768
    </div>
  `;

  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const filename = `gongfu_cha_journal_${new Date().toISOString().split('T')[0]}`;
    await exportElementToPdf(container, filename, { title: 'Журнал дегустаций Gongfu Cha' });
  } finally {
    document.body.removeChild(container);
  }
}

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROPOSALS_DIR = path.join(__dirname, '../../public/proposals');
const LOGO_PATH = path.join(__dirname, '../../public/logo-saleswo.png');

if (!fs.existsSync(PROPOSALS_DIR)) {
  fs.mkdirSync(PROPOSALS_DIR, { recursive: true });
}

function parseJsonField(field) {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  if (typeof field === 'string') {
    try {
      const parsed = JSON.parse(field);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') {
    return { r: 0, g: 102, b: 204 };
  }
  
  let cleanHex = hex.replace('#', '');
  
  // Support 3-digit hex
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 102, b: 204 };
}

function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function lightenColor(hex, percent) {
  const rgb = hexToRgb(hex);
  const factor = percent / 100;
  return {
    r: Math.min(255, Math.round(rgb.r + (255 - rgb.r) * factor)),
    g: Math.min(255, Math.round(rgb.g + (255 - rgb.g) * factor)),
    b: Math.min(255, Math.round(rgb.b + (255 - rgb.b) * factor))
  };
}

export async function generateProposalPDF(template, lead, agent) {
  return new Promise((resolve, reject) => {
    try {
      const fileName = `proposta_${lead.id}_${Date.now()}.pdf`;
      const filePath = path.join(PROPOSALS_DIR, fileName);
      
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const stream = fs.createWriteStream(filePath);
      
      doc.pipe(stream);
      
      const primaryColor = template.color_primary || template.colorPrimary || '#0066cc';
      const productName = template.product_name || template.productName || template.name;
      const price = parseFloat(template.price) || 0;
      const features = parseJsonField(template.features);
      const terms = parseJsonField(template.terms);
      const validityDays = template.validity_days || template.validityDays || 7;
      const paymentMethods = template.payment_methods || template.paymentMethods || '';
      const paymentDueDay = template.payment_due_day || template.paymentDueDay || 10;
      
      const leadName = lead.name || lead.full_name || lead.contact_name || 'Cliente';
      const leadPhone = lead.phone || lead.cell_phone || lead.whatsapp || '';
      const leadEmail = lead.email || '';
      const leadCpf = lead.cpf || '';
      const agentName = agent?.name || agent?.full_name || 'Consultor';
      const agentPhone = agent?.phone || '';
      const agentEmail = agent?.email || '';
      
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + validityDays);
      
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 40;
      const contentWidth = pageWidth - (margin * 2);
      
      // ==================== HEADER ====================
      const headerHeight = 100;
      doc.rect(0, 0, pageWidth, headerHeight).fill(primaryColor);
      
      // Gradient overlay effect
      const lightColor = lightenColor(primaryColor, 30);
      doc.rect(0, 0, pageWidth * 0.4, headerHeight)
         .fill(`rgb(${lightColor.r}, ${lightColor.g}, ${lightColor.b})`);
      
      // Logo
      if (fs.existsSync(LOGO_PATH)) {
        try {
          doc.image(LOGO_PATH, margin, 20, { height: 60 });
        } catch (e) {
          console.log('Could not load logo:', e.message);
        }
      }
      
      // Header title
      doc.fillColor('white')
         .fontSize(24)
         .font('Helvetica-Bold')
         .text('PROPOSTA COMERCIAL', pageWidth / 2 - 100, 35, { width: 250, align: 'center' });
      
      // Proposal number
      const proposalNumber = `#${Date.now().toString().slice(-6)}`;
      doc.fontSize(10)
         .font('Helvetica')
         .text(`Proposta ${proposalNumber}`, pageWidth - margin - 120, 25, { width: 120, align: 'right' });
      
      doc.text(`${new Date().toLocaleDateString('pt-BR')}`, pageWidth - margin - 120, 40, { width: 120, align: 'right' });
      
      // ==================== PRODUCT HIGHLIGHT ====================
      const productBoxY = headerHeight + 20;
      const productBoxHeight = 70;
      
      doc.roundedRect(margin, productBoxY, contentWidth, productBoxHeight, 8)
         .fillAndStroke('#f8fafc', '#e2e8f0');
      
      doc.fillColor(primaryColor)
         .fontSize(11)
         .font('Helvetica-Bold')
         .text('PRODUTO / SERVICO', margin + 20, productBoxY + 15);
      
      doc.fillColor('#1e293b')
         .fontSize(18)
         .font('Helvetica-Bold')
         .text(productName, margin + 20, productBoxY + 35, { width: contentWidth - 40 });
      
      // ==================== CLIENT & CONSULTANT INFO ====================
      const infoY = productBoxY + productBoxHeight + 20;
      const infoBoxWidth = (contentWidth - 20) / 2;
      const infoBoxHeight = 110;
      
      // Client box
      doc.roundedRect(margin, infoY, infoBoxWidth, infoBoxHeight, 8)
         .fillAndStroke('#ffffff', '#e2e8f0');
      
      doc.roundedRect(margin, infoY, infoBoxWidth, 28, 8)
         .fill(primaryColor);
      doc.rect(margin, infoY + 20, infoBoxWidth, 8).fill(primaryColor);
      
      doc.fillColor('white')
         .fontSize(11)
         .font('Helvetica-Bold')
         .text('DADOS DO CLIENTE', margin + 15, infoY + 8);
      
      let clientY = infoY + 40;
      doc.fillColor('#475569').fontSize(10).font('Helvetica');
      
      doc.font('Helvetica-Bold').text('Nome:', margin + 15, clientY);
      doc.font('Helvetica').text(truncateText(leadName, 30), margin + 60, clientY);
      clientY += 18;
      
      if (leadPhone) {
        doc.font('Helvetica-Bold').text('Telefone:', margin + 15, clientY);
        doc.font('Helvetica').text(truncateText(leadPhone, 20), margin + 70, clientY);
        clientY += 18;
      }
      
      if (leadEmail) {
        doc.font('Helvetica-Bold').text('E-mail:', margin + 15, clientY);
        doc.font('Helvetica').text(truncateText(leadEmail, 28), margin + 60, clientY);
        clientY += 18;
      }
      
      if (leadCpf) {
        doc.font('Helvetica-Bold').text('CPF:', margin + 15, clientY);
        doc.font('Helvetica').text(truncateText(leadCpf, 18), margin + 50, clientY);
      }
      
      // Consultant box
      const consultantX = margin + infoBoxWidth + 20;
      doc.roundedRect(consultantX, infoY, infoBoxWidth, infoBoxHeight, 8)
         .fillAndStroke('#ffffff', '#e2e8f0');
      
      doc.roundedRect(consultantX, infoY, infoBoxWidth, 28, 8)
         .fill('#64748b');
      doc.rect(consultantX, infoY + 20, infoBoxWidth, 8).fill('#64748b');
      
      doc.fillColor('white')
         .fontSize(11)
         .font('Helvetica-Bold')
         .text('CONSULTOR RESPONSAVEL', consultantX + 15, infoY + 8);
      
      let consultantY = infoY + 40;
      doc.fillColor('#475569').fontSize(10).font('Helvetica');
      
      doc.font('Helvetica-Bold').text('Nome:', consultantX + 15, consultantY);
      doc.font('Helvetica').text(truncateText(agentName, 30), consultantX + 60, consultantY);
      consultantY += 18;
      
      if (agentPhone) {
        doc.font('Helvetica-Bold').text('Telefone:', consultantX + 15, consultantY);
        doc.font('Helvetica').text(truncateText(agentPhone, 20), consultantX + 70, consultantY);
        consultantY += 18;
      }
      
      if (agentEmail) {
        doc.font('Helvetica-Bold').text('E-mail:', consultantX + 15, consultantY);
        doc.font('Helvetica').text(truncateText(agentEmail, 28), consultantX + 60, consultantY);
      }
      
      // ==================== PRICE BOX ====================
      const priceY = infoY + infoBoxHeight + 20;
      const priceBoxHeight = 80;
      
      doc.roundedRect(margin, priceY, contentWidth, priceBoxHeight, 8)
         .fill(primaryColor);
      
      // Price highlight
      doc.fillColor('white')
         .fontSize(12)
         .font('Helvetica')
         .text('INVESTIMENTO MENSAL', margin + 30, priceY + 15);
      
      doc.fontSize(36)
         .font('Helvetica-Bold')
         .text(`R$ ${price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + 30, priceY + 35);
      
      // Payment info on right
      doc.fontSize(10)
         .font('Helvetica')
         .fillColor('rgba(255,255,255,0.9)');
      
      if (paymentMethods) {
        doc.text(`Pagamento: ${paymentMethods}`, pageWidth - margin - 180, priceY + 25, { width: 150, align: 'right' });
      }
      doc.text(`Vencimento: dia ${paymentDueDay}`, pageWidth - margin - 180, priceY + 45, { width: 150, align: 'right' });
      
      // ==================== FEATURES ====================
      let currentY = priceY + priceBoxHeight + 25;
      const maxFeatures = 8; // Limit to prevent overflow
      const displayFeatures = features.slice(0, maxFeatures);
      
      if (displayFeatures.length > 0) {
        doc.fillColor(primaryColor)
           .fontSize(13)
           .font('Helvetica-Bold')
           .text('BENEFICIOS INCLUSOS', margin, currentY);
        
        currentY += 25;
        
        const featureColWidth = (contentWidth - 20) / 2;
        let featureY = currentY;
        let colIndex = 0;
        
        displayFeatures.forEach((feature, idx) => {
          const xPos = margin + (colIndex * (featureColWidth + 20));
          
          // Professional checkmark icon with gradient effect
          const cx = xPos + 8;
          const cy = featureY + 6;
          const r = 8;
          
          // Outer circle with shadow effect
          doc.circle(cx + 0.5, cy + 0.5, r).fill('#059669');
          doc.circle(cx, cy, r).fill('#10b981');
          
          // Inner checkmark path (vector drawing)
          doc.save()
             .translate(cx - 5, cy - 4)
             .path('M2.5 5.5 L4.5 7.5 L8.5 2.5')
             .lineWidth(2)
             .strokeColor('white')
             .stroke()
             .restore();
          
          doc.fillColor('#334155')
             .fontSize(10)
             .font('Helvetica')
             .text(truncateText(feature, 45), xPos + 22, featureY, { width: featureColWidth - 30 });
          
          if (colIndex === 0) {
            colIndex = 1;
          } else {
            colIndex = 0;
            featureY += 25;
          }
        });
        
        currentY = featureY + (colIndex === 1 ? 25 : 0) + 20;
      }
      
      // ==================== DESCRIPTION ====================
      if (template.description) {
        doc.fillColor(primaryColor)
           .fontSize(13)
           .font('Helvetica-Bold')
           .text('DESCRICAO', margin, currentY);
        
        currentY += 20;
        
        doc.fillColor('#475569')
           .fontSize(10)
           .font('Helvetica')
           .text(template.description, margin, currentY, { width: contentWidth });
        
        currentY += doc.heightOfString(template.description, { width: contentWidth }) + 20;
      }
      
      // ==================== TERMS ====================
      const maxTerms = 5; // Limit to prevent overflow
      const displayTerms = terms.slice(0, maxTerms);
      if (displayTerms.length > 0 && currentY < pageHeight - 150) {
        doc.fillColor('#64748b')
           .fontSize(11)
           .font('Helvetica-Bold')
           .text('TERMOS E CONDICOES', margin, currentY);
        
        currentY += 18;
        
        doc.fontSize(8).font('Helvetica').fillColor('#94a3b8');
        
        displayTerms.forEach((term, idx) => {
          if (currentY < pageHeight - 100) {
            doc.text(`${idx + 1}. ${truncateText(term, 100)}`, margin, currentY, { width: contentWidth });
            currentY += 14;
          }
        });
      }
      
      // ==================== VALIDITY BADGE ====================
      const validityY = Math.min(currentY + 15, pageHeight - 130);
      
      doc.roundedRect(margin, validityY, 200, 30, 5)
         .fillAndStroke('#fef3c7', '#f59e0b');
      
      doc.fillColor('#92400e')
         .fontSize(10)
         .font('Helvetica-Bold')
         .text(`Valida ate: ${validUntil.toLocaleDateString('pt-BR')}`, margin + 15, validityY + 10);
      
      // ==================== FOOTER ====================
      const footerY = pageHeight - 50;
      
      doc.rect(0, footerY - 10, pageWidth, 60).fill('#f1f5f9');
      
      doc.fillColor('#64748b')
         .fontSize(8)
         .font('Helvetica')
         .text('Bom Flow CRM - Sistema de Gestao de Relacionamento', margin, footerY, { align: 'center', width: contentWidth });
      
      doc.text(`Documento gerado em ${new Date().toLocaleDateString('pt-BR')} as ${new Date().toLocaleTimeString('pt-BR')}`, margin, footerY + 12, { align: 'center', width: contentWidth });
      
      doc.text('Este documento e uma proposta comercial e nao representa contrato.', margin, footerY + 24, { align: 'center', width: contentWidth });
      
      doc.end();
      
      stream.on('finish', () => {
        resolve({
          filePath,
          fileName,
          publicUrl: `/proposals/${fileName}`
        });
      });
      
      stream.on('error', reject);
      
    } catch (error) {
      reject(error);
    }
  });
}

export function getProposalPath(fileName) {
  return path.join(PROPOSALS_DIR, fileName);
}

export function deleteProposal(fileName) {
  const filePath = path.join(PROPOSALS_DIR, fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

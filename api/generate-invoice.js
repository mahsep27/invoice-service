// api/generate-invoice.js
// Using PDFKit - No Chromium needed!
import PDFDocument from 'pdfkit';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { clientName, amount, invoiceDate, services, companyName } = req.body;

    if (!clientName || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }

    const invoiceNumber = `INV-${Date.now()}`;
    const today = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Create PDF document
    const doc = new PDFDocument({ 
      size: 'A4',
      margin: 50
    });

    // Collect PDF data in buffer
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    
    const pdfPromise = new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    // HEADER
    doc.fontSize(36)
       .fillColor('#2563eb')
       .text('INVOICE', 50, 50, { align: 'center' });

    // Company Info
    doc.fontSize(18)
       .fillColor('#1e293b')
       .text(companyName || 'Your Company', 50, 120);
    
    doc.fontSize(10)
       .fillColor('#64748b')
       .text('123 Business Street', 50, 145)
       .text('City, State 12345', 50, 160)
       .text('Phone: (555) 123-4567', 50, 175)
       .text('Email: info@company.com', 50, 190);

    // Status Badge
    doc.fontSize(10)
       .fillColor('#10b981')
       .text('✓ PAID', 500, 120, { width: 80, align: 'right' });

    // Draw line
    doc.moveTo(50, 220)
       .lineTo(545, 220)
       .strokeColor('#2563eb')
       .lineWidth(3)
       .stroke();

    // Invoice Details Box
    doc.rect(50, 240, 245, 80)
       .fillAndStroke('#f8fafc', '#e2e8f0');
    
    doc.fontSize(9)
       .fillColor('#64748b')
       .text('INVOICE NUMBER', 60, 250);
    
    doc.fontSize(12)
       .fillColor('#1e293b')
       .text(invoiceNumber, 60, 265);

    doc.rect(300, 240, 245, 80)
       .fillAndStroke('#f8fafc', '#e2e8f0');
    
    doc.fontSize(9)
       .fillColor('#64748b')
       .text('INVOICE DATE', 310, 250);
    
    doc.fontSize(12)
       .fillColor('#1e293b')
       .text(invoiceDate || today, 310, 265);

    // Bill To Section
    doc.fontSize(11)
       .fillColor('#64748b')
       .text('BILL TO', 50, 350);
    
    doc.fontSize(14)
       .fillColor('#1e293b')
       .text(clientName, 50, 370);

    // Services Table Header
    doc.rect(50, 420, 495, 30)
       .fillAndStroke('#1e293b', '#1e293b');
    
    doc.fontSize(10)
       .fillColor('#ffffff')
       .text('DESCRIPTION', 60, 430)
       .text('AMOUNT', 450, 430, { width: 85, align: 'right' });

    // Services Table Row
    doc.fontSize(11)
       .fillColor('#1e293b')
       .text(services || 'Professional Services', 60, 465)
       .text(`$${parseFloat(amount).toFixed(2)}`, 450, 465, { 
         width: 85, 
         align: 'right',
         fontWeight: 'bold'
       });

    // Draw row separator
    doc.moveTo(50, 490)
       .lineTo(545, 490)
       .strokeColor('#e2e8f0')
       .lineWidth(1)
       .stroke();

    // Total Section
    doc.rect(50, 520, 495, 60)
       .fillAndStroke('#2563eb', '#2563eb');
    
    doc.fontSize(14)
       .fillColor('#ffffff')
       .text('TOTAL AMOUNT', 60, 540);
    
    doc.fontSize(28)
       .fillColor('#ffffff')
       .text(`$${parseFloat(amount).toFixed(2)}`, 450, 535, { 
         width: 85, 
         align: 'right' 
       });

    // Footer
    doc.fontSize(11)
       .fillColor('#1e293b')
       .text('Thank you for your business!', 50, 640, { align: 'center' });
    
    doc.fontSize(9)
       .fillColor('#64748b')
       .text('Payment has been received and processed.', 50, 660, { align: 'center' })
       .text('If you have any questions, please contact us at info@company.com', 50, 675, { align: 'center' });

    // Finalize PDF
    doc.end();

    // Wait for PDF to be generated
    const pdfBuffer = await pdfPromise;
    const base64Pdf = pdfBuffer.toString('base64');

    return res.status(200).json({
      success: true,
      invoiceNumber: invoiceNumber,
      pdf: base64Pdf,
      pdfDataUrl: `data:application/pdf;base64,${base64Pdf}`,
      message: 'Invoice generated successfully'
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate invoice',
      details: error.message 
    });
  }
}
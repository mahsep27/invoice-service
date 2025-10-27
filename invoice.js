import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import axios from "axios";
import FormData from "form-data";
import dayjs from "dayjs";

/**
 * ENV you must set in Vercel:
 *  - AIRTABLE_TOKEN           (PAT with data.records:read+write)
 *  - AIRTABLE_BASE_ID         (appONFSmSkZsRk7zk)
 *  - AIRTABLE_TABLE_NAME      (Table 13)
 *  - AIRTABLE_ATTACHMENT_FIELD (Invoice File)
 *
 * Optional:
 *  - COMPANY_NAME
 *  - COMPANY_ADDRESS
 */

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "appONFSmSkZsRk7zk";
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || "Table 13";
const ATTACHMENT_FIELD = process.env.AIRTABLE_ATTACHMENT_FIELD || "Invoice File";

const AIRTABLE_API = "https://api.airtable.com/v0";

/**
 * Fetch one record by ID
 */
async function getAirtableRecord(recordId) {
  const url = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    AIRTABLE_TABLE_NAME
  )}/${recordId}`;
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
  });
  return data;
}

/**
 * Upload a file (buffer) to Airtable Files API → returns a public URL
 */
async function airtableUploadBuffer(filename, buffer, mime = "application/pdf") {
  const form = new FormData();
  form.append("file", buffer, { filename, contentType: mime });

  const { data } = await axios.post(`${AIRTABLE_API}/files`, form, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      ...form.getHeaders()
    },
    maxBodyLength: Infinity
  });

  // Files API returns an array of uploaded files with URLs
  const first = Array.isArray(data) ? data[0] : data?.file ?? null;
  const url = first?.url || data?.[0]?.url;
  if (!url) throw new Error("Upload to Airtable v0/files did not return a URL");
  return url;
}

/**
 * Patch attachment field on the record
 */
async function setAirtableAttachment(recordId, url, filename) {
  const patchUrl = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    AIRTABLE_TABLE_NAME
  )}/${recordId}`;
  await axios.patch(
    patchUrl,
    {
      fields: {
        [ATTACHMENT_FIELD]: [{ url, filename }]
      }
    },
    { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
  );
}

/**
 * Very simple HTML invoice (brand later)
 */
function renderInvoiceHTML({ email, payment, date, invoiceNo }) {
  const prettyDate = date ? dayjs(date).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");
  const company = process.env.COMPANY_NAME || "Your Company";
  const address = process.env.COMPANY_ADDRESS || "Address line • City • Country";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${invoiceNo}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial, sans-serif; margin: 40px; color:#111; }
    .top { display:flex; justify-content:space-between; align-items:flex-start; }
    .brand h1 { margin:0; font-size:28px; letter-spacing:0.3px; }
    .brand .sub { color:#666; font-size:12px; }
    .meta { text-align:right; font-size:12px; color:#444; }
    .card { border:1px solid #e5e7eb; border-radius:12px; padding:20px; margin-top:24px; }
    .row { margin:6px 0; }
    .label { color:#6b7280; display:block; font-size:12px; }
    .value { font-size:16px; }
    .total { font-size:20px; font-weight:600; margin-top:12px; }
    .footer { margin-top:40px; color:#6b7280; font-size:12px; }
    .thank { margin-top:28px; font-weight:600; }
  </style>
</head>
<body>
  <div class="top">
    <div class="brand">
      <h1>Invoice</h1>
      <div class="sub">${company}<br>${address}</div>
    </div>
    <div class="meta">
      <div><strong>Date:</strong> ${prettyDate}</div>
      <div><strong>Invoice #:</strong> ${invoiceNo}</div>
    </div>
  </div>

  <div class="card">
    <div class="row"><span class="label">Client</span><span class="value">${email || "-"}</span></div>
    <div class="row"><span class="label">Amount</span><span class="value">${payment || "0"}</span></div>
    <div class="row"><span class="label">Billing Date</span><span class="value">${prettyDate}</span></div>
    <div class="total">Total: ${payment || "0"}</div>
  </div>

  <div class="thank">Thank you for your business!</div>
  <div class="footer">This is a system generated invoice.</div>
</body>
</html>`;
}

/**
 * Create PDF buffer from HTML using puppeteer-core + @sparticuz/chromium
 */
async function htmlToPdfBuffer(html) {
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: chromium.headless,
    defaultViewport: { width: 1240, height: 1754 } // A4-ish viewport for crisp text
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" }
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    if (!AIRTABLE_TOKEN) throw new Error("Missing env AIRTABLE_TOKEN");
    if (!AIRTABLE_BASE_ID) throw new Error("Missing env AIRTABLE_BASE_ID");

    const { recordId, email, payment, date } = req.body || {};

    // If recordId provided, load fields from Airtable; else use provided fields.
    let fields = { Email: email, payment, Date: date };
    let usedRecordId = recordId;

    if (recordId) {
      const rec = await getAirtableRecord(recordId);
      usedRecordId = rec.id;
      fields = {
        Email: rec.fields?.Email ?? email,
        payment: rec.fields?.payment ?? payment,
        Date: rec.fields?.Date ?? date
      };
    }

    if (!fields.Email && !fields.payment) {
      return res.status(400).json({ error: "Need either recordId or {Email, payment, Date} in body" });
    }

    const invoiceNo = `INV-${Date.now().toString().slice(-8)}`;
    const html = renderInvoiceHTML({
      email: fields.Email,
      payment: `${fields.payment}`,
      date: fields.Date,
      invoiceNo
    });

    const pdfBuffer = await htmlToPdfBuffer(html);
    const filename = `Invoice_${invoiceNo}.pdf`;

    const fileUrl = await airtableUploadBuffer(filename, pdfBuffer, "application/pdf");

    if (!usedRecordId) {
      // If no recordId was provided, create a record (optional). Here we just return the file URL.
      return res.status(200).json({
        success: true,
        message: "PDF created",
        url: fileUrl
      });
    }

    await setAirtableAttachment(usedRecordId, fileUrl, filename);

    return res.status(200).json({
      success: true,
      message: "✅ Invoice created & attached to Airtable",
      recordId: usedRecordId,
      url: fileUrl
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: err.message || String(err) });
  }
}

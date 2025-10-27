import { chromium } from "@playwright/test";
import axios from "axios";
import FormData from "form-data";
import dayjs from "dayjs";

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "appONFSmSkZsRk7zk";
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || "Table 13";
const ATTACHMENT_FIELD = process.env.AIRTABLE_ATTACHMENT_FIELD || "Invoice File";

const AIRTABLE_API = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;

async function uploadToAirtable(filename, buffer) {
  const form = new FormData();
  form.append("file", buffer, {
    filename,
    contentType: "application/pdf"
  });

  const { data } = await axios.post("https://api.airtable.com/v0/files", form, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      ...form.getHeaders()
    }
  });

  return data?.[0]?.url;
}

async function attachToRecord(recordId, url, filename) {
  await axios.patch(
    `${AIRTABLE_API}/${recordId}`,
    {
      fields: {
        [ATTACHMENT_FIELD]: [{ url, filename }]
      }
    },
    {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    }
  );
}

function generateHTML({ email, payment, date, invoiceNo }) {
  const formatted = date ? dayjs(date).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD");

  return `
<!doctype html>
<html>
<body style="font-family:Arial;margin:24px;">
<h1>Invoice</h1>
<p><strong>Client:</strong> ${email}</p>
<p><strong>Amount:</strong> ${payment}</p>
<p><strong>Date:</strong> ${formatted}</p>
<p><strong>Invoice #:</strong> ${invoiceNo}</p>
<hr>
<p>Thank you for your business!</p>
</body>
</html>`;
}

async function htmlToPdf(html) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  const pdf = await page.pdf({ format: "A4" });
  await browser.close();
  return pdf;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { recordId, email, payment, date } = req.body;

    if (!email || !payment) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const invoiceNo = "INV-" + Date.now().toString().slice(-6);
    const html = generateHTML({ email, payment, date, invoiceNo });
    const pdfBuffer = await htmlToPdf(html);
    const filename = `Invoice_${invoiceNo}.pdf`;

    const fileUrl = await uploadToAirtable(filename, pdfBuffer);
    if (recordId) await attachToRecord(recordId, fileUrl, filename);

    return res.status(200).json({
      success: true,
      url: fileUrl,
      invoiceNo
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: err.toString() });
  }
}

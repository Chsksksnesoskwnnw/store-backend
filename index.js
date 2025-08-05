// Required modules
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const bodyParser = require('body-parser');
require('dotenv').config(); // Load from .env

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// === Multer Configuration for GCash Uploads ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// === Discord Webhook from .env ===
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;
if (!DISCORD_WEBHOOK) {
  console.warn("⚠️  DISCORD_WEBHOOK is not set in environment variables.");
}

// === GCash Submission Route ===
app.post('/submit-gcash', upload.single('proof'), async (req, res) => {
  const { minecraft, discord, rank, method } = req.body;
  const file = req.file;

  const embed = {
    title: "📸 New GCash Proof Submitted",
    color: 0x0099ff,
    fields: [
      { name: "Minecraft", value: minecraft, inline: true },
      { name: "Discord", value: discord, inline: true },
      { name: "Rank", value: rank, inline: true },
      { name: "Payment Method", value: method || "GCash", inline: true },
      { name: "Time", value: new Date().toLocaleString(), inline: false }
    ]
  };

  try {
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ embeds: [embed] }));
    form.append('file', fs.createReadStream(file.path));

    await axios.post(DISCORD_WEBHOOK, form, {
      headers: form.getHeaders()
    });

    fs.unlinkSync(file.path);
    res.status(200).json({ success: true, message: "GCash submitted!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send webhook" });
  }
});

// === PayPal IPN Listener ===
app.post('/paypal-ipn', bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const rawBody = new URLSearchParams(req.body).toString();
  const ipnVerification = `cmd=_notify-validate&${rawBody}`;

  try {
    const { data } = await axios.post(
      'https://ipnpb.paypal.com/cgi-bin/webscr',
      ipnVerification,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Node.js IPN Verification'
        }
      }
    );

    console.log('[PAYPAL IPN] Verification response:', data);

    if (data === 'VERIFIED') {
      if (req.body.payment_status === 'Completed') {
        const embed = {
          title: "✅ PayPal Payment Verified",
          color: 0x00ff00,
          fields: [
            { name: "Minecraft", value: req.body.custom || "Unknown", inline: true },
            { name: "Payer", value: req.body.payer_email || "N/A", inline: true },
            { name: "Amount", value: `${req.body.mc_gross || "??"} ${req.body.mc_currency || ""}`, inline: true },
            { name: "TXN ID", value: req.body.txn_id || "N/A", inline: false }
          ],
          timestamp: new Date()
        };

        await axios.post(DISCORD_WEBHOOK, { embeds: [embed] });
      } else {
        console.warn("❗ Payment not completed:", req.body.payment_status);
      }
    } else {
      console.warn("❌ IPN NOT VERIFIED:", data);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ IPN validation error:', err.message);
    res.status(500).send('IPN Verification Error');
  }
});


// === Start Server ===
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

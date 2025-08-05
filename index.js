const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// === GCash Upload Configuration ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// === GCash Submission ===
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

    await axios.post('https://discord.com/api/webhooks/1401842076840366150/5IGXajdakrAogdvxjRVE9ZEwJFhFuDZ-xIba3z0JQ8ljq74uvH_TlOaoPrhVzqPr3ZgI', form, {
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
    const { data } = await axios.post('https://ipnpb.paypal.com/cgi-bin/webscr', ipnVerification, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (data === 'VERIFIED' && req.body.payment_status === 'Completed') {
      const embed = {
        title: "PayPal Payment Verified",
        color: 0x00ff00,
        fields: [
          { name: "Minecraft", value: req.body.custom || "Unknown", inline: true },
          { name: "Payer", value: req.body.payer_email, inline: true },
          { name: "Amount", value: `${req.body.mc_gross} ${req.body.mc_currency}`, inline: true },
          { name: "TXN ID", value: req.body.txn_id, inline: false }
        ]
      };

      await axios.post('https://discord.com/api/webhooks/1401842076840366150/5IGXajdakrAogdvxjRVE9ZEwJFhFuDZ-xIba3z0JQ8ljq74uvH_TlOaoPrhVzqPr3ZgI', { embeds: [embed] });
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('IPN validation error:', err.message);
    res.status(500).end();
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

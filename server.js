const express = require('express');
const cors = require('cors');
const config = require('./config');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const eventsRouter = require('./routes/events');
app.use('/api', eventsRouter);

// Serve config to frontend
app.get('/api/config', (req, res) => {
  res.json(config);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ShopFloorPulse running on port ${PORT}`));
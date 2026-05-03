const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const eventsRouter = require('./routes/events');
app.use('/api', eventsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ClamClamp running on port ${PORT}`));
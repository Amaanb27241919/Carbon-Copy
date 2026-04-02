'use strict';

const app = require('./app');
const { logger } = require('./utils/logger');

const PORT = process.env.PORT || 3004;

app.listen(PORT, () => {
  logger.info(`Model Router running on port ${PORT}`);
  logger.info(`Default provider: ${process.env.DEFAULT_PROVIDER || 'openai'}`);
});

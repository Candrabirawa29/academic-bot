const axios = require('axios');

const BASE_URL = process.env.API_BASE_URL;

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

module.exports = apiClient;
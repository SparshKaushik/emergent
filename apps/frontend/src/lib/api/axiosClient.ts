import axios from "axios";

const API_BASE_URL = import.meta.env.API_URL || "http://localhost:3001";

const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export default axiosClient;


import axios from "axios";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  "http://127.0.0.1:8000";

const api = axios.create({
  baseURL: apiBaseUrl.replace(/\/+$/, ""),
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const savedAuth = localStorage.getItem("auth");

    if (savedAuth) {
      const auth = JSON.parse(savedAuth);

      if (auth?.access_token) {
        config.headers.Authorization = `Bearer ${auth.access_token}`;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;

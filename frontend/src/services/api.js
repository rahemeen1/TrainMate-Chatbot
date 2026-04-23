const DEFAULT_PROD_API_BASE_URL = "https://trainmate-backend-161059187631.us-central1.run.app";

const isLocalDevelopment =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

const API_BASE_URL = (
  process.env.REACT_APP_API_BASE_URL || (!isLocalDevelopment ? DEFAULT_PROD_API_BASE_URL : "")
).replace(/\/$/, "");

export const apiUrl = (path) => {
  if (!path) return API_BASE_URL;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

import axios from "axios";
import { getApiBaseUrl } from "../config/api";
import { installAuthInterceptor } from "./authAxios";

export const apiClient = axios.create({
  baseURL: `${getApiBaseUrl()}/api`,
  timeout: 10000,
});

apiClient.interceptors.request.use((config) => {
  config.baseURL = `${getApiBaseUrl()}/api`;
  return config;
});

installAuthInterceptor(apiClient);

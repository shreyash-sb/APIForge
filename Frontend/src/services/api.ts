import axios from "axios";
import { API_BASE_URL } from "@/config/api";
import { installAuthInterceptor } from "./authAxios";

export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 10000,
});

installAuthInterceptor(apiClient);

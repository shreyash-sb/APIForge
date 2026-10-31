import axios from "axios";
import { installAuthInterceptor } from "./authAxios";

export const apiClient = axios.create({
  baseURL: "/api",
  timeout: 10000,
});

installAuthInterceptor(apiClient);

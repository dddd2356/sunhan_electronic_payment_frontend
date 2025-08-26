import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'universal-cookie';

const cookies = new Cookies();
const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8080";

const axiosInstance = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
});

axiosInstance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const accessToken = cookies.get('accessToken');
        if (accessToken) {
            config.headers = config.headers || {};
            config.headers['Authorization'] = `Bearer ${accessToken}`;
            console.log("📤 Request with token:", accessToken.substring(0, 10) + "...", "URL:", config.url);
        }
        return config;
    },
    (error) => Promise.reject(error)
);

export default axiosInstance;
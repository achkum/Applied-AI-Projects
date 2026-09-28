import * as SecureStore from 'expo-secure-store';
import { SecureTokenStore } from '@/types';

const AUTH_TOKEN_KEY = 'auth-token';
const REFRESH_TOKEN_KEY = 'refresh-token';

const secureTokenStore: SecureTokenStore = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error(`Failed to retrieve token for key ${key}:`, error);
      return null;
    }
  },

  async setToken(key: string, token: string) {
    try {
      await SecureStore.setItemAsync(key, token);
    } catch (error) {
      console.error(`Failed to store token for key ${key}:`, error);
    }
  },

  async removeToken(key: string) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error(`Failed to remove token for key ${key}:`, error);
    }
  },
};

export const authTokenStore = {
  async getToken() {
    return secureTokenStore.getToken(AUTH_TOKEN_KEY);
  },

  async setToken(token: string) {
    return secureTokenStore.setToken(AUTH_TOKEN_KEY, token);
  },

  async removeToken() {
    return secureTokenStore.removeToken(AUTH_TOKEN_KEY);
  },
};

export const refreshTokenStore = {
  async getToken() {
    return secureTokenStore.getToken(REFRESH_TOKEN_KEY);
  },

  async setToken(token: string) {
    return secureTokenStore.setToken(REFRESH_TOKEN_KEY, token);
  },

  async removeToken() {
    return secureTokenStore.removeToken(REFRESH_TOKEN_KEY);
  },
};

export default secureTokenStore;

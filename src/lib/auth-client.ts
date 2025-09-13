// Client-side cookie utilities only
// No sensitive data or JWT operations here
// When it's supported, use https://developer.mozilla.org/en-US/docs/Web/API/Cookie_Store_API

const COOKIE_NAME = "goals-auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14; // 14 days in seconds

/**
 * Client-side cookie utilities
 */
export const clientAuth = {
  setCookie(token: string): void {
    const expires = new Date(Date.now() + COOKIE_MAX_AGE * 1000).toUTCString();
    document.cookie = `${COOKIE_NAME}=${token}; path=/; max-age=${COOKIE_MAX_AGE}; expires=${expires}; samesite=lax${
      window.location.protocol === "https:" ? "; secure" : ""
    }`;
  },

  getToken(): string | null {
    if (typeof document === "undefined") return null;

    const name = COOKIE_NAME + "=";
    const cookies = decodeURIComponent(document.cookie).split(";");

    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.startsWith(name)) {
        return cookie.substring(name.length);
      }
    }

    return null;
  },

  clearCookie(): void {
    if (typeof document === "undefined") return;
    document.cookie = `${COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
  },
};

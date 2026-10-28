export function getAppUrl() {
  const vercelHost = process.env.VERCEL_ENV === 'production'
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
    : process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL || vercelHost;

  const appUrl = configuredUrl
    ? (/^https?:\/\//i.test(configuredUrl) ? configuredUrl : `https://${configuredUrl}`)
    : process.env.NODE_ENV === 'production'
      ? 'https://rexkapehan.com'
      : 'http://localhost:3000';

  return appUrl.replace(/\/+$/, '');
}

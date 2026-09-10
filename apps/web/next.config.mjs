/** @type {import('next').NextConfig} */
if (process.env.VERCEL) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "";
  if (!apiUrl.startsWith("https://")) {
    throw new Error("NEXT_PUBLIC_API_URL must be the deployed HTTPS API URL");
  }
  if (!wsUrl.startsWith("wss://")) {
    throw new Error("NEXT_PUBLIC_WS_URL must be the deployed WSS API URL");
  }
}

const nextConfig = {
  transpilePackages: ["@privai/schemas", "@privai/shared"],
  reactStrictMode: true,
};

export default nextConfig;

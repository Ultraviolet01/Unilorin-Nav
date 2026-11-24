/** @type {import('next').NextConfig} */
// Static export: the app has no server code, so it deploys as plain files (AWS Amplify Hosting / S3 + CloudFront).
export default { reactStrictMode: true, output: "export", trailingSlash: true, images: { unoptimized: true } };

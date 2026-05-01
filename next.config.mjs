/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,

  // Cache largo para texturas y modelos GLB en /public.
  // Las texturas 4K pesan ~45 MB la 1ra vez — el browser las guarda 1 año
  // immutable. Para invalidar, renombrar el archivo (cache busting).
  async headers() {
    return [
      {
        source: "/textures/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/tiles/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/water-manifest-z15.json",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;

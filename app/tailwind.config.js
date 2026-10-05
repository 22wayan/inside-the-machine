/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        abyss: '#070d1c',     // tiefes Indigo (Hintergrund)
        deep: '#0a2230',      // Ozeanblau
        shoal: '#12384a',     // Untiefe
        foam: '#f5f7fa',      // Off-White (Text)
        coral: '#ff4d6d',     // Akzent (Gefahr / Betroffenheit)
        amber: '#f4d06a',     // sekundaerer Akzent (Sand / sichere Hoehe)
        kelp: '#22d3ee',      // vivid Teal (Wasser)
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}

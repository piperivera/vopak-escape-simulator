/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        space: {
          night: "#0E2A73",
          ink: "#0B1F5C",
          ribbon: "#1D2F73",
          star: "#F6C10E",
          accent: "#FF7A00",
        },
      },
      keyframes: {
        twinkle: { "0%,100%": { opacity: ".6" }, "50%": { opacity: "1" } },
        drift: { "0%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" }, "100%": { transform: "translateY(0)" } },
        ribbon: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        rocket: {
          "0%": { transform: "translate(-20vw,5vh) rotate(8deg)" },
          "25%": { transform: "translate(10vw,-5vh) rotate(6deg)" },
          "50%": { transform: "translate(40vw,6vh) rotate(5deg)" },
          "75%": { transform: "translate(70vw,-4vh) rotate(4deg)" },
          "100%": { transform: "translate(110vw,3vh) rotate(3deg)", opacity: "0" },
        },
      },
      animation: {
        twinkle: "twinkle 3.2s ease-in-out infinite",
        drift: "drift 6s ease-in-out infinite",
        ribbon: "ribbon 60s linear infinite",
        rocket: "rocket 18s linear infinite",
      },
      backgroundImage: {
        "space-1": "url('/space/fondo-1.png')",
        "space-2": "url('/space/fondo-2.png')",
      },
    },
  },
  plugins: [],
};

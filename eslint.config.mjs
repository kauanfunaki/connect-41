import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Campos de formulário crus são proibidos fora dos primitivos do Design
    // System (src/components/ui/*) — use Input/Select/Textarea/Checkbox.
    // Exceções: input hidden/radio/color/file (sem primitivo equivalente) e
    // as superfícies bespoke de login e busca global.
    files: ["src/**/*.tsx"],
    ignores: [
      "src/components/ui/**",
      "src/components/login/**",
      "src/app/login/**",
      "src/components/shell/GlobalSearch.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            'JSXOpeningElement[name.name="input"]:not(:has(JSXAttribute[name.name="type"] Literal[value="hidden"], JSXAttribute[name.name="type"] Literal[value="radio"], JSXAttribute[name.name="type"] Literal[value="color"], JSXAttribute[name.name="type"] Literal[value="file"], JSXAttribute[name.name="type"] Literal[value="checkbox"]))',
          message:
            "Use o componente Input de @/components/ui/Input em vez de <input> cru (exceto hidden/radio/color/file).",
        },
        {
          selector:
            'JSXOpeningElement[name.name="input"]:has(JSXAttribute[name.name="type"] Literal[value="checkbox"]):not(:has(JSXAttribute[name.name="className"] Literal[value=/sr-only/]))',
          message:
            "Use o componente Checkbox de @/components/ui/Checkbox em vez de <input type=\"checkbox\"> cru (exceto padrões sr-only/peer).",
        },
        {
          selector: 'JSXOpeningElement[name.name="select"]',
          message: "Use o componente Select de @/components/ui/Select em vez de <select> cru.",
        },
        {
          selector: 'JSXOpeningElement[name.name="textarea"]',
          message: "Use o componente Textarea de @/components/ui/Textarea em vez de <textarea> cru.",
        },
      ],
    },
  },
]);

export default eslintConfig;

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
    // Bloco principal: campos de formulário crus (fora dos primitivos do
    // Design System) + formatação de Date crua (fora de @/lib/format) — as
    // duas regras usam a mesma chave core (no-restricted-syntax) e por isso
    // precisam viver no MESMO bloco: o eslint flat config substitui a config
    // de uma regra por inteiro quando dois blocos que a configuram batem no
    // mesmo arquivo, não concatena os arrays de seletor.
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: [
      "src/components/ui/**",
      "src/components/login/**",
      "src/app/login/**",
      "src/components/shell/GlobalSearch.tsx",
      "src/lib/format.ts",
      "src/generated/**",
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
        {
          selector: 'CallExpression[callee.property.name=/^toLocale(Date|Time)String$/]',
          message:
            "Use formatCalendarDate/formatInstantDate/formatInstantDateTime/formatInstantTime de @/lib/format em vez de toLocaleDateString/toLocaleTimeString cru.",
        },
        {
          selector:
            'CallExpression[callee.property.name="toLocaleString"]:not([callee.object.callee.name="Number"])',
          message:
            "Use formatInstantDateTime de @/lib/format em vez de toLocaleString cru num Date (Number(...).toLocaleString para moeda continua permitido).",
        },
      ],
    },
  },
  {
    // Os caminhos acima ficam de fora do bloco principal só pra pular a regra
    // de JSX cru (primitivos do design system, telas de login, busca global)
    // — mas a regra de timezone continua valendo neles.
    files: [
      "src/components/ui/**/*.ts",
      "src/components/ui/**/*.tsx",
      "src/components/login/**/*.tsx",
      "src/app/login/**/*.tsx",
      "src/components/shell/GlobalSearch.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: 'CallExpression[callee.property.name=/^toLocale(Date|Time)String$/]',
          message:
            "Use formatCalendarDate/formatInstantDate/formatInstantDateTime/formatInstantTime de @/lib/format em vez de toLocaleDateString/toLocaleTimeString cru.",
        },
        {
          selector:
            'CallExpression[callee.property.name="toLocaleString"]:not([callee.object.callee.name="Number"])',
          message:
            "Use formatInstantDateTime de @/lib/format em vez de toLocaleString cru num Date (Number(...).toLocaleString para moeda continua permitido).",
        },
      ],
    },
  },
]);

export default eslintConfig;

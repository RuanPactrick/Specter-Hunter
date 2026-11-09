import { defineConfig, globalIgnores } from "eslint/config";
import web from "eslint-config-next/core-web-vitals";
import types from "eslint-config-next/typescript";
export default defineConfig([...web, ...types, globalIgnores([".next/**", "next-env.d.ts", "playwright-report/**", "test-results/**"])]);

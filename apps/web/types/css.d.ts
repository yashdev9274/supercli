// Next.js ships ambient declarations for `*.module.css`, `*.module.scss`,
// `server-only` and `client-only`, but not for plain `*.css` side-effect
// imports. It relies on TypeScript not checking side-effect imports, which is
// only the default in some TypeScript versions (5.x) and not in others (7.x
// reports TS2882). Declaring the pattern here makes `import "./globals.css"`
// resolve under any TypeScript version.
//
// This does not weaken CSS Module typing: TypeScript prefers the more specific
// `*.module.css` pattern, so `import css from "./x.module.css"` stays typed.
declare module "*.css";

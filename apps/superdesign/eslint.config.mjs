import { defineConfig } from "eslint/config"
import next from "eslint-config-next"

export default defineConfig([
  ...next,
  {
    files: ["**/components/ui/dialog.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
])

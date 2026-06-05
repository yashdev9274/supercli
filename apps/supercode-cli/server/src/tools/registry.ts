import { readFileTool } from "./definitions/read-file.ts"
import { searchFilesTool } from "./definitions/search-files.ts"
import { urlFetchTool } from "./definitions/url-fetch.ts"
import { webSearchTool } from "./definitions/web-search.ts"
import { codeExecTool } from "./definitions/code-exec.ts"

export const tools = {
  read_file: readFileTool,
  search_files: searchFilesTool,
  url_fetch: urlFetchTool,
  web_search: webSearchTool,
  code_exec: codeExecTool,
}

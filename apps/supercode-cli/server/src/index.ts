import express from "express"
import { toNodeHandler } from "better-auth/node"
import { auth } from "./lib/auth"
import cors from "cors"

const port = process.env.PORT || 10000
const clientUrl = process.env.CLIENT_URL || "http://localhost:3000"
const app = express()

app.use(
  cors({
    origin: [clientUrl].filter(Boolean),
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
)
app.use("/api/auth", toNodeHandler(auth))

app.use(express.json())

app.get("/device", async (req, res) => {
  const { user_code } = req.query
  res.redirect(`${clientUrl}/device?user_code=${user_code}`)
})

app.get("/handle", (req, res) => {
  res.send("OK")
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
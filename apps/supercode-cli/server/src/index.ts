import express from "express";
import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";
import cors from "cors";
dotenv.config();

const port = process.env.PORT || 3004;
const app = express();

app.use(
  cors({
    origin: "http://localhost:3004", // Replace with your frontend's origin
    methods: ["GET", "POST", "PUT", "DELETE"], // Specify allowed HTTP methods
    credentials: true, // Allow credentials (cookies, authorization headers, etc.)
  })
);
app.all("/api/auth/*splat", toNodeHandler(auth)); 

app.use(express.json());

app.get("/handle", (req, res)=>{
  res.send("OK")
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
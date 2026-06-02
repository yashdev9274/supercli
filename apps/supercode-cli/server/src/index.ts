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
    origin: "http://localhost:3000", // Replace with your frontend's origin
    methods: ["GET", "POST", "PUT", "DELETE"], // Specify allowed HTTP methods
    credentials: true, // Allow credentials (cookies, authorization headers, etc.)
  })
);
app.use("/api/auth", toNodeHandler(auth)); 

app.use(express.json()); 

app.get("/device",async(req,res)=>{
  const {user_code} = req.query
  res.redirect(`http://localhost:3000/device?user_code=${user_code}`)
})

app.get("/handle", (req, res)=>{
  res.send("OK")
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
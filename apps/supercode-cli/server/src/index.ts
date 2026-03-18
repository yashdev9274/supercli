import express from "express";
import dotenv from "dotenv";

dotenv.config();

const port = process.env.PORT || 3004;
const app = express();

app.get("/handle", (req, res)=>{
  res.send("OK")
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
import express from "express";
import cors from "cors";
import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";
import OpenAI from "openai";
dotenv.config({ path: ".env" });

const app = express();
const port = process.env.PORT || 3000;
// const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@cluster0.f4oujya.mongodb.net/?appName=Cluster0`;
const uri = "mongodb://localhost:27017/";
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
const token = process.env["GITHUB_TOKEN"];
const endpoint = "https://models.github.ai/inference";
const model = "openai/gpt-4.1-mini";
const aiClient = new OpenAI({
  baseURL: endpoint,
  apiKey: token,
});

//middleware
app.use(cors());
app.use(express.json());

//   const client = new OpenAI({ baseURL: endpoint, apiKey: token });

//   const response = await client.chat.completions.create({
//     messages: [
//       { role: "system", content: "Hello" },
//       { role: "user", content: "What is the capital of France?" },
//     ],
//     model: model,
//   });

//   console.log(response.choices[0].message.content);
// }

// main().catch((err) => {
//   console.error("The sample encountered an error:", err);
// });

async function run() {
  try {
    await client.connect();

    app.post("/ai", async (req, res) => {
      try {
        const { message } = req.body;

        const response = await aiClient.chat.completions.create({
          model: model,
          messages: [
            { role: "system", content: "You are a helpful assistant" },
            { role: "user", content: message },
          ],
        });

        res.json({
          reply: response.choices[0].message.content,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "AI request failed" });
      }
    });

    app.get("/", async (req, res) => {
      res.send("Hello server");
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Serve running in ${port}`);
});

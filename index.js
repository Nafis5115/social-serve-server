import express from "express";
import cors from "cors";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
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
const generateWithAI = async (event) => {
  const prompt = `
Generate volunteer responsibilities and safety guidelines for a community event.

Event details:${event.description}
Title: ${event.eventTitle}
Type: ${event.eventType}
Location: ${event.location}
Description: ${event.description}

Rules:
- Generate 5 volunteer responsibilities
- Generate 5 safety guidelines
- Return ONLY valid JSON
- No explanation, no markdown

Format:
{
  "responsibilities": ["..."],
  "safetyGuidelines": ["..."]
}
`;
  const response = await aiClient.chat.completions.create({
    model: model,
    messages: [
      { role: "system", content: "You generate structured JSON only." },
      { role: "user", content: prompt },
    ],
  });
  const text = response.choices[0].message.content;
  const parsed = JSON.parse(text);
  return parsed;
};

//middleware
app.use(cors());
app.use(express.json());

async function run() {
  try {
    await client.connect();
    const db = client.db("social-serve");
    const eventCollection = db.collection("eventCollection");

    app.post("/create-event", async (req, res) => {
      const newEvent = req.body;
      const createdAt = new Date();
      newEvent.createdAt = createdAt;
      if (newEvent.aiAssistance === true) {
        try {
          const aiResult = await generateWithAI(newEvent);

          console.log("AI RESULT:", aiResult);

          newEvent.responsibilities = aiResult.responsibilities;
          newEvent.safetyGuidelines = aiResult.safetyGuidelines;
        } catch (err) {
          console.error("ERROR:", err.message);

          return res.status(500).json({
            error: "AI generation failed",
          });
        }
      }

      const result = await eventCollection.insertOne(newEvent);
      res.json(result);
    });

    app.get("/event-details/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await eventCollection.findOne(query);
      res.send(result);
    });

    app.get("/upcoming-events", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 6;
      const skip = (page - 1) * limit;
      const today = new Date().toISOString().split("T")[0];
      const query = {
        startDate: { $gt: today },
      };
      const cursor = eventCollection
        .find(query)
        .sort({ startDate: 1 })
        .skip(skip)
        .limit(limit);
      const events = await cursor.toArray();
      const total = await eventCollection.countDocuments(query);
      res.send({
        events,
        totalPages: Math.ceil(total / limit),
      });
    });

    app.get("/active-events", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 6;
      const skip = (page - 1) * limit;
      const today = new Date().toISOString().split("T")[0];
      const query = {
        startDate: { $lte: today },
        endDate: { $gte: today },
      };
      const cursor = eventCollection
        .find(query)
        .sort({ startDate: 1 })
        .skip(skip)
        .limit(limit);
      const events = await cursor.toArray();
      const total = await eventCollection.countDocuments(query);
      res.send({
        events,
        totalPages: Math.ceil(total / limit),
      });
    });

    // app.get("/upcoming-events", async (req, res) => {
    //   const cursor = eventCollection.find();
    //   const allEvent = await cursor.toArray();
    //   const result = allEvent.filter((event) => {
    //     const currentDate = formattedDate(new Date());
    //     const startDate = formattedDate(event.startDate);

    //     if (currentDate <= startDate) {
    //       return event;
    //     }
    //   });
    //   res.send(result);
    // });

    app.get("/", async (req, res) => {
      const today = new Date();

      res.send(today);
    });

    //  app.post("/ai", async (req, res) => {
    //   try {
    //     const { message } = req.body;

    //     const response = await aiClient.chat.completions.create({
    //       model: model,
    //       messages: [
    //         { role: "system", content: "You are a helpful assistant" },
    //         { role: "user", content: message },
    //       ],
    //     });

    //     res.json({
    //       reply: response.choices[0].message.content,
    //     });
    //   } catch (err) {
    //     console.error(err);
    //     res.status(500).json({ error: "AI request failed" });
    //   }
    // });

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

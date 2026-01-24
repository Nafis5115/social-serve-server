import express from "express";
import cors from "cors";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";
import OpenAI from "openai";
import jwt from "jsonwebtoken";

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
  const variation = Date.now();

  const prompt = `
Please generate original written content for a community event.

Random seed: ${variation}

Event information:
Title: ${event.eventTitle}
Type: ${event.eventType}
Location: ${event.location}
Description: ${event.description}

Goal:
Create two lists:
• 5 volunteer responsibilities
• 5 safety guidelines

Writing guidance:
- Each sentence should feel distinct in structure and tone
- Sentence openings should vary naturally
- A mix of descriptive, situational, observational, and neutral phrasing is preferred
- Some sentences may be action-oriented, others explanatory or contextual
- Try to avoid repeating similar wording patterns

Variation preference:
If this content is regenerated, imagine it is written by a different person using a different writing style and vocabulary.

Output requirements:
- Respond only with valid JSON
- Do not include explanations, headings, or markdown

JSON format:
{
  "responsibilities": ["...", "...", "...", "...", "..."],
  "safetyGuidelines": ["...", "...", "...", "...", "..."]
}
`;

  const response = await aiClient.chat.completions.create({
    model: model,
    temperature: 0.9,
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

//verify jwt token
const verifyJWTToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: "Unauthorized access!" });
  }
  const token = authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access!" });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decode) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access!" });
    }
    req.headers.token_email = decode.email;
    next();
  });
};

async function run() {
  try {
    await client.connect();
    const db = client.db("social-serve");
    const eventCollection = db.collection("eventCollection");
    const userCollection = db.collection("userCollection");
    const joinsCollection = db.collection("joinsCollection");

    app.post("/create-user", async (req, res) => {
      const newUser = req.body;
      const createdAt = new Date();
      newUser.createdAt = createdAt;
      const query = { email: req.body.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        res.send({ message: "User already exits" });
      } else {
        const result = await userCollection.insertOne(newUser);
        res.send(result);
      }
    });

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

    app.patch("/update-event/:id", async (req, res) => {
      const id = req.params.id;
      const { regenerateAI, ...updatedEvent } = req.body;
      const updatedAt = new Date();
      const query = { _id: new ObjectId(id) };
      const update = { $set: updatedEvent };
      updatedEvent.updatedAt = updatedAt;

      if (regenerateAI === true) {
        try {
          const aiInput = {
            eventTitle: updatedEvent.eventTitle,
            eventType: updatedEvent.eventType,
            location: updatedEvent.location,
            description: updatedEvent.description,
          };
          const aiResult = await generateWithAI(aiInput);

          console.log("AI RESULT:", aiResult);

          updatedEvent.responsibilities = aiResult.responsibilities;
          updatedEvent.safetyGuidelines = aiResult.safetyGuidelines;
          updatedEvent.aiAssistance = true;
        } catch (err) {
          console.error("ERROR:", err.message);

          return res.status(500).json({
            error: "AI generation failed",
          });
        }
      }

      const result = await eventCollection.updateOne(query, update);
      res.json(result);
    });

    app.delete("/delete-event/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await eventCollection.deleteOne(query);
      return res.send(result);
    });

    app.get("/my-events", verifyJWTToken, async (req, res) => {
      const email = req.query.email;
      console.log(email);
      const query = {};
      if (!email) {
        return res.status(401).send({ message: "Unauthorized access!" });
      }
      if (email !== req.headers.token_email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      query.ownerEmail = email;
      const cursor = eventCollection.find(query).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/event-details/:id", async (req, res) => {
      const id = req.params.id;
      const eventQuery = { _id: new ObjectId(id) };
      const event = await eventCollection.findOne(eventQuery);
      const ownerEmail = event.ownerEmail;
      const userQuery = {};
      if (ownerEmail) {
        userQuery.email = ownerEmail;
      }
      const userInfo = await userCollection.findOne(userQuery);
      res.send({
        event,
        userInfo,
      });
    });

    app.get("/upcoming-events", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 6;
      const search = req.query.search;
      const category = req.query.category;
      const skip = (page - 1) * limit;
      const today = new Date().toISOString().split("T")[0];
      const query = {
        startDate: { $gt: today },
      };
      if (search) {
        query.eventTitle = { $regex: search, $options: "i" };
      }
      if (category) {
        query.eventType = category;
      }
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
      const search = req.query.search;
      const category = req.query.category;
      const skip = (page - 1) * limit;
      const today = new Date().toISOString().split("T")[0];
      const query = {
        startDate: { $lte: today },
        endDate: { $gte: today },
      };
      if (search) {
        query.eventTitle = { $regex: search, $options: "i" };
      }
      if (category) {
        query.eventType = category;
      }
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

    app.post("/create-join", async (req, res) => {
      const newJoin = req.body;
      const createdAt = new Date();
      newJoin.createdAt = createdAt;
      newJoin.eventId = new ObjectId(newJoin.eventId);
      const result = await joinsCollection.insertOne(newJoin);
      return res.send(result);
    });

    app.get("/my-joins", verifyJWTToken, async (req, res) => {
      const email = req.query.email;
      // const query = {};
      // if (email) {
      //   query.userEmail = email;
      // }
      // const cursor = joinsCollection.find(query);
      // const result = await cursor.toArray();

      if (email !== req.headers.token_email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const cursor = joinsCollection.aggregate([
        { $match: { userEmail: email } },
        {
          $lookup: {
            from: "eventCollection",
            localField: "eventId",
            foreignField: "_id",
            as: "event",
          },
        },
        { $unwind: "$event" },
      ]);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/event-joins/:id", async (req, res) => {
      const id = req.params.id;
      const query = { eventId: new ObjectId(id) };
      const cursor = joinsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.delete("/delete-join", async (req, res) => {
      const { eventId, userEmail } = req.body;
      const query = { eventId: new ObjectId(eventId), userEmail: userEmail };
      const result = await joinsCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/getToken", (req, res) => {
      const token = jwt.sign(
        { email: req.body.email },
        process.env.JWT_SECRET,
        {
          expiresIn: "1h",
        },
      );
      res.send({ token: token });
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

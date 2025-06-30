import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import ModelClient from "@azure-rest/ai-inference";
import { AzureChatOpenAI } from "@langchain/openai";
import { BufferMemory } from "langchain/memory";
import { ConversationChain } from "langchain/chains";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { error } from "console";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
// RAG implementation
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const pdfPath = path.join(projectRoot, 'data/employee_handbook.pdf');
// session for memory store
const sessionMemories = {};
const chatModel = new AzureChatOpenAI({
  azureOpenAIApiKey: process.env.AZURE_INFERENCE_SDK_KEY,
  azureOpenAIApiInstanceName: process.env.INSTANCE_NAME, // In target url: https://<INSTANCE_NAME>.services...
  azureOpenAIApiDeploymentName: process.env.DEPLOYMENT_NAME, // i.e "gpt-4o"
  azureOpenAIApiVersion: "2024-08-01-preview", // In target url: ...<VERSION>
  temperature: 1,
  maxTokens: 4096,
});
// RAG implementation
let pdfText = null; 
let pdfChunks = []; 
const CHUNK_SIZE = 800; 

async function loadPDF() {
  if (pdfText) return pdfText;

  if (!fs.existsSync(pdfPath)) return "PDF not found.";

  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer); 
  pdfText = data.text; 
  let currentChunk = ""; 
  const words = pdfText.split(/\s+/); 

  for (const word of words) {
    if ((currentChunk + " " + word).length <= CHUNK_SIZE) {
      currentChunk += (currentChunk ? " " : "") + word;
    } else {
      pdfChunks.push(currentChunk);
      currentChunk = word;
    }
  }
  if (currentChunk) pdfChunks.push(currentChunk);
  return pdfText;
}
// helper function to get / create a session history
function getSessionMemory(sessionId) {
  if (!sessionMemories[sessionId]) {
    sessionMemories[sessionId] = new BufferMemory({
      returnMessages: true,
      memoryKey: "history",
    });
  }
  return sessionMemories[sessionId];
}

function retrieveRelevantContent(query) {
  const queryTerms = query.toLowerCase().split(/\s+/) // Converts query to relevant search terms
    .filter(term => term.length > 3)
    .map(term => term.replace(/[.,?!;:()"']/g, ""));

  if (queryTerms.length === 0) return [];
  const scoredChunks = pdfChunks.map(chunk => {
    const chunkLower = chunk.toLowerCase(); 
    let score = 0; 
    for (const term of queryTerms) {
      const regex = new RegExp(term, 'gi');
      const matches = chunkLower.match(regex);
      if (matches) score += matches.length;
    }
    return { chunk, score };
  });
  return scoredChunks
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(item => item.chunk);
}

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  const useRAG = req.body.useRAG === undefined ? true : req.body.useRAG;
  const sessionId = req.body.sessionId || "default";
  
  let sources = [];
  let systemMessage = { role: "system", content: "You are a helpful assistant." };

  // Get session memory
  const memory = getSessionMemory(sessionId);
  const memoryVars = await memory.loadMemoryVariables({});

  if (useRAG) {
    await loadPDF();
    sources = retrieveRelevantContent(userMessage);
    if (sources.length > 0) {
      systemMessage = {
        role: "system",
        content: `You are a helpful assistant answering questions about the company based on its employee handbook. 
        Use ONLY the following information from the handbook to answer the user's question.
        If you can't find relevant information in the provided context, say so clearly.
        --- EMPLOYEE HANDBOOK EXCERPTS ---
        ${sources.join('')}
        --- END OF EXCERPTS ---`
      };
    } else {
      systemMessage = {
        role: "system",
        content: "You are a helpful assistant. No relevant information was found in the employee handbook for this question."
      };
    }
  }

  // Build messages array with conversation history
  const messages = [
    systemMessage,
    ...(memoryVars.history || []),
    { role: "user", content: userMessage },
  ];

  try {
    const response = await chatModel.invoke(messages);
    
    // Save conversation to memory
    await memory.saveContext(
      { input: userMessage },
      { output: response.content }
    );

    res.json({ 
      reply: response.content, 
      sources: useRAG ? sources : [],
      sessionId: sessionId
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Model call failed",
      message: err.message,
      reply: "Sorry, I encountered an error. Please try again."
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`AI API server running on port ${PORT}`);
});
import path from "path";
import "dotenv/config.js";

import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";

const endpoint = process.env.AZURE_INFERENCE_SDK_ENDPOINT;
const key = process.env.AZURE_INFERENCE_SDK_KEY;
if (!endpoint || !key) {
  throw new Error("AZURE_INFERENCE_SDK_ENDPOINT or AZURE_INFERENCE_SDK_KEY is not set. Check your .env file and environment variables.");
}
const client = new ModelClient(endpoint, new AzureKeyCredential(key));
var messages = [
  { role: "developer", content: "You are an helpful assistant" },
  { role: "user", content: "What are 3 things to see in Seattle?" },
];

var response = await client.path("chat/completions").post({
  body: {
    messages: messages,
    max_completion_tokens: 800,
      temperature: 1,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      model: "gpt-4.1-mini",
  },
});

console.log(JSON.stringify(response));

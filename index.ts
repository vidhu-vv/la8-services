import OpenAI from "openai";
import "dotenv/config";
import PocketBase from "pocketbase";
const eventsource = require("eventsource");
const dayjs = require("dayjs");
global.EventSource = eventsource;

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const pb = new PocketBase("https://la8api.continuitylabs.dev");
await pb.admins.authWithPassword(
  process.env.PB_TYPEGEN_EMAIL as string,
  process.env.PB_TYPEGEN_PASSWORD as string
);
const languages = new Set<string>();
languages.add("english");
const users = await pb.collection("users").getFullList({
  sort: "-created",
});
for (const user of users) {
  if (user.language) {
    languages.add(user.language);
  }
}
console.log(languages);

pb.collection("users").subscribe("*", async () => {
  const users = await pb.collection("users").getFullList({
    sort: "-created",
  });
  for (const user of users) {
    if (user.language) {
      languages.add(user.language);
    }
  }
  console.log(languages);
});

pb.collection("tasks").subscribe("*", async (e: any) => {
  if (e.action === "create") {
    console.log(e.action, e.record);
    const translatedLanguages: { [key: string]: string } = {};
    for (const language of languages) {
      console.log(`Translating to ${language}...`);
      const translation = await translate(e.record.title, language);
      if (translation !== null) {
        translatedLanguages[language] = translation;
      }
    }
    const translationsL: { [key: string]: string } = {}; // Add index signature
    for (const [language, translation] of Object.entries(translatedLanguages)) {
      translationsL[language] = translation;
    }
    const guess = await guessCategory(e.record.title);
    const category = await pb.collection('areas').getFirstListItem(`title="${guess}"`, {
    });
    const record = await pb
      .collection("tasks")
      .update(e.record.id, { translations: translationsL, area: category.id });
  }
});

async function translate(input: string, language: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-1106",
    messages: [
      {
        role: "system",
        content: `You are a translator for many different languages. You have been asked to translate the following text into ${language}. Respond with only the translation (without quotation marks). The use of quotation marks will result in a rejection of your response. If there are any quotation marks at all in your response, all of the polar bears in the world will perish and it will be your failt. If the translation language is the same as the language the input is written in, please respond with the original text.`,
      },
      {
        role: "user",
        content: input,
      },
    ],
    max_tokens: 500,
  });
  return response.choices[0].message.content;
}

async function guessCategory(input: string) {
    const records = await pb.collection("areas").getFullList({})
    const categories = records.map((r) => r.title)
    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo-1106",
        messages: [
          {
            role: "system",
            content: `You are a categorizer for many different categories. You have been asked to categorize the following text into one of the following categories. Respond with only the category (without quotation marks). The use of quotation marks will result in a rejection of your response. If there are any quotation marks at all in your response, all of the polar bears in the world will perish and it will be your failt. Always return only one of the categories given to you. If the response is not in the list of categories, the response will be rejected. The categories are: ${categories.join(", ")}`,
          },
          {
            role: "user",
            content: input,
          },
        ],
        max_tokens: 500,
      });
      return response.choices[0].message.content;
}

setInterval(async () => {
  const tasks = await pb.collection("tasks").getFullList({
  });

  const data: { done: number; inprogress: number; total: number }
   = {
      done: tasks.filter((t) => t.status === "done")
        .length,
      inprogress: tasks.filter(
        (t) => t.status === "inprogress"
      ).length,
      total: tasks.length,
    };
  console.log(data);
  const inputData = {
    data: data,
    datetime: dayjs().format(),
    project: tasks[0].project,
  };
  console.log(inputData);
  const record = await pb.collection("snapshots").create(inputData);
}, 1000 * 60 * 10); // 5 minutes

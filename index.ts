import OpenAI from 'openai';
import 'dotenv/config';
import PocketBase from 'pocketbase';
const eventsource = require('eventsource');
global.EventSource = eventsource;

export const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY
}); 

const pb = new PocketBase('https://la8.continuityhost.com');
await pb.admins.authWithPassword(
    process.env.PB_TYPEGEN_EMAIL as string,
    process.env.PB_TYPEGEN_PASSWORD as string,
  );
const users = await pb.collection('users').getFullList({
    sort: '-created',
});
const languages = new Set<string>();
for (const user of users) {
    if (user.languages && user.languages !== 'english') {
        for (const language of user.languages) {
            languages.add(language);
        }
    }
}



pb.collection('tasks').subscribe('*', async (e:any) => {
    if(e.action === 'create') {
        console.log(e.action,e.record)
        const translatedLanguages: {[key: string]: string} = {};
        for(const language of languages){
            const translation = await translate(e.record.title, language)
            if (translation !== null) {
                translatedLanguages[language]=translation;
            }
        }
        const translationsL: {[key: string]: string} = {}; // Add index signature
        for(const [language, translation] of Object.entries(translatedLanguages)){
            translationsL[language] = translation;
        }
        console.log(translationsL)
        const record = await pb.collection('tasks').update(e.record.id, {translations: translationsL})
    }
});

async function translate(input: string, language: string){
    const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo-1106',
        messages: [{
            role: 'system',
            content: `You are a translator for many different languages. You have been asked to translate the following text into ${language}. Respond with only the translation.`,
        },
        {
            role: 'user',
            content: input,
        } 
        ],
        max_tokens: 500,
    })
    return response.choices[0].message.content
}


